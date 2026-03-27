export type BestPracticeSyncState = {
    status: 'idle' | 'pending' | 'success' | 'failed';
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    message?: string;
};

export type BestPracticeSyncFailureLog = {
    at: string;
    message: string;
};

export const BEST_PRACTICE_SYNC_STATUS_KEY = 'psi_best_practice_sync_status_v1';
export const BEST_PRACTICE_SYNC_FAILURE_LOGS_KEY = 'psi_best_practice_sync_failure_logs_v1';
export const BEST_PRACTICE_SYNC_STATUS_EVENT = 'psi-best-practice-sync-status-updated';

const DEFAULT_STATE: BestPracticeSyncState = {
    status: 'idle',
};

export const getBestPracticeSyncState = (): BestPracticeSyncState => {
    if (typeof window === 'undefined') return DEFAULT_STATE;
    try {
        const raw = window.localStorage.getItem(BEST_PRACTICE_SYNC_STATUS_KEY);
        if (!raw) return DEFAULT_STATE;

        const parsed = JSON.parse(raw) as Partial<BestPracticeSyncState>;
        const status = parsed.status;
        if (status !== 'idle' && status !== 'pending' && status !== 'success' && status !== 'failed') {
            return DEFAULT_STATE;
        }

        return {
            status,
            lastAttemptAt: typeof parsed.lastAttemptAt === 'string' ? parsed.lastAttemptAt : undefined,
            lastSuccessAt: typeof parsed.lastSuccessAt === 'string' ? parsed.lastSuccessAt : undefined,
            message: typeof parsed.message === 'string' ? parsed.message : undefined,
        };
    } catch {
        return DEFAULT_STATE;
    }
};

export const setBestPracticeSyncState = (next: BestPracticeSyncState): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(BEST_PRACTICE_SYNC_STATUS_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(BEST_PRACTICE_SYNC_STATUS_EVENT, { detail: next }));
    } catch {
        // localStorage 접근 실패 시 무시
    }
};

export const getBestPracticeSyncFailureLogs = (): BestPracticeSyncFailureLog[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(BEST_PRACTICE_SYNC_FAILURE_LOGS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                const at = typeof (entry as { at?: unknown }).at === 'string' ? (entry as { at: string }).at : '';
                const message = typeof (entry as { message?: unknown }).message === 'string' ? (entry as { message: string }).message : '';
                if (!at || !message) return null;
                return { at, message };
            })
            .filter((entry): entry is BestPracticeSyncFailureLog => Boolean(entry));
    } catch {
        return [];
    }
};

export const appendBestPracticeSyncFailureLog = (message: string): void => {
    if (typeof window === 'undefined') return;
    try {
        const trimmedMessage = String(message || '').trim();
        if (!trimmedMessage) return;

        const nextEntry: BestPracticeSyncFailureLog = {
            at: new Date().toISOString(),
            message: trimmedMessage,
        };

        const previous = getBestPracticeSyncFailureLogs();
        const next = [nextEntry, ...previous].slice(0, 5);
        window.localStorage.setItem(BEST_PRACTICE_SYNC_FAILURE_LOGS_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(BEST_PRACTICE_SYNC_STATUS_EVENT, { detail: { type: 'failure-log-updated' } }));
    } catch {
        // localStorage 접근 실패 시 무시
    }
};
