/**
 * NEW-PSI F10 local-only management report.
 * Input: previously displayed local IndexedDB records and calculated queue.
 * Output: inert CSV or standalone printable HTML, never a safety approval.
 */
import {
  LOCAL_RECHECK_BUCKETS,
  LOCAL_RECHECK_LABELS,
  localCalendarDate,
  summarizeLocalRecheckQueue,
} from './localRecheckQueue.mjs';
import {buildLocalRecheckProgressForTargets} from './localRecheckProgress.mjs';

export const F10_LOCAL_REPORT_VERSION='psi-f10-recheck-report-v1';
export const F10_LOCAL_REPORT_LIMIT=500;
export const F10_REPORT_WARNING=
  '이 문서는 점검자 기기에 저장된 기록의 관리용 요약이며 현장 사실·법령 위반·안전조치의 이행·완료·작업 재개를 자동 확인하거나 승인하지 않습니다. 담당자 통보·외부 제출은 별도의 사람 검토가 필요합니다.';
const statusLabels={
  pending:'미조치',in_progress:'조치 진행 중',
  review_requested:'완료 확인 요청',needs_work:'보완 필요',
  verified:'확인 완료 기록',unrecorded:'미기록',
};
const resultLabels={
  delayed:'조치 지연·미완료',temporary_checked:'임시 안전조치 현장 확인',
  needs_more:'재점검 후 보완 필요',review_requested:'완료 여부 확인 요청',
};
const short=(value,max=2000)=>typeof value==='string'?value.slice(0,max):'';
const note=(value,max)=>short(value,max).trim();
const allowDate=(value)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value+'T00:00:00Z'))
  &&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

/**
 * Exactly mirrors the current local list visibility rules, but leaves output
 * ordering and per-target states from the F10 priority queue unchanged.
 */
export function selectLocalRecheckReportTargets(records,queue,filter,scope='all',now=new Date()){
  if(scope!=='visible')return queue;
  const bucket=typeof filter==='string'&&filter.startsWith('recheck:')?filter.slice(8):null;
  if(bucket!==null)return queue.filter(item=>item.bucket===bucket);
  if(!filter||filter==='all')return queue;
  const today=localCalendarDate(now);
  const eligible=new Set();
  for(const record of records){
    const follows=[record.followup,...(Array.isArray(record.additionalActions)?record.additionalActions.map(a=>a.followup):[])];
    const match=follows.some(value=>
      filter==='unassigned'?!value?.assignee:
      filter==='no_due'?!value?.dueDate:
      filter==='overdue'?Boolean(value&&value.status!=='verified'&&value.dueDate&&value.dueDate<today):
      filter==='review'?value?.status==='review_requested':false
    );
    if(match)eligible.add(record.id);
  }
  return queue.filter(item=>eligible.has(item.recordId));
}

