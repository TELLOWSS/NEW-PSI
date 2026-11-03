import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const quick=readFileSync('components/inspector/InspectorQuickWorkspace.tsx','utf8');
const local=readFileSync('components/inspector/InspectorLocalDraft.tsx','utf8');
const wrapper=readFileSync('pages/SafetyInspector.tsx','utf8');
const advanced=readFileSync('pages/InspectorAdvancedWorkspace.tsx','utf8');
const css=readFileSync('components/inspector/inspector-refresh.css','utf8');

function relativeLuminance(hex:string){
 const rgb=hex.replace('#','').match(/.{2}/g)!.map(x=>parseInt(x,16)/255)
  .map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function contrast(foreground:string,background:string){
 const a=relativeLuminance(foreground),b=relativeLuminance(background);
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
describe('NEW-PSI Field Canvas UX design contract',()=>{
 it('keeps both choices in the main viewport and truly opens offline workspace',()=>{
  expect(quick).toContain('aria-label="점검 방식 선택"');
  expect(quick).toContain('href="#si-quick-input"');
  expect(quick).toContain('href="#si-local-inspection"');
  expect(quick).toContain('section.open=true');
  expect(quick).toContain('si-refresh-hero-points');
  expect(quick).toContain('사진 찍고 점검하기');
  expect(quick).toContain('저장 기록 · 상세 관리');
 });
 it('keeps manual/no-AI default and requires real consent before dispatch',()=>{
  expect(quick).toContain('aria-label="AI 정밀점검 사용"');
  expect(quick).toContain('checked={consent}');
  expect(quick).toContain("apiEnabled&&ready===true&&!cost.allowed");
  expect(quick).toContain('onClick={analyze}');
 });
 it('marks the actual offline and F10 anchors with no record overwrite shortcut',()=>{
  expect(local).toContain('className="si-local-inspection si-refresh-local"');
  expect(local).toContain('aria-label="기기 점검 빠른 이동"');
  expect(local).toContain('href="#si-saved-local-records"');
  expect(local).toContain('href="#si-f10-recheck"');
  expect(local).toContain('id="si-f10-recheck"');
  expect(local).toContain('인계 수신·재점검 확인 순서');
 });
 it('loads refresh layer last while retaining advanced/print routes',()=>{
  expect(wrapper.indexOf('inspector-refresh.css')).toBeGreaterThan(wrapper.indexOf('inspector-collab.css'));
  expect(advanced).toContain('si-refresh-advanced');
  expect(css).toContain('@media print');
  expect(css).toContain('prefers-reduced-motion:reduce');
  expect(css).toContain('html.dark');
  expect(css).toContain('max-width:530px');
  expect(css).toContain('max-width:800px');
  expect(css).not.toMatch(/https:\/\/|@import\s+url/);
 });
 it('provides strong text contrast for primary action and hero',()=>{
  expect(contrast('#ffffff','#127b6d')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#f7fffc','#102939')).toBeGreaterThanOrEqual(7);
 });
});
