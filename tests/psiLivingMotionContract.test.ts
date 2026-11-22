import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('NEW-PSI living UI foundation contract', () => {
  it('loads motion styles only in the operational app', () => {
    const app = read('pages/OperationalApp.tsx');
    const entry = read('index.tsx');
    expect(app).toContain("import '../styles/psi-living-motion.css'");
    expect(entry).not.toContain('psi-living-motion.css');
  });

  it('scopes motion to the field canvas shell and respects reduced motion', () => {
    const css = read('styles/psi-living-motion.css');
    expect(css).toContain('.psi-app-shell.psi-platform-field-canvas');
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important');
    expect(css).toContain('@media print');
    expect(css).not.toMatch(/url\s*\(/);
  });

  it('restarts the page-header microtransition only on navigation', () => {
    const layout = read('components/Layout.tsx');
    const pageHeader = read('components/shell/PageHeader.tsx');
    expect(layout).toContain('key={currentPage}');
    expect(pageHeader).toContain('psi-living-page-enter');
  });
});
