/** Display-only novice states. Never treat a photo analysis as an approval. */
export type NoviceStep=0|1|2|3;
export function noviceStep({hasPhoto,hasResult,reviewSaved,hasReport}:{hasPhoto:boolean;hasResult:boolean;reviewSaved:boolean;hasReport:boolean}):NoviceStep{
 if(hasReport||reviewSaved)return 3;
 if(hasResult)return 2;
 return hasPhoto?1:0;
}
export type PhotoProgressStage=0|1|2|3;
export function photoProgressStage(activity:string):PhotoProgressStage|null{
 if(/최적화/.test(activity))return 0;
 if(/점검 기록|보관|업로드|설명 저장/.test(activity))return 1;
 if(/사진 분석|위험 단서|법령과 조치/.test(activity))return 2;
 if(/결과 확인/.test(activity))return 3;
 return null;
}
