export type LegalEdition={version:string;promulgatedAt:string|null;effectiveFrom:string|null;effectiveTo:string|null;url:string;note:string};
/** Optional snapshot extension. Missing metadata in old reports must stay missing. */
export type SourceReview={
    revision:number;status:'legacy'|'pending'|'reviewed'|'withdrawn';
    publisher:string;urls:string[];publishedAt:string|null;checkedAt:string|null;
    reviewedAt:string|null;reviewDueAt:string|null;reviewer:string|null;evidence:string;
    contentSha256:string;legalEditions:LegalEdition[];note:string;
};
export type SourceCatalog={schemaVersion:1;version:number;records:{key:string;revisions:SourceReview[]}[]};
export const koreaDay=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function sourceReviewState(review:SourceReview|undefined,day=koreaDay()):{code:'legacy'|'pending'|'reviewed'|'stale'|'withdrawn';label:string}{
    if(!review||review.status==='legacy')return {code:'legacy',label:'기존 자료 · 검토 이력 보완 필요'};
    if(review.status==='withdrawn')return {code:'withdrawn',label:'사용 중단 · 다른 근거 확인 필요'};
    if(review.status!=='reviewed'||!review.checkedAt||!review.reviewedAt||!review.reviewer||!review.evidence||!review.reviewDueAt||review.checkedAt>day||review.reviewedAt>day)return {code:'pending',label:'원문·검토 확인 필요'};
    if(review.reviewDueAt<day)return {code:'stale',label:'검토 기한 경과 · 원문 재확인 필요'};
    return {code:'reviewed',label:'원문 대조 기록 있음 · 현장 적용 별도 확인'};
}
export function sourceEventStatus(review:SourceReview|undefined,eventAt?:string){
    if(!review?.legalEditions.length||!eventAt)return '사건 당시 시행본 확인 필요';
    const date=new Date(eventAt);if(!Number.isFinite(date.getTime()))return '사건 당시 시행본 확인 필요';
    const day=koreaDay(date),editions=review.legalEditions.filter(e=>e.effectiveFrom&&e.effectiveFrom<=day&&(!e.effectiveTo||day<=e.effectiveTo));
    return editions.length===1?`시행본 후보 ${editions[0].version} · 조문·적용 요건 별도 대조`:'사건 당시 시행본 확인 필요';
}
