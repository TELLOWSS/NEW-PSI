import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {WorkerRecord} from '../types';
import {buildGroupScoreChartEvidence,buildMonthlyScoreEvidencePoints} from '../utils/livingChartEvidenceL11';
import {summarizeScoreMetricEvidence} from '../utils/scoreMetricEvidence';

const sample=(id:string,date:string,score:number,patch:Partial<WorkerRecord>={})=>({
 id,worker_uuid:id,date,safetyScore:score,jobField:'형틀',teamLeader:'합성 관리자 A',...patch,
} as WorkerRecord);
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');

describe('L11 chart evidence uses observed denominators rather than invented zeros',()=>{
 it('empty monthly history returns no synthetic month or point',()=>{
  expect(buildMonthlyScoreEvidencePoints([])).toEqual([]);
 });
 it('preserves a legitimate zero while missing monthly score stays null',()=>{
  const points=buildMonthlyScoreEvidencePoints([
   sample('w1','2026-09-20',0),
   sample('w2','2026-10-20',Number.NaN),
   sample('w3','2026-10-21',Number.POSITIVE_INFINITY),
   sample('w4','2026-11-20',75),
  ]);
  expect(points.map(p=>[p.month,p.value,p.valid,p.excluded])).toEqual([
   ['2026-09',0,1,0],['2026-10',null,0,2],['2026-11',75,1,0],
  ]);
 });
 it('does not revive a stale previous score when same worker newest is invalid',()=>{
  const p=buildMonthlyScoreEvidencePoints([
   sample('a-old','2026-11-02',88,{worker_uuid:'same-worker'}),
   sample('a-new','2026-11-20',Number.NaN,{worker_uuid:'same-worker'}),
   sample('b','2026-11-19',40),
  ]);
  expect(p).toMatchObject([{valid:1,excluded:1,population:2,value:40}]);
 });
 it('excludes invalid group scores and never uses them in spread heuristic',()=>{
  const e=buildGroupScoreChartEvidence([
   sample('a','2026-11-01',80),
   sample('b','2026-11-02',Number.NaN),
   sample('c','2026-11-03',60),
   sample('d','2026-11-04',101,{jobField:'철근'}),
  ]);
  expect(e.rows).toHaveLength(1);
  expect(e.rows[0]).toMatchObject({label:'형틀',average:70,valid:2,total:3,excluded:1});
  expect(e.groupsExcludedNoScore).toBe(1);
  expect(e.consistencyIsIllustrative).toBe(true);
 });
 it('team chart anonymizes the team leader, even with identity in grouping keys',()=>{
  const e=buildGroupScoreChartEvidence([
   sample('a','2026-11-01',70,{teamLeader:'실명 이현장'}),
   sample('b','2026-11-02',80,{teamLeader:'실명 이현장'}),
  ],'team');
  expect(e.rows).toHaveLength(1);
  expect(e.rows[0].label).toBe('작업팀 1 · 형틀');
  expect(JSON.stringify(e)).not.toContain('실명 이현장');
  expect(e.rows[0].valid).toBe(2);
 });
 it('one valid score does not imply perfect consistency of the team',()=>{
  const e=buildGroupScoreChartEvidence([sample('a','2026-11-01',90)],'team');
  expect(e.rows[0].spreadReference).toBeNull();
 });
 it('score coverage keeps positive-zero and penalty-zero separate from missing, with real item denominators',()=>{
  const rows=summarizeScoreMetricEvidence([
   sample('a','2026-11-01',50,{scoreBreakdown:{psychological:0,repeatViolationPenalty:0} as WorkerRecord['scoreBreakdown']}),
   sample('b','2026-11-02',60,{scoreBreakdown:{psychological:11} as WorkerRecord['scoreBreakdown']}),
  ]);
  expect(rows.find(r=>r.key==='psychological')).toMatchObject({average:0,valid:1,total:2,excluded:1});
  expect(rows.find(r=>r.key==='repeatViolationPenalty')).toMatchObject({average:0,valid:1,total:2,missing:1});
 });
 it('charts and monthly guidance show missing evidence, denominators, and no automated field clearance',()=>{
  const monthly=read('components/charts/MonthlyTrendChart.tsx');
  const radar=read('components/charts/FieldRadarChart.tsx');
  const panel=read('components/charts/SixMetricCoverageL11.tsx');
  const guide=read('pages/MonthlyGuidanceReport.tsx');
  expect(monthly).toContain('buildMonthlyScoreEvidencePoints(records)');
  expect(monthly).toContain('data-l11-trend-empty="true"');
  expect(monthly).not.toContain('dataPoints = [0]');
  expect(radar).toContain('buildGroupScoreChartEvidence(records, mode)');
  expect(radar).toContain('data-l11-group-chart="empty"');
  expect(radar).not.toContain("labels: labels.length > 0 ? labels : ['데이터 없음']");
  expect(panel).toContain('data-monthly-guidance="l11-six-metric-evidence"');
  expect(panel).toContain('유효 {row.valid}/{row.total}');
  expect(panel).toContain("row.key==='repeatViolationPenalty'");
  expect(guide).toContain('<SixMetricCoverageL11 rows={report.metricEvidence} period={assessmentPeriodLabel}/>');
  expect(guide).toContain("metric.key !== 'repeatViolationPenalty'");
  expect(guide).toContain('응답점수 상승');
  expect(guide).not.toContain("delta > 0 ? '개선 흐름'");
 });
});
