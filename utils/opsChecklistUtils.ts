export type DailyOpsChecklist = {
    dateKey: string;
    startChecks: [boolean, boolean, boolean];
    endChecks: [boolean, boolean, boolean];
    completedSummary: string;
    blockerSummary: string;
    nextActions: [string, string, string];
    updatedAt: string;
};

export type DailyOpsChecklistStore = Record<string, DailyOpsChecklist>;

export const OPS_CHECKLIST_STORAGE_KEY = 'psi_ops_daily_checklist_v1';
export const OPS_CHECKLIST_CHANGED_EVENT = 'psi:opsChecklistChanged';

export const buildDefaultChecklist = (dateKey: string): DailyOpsChecklist => ({
    dateKey,
    startChecks: [false, false, false],
    endChecks: [false, false, false],
    completedSummary: '',
    blockerSummary: '',
    nextActions: ['', '', ''],
    updatedAt: new Date().toISOString(),
});

export const getDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getYesterdayKey = (): string => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return getDateKey(yesterday);
};

export const loadOpsChecklistStore = (): DailyOpsChecklistStore => {
    try {
        const raw = localStorage.getItem(OPS_CHECKLIST_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as DailyOpsChecklistStore;
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch {
        return {};
    }
};

export const saveOpsChecklistStore = (store: DailyOpsChecklistStore): void => {
    try {
        localStorage.setItem(OPS_CHECKLIST_STORAGE_KEY, JSON.stringify(store));
        window.dispatchEvent(new CustomEvent(OPS_CHECKLIST_CHANGED_EVENT));
    } catch {
        // ignore storage failures
    }
};

export const getChecklistByDate = (dateKey: string): DailyOpsChecklist => {
    const store = loadOpsChecklistStore();
    return store[dateKey] || buildDefaultChecklist(dateKey);
};

export const getTodayChecklist = (): DailyOpsChecklist => {
    return getChecklistByDate(getDateKey(new Date()));
};
