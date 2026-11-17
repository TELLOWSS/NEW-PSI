import React, { useMemo } from 'react';
import type { WorkerRecord, WorkerPracticeStage } from '../../types';
import { collectPracticeRechecks, collectPracticeStageEvidence, PRACTICE_RESULT_LABELS, type PracticeVerificationSummary } from '../../utils/practiceVerification';

export type PracticeEvidenceSelection = 'education'|'field_check'|'recheck'|'needs'|'overdue';
interface Props {
    records: readonly WorkerRecord[];
    summary: PracticeVerificationSummary;
    selected: PracticeEvidenceSelection|null;
    onSelect: (value:PracticeEvidenceSelection)=>void;
    onOpenRecord?: (record:WorkerRecord)=>void;
}

export function PracticeEvidencePanel({records,summary,selected,onSelect,onOpenRecord}:Props) {
    const recordsById=useMemo(()=>new Map(records.map(record=>[record.id,record])),[records]);
    const cards: {key:PracticeEvidenceSelection;label:string;count:number;unit:string}[]=[
        {key:'education',label:'교육 전달 기록',count:summary.educationDelivered,unit:'회'},
        {key:'field_check',label:'현장 관찰 기록',count:summary.fieldObserved,unit:'회'},
        {key:'recheck',label:'현장 재점검 기록',count:summary.rechecked,unit:'회'},
        {key:'needs',label:'재확인 필요',count:summary.needsFieldRecheck,unit:'개 문항·기록'},
        {key:'overdue',label:'재확인 기한초과',count:summary.overdueFieldRecheck,unit:'개 문항·기록'},
    ];
    const isCase=selected==='needs'||selected==='overdue';
    const cases=useMemo(()=>collectPracticeRechecks(records,summary.asOfDate),[records,summary.asOfDate]);
    const rows=useMemo(()=>!selected?[]:isCase
        ? cases.filter(row=>selected==='needs'||row.overdue).map(row=>({recordId:row.recordId,event:row.latest}))
        : collectPracticeStageEvidence(records,{asOfDate:summary.asOfDate,periodStartDate:summary.periodStartDate,stage:selected as WorkerPracticeStage}),
        [records,summary.asOfDate,summary.periodStartDate,selected,isCase,cases]);
    const current=cards.find(card=>card.key===selected);
    return <section aria-label="교육·현장 확인 근거" className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {cards.map(card=><button type="button" key={card.key} aria-pressed={selected===card.key}
                className={`min-h-12 rounded-lg border p-3 text-left focus-visible:outline focus-visible:outline-2 ${selected===card.key?'border-amber-300 bg-slate-800 text-white':'border-slate-500 bg-slate-900 text-slate-100'}`}
                onClick={()=>onSelect(card.key)}>{card.label} <strong>{card.count}</strong>{card.unit}</button>)}
        </div>
        <p className="text-sm">현재 불러온 작성자료 한정 · 기준일 {summary.asOfDate}. 교육·관찰·재점검은 {summary.periodStartDate?`${summary.periodStartDate}부터 기준일까지`:'기준일까지'} 기록된 횟수입니다. 재확인 필요는 기준일까지의 마지막 현장 확인으로 판단한 문항·기록 수이며 서로 합산하지 않습니다.</p>
        {summary.conflictingRecords>0&&<p role="alert">이력이 충돌한 {summary.conflictingRecords}개 기록은 건수와 목록 모두에서 제외했습니다.</p>}
        {current&&<div aria-live="polite" className="rounded-lg border border-slate-500 p-3">
            <h3 className="font-bold">{current.label} 근거 {rows.length}{current.unit}</h3>
            {!rows.length?<p className="text-sm">선택 범위에 표시할 근거가 없습니다. 기록이 없다는 사실만으로 실제 교육·조치 여부를 판단하지 않습니다.</p>:
                <ul className="space-y-3 mt-3">{rows.map(({recordId,event})=>{
                    const record=recordsById.get(recordId);
                    return <li key={`${recordId}-${event.id}`} className="border-t border-slate-500 pt-3 text-sm break-words">
                        <p>원기록: {record?.name||'이름 미기록'} · {record?.date||'작성일 미기록'} · {record?.jobField||'공종 미기록'}</p>
                        <p>Q{event.questionNumber} · {PRACTICE_RESULT_LABELS[event.result]||'확인 필요'} · {event.timestamp}</p>
                        {isCase&&<p>다음 확인일 {event.nextCheckDueDate||'미지정'}</p>}
                        <details><summary className="min-h-12 flex items-center cursor-pointer">기록된 확인 근거 펼치기</summary>
                            <p>{event.evidenceNote||'확인 근거 미기록'}</p>
                            <p>교육 회차 {event.sessionReference||'미기록'} · 증빙 참조 {event.evidenceReference||'미기록'}</p>
                            <p>관리자가 기록한 내용이며 자료 전달·조치 완료·작업재개의 자동 승인이 아닙니다.</p>
                        </details>
                        {record&&onOpenRecord&&<button type="button" className="min-h-12 border rounded px-3" onClick={()=>onOpenRecord(record)}>이 근거의 기록 열기</button>}
                    </li>;
                })}</ul>}
        </div>}
    </section>;
}
