import {it,expect} from 'vitest';
import {newInspectionDocument,type Evidence,type InspectionReport} from '../lib/inspector/types';
import {validateDocument,assertSafeEdit} from '../lib/inspector/validation';
import {legalForInspection,legalTopicTitle} from '../lib/inspector/legal';
import {buildInspectionBrief} from '../lib/inspector/journey';
const id='a0190000-0000-4000-8000-000000000001',pid='a0190000-0000-4000-8000-000000000002';
const photo:Evidence={id:pid,inspection_id:id,sha256:'a'.repeat(64),mime_type:'image/jpeg',byte_size:100,created_at:'2026-10-27T00:00:00Z'};
const document=()=>({...newInspectionDocument(),photoIds:[pid],photoNotes:{[pid]:'개구부 덮개 누락'}});
it('validates a bounded inspector selection tied to a stored photo without changing its explanation',()=>{
 const doc={...document(),photoRiskTopics:{[pid]:'electric'}};expect(validateDocument(doc,id,[photo])).toBe(doc);expect(doc.photoNotes[pid]).toBe('개구부 덮개 누락');
 for(const selection of [{[id]:'electric'},{[pid]:'not-a-reviewed-topic'},{[pid]:{fineMaxKRW:1}},[]])expect(()=>validateDocument({...doc,photoRiskTopics:selection},id,[photo])).toThrow();
});
it('includes the inspector selection first and keeps independent explanation evidence in new reports',()=>{
 const doc={...document(),photoRiskTopics:{[pid]:'electric'}};const ref=legalForInspection(doc);expect(ref.cards[0].id).toBe('electric');expect(ref.cards.map(c=>c.id)).toContain('opening');expect(legalForInspection(doc,[]).cards).toEqual([]);
});
it('does not add fields to legacy records or snapshots when classifying their existing material',()=>{
 const doc=document(),frozen=JSON.stringify(doc);expect(legalForInspection(doc).cards.map(c=>c.id)).toContain('opening');expect(JSON.stringify(doc)).toBe(frozen);expect(doc).not.toHaveProperty('photoRiskTopics');
});
it('keeps AI analysis and saved human review intact when adding an independent inspector statement',()=>{
 const before=document();before.analyses[pid]={schema_version:'1.1',inspection_id:id,photo_id:pid,source_photo_sha256:photo.sha256,processing_mode:'CHATGPT_MANUAL',observed_facts:[],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[],law_candidate_keywords:[],limitations:[]};before.reviews[pid]={decision:'accepted',note:'사진과 현장 상태를 대조했습니다'};
 const next={...structuredClone(before),photoRiskTopics:{[pid]:'electric'}};expect(()=>assertSafeEdit(next,before)).not.toThrow();expect(next.analyses).toEqual(before.analyses);expect(next.reviews).toEqual(before.reviews);
});
it('labels the report/share statement separately from AI and freezes the selected value in its snapshot',()=>{
 const doc={...document(),photoRiskTopics:{[pid]:'electric'}},report:InspectionReport={id,inspection_id:id,inspection_revision:1,snapshot_sha256:'b'.repeat(64),created_at:photo.created_at,snapshot:{inspection:{id,revision:1,document:structuredClone(doc),created_at:photo.created_at,updated_at:photo.created_at},evidence:[photo],generatedAt:photo.created_at,legalStatus:'UNVERIFIED',reportStatus:'DRAFT',legalReference:legalForInspection(doc)}};
 const before=JSON.stringify(report),brief=buildInspectionBrief(report);expect(brief).toContain(`점검자 선택 위험: ${legalTopicTitle('electric')} · AI 판정 아님`);doc.photoRiskTopics[pid]='opening';expect(JSON.stringify(report)).toBe(before);
});
