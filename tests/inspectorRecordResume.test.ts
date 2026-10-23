import {describe,it,expect} from 'vitest';
import {recordResumeEntry,recordResumeLabel,recordResumeStatus,validResumeEntry} from '../lib/inspector/recordResume';
import {actionQueue} from '../lib/inspector/workQueue';
import {newInspectionDocument,type InspectionSummary,type InspectorAction,type VisionImport} from '../lib/inspector/types';
const id='10000000-0000-4000-8000-000000000001';
const summary=(patch:Partial<InspectionSummary>={}):InspectionSummary=>({id,revision:2,title:'현장',work_type:'',location:'',urgent:false,open_actions:0,needs_review:false,created_at:'2026-10-23T00:00:00Z',updated_at:'2026-10-23T00:00:00Z',...patch});
const action=(id:string,status:InspectorAction['status'],dueDate:string):InspectorAction=>({id,status,dueDate,title:'방호 보강',owner:'형틀반장',completionPhotoId:'',note:''});
describe('read-only record continuation',()=>{
 it('prioritizes human review, then unresolved actions, without treating urgent as a confirmed finding',()=>{
  expect(recordResumeEntry(summary({needs_review:true,open_actions:2}))).toEqual({id,intent:'review'});
  expect(recordResumeEntry(summary({open_actions:1}))).toEqual({id,intent:'actions'});
  expect(recordResumeEntry(summary({urgent:true}))).toEqual({id,intent:'overview'});
  expect(recordResumeLabel(summary({needs_review:true}))).toBe('검토 이어보기');
 });
 it('accepts only an explicit known destination and valid UUID',()=>{
  expect(validResumeEntry({id,intent:'review'})).toBe(true);
  expect(validResumeEntry({id:'../../record',intent:'review'})).toBe(false);
  expect(validResumeEntry({id,intent:'analyze' as any})).toBe(false);
  expect(validResumeEntry(undefined)).toBe(false);
 });
 it('rechecks saved photo order and excludes accepted, rejected, manual and unlinked analyses',()=>{
  const doc=newInspectionDocument(),analysis={} as VisionImport;
  doc.photoIds=['accepted','manual','rejected','pending2','pending1'];doc.analyses={accepted:analysis,rejected:analysis,pending2:analysis,pending1:analysis,unlinked:analysis};
  doc.reviews={accepted:{decision:'accepted',note:'대조 완료'},rejected:{decision:'rejected',note:'전문가 의견'}};
  const before=JSON.stringify(doc);
  expect(recordResumeStatus(doc)).toEqual({pendingPhotoId:'pending2',pendingPhotos:2,remainingActions:0});
  expect(JSON.stringify(doc)).toBe(before);
 });
 it('does not invent a pending photo when a list is stale or a record is empty',()=>{
  const doc=newInspectionDocument();expect(recordResumeStatus(doc)).toEqual({pendingPhotoId:'',pendingPhotos:0,remainingActions:0});
  doc.actions=[action('one','review-requested','2026-10-23'),action('done','verified','2026-10-20')];expect(recordResumeStatus(doc).remainingActions).toBe(1);
 });
 it('includes open and review-requested actions in unresolved scope, filters by owner and sorts by deadline',()=>{
  const actions=[action('done','verified','2026-10-18'),action('later','open','2026-10-25'),action('review','review-requested','2026-10-20'),{...action('other','open','2026-10-19'),owner:'철근반장'},action('invalid','open','2026-02-30')];
  const before=JSON.stringify(actions);
  expect(actionQueue(actions,'unresolved','형틀','2026-10-23','due').map(x=>x.id)).toEqual(['review','later','invalid']);
  expect(actionQueue(actions,'unresolved','','2026-10-23').map(x=>x.id)).toEqual(['later','review','other','invalid']);
  expect(JSON.stringify(actions)).toBe(before);
 });
});
