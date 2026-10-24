import type {VisionImport} from './types.js';
export const workStages=['작업 전','작업 중','정리 중','보관 중','사용 중지','모르겠음'] as const;
const prefix='[점검자 맥락] 작업 상태: ';
export function contextStage(note:string){return note.split('\n').find(line=>line.startsWith(prefix))?.slice(prefix.length)||'';}
export function withContextStage(note:string,stage:string){
    if(!workStages.includes(stage as typeof workStages[number]))return note;
    const remaining=note.split('\n').filter(line=>!line.startsWith(prefix)).join('\n').trim();
    return [prefix+stage,remaining].filter(Boolean).join('\n').slice(0,4000);
}
/** Review candidates only, never an assertion of missing MSDS or a chemical composition. */
export function chemicalReviewCandidate(analysis:VisionImport,index:number){
    const finding=analysis.risk_findings?.[index],fact=finding&&analysis.observed_facts[Number(finding.observation_index)];
    if(!finding||!fact)return false;
    return /시멘트|몰탈|모르타르|레미탈|도료|페인트|신너|접착제|방수제|에폭시|화학물질|화학제품|물질안전보건자료|\bmsds\b|\bsds\b/i.test([finding.problem,finding.risk,fact.text].join(' '));
}
export function findingEvidenceStatus(analysis:VisionImport,index:number){
    const finding=analysis.risk_findings?.[index],fact=finding&&analysis.observed_facts[Number(finding.observation_index)];
    if(!finding||!fact||fact.confidence==='low'||/미확인|불명확|확인\s*(불가|필요)|판독\s*(불가|어려)|여부/.test([finding.problem,fact.text].join(' ')))return '맥락·추가 확인 필요';
    return '사진 관찰에 근거한 검토 후보';
}
