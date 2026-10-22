import type {Inspection} from './types.js';
import {photoQueue} from './workQueue.js';
import {reportPhotoSelection,actionPhotoSummary} from './actionFollowup.js';

export function reportReadiness(item:Inspection){
    const doc=item.document,photos=photoQueue(doc);
    return {
        pending:photos.filter(p=>p.kind==='pending'),
        manual:photos.filter(p=>p.kind==='manual').length,
        expert:photos.filter(p=>p.kind==='expert').length,
        improvement:photos.filter(p=>p.kind==='improvement').length,
        reportPhotos:reportPhotoSelection(doc).size,
        unresolved:doc.actions.filter(a=>a.status!=='verified').length,
        canReport:photos.length>0&&!photos.some(p=>p.kind==='pending'),
    };
}
// Keep the entire packet below the share editor's 50,000 character limit even at
// the document's 20-photo/30-action limits. User prose remains plain text.
const excerpt=(text:string,max:number)=>{const clean=text.trim().replace(/\s+/g,' ');return clean.length>max?clean.slice(0,max)+'…(요약)':clean;};
export function buildInspectionHandover(item:Inspection):string {
    const d=item.document,r=reportReadiness(item),rows=photoQueue(d);
    const status={pending:'AI 검토 대기',manual:'설명 자료 · AI 판독 없음',expert:'AI 해석 미수용 · 전문가 의견',improvement:'연결된 개선 증빙',reviewed:'AI 해석 수용 · 전문가 검토 기록'};
    return [
        '[현장점검 인계문 · 저장본 요약]',`점검명: ${excerpt(d.title,200)}`,
        `점검번호: ${item.id} / 저장 버전: ${item.revision}`,
        `기록 시각: ${d.eventAt} (저장값)`,
        ...([['현장',d.siteName],['위치',d.location],['공종',d.workType]] as const).filter(([,v])=>v.trim()).map(([k,v])=>`${k}: ${excerpt(v,200)}`),
        `사진 ${rows.length}장 / AI 검토 대기 ${r.pending.length}장 / 미결 조치 ${r.unresolved}건`,
        '입력 중인 내용·사진 파일·법령 판단은 포함하지 않습니다. 긴 문장은 요약되며 전체 근거는 저장 점검·검토용 보고서에서 확인하세요.',
        '', '[사진별 저장 내용 · 번호는 모은 사진 목록 기준]',
        ...rows.flatMap(p=>{
            const review=d.reviews[p.id];
            return [`사진 ${p.number} · ${status[p.kind]}`,
                `설명: ${excerpt(d.photoNotes?.[p.id]||'',180)||'미입력'}`,
                ...(review?[`전문가 기록: ${excerpt(review.note,240)}`]:[]),
            ];
        }),
        '', '[등록 조치 · 전체 목록]',
        ...(d.actions.length?d.actions.flatMap((a,n)=>[
            `${n+1}. ${excerpt(a.title,300)}`,
            `담당: ${excerpt(a.owner,100)} / 기한: ${a.dueDate} / ${a.status==='verified'?'현장 재점검 확인':a.status==='review-requested'?'완료 검토 요청':'미조치'}`,
            ...actionPhotoSummary(a,d.photoIds),
            ...(a.note.trim()?[`조치 기록: ${excerpt(a.note,160)}`]:[]),
        ]):['등록된 조치 없음 · 위험 없음/조치 완료를 뜻하지 않습니다.']),
        '',r.pending.length?'AI 검토 대기 사진이 있습니다. 검토 후 보고서를 작성하세요.':'AI 검토 대기 사진은 없습니다. 설명 자료·미수용 의견·미결 조치도 확인하세요.',
        '이 인계문은 정식 발행·안전 승인·법령 적용 확정 또는 상대방 수신 확인이 아닙니다.',
    ].join('\n');
}
