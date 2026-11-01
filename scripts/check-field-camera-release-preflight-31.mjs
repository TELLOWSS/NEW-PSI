/**
 * 31차 NEW-PSI F01–F10 release-candidate gate.
 *
 * Offline, deterministic and intentionally NOT a release/merge/deploy action.
 * Checks integrated safety contracts, browser QA registration and privacy
 * defaults. A PASS means the source passes these checks, not that an Android
 * field trial or the Vercel production deployment was verified.
 */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {prepareFollowupChange} from '../lib/inspector/localFollowupChangeTrace.mjs';
import {buildLocalRecheckQueue} from '../lib/inspector/localRecheckQueue.mjs';
import {buildLocalRecheckProgress} from '../lib/inspector/localRecheckProgress.mjs';
import {buildLocalRecheckReport,formatLocalRecheckCsv,formatLocalRecheckPrintHtml} from '../lib/inspector/localRecheckReport.mjs';
import {buildLocalHandoffPlan,formatLocalHandoffMessage} from '../lib/inspector/localRecheckHandoff.mjs';

const fromRoot=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const checks=[];
const check=(label,fn)=>{
 try {fn();checks.push({name:label,ok:true});}
 catch(error){checks.push({name:label,ok:false,why:error instanceof Error?error.message:String(error)});}
};
const packageJson=JSON.parse(fromRoot('package.json'));
const buildConfig=JSON.parse(fromRoot('vercel.json'));
const ui=fromRoot('components/inspector/InspectorLocalDraft.tsx');
const qa=fromRoot('scripts/verify-inspector-local-offline.mjs');
const companyWorkflow=fromRoot('.github/workflows/psi-company-wide.yml');
const cameraWorkflow=fromRoot('.github/workflows/inspector-mobile-browser.yml');

const fixed=new Date(2026,10,1,13,0);
const before=prepareFollowupChange(undefined,{
 status:'in_progress',assignee:'합성 개인담당자 (출력금지)',
 dueDate:'2026-11-02',temporaryMeasure:'작업구역 출입 통제',
 note:'보완작업을 기다리며 기존 통제를 확인했음',
 controlReview:'unchecked',
},new Date('2026-10-28T09:00:00.000Z'));
const after=prepareFollowupChange(before,{
 status:'in_progress',assignee:'합성 개인담당자 (출력금지)',
 dueDate:'2026-11-07',temporaryMeasure:'통제구역 확대',
 dueChangeReason:'실제 완료를 기다리는 자재 반입 일정 변경',
 temporaryChangeReason:'장비 동선과 간섭되는 출입 통제구역 재설정',
 note:'점검자가 임시 통제 현장 확인이라고 기록함',
 controlReview:'site_checked',
},new Date('2026-10-30T09:00:00.000Z'));
const record={
 id:'synthetic-release31',note:'개인 연락처가 섞인 상세 메모 (출력금지)',
 siteContext:{site:'가상 시험 현장',building:'2001동',level:'16층',trade:'형틀'},
 followup:after,
 rechecks:[{
  id:'recheck-31',result:'temporary_checked',
  at:'2026-10-31T07:00:00.000Z',
  nextCheckDate:'2026-11-01',followupStatus:'in_progress',
  reason:'재점검의 개인 사유 (출력금지)',note:'합성 기록',
  photoSha256:'a'.repeat(64),
 }],
 additionalActions:[],
};
const recordBefore=JSON.stringify(record);

