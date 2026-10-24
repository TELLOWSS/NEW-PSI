import type {Inspection} from './types';
import type {ExpertReview} from './expertReview';
import {reviewIsSaved} from './reviewPersistence';
import {pendingReviewQueue} from './reviewQueue';
export type ResultAction='edit-input'|'view-stored'|'review-fields'|'save-review'|'next-review'|'draft-action'|'return-draft'|'report';
export type ResultJourney={action:ResultAction;label:string;title:string;description:string;reviewStatus:string;actionStatus:string;reportStatus:string;secondary?:{action:ResultAction;label:string};pending:number;linked:number;unresolved:number;pendingPhotos:Array<{id:string;number:number;label:string;problem:string}>};
/** Advice only. This selector never saves a review, marks an action complete, or changes an AI result. */
export function resultJourney(item:Inspection,photoId:string,options:{notesMatch:boolean;analysisViewed:boolean;review:ExpertReview;hasDraft:boolean}):ResultJourney|null{
 const doc=item.document;if(!doc.photoIds.includes(photoId))return null;
 const analysis=doc.analyses[photoId],saved=reviewIsSaved(item,photoId,options.review),queue=pendingReviewQueue(doc,photoId);
 const linked=doc.actions.filter(a=>a.sourcePhotoIds?.includes(photoId)),unresolved=linked.filter(a=>a.status!=='verified').length;
 const base={reviewStatus:!options.notesMatch?'설명 수정됨 · 결과 확인 필요':analysis?saved?'현재 검토 저장됨':'현장 대조 후 저장 필요':'자동 분석 없음 · 직접 확인 기록',actionStatus:options.hasDraft?'작성 중 · 저장 전':linked.length?`${linked.length}건 연결 · 미결 ${unresolved}건`:'등록한 조치 없음 · 필요할 때 작성',reportStatus:!options.notesMatch?'수정 설명 확인 후 진행':options.hasDraft?'작성 중인 입력부터 저장':queue.length?`다른 사진 ${queue.length}장 검토 대기`:'검토용 보고서로 기록',pending:queue.length,pendingPhotos:queue.map(({id,number,label,problem})=>({id,number,label,problem:typeof problem==='string'?problem:'저장된 제안을 확인하세요.'})),linked:linked.length,unresolved};
 const result=(action:ResultAction,label:string,title:string,description:string,secondary?:ResultJourney['secondary']):ResultJourney=>({...base,action,label,title,description,...(secondary?{secondary}:{})});
 if(!options.notesMatch)return result('edit-input','수정한 설명 확인하기','사진 설명이 바뀌었습니다','현재 입력은 유지했습니다. 수정한 설명을 확인하고 결과를 다시 준비한 뒤 이어가세요.');
 if(analysis&&!options.analysisViewed)return result('view-stored','저장된 분석 결과 보기','먼저 저장된 결과를 확인하세요','이 사진의 분석 결과가 저장되어 있습니다. 다시 분석하지 않고 원래 결과를 불러옵니다.');
 if(analysis&&!saved){const note=options.review.note.trim();if((note.length>0&&note.length<5)||(options.review.decision==='rejected'&&note.length<5))return result('review-fields','검토 의견 보완하기','검토 의견을 조금 더 적어 주세요','사진과 다른 점이나 확인한 상태를 5자 이상 적으면 검토를 저장할 수 있습니다. 입력한 의견은 유지됩니다.');
  return result('save-review','현장 대조 후 검토 저장','먼저 사진·현장과 결과를 대조하세요','사진에서 보이는 사실과 현장에서 확인한 내용을 대조한 뒤 눌러 주세요. 검토 저장은 안전 판정이나 개선 완료를 뜻하지 않습니다.');}
 if(options.hasDraft)return result('return-draft','작성 중인 조치 계속하기','작성 중인 조치를 먼저 마무리하세요','담당자·기한·개선 입력을 저장한 뒤 보고서로 이어갈 수 있습니다.');
 if(queue.length)return result('next-review','다음 검토 사진 보기',`다른 사진 ${queue.length}장이 검토를 기다립니다`,`사진 ${queue[0].number}의 저장된 결과를 이어서 확인합니다. 사진을 다시 분석하지 않습니다.`);
 if(!analysis&&!linked.length)return result('draft-action','직접 확인한 조치 작성','직접 확인한 내용으로 이어가세요','이 사진은 자동 분석하지 않았습니다. 현장에서 확인한 조치를 적거나 사진·설명을 보고서로 기록할 수 있습니다.',{action:'report',label:'보고서로 기록하기'});
 return result('report','보고서로 기록하기','모은 내용을 검토용 보고서로 정리하세요',unresolved?'미결 조치는 진행 상태 그대로 보고서에 남깁니다. 보고서 작성이 조치 완료를 뜻하지 않습니다.':'사진·설명과 저장한 검토를 함께 기록합니다. 조치는 필요할 때 추가할 수 있습니다.',{action:'draft-action',label:linked.length?'이 사진에 조치 추가':'이 사진 조치 작성'});
}
