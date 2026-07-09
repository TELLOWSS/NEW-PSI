import type { Page } from '../types';

export const UI_COMPOSITION_STORAGE_KEY = 'psi_ui_composition_v1';
export const UI_COMPOSITION_SYNC_EVENT = 'psi-ui-composition-sync';
export const UI_COMPOSITION_DEBUG_STORAGE_KEY = 'psi_sidebar_visibility_debug_v1';
const UI_COMPOSITION_VERSION = 3;
const PREVIOUS_UI_COMPOSITION_VERSION = 2;
const OCR_ENTRY_PAGE: Page = 'ocr-analysis';
const MANAGER_RISK_ENTRY_PAGE: Page = 'survey-intelligence';

const DEFAULT_SIDEBAR_ORDER: Page[] = [
    'dashboard',
    'site-issue-management',
    'worker-management',
    'survey-intelligence',
    'predictive-analysis',
    'safety-behavior-management',
    'performance-analysis',
    'monthly-guidance-report',
    'a4-education-material',
    'ppt-pdf-one-page-summary',
    'admin-training',
    'reports',
    'ocr-analysis',
    'settings',
];

const ALL_PAGES = new Set<Page>(DEFAULT_SIDEBAR_ORDER);
const DEFAULT_HIDDEN_SIDEBAR_PAGES: Page[] = [
    'site-issue-management',
    'worker-management',
    'predictive-analysis',
    'safety-behavior-management',
];

type Direction = 'up' | 'down';

export interface UiCompositionConfig {
    version: number;
    sidebarOrder: Page[];
    hiddenSidebarPages: Page[];
}

export interface SidebarVisibilityDebugEntry {
    page: Page;
    reason: 'visible' | 'operational-mode' | 'role-visibility' | 'user-hidden';
}

const emitCompositionSyncEvent = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(UI_COMPOSITION_SYNC_EVENT));
};

const toUniquePages = (input: unknown): Page[] => {
    if (!Array.isArray(input)) return [];
    const unique = new Set<Page>();
    for (const value of input) {
        if (typeof value !== 'string') continue;
        if (!ALL_PAGES.has(value as Page)) continue;
        unique.add(value as Page);
    }
    return Array.from(unique);
};

const ensureOcrEntryProtected = (hiddenPages: Page[]): Page[] => hiddenPages.filter((page) => page !== OCR_ENTRY_PAGE);

const buildSidebarOrder = (orderInput: unknown): Page[] => {
    const order = toUniquePages(orderInput);
    const used = new Set(order);
    const missing = DEFAULT_SIDEBAR_ORDER.filter((page) => !used.has(page));
    return [...order, ...missing];
};

const normalizeUiCompositionConfig = (input?: Partial<UiCompositionConfig>): UiCompositionConfig => {
    return {
        version: UI_COMPOSITION_VERSION,
        sidebarOrder: buildSidebarOrder(input?.sidebarOrder),
        hiddenSidebarPages: ensureOcrEntryProtected(toUniquePages(input?.hiddenSidebarPages)),
    };
};

export const getDefaultUiCompositionConfig = (): UiCompositionConfig =>
    normalizeUiCompositionConfig({
        version: UI_COMPOSITION_VERSION,
        sidebarOrder: DEFAULT_SIDEBAR_ORDER,
        hiddenSidebarPages: DEFAULT_HIDDEN_SIDEBAR_PAGES,
    });

export const loadUiCompositionConfig = (): UiCompositionConfig => {
    if (typeof window === 'undefined') {
        return getDefaultUiCompositionConfig();
    }

    try {
        const raw = window.localStorage.getItem(UI_COMPOSITION_STORAGE_KEY);
        if (!raw) return getDefaultUiCompositionConfig();
        const parsed = JSON.parse(raw) as Partial<UiCompositionConfig>;
        if (parsed.version === PREVIOUS_UI_COMPOSITION_VERSION) {
            return normalizeUiCompositionConfig({
                ...parsed,
                hiddenSidebarPages: toUniquePages(parsed.hiddenSidebarPages)
                    .filter((page) => page !== MANAGER_RISK_ENTRY_PAGE),
            });
        }
        if (parsed.version !== UI_COMPOSITION_VERSION) {
            return getDefaultUiCompositionConfig();
        }
        return normalizeUiCompositionConfig(parsed);
    } catch {
        return getDefaultUiCompositionConfig();
    }
};

export const saveUiCompositionConfig = (config: UiCompositionConfig): UiCompositionConfig => {
    const normalized = normalizeUiCompositionConfig(config);
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(UI_COMPOSITION_STORAGE_KEY, JSON.stringify(normalized));
        emitCompositionSyncEvent();
    }
    return normalized;
};

export const resetUiCompositionConfig = (): UiCompositionConfig => {
    const defaults = getDefaultUiCompositionConfig();
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(UI_COMPOSITION_STORAGE_KEY);
        window.sessionStorage.removeItem(UI_COMPOSITION_DEBUG_STORAGE_KEY);
        emitCompositionSyncEvent();
    }
    return defaults;
};

export const writeSidebarVisibilityDebug = (
    mode: string,
    uiMode: string,
    entries: SidebarVisibilityDebugEntry[],
): void => {
    if (typeof window === 'undefined') return;

    const payload = {
        recordedAt: new Date().toISOString(),
        mode,
        uiMode,
        entries,
    };

    window.sessionStorage.setItem(UI_COMPOSITION_DEBUG_STORAGE_KEY, JSON.stringify(payload));
};

export const setSidebarPageVisible = (
    config: UiCompositionConfig,
    page: Page,
    isVisible: boolean,
): UiCompositionConfig => {
    if (page === OCR_ENTRY_PAGE && !isVisible) {
        return normalizeUiCompositionConfig(config);
    }

    const hiddenSet = new Set(config.hiddenSidebarPages);
    if (isVisible) {
        hiddenSet.delete(page);
    } else {
        hiddenSet.add(page);
    }

    return normalizeUiCompositionConfig({
        ...config,
        hiddenSidebarPages: Array.from(hiddenSet),
    });
};

export const reorderSidebarPage = (
    config: UiCompositionConfig,
    page: Page,
    direction: Direction,
): UiCompositionConfig => {
    const order = [...buildSidebarOrder(config.sidebarOrder)];
    const currentIndex = order.indexOf(page);
    if (currentIndex < 0) return normalizeUiCompositionConfig(config);

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= order.length) return normalizeUiCompositionConfig(config);

    [order[currentIndex], order[swapIndex]] = [order[swapIndex], order[currentIndex]];

    return normalizeUiCompositionConfig({
        ...config,
        sidebarOrder: order,
    });
};

export const applySidebarComposition = <T extends { id: Page }>(
    items: T[],
    config: UiCompositionConfig,
): T[] => {
    const normalized = normalizeUiCompositionConfig(config);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const hiddenSet = new Set(normalized.hiddenSidebarPages);

    return normalized.sidebarOrder
        .map((page) => itemMap.get(page))
        .filter((item): item is T => Boolean(item) && !hiddenSet.has(item.id));
};
