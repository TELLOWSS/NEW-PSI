import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveMobileNavigation } from '../utils/mobileNavigationUtils';
import { getSidebarVisibleMenuItems } from '../components/Sidebar';
import { getDefaultUiCompositionConfig, setSidebarPageVisible } from '../utils/uiCompositionConfig';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const getVisible = () => getSidebarVisibleMenuItems(
    'immediate', 'practitioner', getDefaultUiCompositionConfig(),
).map(({ id }) => id);

describe('L04 manager mobile navigation', () => {
    it('selects destinations only from sidebar-visible practitioner routes', () => {
        const visible = getVisible();
        const nav = resolveMobileNavigation(visible, 'dashboard');
        expect(nav.tabs.find((item) => item.id === 'home')?.page).toBe('dashboard');
        expect(nav.tabs.find((item) => item.id === 'alerts')?.page).toBe('ocr-analysis');
        expect(nav.tabs.some((item) => item.page === 'feedback')).toBe(false);
        expect(nav.tabs.every((item) => !item.page || visible.includes(item.page))).toBe(true);
        expect(nav.activeTab).toBe('home');
    });

    it('omits hidden destinations with no unauthorized fallback', () => {
        const config = setSidebarPageVisible(getDefaultUiCompositionConfig(), 'dashboard', false);
        const visible = getSidebarVisibleMenuItems('immediate', 'practitioner', config).map(({ id }) => id);
        const nav = resolveMobileNavigation(visible, 'ocr-analysis');
        expect(nav.tabs.some((item) => item.id === 'home')).toBe(false);
        expect(nav.tabs.some((item) => item.page === 'dashboard')).toBe(false);
        expect(nav.activeTab).toBe('alerts');
    });

    it('keeps protected OCR route available when user tries to hide it', () => {
        const config = setSidebarPageVisible(getDefaultUiCompositionConfig(), 'ocr-analysis', false);
        const visible = getSidebarVisibleMenuItems('immediate', 'practitioner', config).map(({ id }) => id);
        expect(resolveMobileNavigation(visible, 'ocr-analysis').tabs.find((t) => t.id === 'alerts')?.page).toBe('ocr-analysis');
    });

    it('selects More on secondary routes, never falsely selects Home', () => {
        const visible = getVisible();
        const nav = resolveMobileNavigation(visible, 'safety-compliance-hub');
        expect(nav.activeTab).toBe('more');
        expect(nav.tabs.at(-1)).toEqual({ id: 'more' });
        expect(resolveMobileNavigation(visible, 'safety-inspector').activeTab).toBe('more');
    });

    it('drops unavailable tabs without leaving inert empty buttons', () => {
        const nav = resolveMobileNavigation(['ocr-analysis'], 'ocr-analysis');
        expect(nav.tabs).toEqual([{ id: 'alerts', page: 'ocr-analysis' }, { id: 'more' }]);
        expect(resolveMobileNavigation([], 'dashboard')).toEqual({
            tabs: [{ id: 'more' }], activeTab: 'more',
        });
    });

    it('uses a real mobile menu dialog and marks More as active without aria-current page', () => {
        const layout = source('components/Layout.tsx');
        const css = source('styles/psi-living-motion.css');
        expect(layout).toContain('resolveMobileNavigation(');
        expect(layout).toContain('quickFindOptions.map(({ page }) => page)');
        expect(layout).toContain('handleOpenMobileMenu();');
        expect(layout).toContain("isActive && tab.id !== 'more' ? 'page' : undefined");
        expect(layout).toContain('gridTemplateColumns:');
        expect(css).toContain('.psi-mobile-nav-tab[data-active="true"]');
        expect(css).toContain('var(--psi-brand)');
    });
});
