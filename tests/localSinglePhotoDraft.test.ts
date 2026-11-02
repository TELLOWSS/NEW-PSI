import {describe,it,expect} from 'vitest';
import {SINGLE_PHOTO_DRAFT_KEY,SINGLE_PHOTO_MAX_BYTES,validSinglePhotoDraft,
 singlePhotoDraftCanReplace,singlePhotoDraftMetadataMatches} from '../lib/inspector/localSinglePhotoDraft.mjs';

const create=()=>({
 id:SINGLE_PHOTO_DRAFT_KEY,kind:'single-photo-draft',
 revision:'00000000-0000-4000-8000-000000000001',
 savedAt:'2026-11-02T01:15:00.000Z',
 photo:new File(['synthetic image'],'demo.png',{type:'image/png'}),
 sha256:'a'.repeat(64),source:'file-picker',edit:null,
});
describe('F08 single photo draft lifecycle and corruption boundaries',()=>{
 it('accepts a bounded local File checkpoint and matching restored metadata',()=>{
  const value=create();
  expect(validSinglePhotoDraft(value)).toBe(true);
  expect(singlePhotoDraftMetadataMatches(value,{...value,photo:new File(['synthetic image'],'demo.png',{type:'image/png'})})).toBe(true);
 });
 it('rejects stale other-tab revisions and missing/deleted checkpoints',()=>{
  const value=create(),latest={...value,revision:'00000000-0000-4000-8000-000000000002'};
  expect(singlePhotoDraftCanReplace(null,null)).toBe(true);
  expect(singlePhotoDraftCanReplace(value,value)).toBe(true);
  expect(singlePhotoDraftCanReplace(latest,value)).toBe(false);
  expect(singlePhotoDraftCanReplace(null,value)).toBe(false);
  expect(singlePhotoDraftCanReplace(value,null)).toBe(false);
 });
 it('rejects unsupported structures and over-limit files without guessing success',()=>{
  const a=create();
  const invalid=[
   null,undefined,[],{}, {...a,kind:'normal-record'}, {...a,revision:'invalid'},
   {...a,savedAt:'invalid'}, {...a,photo:new Blob(['image'])},
   {...a,photo:new File([''],'empty.png',{type:'image/png'})},
   {...a,photo:new File([new Uint8Array(SINGLE_PHOTO_MAX_BYTES+1)],'huge.png',{type:'image/png'})},
   {...a,sha256:'not-a-hash'}, {...a,source:'server'},
   {...a,edit:{}}, {...a,extra:'private'},
  ];
  for(const v of invalid)expect(validSinglePhotoDraft(v)).toBe(false);
 });
 it('rejects restored metadata mismatch and corrupt editing references',()=>{
  const a=create();
  for(const other of [
   null,{...a,id:'other'}, {...a,revision:'00000000-0000-4000-8000-000000000004'},
   {...a,sha256:'b'.repeat(64)},
   {...a,photo:new File(['new bytes'],'demo.png',{type:'image/png'})},
   {...a,photo:new File(['synthetic image'],'other.png',{type:'image/png'})},
   {...a,photo:new File(['synthetic image'],'demo.png',{type:'image/jpeg'})},
  ])expect(singlePhotoDraftMetadataMatches(a,other)).toBe(false);
  expect(validSinglePhotoDraft({...a,edit:{
   originalFile:new File(['raw'],'old.jpg',{type:'image/jpeg'}),
   originalSha256:'c'.repeat(64),derivedSha256:'b'.repeat(64),
   rotationDegrees:90,processedAt:'2026-11-02T01:14:00.000Z',
  }})).toBe(false);
 });
});
