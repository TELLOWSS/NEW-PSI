import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildA4ReviewLedger,buildA4ReviewLedgerCsv,buildA4ReviewLedgerText,A4_REVIEW_LEDGER_STATUSES} from '../utils/educationA4ReviewLedger';
import {a4ReviewKey,type A4OutputReview,type A4ReviewerRole} from '../utils/educationA4LocalReview';
import {CURRENT_SITE_TRAINING_LANGUAGE_CODES,TRAINING_LANGUAGE_LABELS} from '../utils/constructionTrainingTranslation';
const month='2026-12',workType='형틀',hash='a'.repeat(64),changed='b'.repeat(64);
const stored=(language:string,role:A4ReviewerRole):A4OutputReview=>({
 version:1,key:a4ReviewKey(month,workType,language),language,role,fingerprint:hash,
 checkedAt:'2026-11-23T00:00:00.000Z',
 checks:{fileOpened:true,glyphsLegible:true,safetyMeaningCompared:true}
});
const ledger=(language:string,record:A4OutputReview,sha=hash,stale=false)=>buildA4ReviewLedger({
 educationMonth:month,workType,languages:[language],
 labels:TRAINING_LANGUAGE_LABELS,fingerprints:{[language]:sha},
 stored:{[record.key]:record},translationNeedsRefresh:stale
})[0];
describe('L41 P4 native-language meaning evidence remains separate from manager-only output QA',()=>{
 it('requires a native/joint self-check for all ten translated site languages, keeps manager proof honest',()=>{
  expect(CURRENT_SITE_TRAINING_LANGUAGE_CODES).toHaveLength(11);
  for(const code of CURRENT_SITE_TRAINING_LANGUAGE_CODES){
   if(code==='ko-KR')continue;
   const manager=ledger(code,stored(code,'site-manager'));
   expect(manager.status).toBe('native-review-needed');
   expect(manager.role).toBe('site-manager');
   expect(manager.checkedAt).toBe('2026-11-23T00:00:00.000Z');
   for(const role of ['native-language-reviewer','joint-review'] as const){
    const reviewed=ledger(code,stored(code,role));
    expect(reviewed.status).toBe('recorded');
    expect(reviewed.role).toBe(role);
   }
  }
  expect(ledger('ko-KR',stored('ko-KR','site-manager')).status).toBe('recorded');
 });
 it('stale translations or edited SHA cannot retain role/timestamp or native status',()=>{
  const record=stored('my-MM','site-manager');
  for(const row of [ledger('my-MM',record,changed),ledger('my-MM',record,hash,true)]){
   expect(row.status).toBe('recheck');
   expect(row.role).toBeNull();
   expect(row.checkedAt).toBeNull();
  }
  expect(ledger('my-MM',record,'').status).toBe('calculating');
 });
 it('CSV and copied summary explicitly distinguish manager-only from native-role review',()=>{
  const manager=ledger('km-KH',stored('km-KH','site-manager'));
  const csv=buildA4ReviewLedgerCsv(month,workType,[manager]);
  expect(csv).toContain(A4_REVIEW_LEDGER_STATUSES['native-review-needed']);
  expect(csv).toContain('현장 관리자');
  expect(csv).not.toContain('근로자');
  expect(buildA4ReviewLedgerText([manager])).toContain('모국어 의미 대조 필요');
 });
 it('on-screen chips/counter/selected role warning reflect native-pending rather than green confirmation',()=>{
  const page=readFileSync('pages/A4EducationMaterial.tsx','utf8');
  expect(page).toContain("const managerOnly = ledgerStatus === 'native-review-needed'");
  expect(page).toContain("data-psi-a4-review-status={currentNativeReviewNeeded ? 'native-review-needed'");
  expect(page).toContain('data-psi-a4-native-role-caution="true"');
  expect(page).toContain('모국어 대조 대기 {nativeReviewNeededCount}개');
  expect(page).toContain('관리자 확인만으로 해당 모국어의 위험·금지·작업중지 의미 검수 완료로 집계되지 않습니다.');
 });
});
