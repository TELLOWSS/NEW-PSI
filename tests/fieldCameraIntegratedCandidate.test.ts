import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 RELEASE_CANDIDATE_KIND,RELEASE_CANDIDATE_STAGES,RELEASE_REQUIRED_CI,
 RELEASE_CANDIDATE_COMMON_FILES,assembleSourceCandidate,assertSourceOnlyManifest,
} from '../scripts/check-field-camera-integrated-candidate-32.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');

describe('32nd source-only F01–F10 integration release candidate',()=>{
 it('covers 25–32 in order and includes all common build/CI/privacy contracts',()=>{
  const m=assembleSourceCandidate();
  expect(m.kind).toBe(RELEASE_CANDIDATE_KIND);
  expect(m.stages.map(x=>x.stage)).toEqual([25,26,27,28,29,30,31,32]);
  expect(m.sourceFileCount).toBeGreaterThanOrEqual(20);
  expect(m.sources.map(x=>x.path)).toEqual([...m.sources.map(x=>x.path)].sort());
  expect(new Set(m.sources.map(x=>x.path)).size).toBe(m.sourceFileCount);
  for(const path of RELEASE_CANDIDATE_COMMON_FILES)
   expect(m.sources.some(row=>row.path===path)).toBe(true);
  for(const stage of RELEASE_CANDIDATE_STAGES)
   for(const path of stage.files)
    expect(m.sources.some(row=>row.path===path)).toBe(true);
  expect(m.requiredCI).toEqual(RELEASE_REQUIRED_CI);
  expect(assertSourceOnlyManifest(m)).toBe(true);
 });
 it('creates stable sha256 manifest without photos, credentials or user data',()=>{
  const first=assembleSourceCandidate(),again=assembleSourceCandidate();
  expect(first).toEqual(again);
  const material=first.sources.map(x=>x.path+'\0'+x.sha256).join('\n');
  expect(first.sourceFingerprintSha256).toBe(digest(material));
  expect(first.sourceFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  for(const src of first.sources){
   expect(src.sha256).toBe(digest(read(src.path)));
   expect(src.path).not.toMatch(/(?:\.env|artifacts|node_modules|\/dist\/|secrets)/);
  }
  expect(first.mainMerged).toBe(false);
  expect(first.productionDeployed).toBe(false);
  expect(first.realDeviceVerified).toBe(false);
  expect(JSON.stringify(first)).not.toContain('PRIVATE PHOTO BYTES');
 });
 it('fails closed on missing stage or unsafe relative paths',()=>{
  expect(()=>assembleSourceCandidate({stages:RELEASE_CANDIDATE_STAGES.slice(0,-1)}))
   .toThrow('25~32차');
  for(const unsafe of ['../../.env','../../package.json','private/keys','artifacts/audit/file.json']){
   expect(()=>assembleSourceCandidate({
    commonFiles:[...RELEASE_CANDIDATE_COMMON_FILES,unsafe],
   })).toThrow('경로 형식');
  }
 });
 it('fails closed if verified build or registered offline QA gate is removed',()=>{
  expect(()=>assembleSourceCandidate({
   read:path=>path==='vercel.json'
    ?JSON.stringify({...JSON.parse(read(path)),buildCommand:'npm run build'})
    :read(path),
  })).toThrow();
  expect(()=>assembleSourceCandidate({
   read:path=>path==='.github/workflows/inspector-mobile-browser.yml'
    ?read(path).replace('node scripts/verify-inspector-local-offline.mjs','node scripts/fake-qa.mjs')
    :read(path),
  })).toThrow();
  expect(()=>assembleSourceCandidate({
   read:path=>path==='package.json'
    ?read(path).replace('npm run check:field-camera-integrated-candidate','npm run check:disabled')
    :read(path),
  })).toThrow();
 });
 it('refuses falsely claimed production deployment or field approval',()=>{
  const manifest=assembleSourceCandidate();
  for(const field of ['mainMerged','productionDeployed','realDeviceVerified']){
   expect(()=>assertSourceOnlyManifest({...manifest,[field]:true})).toThrow();
  }
  expect(()=>assertSourceOnlyManifest({...manifest,releaseStatus:'APPROVED'})).toThrow();
  expect(()=>assertSourceOnlyManifest({...manifest,requiredCI:[]})).toThrow();
 });
});
