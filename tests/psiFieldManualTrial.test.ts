import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 FIELD_TRIAL_CASES,initialFieldTrialAnswers,buildFieldTrialSummary,formatFieldTrialSummary
} from '../field-local/fieldManualTrial';
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
describe('L40 P3 on-device manual trial register does not claim release approval',()=>{
 it('requires seven manual cases, none verified by default',()=>{
  const summary=buildFieldTrialSummary(initialFieldTrialAnswers());
  expect(FIELD_TRIAL_CASES).toHaveLength(7);
  expect(summary.total).toBe(7);
  expect(summary.notRun).toBe(7);
  expect(summary.observed).toBe(0);
  expect(summary.status).toBe('SELF_REPORTED_UNVERIFIED');
  expect(summary.humanReleaseAuthorized).toBe(false);
 });
 it('separates observed / issue / blocked / not-run without false approvals',()=>{
  const summary=buildFieldTrialSummary({
   'android-chrome':'observed','samsung-internet':'issue','airplane-offline':'blocked'
  });
  expect([summary.observed,summary.issues,summary.blocked,summary.notRun]).toEqual([1,1,1,4]);
  expect(summary.humanReleaseAuthorized).toBe(false);
  const text=formatFieldTrialSummary(summary);
  expect(text).toContain('자기보고 (승인 증빙 아님)');
  expect(text).toContain('미실시 4');
  expect(text).toContain('RELEASE=BLOCKED');
  expect(text).not.toMatch(/승인 완료|UAT PASSED/);
 });
 it('all selected as observed still cannot authorize release or prove receipt',()=>{
  const summary=buildFieldTrialSummary(Object.fromEntries(FIELD_TRIAL_CASES.map(x=>[x.id,'observed'])));
  expect(summary.observed).toBe(7);
  expect(summary.notRun).toBe(0);
  expect(summary.humanReleaseAuthorized).toBe(false);
  expect(formatFieldTrialSummary(summary)).toContain('출시 승인 아님');
 });
 it('has no automatic remote upload, private record persistence or device fingerprinting',()=>{
  const ui=read('field-local/main.tsx');
  const module=read('field-local/fieldManualTrial.ts');
  const browser=read('scripts/verify-psi-l16-resilience.mjs');
  expect(ui).toContain('useState<FieldTrialAnswers>(initialFieldTrialAnswers)');
  expect(ui).toContain('onClick={()=>void copyFieldTrial()}');
  expect(ui).toContain('data-psi-p3-trial-counts');
  expect(ui).toContain('새로고침·종료하면 사라지므로');
  expect(browser).toContain('p3-manual-trial-synthetic');
  expect(module).not.toMatch(/fetch\s*\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|indexedDB|userAgent|geolocation|deviceId|workerId/);
 });
});
