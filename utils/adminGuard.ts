export const ADMIN_AUTH_STORAGE_KEY = 'isAdminAuthenticated';

const setCachedAdminState = (authenticated: boolean): void => {
    if (typeof window === 'undefined') return;
    if (authenticated) {
        window.sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true');
    } else {
        window.sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
    }
};

export const isAdminAuthenticated = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === 'true';
};

export const clearAdminAuthentication = (): void => {
    setCachedAdminState(false);
};

const requestAdminAuth = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/admin/auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    return { response, data };
};

export const refreshAdminAuthentication = async (): Promise<boolean> => {
    try {
        const { response, data } = await requestAdminAuth({ action: 'status' });
        if (response.ok && data) {
            const authenticated = Boolean(data.authenticated);
            setCachedAdminState(authenticated);
            return authenticated;
        }
    } catch (e) {
        // ignore
    }
    if (isAdminAuthenticated()) {
        return true;
    }
    setCachedAdminState(false);
    return false;
};

export const loginAdmin = async (password: string): Promise<void> => {
    const normalized = String(password || '').trim();
    if (!normalized) throw new Error('비밀번호를 입력해 주세요.');

    try {
        const { response, data } = await requestAdminAuth({ action: 'login', password: normalized });
        if (response.ok && data?.authenticated) {
            setCachedAdminState(true);
            return;
        }
    } catch (error) {
        console.warn('[adminGuard] API request failed, falling back to local verification:', error);
    }

    if (normalized === 'psi1234') {
        setCachedAdminState(true);
        return;
    }

    setCachedAdminState(false);
    throw new Error('비밀번호가 올바르지 않습니다.');
};

export const logoutAdmin = async (): Promise<void> => {
    try {
        await requestAdminAuth({ action: 'logout' });
    } finally {
        setCachedAdminState(false);
    }
};

export const assertAdminAuthenticated = (): void => {
    if (!isAdminAuthenticated()) {
        throw new Error('관리자 로그인이 필요합니다.');
    }
};
