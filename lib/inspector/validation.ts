import validateSchema from './visionValidator.generated.js';
import type { Evidence, InspectionDocument, VisionImport } from './types.js';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class InspectorInputError extends Error {}
function fail(message = '입력 형식과 필수 항목을 확인해 주세요.'): never { throw new InspectorInputError(message); }
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exact(value: any, keys: string[]) { if (!object(value) || Object.keys(value).some(k => !keys.includes(k))) fail(); }
function text(value: unknown, max: number, min = 0) { if (typeof value !== 'string' || value.length > max || value.trim().length < min || value.includes('\u0000')) fail(); }
export function parseVisionImport(raw: string | unknown, inspectionId: string, photo: Pick<Evidence, 'id' | 'sha256'>, allowApi=false): VisionImport {
    const serialized = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > 100_000) fail('분석결과는 100KB 이하로 가져와 주세요.');
    // Accept a single copied JSON code block, without repairing or guessing its contents.
    const trimmed=serialized.trim(),fenced=trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    let value: any;
    try { value = JSON.parse(fenced?fenced[1]:serialized); } catch { return fail('JSON 형식의 분석결과를 붙여넣어 주세요.'); }
    if (!validateSchema(value)) fail('분석결과가 표준 형식과 다릅니다. 표준 프롬프트로 다시 요청해 주세요.');
    if (value.processing_mode !== 'CHATGPT_MANUAL' && !(allowApi && value.processing_mode==='PAID_API_APPROVED')) fail('현재는 ChatGPT 수동 분석결과만 가져올 수 있습니다.');
    if (value.inspection_id !== inspectionId || value.photo_id !== photo.id || value.source_photo_sha256.toLowerCase() !== photo.sha256.toLowerCase()) {
        fail('점검번호·사진번호·원본 해시가 일치하지 않습니다. 선택한 사진의 결과인지 확인해 주세요.');
    }
    // All prose is untrusted reference text. Neither legal effects nor approval fields exist in this contract.
    for (const list of Object.values(value).filter(Array.isArray)) for (const item of list as any[]) {
        if (typeof item === 'string') text(item, 2000, 1);
        else for (const field of Object.values(item)) text(field, 4000, 1);
    }
    if(value.risk_findings?.some((finding:any)=>!value.observed_facts[Number(finding.observation_index)]))fail('위험 해석의 사진 관찰 근거가 없습니다.');
    return value;
}
export function validateDocument(value: unknown, inspectionId: string, evidence: Evidence[]): InspectionDocument {
    if (new TextEncoder().encode(JSON.stringify(value) || '').length > 480000) fail('점검 내용이 너무 큽니다. 사진별 분석 내용을 줄여 주세요.');
    exact(value, ['title','siteName','location','workType','eventAt','notes','urgent','ocrResults','photoIds','analyses','reviews','actions','confirmationAnswers','photoNotes','apiEnabled','materialCompletion','inspectionKind']);
    const doc = value as InspectionDocument;
    if(doc.inspectionKind!==undefined && !['spot','regular','consulting','other'].includes(doc.inspectionKind))fail('점검 유형을 다시 선택해 주세요.');
    text(doc.title, 200, 1); text(doc.siteName, 200); text(doc.location, 200); text(doc.workType, 100); text(doc.notes, 8000);
    text(doc.eventAt, 32, 1);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(doc.eventAt) || !Number.isFinite(Date.parse(doc.eventAt)) || new Date(doc.eventAt).toISOString() !== doc.eventAt || typeof doc.urgent !== 'boolean') fail();
    if (!Array.isArray(doc.photoIds) || doc.photoIds.length > 20 || new Set(doc.photoIds).size !== doc.photoIds.length) fail();
    const byId = new Map(evidence.map(p => [p.id, p]));
    if (doc.photoIds.some(id => typeof id !== 'string' || !UUID.test(id) || !byId.has(id))) fail('사진 원본이 저장되지 않았거나 다른 점검의 사진입니다.');
    if(doc.apiEnabled!==undefined && typeof doc.apiEnabled!=='boolean') fail();
    if(doc.photoNotes!==undefined) {if(!object(doc.photoNotes) || Object.keys(doc.photoNotes).length>20)fail();for(const [id,note] of Object.entries(doc.photoNotes)){if(!doc.photoIds.includes(id))fail();text(note,4000);}}
    if(doc.materialCompletion!==undefined){const m=doc.materialCompletion;exact(m,['revision','completedAt','photoIds']);if(!Number.isSafeInteger(m.revision)||m.revision<1||!Number.isFinite(Date.parse(m.completedAt))||!Array.isArray(m.photoIds)||m.photoIds.length===0||new Set(m.photoIds).size!==m.photoIds.length||m.photoIds.some(id=>!doc.photoIds.includes(id)||doc.reviews[id]?.decision!=='accepted'))fail('보고서 자료 완료 상태를 다시 확인해 주세요.');}
    if (!object(doc.ocrResults) || Object.keys(doc.ocrResults).length > 20) fail();
    for (const [id, result] of Object.entries(doc.ocrResults)) {
        exact(result, ['rawText','recognizedText','confidence','language','engine','reviewStatus']);
        if (!doc.photoIds.includes(id) || !['kor','eng','vie','chi_sim'].includes(result.language) || result.engine !== 'LOCAL_TESSERACT' || !['unreviewed','corrected','accepted'].includes(result.reviewStatus) || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) fail();
        text(result.rawText, 20000); text(result.recognizedText, 20000);
    }
    if (!object(doc.analyses) || !object(doc.reviews) || Object.keys(doc.analyses).length > 20 || Object.keys(doc.reviews).length > 20) fail();
    for (const [id, analysis] of Object.entries(doc.analyses)) {
        if (!doc.photoIds.includes(id)) fail();
        parseVisionImport(analysis, inspectionId, byId.get(id)!, true);
    }
    if (doc.confirmationAnswers !== undefined) {
        if (!object(doc.confirmationAnswers) || Object.keys(doc.confirmationAnswers).length > 20) fail();
        for (const [id, answers] of Object.entries(doc.confirmationAnswers)) {
            if (!doc.analyses[id] || !Array.isArray(answers) || answers.length > 50 || answers.some(a=>!object(a)) || new Set(answers.map(a => a.questionIndex)).size !== answers.length) fail();
            for (const answer of answers) {
                exact(answer, ['questionIndex','question','answer','note']);
                if (!Number.isSafeInteger(answer.questionIndex) || answer.questionIndex < 0 || answer.question !== doc.analyses[id].requires_confirmation[answer.questionIndex]?.question
                    || !['confirmed','not-confirmed','unknown'].includes(answer.answer)) fail('확인 질문과 답변을 다시 대조해 주세요.');
                text(answer.note, 2000, 5);
            }
        }
    }
    for (const [id, review] of Object.entries(doc.reviews)) {
        exact(review, ['decision','note','confirmedAt','actor']);
        if(review.confirmedAt!==undefined && (!Number.isFinite(Date.parse(review.confirmedAt)) || review.actor!=='dedicated-admin'))fail();
        if (!doc.analyses[id] || !['accepted','rejected'].includes(review.decision)) fail();
        text(review.note, 2000, 5);
    }
    if (!Array.isArray(doc.actions) || doc.actions.length > 30 || new Set(doc.actions.map(a => a.id)).size !== doc.actions.length) fail();
    for (const action of doc.actions) {
        exact(action, ['id','title','owner','dueDate','status','completionPhotoId','note','verifiedAt','sourcePhotoIds','scheduleContext']);
        if (!UUID.test(action.id) || !['open','review-requested','verified'].includes(action.status)) fail();
        text(action.title, 1000, 1); text(action.owner, 100, 1); text(action.note, 2000); text(action.dueDate, 10);
        if(action.scheduleContext!==undefined)text(action.scheduleContext,300);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(action.dueDate) || !Number.isFinite(Date.parse(action.dueDate))
            || new Date(action.dueDate).toISOString().slice(0,10) !== action.dueDate) fail();
        if (action.completionPhotoId !== '' && !doc.photoIds.includes(action.completionPhotoId)) fail();
        if(action.sourcePhotoIds!==undefined){
            if(!Array.isArray(action.sourcePhotoIds)||!action.sourcePhotoIds.length||action.sourcePhotoIds.length>20||new Set(action.sourcePhotoIds).size!==action.sourcePhotoIds.length||action.sourcePhotoIds.some(id=>!doc.photoIds.includes(id)))fail('조치 전 사진의 연결을 확인해 주세요.');
            if(action.completionPhotoId&&action.sourcePhotoIds.some(id=>id===action.completionPhotoId||byId.get(id)?.sha256===byId.get(action.completionPhotoId)?.sha256))fail('조치 전 사진을 개선사진으로 재사용할 수 없습니다. 개선 후 다른 사진을 첨부해 주세요.');
        }
        if (action.status !== 'open' && (!action.completionPhotoId || action.note.trim().length < 5)) fail('완료 확인에는 개선사진과 재점검 내용이 필요합니다.');
        if (action.verifiedAt !== undefined && (typeof action.verifiedAt !== 'string' || !Number.isFinite(Date.parse(action.verifiedAt)))) fail();
    }
    return doc;
}
export function assertSafeEdit(next: InspectionDocument, previous: InspectionDocument) {
    // Original evidence remains linked. Every changed analysis invalidates that photo's old review.
    if (previous.photoIds.some(id => !next.photoIds.includes(id))) fail('등록한 원본사진은 제거할 수 없습니다.');
    const contextChanged = (['notes','siteName','location','workType','eventAt'] as const).some(key => next[key] !== previous[key]);
    if (contextChanged && (Object.keys(next.reviews).length || Object.values(next.confirmationAnswers || {}).some(answers => answers.length))) fail('점검 설명이나 현장 정보가 바뀌면 사실을 다시 검토해 주세요.');
    if(JSON.stringify(next.materialCompletion)!==JSON.stringify(previous.materialCompletion) && next.materialCompletion)fail('보고서 자료 완료 버튼을 이용해 주세요.');
    for(const id of new Set([...Object.keys(next.photoNotes||{}),...Object.keys(previous.photoNotes||{})]))if((next.photoNotes?.[id] || '')!==(previous.photoNotes?.[id] || '') && (next.reviews[id] || next.analyses[id]))fail('사진 설명 변경 후 분석과 검토를 다시 진행해 주세요.');
    for (const [id, analysis] of Object.entries(next.analyses)) {
        const changed = JSON.stringify(analysis) !== JSON.stringify(previous.analyses[id]);
        if (changed && next.reviews[id]) fail('분석을 변경한 사진은 사실을 다시 검토해 주세요.');
        if (changed && next.confirmationAnswers?.[id]?.length) fail('분석을 변경한 사진의 질문에 다시 답변해 주세요.');
        if (JSON.stringify(next.confirmationAnswers?.[id] || []) !== JSON.stringify(previous.confirmationAnswers?.[id] || []) && next.reviews[id]) fail('확인 답변을 변경하면 사실을 다시 검토해 주세요.');
    }
    if(previous.materialCompletion && next.materialCompletion && JSON.stringify(next)!==JSON.stringify(previous))fail('변경 후 보고서 작성자료를 다시 완료해 주세요.');
    for (const old of previous.actions.filter(a => a.status === 'verified')) {
        if (JSON.stringify(next.actions.find(a => a.id === old.id)) !== JSON.stringify(old)) fail('확인된 개선기록은 변경할 수 없습니다.');
    }
    for (const action of next.actions) {
        const old = previous.actions.find(a => a.id === action.id);
        if(old?.sourcePhotoIds&&JSON.stringify(old.sourcePhotoIds)!==JSON.stringify(action.sourcePhotoIds))fail('등록한 조치의 적용 사진은 바꿀 수 없습니다. 적용 범위가 다르면 새 조치로 등록해 주세요.');
        if ((action.status === 'verified' || action.verifiedAt) && JSON.stringify(action) !== JSON.stringify(old)) fail('완료 확인은 재점검 확인 버튼을 이용해 주세요.');
    }
}
