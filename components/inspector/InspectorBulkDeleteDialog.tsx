import React,{useEffect,useRef,useState} from 'react';
import {postAdminJson} from '../../utils/adminApiClient';
import type {DeletionPointer} from '../../lib/inspector/recordHistory';

export type BulkRecord=DeletionPointer&{title:string};
type ServerStatus={state:string;mode:'all'|'files'|null;verified:boolean;verifyAfter:string|null;pendingOperations:number;remainingFiles:number;remainingRecords:Record<string,number>};
type Entry={state:'ready'|'running'|'waiting'|'done'|'failed';note:string;verifyAfter?:string|null};
const request=(body:unknown,timeoutMs=15000)=>postAdminJson<any>('/api/admin/inspector',body,{timeoutMs,fallbackMessage:'기록 삭제 상태를 확인하지 못했습니다. 완료로 처리하지 않았습니다.'});
const verifiedAll=(s:ServerStatus)=>s.verified===true&&s.state==='purged'&&s.mode==='all'&&s.remainingFiles===0&&['inspections','evidence','reports','events'].every(key=>s.remainingRecords?.[key]===0);

export default function InspectorBulkDeleteDialog({records,onClose,onWorking,onStarted,onVerified}:{records:BulkRecord[];onClose:()=>void;onWorking:(value:boolean)=>void;onStarted:(record:DeletionPointer)=>void;onVerified:(record:DeletionPointer)=>void}){
 const ref=useRef<HTMLDialogElement>(null),active=useRef(false),mounted=useRef(true),completed=useRef(new Set<string>());
 const [ack,setAck]=useState(false),[started,setStarted]=useState(false),[running,setRunning]=useState(false),[now,setNow]=useState(Date.now());
 const [entries,setEntries]=useState<Record<string,Entry>>(()=>Object.fromEntries(records.map(r=>[r.id,{state:'ready',note:'삭제 요청 전'}])));
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;dialog.showModal();return()=>{mounted.current=false;dialog.close();};},[]);
 const update=(id:string,entry:Entry)=>{if(mounted.current)setEntries(prev=>({...prev,[id]:entry}));};
 const finish=(record:BulkRecord,s:ServerStatus)=>{
   if(completed.current.has(record.id))return;
   if(!verifiedAll(s))throw new Error('서버에서 전체 삭제·잔여 0건을 확인하지 못했습니다.');
   completed.current.add(record.id);update(record.id,{state:'done',note:'서버 전체 삭제·잔여 0건 확인'});onVerified(record);
 };
 const attempt=async(record:BulkRecord,first:boolean)=>{
   update(record.id,{state:'running',note:'서버 삭제·잔여 확인 진행 중'});
   if(first)onStarted(record);
   let status:ServerStatus|null=null,errorMessage='';
   try{
     const result=await request({op:'delete-inspection',id:record.id,expectedRevision:record.revision,confirmation:record.id,mode:'all'},85000);
     status=result.status as ServerStatus;
   }catch(error){errorMessage=error instanceof Error?error.message:'삭제 요청 실패';}
   if(!status){
     try{status=(await request({op:'deletion-status',id:record.id})).status as ServerStatus;}
     catch{update(record.id,{state:'failed',note:'상태 확인 실패 · 삭제 완료 아님'});return;}
   }
   if(verifiedAll(status)){finish(record,status);return;}
   if(status.state==='deleting'&&status.mode==='all'&&status.verifyAfter){
     const due=Date.parse(status.verifyAfter);
     if(Number.isFinite(due)&&due>Date.now()){update(record.id,{state:'waiting',note:'사진 링크 만료 대기 후 서버 검증',verifyAfter:status.verifyAfter});return;}
     update(record.id,{state:'failed',note:'삭제 마무리 미확인 · 다시 확인 필요'});return;
   }
   update(record.id,{state:'failed',note:status.pendingOperations?'진행 중 작업이 있어 중지됨':errorMessage||'삭제 불가 · 기록 버전 또는 상태 확인 필요'});
 };
 const process=async(targets:BulkRecord[],first:boolean)=>{
   if(active.current||!targets.length)return;
   active.current=true;setRunning(true);onWorking(true);
   try{for(const record of targets){if(!mounted.current)break;await attempt(record,first);}}
   finally{active.current=false;if(mounted.current){setRunning(false);onWorking(false);}}
 };
 const begin=()=>{if(!ack||started||active.current)return;setStarted(true);void process(records,true);};
 const pending=records.filter(r=>entries[r.id]?.state==='waiting');
 const failed=records.filter(r=>entries[r.id]?.state==='failed');
 const complete=records.filter(r=>entries[r.id]?.state==='done');
 useEffect(()=>{if(!started||!pending.length)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[started,pending.length]);
 useEffect(()=>{
   if(!started||running||active.current)return;
   const due=pending.filter(r=>{const t=Date.parse(entries[r.id]?.verifyAfter||'');return Number.isFinite(t)&&t<=now;});
   if(due.length)void process(due,false);
 },[started,now,running,entries]);
 const close=()=>{if(!active.current)onClose();};
 return <dialog ref={ref} className="si-bulk-delete-dialog" aria-labelledby="si-bulk-title" onCancel={e=>{e.preventDefault();close();}}>
  <header><div><p className="si-eyebrow">PSI INSPECTOR / RECORD CLEANUP</p><h2 id="si-bulk-title">선택 기록 일괄 정리</h2></div><button className="si-btn" type="button" disabled={running} onClick={close}>닫기</button></header>
  <div className="si-bulk-delete-body">
   <p className="si-bulk-intro"><strong>{records.length}건 전체 삭제</strong> · 사진·설명·분석·보고서·이력이 삭제됩니다. 서버에서 잔여 0건을 확인해야 완료로 표시합니다.</p>
   <div className="si-bulk-summary" role="status" aria-live="polite"><span>전체 {records.length}건</span><span>완료 {complete.length}건</span><span>대기 {pending.length}건</span><span>확인 필요 {failed.length}건</span></div>
   {!started&&<div className="si-bulk-confirm">
    <p>한 번의 확인으로 선택한 기록을 순차 정리합니다. 복구할 수 없으며 기록 보존 의무가 있는 자료는 삭제하지 마세요.</p>
    <label className="si-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>선택한 {records.length}건의 영구 삭제 범위와 복구 불가를 확인했습니다.</label>
    <button type="button" className="si-btn si-delete-button" disabled={!ack} onClick={begin}>선택한 {records.length}건 전체 삭제 시작</button>
   </div>}
   <div className="si-bulk-records" aria-label="선택 기록별 삭제 진행">{records.map(record=>{
     const entry=entries[record.id],remain=entry?.verifyAfter?Math.max(0,Math.ceil((Date.parse(entry.verifyAfter)-now)/1000)):0;
     const status=entry?.state==='done'?'검증 완료':entry?.state==='waiting'?'링크 만료 대기':entry?.state==='running'?'처리 중':entry?.state==='failed'?'확인 필요':'대기';
     return <div key={record.id} className={'si-bulk-record is-'+entry?.state}>
      <div><strong>{record.title}</strong><small>{record.id.slice(0,8).toUpperCase()} · 버전 {record.revision}</small></div>
      <div><b>{status}</b><small>{entry?.note}{entry?.state==='waiting'&&remain>0?' · '+remain+'초':''}</small></div>
     </div>;
   })}</div>
   {started&&<div className="si-bulk-footer">
    {pending.length>0&&<p role="status">사진 링크 만료 후 이 창이 열려 있는 동안 마무리를 실행합니다. 창을 닫으면 자동 마무리가 중지됩니다.</p>}
    {failed.length>0&&<button type="button" className="si-btn si-primary" disabled={running} onClick={()=>void process(failed,false)}>확인 필요한 {failed.length}건 다시 확인·마무리</button>}
    {!running&&!pending.length&&!failed.length&&complete.length===records.length&&<p role="status">선택한 전체 기록의 삭제와 잔여 0건을 서버에서 확인했습니다.</p>}
    {!running&&<button className="si-btn" onClick={close}>현재 결과 확인 · 닫기</button>}
   </div>}
   <p className="si-caption">서버 점검기록과 저장된 사진만 삭제 대상입니다. 휴대폰 원본·외부 공유 사본·다운로드 PDF는 삭제되지 않습니다. 최소 삭제 영수증은 남습니다.</p>
  </div>
 </dialog>;
}
