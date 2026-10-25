import {describe,it,expect} from 'vitest';
import type {WorkerRecord} from '../types';
import {selectOperatorNextTask} from '../utils/operatorNextTask';
import {readFileSync} from 'node:fs';
const rec=(id:string,safetyScore:unknown,patch:Partial<WorkerRecord>={}):WorkerRecord=>({
 id,worker_uuid:id,name:id,jobField:'형틀',date:'2026-10-25',safetyScore,selfAssessedRiskLevel:'중',...patch,
} as WorkerRecord);
describe('operator first action is advisory only, not server work approval',()=>{
 it('prioritizes recording when nothing exists',()=>{expect(selectOperatorNextTask([])).toMatchObject({page:'ocr-analysis',status:'start'});});
 it('gives recorded stop signal priority but does not approve a stop or resumption',()=>{
  expect(selectOperatorNextTask([rec('a',90,{riskDecision:'CRITICAL_STOP'})])).toMatchObject({page:'safety-compliance-hub',status:'review'});
 });
 it('does not let a newer missing worker score resurrect a previous low score',()=>{
  const rows=[rec('a',0,{date:'2026-10-15'}),rec('a',null,{date:'2026-10-25'})];
  expect(selectOperatorNextTask(rows)).toMatchObject({page:'ocr-analysis',status:'start'});
 });
 it('honors self-declared high risk even with missing numeric score',()=>{
  expect(selectOperatorNextTask([rec('a',null,{selfAssessedRiskLevel:'상'})])).toMatchObject({status:'review',page:'ocr-analysis'});
 });
 it('returns next review before education, and education only when latest records have valid score',()=>{
  expect(selectOperatorNextTask([rec('a',90,{reviewStatus:'PENDING'})])).toMatchObject({status:'review'});
  expect(selectOperatorNextTask([rec('a',90)])).toMatchObject({status:'education',page:'education-return'});
 });
 it('does not duplicate report/A4 footers when mini-cards already navigate, and keeps independent Inspector access',()=>{
  const source=readFileSync(new URL('../components/IntegratedWorkBoard.tsx',import.meta.url),'utf8');
  expect(source).toContain('data-psi-next-task');
  expect(source).toContain("setCurrentPage('safety-inspector')");
  expect(source).toContain('인스펙터 서버·브라우저 현장 이슈');
  expect(source).toContain('교육 환류 센터 열기');
  expect(source).not.toContain('👤 근로자 개인별 리포트 보기');
  expect(source).not.toContain('📑 위험성평가 교육자료 스튜디오 열기');
 });
});
