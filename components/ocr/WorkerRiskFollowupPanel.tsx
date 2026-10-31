import React, { useMemo, useState } from 'react';
import type { WorkerRecord, WorkerRiskFollowupStatus } from '../../types';
import {
    appendWorkerRiskFollowupEvent,
    collectWorkerRiskFollowupCases,
    FOLLOWUP_STATUS_LABELS,
    getWorkerRiskFollowupSummary,
    MAX_FOLLOWUP_PHOTO_DATA_URL_LENGTH,
} from '../../utils/workerRiskFollowup';

interface WorkerRiskFollowupPanelProps {
    record: WorkerRecord;
    onPersist: (record: WorkerRecord) => Promise<boolean>;
    hasPendingEdits?: boolean;
}

const DATE_TODAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const uniqueId = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'risk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

const prepareEvidenceImage = async (file: File): Promise<string> => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG·PNG·WEBP 사진만 첨부할 수 있습니다.');
    if (file.size > 12_000_000) throw new Error('12MB 이하의 사진을 선택해 주세요.');
    const bitmap = await createImageBitmap(file);
    try {
        const ratio = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('이 브라우저에서 사진 변환을 사용할 수 없습니다.');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.7, 0.57, 0.44, 0.33]) {
            const encoded = canvas.toDataURL('image/jpeg', quality);
            if (encoded.length <= MAX_FOLLOWUP_PHOTO_DATA_URL_LENGTH) return encoded;
        }
        throw new Error('사진을 충분히 압축하지 못했습니다. 더 작은 사진으로 선택해 주세요.');
    } finally {
        bitmap.close();
    }
};

