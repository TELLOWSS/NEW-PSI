import React, { useEffect, useRef, useState } from 'react';
import type { TenantWorkerEvent, TenantWorker } from '../types/tenantWorkers';
import { TenantWorkspaceRequestError } from '../utils/tenantWorkspaceRequest';

interface Props {
    key?: string;
    role: string;
    request: (options: { resource: 'workers'; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; query?: Record<string, string>; signal?: AbortSignal }) => Promise<any>;
    onAccessLost: (error: TenantWorkspaceRequestError) => void;
}
const emptyForm = () => ({ name: '', workerCode: '', trade: '', active: true });

export default function TenantWorkersPanel({ role, request, onAccessLost }: Props) {
    const [items, setItems] = useState<TenantWorker[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [editing, setEditing] = useState<TenantWorker | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [history, setHistory] = useState<{ name: string; events: TenantWorkerEvent[]; limited: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const generation = useRef(0);
    const inFlight = useRef(false);
    const requestId = useRef<string | null>(null);
    const abort = useRef<AbortController | null>(null);
    const canWrite = ['owner', 'admin'].includes(role);

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
            setError(cause instanceof Error ? cause.message : '근로자 명단을 확인할 수 없습니다.');
        } finally {
            if (generation.current === ticket) { inFlight.current = false; abort.current = null; setBusy(false); }
        }
    };

    const resetForm = () => { setEditing(null); setForm(emptyForm()); requestId.current = null; };
    const load = (more = false) => void run(signal => request({ resource: 'workers', signal,
        query: more && nextCursor ? { cursor: nextCursor } : undefined }), result => {
        setItems(previous => more ? [...previous, ...result.items.filter((item: TenantWorker) => !previous.some(current => current.id === item.id))] : result.items);
        setNextCursor(result.nextCursor); setLoaded(true);
        if (!more) { resetForm(); setHistory(null); }
    });
    const edit = (item: TenantWorker) => {
        setEditing(item); requestId.current = null; setHistory(null); setMessage(''); setError('');
        setForm({ name: item.name, workerCode: item.workerCode, trade: item.trade, active: item.active });
    };
    const changeField = (key: keyof typeof form, value: string) => {
        requestId.current = null;
        setForm(previous => ({ ...previous, [key]: value }));
    };
    const save = (event: React.FormEvent) => {
        event.preventDefault();
        if (!canWrite || inFlight.current) return;
        const body = { name: form.name, trade: form.trade };
        if (!editing) requestId.current ||= crypto.randomUUID();
        void run(signal => request({ resource: 'workers', signal, method: editing ? 'PATCH' : 'POST', body: editing
            ? { ...body, id: editing.id, expectedRevision: editing.revision, active: form.active }
            : { ...body, workerCode: form.workerCode, requestId: requestId.current } }), result => {
            setItems(previous => [result.item, ...previous.filter(item => item.id !== result.item.id)]);
            setMessage(editing ? '근로자 명단을 저장했습니다.' : '근로자 명단을 등록했습니다.');
            setHistory(null); resetForm();
        });
    };
    const fieldClass = 'mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal';

    return <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="tenant-workers-name">
        <h2 id="tenant-workers-name" className="text-xl font-bold">기업별 근로자 명단</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">선택한 기업의 새 근로자 명단을 관리합니다. 관리번호는 기업 내에서 중복되지 않도록 부여하며 등록 후 변경할 수 없습니다. 기존 현장 명단은 자동으로 가져오지 않습니다.</p>
        <button type="button" disabled={busy} onClick={() => load()} className="mt-4 min-h-12 rounded-lg border border-indigo-700 px-4 py-3 font-semibold text-indigo-700 disabled:opacity-50">{busy ? '처리 중…' : '목록 조회'}</button>
        {loaded && items.length === 0 && <p className="mt-4 text-sm text-slate-600">등록된 근로자 명단이 없습니다.</p>}
        <ul className="mt-4 space-y-3">
            {items.map(item => <li key={item.id} className="rounded-lg border border-slate-200 p-4">
                <h3 className="break-words font-bold">{item.name}</h3>
                <p className="mt-2 break-words text-sm text-slate-600">{item.workerCode} · {item.active ? '이용 중' : '이용 중지'} · 수정 {item.revision}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.trade}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {canWrite && <button type="button" disabled={busy} onClick={() => edit(item)} className="min-h-12 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">근로자 정보 수정</button>}
                    <button type="button" disabled={busy} onClick={() => void run(signal => request({ resource: 'workers', query: { id: item.id }, signal }), result => setHistory({ name: result.item.name, events: result.events, limited: result.historyLimited }))} className="min-h-12 rounded-lg px-3 py-2 font-semibold text-indigo-700 underline disabled:opacity-50">변경 이력</button>
                </div>
            </li>)}
        </ul>
        {nextCursor && <button type="button" disabled={busy} onClick={() => load(true)} className="mt-3 min-h-12 rounded-lg border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50">이전 기록 더 보기</button>}
        {history && <section className="mt-5 rounded-lg bg-slate-50 p-4" aria-label="근로자 명단 변경 이력">
            <h3 className="font-bold">{history.name} · 변경 이력</h3>
            {history.limited && <p className="mt-2 text-xs">최근 변경 100건을 표시합니다.</p>}
            <ol className="mt-3 space-y-3 text-sm">{history.events.map(event => <li key={event.revision}>
                <p>{event.active ? '이용 중' : '이용 중지'} · 수정 {event.revision} · {new Date(event.occurredAt).toLocaleString('ko-KR')}</p>
                <p className="mt-1 break-words font-semibold">{event.name} · {event.workerCode}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{event.trade}</p>
            </li>)}</ol>
        </section>}
        {canWrite ? <form onSubmit={save} className="mt-6 space-y-4 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{editing ? '근로자 명단 변경' : '새 근로자 등록'}</h3>{editing && <button type="button" disabled={busy} onClick={resetForm} className="min-h-12 rounded-lg px-3 py-2 text-sm underline">변경 취소</button>}</div>
            <label className="block text-sm font-semibold">근로자 이름<input required maxLength={200} value={form.name} disabled={busy} onChange={event => changeField('name', event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">기업 내 관리번호<input required maxLength={200} value={form.workerCode} disabled={busy || Boolean(editing)} onChange={event => changeField('workerCode', event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">직종<textarea required maxLength={200} rows={2} value={form.trade} disabled={busy} onChange={event => changeField('trade', event.target.value)} className={fieldClass} /></label>
            {editing && <label className="flex min-h-12 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={form.active} disabled={busy} onChange={event => { requestId.current = null; setForm(previous => ({ ...previous, active: event.target.checked })); }} />교육 대상자로 이용 허용</label>}
            <button disabled={busy} className="min-h-12 w-full rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy ? '저장 중…' : editing ? '근로자 변경 저장' : '근로자 등록'}</button>
            <p className="text-xs leading-5 text-slate-500">연락처, 주민등록번호, 비밀번호는 입력하지 마세요. 관리번호에 주민등록번호나 전화번호를 사용하지 마세요. 저장 결과를 확인하지 못했다면 목록 조회로 기존 등록 여부를 먼저 확인해 주세요.</p>
        </form> : <p className="mt-5 text-sm text-slate-600">조회 권한으로 기록과 변경 이력을 확인할 수 있습니다.</p>}
        {message && <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
    </section>;
}
