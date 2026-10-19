import {describe,expect,it} from 'vitest';
import {filterInspectionRecords,inspectionAttention,localCalendarDate} from '../lib/inspector/experience';
import {newInspectionDocument,type InspectionDocument,type InspectionSummary} from '../lib/inspector/types';
const record=(patch:Partial<InspectionSummary>={}):InspectionSummary=>({id:'test',revision:1,title:'개구부 점검',work_type:'형틀',location:'2002동 18층',urgent:false,open_actions:0,needs_review:false,created_at:'2026-10-20T00:00:00Z',updated_at:'2026-10-20T00:00:00Z',...patch});
describe('field workspace attention and local search',()=>{
 it('combines search and filters without mutating server order',()=>{
  const items=[record(),record({id:'urgent',urgent:true,needs_review:true,location:'2001동'}),record({id:'open',open_actions:2})];
  expect(filterInspectionRecords(items,'  형틀 ','urgent').map(x=>x.id)).toEqual(['urgent']);
  expect(filterInspectionRecords(items,'2002','actions').map(x=>x.id)).toEqual(['open']);expect(filterInspectionRecords(items,'','review').map(x=>x.id)).toEqual(['urgent']);
  expect(items.map(x=>x.id)).toEqual(['test','urgent','open']);expect(filterInspectionRecords(items,'없는작업','all')).toEqual([]);
 });
 it('guides from photos and notes to human review',()=>{
  const doc=newInspectionDocument();expect(inspectionAttention(doc).tab).toBe('evidence');doc.photoIds=['photo'];doc.notes='현장 관찰';expect(inspectionAttention(doc).tab).toBe('analysis');
 });
 const reviewed=():InspectionDocument=>({...newInspectionDocument(),photoIds:['photo'],notes:'직접 관찰한 현장 설명',analyses:{photo:{schema_version:'1.1',inspection_id:'test',photo_id:'photo',source_photo_sha256:'a'.repeat(64),processing_mode:'CHATGPT_MANUAL',observed_facts:[],ai_hypotheses:[],requires_confirmation:[{question:'방호 확인?',why:'사진 밖'}],recommended_controls:[],law_candidate_keywords:[],limitations:[]}},reviews:{photo:{decision:'accepted',note:'관찰을 대조함'}}});
 it('keeps unknown questions visible after review and completion',()=>{expect(inspectionAttention(reviewed())).toMatchObject({tab:'analysis',title:'현장 확인 질문 1건이 남아 있습니다'});});
 it('sends rejected analysis back to review',()=>{const doc=reviewed();doc.reviews.photo.decision='rejected';expect(inspectionAttention(doc).title).toContain('사실 검토');});
 it('prioritizes open improvements and never treats legal verification as complete',()=>{
  const doc=reviewed();doc.actions=[{id:'action',title:'조치',owner:'담당',dueDate:'2026-10-20',status:'open',completionPhotoId:'',note:''}];expect(inspectionAttention(doc).tab).toBe('actions');
  doc.actions=[];doc.confirmationAnswers={photo:[{questionIndex:0,question:'방호 확인?',answer:'confirmed',note:'현장 확인함'}]};expect(inspectionAttention(doc)).toMatchObject({tab:'report'});expect(inspectionAttention(doc).detail).toContain('공식 법령 검증과 최종 승인은 별도');
 });
 it('formats the local calendar date without UTC date rollover',()=>{expect(localCalendarDate(new Date(2026,9,20,0,30))).toBe('2026-10-20');});
});
