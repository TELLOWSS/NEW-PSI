import React, { useEffect, useRef, useState } from 'react';
import type { TenantActionEvent, TenantActionStatus, TenantSafetyAction } from '../types/tenantSafetyActions';
import { TenantWorkspaceRequestError } from '../utils/tenantWorkspaceRequest';

interface Props {
    key?: string;
    role: string;
    request: (options: { resource: 'actions'; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; query?: Record<string, string>; signal?: AbortSignal }) => Promise<any>;
    onAccessLost: (error: TenantWorkspaceRequestError) => void;
}
const statusNames: Record<TenantActionStatus, string> = { open: '미착수', 'in-progress': '진행 중', 'review-requested': '완료 검토 요청', closed: '완료 확인' };
const emptyForm = () => ({ title: '', siteName: '', description: '', dueDate: '', status: 'open' as TenantActionStatus, verificationNote: '' });

export default function TenantSafetyActionsPanel({ role, request, onAccessLost }: Props) {
    const [items, setItems] = useState<TenantSafetyAction[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [editing, setEditing] = useState<TenantSafetyAction | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [history, setHistory] = useState<{ title: string; events: TenantActionEvent[]; limited: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const generation = useRef(0);
    const inFlight = useRef(false);
    const requestId = useRef<string | null>(null);
    const abort = useRef<AbortController | null>(null);
    const canWrite = ['owner', 'admin', 'reviewer'].includes(role);
    const canApprove = ['owner', 'admin'].includes(role);

    useEffect(() => () => { generation.current += 1; abort.current?.abort(); }, []);

    const run = async (work: (signal: AbortSignal) => Promise<any>, apply: (result: any) => void) => {
        if (inFlight.current) return;
        inFlight.current = true;
        const ticket = ++generation.current;
        const controller = new AbortController(); abort.current = controller;
        setBusy(true); setError(''); setMessage('');
        try {
            const result = await work(controller.signal);
            if (generation.current === ticket) apply(result);
        } catch (cause) {
            if (generation.current !== ticket || controller.signal.aborted) return;
            if (cause instanceof TenantWorkspaceRequestError && cause.code === 'REQUEST_CANCELLED') return;
            if (cause instanceof TenantWorkspaceRequestError && [401, 403].includes(cause.status)) {
                setItems([]); setHistory(null); setForm(emptyForm()); setEditing(null);
                onAccessLost(cause);
            }
            setError(cause instanceof Error ? cause.message : '조치 기록을 확인할 수 없습니다.');
        } finally {
            if (generation.current === ticket) { inFlight.current = false; abort.current = null; setBusy(false); }
        }
    };

    const resetForm = () => { setEditing(null); setForm(emptyForm()); requestId.current = null; };
    const load = (more = false) => void run(signal => request({ resource: 'actions', signal,
        query: more && nextCursor ? { cursor: nextCursor } : undefined }), result => {
        setItems(previous => more ? [...previous, ...result.items.filter((item: TenantSafetyAction) => !previous.some(current => current.id === item.id))] : result.items);
        setNextCursor(result.nextCursor); setLoaded(true);
        if (!more) { resetForm(); setHistory(null); }
    });
    const edit = (item: TenantSafetyAction) => {
        setEditing(item); requestId.current = null; setHistory(null); setMessage(''); setError('');
        setForm({ title: item.title, siteName: item.siteName, description: item.description, dueDate: item.dueDate || '',
            status: item.status === 'closed' ? 'open' : item.status,
            verificationNote: item.status === 'closed' ? '' : item.verificationNote });
    };
    const changeField = (key: keyof typeof form, value: string) => {
        requestId.current = null;
        setForm(previous => ({ ...previous, [key]: value }));
    };
    const save = (event: React.FormEvent) => {
        event.preventDefault();
        if (!canWrite || inFlight.current) return;
        const body = { title: form.title, siteName: form.siteName, description: form.description, dueDate: form.dueDate || null };
        if (!editing) requestId.current ||= crypto.randomUUID();
        void run(signal => request({ resource: 'actions', signal, method: editing ? 'PATCH' : 'POST', body: editing
            ? { ...body, id: editing.id, expectedRevision: editing.revision, status: form.status, verificationNote: form.verificationNote }
            : { ...body, requestId: requestId.current } }), result => {
            setItems(previous => [result.item, ...previous.filter(item => item.id !== result.item.id)]);
            setMessage(editing ? '조치 기록을 저장했습니다.' : '조치 기록을 등록했습니다.');
            setHistory(null); resetForm();
        });
    };
    const allowedStatuses: TenantActionStatus[] = !editing ? ['open'] : editing.status === 'closed' ? ['open']
        : editing.status === 'review-requested' ? ['review-requested', 'in-progress', ...(canApprove ? ['closed' as const] : [])]
            : editing.status === 'in-progress' ? ['in-progress', 'open', 'review-requested'] : ['open', 'in-progress', 'review-requested'];
    const reasonRequired = editing?.status === 'closed' || form.status === 'closed';
    const fieldClass = 'mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal';

    return <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="tenant-actions-title">
        <h2 id="tenant-actions-title" className="text-xl font-bold">기업별 안전조치 관리</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">현재 선택한 기업의 새 조치 기록을 관리합니다. 기존 현장 자료는 자동으로 가져오지 않습니다. 완료 검토 요청 후 기업 책임자 또는 관리자가 현장 확인 내용을 남겨 완료합니다.</p>
        <button type="button" disabled={busy} onClick={() => load()} className="mt-4 min-h-12 rounded-lg border border-indigo-700 px-4 py-3 font-semibold text-indigo-700 disabled:opacity-50">{busy ? '처리 중…' : '목록 조회'}</button>
        {loaded && items.length === 0 && <p className="mt-4 text-sm text-slate-600">등록된 조치 기록이 없습니다.</p>}
        <ul className="mt-4 space-y-3">
            {items.map(item => <li key={item.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="break-words font-bold">{item.title}</h3><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{statusNames[item.status]}</span></div>
                <p className="mt-2 break-words text-sm text-slate-600">{item.siteName}{item.dueDate ? ` · 기한 ${item.dueDate}` : ''}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.description}</p>
                {item.verificationNote && <p className="mt-2 whitespace-pre-wrap break-words rounded bg-emerald-50 p-3 text-sm leading-6">확인·재개 사유: {item.verificationNote}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                    {canWrite && (item.status !== 'closed' || canApprove) && <button type="button" disabled={busy} onClick={() => edit(item)} className="min-h-12 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">{item.status === 'closed' ? '조치 재개' : '수정·상태 변경'}</button>}
                    <button type="button" disabled={busy} onClick={() => void run(signal => request({ resource: 'actions', query: { id: item.id }, signal }), result => setHistory({ title: result.item.title, events: result.events, limited: result.historyLimited }))} className="min-h-12 rounded-lg px-3 py-2 font-semibold text-indigo-700 underline disabled:opacity-50">변경 이력</button>
                </div>
            </li>)}
        </ul>
        {nextCursor && <button type="button" disabled={busy} onClick={() => load(true)} className="mt-3 min-h-12 rounded-lg border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50">이전 기록 더 보기</button>}
        {history && <section className="mt-5 rounded-lg bg-slate-50 p-4" aria-label="조치 변경 이력">
            <h3 className="font-bold">{history.title} · 변경 이력</h3>
            {history.limited && <p className="mt-2 text-xs">최근 변경 100건을 표시합니다.</p>}
            <ol className="mt-3 space-y-3 text-sm">{history.events.map(event => <li key={event.revision}>
                <p>{event.fromStatus ? `${statusNames[event.fromStatus]} → ` : '등록 · '}{statusNames[event.toStatus]} · {new Date(event.occurredAt).toLocaleString('ko-KR')}</p>
                {event.verificationNote && <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{event.verificationNote}</p>}
            </li>)}</ol>
        </section>}
        {canWrite ? <form onSubmit={save} className="mt-6 space-y-4 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{editing ? '조치 기록 변경' : '새 조치 등록'}</h3>{editing && <button type="button" disabled={busy} onClick={resetForm} className="min-h-12 rounded-lg px-3 py-2 text-sm underline">변경 취소</button>}</div>
            {editing?.status === 'closed' && <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6">완료된 기록은 바로 수정할 수 없습니다. 조치 재개 사유를 남기고 다시 진행해 주세요.</p>}
            <label className="block text-sm font-semibold">조치 제목<input required maxLength={200} value={form.title} disabled={busy} onChange={event => changeField('title', event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">현장명<input required maxLength={200} value={form.siteName} disabled={busy} onChange={event => changeField('siteName', event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">위험·조치 내용<textarea required maxLength={4000} rows={4} value={form.description} disabled={busy} onChange={event => changeField('description', event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">조치 기한<input type="date" min="2000-01-01" max="2100-12-31" value={form.dueDate} disabled={busy} onChange={event => changeField('dueDate', event.target.value)} className={fieldClass} /></label>
            {editing && <>
                <label className="block text-sm font-semibold">조치 상태<select value={form.status} disabled={busy} onChange={event => changeField('status', event.target.value)} className={fieldClass}>{allowedStatuses.map(status => <option key={status} value={status}>{statusNames[status]}</option>)}</select></label>
                <label className="block text-sm font-semibold">현장 확인·재개 사유{reasonRequired ? ' (5자 이상 필수)' : ''}<textarea required={Boolean(reasonRequired)} minLength={reasonRequired ? 5 : undefined} maxLength={2000} rows={3} value={form.verificationNote} disabled={busy} onChange={event => changeField('verificationNote', event.target.value)} className={fieldClass} /></label>
            </>}
            <button disabled={busy} className="min-h-12 w-full rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy ? '저장 중…' : editing ? '조치 변경 저장' : '조치 등록'}</button>
            <p className="text-xs leading-5 text-slate-500">원본 사진, 근로자 개인정보, 비밀번호는 입력하지 마세요. 저장 결과를 확인하지 못했다면 목록 조회로 기존 등록 여부를 먼저 확인해 주세요.</p>
        </form> : <p className="mt-5 text-sm text-slate-600">조회 권한으로 기록과 변경 이력을 확인할 수 있습니다.</p>}
        {message && <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
    </section>;
}
