/**
 * HQ-SAFE accident reconstruction draft.
 * Every occurrence is a source-attributed CLAIM, not a verified finding.
 * Deterministic mismatch checks are not AI and never establish accident cause.
 */
export type SequencePhase = 'before'|'during'|'after';
export type EvidenceKind = 'report'|'statement'|'photo'|'plan'|'inspection';
export type EventAction = 'standing'|'moving'|'contact'|'falling'|'other'|'unknown';
export type SourceConfidence = 'documented'|'needs_confirmation';
export type SequenceClaim = {
  id:string;
  incidentId:number;
  phase:SequencePhase;
  order:number;
  description:string;
  action:EventAction;
  source:EvidenceKind;
  sourceRef:string;
  confidence:SourceConfidence;
};
export type InvestigationSequence={incidentId:number;claims:readonly SequenceClaim[]};
export type SequenceMismatch={
  code:'DIFFERENT_ACTION'|'MISSING_SOURCE'|'MISSING_PHASE'|'POSSIBLE_ACTION_SEQUENCE';
  severity:'review'|'missing';
  message:string;
  claimIds:readonly string[];
};
export const PHASE_LABELS:Record<SequencePhase,string>={before:'사고 전',during:'사고 당시',after:'사고 직후'};
export const ACTION_LABELS:Record<EventAction,string>={
  standing:'일어서는 동작',moving:'이동 중',contact:'걸림·접촉',falling:'균형상실·넘어짐',other:'기타',unknown:'미확인'
};
export const SOURCE_LABELS:Record<EvidenceKind,string>={
  report:'사고보고서',statement:'진술',photo:'사진·영상',plan:'작업계획·TBM',inspection:'현장확인'
};
const exact=(v:string,max:number)=>v.trim().slice(0,max);
export const createSequence=(incidentId:number):InvestigationSequence=>({incidentId,claims:[]});

export function addSequenceClaim(draft:InvestigationSequence,claim:SequenceClaim):InvestigationSequence{
  if(draft.incidentId!==claim.incidentId)throw new Error('다른 사고에 속한 시퀀스입니다.');
  if(draft.claims.some(x=>x.id===claim.id))throw new Error('시퀀스 식별자가 중복됐습니다.');
  if(!Number.isInteger(claim.order)||claim.order<0||claim.order>99)throw new Error('시퀀스 순서를 확인하세요.');
  const desc=exact(claim.description,400),reference=exact(claim.sourceRef,120);
  if(desc.length<8)throw new Error('사고 전후 행동을 8자 이상 기록하세요.');
  if(reference.length<4)throw new Error('출처와 원본자료 참조번호를 입력해야 합니다.');
  return {...draft,claims:[...draft.claims,{...claim,description:desc,sourceRef:reference}]};
}

/**
 * Contradictions are flagged ONLY for same phase and order, different
 * explicitly selected action category, from independently referenced material.
 * Missing phase and sparse observations are reminders, not causal inference.
 */
export function checkSequence(draft:InvestigationSequence):SequenceMismatch[]{
  const issues:SequenceMismatch[]=[];
  for(const phase of ['before','during','after'] as const){
    if(!draft.claims.some(x=>x.phase===phase))issues.push({
      code:'MISSING_PHASE',severity:'missing',message:PHASE_LABELS[phase]+'에 대한 자료가 아직 없습니다.',claimIds:[]
    });
  }
  const map=new Map<string,SequenceClaim[]>();
  for(const claim of draft.claims){
    const key=claim.phase+'-'+claim.order;
    map.set(key,[...(map.get(key)||[]),claim]);
  }
  for(const group of map.values()){
    const recognized=group.filter(x=>x.action!=='unknown'&&x.action!=='other');
    if(new Set(recognized.map(x=>x.action)).size>1&&new Set(recognized.map(x=>x.sourceRef)).size>1){
      issues.push({code:'DIFFERENT_ACTION',severity:'review',
        message:PHASE_LABELS[group[0].phase]+' 같은 순서의 행동 설명이 자료 간 다릅니다. 사고보고서·진술·사진을 대조하세요.',
        claimIds:recognized.map(x=>x.id)});
    }
    if(group.some(x=>x.confidence==='needs_confirmation')){
      issues.push({code:'MISSING_SOURCE',severity:'missing',
        message:PHASE_LABELS[group[0].phase]+' '+group[0].order+'번 행동에 원본 진위 확인이 필요합니다.',
        claimIds:group.filter(x=>x.confidence==='needs_confirmation').map(x=>x.id)});
    }
  }
  return issues;
}

export type CorrectiveCoverage = {
  category:'engineering'|'management'|'education';
  issue:string;measure:string;reference:string;
};
/**
 * Heuristic checklist, NOT a professional suitability determination.
 * For e.g. a wire snag, training alone should not be presented as removal.
 */
export function checkControlCoverage(hazard:string,items:readonly CorrectiveCoverage[]):string[]{
  const problems:string[]=[];
  if(hazard.trim().length<8)problems.push('위험요인 발생 메커니즘을 구체적으로 설명해야 합니다.');
  if(items.length===0)problems.push('원인과 연결된 대책이 등록되지 않았습니다.');
  const cited=items.filter(x=>x.issue.trim().length>=8&&x.measure.trim().length>=8&&x.reference.trim().length>=4);
  if(cited.length!==items.length)problems.push('각 개선대책에 관련 원인과 증빙 참조번호가 필요합니다.');
  if(items.some(x=>x.category==='education')&&!items.some(x=>x.category==='engineering')){
    problems.push('교육 대책만으로 위험원이 제거됐다고 판단할 수 없습니다. 기술적 제거·격리 대책을 검토하세요.');
  }
  if(!items.some(x=>x.category==='management'))problems.push('관리적 점검·통제 절차의 필요성을 검토하세요.');
  return problems;
}

export const WIRE_EXAMPLE={
  label:'통화 기반 경위 입력 예시(실제 조사 확정 아님)',
  reported:'일어나는 순간 넘어짐',
  alternative:'일어난 후 이동 중 와이어 걸림을 인지하지 못하고 균형을 잃음',
  note:'서로 다른 설명의 순서와 움직임을 원본 사진·진술·보고서로 확인',
  controls:[
    '기술: 와이어 고정·정리, 이동통로 걸림 위험 제거 여부 확인',
    '관리: 데크 작업구역 통로·걸림 요소 사전점검',
    '교육: 기립 및 이동 전 주변 장애물 확인과 이동방법'
  ]
} as const;
