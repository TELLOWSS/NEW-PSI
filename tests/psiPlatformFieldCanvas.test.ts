import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const source=(path:string)=>readFileSync(path,'utf8');
const board=source('components/dashboard/PrecisionOperationsBoard.tsx');
const shell=source('components/shell/AppShell.tsx');
const sidebar=source('components/Sidebar.tsx');
const operator=source('pages/OperationalApp.tsx');
const canvas=source('styles/psi-platform-field-canvas.css');
const product=source('pages/InspectorProduct.tsx');
const local=source('field-local/main.tsx');

const contrast=(fg:string,bg:string)=>{
 const luminance=(hex:string)=>{
  const parts=(hex.replace('#','').match(/[0-9a-f]{2}/gi)||[]).map(x=>parseInt(x,16)/255)
   .map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));
  return parts[0]*.2126+parts[1]*.7152+parts[2]*.0722;
 };
 const a=luminance(fg),b=luminance(bg);
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
};

describe('NEW-PSI R70–R73 Field Canvas platform design contract',()=>{
 it('scopes all platform-only style to the operator AppShell',()=>{
  expect(operator).toContain("import '../styles.css';");
  expect(operator).toContain("import '../styles/psi-platform-field-canvas.css';");
  expect(operator.indexOf("psi-platform-field-canvas.css")).toBeGreaterThan(operator.indexOf("../styles.css"));
  expect(shell).toContain('psi-app-shell psi-platform-field-canvas');
  expect(product).not.toContain('psi-platform-field-canvas.css');
  expect(local).not.toContain('psi-platform-field-canvas.css');
  expect(canvas).not.toMatch(/@import\s|https?:\/\//);
 });
 it('preserves original source, real photo inspection and education destinations',()=>{
  for(const target of ["page:'ocr-analysis'","page:'safety-inspector'","page:'education-return'"])
   expect(board).toContain(target);
  expect(board).toContain('aria-labelledby="psi-field-route-title"');
  expect(board).toContain('aria-label={`${action.label} 화면으로 이동`}');
  expect(board).toContain('setCurrentPage(action.page)');
  expect(board).toContain('현장 위험 해소나 작업 재개를 자동 승인하지 않습니다');
 });
 it('retains essential review/period and six-stage safety follow-through',()=>{
  expect(board).toContain('value={periodFilter}');
  expect(board).toContain('value={tradeFilter}');
  expect(board).toContain('aria-label="주요 안전 지표"');
  expect(board).toContain('aria-label="안전 운영 상세"');
  expect(board).toContain('aria-labelledby="operations-assurance-title"');
  expect(board).toContain('quickLinks.map');
 });
 it('does not discard saved sidebar menu ordering and safe active page semantics',()=>{
  expect(sidebar).toContain('applySidebarComposition');
  expect(sidebar).toContain('reorderSidebarPage');
  expect(sidebar).toContain('compositionEditMode');
  expect(sidebar).toContain("aria-current={isActive ? 'page' : undefined}");
  expect(sidebar).toContain('psi-sidebar-wordmark');
  expect(canvas).toContain('.psi-sidebar-item.is-active');
 });
 it('sustains accessible shell, legibility, mobile, dark mode and print isolation',()=>{
  expect(canvas).toContain('html.dark .psi-app-shell.psi-platform-field-canvas');
  expect(canvas).toContain('@media(max-width:720px)');
  expect(canvas).toContain('@media(max-width:360px)');
  expect(canvas).toContain('@media(max-width:1100px)');
  expect(canvas).toContain('@media(prefers-reduced-motion:reduce)');
  expect(canvas).toContain('@media print');
  expect(canvas).toContain(':focus-visible');
  expect(canvas).toContain('min-height:46px');
  expect(canvas).toContain('min-height:44px');
  expect(canvas).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
 });
 it('maintains legible white text on brand accent and dark hero',()=>{
  expect(contrast('#ffffff','#117668')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#ffffff','#102d3e')).toBeGreaterThanOrEqual(7);
  expect(contrast('#07392f','#a7ead6')).toBeGreaterThanOrEqual(7);
 });
});
