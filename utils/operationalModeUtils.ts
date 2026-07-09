import type { Page } from '../types';

export type OperationalMode = 'immediate' | 'standard' | 'developer';

const OPERATIONAL_MODE_KEY = 'psi_operational_mode_v1';
export const OPERATIONAL_MODE_CHANGED_EVENT = 'psi:operationalModeChanged';

const IMMEDIATE_VISIBLE_PAGES = new Set<Page>([
    'dashboard',
    'ocr-analysis',
    'worker-management',
    'safety-checks',
    'site-issue-management',
    'education-return',
    'reports',
    'monthly-guidance-report',
    'a4-education-material',
    'ppt-pdf-one-page-summary',
    'admin-training',
    'performance-analysis',
    'settings',
    'individual-report',
    'worker-training',
    'field-context-input',
    'intervention-coaching',
    'judgment-tagging-input',
    'safety-behavior-management',
    'predictive-analysis',
    'survey-intelligence',
    'introduction',
]);

const parseOperationalMode = (value: string | null): OperationalMode => {
    if (value === 'immediate' || value === 'standard' || value === 'developer') {
        return value;
    }
    return 'immediate';
};

export const getOperationalMode = (): OperationalMode => {
    try {
        return parseOperationalMode(localStorage.getItem(OPERATIONAL_MODE_KEY));
    } catch {
        return 'immediate';
    }
};

export const setOperationalMode = (mode: OperationalMode): void => {
    try {
        localStorage.setItem(OPERATIONAL_MODE_KEY, mode);
        window.dispatchEvent(new CustomEvent(OPERATIONAL_MODE_CHANGED_EVENT));
    } catch {
        // storage unavailable
    }
};

export const cycleOperationalMode = (): OperationalMode => {
    const current = getOperationalMode();
    const next: OperationalMode = current === 'immediate'
        ? 'standard'
        : current === 'standard'
            ? 'developer'
            : 'immediate';
    setOperationalMode(next);
    return next;
};

export const isPageVisibleByOperationalMode = (page: Page, mode: OperationalMode): boolean => {
    if (mode === 'developer' || mode === 'standard') return true;
    return IMMEDIATE_VISIBLE_PAGES.has(page);
};

export const getOperationalModeLabel = (mode: OperationalMode): string => {
    if (mode === 'immediate') return '실무 즉시';
    if (mode === 'standard') return '표준 운영';
    return '개발 확장';
};
