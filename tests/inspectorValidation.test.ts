import { describe, expect, it } from 'vitest';
import { assertSafeEdit, parseVisionImport, validateDocument } from '../lib/inspector/validation';
import { newInspectionDocument } from '../lib/inspector/types';
import { buildInspectorPrompt } from '../lib/inspector/prompt';
const inspection='a0190000-0000-4000-8000-000000000001', photoId='a0190000-0000-4000-8000-000000000002';
const photo={id:photoId,inspection_id:inspection,sha256:'a'.repeat(64),mime_type:'image/png',byte_size:100,created_at:'2026-10-19T00:00:00Z'};
const analysis=()=>({schema_version:'1.1',inspection_id:inspection,photo_id:photoId,source_photo_sha256:photo.sha256,processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'촬영 범위 일부에 난간이 보이지 않음',visual_basis:'사진 오른쪽',confidence:'medium'}],ai_hypotheses:[],requires_confirmation:[{question:'사진 밖에 방호시설이 있나요?',why:'촬영 범위 제한'}],recommended_controls:[],law_candidate_keywords:['추락'],limitations:['사진 밖은 확인 불가']});
describe('inspector evidence and manual import contract',()=>{
    it('accepts the exact portable handoff shape and matches the source photo',()=>{
        const value=analysis();expect(parseVisionImport(JSON.stringify(value),inspection,photo)).toEqual(value);
        expect(buildInspectorPrompt(inspection,photo,newInspectionDocument())).toContain(photo.sha256);
    });
    it.each(['inspection_id','photo_id','source_photo_sha256'])('rejects a result for another source (%s)',field=>{
        expect(()=>parseVisionImport({...analysis(),[field]:field==='source_photo_sha256'?'b'.repeat(64):'other'},inspection,photo)).toThrow('일치하지');
    });
    it.each(['legal_violation_confirmed','fine_amount','approved','tenant_id'])('rejects injected authority or penalty field %s',field=>{
        expect(()=>parseVisionImport({...analysis(),[field]:true},inspection,photo)).toThrow('표준 형식');
    });
    it.each(['PAID_API_APPROVED','SIWC_ELIGIBLE_CLIENT','ON_DEVICE_OCR'])('blocks unimplemented processing mode %s',mode=>{
        expect(()=>parseVisionImport({...analysis(),processing_mode:mode},inspection,photo)).toThrow('수동');
    });
    it('rejects nested unknown fields, malformed JSON, oversized input and excessive claims',()=>{
        for(const raw of ['{invalid','x'.repeat(100001),{...analysis(),observed_facts:[{...analysis().observed_facts[0],fine:100}]},{...analysis(),observed_facts:Array(51).fill(analysis().observed_facts[0])}])expect(()=>parseVisionImport(raw,inspection,photo)).toThrow();
    });
    it('allows unknowns and does not interpret AI prose as legal authority',()=>{
        const result=parseVisionImport({...analysis(),ai_hypotheses:[{text:'위법 확정 벌금 999만원',reason:'untrusted generated prose'}]},inspection,photo);
        expect(result).not.toHaveProperty('legalStatus');
        expect(result).not.toHaveProperty('fine');
    });
    it('validates linked immutable originals and invalidates review when analysis changes',()=>{
        const old={...newInspectionDocument(),photoIds:[photoId],analyses:{[photoId]:parseVisionImport(analysis(),inspection,photo)},reviews:{[photoId]:{decision:'accepted' as const,note:'현장 사진 범위를 확인함'}}};
        expect(validateDocument(old,inspection,[photo])).toEqual(old);
        expect(()=>validateDocument(old,inspection,[])).toThrow();
        expect(()=>assertSafeEdit({...old,photoIds:[]},old)).toThrow('원본');
        const modified=structuredClone(old);modified.analyses[photoId].limitations.push('변경');
        expect(()=>assertSafeEdit(modified,old)).toThrow('다시 검토');delete modified.reviews[photoId];expect(()=>assertSafeEdit(modified,old)).not.toThrow();
    });
    it('blocks forged closure and modification or deletion of verified actions',()=>{
        const action={id:'a0190000-0000-4000-8000-000000000003',title:'난간 보강',owner:'형틀 담당',dueDate:'2026-10-20',status:'verified' as const,completionPhotoId:photoId,note:'현장 재점검 완료',verifiedAt:'2026-10-19T00:00:00Z'};
        const old=newInspectionDocument();expect(()=>assertSafeEdit({...old,actions:[action]},old)).toThrow('완료 확인');
        const closed={...old,actions:[action]};expect(()=>assertSafeEdit({...closed,actions:[]},closed)).toThrow('변경할 수');
    });
    it('requires a real completion date, original improvement photo and review note',()=>{
        const doc={...newInspectionDocument(),photoIds:[photoId],actions:[{id:'a0190000-0000-4000-8000-000000000003',title:'난간 보강',owner:'형틀 담당',dueDate:'2026-02-30',status:'open' as const,completionPhotoId:'',note:''}]};
        expect(()=>validateDocument(doc,inspection,[photo])).toThrow();doc.actions[0].dueDate='2026-10-20';expect(()=>validateDocument(doc,inspection,[photo])).not.toThrow();
        (doc.actions[0] as any).status='review-requested';expect(()=>validateDocument(doc,inspection,[photo])).toThrow('개선사진');
    });
    it('preserves raw and corrected local OCR text without scoring workers',()=>{
        const doc={...newInspectionDocument(),photoIds:[photoId],ocrResults:{[photoId]:{rawText:'원 인식',recognizedText:'사람 정정',confidence:0.4,language:'kor' as const,engine:'LOCAL_TESSERACT' as const,reviewStatus:'corrected' as const}}};
        expect(validateDocument(doc,inspection,[photo]).ocrResults[photoId].rawText).toBe('원 인식');
        expect(()=>validateDocument({...doc,workerScore:100},inspection,[photo])).toThrow();
    });
});

