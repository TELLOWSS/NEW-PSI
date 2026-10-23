import {describe,it,expect} from 'vitest';
import {reviewIsSaved,recoveredReview,parseReviewPosition,photoWorkUnsaved} from '../lib/inspector/reviewPersistence';
import {DEFAULT_REVIEW_NOTE} from '../lib/inspector/expertReview';
import {newInspectionDocument,type Inspection,type Evidence,type VisionImport} from '../lib/inspector/types';
const id='10000000-0000-4000-8000-000000000001',pid='10000000-0000-4000-8000-000000000002';
const photo:Evidence={id:pid,inspection_id:id,sha256:'a'.repeat(64),mime_type:'image/jpeg',byte_size:10,created_at:'2026-10-23T00:00:00Z'};
const make=():Inspection=>({id,revision:2,created_at:'2026-10-23T00:00:00Z',updated_at:'2026-10-23T00:00:00Z',document:{...newInspectionDocument(),title:'현장',photoIds:[pid],photoNotes:{[pid]:'작업 동선'},analyses:{[pid]:{photo_id:pid,inspection_id:id,source_photo_sha256:photo.sha256,observed_facts:[]} as unknown as VisionImport}}});
const review={decision:'accepted' as const,note:'동선과 방호 상태를 대조함'};
const saved=(before:Inspection)=>({...structuredClone(before),revision:before.revision+1,document:{...structuredClone(before.document),reviews:{[pid]:{...review,confirmedAt:'2026-10-23T01:00:00Z',actor:'dedicated-admin' as const}}}});
describe('explicit photo review persistence',()=>{
 it('distinguishes default selection from persisted human review and normalizes only whitespace',()=>{
  const item=make();expect(reviewIsSaved(item,pid,{decision:'accepted',note:''})).toBe(false);
  item.document.reviews[pid]={decision:'accepted',note:DEFAULT_REVIEW_NOTE};expect(reviewIsSaved(item,pid,{decision:'accepted',note:'  '})).toBe(true);
  expect(reviewIsSaved(item,pid,{decision:'rejected',note:''})).toBe(false);item.document.photoIds=[];expect(reviewIsSaved(item,pid,{decision:'accepted',note:''})).toBe(false);
 });
 it('recovers an acknowledged review only from the same photo/analysis even with reordered JSON keys',()=>{
  const before=make(),after=saved(before);after.document.analyses[pid]=Object.fromEntries(Object.entries(after.document.analyses[pid]).reverse()) as VisionImport;
  expect(recoveredReview(before,after,photo,[photo],review,{state:'active'})).toBe(true);expect(before.document.reviews).toEqual({});
 });
 it('rejects readback of changed analysis, description, event, identity, source, review or deletion state',()=>{
  const before=make(),after=saved(before);
  const mutations=[(x:Inspection)=>{x.id='other';},(x:Inspection)=>{x.revision=before.revision;},(x:Inspection)=>{x.document.photoIds=[];},(x:Inspection)=>{x.document.photoNotes![pid]='다른 설명';},(x:Inspection)=>{x.document.eventAt='2026-10-24T00:00:00Z';},(x:Inspection)=>{x.document.analyses[pid].observed_facts=[{text:'새 분석',visual_basis:'사진 오른쪽',confidence:'low'}];},(x:Inspection)=>{x.document.reviews[pid].decision='rejected';},(x:Inspection)=>{x.document.reviews[pid].note='다른 의견';}];
  for(const mutate of mutations){const next=structuredClone(after);mutate(next);expect(recoveredReview(before,next,photo,[photo],review)).toBe(false);}
  for(const evidence of [[],[{...photo,sha256:'b'.repeat(64)}],[{...photo,inspection_id:'other'}]] as Evidence[][])expect(recoveredReview(before,after,photo,evidence,review)).toBe(false);
  for(const state of ['deleting','files-deleted','purged'])expect(recoveredReview(before,after,photo,[photo],review,{state})).toBe(false);
 });
 it('stores a bounded ID-only resume position and rejects extra sensitive fields and malformed values',()=>{
  expect(parseReviewPosition(JSON.stringify({inspectionId:id,photoId:pid}))).toEqual({inspectionId:id,photoId:pid});
  for(const raw of [null,'{',JSON.stringify({inspectionId:id,photoId:'../photo'}),JSON.stringify({inspectionId:id,photoId:pid,note:'private'}),JSON.stringify({inspectionId:id,photoId:pid,url:'https://signed'}),'a'.repeat(181)])expect(parseReviewPosition(raw)).toBeNull();
 });
 it('warns for pending local photos, changed source/description/title or unsaved review but permits saved read-only views',()=>{
  const before=make(),after=saved(before);
  expect(photoWorkUnsaved(null,null,pid,'','',review)).toBe(true);expect(photoWorkUnsaved(null,null,undefined,'','',review)).toBe(false);
  expect(photoWorkUnsaved(before,photo,pid,'작업 동선','현장',review)).toBe(true);expect(photoWorkUnsaved(after,photo,pid,'작업 동선','현장',review)).toBe(false);
  expect(photoWorkUnsaved(after,photo,'other','작업 동선','현장',review)).toBe(true);expect(photoWorkUnsaved(after,photo,pid,'수정 설명','현장',review)).toBe(true);expect(photoWorkUnsaved(after,photo,pid,'작업 동선','새 제목',review)).toBe(true);expect(photoWorkUnsaved(after,photo,pid,'작업 동선','현장',{...review,note:'추가 조치 의견'})).toBe(true);
 });
 it('does not require AI review for a saved manual photo and still guards its description edits',()=>{
  const item=make();item.document.analyses={};expect(photoWorkUnsaved(item,photo,pid,'작업 동선','현장',review)).toBe(false);expect(photoWorkUnsaved(item,photo,pid,'새 현장 설명','현장',review)).toBe(true);
 });
});
