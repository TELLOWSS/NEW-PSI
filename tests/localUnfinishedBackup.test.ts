import {describe,it,expect} from 'vitest';
import {packUnfinishedBackup,unpackUnfinishedBackup,previewUnfinishedBackup,UNFINISHED_BACKUP_FORMAT}
 from '../lib/inspector/localUnfinishedBackup.mjs';
import {LOCAL_INPUT_DRAFT_KEY} from '../lib/inspector/localInputDraft.mjs';
import {SINGLE_PHOTO_DRAFT_KEY} from '../lib/inspector/localSinglePhotoDraft.mjs';

const photo=(name='synthetic.png',data='synthetic image')=>new File([data],name,{type:'image/png',lastModified:1711111111111});
const id='00000000-0000-4000-8000-000000000001';
const input=()=>({id:LOCAL_INPUT_DRAFT_KEY,kind:'inspection-input-draft',revision:id,
 savedAt:'2026-11-02T01:00:00.000Z',
 note:'발판 개구부 사실 확인 필요',action:'접근통제와 담당 확인 필요',
 photoRole:'overview',siteContext:{site:'합성 현장',building:'2001',level:'16F',trade:'형틀'}});
const single=async()=>{
 const file=photo();
 const data=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 const sha256=Array.from(new Uint8Array(data)).map(x=>x.toString(16).padStart(2,'0')).join('');
 return {id:SINGLE_PHOTO_DRAFT_KEY,kind:'single-photo-draft',revision:id,
  savedAt:'2026-11-02T01:00:00.000Z',photo:file,sha256,source:'file-picker',edit:null};
};
const sequence=()=>({id:'psi-photo-set-draft-v1',kind:'photo-set-draft',revision:id,
 photos:[photo('overview.png','overview'),photo('detail.png','detail')]});
