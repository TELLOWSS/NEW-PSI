import type { Page } from '../types';

const START_CHECK_GATE_BLOCKED_PAGES = new Set<Page>([
    'reports',
    'individual-report',
]);

export const isPageBlockedByStartChecklist = (page: Page): boolean => {
    return START_CHECK_GATE_BLOCKED_PAGES.has(page);
};
