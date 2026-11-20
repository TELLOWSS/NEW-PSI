import {describe,expect,it} from 'vitest';
import {buildSiteTrainingBrief,type SiteTrainingInput} from '../components/hq/siteTrainingBriefModel';

const sample:SiteTrainingInput={
 siteAlias:'A현장',year:2026,visitDate:'2026-11-25',stageNote:'지하 합벽 시공과 지상층 형틀 설치 예정',
 incidents:[
  {id:1,siteAlias:'A현장',date:'2026-03-04',zone:'지하',processId:'underground-wall',kind:'끼임',summary:'합성 사고시연 사례 중 협착 가능성 조사'},
  {id:2,siteAlias:'A현장',date:'2026-11-12',zone:'지상',processId:'formwork',kind:'넘어짐',summary:'가상 형틀작업 중 통로 걸림 위험'},
  {id:3,siteAlias:'B현장',date:'2026-11-11',zone:'지상',processId:'alform',kind:'추락',summary:'다른 현장 사고자료로 제외해야 함'},
  {id:4,siteAlias:'A현장',date:'2025-11-08',zone:'지하',processId:'formwork',kind:'끼임',summary:'다른 연도는 이번 교육에서 제외'}
 ],
 processes:[
  {id:'underground-wall',title:'지하 합벽·벽체 RC',area:'지하 RC',zones:['지하'],hazards:['측압'],inspection:['합벽 긴결 및 전도방지 점검']},
  {id:'formwork',title:'일반 형틀',area:'일반 형틀',zones:['지하','지상'],hazards:['추락'],inspection:['동선 통행과 작업발판 확인']},
  {id:'alform',title:'AL폼',area:'지상 골조',zones:['지상'],hazards:['낙하'],inspection:['AL폼 설치상태 확인']}
 ],
 actions:[{incidentId:1,title:'합벽 전도방지 상태 재점검',state:'reinspection_requested',controlClass:'engineering',dueOn:'2026-11-24'},
 {incidentId:3,title:'B현장 조치 기록',state:'open',controlClass:'management',dueOn:'2026-11-29'}],
 visits:[{site:'A현장',date:'2026-11-25',objective:'안전교육'}]
};
describe('site-targeted CEO training preview and case filters',()=>{
 it('includes only chosen site and year and retains underground RC vs general formwork distinction',()=>{
  const v=buildSiteTrainingBrief(sample);
  expect(v.caseCount).toBe(2);
  expect(v.otherSiteRecordsExcluded).toBe(1);
  expect(v.monthlyCounts[2]).toBe(1);
  expect(v.monthlyCounts[10]).toBe(1);
  expect(v.zoneBreakdown.find(x=>x.zone==='지하')?.cases).toBe(1);
  expect(v.tradeBreakdown.map(x=>x.processTitle)).toEqual(['지하 합벽·벽체 RC','일반 형틀']);
  expect(v.report).not.toContain('B현장 조치 기록');
  expect(v.report).not.toContain('다른 현장 사고자료');
  expect(v.report).not.toContain('다른 연도');
  expect(v.report).toContain('이행 진위·완료 검증 전');
  expect(v.report).toContain('공식 승인 전');
 });
 it('refuses invalid dates or site name and treats no records as unknown, NOT zero safety risk',()=>{
  expect(()=>buildSiteTrainingBrief({...sample,siteAlias:' '})).toThrow();
  expect(()=>buildSiteTrainingBrief({...sample,visitDate:'2026-02-30'})).toThrow();
  const v=buildSiteTrainingBrief({...sample,siteAlias:'C현장'});
  expect(v.status).toBe('needs_data');
  expect(v.caseCount).toBe(0);
  expect(v.report).toContain('실제 사고 0건으로 해석하면 안 됩니다');
 });
});
