import React, { useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import TenantTrainingDraftsPanel from '../components/TenantTrainingDraftsPanel';
import TenantSafetyActionsPanel from '../components/TenantSafetyActionsPanel';
import { requestTenantWorkspace, TenantWorkspaceRequestError } from '../utils/tenantWorkspaceRequest';

type Membership = { tenant_id: string; role: string; psi_tenants: { name: string } | null };
const roleNames: Record<string, string> = { owner: '기업 책임자', admin: '관리자', reviewer: '검토자', viewer: '조회자' };

export default function TenantAccess() {
    const clientRef = useRef<SupabaseClient | null>(null);
    const generation = useRef(0);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [signedIn, setSignedIn] = useState(false);
    const [selected, setSelected] = useState<{ name: string; role: string; tenantId: string; userId: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) { setError('기업 계정 서비스가 아직 준비되지 않았습니다. 운영 관리자에게 문의해 주세요.'); return; }
        // Separate in-memory session; no legacy browser records or shared administrator state.
        const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
        clientRef.current = client;
        setReady(true);
        return () => {
            generation.current += 1;
            client.auth.stopAutoRefresh();
            clientRef.current = null;
        };
    }, []);

    const getAccessToken = async () => {
        const client = clientRef.current;
        if (!client) return null;
        const { data } = await client.auth.getSession();
        return data.session?.access_token || null;
    };
    const requestAccess = (tenantId?: string) => requestTenantWorkspace(getAccessToken, () => generation.current, tenantId);

    const loseAccess = (cause: TenantWorkspaceRequestError) => {
        generation.current += 1; setSelected(null); setError(cause.message);
        if (cause.status === 401) {
            setMemberships([]); setSignedIn(false); setPassword('');
            void clientRef.current?.auth.signOut({ scope: 'local' }).catch(() => undefined);
        }
    };

    const signOut = async () => {
        generation.current += 1;
        setMemberships([]); setSelected(null); setPassword(''); setSignedIn(false); setError(''); setBusy(false);
        await clientRef.current?.auth.signOut({ scope: 'local' }).catch(() => undefined);
    };

    const signIn = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const ticket = ++generation.current;
        setBusy(true); setError(''); setSelected(null); setMemberships([]);
        try {
            const client = clientRef.current;
            if (!client) throw new Error('기업 계정 서비스를 사용할 수 없습니다.');
            const { error: loginError } = await client.auth.signInWithPassword({ email: email.trim(), password });
            setPassword('');
            if (loginError) throw new Error('로그인 정보를 확인해 주세요.');
            if (generation.current !== ticket) return;
            const data = await requestAccess();
            if (generation.current !== ticket) return;
            setMemberships(data.memberships); setSignedIn(true);
        } catch (cause) {
            if (generation.current === ticket) {
                await clientRef.current?.auth.signOut({ scope: 'local' }).catch(() => undefined);
                setPassword(''); setSignedIn(false); setError(cause instanceof Error ? cause.message : '로그인할 수 없습니다.');
            }
        } finally { if (generation.current === ticket) setBusy(false); }
    };

    const selectTenant = async (membership: Membership) => {
        const ticket = ++generation.current;
        setBusy(true); setSelected(null); setError('');
        try {
            const data = await requestAccess(membership.tenant_id);
            if (generation.current === ticket) setSelected({ name: membership.psi_tenants?.name || '등록된 기업', role: data.role, tenantId: data.tenantId, userId: data.userId });
        } catch (cause) {
            if (generation.current === ticket) setError(cause instanceof Error ? cause.message : '기업 소속을 확인할 수 없습니다.');
        } finally { if (generation.current === ticket) setBusy(false); }
    };

    return <main className="min-h-screen bg-slate-100 px-4 py-12 text-slate-900">
        <section className={`mx-auto ${selected ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl bg-white p-6 shadow-sm sm:p-8`} aria-labelledby="tenant-access-title">
            <p className="text-sm font-bold text-indigo-700">NEW-PSI</p>
            <h1 id="tenant-access-title" className="mt-2 text-2xl font-bold">기업 계정 확인</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">개인 계정으로 로그인하여 소속 기업과 이용 권한을 확인하세요.</p>
            {!signedIn ? <form onSubmit={signIn} className="mt-6 space-y-4">
                <label className="block text-sm font-semibold">이메일
                    <input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" />
                </label>
                <label className="block text-sm font-semibold">비밀번호
                    <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" />
                </label>
                <button disabled={busy || !ready} className="w-full rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy ? '확인 중…' : '로그인'}</button>
                <p className="text-xs leading-5 text-slate-500">계정 발급과 비밀번호 재설정은 운영 관리자에게 문의해 주세요. 이 화면을 새로 열면 다시 로그인해야 합니다.</p>
            </form> : <div className="mt-6 space-y-3">
                <h2 className="font-bold">소속 기업</h2>
                {memberships.length === 0 && <p className="text-sm text-slate-600">이용 가능한 기업이 없습니다. 운영 관리자에게 소속 등록을 요청해 주세요.</p>}
                {memberships.map(membership => <button key={membership.tenant_id} disabled={busy} onClick={() => void selectTenant(membership)} className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-300 p-4 text-left hover:bg-slate-50 disabled:opacity-50">
                    <span className="break-words font-semibold">{membership.psi_tenants?.name || '등록된 기업'}</span>
                    <span className="shrink-0 text-xs text-slate-600">{roleNames[membership.role] || '권한 확인 필요'}</span>
                </button>)}
                <button onClick={() => void signOut()} className="rounded-lg px-2 py-3 text-sm font-semibold text-slate-600 underline">로그아웃</button>
            </div>}
            {selected && <div role="status" className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                <p className="font-bold">{selected.name} · {roleNames[selected.role]}</p>
                <p>현재 선택한 기업의 권한으로 조치 기록과 교육 초안을 확인합니다. 기업을 바꾸거나 로그아웃하면 열린 기록과 입력 내용이 지워집니다.</p>
            </div>}
            {selected && <TenantSafetyActionsPanel key={`${selected.userId}:${selected.tenantId}`} role={selected.role}
                request={options => requestTenantWorkspace(getAccessToken, () => generation.current, selected.tenantId, options)} onAccessLost={loseAccess} />}
            {selected && <TenantTrainingDraftsPanel key={`${selected.userId}:${selected.tenantId}`} role={selected.role}
                request={options => requestTenantWorkspace(getAccessToken, () => generation.current, selected.tenantId, options)} onAccessLost={loseAccess} />}
            {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
        </section>
    </main>;
}