check('Release CI and verified Vercel build retain full test gates',()=>{
 assert.match(packageJson.scripts['verify:ci'],/npm run verify:fast/);
 assert.match(packageJson.scripts['verify:ci'],/npm run test:ci/);
 assert.match(packageJson.scripts['verify:ci'],/npm run build/);
 assert.match(packageJson.scripts['build:verified'],/npm run verify:ci/);
 assert.equal(buildConfig.buildCommand,'npm run build:verified');
 assert.match(companyWorkflow,/node scripts\/verify-field-camera-delivery-preflight\.mjs/);
 assert.match(cameraWorkflow,/node scripts\/verify-inspector-local-offline\.mjs/);
});
check('F06 pre-share/ZIP photo integrity and safe retry browser coverage remain registered',()=>{
 const script=fromRoot('scripts/verify-field-camera-delivery-preflight.mjs');
 assert.match(script,/sha|SHA/);
 assert.match(script,/IndexedDB|indexedDB/);
 assert.match(script,/share|Share/);
 assert.match(script,/ZIP|zip/);
});
check('F10 v17 backup/restore and offline whole-record QA are still present',()=>{
 assert.match(ui,/version:hasRechecks\(row\)\?17/);
 assert.match(ui,/\[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17\]/);
 assert.match(qa,/traceSaved\.version,17/);
 assert.match(qa,/traceSaved\.record\.rechecks\[0\]\.nextCheckDate/);
 assert.match(qa,/default-src 'none'/);
});
check('F10 goal deadline and next reinspection date stay separate',()=>{
 const queue=buildLocalRecheckQueue([record],fixed);
 assert.equal(queue.length,1);
 assert.equal(queue[0].date,'2026-11-01');
 assert.equal(queue[0].dateSource,'재점검 예정일');
 const progress=buildLocalRecheckProgress(record);
 assert.equal(progress.currentDueDate,'2026-11-07');
 assert.equal(progress.nextCheckDate,'2026-11-01');
 assert.equal(progress.dueChangeCount,1);
 assert.equal(progress.temporaryChangeCount,1);
 assert.equal(progress.recheckCount,1);
 assert.deepEqual(progress.events.map(e=>e.kind),['followup','followup','recheck']);
});
check('F10 default reporting never exports worker name, free text or photo digests',()=>{
 const queue=buildLocalRecheckQueue([record],fixed);
 const report=buildLocalRecheckReport(queue,[record],{
  generatedAt:fixed,scopeLabel:'31차 릴리스 가상 점검',
  includeProgress:true,
 });
 const csv=formatLocalRecheckCsv(report),html=formatLocalRecheckPrintHtml(report);
 for(const result of [csv,html]){
  assert.ok(result.includes('F10 경과 연계 이력'));
  assert.ok(!result.includes('합성 개인담당자 (출력금지)'));
  assert.ok(!result.includes('개인 연락처가 섞인'));
  assert.ok(!result.includes('재점검의 개인 사유'));
  assert.ok(!result.includes('자재 반입 일정 변경'));
  assert.ok(!result.includes('a'.repeat(64)));
  assert.ok(result.includes('2026-11-07'));
  assert.ok(result.includes('2026-11-01'));
 }
 assert.ok(html.includes("default-src 'none'"));
 const handoff=formatLocalHandoffMessage(buildLocalHandoffPlan([record],fixed));
 assert.ok(!handoff.includes('합성 개인담당자'));
 assert.ok(handoff.includes('작업 재개'));
});
check('Report controls and stale-history comparison remain explicitly opt-in',()=>{
 assert.match(ui,/reportIncludeProgress,setReportIncludeProgress]=useState\(false\)/);
 assert.match(ui,/includeProgress:reportIncludeProgress/);
 assert.match(ui,/JSON\.stringify\(oldReport\.progress\)!==JSON\.stringify\(verifiedReport\.progress\)/);
 assert.match(ui,/reportToken!==reportGeneration\.current/);
 assert.match(ui,/aria-label="보고서에 F10 경과 연결 이력 포함"/);
 assert.match(qa,/await f10Report\.getByLabel\('보고서에 F10 경과 연결 이력 포함'\)\.check\(\)/);
});
check('Local camera QA retains actual browser backup and offline zero-network assertions',()=>{
 assert.match(qa,/context\.setOffline\(true\)/);
 assert.match(qa,/setInputFiles\(/);
 assert.match(qa,/assert\.deepEqual\(requests,\[\]/);
 assert.match(qa,/await f10Report\.getByRole\('button',\{name:'CSV·인쇄용 보고서 준비'\}\)\.click\(\)/);
});
check('Read-only integration never mutates original follow-up and recheck arrays',()=>{
 buildLocalRecheckProgress(record);
 buildLocalRecheckReport(buildLocalRecheckQueue([record],fixed),[record],{
  includeProgress:true,includeDetails:true,
 });
 assert.equal(JSON.stringify(record),recordBefore);
});

const failed=checks.filter(entry=>!entry.ok);
const result={
 type:'field-camera-release-candidate-preflight',
 scope:'F01–F10 / GitHub PR #201–#206 integration candidate',
 automatedGate:failed.length?'FAILED':'PASSED',
 checks,
 deployment:{
  authorized:false,
  mainMergePerformed:false,
  productionReleasePerformed:false,
  liveProductionShaVerifiedByThisScript:false,
  realAndroidTrialVerified:false,
  actualSiteSafetyApproval:false,
 },
 limitations:[
  'GitHub PR ancestry, remote CI completion and the live Vercel SHA require separate read-only API verification.',
  'This script cannot prove site measurements, personally identified human confirmations or actual photo provenance.',
 ],
};
console.log(JSON.stringify(result,null,2));
if(failed.length)process.exitCode=1;
