/** HQ-SAFE executive overview: in-memory demonstration rollup only. No network, health or legal status. */
export const CONSTRUCTION_ZONES = ['기초','지하','지상','옥탑'] as const;
export type HqZone = typeof CONSTRUCTION_ZONES[number];

export interface HqProcessRef { id:string; area:string; title:string; zones:readonly string[] }
export interface HqCaseRef { id:number; date:string; zone:string; processId:string }
export interface HqVisitRef { id:number; date:string; status:string }
export interface HqActionRef { id:string; incidentId:number; dueOn:string; state:string }
export interface HqReviewRef { incidentId:number; status:string }
export interface HqOverviewInput {
  processes:readonly HqProcessRef[];
  cases:readonly HqCaseRef[];
  visits:readonly HqVisitRef[];
  actions:readonly HqActionRef[];
  reviews:readonly HqReviewRef[];
}
export interface HqOverview {
  totalVisits:number;
  scheduledVisits:number;
  incidentCases:number;
  casesAwaitingReview:number;
  reviewRequests:number;
  linkedActionCount:number;
  overdueOpenActions:number;
  reinspectionRequests:number;
  unlinkedActionIds:readonly string[];
  zones:ReadonlyArray<{zone:HqZone;cases:number;processes:number}>;
  processGroups:ReadonlyArray<{name:string;cases:number;availableProcesses:number}>;
}
const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day+'T00:00:00Z').toISOString().startsWith(day);

/**
 * Counts are not exposure-adjusted rates or measures of safety.
 * Case and action counts only reflect session records; empty data never implies zero risk.
 */
export function summarizeHqOverview(input:HqOverviewInput,asOf:string):HqOverview {
  if(!validDay(asOf)) throw new Error('집계 기준일 형식이 잘못되었습니다.');
  const caseById=new Map(input.cases.map(x=>[x.id,x] as const));
  if(caseById.size!==input.cases.length) throw new Error('중복 사고 식별자가 있습니다.');
  const procById=new Map(input.processes.map(x=>[x.id,x] as const));
  const linkedActions=input.actions.filter(x=>caseById.has(x.incidentId));
  const orphanIds=input.actions.filter(x=>!caseById.has(x.incidentId)).map(x=>x.id);
  const latestReviewById=new Map(input.reviews.filter(x=>caseById.has(x.incidentId)).map(x=>[x.incidentId,x]));
  const groups=[...new Set(input.processes.map(x=>x.area))];
  return {
    totalVisits:input.visits.length,
    scheduledVisits:input.visits.filter(x=>x.status==='예정').length,
    incidentCases:input.cases.length,
    casesAwaitingReview:input.cases.filter(x=>latestReviewById.get(x.id)?.status!=='requested').length,
    reviewRequests:[...latestReviewById.values()].filter(x=>x.status==='requested').length,
    linkedActionCount:linkedActions.length,
    overdueOpenActions:linkedActions.filter(x=>x.dueOn<asOf).length,
    reinspectionRequests:linkedActions.filter(x=>x.state==='reinspection_requested').length,
    unlinkedActionIds:orphanIds,
    zones:CONSTRUCTION_ZONES.map(zone=>({
      zone,cases:input.cases.filter(x=>x.zone===zone).length,
      processes:input.processes.filter(x=>x.zones.includes(zone)).length
    })),
    processGroups:groups.map(name=>({
      name,availableProcesses:input.processes.filter(x=>x.area===name).length,
      cases:input.cases.filter(x=>procById.get(x.processId)?.area===name).length
    }))
  };
}
