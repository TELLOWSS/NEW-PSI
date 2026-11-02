import {describe,it,expect} from 'vitest';
import {diagnoseLocalUnfinishedSlots,LOCAL_RECOVERY_KEYS} from '../lib/inspector/localUnfinishedRecoveryTriage.mjs';
import {LOCAL_INPUT_DRAFT_KEY} from '../lib/inspector/localInputDraft.mjs';
import {SINGLE_PHOTO_DRAFT_KEY} from '../lib/inspector/localSinglePhotoDraft.mjs';

const id='00000000-0000-4000-8000-000000000001';
const photo=(contents,name='photo.png')=>new File([contents],name,{type:'image/png',lastModified:1710000000000});
const sha=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())))
 .map(v=>v.toString(16).padStart(2,'0')).join('');
const input=()=>({id:LOCAL_INPUT_DRAFT_KEY,kind:'inspection-input-draft',revision:id,
 savedAt:'2026-11-02T04:30:00.000Z',note:'합성 위험요소',action:'임시 통제',
 photoRole:'overview',siteContext:{site:'가상 현장',building:'2001',level:'16F',trade:'형틀'}});
const single=async()=>{const f=photo('original pixels');return {id:SINGLE_PHOTO_DRAFT_KEY,kind:'single-photo-draft',
 revision:id,savedAt:'2026-11-02T04:30:00.000Z',photo:f,sha256:await sha(f),source:'file-picker',edit:null};};
const sequence=()=>({id:'psi-photo-set-draft-v1',kind:'photo-set-draft',revision:id,
 photos:[photo('overview','overview.png'),photo('detail','detail.png')]});
const records=(a,b,c)=>Object.fromEntries([[LOCAL_RECOVERY_KEYS[0],a],[LOCAL_RECOVERY_KEYS[1],b],[LOCAL_RECOVERY_KEYS[2],c]]);
describe('F08-44 human-safe read-only local restore triage',()=>{
 it('reports empty as unknown, never claims records were deleted',async()=>{
  const result=await diagnoseLocalUnfinishedSlots({});
  expect(result.state).toBe('empty');
  expect(result.stored).toBe(0);
  expect(result.canExportStored).toBe(false);
  expect(result.guidance).toContain('보이지 않습니다');
 });
 it('distinguishes valid checkpoint, unverifiable text and old sequence with no baseline',async()=>{
  const data=await diagnoseLocalUnfinishedSlots(records(input(),await single(),undefined));
  expect(data.state).toBe('recoverable');
  expect(data.canExportStored).toBe(true);
  expect(data.results.map(x=>x.state)).toEqual(['limited','verified','empty']);
  const seq=await diagnoseLocalUnfinishedSlots(records(undefined,undefined,sequence()));
  expect(seq.results[2].state).toBe('limited');
  expect(seq.results[2].detail).toContain('출처 비교값이 없어');
 });
 it('does not pick or auto-delete between two simultaneously stored photo drafts',async()=>{
  const data=await diagnoseLocalUnfinishedSlots(records(input(),await single(),sequence()));
  expect(data.state).toBe('mixed');
  expect(data.canExportStored).toBe(true);
  expect(data.guidance).toContain('임의로 선택하지 마세요');
 });
 it('detects identical revision, name and file size with different single-photo bytes',async()=>{
  const source=await single();
  const changed=photo('Original pixels');
  expect(changed.size).toBe(source.photo.size);
  const data=await diagnoseLocalUnfinishedSlots(records(input(),{...source,photo:changed},undefined));
  expect(data.state).toBe('attention');
  expect(data.results[1].state).toBe('invalid');
  expect(data.canExportStored).toBe(false);
 });
 it('does not export partial unverified backups when input is malformed',async()=>{
  const data=await diagnoseLocalUnfinishedSlots(records({...input(),note:7},await single(),sequence()));
  expect(data.state).toBe('attention');
  expect(data.results[0].state).toBe('invalid');
  expect(data.canExportStored).toBe(false);
  expect(data.guidance).toContain('자동 삭제하지 마세요');
 });
 it('checks sequence camera provenance hashes and damaged rotation references',async()=>{
  const seq=sequence(),a=await sha(seq.photos[0]),b=await sha(seq.photos[1]);
  seq.sources=[{source:'camera-dialog',sha256:a,recordedAt:'2026-11-02T04:30:00.000Z'},
   {source:'camera-dialog',sha256:b,recordedAt:'2026-11-02T04:30:01.000Z'}];
  const good=await diagnoseLocalUnfinishedSlots(records(undefined,undefined,seq));
  expect(good.results[2].state).toBe('verified');
  const damaged=await diagnoseLocalUnfinishedSlots(records(undefined,undefined,{
   ...seq,photos:[seq.photos[0],photo('detaIl','detail.png')],
  }));
  expect(damaged.results[2].state).toBe('invalid');
  expect(damaged.canExportStored).toBe(false);
 });
});
