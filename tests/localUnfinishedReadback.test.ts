import {describe,it,expect} from 'vitest';
import {packUnfinishedBackup,unpackUnfinishedBackup,verifyUnfinishedRestoreReadback}
 from '../lib/inspector/localUnfinishedBackup.mjs';
import {LOCAL_INPUT_DRAFT_KEY} from '../lib/inspector/localInputDraft.mjs';
import {SINGLE_PHOTO_DRAFT_KEY} from '../lib/inspector/localSinglePhotoDraft.mjs';

const id='00000000-0000-4000-8000-000000000005';
const file=(content,name='test.png')=>new File([content],name,{type:'image/png',lastModified:1720000000000});
const hex=async f=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer())))
 .map(b=>b.toString(16).padStart(2,'0')).join('');
const input=()=>({id:LOCAL_INPUT_DRAFT_KEY,kind:'inspection-input-draft',revision:id,
 savedAt:'2026-11-02T04:00:00.000Z',note:'발판 이격 실측 필요',action:'접근통제·담당 지정',
 photoRole:'detail',siteContext:{site:'합성 현장',building:'2001동',level:'16F',trade:'형틀'}});
const photo=async()=>{const p=file('same-image-size');return {id:SINGLE_PHOTO_DRAFT_KEY,kind:'single-photo-draft',
 revision:id,savedAt:'2026-11-02T04:00:00.000Z',photo:p,sha256:await hex(p),source:'file-picker',edit:null};};
const seq=()=>({id:'psi-photo-set-draft-v1',kind:'photo-set-draft',revision:id,
 photos:[file('overview-01','whole.png'),file('detail-02','close.png')]});
const keys={input:LOCAL_INPUT_DRAFT_KEY,single:SINGLE_PHOTO_DRAFT_KEY,sequence:'psi-photo-set-draft-v1'};
const persisted=(x)=>({[keys.input]:x.input,[keys.single]:x.single,[keys.sequence]:x.sequence});
const cloneFile=f=>file(f instanceof File?'not-used':'', 'unused');
const reread=async value=>{
 const blob=await packUnfinishedBackup(value);
 const f=new File([await blob.arrayBuffer()],'valid-backup.json',{type:'application/json'});
 return await unpackUnfinishedBackup(f);
};
describe('F08-43 post-commit restore verification',()=>{
 it('verifies full readback after IDB structured cloning, not just revisions',async()=>{
  const data=await reread({input:input(),single:await photo(),sequence:seq()});
  const copied={
   input:{...data.input,siteContext:{...data.input.siteContext}},
   single:{...data.single,photo:file('same-image-size')},
   sequence:{...data.sequence,photos:[file('overview-01','whole.png'),file('detail-02','close.png')]},
  };
  expect(await verifyUnfinishedRestoreReadback(data,persisted(copied))).toEqual({ok:true,part:null});
 });
 it('rejects modified inspection text despite an unchanged revision',async()=>{
  const data=await reread({input:input()});
  const changed={...data.input,note:'발판 안전하다고 임의 수정'};
  expect(await verifyUnfinishedRestoreReadback(data,{...persisted(data),[keys.input]:changed}))
   .toEqual({ok:false,part:'input'});
 });
 it('rejects a replaced single photo even with matching name, size and revision',async()=>{
  const data=await reread({single:await photo()});
  const wrong=file('same-image-sizE');
  expect(wrong.size).toBe(data.single.photo.size);
  expect(await verifyUnfinishedRestoreReadback(data,{...persisted(data),[keys.single]:{...data.single,photo:wrong}}))
   .toEqual({ok:false,part:'single'});
 });
 it('rejects changed sequence bytes with an unchanged revision',async()=>{
  const data=await reread({sequence:seq()});
  const wrong=file('detail-0X','close.png');
  expect(wrong.size).toBe(data.sequence.photos[1].size);
  expect(await verifyUnfinishedRestoreReadback(data,{...persisted(data),[keys.sequence]:{...data.sequence,
   photos:[data.sequence.photos[0],wrong]}})).toEqual({ok:false,part:'sequence'});
 });
 it('rejects changed original photo in rotation history',async()=>{
  const s=await photo(),original=file('original-pixels','raw.png');
  s.edit={originalFile:original,originalSha256:await hex(original),
    derivedSha256:s.sha256,rotationDegrees:90,processedAt:'2026-11-02T04:00:00.000Z'};
  const data=await reread({single:s});
  const wrongOriginal=file('original-pixelS','raw.png');
  expect(wrongOriginal.size).toBe(original.size);
  expect(await verifyUnfinishedRestoreReadback(data,{...persisted(data),[keys.single]:{
   ...data.single,edit:{...data.single.edit,originalFile:wrongOriginal}
  }})).toEqual({ok:false,part:'single'});
 });
 it('never calls a missing, extra or partial staged record a successful restore',async()=>{
  const data=await reread({input:input(),single:await photo()});
  const s=persisted(data);
  expect((await verifyUnfinishedRestoreReadback(data,{...s,[keys.input]:undefined})).part).toBe('input');
  expect((await verifyUnfinishedRestoreReadback(data,{...s,[keys.single]:undefined})).part).toBe('single');
  expect((await verifyUnfinishedRestoreReadback(data,{...s,[keys.sequence]:seq()})).part).toBe('sequence');
  expect(await verifyUnfinishedRestoreReadback(null,s)).toEqual({ok:false,part:'backup'});
 });
});