describe('question-specific human confirmation',()=>{
    const answer=()=>({questionIndex:0,question:analysis().requires_confirmation[0].question,answer:'unknown' as const,note:'사진 밖은 현장 확인이 필요함'});
    const doc=()=>({...newInspectionDocument(),photoIds:[photoId],analyses:{[photoId]:parseVisionImport(analysis(),inspection,photo)},confirmationAnswers:{[photoId]:[answer()]}});
    it('retains explicitly unknown answers and supports older documents without answers',()=>{
        expect(validateDocument(doc(),inspection,[photo]).confirmationAnswers?.[photoId][0].answer).toBe('unknown');
        expect(validateDocument(newInspectionDocument(),inspection,[]).confirmationAnswers).toBeUndefined();
    });
    it.each([{questionIndex:9},{question:'다른 질문'},{answer:'approved'},{note:'짧음'},{approved:true}])('rejects mismatched or forged answer %#',patch=>{
        const value=doc();Object.assign(value.confirmationAnswers[photoId][0],patch);expect(()=>validateDocument(value,inspection,[photo])).toThrow();
    });
    it('rejects duplicate question answers and malformed values',()=>{
        for(const answers of [[answer(),answer()],[null],'not an array'])expect(()=>validateDocument({...doc(),confirmationAnswers:{[photoId]:answers}},inspection,[photo])).toThrow();
    });
    it('requires fresh answers after replacing analysis even if the question text stayed the same',()=>{
        const before=doc(),next=structuredClone(before);next.analyses[photoId].limitations.push('새 판독');
        expect(()=>assertSafeEdit(next,before)).toThrow('다시 답변');delete (next as any).confirmationAnswers[photoId];expect(()=>assertSafeEdit(next,before)).not.toThrow();
    });
    it('requires review again when answers or inspection context changes',()=>{
        const before={...doc(),reviews:{[photoId]:{decision:'accepted' as const,note:'원본과 현장 대조 완료'}}};
        const changed=structuredClone(before);changed.confirmationAnswers[photoId][0].note='현장 상황을 새로 확인함';
        expect(()=>assertSafeEdit(changed,before)).toThrow('다시 검토');delete (changed as any).reviews[photoId];expect(()=>assertSafeEdit(changed,before)).not.toThrow();
        const newContext={...before,notes:'새 작업 조건'};expect(()=>assertSafeEdit(newContext,before)).toThrow('다시 검토');
        expect(()=>assertSafeEdit({...newContext,reviews:{},confirmationAnswers:{}},before)).not.toThrow();
    });
});
