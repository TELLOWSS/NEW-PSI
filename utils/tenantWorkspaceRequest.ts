export class TenantWorkspaceRequestError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
}

interface RequestOptions {
    resource?: 'actions' | 'training-drafts' | 'workers';
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    query?: Record<string, string>;
    signal?: AbortSignal;
}

// Memory-only session and explicit user actions. A company/account switch invalidates pending results.
export async function requestTenantWorkspace(
    getAccessToken: () => Promise<string | null>,
    getGeneration: () => number,
    tenantId?: string,
    options: RequestOptions = {},
) {
    const ticket = getGeneration();
    const ensureCurrent = () => {
        if (getGeneration() !== ticket || options.signal?.aborted) {
            throw new TenantWorkspaceRequestError('요청이 취소되었습니다.', 0, 'REQUEST_CANCELLED');
        }
    };
    const token = await getAccessToken();
    ensureCurrent();
    if (!token) throw new TenantWorkspaceRequestError('다시 로그인해 주세요.', 401, 'SESSION_INVALID');
    const query = new URLSearchParams(options.query);
    if (options.resource) query.set('resource', options.resource);
    const response = await fetch(`/api/saas/access${query.size ? `?${query}` : ''}`, {
        method: options.method || 'GET', credentials: 'omit', cache: 'no-store', signal: options.signal,
        headers: { Authorization: `Bearer ${token}`, ...(tenantId ? { 'X-PSI-Tenant-ID': tenantId } : {}),
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await response.json().catch(() => null);
    ensureCurrent();
    if (!response.ok || !body?.ok) {
        throw new TenantWorkspaceRequestError(typeof body?.message === 'string' ? body.message : '요청을 처리할 수 없습니다.',
            response.status, typeof body?.code === 'string' ? body.code : 'REQUEST_FAILED');
    }
    return body;
}
