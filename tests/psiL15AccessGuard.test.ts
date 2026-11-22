import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('L15 narrow viewport and keyboard focus safeguards',()=>{
 it('keeps mobile drawer focus inside actual visible controls and restores prior document scroll',()=>{
  const layout=source('components/Layout.tsx');
  expect(layout).toContain('if (!isMobileMenuOpen) return;');
  expect(layout).toContain('element.getClientRects().length > 0');
  expect(layout).toContain("getComputedStyle(element).visibility !== 'hidden'");
  expect(layout).toContain("!element.closest('[hidden],[inert],[aria-hidden=\"true\"]')");
  expect(layout).toContain('!dialog?.contains(document.activeElement)');
  expect(layout).toContain('document.body.style.overflow = previousOverflow');
  expect(layout).toContain('mobileMenuPreviousFocusRef.current?.focus()');
  expect(layout).toContain('window.cancelAnimationFrame(focusFrame)');
  expect(layout).toContain('shortcutsDisabled={isMobileMenuOpen}');
 });
 it('gives the quick finder a labeled input, bounded scrollable results and 44px targets',()=>{
  const quick=source('components/shell/NavigationQuickFind.tsx');
  expect(quick).toContain('aria-label="업무 메뉴 검색어"');
  expect(quick).toContain('min-h-11 min-w-11');
  expect(quick).toContain('min-h-11 w-full items-center');
  expect(quick).toContain('max-h-[calc(100dvh-1.5rem)]');
  expect(quick).toContain('min-h-0 flex-1 overflow-y-auto');
  expect(quick).toContain("scrollIntoView({ block: 'nearest' })");
  expect(quick).toContain("document.body.style.overflow = 'hidden'");
  expect(quick).toContain('document.body.style.overflow = previousOverflow');
  expect(quick).toContain('!dialogRef.current?.contains(document.activeElement)');
  expect(quick).toContain("event.key === 'Escape'");
  expect(quick).not.toMatch(/fetch\s*\(|localStorage|sessionStorage|indexedDB/);
 });
 it('uses dynamic viewport height only for the admin shell and disables forced size on print',()=>{
  const css=source('styles/psi-living-motion.css');
  expect(css).toContain('@supports (height: 100dvh)');
  expect(css).toContain('.psi-app-shell.psi-platform-field-canvas { height: 100dvh; }');
  expect(css).toContain('.psi-app-shell.psi-platform-field-canvas { height: auto !important; }');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).not.toMatch(/url\s*\(/);
  expect(source('field-local/main.tsx')).not.toContain('psi-living-motion.css');
 });
});
