import {DEFAULT_REVIEW_NOTE,type ExpertReview} from './expertReview.js';
import type {VisionImport} from './types.js';

export const FIELD_CARD_LIMITS={problem:100,location:100,evidence:200,action:300} as const;
export type FieldCardDraft={problem:string;location:string;evidence:string;action:string};
export type FieldCardSeed={draft:FieldCardDraft;basis:string;shortened:boolean};
export const FIELD_CARD_FOOTER='전달용 편집본 · 원기록·등록 조치·보고서를 변경하지 않음';
export const fieldCardLine=(value:string)=>value.replace(/\s+/g,' ').trim();
const fit=(value:string,limit:number)=>{const chars=Array.from(fieldCardLine(value));return chars.length>limit?chars.slice(0,limit-1).join('')+'…':chars.join('');};

/** One selected finding only. A default accepted radio is never proof of field verification. */
export function seedFieldCard(analysis:VisionImport|null|undefined,review:ExpertReview,note:string,index:number):FieldCardSeed{
    const expert=review.note.trim()!==DEFAULT_REVIEW_NOTE?review.note.trim():'';
    const finding=analysis?.risk_findings?.[index],fact=finding?analysis?.observed_facts[Number(finding.observation_index)]:undefined;
    const useAi=review.decision!=='rejected'&&!expert&&!!finding&&!!fact;
    const values:FieldCardDraft=useAi?{problem:finding.problem,location:fact.visual_basis,evidence:fact.text,action:finding.action}:
        {problem:expert?'점검자 의견 확인 요청':analysis?'사진 상태 추가 확인 요청':note.trim()?'현장 상황 확인 요청':'사진 상태 확인 요청',location:'',evidence:expert||(!analysis?note:''),action:''};
    const draft={...values};let shortened=false;
    for(const key of Object.keys(FIELD_CARD_LIMITS) as (keyof FieldCardDraft)[]){draft[key]=fit(values[key],FIELD_CARD_LIMITS[key]);if(Array.from(fieldCardLine(values[key])).length>FIELD_CARD_LIMITS[key])shortened=true;}
    return {draft,shortened,basis:review.decision==='rejected'?'AI 해석 미수용 · 점검자 작성':expert?'점검자 의견 우선 · 전달용 초안':useAi?(fact.confidence==='low'?'AI 제안 · 관찰 판독 확신 낮음 · 현장 대조 필요':'AI 제안 기반 · 현장 대조 필요'):analysis?(analysis.risk_findings?'위험 미특정 · 추가 확인용':'이전 형식 관찰 · 점검자 작성'):'점검자 작성 · AI 판독 아님'};
}
export function validateFieldCard(draft:FieldCardDraft){
    for(const key of Object.keys(FIELD_CARD_LIMITS) as (keyof FieldCardDraft)[])if(Array.from(fieldCardLine(draft[key])).length>FIELD_CARD_LIMITS[key])return '카드 길이를 줄여 주세요. 긴 내용은 기존 결과·보고서로 전달할 수 있습니다.';
    if(fieldCardLine(draft.problem).length<2||fieldCardLine(draft.action).length<5)return '핵심 문제 2자 이상과 요청 조치 5자 이상을 적어 주세요.';
    return '';
}
export function fieldCardText(draft:FieldCardDraft,basis:string,source:string){
    return ['[PSI 현장 전달 카드]',basis,source,`확인할 문제: ${fieldCardLine(draft.problem)}`,...(draft.location.trim()?[`사진 위치: ${fieldCardLine(draft.location)}`]:[]),...(draft.evidence.trim()?[`관찰·점검자 의견: ${fieldCardLine(draft.evidence)}`]:[]),`요청 조치: ${fieldCardLine(draft.action)}`,'조치 가능 여부와 현장 확인 결과를 회신해 주세요.',FIELD_CARD_FOOTER].join('\n');
}
