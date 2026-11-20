/**
 * Site-specific CEO/HQ training briefing. All records are synthetic,
 * in-browser suggestions until separately verified by qualified staff.
 */
export type BriefingIncident = {
 id:number; date:string; siteAlias:string; zone:'기초'|'지하'|'지상'|'옥탑';
 processId:string; kind:string; summary:string;
};
export type BriefingProcess = {
 id:string;title:string;area:string;zones:readonly string[];
 hazards:readonly string[];inspection:readonly string[];
};
export type BriefingAction = {
 incidentId:number;title:string;state:string;controlClass:string;dueOn:string;
};
export type BriefingVisit = {site:string;date:string;objective:string};
export type SiteTrainingInput={
 siteAlias:string; year:number; visitDate:string; stageNote:string;
 incidents:readonly BriefingIncident[];processes:readonly BriefingProcess[];
 actions:readonly BriefingAction[];visits:readonly BriefingVisit[];
};
export type TrainingBrief={
 status:'needs_data'|'review_draft';
 siteAlias:string; visitDate:string; year:number;stageNote:string;
 caseCount:number; otherSiteRecordsExcluded:number;
 monthlyCounts:readonly number[];
 zoneBreakdown:readonly {zone:string;cases:number}[];
 tradeBreakdown:readonly {processId:string;processTitle:string;cases:number}[];
 highPriority:readonly string[];
 relatedCases:readonly BriefingIncident[];
 actionNotes:readonly string[];
 sourceWarnings:readonly string[];
 report:string;
};
const dateOk=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00.000Z').toISOString().slice(0,10)===s;
const ZONES=['기초','지하','지상','옥탑'];
const clean=(s:string,max:number)=>s.trim().slice(0,max);
export function buildSiteTrainingBrief(input:SiteTrainingInput):TrainingBrief{
 const siteAlias=clean(input.siteAlias,40);
 const stageNote=clean(input.stageNote,240);
 if(siteAlias.length<2)throw new Error('교육 대상 현장 구분명을 입력하세요.');
 if(!Number.isInteger(input.year)||input.year<2020||input.year>2100)throw new Error('자료 연도를 확인하세요.');
 if(!dateOk(input.visitDate))throw new Error('교육 예정일 형식을 확인하세요.');
 const selected=input.incidents.filter(c=>c.siteAlias===siteAlias&&c.date.startsWith(String(input.year)+'-'));
 if(selected.some(c=>!dateOk(c.date)||!ZONES.includes(c.zone)))throw new Error('발생일·공사구간 데이터가 유효하지 않습니다.');
 const otherSiteRecordsExcluded=input.incidents.filter(c=>c.siteAlias!==siteAlias).length;
 const month=Array.from({length:12},(_,n)=>selected.filter(c=>Number(c.date.slice(5,7))===n+1).length);
 const zoneBreakdown=ZONES.map(zone=>({zone,cases:selected.filter(c=>c.zone===zone).length}));
 const tradeBreakdown=input.processes.map(p=>({
   processId:p.id,processTitle:p.title,cases:selected.filter(c=>c.processId===p.id).length
 })).filter(p=>p.cases>0);
 const relatedActions=input.actions.filter(a=>selected.some(c=>c.id===a.incidentId));
 const actionNotes=relatedActions.map(a=>a.title+' — '+a.state+' / '+a.dueOn+' (이행 진위·완료 검증 전)');
 const priorityProcesses=[...new Set(selected.map(c=>c.processId))]
   .map(id=>input.processes.find(p=>p.id===id)).filter((p):p is BriefingProcess=>Boolean(p));
 const highPriority=[...new Set(priorityProcesses.flatMap(p=>p.inspection))].slice(0,7);
 const sourceWarnings=[
  '현장·공사단계는 시연 입력값으로 확인되지 않았습니다.',
  '사고사례는 사실관계·산재 상태·법정 보고 여부가 검증되지 않았습니다.',
  '공정별 사고건수는 근로시간·작업량을 반영하지 않아 위험도 순위가 아닙니다.',
  'AI 사고원인 확정, 교육 승인·이수 확인 및 대표이사 실제 지시사항은 미연결입니다.'
 ];
 const lines=[
   '[대표이사 / 본사 현장 맞춤 안전교육 · 검토 초안]',
   '현장: '+siteAlias+' / 예정일: '+input.visitDate+' / 사고자료 연도: '+input.year,
   '현장 공사진행: '+(stageNote||'미입력 · 현장 확인 필요'),
   '자료 범위: 해당 현장 별칭과 해당 연도에 등록한 비식별 시연 사고만 포함',
   '사고자료: '+selected.length+'건 (실제 사고 총수 아님)',
   '월별 등록건수: '+month.map((count,index)=>(index+1)+'월 '+count+'건').join(' / '),
   '공사구간: '+zoneBreakdown.map(v=>v.zone+' '+v.cases+'건').join(' · '),
   '',
   '[사고사례 · 현장 확인 필요]',
   ...(selected.length?selected.map(c=>c.date+' '+c.zone+' / '+(input.processes.find(p=>p.id===c.processId)?.title||c.processId)+' / '+c.kind+' — '+clean(c.summary,150)):['자료 없음: 실제 사고 0건으로 해석하면 안 됩니다.']),
   '',
   '[중점관리 확인사항]',
   ...(highPriority.length?highPriority.map((s,i)=>(i+1)+'. '+s):['공정 진행 현황과 중점 위험을 현장에서 확인 후 입력하세요.']),
   '',
   '[조치·재점검 상태 · 확정 아님]',
   ...(actionNotes.length?actionNotes:['관련 개선조치 시연기록 없음']),
   '',
   '[본사 검토 및 방문 교육 준비]',
   '사고원인·조치 정합성 검증, 사진·진술 원본 확인, 해당 현장 작업계획과 비교',
   '이사·대표이사 교육안 검토 및 방문 시 지시사항 등록 절차는 정식 권한 기능 필요',
   '※ 본 문서는 임시 초안이며 현장별 실제 자료·본사 승인·PPT/PDF 자동 작성은 연결되지 않았습니다.'
 ];
 return {
  status: selected.length&&stageNote?'review_draft':'needs_data',
  siteAlias,year:input.year,visitDate:input.visitDate,stageNote,
  caseCount:selected.length,otherSiteRecordsExcluded,monthlyCounts:month,zoneBreakdown,
  tradeBreakdown,highPriority,relatedCases:selected,actionNotes,sourceWarnings,
  report:lines.join('\n')
 };
}
