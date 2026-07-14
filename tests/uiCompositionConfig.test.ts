import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getDefaultUiCompositionConfig,
    loadUiCompositionConfig,
    UI_COMPOSITION_STORAGE_KEY,
} from '../utils/uiCompositionConfig';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('UI composition defaults', () => {
    it('keeps the worker perception and manager baseline page available but hidden by default', () => {
        const config = getDefaultUiCompositionConfig();

        expect(config.sidebarOrder).toContain('survey-intelligence');
        expect(config.hiddenSidebarPages).toContain('survey-intelligence');
    });

    it('migrates version 2 settings without losing the existing menu order', () => {
        const stored = JSON.stringify({
            version: 2,
            sidebarOrder: ['dashboard', 'survey-intelligence', 'reports'],
            hiddenSidebarPages: ['survey-intelligence', 'worker-management'],
        });
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => key === UI_COMPOSITION_STORAGE_KEY ? stored : null,
            },
        });

        const config = loadUiCompositionConfig();

        expect(config.version).toBe(4);
        expect(config.sidebarOrder.slice(0, 3)).toEqual(['dashboard', 'survey-intelligence', 'reports']);
        expect(config.hiddenSidebarPages).not.toContain('survey-intelligence');
        expect(config.hiddenSidebarPages).toContain('worker-management');
    });
});