export function buildLocalRecheckReport(queue,records,options={}){
  if(!Array.isArray(queue)||!Array.isArray(records))
    throw new Error('재점검 보고서에 사용할 기기 기록을 확인할 수 없습니다.');
  if(!queue.length)throw new Error('내보낼 재점검 대상이 없습니다. 상태 필터를 변경해 주세요.');
  if(queue.length>F10_LOCAL_REPORT_LIMIT)
    throw new Error('한 번에 최대 500개 조치 대상까지 내보낼 수 있습니다. 상태 필터로 나누어 저장해 주세요.');
  const generatedAt=options.generatedAt instanceof Date?options.generatedAt:new Date();
  if(!Number.isFinite(generatedAt.getTime()))throw new Error('기기의 날짜와 시간을 확인해 주세요.');
  const includeDetails=options.includeDetails===true;
  const includeAssignees=options.includeAssignees===true;
  const includeProgress=options.includeProgress===true;
  const byRecord=new Map(records.filter(r=>r&&typeof r.id==='string').map(r=>[r.id,r]));
  const entries=queue.map(item=>{
    const record=byRecord.get(item.recordId);
    if(!record)throw new Error('보고 대상 원본 점검이 없습니다. 기기 기록을 다시 조회해 주세요.');
    const action=item.actionId?record.additionalActions?.find(a=>a.id===item.actionId):undefined;
    if(item.actionId&&!action)throw new Error('보고 대상 조치 항목이 변경됐습니다. 기기 기록을 다시 조회해 주세요.');
    const followup=item.actionId?action?.followup:record.followup;
    const history=item.actionId?action?.rechecks:record.rechecks;
    const latest=Array.isArray(history)&&history.length?history.at(-1):null;
    const ctx=record.siteContext||{};
    const site=[['현장',ctx.site],['동',ctx.building],['층',ctx.level],['공종',ctx.trade]]
      .filter(([,value])=>note(value,100))
      .map(([key,value])=>key+' '+note(value,100)).join(' / ')||'현장정보 미기록';
    // Never silently copy photo Blobs, full original hashes, personal notes,
    // hidden earlier histories, or unrelated fields to the report.
    return {
      recordId:short(item.recordId,80),
      actionId:item.actionId?short(item.actionId,80):'',
      site:short(site,320),
      label:short(item.label,200)||'조치 대상 미기록',
      bucket:item.bucket,
      bucketLabel:LOCAL_RECHECK_LABELS[item.bucket]||'분류 확인 필요',
      date:allowDate(item.date)?item.date:'',
      dateSource:short(item.dateSource,40),
      status:statusLabels[item.followupStatus]||'상태 확인 필요',
      recheckResult:resultLabels[item.lastRecheckResult]||'재점검 결과 미기록',
      hasAssignee:item.hasAssignee===true?'기록 있음':'기록 없음',
      hasTemporaryMeasure:item.hasTemporaryMeasure===true?'기록 있음':'기록 없음',
      hasEvidenceHash:item.photoSha256?'연결 해시 기록 있음':'연결 해시 없음',
      assignee:includeAssignees?note(followup?.assignee,100):'',
      temporaryMeasure:includeDetails?note(followup?.temporaryMeasure,1000):'',
      reason:includeDetails?note(latest?.reason,500):'',
      recheckNote:includeDetails?note(latest?.note,2000):'',
      inspectionNote:includeDetails?note(record.note,4000):'',
      lastRecheckAt:latest&&typeof latest.at==='string'&&Number.isFinite(Date.parse(latest.at))?latest.at:'',
    };
  });
  const progress=includeProgress?buildLocalRecheckProgressForTargets(records,queue,{includeReasons:includeDetails}):null;
  const summary=summarizeLocalRecheckQueue(queue);
  return {
    format:F10_LOCAL_REPORT_VERSION,
    generatedAt:generatedAt.toISOString(),
    localDate:localCalendarDate(generatedAt),
    scopeLabel:short(options.scopeLabel,100)||'전체 조치 대상',
    includeAssignees,includeDetails,includeProgress,progress,
    summary:{...summary,inspectionCount:new Set(entries.map(entry=>entry.recordId)).size},
    entries,
    warning:F10_REPORT_WARNING,
  };
}

