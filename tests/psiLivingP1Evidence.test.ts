import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
type Trace={id:string;area:string;source:string;runner:string;unverified:string};
const ledger=JSON.parse(source('config/psi-living-ui-p1-evidence-trace.json')) as {
 schema:string;product:string;candidatePr:number;areas:Trace[];
};

describe('L35 Living UI P1 module-to-CI evidence boundary',()=>{
 it('includes exactly L00-L18 with real versioned sources and explicit manual gaps',()=>{
  expect(ledger.schema).toBe('psi-living-ui-p1-evidence-trace-v1');
  expect(ledger.product).toBe('NEW-PSI');
  expect(ledger.candidatePr).toBe(237);
  expect(ledger.areas.map(x=>x.id)).toEqual(
   Array.from({length:19},(_,i)=>'L'+String(i).padStart(2,'0')));
  for(const area of ledger.areas){
   expect(area.area.length).toBeGreaterThan(3);
   expect(area.unverified.length).toBeGreaterThan(11);
   expect(area.source).toMatch(/^(docs|tests|scripts)\/[a-zA-Z0-9/_\.\-]+$/);
   expect(area.source).not.toContain('..');
   expect(source(area.source).length).toBeGreaterThan(100);
  }
 });
 it('does not promote source traces or synthetic Chromium into human or Auth approvals',()=>{
  const checker=source('scripts/verify-psi-p1-evidence.mjs');
  const auth=JSON.parse(source('config/psi-l06-isolated-auth-acceptance-ledger.json'));
  const release=JSON.parse(source('config/psi-living-ui-release-acceptance.json'));
  expect(checker).toContain("authorizesRelease:false");
  expect(checker).toContain("manualAndLiveScope:'UNVERIFIED");
  expect(checker).toContain("existingL18Automation=evidence.automationStatus");
  expect(checker).toContain("humanGatePending:humanPending.length");
  expect(checker).toContain("humanPending=release.gates.filter");
  expect(auth.environment.approved).toBe(false);
  expect(auth.cases.filter((x:{status:string})=>x.status==='not-run')).toHaveLength(25);
  expect(release.gates.filter((x:{status:string})=>x.status==='pending')).toHaveLength(13);
 });
 it('wires release source-only and company browser trace after the existing L18 barrier',()=>{
  const release=source('.github/workflows/verify.yml');
  const company=source('.github/workflows/psi-company-wide.yml');
  const auditor='node scripts/verify-psi-p1-evidence.mjs';
  expect(release).toContain(auditor+' --source-only');
  expect(release).toContain('artifacts/audit/psi-p1-evidence/source-only.json');
  expect(company).toContain(auditor+' --browser-evidence');
  expect(company).toContain('artifacts/audit/psi-p1-evidence/');
  expect(company.indexOf('node scripts/verify-psi-l18-release-gate.mjs --browser-evidence'))
   .toBeLessThan(company.indexOf(auditor+' --browser-evidence'));
  expect(source('scripts/verify-psi-p1-evidence.mjs')).toContain("companyScenarios.includes");
  expect(source('scripts/verify-psi-p1-evidence.mjs')).toContain("browser?'SYNTHETIC_TRACE_PASS':'SOURCE_TRACE_PASS'");
 });
});
