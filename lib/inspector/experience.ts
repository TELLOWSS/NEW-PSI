import type { InspectionDocument, InspectionSummary } from './types.js';
export type InspectorTab = 'evidence' | 'analysis' | 'legal' | 'actions' | 'report';
export type RecordFilter = 'all' | 'urgent' | 'review' | 'actions';
export const recordFilterLabels: Record<RecordFilter,string> = {all:'전체',urgent:'긴급',review:'검토 대기',actions:'미결 조치'};
export function filterInspectionRecords(items:InspectionSummary[],query:string,filter:RecordFilter) {
    const needle=query.trim().toLocaleLowerCase();
    return items.filter(item=>(!needle || [item.title,item.work_type,item.location].some(value=>(value || '').toLocaleLowerCase().includes(needle)))
        && (filter==='all' || filter==='urgent' && item.urgent || filter==='review' && item.needs_review || filter==='actions' && item.open_actions>0));
}
export function inspectionAttention(doc:InspectionDocument):{tab:InspectorTab;title:string;detail:string} {
    if(!doc.photoIds.length)return {tab:'evidence',title:'첫 사진으로 점검을 시작하세요',detail:'원본사진과 직접 본 작업 상황을 함께 기록합니다.'};
    if(!doc.notes.trim())return {tab:'evidence',title:'사진의 작업 상황을 설명해 주세요',detail:'직접 본 사실과 확인이 필요한 부분을 구분해 기록합니다.'};
    const analyses=Object.entries(doc.analyses);
    if(!analyses.length)return {tab:'analysis',title:'사진의 관찰 결과를 가져오세요',detail:'표준 프롬프트로 수동 분석한 뒤 원본과 대조합니다.'};
    const pending=analyses.filter(([id])=>doc.reviews[id]?.decision!=='accepted').length;
    if(pending)return {tab:'analysis',title:`사진 ${pending}건의 사실 검토가 남아 있습니다`,detail:'AI 관찰은 제안입니다. 사진과 현장 상황을 대조하세요.'};
    const questions=analyses.reduce((count,[id,a])=>count+a.requires_confirmation.filter((_,n)=>{const answer=doc.confirmationAnswers?.[id]?.find(x=>x.questionIndex===n);return !answer || answer.answer==='unknown';}).length,0);
    const actions=doc.actions.filter(a=>a.status!=='verified').length;
    if(actions)return {tab:'actions',title:`개선조치 ${actions}건을 이어서 확인하세요`,detail:'담당·기한·개선사진을 확인한 뒤 현장에서 재점검합니다.'};
    if(questions)return {tab:'analysis',title:`현장 확인 질문 ${questions}건이 남아 있습니다`,detail:'아직 확인하지 못한 사항은 검토용 보고서에도 그대로 남습니다.'};
    return {tab:'report',title:'저장한 기록을 보고서로 정리하세요',detail:'보고서는 검토용이며 공식 법령 검증과 최종 승인은 별도입니다.'};
}
export function localCalendarDate(date=new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function displayInspectionDate(value:string) {
    const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'시각 미확인';
}
