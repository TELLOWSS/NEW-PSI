import {describe,it,expect} from 'vitest';
import type {WorkerRecord} from '../types';
import {getValidPerformanceScores,getBestPerformanceTrade,getReliablePerformanceTeamSignals,calculateValidScoreDeviation} from '../utils/performanceScoreSignals';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const rec=(id:string,score:unknown,jobField='형틀',date='2026-10-10',teamLeader='김반장'):WorkerRecord=>({
 id,name:id,worker_uuid:id,jobField,date,teamLeader,safetyScore:score,
} as WorkerRecord);
describe('PerformanceAnalysis unified metric trust',()=>{
 it('rejects null/empty/nonnumeric/nonfinite and retains genuine 0 and 100',()=>{
  const items=[rec('a',null),rec('b',''),rec('c',Number.NaN),rec('d',0),rec('e',100)];
  expect(getValidPerformanceScores(items).map(x=>x.safetyScore)).toEqual([0,100]);
  expect(getBestPerformanceTrade(items)).toMatchObject({avg:50,sampleCount:2});
 });
 it('does not resurrect an old value for a worker with latest unknown score',()=>{
  const result=getBestPerformanceTrade([rec('a',10,'형틀','2026-09-01'),rec('a',null,'형틀','2026-10-10'),rec('b',88,'철근')]);
  expect(result).toMatchObject({field:'철근',avg:88});
 });
 it('returns no highest team when there are no valid scores',()=>{
  expect(getBestPerformanceTrade([rec('a',undefined),rec('b','abc')])).toBeNull();
  expect(calculateValidScoreDeviation([50])).toBe(0);
 });
 it('team list requires three different *valid latest* identities',()=>{
  const base=[rec('a',50),rec('a',10,'형틀','2026-09-01'),rec('b',null),rec('c',80)];
  expect(getReliablePerformanceTeamSignals(base)).toHaveLength(0);
  const ok=getReliablePerformanceTeamSignals([...base,rec('d',100)]);
  expect(ok).toHaveLength(1);
  expect(ok[0]).toMatchObject({workerCount:3,recordCount:3,avg:(50+80+100)/3});
  expect(Number.isFinite(ok[0].safetyHabitIndex)).toBe(true);
 });
 it('standard deviation is finite and based only on provided valid score values',()=>{
  expect(calculateValidScoreDeviation([0,100])).toBe(50);
  expect(calculateValidScoreDeviation([70,70,70])).toBe(0);
 });
});
describe('monthly guidance cross-workflow buttons preserve separate outputs',()=>{
 it('keeps the education-return hub and explicit A4 and admin report destinations',()=>{
  const m=source('pages/MonthlyGuidanceReport.tsx');
  expect(m).toContain("onNavigateToPage('education-return')");
  expect(m).toContain("onNavigateToPage('a4-education-material')");
  expect(m).toContain("onNavigateToPage('reports')");
  expect(m).toContain('자동 복사하지 않습니다');
  expect(source('App.tsx')).toContain('<MonthlyGuidanceReport workerRecords={workerRecords} onNavigateToPage={navigateToPage} />');
 });
});