const asFile=async(blob:Blob)=>new File([await blob.arrayBuffer()],'unfinished.json',{type:'application/json'});
describe('F08 unified unfinished backup and tamper-safe restore',()=>{
 it('roundtrips form, picked photo and two captured photos as one file',async()=>{
  const original={input:input(),single:await single(),sequence:sequence()};
  const saved=await packUnfinishedBackup(original);
  const restored=await unpackUnfinishedBackup(await asFile(saved));
  expect(restored.input).toEqual(original.input);
  expect(restored.single?.photo.name).toBe('synthetic.png');
  expect(await restored.single?.photo.text()).toBe('synthetic image');
  expect(restored.sequence?.photos.map(p=>p.name)).toEqual(['overview.png','detail.png']);
  expect(previewUnfinishedBackup(restored)).toMatchObject({hasInput:true,singlePhotos:1,sequencePhotos:2});
 });
 it('exports version 2 with independent form and whole-file checksums',async()=>{
  const content=JSON.parse(await (await packUnfinishedBackup({input:input(),single:await single()})).text());
  expect(content.version).toBe(2);
  expect(content.inputSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(content.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  const imported=await unpackUnfinishedBackup(new File([JSON.stringify(content)],'v2.json',{type:'application/json'}));
  expect(imported.integrityLevel).toBe('full');
  expect(previewUnfinishedBackup(imported).integrityLabel).toContain('점검내용');
 });
 it('rejects form tampering, metadata changes and missing checksums before restoration',async()=>{
  const original=JSON.parse(await (await packUnfinishedBackup({input:input(),single:await single()})).text());
  const changed=[
   {...original,input:{...original.input,note:'손상된 메모'}},
   {...original,input:{...original.input,action:'조치 변경'}},
   {...original,input:{...original.input,siteContext:{...original.input.siteContext,level:'99F'}}},
   {...original,exportedAt:'2026-11-02T03:00:00.000Z'},
   {...original,inputSha256:'f'.repeat(64)},
   {...original,payloadSha256:'f'.repeat(64)},
   {...original,payloadSha256:undefined},
   {...original,single:{...original.single,source:'camera-dialog'}},
  ];
  for(const item of changed){
   const file=new File([JSON.stringify(item)],'tampered.json',{type:'application/json'});
   await expect(unpackUnfinishedBackup(file)).rejects.toThrow();
  }
 });
 it('imports version 1 backups but labels their input checksum as unverified',async()=>{
  const latest=JSON.parse(await (await packUnfinishedBackup({input:input(),single:await single()})).text());
  delete latest.inputSha256;
  delete latest.payloadSha256;
  latest.version=1;
  const oldFile=new File([JSON.stringify(latest)],'legacy-v1.json',{type:'application/json'});
  const decoded=await unpackUnfinishedBackup(oldFile);
  expect(decoded.integrityLevel).toBe('legacy-photo-only');
  expect(decoded.input.note).toBe(input().note);
  expect(previewUnfinishedBackup(decoded).integrityLabel).toContain('이전 버전');
 });
 it('allows text only or single-photo-only emergency export',async()=>{
  const s=await single();
  for(const record of [{input:input()},{single:s},{sequence:sequence()}]){
   const copy=await unpackUnfinishedBackup(await asFile(await packUnfinishedBackup(record)));
   expect(Boolean(copy.input)).toBe(Boolean(record.input));
   expect(Boolean(copy.single)).toBe(Boolean(record.single));
   expect(Boolean(copy.sequence)).toBe(Boolean(record.sequence));
  }
  await expect(packUnfinishedBackup({})).rejects.toThrow('백업할 작성 중 자료');
 });
 it('rejects corrupted payload, unknown data, wrong version, and inconsistent hashes',async()=>{
  const base=JSON.parse(await (await packUnfinishedBackup({single:await single()})).text());
  const bad=[
   {...base,format:'foreign-format'}, {...base,version:2},
   {...base,extra:'private'},
   {...base,single:{...base.single,sha256:'b'.repeat(64)}},
   {...base,single:{...base.single,photo:{...base.single.photo,data:'AAAA'}}},
   {...base,single:{...base.single,photo:{...base.single.photo,name:'a'.repeat(256)}}},
   {...base,single:{...base.single,source:'server'}},
   {...base,sequence:{id:'invalid',kind:'photo-set-draft',revision:id,photos:[],sources:null,edits:null}},
  ];
  for(const invalid of bad){
   const file=new File([JSON.stringify(invalid)],'corrupted.json',{type:'application/json'});
   await expect(unpackUnfinishedBackup(file)).rejects.toThrow();
  }
 });
 it('preserves photo source and rotation originals',async()=>{
  const s=await single(),orig=photo('original.png','original pixels');
  const sha=await crypto.subtle.digest('SHA-256',await orig.arrayBuffer());
  const originalSha256=Array.from(new Uint8Array(sha)).map(x=>x.toString(16).padStart(2,'0')).join('');
  s.source='camera-dialog';
  s.edit={originalFile:orig,originalSha256,derivedSha256:s.sha256,rotationDegrees:90,processedAt:'2026-11-02T01:00:00.000Z'};
  const restored=await unpackUnfinishedBackup(await asFile(await packUnfinishedBackup({single:s})));
  expect(restored.single?.source).toBe('camera-dialog');
  expect(restored.single?.edit?.rotationDegrees).toBe(90);
  expect(await restored.single?.edit?.originalFile.text()).toBe('original pixels');
 });
 it('tests 60 distinct synthetic incomplete inspections without changing source objects',async()=>{
  for(let i=0;i<60;i++){
   const example=input(),s=await single();
   example.note='합성 위험 확인 '+i;
   example.siteContext.level=String(i)+'F';
   if(i%3===0)s.photo=photo('different.png','synthetic '+i);
   if(i%3===0){
    const hash=await crypto.subtle.digest('SHA-256',await s.photo.arrayBuffer());
    s.sha256=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
   }
   const snap=JSON.stringify(example);
   const restored=await unpackUnfinishedBackup(await asFile(await packUnfinishedBackup({input:example,single:s})));
   expect(restored.input.note).toBe(example.note);
   expect(restored.single.sha256).toBe(s.sha256);
   expect(JSON.stringify(example)).toBe(snap);
  }
 });
});
