/** L18 independent evidence aggregation. No external requests, approvals, deployments or data writes beyond synthetic audit JSON.
 * Source-only mode runs in release CI; browser mode runs after independent synthetic Chromium steps.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const args=new Set(process.argv.slice(2));
const browser=args.has('--browser-evidence');
const sourceOnly=args.has('--source-only');
if(Number(browser)+Number(sourceOnly)!==1)throw Error('Choose exactly one: --browser-evidence or --source-only');
const read=async path=>readFile(path,'utf8');
const json=async path=>JSON.parse(await read(path));
const config=await json('config/psi-living-ui-release-acceptance.json');
const mandatory=[
'L06-worker-q1-q5-direct-submission','L08-L14-android-photo-pwa','L10-native-languages-a4',
'L15-real-zoom-accessibility','L16-real-offline-radio-battery','L09-actual-action-deferred-verification',
'L11-L12-real-reports-receipt','L17-rbac-supabase-tenant-rls','L17-real-http-privacy-headers',
'L17-oss-commercial-hosting','L18-independent-release-review','L18-product-owner-explicit-approval',
'L18-production-post-deploy-validation',
];
assert.equal(config.schema,'psi-living-ui-release-acceptance-v1');
assert.equal(config.project,'NEW-PSI');
assert.equal(config.repository,'TELLOWSS/NEW-PSI');
assert.equal(config.candidatePr,237);
assert.ok(Array.isArray(config.gates));
assert.equal(config.gates.length,mandatory.length,'Do not silently drop or add human release gates');
const ids=new Set(config.gates.map(g=>g.id));
assert.equal(ids.size,mandatory.length,'Duplicate release gate IDs');
for(const id of mandatory)assert.ok(ids.has(id),'Missing required release gate: '+id);
const blocked=[];
const postDeployPending=[];
for(const gate of config.gates){
 assert.ok(['pending','reviewed-with-evidence'].includes(gate.status),'Unexpected gate status: '+gate.id);
 const phase=gate.phase||'pre-release';
 assert.ok(['pre-release','post-deploy'].includes(phase),'Invalid gate phase: '+gate.id);
 if(phase==='post-deploy')assert.equal(gate.id,'L18-production-post-deploy-validation','Only final deployment validation may be post-deploy');
 assert.ok(typeof gate.description==='string'&&gate.description.length>=12,'Missing gate scope: '+gate.id);
 assert.ok(['product-ux','design','platform','safety-ai','security','qa','owner'].includes(gate.reviewer),'Unknown reviewer: '+gate.id);
 if(gate.status==='pending'){
  assert.equal(gate.evidence,null,'Pending gate cannot claim evidence: '+gate.id);
  (phase==='post-deploy'?postDeployPending:blocked).push({id:gate.id,area:gate.area,reason:gate.description});
 }else{
  const evidence=gate.evidence;
  assert.ok(evidence && typeof evidence==='object' && !Array.isArray(evidence),'Evidence record required: '+gate.id);
  assert.ok(/^https:\/\/[^\s]+/.test(evidence.url||''),'Review evidence must be HTTPS URL: '+gate.id);
  assert.ok(typeof evidence.reviewedAt==='string'&&Number.isFinite(Date.parse(evidence.reviewedAt)),'Review timestamp required: '+gate.id);
  assert.ok(typeof evidence.reviewerRole==='string'&&evidence.reviewerRole===gate.reviewer,'Reviewer role mismatch: '+gate.id);
 }
}
const steps=[];
const check=(name,passed,detail)=>steps.push({name,status:passed?'PASS':'FAIL',detail});
const releaseWorkflow=await read('.github/workflows/verify.yml');
const companyWorkflow=await read('.github/workflows/psi-company-wide.yml');
const inspectorWorkflow=await read('.github/workflows/inspector-mobile-browser.yml');
for(const [needle,source] of [
 ['npm run verify:ci',releaseWorkflow],
 ['node scripts/verify-psi-l17-security.mjs',releaseWorkflow],
 ['node scripts/verify-psi-l15-accessibility.mjs',companyWorkflow],
 ['node scripts/verify-psi-l16-resilience.mjs',companyWorkflow],
 ['node scripts/verify-psi-l18-release-gate.mjs --browser-evidence',companyWorkflow],
 ['node scripts/verify-inspector-offline-reopen.mjs',inspectorWorkflow],
 ['node scripts/verify-inspector-unfinished-recovery.mjs',inspectorWorkflow],
]){
 check('coverage:'+needle,source.includes(needle),'Required verification must remain wired into CI');
}
const audit={schema:'psi-l18-readiness-evidence-v1',headSha:process.env.GITHUB_SHA||null,sourceOnly:!browser,syntheticBrowserEvaluated:browser,generatedAt:new Date().toISOString(),
 evidence:{},checks:steps,humanGateTotal:config.gates.length,humanBlockers:blocked,productOwnerApproved:config.gates.find(g=>g.id==='L18-product-owner-explicit-approval')?.status==='reviewed-with-evidence',
 postDeployPending,releaseAuthorizedByThisJob:false,mainMerged:null,productionReleased:null};
if(browser){
 const company=await json('artifacts/audit/psi-company/cross-module-browser.json');
 const workspace=await json('artifacts/audit/psi-platform-workspaces/result.json');
 const access=await json('artifacts/audit/psi-l15-accessibility/result.json');
 const offline=await json('artifacts/audit/psi-l16-resilience/result.json');
 const security=await json('artifacts/audit/psi-l17-security/result.json');
 check('company-synthetic-7-journeys',company.status==='PASS'&&company.syntheticOnly===true&&company.realWorkerRecords===false&&company.plannedScenarios===7&&company.completedScenarios===7&&company.results.every(x=>x.status==='PASS'),'7 synthetic cross-product journeys, no real worker records');
 check('education-ocr-report-workspaces',workspace.result==='PASS'&&Array.isArray(workspace.checks)&&workspace.checks.length>=4,'Independent education, OCR, A4 and reports browser evidence');
 check('l15-accessibility-8-viewports',access.result==='PASS'&&Array.isArray(access.checks)&&access.checks.length===8,'8 synthetic layouts, not real 200% zoom or Android');
 const stages=offline.evidence||[];
 check('l16-offline-record-recovered',offline.result==='PASS'&&stages.some(e=>e.stage==='offline-local-save-and-reopen'&&e.recordCount===1),'Local record survived offline restart');
 check('l16-network-no-autosync',offline.result==='PASS'&&stages.some(e=>e.stage==='reconnected-no-automatic-cloud-sync'&&e.networkCalls===0),'No automatic API/third-party calls on reconnect within synthetic scope');
 check('l17-source-security',security.passed===true&&security.sourceOnly===true&&security.checks.length>=19&&security.checks.every(x=>x.status==='PASS'),'Source-only security gate, not live RLS');
 audit.evidence={company:{status:company.status,scenarios:company.completedScenarios},workspaces:{status:workspace.result,cases:workspace.checks.length},
  accessibility:{status:access.result,cases:access.checks.length},offline:{status:offline.result,stages:stages.map(x=>x.stage)},
  security:{status:security.passed?'PASS':'FAIL',checks:security.checks.length}};
}
audit.checks=steps;
audit.automationStatus=steps.every(s=>s.status==='PASS') ? (browser?'SYNTHETIC_PASS':'SOURCE_CONTRACT_PASS'):'FAIL';
audit.releaseDecision=blocked.length?'BLOCKED': 'HUMAN_REVIEW_REQUIRED';
audit.reviewNote='Release cannot be approved by source code or synthetic CI alone; final HEAD CI parity, user approval, main/Production SHA and real device/security evidence require separate live checks.';
const out='artifacts/audit/psi-l18-release-gate/'+(browser?'browser-evidence.json':'source-only.json');
await mkdir('artifacts/audit/psi-l18-release-gate',{recursive:true});
await writeFile(out,JSON.stringify(audit,null,2)+'\n');
console.log('[PSI L18] '+audit.automationStatus+'; RELEASE='+audit.releaseDecision+'; pre-release blockers='+blocked.length+'; post-deploy pending='+postDeployPending.length+'; synthetic='+browser);
for(const item of blocked)console.log('[PSI L18 BLOCK] '+item.id);
for(const item of postDeployPending)console.log('[PSI L18 POST-DEPLOY PENDING] '+item.id);
if(audit.automationStatus==='FAIL')process.exitCode=1;
