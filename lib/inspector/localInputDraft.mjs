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
 // A matching revision is not sufficient: reject changed input, timestamp or metadata.
 return localInputDraftReadbackMatches(expected,latest);
}

/**
 * F08-49: compare the actual IndexedDB readback with the intended checkpoint.
 * A matching revision alone is insufficient: note, action, photo role,
 * site context, identity fields and save timestamp must all match.
 * This detects a failed/different write, not authorship or legal authenticity.
 */
export function localInputDraftReadbackMatches(expected,persisted){
 if(expected==null)return persisted==null;
 return validLocalInputDraft(expected)&&validLocalInputDraft(persisted)
  &&expected.id===persisted.id
  &&expected.kind===persisted.kind
  &&expected.revision===persisted.revision
  &&expected.savedAt===persisted.savedAt
  &&localInputDraftFields(expected)===localInputDraftFields(persisted);
}

/**
 * F08-53: text-only emergency fallback when IndexedDB, photo backup or browser
 * download is unavailable. This is NOT a photo backup, legal inspection record,
 * identity confirmation or proof of successful saving. No network I/O.
 */
export function buildLocalInspectionEmergencyText(value){
 const ctx=value?.siteContext||{};
 const safe=v=>typeof v==='string'?v:'';
 const role={overview:'현장 전체',detail:'위험 부위',unspecified:'미지정'}[value?.photoRole]||'미지정';
 return [
  'NEW-PSI 작성 중 점검 문구 비상 보존',
  '주의: 사진은 포함되지 않습니다. 이 텍스트만으로 점검 완료나 원본 보존을 증명할 수 없습니다.',
  '현장명: '+safe(ctx.site),
  '동: '+safe(ctx.building),
  '층: '+safe(ctx.level),
  '공종: '+safe(ctx.trade),
  '기본 사진 역할: '+role,
  '--- 직접 확인한 내용 ---',
  safe(value?.note),
  '--- 현장 조치·확인 계획 ---',
  safe(value?.action),
  '--- 끝: 실제 사진은 별도로 내려받아 보관해야 합니다 ---',
 ].join('\n');
}
