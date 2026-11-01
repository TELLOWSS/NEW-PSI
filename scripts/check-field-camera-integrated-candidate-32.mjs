/**
 * NEW-PSI F01–F10 integrated release candidate (32차).
 *
 * Offline, deterministic, read-only audit over SOURCE FILES.
 * Emits SHA-256 fingerprints to help humans review exactly the build source.
 * This is never an authorization to merge, deploy, promote or resume work.
 *
 * Do not add files containing worker data, local photos, keys, env files or
 * build artifacts here. All input paths below are repository source files.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import assert from 'node:assert/strict';

export const RELEASE_CANDIDATE_KIND='psi-f01-f10-integrated-source-candidate-v1';
export const RELEASE_CANDIDATE_STAGES=[
 {stage:25,topic:'F06 촬영 증빙 공유 전 무결성',
  files:['lib/inspector/fieldPhotoDelivery.ts','tests/fieldCameraDeliveryPreflight.test.ts','scripts/verify-field-camera-delivery-preflight.mjs']},
 {stage:26,topic:'F10 재점검 기한 우선순위',
  files:['lib/inspector/localRecheckQueue.mjs','tests/localRecheckQueue.test.ts']},
 {stage:27,topic:'F10 관리 CSV/A4 개인정보 최소화',
  files:['lib/inspector/localRecheckReport.mjs','tests/localRecheckReport.test.ts']},
 {stage:28,topic:'F10 현장 인계서 사용자 직접 복사',
  files:['lib/inspector/localRecheckHandoff.mjs','tests/localRecheckHandoff.test.ts']},
 {stage:29,topic:'F10 목표기한·임시통제 변경 추적',
  files:['lib/inspector/localFollowupChangeTrace.mjs','tests/localFollowupChangeTrace.test.ts']},
 {stage:30,topic:'F10 경과 타임라인과 선택형 내보내기',
  files:['lib/inspector/localRecheckProgress.mjs','tests/localRecheckProgress.test.ts','tests/localRecheckReportProgress.test.ts']},
 {stage:31,topic:'누적 기능 릴리스 관문 및 저장 이력 경합 QA',
  files:['scripts/check-field-camera-release-preflight-31.mjs','docs/safety-inspector/FIELD_CAMERA_RELEASE_CANDIDATE_31_20261101.md']},
 {stage:32,topic:'단일 통합 릴리스 후보의 읽기 전용 출처 증명',
  files:['scripts/check-field-camera-integrated-candidate-32.mjs','docs/safety-inspector/FIELD_CAMERA_INTEGRATED_RELEASE_32_20261101.md']},
];

export const RELEASE_CANDIDATE_COMMON_FILES=[
 'components/inspector/InspectorLocalDraft.tsx',
 'pages/FieldCamera.tsx',
 'scripts/verify-inspector-local-offline.mjs',
 '.github/workflows/verify.yml',
 '.github/workflows/psi-company-wide.yml',
 '.github/workflows/inspector-mobile-browser.yml',
 'vite.config.ts','vercel.json','package.json','package-lock.json',
];

export const RELEASE_REQUIRED_CI=[
 'PSI release verification',
 'PSI company-wide cross-department verification',
 'PSI inspector mobile browser QA',
];

const readText=(file,read)=>read(file);
const digest=data=>createHash('sha256').update(data,'utf8').digest('hex');
const repoFile=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');

/** Pure helper for independent tests with a synthetic in-memory source tree. */
export function assembleSourceCandidate({read=repoFile,stages=RELEASE_CANDIDATE_STAGES,
  commonFiles=RELEASE_CANDIDATE_COMMON_FILES}={}){
 assert.equal(stages.length,8,'25~32차 8개 범위가 필요합니다.');
 assert.deepEqual(stages.map(s=>s.stage),[25,26,27,28,29,30,31,32]);
 const files=[...new Set([...stages.flatMap(s=>s.files),...commonFiles])].sort();
 assert.ok(files.length>=20,'통합 후보에서 필요한 파일이 빠졌습니다.');
 for(const file of files){
  const segments=file.split('/');
  const validPath=/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(file) &&
   segments.every(segment=>segment!=='.'&&segment!=='..') &&
   !/(^|\/)(?:\.env|node_modules|dist|artifacts|private|secrets)(?:\/|$)/i.test(file);
  if(!validPath)throw new Error('검증 파일의 경로 형식이 잘못됐습니다. 저장소 밖 경로나 비공개 파일을 포함할 수 없습니다.');
 }
 const sources=files.map(path=>{
  const content=readText(path,read);
  assert.equal(typeof content,'string',path+' 내용이 문자 자료가 아닙니다.');
  assert.ok(content.length>0,path+' 빈 파일을 허용하지 않습니다.');
  return {path,sha256:digest(content)};
 });
 const get=relative=>readText(relative,read);
 const packageJson=JSON.parse(get('package.json'));
 const vercel=JSON.parse(get('vercel.json'));
 const releaseWorkflow=get('.github/workflows/verify.yml');
 const productWorkflow=get('.github/workflows/psi-company-wide.yml');
 const mobileWorkflow=get('.github/workflows/inspector-mobile-browser.yml');
 assert.equal(vercel.buildCommand,'npm run build:verified');
 assert.match(packageJson.scripts['verify:fast'],/npm run check:field-camera-release-preflight/);
 assert.match(packageJson.scripts['verify:fast'],/npm run check:field-camera-integrated-candidate/);
 assert.match(packageJson.scripts['verify:ci'],/npm run test:ci/);
 assert.match(packageJson.scripts['verify:ci'],/npm run build/);
 assert.match(releaseWorkflow,/npm run verify:ci/);
 assert.match(productWorkflow,/node scripts\/verify-field-camera-delivery-preflight\.mjs/);
 assert.match(mobileWorkflow,/node scripts\/verify-inspector-local-offline\.mjs/);
 assert.match(get('scripts/verify-inspector-local-offline.mjs'),
  /stale F10 history must not become a downloadable CSV/);
 assert.match(get('components/inspector/InspectorLocalDraft.tsx'),
  /JSON\.stringify\(oldReport\.progress\)!==JSON\.stringify\(verifiedReport\.progress\)/);
 const fingerprint=digest(sources.map(row=>row.path+'\0'+row.sha256).join('\n'));
 return {
  kind:RELEASE_CANDIDATE_KIND,
  scope:'F01–F10 camera; 25–32차 single integration review',
  // No tokens, credentials, photo metadata, personal safety entries or hashes of private photos.
  sourceFingerprintSha256:fingerprint,
  sourceFileCount:sources.length,
  sources,stages:stages.map(stage=>({stage:stage.stage,topic:stage.topic,files:stage.files})),
  requiredCI:RELEASE_REQUIRED_CI,
  releaseStatus:'REVIEW_CANDIDATE_ONLY',
  mainMerged:false,
  productionDeployed:false,
  realDeviceVerified:false,
  acceptance:{
   ci:'CHECK_REMOTELY_AT_THE_EXACT_PR_HEAD',
   main:'RECHECK_LIVE_MAIN_AND_ANCESTRY',
   production:'RECHECK_ALIAS_SHA_AND_READY',
   android:'REAL_ANDROID_AND_SAMSUNG_INTERNET_NOT_CONFIRMED',
   operator:'HUMAN_APPROVAL_AND_MANUAL_BACKUP_REQUIRED',
  },
 };
}

