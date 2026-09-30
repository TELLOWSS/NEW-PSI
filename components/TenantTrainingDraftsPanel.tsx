import React, { useEffect, useRef, useState } from 'react';
import type { TenantTrainingDraftEvent, TenantTrainingDraft } from '../types/tenantTrainingDrafts';
import { TenantWorkspaceRequestError } from '../utils/tenantWorkspaceRequest';

interface Props {
    key?: string;
    role: string;
    request: (options: { resource: 'training-drafts'; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; query?: Record<string, string>; signal?: AbortSignal }) => Promise<any>;
    onAccessLost: (error: TenantWorkspaceRequestError) => void;
}
const emptyForm = () => ({ title: '', siteName: '', sourceTextKo: '' });

export default function TenantTrainingDraftsPanel({ role, request, onAccessLost }: Props) {
    const [items, setItems] = useState<TenantTrainingDraft[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [editing, setEditing] = useState<TenantTrainingDraft | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [history, setHistory] = useState<{ title: string; events: TenantTrainingDraftEvent[]; limited: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const generation = useRef(0);
    const inFlight = useRef(false);
    const requestId = useRef<string | null>(null);
    const abort = useRef<AbortController | null>(null);
    const canWrite = ['owner', 'admin', 'reviewer'].includes(role);

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
            setError(cause instanceof Error ? cause.message : '교육 초안을 확인할 수 없습니다.');
        } finally {
            if (generation.current === ticket) { inFlight.current = false; abort.current = null; setBusy(false); }
        }
    };

    const resetForm = () => { setEditing(null); setForm(emptyForm()); requestId.current = null; };
    const load = (more = false) => void run(signal => request({ resource: 'training-drafts', signal,
        query: more && nextCursor ? { cursor: nextCursor } : undefined }), result => {
        setItems(previous => more ? [...previous, ...result.items.filter((item: TenantTrainingDraft) => !previous.some(current => current.id === item.id))] : result.items);
        setNextCursor(result.nextCursor); setLoaded(true);
        if (!more) { resetForm(); setHistory(null); }
    });
    const edit = (item: TenantTrainingDraft) => {
        setEditing(item); requestId.current = null; setHistory(null); setMessage(''); setError('');
        setForm({ title: item.title, siteName: item.siteName, sourceTextKo: item.sourceTextKo });
    };
    const changeField = (key: keyof typeof form, value: string) => {
        requestId.current = null;
        setForm(previous => ({ ...previous, [key]: value }));
    };
    const save = (event: React.FormEvent) => {
        event.preventDefault();
        if (!canWrite || inFlight.current) return;
        const body = { title: form.title, siteName: form.siteName, sourceTextKo: form.sourceTextKo };
        if (!editing) requestId.current ||= crypto.randomUUID();
        void run(signal => request({ resource: 'training-drafts', signal, method: editing ? 'PATCH' : 'POST', body: editing
            ? { ...body, id: editing.id, expectedRevision: editing.revision }
            : { ...body, requestId: requestId.current } }), result => {
            setItems(previous => [result.item, ...previous.filter(item => item.id !== result.item.id)]);
            setMessage(editing ? '교육 초안을 저장했습니다.' : '교육 초안을 등록했습니다.');
            setHistory(null); resetForm();
        });
    };
    const fieldClass = 'mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal';

    return <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="tenant-training-drafts-title">
        <h2 id="tenant-training-drafts-title" className="text-xl font-bold">기업별 교육 초안</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">선택한 기업의 교육 제목과 한국어 원문을 작성합니다. 초안은 근로자에게 배포되지 않으며 교육 이수나 서명 자료로 사용되지 않습니다.</p>
        <button type="button" disabled={busy} onClick={() => load()} className="mt-4 min-h-12 rounded-lg border border-indigo-700 px-4 py-3 font-semibold text-indigo-700 disabled:opacity-50">{busy ? '처리 중…' : '목록 조회'}</button>
        {loaded && items.length === 0 && <p className="mt-4 text-sm text-slate-600">등록된 교육 초안이 없습니다.</p>}
        <ul className="mt-4 space-y-3">
            {items.map(item => <li key={item.id} className="rounded-lg border border-slate-200 p-4">
                <h3 className="break-words font-bold">{item.title}</h3>
                <p className="mt-2 break-words text-sm text-slate-600">{item.siteName} · 수정 {item.revision}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.sourceTextKo}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {canWrite && <button type="button" disabled={busy} onClick={() => edit(item)} className="min-h-12 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">초안 수정</button>}
                    <button type="button" disabled={busy} onClick={() => void run(signal => request({ resource: 'training-drafts', query: { id: item.id }, signal }), result => setHistory({ title: result.item.title, events: result.events, limited: result.historyLimited }))} className="min-h-12 rounded-lg px-3 py-2 font-semibold text-indigo-700 underline disabled:opacity-50">변경 이력</button>
                </div>
            </li>)}
        </ul>
        {nextCursor && <button type="button" disabled={busy} onClick={() => load(true)} className="mt-3 min-h-12 rounded-lg border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50">이전 기록 더 보기</button>}
        {history && <section className="mt-5 rounded-lg bg-slate-50 p-4" aria-label="교육 초안 변경 이력">
            <h3 className="font-bold">{history.title} · 변경 이력</h3>
            {history.limited && <p className="mt-2 text-xs">최근 변경 100건을 표시합니다.</p>}
            <ol className="mt-3 space-y-3 text-sm">{history.events.map(event => <li key={event.revision}>
                <p>수정 {event.revision} · {new Date(event.occurredAt).toLocaleString('ko-KR')}</p>
                <p className="mt-1 break-words font-semibold">{event.title} · {event.siteName}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{event.sourceTextKo}</p>
            </li>)}</ol>
        </section>}
        {canWrite ? <form onSubmit={save} className="mt-6 space-y-4 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{editing ? '교육 초안 변경' : '새 교육 초안 등록'}</h3>{editing && <button type="button" disabled={busy} onClick={resetForm} className="min-h-12 rounded-lg px-3 py-2 text-sm underline">변경 취소</button>}</div>
            <label className="block text-sm font-semibold">교육 제목<input required maxLength={200} value={form.title} disabled={busy} onChange={event => changeField('title', event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">현장명<input required maxLength={200} value={form.siteName} disabled={busy} onChange={event => changeField('siteName', event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">교육 원문 (한국어)<textarea required maxLength={10000} rows={6} value={form.sourceTextKo} disabled={busy} onChange={event => changeField('sourceTextKo', event.target.value)} className={fieldClass} /></label>
            <button disabled={busy} className="min-h-12 w-full rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy ? '저장 중…' : editing ? '초안 변경 저장' : '초안 등록'}</button>
            <p className="text-xs leading-5 text-slate-500">원본 사진, 근로자 개인정보, 비밀번호는 입력하지 마세요. 저장 결과를 확인하지 못했다면 목록 조회로 기존 등록 여부를 먼저 확인해 주세요.</p>
        </form> : <p className="mt-5 text-sm text-slate-600">조회 권한으로 기록과 변경 이력을 확인할 수 있습니다.</p>}
        {message && <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
    </section>;
}
