import type { Page } from '../types';

// Manager-only mobile navigation. Its destinations are derived from the SAME
// role/mode/composition-filtered visible pages as the operational Sidebar.
export type MobileTabId = 'home' | 'alerts' | 'profile' | 'predictive' | 'more';

export interface MobileTabRoute {
    id: MobileTabId;
    page?: Page;
}

const TAB_PRIORITY: ReadonlyArray<{ id: Exclude<MobileTabId, 'more'>; pages: readonly Page[] }> = [
    { id: 'home', pages: ['dashboard'] },
    { id: 'alerts', pages: ['ocr-analysis'] },
    { id: 'profile', pages: ['monthly-guidance-report'] },
    { id: 'predictive', pages: ['education-return', 'a4-education-material', 'reports', 'admin-training'] },
];

export interface MobileNavigationState {
    tabs: MobileTabRoute[];
    activeTab: MobileTabId;
}

/**
 * Keep hidden and role-forbidden pages OUT of mobile tabs.
 * When a tab has no permitted destination, omit it rather than falling back
 * to a page that may be hidden or not allowed.
 * "more" opens the existing full navigation dialog; it is never a route.
 */
export const resolveMobileNavigation = (
    visibleSidebarPages: readonly Page[],
    currentPage: Page,
): MobileNavigationState => {
    const visible = new Set(visibleSidebarPages);
    const destinations = TAB_PRIORITY.map(({ id, pages }) => ({
        id,
        pages: pages.filter((page) => visible.has(page)),
    }));

    const tabs: MobileTabRoute[] = destinations
        .filter(({ pages }) => pages.length > 0)
        .map(({ id, pages }) => ({ id, page: pages[0] }));
    tabs.push({ id: 'more' });

    // Pages opened through full menu should show the 'more' state, never
    // falsely mark the dashboard as selected.
    const activeTab = destinations.find(({ pages }) => pages.includes(currentPage))?.id ?? 'more';
    return { tabs, activeTab };
};
