import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type TenantRole = 'owner' | 'admin' | 'reviewer' | 'viewer';
const roles = new Set<TenantRole>(['owner', 'admin', 'reviewer', 'viewer']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantAccessError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
    }
}

export interface TenantPrincipal {
    userId: string;
    client: SupabaseClient;
}

export interface TenantContext extends TenantPrincipal {
    tenantId: string;
    role: TenantRole;
}

// Only a user-scoped client is returned. Never fall back to a service-role client.
export async function authenticateTenantUser(req: any): Promise<TenantPrincipal> {
    const authorization = req?.headers?.authorization;
    if (typeof authorization !== 'string' || authorization.length > 8192 || !/^Bearer [^\s,]+$/i.test(authorization)) {
        throw new TenantAccessError(401, 'AUTH_REQUIRED', '개인 계정으로 로그인해 주세요.');
    }
    const accessToken = authorization.slice(7);
    const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new TenantAccessError(503, 'AUTH_UNAVAILABLE', '로그인 서비스를 사용할 수 없습니다.');
    // Catch an accidentally configured privileged legacy JWT before making a request.
    if (key.startsWith('sb_secret_') || key.split('.').length === 3 && (() => {
        try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon'; }
        catch { return true; }
    })()) throw new TenantAccessError(503, 'AUTH_UNAVAILABLE', '로그인 서비스를 사용할 수 없습니다.');

    const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    // getUser verifies with the identity provider; decoding an unverified JWT is insufficient.
    let result: Awaited<ReturnType<typeof client.auth.getUser>>;
    try { result = await client.auth.getUser(accessToken); }
    catch { throw new TenantAccessError(503, 'AUTH_UNAVAILABLE', '로그인 서비스를 사용할 수 없습니다.'); }
    if (result.error || !result.data.user || !uuid.test(result.data.user.id)) {
        throw new TenantAccessError(401, 'SESSION_INVALID', '로그인 세션을 다시 확인해 주세요.');
    }
    return { userId: result.data.user.id, client };
}

export async function requireTenantContext(req: any, allowedRoles?: readonly TenantRole[]): Promise<TenantContext> {
    const tenantId = req?.headers?.['x-psi-tenant-id'];
    if (typeof tenantId !== 'string' || !uuid.test(tenantId)) {
        throw new TenantAccessError(400, 'TENANT_REQUIRED', '이용할 기업을 선택해 주세요.');
    }
    const principal = await authenticateTenantUser(req);
    let result;
    try {
        result = await principal.client.from('psi_tenant_memberships')
            .select('tenant_id,user_id,role,status')
            .eq('tenant_id', tenantId).eq('user_id', principal.userId).eq('status', 'active').maybeSingle();
    } catch { throw new TenantAccessError(503, 'MEMBERSHIP_UNAVAILABLE', '기업 소속을 확인할 수 없습니다.'); }
    if (result.error) throw new TenantAccessError(503, 'MEMBERSHIP_UNAVAILABLE', '기업 소속을 확인할 수 없습니다.');
    const membership = result.data;
    if (!membership || typeof membership.tenant_id !== 'string' || membership.tenant_id.toLowerCase() !== tenantId.toLowerCase()
        || membership.user_id !== principal.userId || membership.status !== 'active' || !roles.has(membership.role)) {
        throw new TenantAccessError(403, 'TENANT_FORBIDDEN', '이 기업에 대한 이용 권한이 없습니다.');
    }
    if (allowedRoles && !allowedRoles.includes(membership.role)) {
        throw new TenantAccessError(403, 'ROLE_FORBIDDEN', '이 작업을 수행할 권한이 없습니다.');
    }
    return { ...principal, tenantId: membership.tenant_id, role: membership.role };
}

export function sendTenantError(res: any, error: unknown) {
    if (error instanceof TenantAccessError) {
        return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    // Never serialize provider errors, tokens, raw queries or personal data.
    return res.status(503).json({ ok: false, code: 'SERVICE_UNAVAILABLE', message: '잠시 후 다시 시도해 주세요.' });
}
