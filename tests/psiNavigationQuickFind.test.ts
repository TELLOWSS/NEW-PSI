import { describe, expect, it } from 'vitest';
import { getSidebarVisibleMenuItems } from '../components/Sidebar';
import { filterNavigationOptions, type NavigationOption } from '../components/shell/NavigationQuickFind';
import { getDefaultUiCompositionConfig, setSidebarPageVisible } from '../utils/uiCompositionConfig';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Living UI L03 quick navigation', () => {
    it('uses the same filtered menu catalogue as Sidebar', () => {
        const config = getDefaultUiCompositionConfig();
        const visible = getSidebarVisibleMenuItems('immediate', 'practitioner', config).map((item) => item.id);
        expect(visible).toContain('dashboard');
        expect(visible).toContain('ocr-analysis');
        expect(visible).not.toContain('feedback');
        expect(visible).not.toContain('a4-education-material');

        const expanded = setSidebarPageVisible(config, 'a4-education-material', true);
        const expandedVisible = getSidebarVisibleMenuItems('immediate', 'practitioner', expanded)
            .map((item) => item.id);
        expect(expandedVisible).toContain('a4-education-material');
        expect(expandedVisible).not.toContain('feedback');
    });

    it('finds Korean navigation labels and groups without external calls', () => {
        const options: NavigationOption[] = [
            { page: 'dashboard', label: '현장 안전 관제센터', group: '현황' },
            { page: 'ocr-analysis', label: '위험성평가 분석', group: '위험성평가' },
            { page: 'safety-inspector', label: '사진점검 · 개선관리', group: '위험성평가' },
        ];
        expect(filterNavigationOptions(options, '사진')[0]?.page).toBe('safety-inspector');
        expect(filterNavigationOptions(options, '위험성평가')).toHaveLength(2);
        expect(filterNavigationOptions(options, '  사진  ')).toHaveLength(1);
        expect(filterNavigationOptions(options, '없는 메뉴')).toEqual([]);
        expect(filterNavigationOptions(options, '')).toHaveLength(3);
    });

    it('isolates background focus and distinguishes quick-search route selection from cancel', () => {
        const quick = source('components/shell/NavigationQuickFind.tsx');
        const browser = source('scripts/verify-psi-l15-accessibility.mjs');
        expect(quick).toContain("const appRoot = document.getElementById('root')");
        expect(quick).toContain('if (appRoot) appRoot.inert = true');
        expect(quick).toContain('if (appRoot) appRoot.inert = rootWasInert');
        expect(quick).toContain('navigatedRef.current = true');
        expect(quick).toContain("document.getElementById('psi-main-content')?.focus({ preventScroll: true })");
        expect(browser).toContain("'quick finder must make ONLY its nonportal app background inert'");
        expect(browser).toContain("'QuickFind current-page selection must release inert'");
    });

    it('wires the keyboard-safe search control into TopBar without exposing private records', () => {
        const quick = source('components/shell/NavigationQuickFind.tsx');
        const layout = source('components/Layout.tsx');
        const top = source('components/shell/TopBar.tsx');
        expect(layout).toContain('getSidebarVisibleMenuItems(operationalMode, uiAudienceMode, uiCompositionConfig)');
        expect(layout).toContain('quickFind={<NavigationQuickFind');
        expect(layout).toContain('shortcutsDisabled={isMobileMenuOpen}');
        expect(top).toContain('{quickFind}');
        expect(quick).toContain('aria-haspopup="dialog"');
        expect(quick).toContain('aria-modal="true"');
        expect(quick).toContain("event.key === 'Escape'");
        expect(quick).toContain("isTypingTarget(event.target)");
        expect(quick).not.toMatch(/fetch\s*\(|localStorage|sessionStorage|indexedDB/i);
    });
});
