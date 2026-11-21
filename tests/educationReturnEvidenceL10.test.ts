import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {EducationReturnSummary} from '../utils/educationReturnSummary';
import type {PracticeVerificationSummary} from '../utils/practiceVerification';
import {buildEducationReturnEvidenceOverview} from '../utils/educationReturnEvidenceOverview';

const summary=(patch:Partial<EducationReturnSummary>={}):EducationReturnSummary=>({
 totalRecords:12,completedRecords:9,reviewRequiredRecords:3,supportedLanguageCount:4,
 repeatedRiskKeywords:['미끄러짐'],...patch,
} as EducationReturnSummary);
const practice=(patch:Partial<PracticeVerificationSummary>={}):PracticeVerificationSummary=>({
 asOfDate:'2026-11-22',periodStartDate:'2026-11-01',
 educationDelivered:6,understandingConfirmed:4,understandingNeedsHelp:2,
 fieldObserved:3,fieldPositiveObservation:2,needsFieldRecheck:2,
 overdueFieldRecheck:1,rechecked:1,conflictingRecords:0,educationFocus:[],
 ...patch,
});
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('L10 monthly education closed-loop evidence without auto approval',()=>{
 it('orders source review, authoring, language, delivery, comprehension and field verification',()=>{
  const o=buildEducationReturnEvidenceOverview(summary(),practice());
  expect(o.steps.map(x=>x.key)).toEqual(['source','authoring','language','delivery','understanding','field']);
  expect(o.sourceScope).toContain('관리자 승인 기록 9건');
  expect(o.steps[0].status).toContain('관리자 확인 필요 3건');
  expect(o.steps[1].status).toContain('발행 미확인');
  expect(o.steps[2].status).toContain('검증 별도');
  expect(o.steps[3].status).toContain('전달 이력 6회');
  expect(o.steps[4].status).toContain('설명 보완 2회');
  expect(o.steps[5].status).toContain('기한 경과 1건');
  expect(o.guarantee).toBe('not-approved');
 });
 it('does not infer published material or language versions from existing worker language codes',()=>{
  const o=buildEducationReturnEvidenceOverview(summary({supportedLanguageCount:11,completedRecords:12,reviewRequiredRecords:0}),practice());
  expect(o.steps[0].tone).toBe('recorded');
  expect(o.steps[1].status).toContain('발행 미확인');
  expect(o.steps[2].detail).toContain('번역본 보유 수가 아닙니다');
  expect(o.steps[2].detail).toContain('11개 언어');
  expect(o.steps[2].destination).toBe('a4-education-material');
  expect(o.steps[2].tone).toBe('review');
 });
 it('keeps absent data unknown rather than claiming the site is safe or everyone attended',()=>{
  const o=buildEducationReturnEvidenceOverview(summary({
   totalRecords:0,completedRecords:0,reviewRequiredRecords:0,supportedLanguageCount:0,repeatedRiskKeywords:[],
  }),practice({
   educationDelivered:0,understandingConfirmed:0,understandingNeedsHelp:0,needsFieldRecheck:0,overdueFieldRecheck:0,
  }));
  expect(o.steps[0].status).toBe('기록 없음');
  expect(o.steps[1].status).toBe('자료 작성 근거 부족');
  expect(o.steps[3].status).toBe('교육 전달 기록 없음');
  expect(o.steps[4].status).toBe('이해 확인 기록 없음');
  expect(o.steps[5].status).toContain('현장 안전 미확정');
  expect(o.risksNote).toContain('위험이 없다는 뜻은 아닙니다');
 });
 it('surfaces conflicts without including names, per-worker raw text or invented translations',()=>{
  const o=buildEducationReturnEvidenceOverview(summary(),practice({conflictingRecords:2}));
  expect(o.steps[5].tone).toBe('review');
  expect(o.steps[5].status).toContain('상충 이력 2건');
  expect(JSON.stringify(o)).not.toMatch(/010-\d{4}|홍길동|본인개별점수|자동 승인|원어민 검증 완료/);
 });
 it('treats recorded delivery separately from understanding and safety observations',()=>{
  const o=buildEducationReturnEvidenceOverview(summary(),practice({
   educationDelivered:30,understandingConfirmed:0,understandingNeedsHelp:0,needsFieldRecheck:0,
  }));
  expect(o.steps[3].status).toContain('수신 범위 별도');
  expect(o.steps[4].status).toContain('기록 없음');
  expect(o.steps[5].status).toContain('현장 안전 미확정');
  expect(o.steps[3].detail).toContain('전원의 수신');
 });
 it('does not mutate source totals, perform external calls or claim issuance',()=>{
  const a=Object.freeze(summary()),b=Object.freeze(practice());
  const old=JSON.stringify([a,b]);
  buildEducationReturnEvidenceOverview(a,b);
  expect(JSON.stringify([a,b])).toBe(old);
  const logic=read('utils/educationReturnEvidenceOverview.ts');
  const component=read('components/education/EducationReturnEvidencePanel.tsx');
  const page=read('pages/EducationReturn.tsx');
  expect(page).toContain('<EducationReturnEvidencePanel overview={evidenceOverview} onNavigate={onNavigateToPage}/>');
  expect(component).toContain('data-education-return="evidence-loop-l10"');
  expect(component).toContain('aria-label="교육 환류 검증 단계"');
  expect(component).toContain('onNavigate(stage.destination as Page)');
  expect(logic+component).not.toMatch(/fetch\s*\(|indexedDB\.|localStorage|sessionStorage|setInterval\s*\(/i);
 });
});
