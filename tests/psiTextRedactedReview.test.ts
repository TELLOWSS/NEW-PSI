import {describe,it,expect,vi} from 'vitest';
import type {WorkerRecord} from '../types';
import {redactPsiTextContent,normalizePsiPrivacyTerms} from '../utils/psiTextPrivacyRedaction';

class MockZip {
  private data=new Map<string,Uint8Array>();
  file(path:string,content?:Uint8Array|string):{async:(kind:'string'|'uint8array')=>Promise<string|Uint8Array>}|null{
    if(content===undefined){
      const item=this.data.get(path);
      return item?{async:async kind=>kind==='string'?new TextDecoder().decode(item):item}:null;
    }
    this.data.set(path,typeof content==='string'?new TextEncoder().encode(content):content);
    return null;
  }
  get files():Record<string,{dir:boolean}>{
    return Object.fromEntries([...this.data.keys()].map(path=>[path,{dir:false}]));
  }
  async generateAsync():Promise<Blob>{
    return new Blob([JSON.stringify([...this.data].map(([path,bytes])=>[path,[...bytes]]))],
      {type:'application/zip'});
  }
  async loadAsync(blob:Blob):Promise<MockZip>{
    const data=JSON.parse(await blob.text()) as Array<[string,number[]]>;
    this.data=new Map(data.map(([path,bytes])=>[path,Uint8Array.from(bytes)]));
    return this;
  }
}
vi.mock('../utils/externalScripts',()=>({
  ensureJsZip:async()=>MockZip,
  ensureFileSaver:async()=>()=>undefined,
}));

import {buildPsiEvidenceArchive,verifyPsiEvidenceArchive} from '../utils/psiEvidenceArchive';
import {buildPsiTextRedactedReviewArchive} from '../utils/psiTextRedactedArchive';

const sample=():WorkerRecord=>({
  id:'synthetic-worker-001',name:'가상근로자',language:'zh',jobField:'형틀',date:'2026-10-20',
  originalImage:'data:image/jpeg;base64,QUJDRA==',
  handwrittenAnswers:[{
    questionNumber:'Q1',
    answerText:'高处作业，联系 010-1234-5678',
    koreanTranslation:'가상관리자에게 전화하세요: 010-1234-5678',
  }],
  riskFollowupEvents:[{
    id:'case-01',caseId:'case-01',questionNumber:2,
    actor:'가상관리자',status:'open',timestamp:'2026-10-20T10:00:00Z',
    owner:'가상반장',actionDetail:'가상관리자와 현장 점검 예정',
  }],
} as unknown as WorkerRecord);
const fixture=async()=>{
  const source=await buildPsiEvidenceArchive(sample(),{exportedAt:'2026-11-01T00:00:00Z'});
  const verification=await verifyPsiEvidenceArchive(source.blob,source.zipSha256);
  expect(verification.verified).toBe(true);
  return {source,verification};
};

