/**
 * F08: the text portion of an unfinished local inspection.
 * A separate reserved IndexedDB row avoids overwriting the staged photo-set.
 * No network, identity lookup, cloud sync or automatic approval.
 */
export const LOCAL_INPUT_DRAFT_KEY='psi-local-inspection-input-draft-v1';
export function validLocalInputDraft(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=['id','kind','revision','savedAt','note','action','photoRole','siteContext'];
 if(Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key)))return false;
 const ctx=value.siteContext;
 const limits={site:100,building:40,level:40,trade:60};
 return value.id===LOCAL_INPUT_DRAFT_KEY&&value.kind==='inspection-input-draft'
  &&typeof value.revision==='string'&&/^[0-9a-f-]{36}$/i.test(value.revision)
  &&typeof value.savedAt==='string'&&Number.isFinite(Date.parse(value.savedAt))
  &&typeof value.note==='string'&&value.note.length<=4000
  &&typeof value.action==='string'&&value.action.length<=4000
  &&['unspecified','overview','detail'].includes(value.photoRole)
  &&ctx&&typeof ctx==='object'&&!Array.isArray(ctx)
  &&Object.keys(ctx).length===4
  &&Object.entries(limits).every(([key,max])=>typeof ctx[key]==='string'&&ctx[key].length<=max);
}
export function localInputDraftFields(value){
 return JSON.stringify([value.note,value.action,value.photoRole,value.siteContext]);
}
export function localInputDraftHasContent(value){
 return Boolean(value.note?.trim()||value.action?.trim()||
  value.photoRole!=='unspecified'||
  Object.values(value.siteContext||{}).some(v=>typeof v==='string'&&v.trim()));
}
export function localInputDraftCanReplace(latest,expected){
 if(!latest&&!expected)return true;
 return validLocalInputDraft(latest)&&validLocalInputDraft(expected)&&latest.revision===expected.revision;
}
