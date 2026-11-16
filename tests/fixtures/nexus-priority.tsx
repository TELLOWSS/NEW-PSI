import React from 'react';
import { createRoot } from 'react-dom/client';
import SafetyNexus from '../../pages/SafetyNexus';
import type { WorkerRecord } from '../../types';

const event = (id:string, caseId:string, status:string, dueDate?:string) => ({
  id, caseId, status, dueDate, questionNumber:2, timestamp:'2020-01-02T01:00:00Z',
  actor:'가상 관리자', owner:'가상 담당', actionDetail:'가상 조치',
});
const first = { id:'synthetic-one', name:'가상 작업자', date:'2020-01-01', jobField:'가상 공종',
  practiceVerificationEvents:[{id:'practice-1',questionNumber:3,stage:'field_check',result:'correction_required',timestamp:'2020-01-02T01:00:00Z',nextCheckDueDate:'2020-01-03',actor:'가상 관리자',evidenceNote:'가상 현장 확인 기록입니다'}],
  riskFollowupEvents:[event('a','overdue','scheduled','2020-01-03'),event('b','open','open'),event('c','complete','completed')] };
const duplicate = { ...first, riskFollowupEvents:[event('a','overdue','scheduled','2020-01-03')] };
const second = { id:'synthetic-two', name:'가상 작업자2', date:'2020-02-01', jobField:'다른 공종', riskFollowupEvents:[] };
function Fixture() {
  const [removed,setRemoved]=React.useState(false);
  const [unique,setUnique]=React.useState(false);
  const rows=removed ? [second] : unique ? [first,second] : [first,duplicate,second];
  return <><button type="button" onClick={()=>setRemoved(true)}>합성 기록 제거</button><button type="button" onClick={()=>setUnique(true)}>합성 중복 제거</button><SafetyNexus workerRecords={rows as unknown as WorkerRecord[]}
    onNavigateToPage={()=>{}} onOpenRecord={record=>{document.title=record.id;}} /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