describe('PII text masking rules',()=>{
  it('masks direct JSON identifier fields, known terms, email and phones without deleting safety facts',()=>{
    const source=JSON.stringify({record:{
      id:'user-id',workerName:'가상근로자',approvedBy:'가상관리자',
      phone:'010-1234-5678',email:'test@example.com',
      jobField:'형틀',
    },answers:[{originalText:'01012345678·가상근로자·추락 위험'}]});
    const out=redactPsiTextContent(source,'json',['가상근로자','가상관리자']);
    const record=JSON.parse(out.text).record;
    expect(record.id).toBe('[비공개]');
    expect(record.workerName).toBe('[비공개]');
    expect(record.approvedBy).toBe('[비공개]');
    expect(record.jobField).toBe('형틀');
    expect(out.text).not.toContain('01012345678');
    expect(out.text).not.toContain('example.com');
    expect(out.text).toContain('추락 위험');
    expect(out.disclaimer).toBe('MANUAL_REVIEW_REQUIRED');
  });
  it('handles literal names including regex punctuation and visible TXT identifiers',()=>{
    const out=redactPsiTextContent(
      '가상(반장)·가상(반장) test@company.kr 010-2345-6789 800101-1234567',
      'txt',['가상(반장)']);
    expect(out.text).not.toContain('가상(반장)');
    expect(out.text).not.toContain('test@company.kr');
    expect(out.text).not.toContain('010-2345-6789');
    expect(out.text).not.toContain('800101-1234567');
  });
  it('rejects malformed documents and unsafe manual terms',()=>{
    expect(()=>redactPsiTextContent('{','json',['가상근로자'])).toThrow('해석');
    expect(()=>normalizePsiPrivacyTerms(['김'])).toThrow('2~100');
    expect(()=>normalizePsiPrivacyTerms(Array.from({length:31},(_,i)=>'가상'+i))).toThrow('30개');
  });
});
describe('PII masked internal text-only ZIP',()=>{
 it('includes only sanitized JSON+TXT and no original image, original JSON or source manifest',async()=>{
   const {source,verification}=await fixture();
   const draft=await buildPsiTextRedactedReviewArchive(
      source.blob,verification,['record/snapshot.json','record/timeline.txt'],
      'synthetic-worker-001',['가상근로자','가상관리자','가상반장'],'2026-11-01T02:00:00Z');
   const result=await new MockZip().loadAsync(draft.blob);
   const paths=Object.keys(result.files);
   expect(paths).toEqual([
     'REVIEW_TEXT_01.json','REVIEW_TEXT_02.txt','REVIEW_MANIFEST.json','SHA256SUMS.txt'
   ]);
   const json=await result.file('REVIEW_TEXT_01.json')!.async('string') as string;
   const timeline=await result.file('REVIEW_TEXT_02.txt')!.async('string') as string;
   for(const value of ['가상근로자','가상관리자','가상반장','010-1234-5678','synthetic-worker-001']){
      expect(json+timeline).not.toContain(value);
   }
   expect(json).toContain('高处作业');
   expect(json).toContain('형틀');
   expect(draft.manifest.imagesExcluded).toBe(true);
   expect(draft.manifest.automatedPersonalDataClearance).toBe(false);
   expect(draft.manifest.humanContentReviewRequired).toBe(true);
   expect(draft.manifest.legallyApprovedForRelease).toBe(false);
   expect(draft.zipSha256).toMatch(/^[a-f0-9]{64}$/);
   const preserved=await new MockZip().loadAsync(source.blob);
   const originalSnapshot=await preserved.file('record/snapshot.json')!.async('string') as string;
   expect(originalSnapshot).toContain('synthetic-worker-001');
 });
 it('rejects images, duplicates, wrong record, unanchored verification and tampered source',async()=>{
   const {source,verification}=await fixture();
   const original=['record/timeline.txt'],terms=['가상근로자'];
   await expect(buildPsiTextRedactedReviewArchive(source.blob,verification,
     ['assets/currently-stored-original-form.jpg'],'synthetic-worker-001',terms)).rejects.toThrow('사진');
   await expect(buildPsiTextRedactedReviewArchive(source.blob,verification,
     [...original,...original],'synthetic-worker-001',terms)).rejects.toThrow('2종');
   await expect(buildPsiTextRedactedReviewArchive(source.blob,verification,
     original,'wrong-record',terms)).rejects.toThrow('근로자 기록');
   await expect(buildPsiTextRedactedReviewArchive(source.blob,{...verification,externallyAnchored:false},
     original,'synthetic-worker-001',terms)).rejects.toThrow('근로자 기록');
   const parsed=JSON.parse(await source.blob.text()) as Array<[string,number[]]>;
   parsed.find(([path])=>path==='record/timeline.txt')![1].push(99);
   const altered=new Blob([JSON.stringify(parsed)],{type:'application/zip'});
   await expect(buildPsiTextRedactedReviewArchive(altered,verification,
     original,'synthetic-worker-001',terms)).rejects.toThrow('원본 ZIP');
 });
});