/**
 * This manifest certifies only local repository contents. No caller is allowed
 * to turn it into a production-approval record by changing flags.
 */
export function assertSourceOnlyManifest(manifest){
 assert.equal(manifest?.kind,RELEASE_CANDIDATE_KIND);
 assert.equal(manifest?.releaseStatus,'REVIEW_CANDIDATE_ONLY');
 assert.equal(manifest?.mainMerged,false);
 assert.equal(manifest?.productionDeployed,false);
 assert.equal(manifest?.realDeviceVerified,false);
 assert.deepEqual(manifest?.requiredCI,RELEASE_REQUIRED_CI);
 return true;
}

export function writeSourceCandidate(path='artifacts/audit/field-camera/32-integration-source-manifest.json'){
 const manifest=assembleSourceCandidate();
 assertSourceOnlyManifest(manifest);
 const target=resolve(path);
 mkdirSync(dirname(target),{recursive:true});
 writeFileSync(target,JSON.stringify(manifest,null,2)+'\n',{flag:'w',mode:0o600});
 return manifest;
}

const invoked=process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname;
if(invoked){
 try{
  const result=writeSourceCandidate();
  console.log('[F01–F10 integration] PASS '+result.sourceFileCount+' source files; fingerprint '+result.sourceFingerprintSha256.slice(0,16));
  console.log('[F01–F10 integration] NOT DEPLOYED — manifest saved to artifacts/audit/field-camera/32-integration-source-manifest.json');
 }catch(error){
  console.error('[F01–F10 integration] FAIL: '+(error?.message||String(error)));
  process.exitCode=1;
 }
}