const cellText=value=>{
  const clean=String(value??'')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')
    .slice(0,5000);
  // Formula injection: spreadsheets can interpret =,+,-,@ after leading whitespace.
  return /^[\s\u200b-\u200f\ufeff]*[=+\-@]/u.test(clean)?"'"+clean:clean;
};
export const f10CsvCell=value=>'"'+cellText(value).replace(/"/g,'""')+'"';
const row=values=>values.map(f10CsvCell).join(',');
export function formatLocalRecheckCsv(report){
  const headers=['상태 분류','현장정보','조치 대상','다음 확인일','날짜 근거',
    '조치 상태','최신 재점검 결과','담당자 기록','임시조치 기록','사진 해시 기록',
    '담당자 이름(선택)','임시조치 상세(선택)','지연 사유(선택)','재점검 내용(선택)',
    '점검 관찰 메모(선택)','최근 재점검 기록 시각(기기)','점검 ID','조치 ID'];
  const values=report.entries.map(e=>[
    e.bucketLabel,e.site,e.label,e.date||'미정',e.dateSource,e.status,e.recheckResult,
    e.hasAssignee,e.hasTemporaryMeasure,e.hasEvidenceHash,
    e.assignee,e.temporaryMeasure,e.reason,e.recheckNote,e.inspectionNote,
    e.lastRecheckAt,e.recordId,e.actionId,
  ]);
  const summary=LOCAL_RECHECK_BUCKETS.map(bucket=>[LOCAL_RECHECK_LABELS[bucket],report.summary[bucket]]);
  const progressRows=report.includeProgress&&report.progress?[
    '',
    row(['F10 경과 연계 이력 · 사용자 선택 · 기기 기록 시각이며 실측/승인 아님']),
    row(['점검 ID','조치 ID','기록 시각(기기)','기록 유형','기록 내용',
      '변경 전 기한','변경 후 기한','당시 목표 기한','다음 재점검일',
      '당시 후속 상태','임시조치 확인 수준','연결 사진 해시 유무','변경·지연 사유(상세 선택 시)']),
    ...report.progress.items.flatMap(item=>item.events.map(event=>row([
      item.recordId,item.actionId||'',event.at||'미확인',event.kind==='followup'?'후속 조치':'재점검',
      event.title,event.dueBefore||'',event.dueAfter||'',
      event.dueDate===null?'':(event.dueDate||'미정'),
      event.nextCheckDate===null?'':(event.nextCheckDate||'미정'),
      event.status,event.controlReview||'',
      event.evidenceLinked?'연결 해시 기록 있음':'',event.reason||'',
    ]))),
  ]:[];
  return '\ufeff'+[
    row(['PSI F10 기기 재점검 관리 보고 · 내부 검토용']),
    row(['생성 시각 (기기)',report.generatedAt]),
    row(['적용 기준일 (기기)',report.localDate]),
    row(['조회 범위',report.scopeLabel]),
    row(['조치 대상',report.summary.total,'점검 기록',report.summary.inspectionCount]),
    ...summary.map(x=>row(x)),
    row(['주의',report.warning]),
    row(['담당자 이름 포함',report.includeAssignees?'사용자 선택':'포함 안 함']),
    row(['상세 자유입력 포함',report.includeDetails?'사용자 선택':'포함 안 함']),
    '',
    row(headers),
    ...values.map(x=>row(x)),
    ...progressRows,
  ].join('\r\n')+'\r\n';
}
const escaped=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[char]));
const htmlCell=value=>'<td>'+escaped(value)+'</td>';
export function formatLocalRecheckPrintHtml(report){
  const cells=report.entries.map((e,index)=>'<tr>'+
    [String(index+1),e.bucketLabel,e.site,e.label,e.date||'미정',
      e.status,e.recheckResult,e.hasAssignee,e.hasTemporaryMeasure]
      .map(htmlCell).join('')+'</tr>').join('\n');
  const extra=report.includeAssignees||report.includeDetails
    ?'<h2>선택 포함 상세 기록</h2>'+report.entries.map((e,index)=>
       '<section class="extra"><h3>'+escaped(index+1)+'. '+escaped(e.label)+'</h3>'+
       (report.includeAssignees?'<p>담당자: '+escaped(e.assignee||'미기록')+'</p>':'')+
       (report.includeDetails?[
        ['임시조치',e.temporaryMeasure],['지연 사유',e.reason],
        ['현장 확인',e.recheckNote],['점검 메모',e.inspectionNote],
       ].map(([label,value])=>'<p>'+escaped(label)+': '+escaped(value||'미기록')+'</p>').join(''):'')+
       '</section>').join('\n')
    :'';
  const progressHtml=report.includeProgress&&report.progress?
    '<section><h2>F10 경과 연계 이력 (사용자 선택)</h2>'+
    '<p>기록 시각은 사용 기기 기준입니다. 사진 파일 및 전체 SHA-256, 담당자 실명은 경과 이력에 포함하지 않습니다. 재점검과 완료 목표 기한은 서로 다릅니다.</p>'+
    report.progress.items.map(item=>
      '<section class="extra"><h3>'+escaped(item.label)+
      ' · 목표 기한 '+escaped(item.currentDueDate||'미정')+
      ' · 최신 재점검 예정일 '+escaped(item.nextCheckDate===null?'기록 없음':(item.nextCheckDate||'미정'))+
      ' · 이력 '+escaped(item.total)+'건</h3>'+
      '<p>임시통제 확인 수준: '+escaped(item.lastControlReview)+
      (item.inconsistentFollowup?' · 현재 상태와 마지막 이력 불일치':'')+'</p>'+
      '<table><thead><tr>'+['기기 기록 시각','종류','기록 내용','변경 전 기한','변경 후 기한','다음 확인일','당시 상태','변경/재점검 사유(선택)']
       .map(h=>'<th>'+escaped(h)+'</th>').join('')+'</tr></thead><tbody>'+
      item.events.map(e=>'<tr>'+[
        e.at||'미확인',e.kind==='followup'?'후속 조치':'재점검',e.title,
        e.dueBefore||'',e.dueAfter||'',
        e.nextCheckDate===null?'':(e.nextCheckDate||'미정'),
        e.status,e.reason||'',
      ].map(htmlCell).join('')+'</tr>').join('')+
      '</tbody></table></section>'
    ).join('')+'</section>':'';
  const stats=LOCAL_RECHECK_BUCKETS.map(bucket=>
    '<span>'+escaped(LOCAL_RECHECK_LABELS[bucket])+' '+escaped(report.summary[bucket])+'건</span>').join(' · ');
  return '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; base-uri \'none\'; form-action \'none\'">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>PSI F10 기기 재점검 관리 보고</title>'+
    '<style>@page{size:A4 landscape;margin:13mm}body{font:12px/1.5 system-ui,Arial,sans-serif;color:#172329;margin:20px auto;max-width:1100px;padding:0 14px}h1{font-size:21px;margin:0 0 8px}h2{font-size:15px}p{overflow-wrap:anywhere}header{border-bottom:2px solid #233641;margin-bottom:15px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}th,td{border:1px solid #9daeb2;text-align:left;padding:5px;overflow-wrap:anywhere;vertical-align:top}th{background:#e8eeee}tr{break-inside:avoid}.stats{margin:10px 0}.warning{font-weight:bold;border:1px solid #999;padding:9px}.extra{break-inside:avoid;border-bottom:1px solid #ccc}.extra p{margin:3px 0}@media print{body{margin:0;padding:0}h1{font-size:17px}}</style></head><body>'+
    '<header><h1>PSI · F10 지연 조치·재점검 관리 보고</h1>'+
    '<p>기기 생성 시각: '+escaped(report.generatedAt)+' / 적용 기준일: '+escaped(report.localDate)+
    ' / 조회 범위: '+escaped(report.scopeLabel)+'</p>'+
    '<p>조치 대상 '+escaped(report.summary.total)+'건 · 점검 기록 '+escaped(report.summary.inspectionCount)+'건</p>'+
    '<p class="stats">'+stats+'</p></header>'+
    '<p class="warning">'+escaped(report.warning)+'</p>'+
    '<p>이 파일에는 사진 자체가 포함되지 않습니다. 사진 해시 존재 여부는 파일 진위나 조치 효력을 증명하지 않습니다. 저장된 기기 기록만 기준으로 생성했습니다.</p>'+
    '<table><thead><tr>'+[
      '번호','우선순위','현장정보','대상 조치','다음 확인일','현재 상태','최근 재점검','담당자 기록','임시조치 기록',
    ].map(v=>'<th>'+escaped(v)+'</th>').join('')+
    '</tr></thead><tbody>'+cells+'</tbody></table>'+extra+progressHtml+
    '<p>내부 업무용 생성물입니다. 외부 제출 전에 현장 관리자 검토와 개인정보 확인이 필요합니다.</p>'+
    '</body></html>';
}