export const WorkerRiskFollowupPanel: React.FC<WorkerRiskFollowupPanelProps> = ({ record, onPersist, hasPendingEdits = false }) => {
    const cases = useMemo(() => collectWorkerRiskFollowupCases(record.riskFollowupEvents || []), [record.riskFollowupEvents]);
    const summary = useMemo(() => getWorkerRiskFollowupSummary(record.riskFollowupEvents || [], DATE_TODAY()), [record.riskFollowupEvents]);
    const [caseId, setCaseId] = useState('');
    const [question, setQuestion] = useState<1 | 2 | 3 | 4 | 5>(2);
    const [status, setStatus] = useState<WorkerRiskFollowupStatus>('open');
    const [actor, setActor] = useState('');
    const [owner, setOwner] = useState('');
    const [detail, setDetail] = useState('');
    const [interimControl, setInterimControl] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [evidenceNote, setEvidenceNote] = useState('');
    const [evidenceReference, setEvidenceReference] = useState('');
    const [verifiedBy, setVerifiedBy] = useState('');
    const [photo, setPhoto] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const selected = cases.find(item => item.caseId === caseId);
    const canWrite = !saving && !hasPendingEdits;

    const chooseCase = (nextCaseId: string) => {
        setCaseId(nextCaseId);
        const found = cases.find(item => item.caseId === nextCaseId);
        if (!found) {
            setStatus('open');
            setQuestion(2);
            setOwner('');
            setDueDate('');
            setInterimControl('');
        } else {
            setStatus(found.latest.status === 'completed' ? 'reopened' : 'scheduled');
            setQuestion(found.opened.questionNumber);
            setOwner(found.latest.owner);
            setDueDate(found.latest.dueDate || '');
            setInterimControl(found.latest.interimControl || '');
        }
        setDetail('');
        setEvidenceNote('');
        setEvidenceReference('');
        setVerifiedBy('');
        setPhoto('');
        setMessage('');
    };

    const save = async () => {
        if (hasPendingEdits) {
            setMessage('다른 수정사항을 먼저 저장한 다음 현장 환류를 등록해 주세요.');
            return;
        }
        if (saving) return;
        setSaving(true);
        setMessage('');
        try {
            const now = new Date().toISOString();
            const id = uniqueId();
            const nextEvents = appendWorkerRiskFollowupEvent(record.riskFollowupEvents || [], {
                id,
                caseId: caseId || id,
                questionNumber: question,
                status,
                timestamp: now,
                actor,
                owner,
                actionDetail: detail,
                dueDate,
                interimControl,
                evidenceReference,
                evidenceNote,
                evidencePhoto: photo,
                verifiedBy,
            });
            const nextRecord: WorkerRecord = {
                ...record,
                riskFollowupEvents: nextEvents,
                auditTrail: [
                    ...(record.auditTrail || []),
                    {
                        stage: 'action',
                        timestamp: now,
                        actor: actor.trim(),
                        note: 'Q' + question + ' 환류 상태: ' + FOLLOWUP_STATUS_LABELS[status] + ' · ' + detail.trim().slice(0, 120),
                    },
                ],
            };
            if (!(await onPersist(nextRecord))) {
                setMessage('저장에 실패했습니다. 입력 내용은 유지됩니다. 다시 확인해 주세요.');
                return;
            }
            setMessage('현장 환류 이력이 기록에 저장되었습니다. 기존 이력은 유지됩니다.');
            setDetail('');
            setEvidenceNote('');
            setEvidenceReference('');
            setVerifiedBy('');
            setPhoto('');
            setCaseId('');
            setStatus('open');
            setQuestion(2);
            setOwner('');
            setDueDate('');
            setInterimControl('');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '기록 저장 과정에서 문제가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section data-worker-risk-followup-panel="true" className="rounded-3xl border border-blue-200 bg-white px-4 py-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black tracking-widest uppercase text-indigo-600">PSI · FIELD CLOSED LOOP</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">근로자 위험인지 → 현장 조치 환류</h3>
                    <p className="mt-1 text-xs text-slate-600">자필 Q1~Q5와 연결해 담당자·기한·임시통제·사진 증빙을 기록합니다. 자동 완료되지 않습니다.</p>
                </div>
                <div className="flex gap-2 text-[11px] font-black">
                    <span className="rounded-lg bg-amber-100 px-2 py-1.5 text-amber-900">진행 {summary.unresolved}</span>
                    <span className="rounded-lg bg-rose-100 px-2 py-1.5 text-rose-800">기한 초과 {summary.overdue}</span>
                    <span className="rounded-lg bg-emerald-100 px-2 py-1.5 text-emerald-800">완료 확인 {summary.completed}</span>
                </div>
            </div>
            <div className="mt-4 space-y-2">
                {cases.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">아직 등록된 현장 조치가 없습니다. 근로자 답변만으로 조치 여부를 단정하지 않습니다.</p> :
                    cases.map(item => (
                        <button key={item.caseId} type="button" onClick={() => chooseCase(item.caseId)}
                            className={'w-full text-left rounded-xl border p-3 text-xs transition ' + (caseId === item.caseId ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50')}>
                            <span className="font-black text-slate-900">Q{item.opened.questionNumber} · {FOLLOWUP_STATUS_LABELS[item.latest.status]}</span>
                            <span className="ml-2 text-slate-600">담당 {item.latest.owner} · 기한 {item.latest.dueDate || '미지정'} · 이력 {item.events.length}회</span>
                            <p className="mt-1 text-slate-700 break-words">{item.latest.actionDetail}</p>
                        </button>
                    ))}
            </div>
            {hasPendingEdits && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">원문·번역 등 수정사항이 있습니다. 먼저 기존 수정 내용을 저장한 후 환류 이력을 추가해 주세요.</p>}
            <form onSubmit={event => { event.preventDefault(); void save(); }} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-slate-700">대상 조치
                        <select value={caseId} onChange={event => chooseCase(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm">
                            <option value="">새 조치 건 등록</option>
                            {cases.map(item => <option key={item.caseId} value={item.caseId}>Q{item.opened.questionNumber} · {FOLLOWUP_STATUS_LABELS[item.latest.status]} · {item.latest.owner}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">연결 문항
                        <select disabled={Boolean(selected)} value={question} onChange={event => setQuestion(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm">
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Q{n}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">기록자 성명
                        <input value={actor} onChange={e => setActor(e.target.value)} maxLength={80} placeholder="기록하는 관리자" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" required />
                    </label>
                    <label className="text-xs font-bold text-slate-700">조치 담당자
                        <input value={owner} onChange={e => setOwner(e.target.value)} maxLength={80} placeholder="조치 담당자 성명" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" required />
                    </label>
                    <label className="text-xs font-bold text-slate-700">현장 조치 상태
                        <select value={status} onChange={e => setStatus(e.target.value as WorkerRiskFollowupStatus)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm">
                            {(selected?.latest.status === 'completed' ? ['reopened'] : ['open', 'interim_control', 'scheduled', ...(selected ? ['completed'] : [])] as WorkerRiskFollowupStatus[]).map(value => <option key={value} value={value}>{FOLLOWUP_STATUS_LABELS[value as WorkerRiskFollowupStatus]}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">조치 예정·재확인 기한
                        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
                    </label>
                </div>
                <label className="block text-xs font-bold text-slate-700">현장 확인·실시 내용
                    <textarea value={detail} onChange={e => setDetail(e.target.value)} maxLength={1800} rows={2} required placeholder="예: 작업발판 개구부 출입통제, 안전대 체결상태 현장점검 시행" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
                </label>
                <label className="block text-xs font-bold text-slate-700">임시통제 내용 (임시통제 상태 필수)
                    <input value={interimControl} onChange={e => setInterimControl(e.target.value)} maxLength={600} placeholder="예: 접근 차단, 해당 구역 작업중지 유지, 대체 통로 지정" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-slate-700">증빙 위치·번호 (선택)
                        <input value={evidenceReference} onChange={e => setEvidenceReference(e.target.value)} maxLength={300} placeholder="예: 현장사진 관리대장 2026-..." className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">완료 확인자 (완료 시 필수)
                        <input value={verifiedBy} onChange={e => setVerifiedBy(e.target.value)} maxLength={80} placeholder="현장 확인 담당자 성명" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
                    </label>
                </div>
                <label className="block text-xs font-bold text-slate-700">증빙 설명
                    <input value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} maxLength={750} placeholder="증빙에서 무엇을 확인했는지 구체적으로 입력" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm" />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-bold text-slate-700">사진 첨부 (선택 · 자동 압축, 한 건당 1장)
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full max-w-sm text-xs"
                            onChange={async e => {
                                const input = e.currentTarget;
                                const file = input.files?.[0];
                                if (!file) return;
                                try { setPhoto(await prepareEvidenceImage(file)); setMessage('사진 압축 준비 완료 · 저장 버튼을 눌러야 기록에 반영됩니다.'); }
                                catch (error) { setPhoto(''); setMessage(error instanceof Error ? error.message : '이미지 처리 실패'); }
                                input.value = '';
                            }} />
                    </label>
                    {photo ? <div className="flex items-center gap-2"><img src={photo} alt="등록 전 확인할 증빙 사진 미리보기" className="h-14 w-14 rounded-lg object-cover border" /><button type="button" onClick={() => setPhoto('')} className="text-xs font-bold text-red-700">첨부 취소</button></div> : null}
                </div>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                    위험이 통제되지 않은 상태라면 현장 판단에 따라 접근통제·작업중지 등 필요한 보호조치를 먼저 검토하세요. 이 기록의 ‘완료’는 증빙 확인 이력이지 작업재개 허가가 아닙니다.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p role="status" aria-live="polite" className="text-xs text-slate-700 whitespace-pre-wrap">{message}</p>
                    <button type="submit" disabled={!canWrite} className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">{saving ? '저장 중...' : '현장 환류 이력 저장'}</button>
                </div>
            </form>
        </section>
    );
};
