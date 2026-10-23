import type {Inspection} from './types.js';

// Quoting alone does not prevent spreadsheet formula evaluation. Protect every
// cell, including whitespace/control-prefixed input, without evaluating prose.
export function actionCsvCell(value:string|number):string {
    const text=String(value),safe=/^[\s\u0000-\u0020]*[=+@-]/u.test(text)||/^[\t\r\n]/u.test(text)?"'"+text:text;
    return '"'+safe.replace(/"/g,'""')+'"';
}

/** Saved registered actions only; never synthesize tasks from AI proposals. */
export function buildActionRegisterCsv(item:Inspection):string {
    const d=item.document,number=(id:string)=>{
        const index=d.photoIds.indexOf(id);
        return index<0?'사진 연결 확인 필요':`사진 ${index+1}`;
    };
    const rows:(string|number)[][]=[[
        '점검번호','저장 버전','점검명','현장','위치','공종','사건시각(저장값)',
        '조치번호','조치 ID','등록 조치','담당자','기한','상태','조치 전 사진','개선 후 사진','현장 재점검 시각(저장값)','조치 기록','자료 구분',
    ],...d.actions.map((a,index)=>[
        item.id,item.revision,d.title,d.siteName,d.location,d.workType,d.eventAt,
        index+1,a.id,a.title,a.owner,a.dueDate,
        a.status==='verified'?'현장 재점검 확인':a.status==='review-requested'?'완료 검토 요청':'미조치',
        a.sourcePhotoIds?.length?a.sourcePhotoIds.map(number).join(' / '):'적용 사진 미지정 · 저장 점검에서 범위 확인',
        a.completionPhotoId?number(a.completionPhotoId):'미등록',
        a.status==='verified'?a.verifiedAt||'기존 기록 · 확인시각 없음':'',a.note,
        '저장본 조치대장 · 검토용 · 안전 승인/정식 발행 아님',
    ])];
    // BOM for Korean Excel, RFC-style quoted cells and CRLF record separators.
    return '\uFEFF'+rows.map(row=>row.map(actionCsvCell).join(',')).join('\r\n')+'\r\n';
}
