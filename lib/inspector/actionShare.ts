export type ShareReply={requestId:string;kind:'planned'|'difficult'|'photo';name:string;note:string;photoId:string|null;sha256:string|null;submittedAt:string};
export type ActionShare={id:string;inspection_id:string;action_id:string;photo_id:string;creation_revision:number;snapshot:{title:string;owner:string;dueDate:string;photoSha256:string;photoNumber:number};created_at:string;expires_at:string;revoked_at:string|null;responses:ShareReply[];adopted_at:string|null;token?:string};
export const replyKindLabel={planned:'조치 예정',difficult:'조치 어려움',photo:'개선사진 접수'} as const;
export function shareTokenFromHash(hash:string){const t=hash.replace(/^#/,'');return /^[A-Za-z0-9_-]{43}$/.test(t)?t:'';}
export function actionShareUrl(origin:string,token:string){if(!shareTokenFromHash(token))throw new Error('공유 링크를 확인해 주세요.');return new URL('/inspection-reply',origin).href+'#'+token;}
export function actionShareText(s:ActionShare,url:string){return ['[PSI 현장 조치 요청]',s.snapshot.title,`담당: ${s.snapshot.owner} / 기한: ${s.snapshot.dueDate}`,'조치 가능 여부 또는 개선사진을 회신해 주세요.',url,`링크 만료: ${new Date(s.expires_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국시간)`,'링크를 가진 사람은 열람·회신할 수 있습니다. 필요한 상대에게만 전달하세요.','사진 제출은 완료 승인이 아니며 점검자가 별도 재점검합니다.'].join('\n');}

/** A response is a self-declaration until the site manager checks the action. */
export type ActionShareReplyOverview={
    total:number; planned:number; difficult:number; photo:number; nextStep:string;
};
export function summarizeActionShareReplies(responses:readonly ShareReply[]):ActionShareReplyOverview{
    const rows=Array.isArray(responses)?responses:[];
    const planned=rows.filter(row=>row.kind==='planned').length;
    const difficult=rows.filter(row=>row.kind==='difficult').length;
    const photo=rows.filter(row=>row.kind==='photo').length;
    const total=planned+difficult+photo;
    const nextStep=difficult>0&&photo>0
        ? '조치 장애 사유를 담당자에게 확인하고, 개선사진은 실제 현장과 별도로 대조해 주세요.'
        : difficult>0?'조치가 어렵다는 회신이 있습니다. 지원과 임시 보호조치 여부를 담당자에게 확인하세요.'
        : photo>0?'개선사진을 접수했습니다. 현장 대조와 관리자 재점검 전에는 완료로 처리하지 마세요.'
        : planned>0?'예정 회신이 접수되었습니다. 실제 조치 여부와 예정일을 별도로 확인하세요.'
        : '접수된 회신이 없습니다. 링크 생성만으로 전달 또는 열람이 확인된 것은 아닙니다.';
    return {total,planned,difficult,photo,nextStep};
}
