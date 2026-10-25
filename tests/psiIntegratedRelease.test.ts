import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const file=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('PSI integrated release regression',()=>{
 it('preserves both Inspector and monthly education navigation from separate PRs',()=>{
  const app=file('App.tsx');
  expect(app).toContain("onOpenInspector={() => navigateToPage('safety-inspector')}");
  expect(app).toContain('<MonthlyGuidanceReport workerRecords={workerRecords} onNavigateToPage={navigateToPage} />');
 });
 it('keeps admin access and independent partner expense',()=>{
  const cfg=JSON.parse(file('config/psi-product-boundaries.json'));
  expect(cfg.rules['partner-safety-expense'].autoMergeAllowed).toBe(false);
  expect(cfg.rules['psi-inspector'].authRequired).toBe(true);
  expect(cfg.rules['psi-inspector'].standaloneEntry).toBe('/inspector');
  expect(cfg.rules['psi-core'].programSharedWithWorkers).toBe(false);
 });
 it('preserves all required release checks',()=>{
  const scripts=JSON.parse(file('package.json')).scripts;
  for(const check of ['check:free-tier-capacity','check:operator-release','check:feature-inventory','check:integrated-release'])
   expect(scripts['verify:fast']).toContain(check);
  expect(scripts['build:verified']).toContain('verify:ci');
 });
 it('requires score normalization, local-store preservation and safe request recovery',()=>{
  expect(file('utils/adminApiClient.ts')).toContain('AdminApiError');
  expect(file('utils/adminApiClient.ts')).not.toContain('함수 실행 10초 제한');
  expect(file('pages/SiteIssueManagement.tsx')).toContain('persistSiteIssueList');
  expect(file('utils/performanceScoreSignals.ts')).toContain('getValidPerformanceScores');
 });
});
