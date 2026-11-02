import {describe,it,expect} from 'vitest';
import {LOCAL_INPUT_DRAFT_KEY,validLocalInputDraft,localInputDraftFields,localInputDraftHasContent,localInputDraftCanReplace} from '../lib/inspector/localInputDraft.mjs';
const fixture=()=>({
 id:LOCAL_INPUT_DRAFT_KEY,kind:'inspection-input-draft',
 revision:'00000000-0000-4000-8000-000000000001',
 savedAt:'2026-11-02T00:00:00.000Z',
 note:'철근 단부에 접촉 위험이 보임',action:'접근통제와 담당 확인 예정',photoRole:'overview',
 siteContext:{site:'테스트 현장',building:'2001',level:'16F',trade:'철근'},
});
describe('F08 unfinished field-inspection input checkpoint',()=>{
 it('accepts a correctly bounded local-only record',()=>{
  const row=fixture();
  expect(validLocalInputDraft(row)).toBe(true);
  expect(localInputDraftHasContent(row)).toBe(true);
  expect(localInputDraftFields(row)).toBe(localInputDraftFields({...row,savedAt:'2026-11-03T00:00:00.000Z'}));
 });
 it('rejects invalid, oversized, or foreign data before loading',()=>{
  const row=fixture();
  for(const candidate of [
   null,undefined,'text',[],{}, {...row,id:'unrelated-key'},
   {...row,kind:'inspection'}, {...row,note:'A'.repeat(4001)},
   {...row,action:'B'.repeat(4001)}, {...row,photoRole:'verified'},
   {...row,siteContext:{site:'X'.repeat(101),building:'',level:'',trade:''}},
   {...row,siteContext:{site:'X',building:'',level:'',trade:'',verified:true}},
   {...row,revision:'INVALID'}, {...row,savedAt:'bad-date'},
   {...row,secret:'private-extra-property'},
  ])expect(validLocalInputDraft(candidate)).toBe(false);
 });
 it('prevents rewriting another browser tab latest revision',()=>{
  const a=fixture();
  const b={...a,revision:'00000000-0000-4000-8000-000000000002'};
  expect(localInputDraftCanReplace(null,null)).toBe(true);
  expect(localInputDraftCanReplace(a,a)).toBe(true);
  expect(localInputDraftCanReplace(b,a)).toBe(false);
  expect(localInputDraftCanReplace(null,a)).toBe(false);
  expect(localInputDraftCanReplace(a,null)).toBe(false);
 });
 it('does not confuse blank forms with prior work',()=>{
  const blank={note:'',action:'',photoRole:'unspecified',
   siteContext:{site:'',building:'',level:'',trade:''}};
  expect(localInputDraftHasContent(blank)).toBe(false);
  expect(localInputDraftHasContent({...blank,action:'임시조치 예정'})).toBe(true);
  expect(localInputDraftHasContent({...blank,siteContext:{...blank.siteContext,level:'16F'}})).toBe(true);
 });
});
