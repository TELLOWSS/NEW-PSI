export const ADMIN_AUTH_STORAGE_KEY = 'isAdminAuthenticated';
export const ADMIN_AUTH_TOKEN_STORAGE_KEY = 'adminAuthToken';

const resolveExpectedAdminPassword = () => {
    return (import.meta.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'psi1234').trim();
};

export const getExpectedAdminPassword = () => resolveExpectedAdminPassword();

export const isAdminAuthenticated = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === 'true';
};

export const setAdminAuthenticated = (authenticated: boolean): void => {
    if (typeof window === 'undefined') return;
    if (authenticated) {
        window.sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true');
    } else {
        window.sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
        window.sessionStorage.removeItem(ADMIN_AUTH_TOKEN_STORAGE_KEY);
    }
};

export const setAdminAuthToken = (token: string): void => {
    if (typeof window === 'undefined') return;
    const normalized = String(token || '').trim();
    if (!normalized) {
        window.sessionStorage.removeItem(ADMIN_AUTH_TOKEN_STORAGE_KEY);
        return;
    }
    window.sessionStorage.setItem(ADMIN_AUTH_TOKEN_STORAGE_KEY, normalized);
};

export const getAdminAuthToken = (): string => {
    if (typeof window === 'undefined') return '';
    return String(window.sessionStorage.getItem(ADMIN_AUTH_TOKEN_STORAGE_KEY) || '').trim();
};

export const verifyAdminPassword = (inputPassword: string): boolean => {
    const expected = resolveExpectedAdminPassword();
    const provided = String(inputPassword || '').trim();
    if (!expected || !provided) return false;
    return provided === expected;
};

export const assertAdminAuthenticated = (): void => {
    if (!isAdminAuthenticated()) {
        throw new Error('관리자 인증이 필요합니다.');
    }
};
