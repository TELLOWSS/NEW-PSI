import React, { useMemo, useState } from 'react';
import type { WorkerRecord, WorkerPracticeStage, WorkerPracticeResult } from '../../types';
import {
    appendPracticeVerificationEvent, PRACTICE_ALLOWED_RESULTS,
    PRACTICE_RESULT_LABELS, PRACTICE_STAGE_LABELS,
} from '../../utils/practiceVerification';
import { collectWorkerRiskFollowupCases } from '../../utils/workerRiskFollowup';

interface Props {
    record: WorkerRecord;
    onPersist: (record: WorkerRecord) => Promise<boolean>;
    hasPendingEdits?: boolean;
}

const createId = (): string => typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'practice-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

export const WorkerPracticeVerificationPanel: React.FC<Props> = ({ record, onPersist, hasPendingEdits = false }) => {
    const events = record.practiceVerificationEvents || [];
    const cases = useMemo(() => collectWorkerRiskFollowupCases(record.riskFollowupEvents || []), [record.riskFollowupEvents]);
    const [questionNumber, setQuestionNumber] = useState<1 | 2 | 3 | 4 | 5>(5);
    const [stage, setStage] = useState<WorkerPracticeStage>('education');
    const [result, setResult] = useState<WorkerPracticeResult>('delivered');
    const [actor, setActor] = useState('');
    const [evidenceNote, setEvidenceNote] = useState('');
    const [sessionReference, setSessionReference] = useState('');
    const [relatedFollowupCaseId, setRelatedFollowupCaseId] = useState('');
    const [evidenceReference, setEvidenceReference] = useState('');
    const [nextCheckDueDate, setNextCheckDueDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const selectableCases = cases.filter(x => x.opened.questionNumber === questionNumber);

    const chooseStage = (next: WorkerPracticeStage) => {
        setStage(next);
        setResult(PRACTICE_ALLOWED_RESULTS[next][0]);
        setNotice('');
    };
    const save = async () => {
        if (saving) return;
        if (hasPendingEdits) {
            setNotice('원문·번역 등 미저장 수정사항을 먼저 저장해 주세요.');
            return;
        }
        setSaving(true);
        setNotice('');
        try {
            const timestamp = new Date().toISOString();
            const next = appendPracticeVerificationEvent(events, {
                id: createId(), timestamp, questionNumber, stage, result,
                actor, evidenceNote, sessionReference,
                relatedFollowupCaseId, evidenceReference, nextCheckDueDate,
            }, record.riskFollowupEvents || []);
            const nextRecord: WorkerRecord = {
                ...record,
                practiceVerificationEvents: next,
                auditTrail: [
                    ...(record.auditTrail || []),
                    {
                        stage: 'action',
                        timestamp,
                        actor: actor.trim(),
                        note: 'PSI Q' + questionNumber + ' ' + PRACTICE_STAGE_LABELS[stage]
                            + ' / ' + PRACTICE_RESULT_LABELS[result] + ' (별도 실천 검증)',
                    },
                ],
            };
            const saved = await onPersist(nextRecord);
            if (!saved) {
                setNotice('저장에 실패했습니다. 입력한 내용은 그대로 유지됩니다.');
                return;
            }
            setNotice('검증 이력을 저장했습니다. 교육 확인과 실제 현장 조치 완료는 별개로 관리됩니다.');
            setEvidenceNote('');
            setEvidenceReference('');
            setNextCheckDueDate('');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '검증 이력 저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section data-worker-practice-verification="true" className="rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black tracking-widest uppercase text-emerald-700">PSI · EDUCATION TO PRACTICE</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">교육 후 실천 확인·재점검</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        교육을 했다는 기록과 실제 안전행동을 확인한 기록을 구분합니다. SMART TBM과 별도의 PSI 기록입니다.
                    </p>
                </div>
                <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">누적 이력 {events.length}회</span>
            </header>
            {events.length > 0 && (
                <div className="mt-3 space-y-2">
                    {[...events].slice(-5).reverse().map(item => (
                        <article key={item.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                            <div className="flex flex-wrap justify-between gap-2">
                                <p className="font-black text-slate-800">Q{item.questionNumber} · {PRACTICE_STAGE_LABELS[item.stage]} / {PRACTICE_RESULT_LABELS[item.result]}</p>
                                <span className="text-slate-500">{item.timestamp.slice(0, 10)}</span>
                            </div>
                            <p className="mt-1 break-words text-slate-700">{item.evidenceNote}</p>
                            {item.nextCheckDueDate && <p className="mt-1 font-bold text-amber-800">재확인 예정일: {item.nextCheckDueDate}</p>}
                        </article>
                    ))}
                </div>
            )}
            <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">연결 문항
                        <select value={questionNumber} onChange={event => { setQuestionNumber(Number(event.target.value) as 1 | 2 | 3 | 4 | 5); setRelatedFollowupCaseId(''); }}
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
                            {[1,2,3,4,5].map(n=><option value={n} key={n}>Q{n}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">확인 단계
                        <select value={stage} onChange={event => chooseStage(event.target.value as WorkerPracticeStage)}
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
                            {Object.entries(PRACTICE_STAGE_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">확인 결과
                        <select value={result} onChange={event=>setResult(event.target.value as WorkerPracticeResult)}
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
                            {PRACTICE_ALLOWED_RESULTS[stage].map(key=><option key={key} value={key}>{PRACTICE_RESULT_LABELS[key]}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">확인 관리자
                        <input required value={actor} onChange={event => setActor(event.target.value)} maxLength={80}
                            placeholder="현장에서 확인한 관리자" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" />
                    </label>
                    {(stage === 'education' || stage === 'understanding') && (
                        <label className="text-xs font-bold text-slate-700">교육 회차·일지 근거 (필수)
                            <input value={sessionReference} onChange={event => setSessionReference(event.target.value)} maxLength={120}
                                placeholder="예: 2026-11-01 월간 교육일지 01" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" />
                        </label>
                    )}
                    <label className="text-xs font-bold text-slate-700">현장 조치 연결 (선택)
                        <select value={relatedFollowupCaseId} onChange={event => setRelatedFollowupCaseId(event.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
                            <option value="">별도 조치 연결 안 함</option>
                            {selectableCases.map(item => <option key={item.caseId} value={item.caseId}>Q{questionNumber} · {item.latest.status} · {item.latest.owner}</option>)}
                        </select>
                    </label>
                    {(result === 'observed_safe') && (
                        <label className="text-xs font-bold text-slate-700">현장 관찰 증빙 참조 (필수)
                            <input value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} maxLength={250}
                                placeholder="예: 사진대장/점검기록 번호" className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" />
                        </label>
                    )}
                    {(['correction_required','unable_to_verify','needs_explanation'].includes(result)) && (
                        <label className="text-xs font-bold text-slate-700">재확인 예정일 (필수)
                            <input type="date" value={nextCheckDueDate} onChange={event => setNextCheckDueDate(event.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" />
                        </label>
                    )}
                </div>
                <label className="block text-xs font-bold text-slate-700">실제 확인 방법·근거 (필수)
                    <textarea required value={evidenceNote} onChange={event => setEvidenceNote(event.target.value)} maxLength={1200}
                        rows={3} placeholder="예: TBM 후 해당 작업자가 작업 전 체결 위치를 직접 설명했는지 확인. 직접 관찰하지 않았다면 현장 실천 확인으로 입력하지 않습니다."
                        className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm" />
                </label>
                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    교육 전달·이해 확인은 보호구 착용 또는 안전조치 완료 증거가 아닙니다. 개선이 필요하거나 실제 확인이 안 된 경우 현장 조치 이력을 별도 등록하고, 위험 통제·작업중지 필요성을 현장에서 우선 검토하세요. 안전행동 관찰은 해당 시점의 기록이며 작업재개 승인과 무관합니다.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p role="status" aria-live="polite" className="whitespace-pre-wrap text-xs text-slate-700">{notice}</p>
                    <button type="submit" disabled={saving || hasPendingEdits}
                        className="min-h-11 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">
                        {saving ? '저장 중...' : '교육·실천 검증 이력 저장'}
                    </button>
                </div>
            </form>
        </section>
    );
};
