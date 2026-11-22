import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('PSI desktop navigation dock contract', () => {
  it('allows collapse only in the desktop sidebar, not the mobile overlay', () => {
    const layout = source('components/Layout.tsx');
    const desktop = layout.split('desktopSidebar={')[1]?.split('mobileSidebarOverlay={')[0] ?? '';
    const mobile = layout.split('mobileSidebarOverlay={')[1]?.split('topBar={')[0] ?? '';
    expect(desktop).toContain('<Sidebar');
    expect(desktop).toContain('allowCollapse');
    expect(mobile).toContain('<Sidebar');
    expect(mobile).not.toContain('allowCollapse');
  });

  it('keeps keyboard labels, route policy and the composition editor', () => {
    const sidebar = source('components/Sidebar.tsx');
    expect(sidebar).toContain('allowCollapse = false');
    expect(sidebar).toContain("aria-label={docked ? '메뉴 펼치기' : '메뉴 접기'}");
    expect(sidebar).toContain("aria-label={docked ? resolvePageLabel(item.id) : undefined}");
    expect(sidebar).toContain('aria-current={isActive');
    expect(sidebar).toContain('applySidebarComposition');
    expect(sidebar).toContain('compositionEditMode');
    expect(sidebar).toContain('if (compositionEditMode) setIsCollapsed(false)');
    expect(sidebar).not.toMatch(/localStorage\.setItem\s*\(/);
  });

  it('provides full-size accessible menu composition controls for desktop and narrow layouts', () => {
    const sidebar = source('components/Sidebar.tsx');
    const browser = source('scripts/verify-psi-l15-accessibility.mjs');
    expect(sidebar).toContain('flex min-w-0 flex-col gap-1.5 rounded-lg');
    expect(sidebar).toContain('flex min-h-11 min-w-0 items-center gap-2');
    expect(sidebar).toContain('h-5 w-5 shrink-0 rounded');
    expect(sidebar).toContain('flex min-h-11 min-w-11 items-center justify-center rounded-lg');
    expect(sidebar).toContain('aria-label={`${resolvePageLabel(item.id)} 위로 이동`}');
    expect(sidebar).toContain('aria-label={`${resolvePageLabel(item.id)} 아래로 이동`}');
    expect(sidebar).toContain('onCompositionConfigChange(reorderSidebarPage');
    expect(browser).toContain('L33 menu editor target below');
    expect(browser).toContain("c.width>=1024");
    expect(browser).toContain('sidebar-composition-');
    expect(browser).toContain("getByRole('button',{name:'메뉴 구성 편집 열기'})");
  });

  it('uses reduced-motion-safe width animation without extra dependencies', () => {
    const css = source('styles/psi-living-motion.css');
    expect(css).toContain('.psi-sidebar--collapsed');
    expect(css).toContain('transition: width var(--psi-motion-standard)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.psi-sidebar,');
  });
});
