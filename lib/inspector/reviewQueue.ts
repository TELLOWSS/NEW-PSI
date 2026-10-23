import type {InspectionDocument} from './types.js';

export const reviewPriorityLabel={immediate:'우선 통제 검토',soon:'빠른 개선 검토',routine:'관리 상태 확인',unknown:'우선순위 미제시'} as const;
const rank={immediate:3,soon:2,routine:1,unknown:0};
/** Saved AI proposals only. Human rejection is never reused as an AI risk signal. */
export function pendingReviewQueue(doc:InspectionDocument,excludeId='') {
 return doc.photoIds.flatMap((id,index)=>{
  const analysis=doc.analyses[id];
  if(id===excludeId||!analysis||doc.reviews[id])return [];
  const findings=analysis.risk_findings;
  const proposals=(findings===undefined?analysis.recommended_controls:findings)||[];
  const lead=proposals.reduce<typeof proposals[number]|undefined>((best,row)=>!best||rank[row.priority]>rank[best.priority]?row:best,undefined);
  const priority=lead?.priority||'unknown';
  return [{id,number:index+1,priority,label:reviewPriorityLabel[priority],problem:lead&&'problem' in lead?lead.problem:lead?.action||'구체적인 위험 단서가 제시되지 않았습니다',action:lead?.action||'',rank:rank[priority]}];
 }).sort((a,b)=>b.rank-a.rank||a.number-b.number);
}
