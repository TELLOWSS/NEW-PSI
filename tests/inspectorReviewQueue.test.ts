import {describe,it,expect} from 'vitest';
import {pendingReviewQueue} from '../lib/inspector/reviewQueue';
import {newInspectionDocument,type VisionImport} from '../lib/inspector/types';
const a=(priority:'immediate'|'soon'|'routine',problem:string):VisionImport=>({schema_version:'1.1',inspection_id:'i',photo_id:problem,source_photo_sha256:'a'.repeat(64),processing_mode:'CHATGPT_MANUAL',observed_facts:[],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[{action:'기존 조치',priority:'immediate'}],risk_findings:[{observation_index:'0',problem,risk:'가능 위험',action:'대조 요청',priority}],law_candidate_keywords:[],limitations:[]});
describe('saved photo priority review queue',()=>{
 it('orders pending findings by highest priority then original photo number without mutating records',()=>{
  const doc={...newInspectionDocument(),photoIds:['a','b','c','d'],analyses:{a:a('routine','a'),b:a('immediate','b'),c:a('soon','c'),d:a('immediate','d')}};
  const before=JSON.stringify(doc);expect(pendingReviewQueue(doc).map(p=>p.id)).toEqual(['b','d','c','a']);expect(pendingReviewQueue(doc)[0].number).toBe(2);expect(JSON.stringify(doc)).toBe(before);
 });
 it('excludes active photo, accepted/rejected reviews, unanalysed and improvement photos, and orphan analyses',()=>{
  const doc={...newInspectionDocument(),photoIds:['active','accepted','rejected','manual','improvement','pending'],analyses:Object.fromEntries(['active','accepted','rejected','pending','orphan'].map(id=>[id,a('immediate',id)])),reviews:{accepted:{decision:'accepted' as const,note:''},rejected:{decision:'rejected' as const,note:'전문가 보완 의견'}}};
  expect(pendingReviewQueue(doc,'active').map(p=>p.id)).toEqual(['pending']);
 });
 it('does not promote generic controls when modern findings are explicitly empty',()=>{
  const doc={...newInspectionDocument(),photoIds:['unknown','known'],analyses:{unknown:{...a('immediate','generic'),risk_findings:[]},known:a('routine','known')}};
  expect(pendingReviewQueue(doc).map(p=>p.id)).toEqual(['known','unknown']);expect(pendingReviewQueue(doc)[1]).toMatchObject({priority:'unknown',action:''});
 });
 it('supports legacy controls and chooses the strongest finding without unrelated keyword inference',()=>{
  const legacy=a('soon','legacy');delete legacy.risk_findings;
  const multi=a('routine','routine');multi.risk_findings!.push({...multi.risk_findings![0],problem:'먼저 볼 단서',priority:'immediate'});
  const doc={...newInspectionDocument(),photoIds:['multi','legacy'],analyses:{multi,legacy}};
  expect(pendingReviewQueue(doc)[0]).toMatchObject({problem:'먼저 볼 단서',priority:'immediate'});expect(pendingReviewQueue(doc)[1].problem).toBe('기존 조치');
 });
});
