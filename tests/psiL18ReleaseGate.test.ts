import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const file=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const policy=JSON.parse(file('config/psi-living-ui-release-acceptance.json'));
describe('L18 independent non-release readiness gate',()=>{
 it('requires concrete human acceptance evidence for every pending safety/privacy/field/release risk',()=>{
  expect(policy.schema).toBe('psi-living-ui-release-acceptance-v1');
  expect(policy.project).toBe('NEW-PSI');
  expect(policy.repository).toBe('TELLOWSS/NEW-PSI');
  expect(policy.candidatePr).toBe(237);
  expect(policy.gates).toHaveLength(13);
  expect(new Set(policy.gates.map((x:{id:string})=>x.id)).size).toBe(13);
  expect(policy.gates.every((g:{status:string,evidence:unknown})=>
   ['pending','reviewed-with-evidence'].includes(g.status)&&(g.status!=='pending'||g.evidence===null))).toBe(true);
  expect(policy.gates.find((g:{id:string})=>g.id==='L18-production-post-deploy-validation')?.phase).toBe('post-deploy');
  for(const id of ['L06-worker-q1-q5-direct-submission','L08-L14-android-photo-pwa','L10-native-languages-a4',
   'L15-real-zoom-accessibility','L16-real-offline-radio-battery','L17-rbac-supabase-tenant-rls',
   'L18-product-owner-explicit-approval','L18-production-post-deploy-validation'])
   expect(policy.gates.find((g:{id:string})=>g.id===id)).toBeDefined();
 });
 it('only aggregates verified synthetic artifacts and never claims a device/server/owner release',()=>{
  const source=file('scripts/verify-psi-l18-release-gate.mjs');
  expect(source).toContain("['pending','reviewed-with-evidence']");
  expect(source).toContain("evidence.reviewerRole===gate.reviewer");
  expect(source).toContain("audit.releaseDecision=blocked.length?'BLOCKED': 'HUMAN_REVIEW_REQUIRED'");
  expect(source).toContain('postDeployPending');
  expect(source).toContain('releaseAuthorizedByThisJob:false');
  expect(source).toContain('mainMerged:null');
  expect(source).toContain('productionReleased:null');
  expect(source).toContain('company.realWorkerRecords===false');
  expect(source).toContain('offline.result');
  expect(source).toContain('e.networkCalls===0');
  expect(source).toContain('security.sourceOnly===true');
  expect(source).not.toMatch(/fetch\s*\(|sendBeacon|axios|https\.request|writeFile\(.+?config\//);
 });
 it('enforces the audit as a separate source-only and browser-evidence step without replacing earlier QA',()=>{
  const release=file('.github/workflows/verify.yml');
  const company=file('.github/workflows/psi-company-wide.yml');
  expect(release).toContain('node scripts/verify-psi-l18-release-gate.mjs --source-only');
  expect(company).toContain('node scripts/verify-psi-l18-release-gate.mjs --browser-evidence');
  expect(company).toContain('node scripts/verify-psi-l17-security.mjs');
  expect(company).toContain('artifacts/audit/psi-l18-release-gate/');
  for(const name of ['verify-psi-l15-accessibility','verify-psi-l16-resilience','verify-psi-platform-workspaces','verify-psi-company-browser'])
   expect(company).toContain(name);
  expect(release).toContain('node scripts/verify-psi-l17-security.mjs');
 });
});
