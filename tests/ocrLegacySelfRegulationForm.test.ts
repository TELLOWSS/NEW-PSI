import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assessPsiDocumentEvidence,normalizeOcrDocumentMetadata} from '../utils/ocrDocumentValidation';
import {assessOcrRoutingQuality} from '../utils/ocrRoutingQuality';
import {PSI_FORM_MASTER_PROMPT_BLOCK,PSI_FORM_MASTER_VERSION} from '../config/psiFormMaster';
const src=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
const answers=Array.from({length:5},(_,i)=>({questionNumber:String(i+1),answerText:'합성 답변 '+(i+1),koreanTranslation:'합성 답변 '+(i+1)}));
const variants=[
 {id:'ko-scanned-2025',markers:['스스로 지키는 안전(자기규율 예방체계) 위험성평가 기록표','교육일','이름','근무 공종']},
 {id:'ko-blank-2025',markers:['위험성평가 기록표','근무 공종']},
 {id:'zh-2025',markers:['风险评估记录单','工作类型']},
 {id:'ru-2025',markers:['Лист учета оценки риска','Тип работы']},
 {id:'my-2025',markers:['အန္တရာယ်အကဲဖြတ်မှတ်တမ်းစာရွက်','အလုပ်အမျိုးအစား']},
 {id:'vi-2025',markers:['Phiếu ghi chép đánh giá rủi ro','Loại công việc']},
 {id:'zh-2025-alt',markers:['风险评估记录单','工作类型','名字']},
];
describe('2025 legacy handwritten self-regulation risk assessment OCR compatibility',()=>{
 it.each(variants)('accepts verified original five-question form $id',({markers})=>{
  const raw={documentType:'psi-risk-assessment',isPsiForm:true,documentMarkers:markers,handwrittenAnswers:answers};
  expect(assessPsiDocumentEvidence(raw).isSufficient).toBe(true);
  expect(assessPsiDocumentEvidence(raw).questionCount).toBe(5);
  expect(normalizeOcrDocumentMetadata(raw).validation.isPsiForm).toBe(true);
 });
 it('rejects generic checklists, missing questions and explicit non-PSI forms',()=>{
  for(const raw of [
   {documentType:'psi-risk-assessment',isPsiForm:true,documentMarkers:['안전교육 설문지','근무 공종'],handwrittenAnswers:answers},
   {documentType:'psi-risk-assessment',isPsiForm:true,documentMarkers:['위험성평가 기록표','근무 공종'],handwrittenAnswers:answers.slice(0,3)},
   {documentType:'psi-risk-assessment',isPsiForm:false,documentMarkers:['위험성평가 기록표','근무 공종'],handwrittenAnswers:answers},
  ])expect(normalizeOcrDocumentMetadata(raw).validation.isPsiForm).toBe(false);
 });
 it('requires human review if initial form identity or nationality is uncertain',()=>{
  const q=assessOcrRoutingQuality({
   isPsiForm:true,documentMarkers:['위험성평가 기록표','근무 공종'],
   handwrittenAnswers:answers,name:'식별 대기',jobField:'갱폼',date:'2025-02-13',
   nationality:'미상',ocrConfidence:.95,fieldConfidences:{name:.3,jobField:.7,date:.9,nationality:0,handwrittenAnswers:.9},
   fullText:'자기규율 위험성평가 기록표 1. 2. 3. 4. 5.',
  });
  expect(q.isVerifiedPsiForm).toBe(true);expect(q.requiresManualReview).toBe(true);
 });
 it('binds the same top-vs-bottom fields policy to both server and fallback OCR paths',()=>{
  expect(PSI_FORM_MASTER_VERSION).toContain('legacy-compatible');
  expect(PSI_FORM_MASTER_PROMPT_BLOCK).toContain('초기');
  for(const p of ['api/gateway.ts','services/geminiService.ts']){
   const code=src(p);
   expect(code).toContain('초기 자기규율');expect(code).toContain('상단');
   expect(code).toContain('서명');expect(code).toContain('식별 대기');
  }
 });
 it('counts original one-letter Q3 risk grade as a completed answer but not arbitrary one-letter responses',()=>{
  const graded=answers.map((a,i)=>i===2?{...a,answerText:'상',koreanTranslation:'상'}:a);
  const quality=assessOcrRoutingQuality({
   isPsiForm:true,documentMarkers:['위험성평가 기록표','근무 공종'],handwrittenAnswers:graded,
   name:'합성 이름',jobField:'갱폼',date:'2025-02-13',nationality:'대한민국',
   ocrConfidence:1,fieldConfidences:{name:1,jobField:1,date:1,nationality:1,handwrittenAnswers:1},
  });
  expect(quality.answerCount).toBe(5);
  expect(quality.reasons).not.toContain('incomplete-q1-q5');
  const invalid=graded.map((a,i)=>i===1?{...a,answerText:'상',koreanTranslation:'상'}:a);
  expect(assessOcrRoutingQuality({
   isPsiForm:true,documentMarkers:['위험성평가 기록표','근무 공종'],handwrittenAnswers:invalid,
   name:'합성 이름',jobField:'갱폼',date:'2025-02-13',nationality:'대한민국',
   ocrConfidence:1,fieldConfidences:{name:1,jobField:1,date:1,nationality:1,handwrittenAnswers:1},
  }).reasons).toContain('incomplete-q1-q5');
 });
 it('keeps 1-page PDF input gate and rejects direct PPTX',()=>{
  const pdf=src('utils/ocrGatewayPayload.ts'),p=src('utils/ocrFilePolicy.ts');
  expect(pdf).toContain('OCR_GATEWAY_MAX_PDF_PAGES = 1');
  expect(pdf).toContain('OCR_GATEWAY_TARGET_BYTES = 2.85 * 1024 * 1024');
  expect(p).toContain('application/pdf');expect(p).not.toContain('presentationml.presentation');
 });
});
