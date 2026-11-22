/**
 * L35 P1 evidence trace. Source/Wiring audit only; never grants a release.
 * Browser mode is deliberately run AFTER the existing L18 browser evidence gate.
 * All data is source/config/synthetic CI output. No network, secrets or real workers.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const args=new Set(process.argv.slice(2));
const browser=args.has('--browser-evidence');
assert.equal(Number(browser)+Number(args.has('--source-only')),1,
 'Choose exactly one --source-only or --browser-evidence');
const read=path=>readFile(path,'utf8');
const json=async path=>JSON.parse(await read(path));
const config=await json('config/psi-living-ui-p1-evidence-trace.json');
const release=await json('config/psi-living-ui-release-acceptance.json');
const auth=await json('config/psi-l06-isolated-auth-acceptance-ledger.json');
const companyWorkflow=await read('.github/workflows/psi-company-wide.yml');
const releaseWorkflow=await read('.github/workflows/verify.yml');
const inspectorWorkflow=await read('.github/workflows/inspector-mobile-browser.yml');
const companyScenarios=await read('scripts/verify-psi-company-browser.mjs');
const packageInfo=await json('package.json');
const handoff=await read('docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md');
const checks=[];
const check=(id,passed,description)=>checks.push({id,status:passed?'PASS':'FAIL',description});
assert.equal(config.schema,'psi-living-ui-p1-evidence-trace-v1');
assert.equal(config.product,'NEW-PSI');
assert.equal(config.repository,'TELLOWSS/NEW-PSI');
assert.equal(config.candidatePr,237);
assert.ok(Array.isArray(config.areas)&&config.areas.length===19,'L00-L18 all required');
const expected=Array.from({length:19},(_,index)=>'L'+String(index).padStart(2,'0'));
const found=config.areas.map(item=>item.id);
assert.deepEqual(found,expected,'L00-L18 must be complete, ordered, unique and unchanged');
const runners=new Set(['policy','release-vitest','company-direct','company-scenarios','inspector-direct','release-direct']);
const allowedRoot=/^(docs|tests|scripts)\/[a-zA-Z0-9/_\.\-]+$/;
for(const area of config.areas){
 assert.ok(typeof area.area==='string'&&area.area.length>=4,'Missing area name: '+area.id);
 assert.ok(typeof area.unverified==='string'&&area.unverified.length>=12,
  'Manual/real-use limitation must be explicit: '+area.id);
 assert.ok(runners.has(area.runner),'Unsupported runner: '+area.id);
 assert.ok(allowedRoot.test(area.source)&&!area.source.includes('..'),
  'Source must be a checked-in safe relative path: '+area.id);
 let exists=false;
 try{exists=(await read(area.source)).length>100;}catch{exists=false;}
 check(area.id+':source',exists,'Existing versioned source, not a claimed passing test');
 let wired=false;
 switch(area.runner){
 case 'policy':
  wired=area.source==='docs/PSI_LIVING_UI_MASTER_HANDOFF_20261121.md' &&
   handoff.includes('| '+area.id+' |');break;
 case 'release-vitest':
  wired=area.source.endsWith('.test.ts') &&
   releaseWorkflow.includes('npm run verify:ci') &&
   packageInfo.scripts['verify:ci'].includes('npm run test:ci') &&
   packageInfo.scripts['test:ci'].includes('vitest run');break;
 case 'company-direct':
  wired=companyWorkflow.includes('node '+area.source);break;
 case 'company-scenarios':
  wired=companyWorkflow.includes('node scripts/verify-psi-company-browser.mjs') &&
   companyScenarios.includes("script:'"+area.source+"'");break;
 case 'inspector-direct':
  wired=inspectorWorkflow.includes('node '+area.source);break;
 case 'release-direct':
  wired=releaseWorkflow.includes('node '+area.source);break;
 }
 check(area.id+':ci-wiring',wired,
  'Tracks an existing CI invocation path; does not verify real device, database or humans');
}
check('l18:release-source-check',
 releaseWorkflow.includes('node scripts/verify-psi-l18-release-gate.mjs --source-only') &&
 companyWorkflow.includes('node scripts/verify-psi-l18-release-gate.mjs --browser-evidence'),
 'The existing independent L18 release barrier remains authoritative');
check('l06:isolated-auth-consent',
 auth.environment?.approved===true ||
 (auth.environment?.approved===false && auth.cases.every(item=>item.status==='not-run')),
 'If isolated project is not approved, all auth cases must remain NOT RUN');
check('l18:human-evidence-register',release.gates?.length===13 &&
 release.gates.every(item=>['pending','reviewed-with-evidence'].includes(item.status)),
 'The 13 real-world human review gates cannot be replaced by CI checks');
// L36: P1-P5 status must be derived from the *existing* independent ledgers.
// Gate mapping is complete and non-overlapping; do not create a second approval system.
const workstreamIds=['P2','P3','P4','P5'];
const mapped=workstreamIds.flatMap(id=>config.workstreamGateIds?.[id]||[]);
const humanIds=release.gates.map(g=>g.id);
check('program:human-gate-map-complete',
 workstreamIds.every(id=>Array.isArray(config.workstreamGateIds?.[id]) &&
   config.workstreamGateIds[id].length>0) &&
 mapped.length===humanIds.length &&
 mapped.every(id=>humanIds.includes(id)) &&
 humanIds.every(id=>mapped.includes(id)),
 'P2-P5 must account for all L18 human gates without omission');
check('program:human-gate-map-no-duplicates',
 new Set(mapped).size===mapped.length &&
 Object.keys(config.workstreamGateIds||{}).sort().join(',')===workstreamIds.join(','),
 'Each real-world acceptance gate has exactly one primary workstream');
check('program:source-trace-not-acceptance',
 config.workstreamReadinessNotice?.includes('NOT automatic completion') &&
 typeof config.workstreams?.P1==='string' &&
 typeof config.workstreams?.P5==='string',
 'The five workstreams cannot be declared completed by source trace or synthetic CI');
const gateById=new Map(release.gates.map(g=>[g.id,g]));
const readinessByStream=Object.fromEntries(workstreamIds.map(id=>{
 const items=(config.workstreamGateIds?.[id]||[]).map(gateId=>gateById.get(gateId)).filter(Boolean);
 return [id,{
  mappedHumanGates:items.length,
  humanPending:items.filter(g=>g.status==='pending').length,
  humanReviewedWithEvidence:items.filter(g=>g.status==='reviewed-with-evidence').length,
  postDeployPending:items.filter(g=>g.phase==='post-deploy'&&g.status==='pending').length,
  realWorldAcceptance:'REQUIRES_INDEPENDENT_REVIEW',
 }];
}));
readinessByStream.P2.isolatedAuthEnvironmentApproved=auth.environment?.approved===true;
readinessByStream.P2.isolatedAuthCases=auth.cases.length;
readinessByStream.P2.isolatedAuthNotRun=auth.cases.filter(c=>c.status==='not-run').length;
readinessByStream.P2.isolatedAuthPassStamped=auth.cases.filter(c=>c.status==='pass').length;
const humanPending=release.gates.filter(g=>g.status==='pending');
const postDeployPending=humanPending.filter(g=>g.phase==='post-deploy');
const authNotRun=auth.cases.filter(c=>c.status==='not-run');
const report={
 schema:'psi-living-ui-p1-evidence-result-v1',
 candidateHead:process.env.GITHUB_SHA||null,
 generatedAt:new Date().toISOString(),
 scope:browser?'source paths + CI wiring + existing L18 synthetic browser artifact':'source paths + CI wiring only',
 sourceTraceCount:config.areas.length,
 workstreamReadiness:{
  P1:{sourceAndCiPathsTraced:config.areas.length,expectedAreas:19,realWorldAcceptance:'UNVERIFIED'},
  ...readinessByStream,
 },
 sourceOnly:!browser,
 checks,
 humanGatePending:humanPending.length,
 postDeployHumanPending:postDeployPending.length,
 isolatedAuthApproved:auth.environment?.approved===true,
 isolatedAuthNotRun:authNotRun.length,
 manualAndLiveScope:'UNVERIFIED: Android, Samsung Internet, actual zoom/AT, 11 native languages, field A4/receipt, isolated RLS, HTTP headers, OSS commercial terms and owner approval',
 authorizesRelease:false,
};
if(browser){
 const evidence=await json('artifacts/audit/psi-l18-release-gate/browser-evidence.json');
 check('l18:browser-synthetic-evidence',
  evidence.automationStatus==='SYNTHETIC_PASS' &&
  evidence.syntheticBrowserEvaluated===true &&
  evidence.releaseAuthorizedByThisJob===false,
  'Existing L18 independently aggregates synthetic Chromium; not Android or real worker evidence');
 check('l18:human-blocker-consistency',
  evidence.humanBlockers?.length===humanPending.filter(g=>g.phase!=='post-deploy').length &&
  evidence.postDeployPending?.length===postDeployPending.length,
  'Same pending human blockers must remain visible in L18 browser evidence');
 report.existingL18Automation=evidence.automationStatus;
}
report.automationStatus=checks.every(item=>item.status==='PASS') ?
 (browser?'SYNTHETIC_TRACE_PASS':'SOURCE_TRACE_PASS'):'FAIL';
const out='artifacts/audit/psi-p1-evidence/'+(browser?'browser-evidence.json':'source-only.json');
await mkdir('artifacts/audit/psi-p1-evidence',{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log('[PSI P1-P5/L36] AUTH_NOT_RUN='+readinessByStream.P2.isolatedAuthNotRun+
 '; HUMAN_PENDING_BY_STREAM='+workstreamIds.map(id=>id+':'+readinessByStream[id].humanPending).join(',')+
 '; NONE_OF_THESE_COUNTS_AUTHORIZE_RELEASE');
console.log('[PSI P1/L35] '+report.automationStatus+
 '; SOURCES='+report.sourceTraceCount+'/19; AUTH_NOT_RUN='+authNotRun.length+
 '; HUMAN_PENDING='+humanPending.length+'; RELEASE_AUTHORIZED=false');
if(report.automationStatus==='FAIL'){
 for(const item of checks.filter(x=>x.status==='FAIL'))console.error('[PSI P1/L35 FAIL] '+item.id+': '+item.description);
 process.exitCode=1;
}
