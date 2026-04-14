
import React, { useMemo, useRef, useState } from 'react';
import type { WorkerRecord, SafetyCheckRecord } from '../types';
import { compressImage } from '../utils/imageCompression';
import { postAdminJson } from '../utils/adminApiClient';
import { extractMessage } from '../utils/errorUtils';
import { BRAND_STATUS_LABELS } from '../utils/brandLabels';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { NoticeCallout } from '../components/shared/NoticeCallout';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { BRAND_TONE } from '../utils/brandToneTokens';

interface SafetyChecksProps {
    workerRecords: WorkerRecord[];
    checkRecords: SafetyCheckRecord[];
    onAddCheck: (newRecord: Omit<SafetyCheckRecord, 'id'>) => void;
}

const isManagementRole = (field: string) => /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const getWorkerIdentityKey = (record: WorkerRecord): string => {
    return String(
        record.worker_uuid
        || record.workerUuid
        || record.employeeId
        || record.qrId
        || `${record.name || 'unknown'}::${record.teamLeader || '미지정'}::${record.jobField || '미분류'}`,
    ).trim();
};

const inferHarnessWorkflowState = (record: Partial<WorkerRecord>): string => {
    if (record.workflowState) return record.workflowState;
    if (record.secondPassStatus === 'IN_PROGRESS') return 'second_pass_analyzing';
    if (record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING') return 'awaiting_manager_approval';
    if (record.ocrErrorType || record.secondPassStatus === 'NEEDED') return 'manual_review_required';
    if (record.secondPassStatus === 'DONE' || record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'completed';
    return 'uploaded';
};

const inferHarnessRiskDecision = (record: Partial<WorkerRecord>): string => {
    if (record.riskDecision) return record.riskDecision;
    if (record.ocrErrorType) return 'IMMEDIATE_ATTENTION';
    if (record.secondPassStatus === 'NEEDED') return 'SUPPLEMENTARY_REVIEW';
    return 'SAFE_TO_PROCEED';
};

const inferHarnessApprovalState = (record: Partial<WorkerRecord>, workflowState: string): string => {
    if (record.approvalState) return record.approvalState;
    if (record.reviewStatus === 'REJECTED') return 'REJECTED';
    if (record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'APPROVED';
    if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') return 'PENDING';
    return 'NOT_REQUIRED';
};

const getHarnessPersistenceState = (record: Partial<WorkerRecord>): 'connected' | 'fallback' | 'pending' => {
    if (String(record.harnessPersistenceWarning || '').trim()) return 'fallback';
    if (String(record.workflowRunId || '').trim()) return 'connected';
    return 'pending';
};

const summarizeHarnessRecords = (records: WorkerRecord[]) => {
    const latestRecords = Array.from(
        records.reduce((map, record) => {
            const key = getWorkerIdentityKey(record);
            const current = map.get(key);
            if (!current || new Date(record.date).getTime() >= new Date(current.date).getTime()) {
                map.set(key, record);
            }
            return map;
        }, new Map<string, WorkerRecord>()).values(),
    );

    return latestRecords.reduce((summary, record) => {
        const workflowState = inferHarnessWorkflowState(record);
        const riskDecision = inferHarnessRiskDecision(record);
        const approvalState = inferHarnessApprovalState(record, workflowState);
        const persistenceState = getHarnessPersistenceState(record);

        summary.total += 1;
        if (String(record.workflowRunId || '').trim()) summary.runLinked += 1;
        if (persistenceState === 'connected') summary.connected += 1;
        if (persistenceState === 'fallback') summary.fallback += 1;
        if (persistenceState === 'pending') summary.pending += 1;
        if (approvalState === 'PENDING' || approvalState === 'REQUIRED') summary.approvalBacklog += 1;
        if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') summary.reviewNeeded += 1;
        if (riskDecision === 'IMMEDIATE_ATTENTION' || riskDecision === 'CRITICAL_STOP') summary.immediateAttention += 1;
        return summary;
    }, {
        total: 0,
        runLinked: 0,
        connected: 0,
        fallback: 0,
        pending: 0,
        approvalBacklog: 0,
        reviewNeeded: 0,
        immediateAttention: 0,
    });
};

const SafetyChecks: React.FC<SafetyChecksProps> = ({ workerRecords, checkRecords, onAddCheck }) => {
    const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
    // [SIMULATION] Default date set to 2026-01-01
    const [date, setDate] = useState<string>('2026-01-01');
    const [type, setType] = useState<'unsafe_action' | 'unsafe_condition'>('unsafe_action');
    const [riskType, setRiskType] = useState<string>('');
    const [details, setDetails] = useState<string>('');
    const [attachedImage, setAttachedImage] = useState<string>('');
    const [isCompressingImage, setIsCompressingImage] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<{ ok: boolean; message: string } | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const harnessSourceRecords = useMemo(() => workerRecords.filter((record) => !isManagementRole(record.jobField)), [workerRecords]);
    const harnessSummary = useMemo(() => summarizeHarnessRecords(harnessSourceRecords), [harnessSourceRecords]);
    
    const workerOptions = useMemo(() => {
        const sorted = [...workerRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const seen = new Set<string>();
        const options: Array<{ id: string; name: string; label: string }> = [];

        for (const record of sorted) {
            if (seen.has(record.id)) continue;
            seen.add(record.id);

            const team = String(record.teamLeader || '').trim();
            const field = String(record.jobField || '').trim();
            const nationality = String(record.nationality || '').trim();
            const employeeId = String(record.employeeId || '').trim();
            const qrId = String(record.qrId || '').trim();
            const identityTag = employeeId
                ? `사번:${employeeId}`
                : (qrId ? `QR:${qrId.slice(-6)}` : '식별자없음');
            const profileTag = field || team
                ? `${field || '미분류'}${team ? `/${team}` : ''}`
                : (nationality || '미상');

            options.push({
                id: record.id,
                name: record.name,
                label: `${record.name} (${profileTag} · ${identityTag})`,
            });
        }

        return options;
    }, [workerRecords]);

    const selectedWorker = useMemo(
        () => workerOptions.find((option) => option.id === selectedWorkerId) || null,
        [workerOptions, selectedWorkerId]
    );

    const recentCheckSummary = useMemo(() => {
        const unsafeActionCount = checkRecords.filter((record) => record.type === 'unsafe_action').length;
        const unsafeConditionCount = checkRecords.filter((record) => record.type === 'unsafe_condition').length;
        const withImageCount = checkRecords.filter((record) => Boolean(record.image)).length;
        const latestRecord = checkRecords[0] || null;

        return {
            unsafeActionCount,
            unsafeConditionCount,
            withImageCount,
            latestRecord,
        };
    }, [checkRecords]);

    const formInterpretationCards = useMemo<InterpretationCardItem[]>(() => {
        return [
            {
                eyebrow: '지금 상태',
                title: selectedWorker
                    ? `${selectedWorker.name}에 대한 점검 기록을 바로 남길 수 있습니다.`
                    : '아직 점검 대상을 고르지 않아 기록 연결이 시작되지 않았습니다.',
                description: selectedWorker
                    ? '점검 기록은 근로자 기준으로 연결되어 이후 보완 조치와 현장 추적 근거로 이어집니다.'
                    : '근로자를 먼저 선택하면 누구의 어떤 위험 신호인지 흐름이 분명해집니다.',
            },
            {
                eyebrow: '판단 근거',
                title: `${type === 'unsafe_action' ? '불안전한 행동' : '불안전한 상태'} 기준으로 ${riskType ? '위험 요인이 입력됨' : '위험 요인 입력이 필요함'} 상태입니다.`,
                description: attachedImage
                    ? '현장 사진이 함께 첨부되어 관리자 판단과 후속 조치 설명 근거가 더 분명해집니다.'
                    : '사진이 없어도 등록은 가능하지만, 현장 근거를 남기면 이후 확인 속도가 더 빨라집니다.',
            },
            {
                eyebrow: '다음 행동',
                title: !selectedWorkerId
                    ? '근로자를 먼저 선택하세요.'
                    : !riskType.trim()
                        ? '위험 요인을 짧게라도 먼저 적어 주세요.'
                        : '이제 기록을 등록하고 필요하면 사진 근거를 함께 남기세요.',
                description: '점검 기록은 지적보다 보완을 위한 근거여야 하므로, 무엇을 확인했고 무엇을 보완해야 하는지 드러나게 적는 것이 좋습니다.',
            },
        ];
    }, [attachedImage, riskType, selectedWorker, selectedWorkerId, type]);

    const recordInterpretationCards = useMemo<InterpretationCardItem[]>(() => {
        return [
            {
                eyebrow: '지금 상태',
                title: `전체 점검 기록 ${checkRecords.length}건이 누적되어 있습니다.`,
                description: checkRecords.length > 0
                    ? '이미 남겨진 기록을 보면 현장에서 반복되는 신호가 행동 중심인지 상태 중심인지 빠르게 읽을 수 있습니다.'
                    : '아직 점검 기록이 없어 현장 신호를 추적할 기준 데이터가 부족한 상태입니다.',
            },
            {
                eyebrow: '판단 근거',
                title: `행동 ${recentCheckSummary.unsafeActionCount}건 · 상태 ${recentCheckSummary.unsafeConditionCount}건 · 사진 근거 ${recentCheckSummary.withImageCount}건`,
                description: recentCheckSummary.latestRecord
                    ? `가장 최근 기록은 ${recentCheckSummary.latestRecord.workerName} / ${recentCheckSummary.latestRecord.reason}로 남아 있습니다.`
                    : '아직 최근 기록이 없어 어떤 유형의 위험이 반복되는지 판단 근거가 충분하지 않습니다.',
            },
            {
                eyebrow: '다음 행동',
                title: checkRecords.length > 0
                    ? '반복되는 위험 요인을 먼저 보고 동일 유형이 누적되는지 확인하세요.'
                    : '첫 점검 기록부터 사진과 상세 설명을 함께 남겨 기준 품질을 맞추세요.',
                description: '행동과 상태 기록을 함께 쌓아야 현장 보완이 사람 문제인지 환경 문제인지 더 정확히 나눌 수 있습니다.',
            },
        ];
    }, [checkRecords.length, recentCheckSummary]);

    const harnessSummaryMetrics = useMemo(() => ([
        {
            key: 'safety-checks-harness-connected',
            label: '저장 연결',
            value: `${harnessSummary.connected}명`,
            helper: `run 연결 ${harnessSummary.runLinked}명 / 전체 ${harnessSummary.total}명`,
            tone: BRAND_TONE.emeraldSoft80,
            labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700',
            helperClassName: 'mt-1 text-xs font-bold text-emerald-700',
        },
        {
            key: 'safety-checks-harness-backlog',
            label: '승인 백로그',
            value: `${harnessSummary.approvalBacklog}명`,
            helper: `재검토 필요 ${harnessSummary.reviewNeeded}명`,
            tone: harnessSummary.approvalBacklog > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.slate,
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700' : 'text-slate-500'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700' : 'text-slate-600'}`,
        },
        {
            key: 'safety-checks-harness-attention',
            label: '즉시 보호',
            value: `${harnessSummary.immediateAttention}명`,
            helper: '새 점검 등록 전 우선 조치 대상 확인',
            tone: harnessSummary.immediateAttention > 0 ? BRAND_TONE.roseSoft80 : BRAND_TONE.indigoSoft70,
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
        },
        {
            key: 'safety-checks-harness-fallback',
            label: '폴백·저장 대기',
            value: `${harnessSummary.fallback + harnessSummary.pending}명`,
            helper: `폴백 ${harnessSummary.fallback}명 · 대기 ${harnessSummary.pending}명`,
            tone: harnessSummary.fallback > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.slate,
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.fallback > 0 ? 'text-amber-700' : 'text-slate-500'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.fallback > 0 ? 'text-amber-700' : 'text-slate-600'}`,
        },
    ]), [harnessSummary]);

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsCompressingImage(true);
            const compressedBase64 = await compressImage(file);
            setAttachedImage(compressedBase64);
        } catch (error) {
            console.error('Safety check image compression failed:', error);
            alert('사진 처리 중 추가 확인 안내가 필요합니다. 다시 확인해 주세요.');
        } finally {
            setIsCompressingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!selectedWorkerId || !riskType) {
            alert('근로자와 점검 유형을 입력해주세요.');
            return;
        }
        if (!selectedWorker) {
            alert('선택한 근로자의 식별 ID를 찾지 못했습니다. 근로자 관리에서 데이터 상태를 확인해주세요.');
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus(null);
        try {
            const nowIso = new Date().toISOString();
            await postAdminJson('/api/admin/safety-management', {
                action: 'record-safety-closure-loop',
                payload: {
                    records: [
                        {
                            worker_id: selectedWorkerId,
                            assessment_month: String(date || '').slice(0, 7),
                            observed_at: nowIso,
                            observer_name: 'SafetyChecks',
                            unsafe_behavior_flag: true,
                            unsafe_behavior_type: riskType,
                            severity_level: type === 'unsafe_action' ? '보통' : '낮음',
                            evidence_note: details || undefined,
                            action_type: null,
                        },
                    ],
                },
            }, { fallbackMessage: `점검 통합 등록 ${BRAND_STATUS_LABELS.attention}` });

            onAddCheck({ workerName: selectedWorker.name, date, type, reason: riskType, details, image: attachedImage || undefined });
            setSubmitStatus({ ok: true, message: '통합 액션으로 점검 기록이 등록되었습니다.' });

            // Reset form
            setSelectedWorkerId('');
            setRiskType('');
            setDetails('');
            setAttachedImage('');
            if (imageInputRef.current) {
                imageInputRef.current.value = '';
            }
        } catch (error) {
            const message = extractMessage(error);
            setSubmitStatus({ ok: false, message: message || `점검 등록 ${BRAND_STATUS_LABELS.attention}` });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <SummaryMetricGrid
                items={harnessSummaryMetrics}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
            />

            {(harnessSummary.immediateAttention > 0 || harnessSummary.approvalBacklog > 0 || harnessSummary.fallback > 0) && (
                <NoticeCallout
                    variant={harnessSummary.immediateAttention > 0 ? 'rose' : harnessSummary.fallback > 0 ? 'amber' : 'indigo'}
                    eyebrow="Harness priority"
                    title={harnessSummary.immediateAttention > 0
                        ? `새 점검을 추가하기 전에 즉시 보호 대상 ${harnessSummary.immediateAttention}명을 먼저 확인해야 합니다.`
                        : harnessSummary.fallback > 0
                            ? `하네스 persistence 폴백 ${harnessSummary.fallback}명이 있어 점검 기록과 저장 연결 상태를 함께 살펴봐야 합니다.`
                            : `승인 백로그 ${harnessSummary.approvalBacklog}명이 남아 있어 점검 등록 전에 관리자 검토 우선순위를 먼저 정리해야 합니다.`}
                    description="점검 기록은 새 신호를 남기는 화면이지만, 기존 보호 흐름이 끊긴 인원이 있으면 신규 기록보다 승인·보완·저장 연결 상태를 먼저 닫아야 현장 조치가 누락되지 않습니다."
                    className="rounded-2xl border px-4 py-3 shadow-sm"
                    bodyClassName="block"
                    titleClassName="text-sm font-black"
                    descriptionClassName="mt-1 text-xs font-semibold leading-relaxed"
                />
            )}

            <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    새 점검 기록 추가
                </h3>
                <InterpretationCardGrid
                    items={formInterpretationCards}
                    className="mb-4 grid-cols-1 xl:grid-cols-3"
                    cardClassName={BRAND_TONE.slate}
                    eyebrowClassName="text-slate-500"
                    titleClassName="text-slate-900"
                    descriptionClassName="text-slate-600"
                />
                <form onSubmit={handleSubmit} className="space-y-4 mt-4 p-4 border border-slate-200 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="workerId" className="block text-sm font-medium text-slate-700">근로자</label>
                            <select id="workerId" value={selectedWorkerId} onChange={e => setSelectedWorkerId(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="">근로자 선택</option>
                                {workerOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="date" className="block text-sm font-medium text-slate-700">점검일</label>
                            <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">점검 유형</label>
                        <div className="flex space-x-2">
                             <button type="button" onClick={() => setType('unsafe_action')} className={`px-4 py-2 rounded-md text-sm font-medium ${type === 'unsafe_action' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700'}`}>불안전한 행동</button>
                             <button type="button" onClick={() => setType('unsafe_condition')} className={`px-4 py-2 rounded-md text-sm font-medium ${type === 'unsafe_condition' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700'}`}>불안전한 상태</button>
                        </div>
                    </div>
                     <div>
                        <label htmlFor="riskType" className="block text-sm font-medium text-slate-700">위험 요인</label>
                        <input type="text" id="riskType" value={riskType} onChange={e => setRiskType(e.target.value)} placeholder="예: 고소작업" className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label htmlFor="details" className="block text-sm font-medium text-slate-700">상세 내용</label>
                        <textarea id="details" value={details} onChange={e => setDetails(e.target.value)} placeholder={`예: 안전고리 착용 ${BRAND_STATUS_LABELS.supplementaryReview}`} rows={3} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">사진 첨부</label>
                        <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => imageInputRef.current?.click()}
                                className={`px-3 py-2 border text-slate-700 text-sm font-medium rounded-md hover:bg-slate-200 ${BRAND_TONE.slateMuted}`}
                            >
                                📷 사진 첨부(카메라/갤러리)
                            </button>
                            {isCompressingImage && <span className="text-xs text-slate-500">이미지 최적화 중...</span>}
                        </div>
                        {attachedImage && (
                            <div className="mt-3 flex items-center gap-3">
                                <img src={`data:image/jpeg;base64,${attachedImage}`} alt="점검 첨부" className="w-20 h-20 object-cover rounded-md border border-slate-200" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAttachedImage('');
                                        if (imageInputRef.current) imageInputRef.current.value = '';
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                                >
                                    첨부 삭제
                                </button>
                            </div>
                        )}
                    </div>
                    <div>
                        <button type="submit" disabled={isSubmitting} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            {isSubmitting ? '등록 중...' : '기록 추가'}
                        </button>
                    </div>
                    {submitStatus && (
                        <div className={`rounded-md px-3 py-2 text-xs font-semibold ${submitStatus.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {submitStatus.ok ? '✅ ' : '⚠️ '}{submitStatus.message}
                        </div>
                    )}
                </form>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold mb-4">전체 점검 기록</h3>
                <InterpretationCardGrid
                    items={recordInterpretationCards}
                    className="mb-4 grid-cols-1 xl:grid-cols-3"
                    cardClassName={BRAND_TONE.indigoSoft50}
                    eyebrowClassName="text-indigo-700"
                    titleClassName="text-slate-900"
                    descriptionClassName="text-slate-600"
                />
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                         <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3">점검일</th>
                                <th scope="col" className="px-6 py-3">근로자</th>
                                <th scope="col" className="px-6 py-3">점검 유형</th>
                                <th scope="col" className="px-6 py-3">위험 요인</th>
                                <th scope="col" className="px-6 py-3">상세 내용</th>
                                <th scope="col" className="px-6 py-3">사진</th>
                            </tr>
                        </thead>
                        <tbody>
                           {checkRecords.map(record => (
                               <tr key={record.id} className="bg-white border-b hover:bg-slate-50">
                                   <td className="px-6 py-4">{record.date}</td>
                                   <td className="px-6 py-4 font-medium text-slate-900">{record.workerName}</td>
                                   <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${record.type === 'unsafe_action' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                                            {record.type === 'unsafe_action' ? '불안전한 행동' : '불안전한 상태'}
                                        </span>
                                   </td>
                                   <td className="px-6 py-4">{record.reason}</td>
                                   <td className="px-6 py-4">{record.details}</td>
                                   <td className="px-6 py-4">
                                        {record.image ? (
                                            <img src={`data:image/jpeg;base64,${record.image}`} alt="점검" className="w-14 h-14 object-cover rounded-md border border-slate-200" />
                                        ) : (
                                            <span className="text-xs text-slate-400">없음</span>
                                        )}
                                   </td>
                               </tr>
                           ))}
                             {checkRecords.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-12 text-slate-500">
                                        <p className="font-semibold">점검 기록이 없습니다.</p>
                                        <p className="text-sm mt-1">새 점검 기록을 추가해주세요.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SafetyChecks;
