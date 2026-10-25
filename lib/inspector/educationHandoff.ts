import type {InspectionDocument,InspectorAction} from './types.js';
import {overdueAction} from './workQueue.js';

const clean=(value:string,max=180)=>value.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function label(action:InspectorAction,today:string){
    if(action.status==='verified')return '현장 재점검 확인 기록';
    if(overdueAction(action,today))return '기한 경과 · 미결';
    if(action.status==='review-requested')return '개선사진 접수 · 재점검 대기';
    return '미조치 · 이행 확인 필요';
}
/**
 * Manual handoff only; no AI inference, automatic TBM transmission, or employee-grade scores.
 * Bounded output avoids copying unbounded notes and emphasizes missing evidence.
 */
export function buildNextCycleHandoffDraft(doc:InspectionDocument,today:string):string{
    const actions=doc.actions||[];
    const weight=(a:InspectorAction)=>a.status==='verified'?3:overdueAction(a,today)?0:a.status==='review-requested'?1:2;
    const ordered=[...actions].sort((a,b)=>weight(a)-weight(b)||(a.dueDate||'').localeCompare(b.dueDate||''));
    const chosen=ordered.slice(0,12);
    const lines=[
        '[PSI · 교육·다음 위험성평가 검토용 초안]',
        '저장된 기록을 바탕으로 만든 참고용 문구이며 자동 전송하지 않습니다.',
        '현장 전문가가 원문·공종·실제 위치·개인정보를 검토한 후 필요한 내용만 사용하세요.',
        '사진 첨부와 재점검 확인은 별개이며, 완료 기록이 있어도 새로운 위험이 없다는 뜻은 아닙니다.',
        '법 위반, 처벌, 작업중지 및 작업재개 승인, 교육 이해 확인을 확정하지 않습니다.',
        `기록: ${clean(doc.title,120)||'점검명 미입력'} · 공종: ${clean(doc.workType||'',80)||'공종 미입력'} · 기준일: ${today}`,
        `등록 조치 ${actions.length}건 · 초안 포함 ${chosen.length}건 (기한·미결 우선)`,
    ];
    if(!chosen.length)lines.push('등록된 조치가 없습니다. 현장의 위험 또는 재교육 필요성이 없음을 의미하지 않습니다.');
    chosen.forEach((a,index)=>{
        const sourceCount=a.sourcePhotoIds?.length||0,after=!!a.completionPhotoId;
        lines.push(`${index+1}. [${label(a,today)}] ${clean(a.title,140)}`);
        lines.push(`   기한: ${a.dueDate||'기록 확인 필요'} · 사진 연결: 조치 전 ${sourceCount?sourceCount+'장':'미지정'} / 개선 후 ${after?'연결 기록 있음':'미등록'}`);
        if(a.status==='verified')lines.push(`   재점검 기록시각: ${a.verifiedAt||'기록 확인 필요'} (확인자 신원은 이 기록으로 증명되지 않음)`);
        if(a.note?.trim())lines.push(`   기록한 내용: ${clean(a.note,180)}`);
    });
    if(actions.length>chosen.length)lines.push(`나머지 ${actions.length-chosen.length}건은 원본 조치목록에서 반드시 별도 확인하세요.`);
    lines.push('다음 TBM/교육·위험성평가 검토: 반복 위험과 잔여 위험을 현장에서 확인하고, 누가 언제 어떤 확인을 했는지 별도 승인기록과 대조하세요.');
    lines.push('별도 SMART TBM 프로그램 및 PSI 6대 지표에는 자동 반영되지 않았습니다.');
    return lines.join('\n');
}
