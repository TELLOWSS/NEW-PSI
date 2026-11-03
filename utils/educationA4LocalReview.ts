/**
 * A4 export review is an operator's local self-attestation, not an automatic
 * rendering/translation certification or an auditable server-side approval.
 * Store only role, language, time, and source SHA-256; never worker data,
 * names, photos, source text, exports, or credentials.
 */
export const A4_REVIEW_STORAGE_KEY = 'psi_a4_local_output_review_v1';

export const A4_REVIEW_CHECKS = ['fileOpened', 'glyphsLegible', 'safetyMeaningCompared'] as const;
export type A4ReviewCheck = (typeof A4_REVIEW_CHECKS)[number];
export type A4ReviewerRole = 'site-manager' | 'native-language-reviewer' | 'joint-review';
export interface A4OutputReview {
    version: 1;
    key: string;
    fingerprint: string;
    language: string;
    role: A4ReviewerRole;
    checkedAt: string;
    checks: Record<A4ReviewCheck, true>;
}
export type A4ReviewStore = Record<string, A4OutputReview>;

export const newA4ReviewChecks = (): Record<A4ReviewCheck, boolean> => ({
    fileOpened: false,
    glyphsLegible: false,
    safetyMeaningCompared: false,
});

export const a4ReviewKey = (month: string, workType: string, language: string): string =>
    JSON.stringify([month, workType, language]);

export const calculateA4ReviewFingerprint = async (serializedContent: string): Promise<string> => {
    if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
        throw new Error('이 브라우저에서 내용 변경 검증을 지원하지 않아 확인기록을 저장할 수 없습니다.');
    }
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializedContent));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const isStoredReview = (value: unknown): value is A4OutputReview => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Partial<A4OutputReview>;
    return record.version === 1
        && typeof record.key === 'string' && record.key.length < 300
        && typeof record.language === 'string' && record.language.length < 32
        && typeof record.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(record.fingerprint)
        && ['site-manager', 'native-language-reviewer', 'joint-review'].includes(record.role || '')
        && typeof record.checkedAt === 'string' && Number.isFinite(Date.parse(record.checkedAt))
        && A4_REVIEW_CHECKS.every(check => record.checks?.[check] === true);
};

export const readA4ReviewStore = (storage?: Pick<Storage, 'getItem'>): A4ReviewStore => {
    if (!storage) return {};
    try {
        const parsed: unknown = JSON.parse(storage.getItem(A4_REVIEW_STORAGE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
                .filter(([key, record]) => isStoredReview(record) && record.key === key)
                .slice(-100),
        ) as A4ReviewStore;
    } catch {
        return {};
    }
};

export const validA4Review = (store: A4ReviewStore, key: string, fingerprint: string): A4OutputReview | null => {
    const saved = store[key];
    return saved && isStoredReview(saved) && saved.fingerprint === fingerprint ? saved : null;
};

export const saveA4ReviewStore = (storage: Pick<Storage, 'setItem'>, entries: A4ReviewStore): void => {
    const safe = Object.fromEntries(Object.entries(entries).filter(([, entry]) => isStoredReview(entry)).slice(-100));
    storage.setItem(A4_REVIEW_STORAGE_KEY, JSON.stringify(safe));
};
