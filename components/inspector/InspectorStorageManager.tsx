import React,{useEffect,useRef,useState} from 'react';
import {postAdminJson} from '../../utils/adminApiClient';

type Status={state:string;mode:'files'|'all'|null;verifyAfter:string|null;verified:boolean;remainingFiles:number;remainingBytes:number;remainingRecords:Record<string,number>;pendingOperations:number;oldestPendingAt:string|null;checkedAt:string;receipt:unknown};
const mb=(bytes:number)=>(bytes/1_000_000).toFixed(2);
const request=(body:unknown,timeoutMs=15000)=>postAdminJson<any>('/api/admin/inspector',body,{timeoutMs,fallbackMessage:'보관·삭제 상태를 확인하지 못했습니다. 완료로 처리하지 않았습니다.'});
export default function InspectorStorageManager({id,revision,title,disabled=false,onLocked,onComplete,onWorking}:{key?:string;id:string;revision:number;title:string;disabled?:boolean;onLocked:()=>void;onComplete:(mode:'files'|'all')=>void;onWorking?:(working:boolean)=>void}){
    const [open,setOpen]=useState(false),[status,setStatus]=useState<Status|null>(null),[usage,setUsage]=useState<{projectBytes:number;databaseBytes:number}|null>(null),[mode,setMode]=useState<'files'|'all'>('all'),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[auto,setAuto]=useState(false),[now,setNow]=useState(Date.now());
    const alive=useRef(true),inflight=useRef(false),autoFired=useRef(false),callbacks=useRef({onLocked,onComplete,onWorking});callbacks.current={onLocked,onComplete,onWorking};
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    const read=async()=>{const r=await request({op:'deletion-status',id});if(!alive.current)return null;setStatus(r.status);if(r.status.mode)setMode(r.status.mode);if(r.status.state!=='active')callbacks.current.onLocked();return r.status as Status;};
    const refresh=async()=>{if(inflight.current)return;inflight.current=true;setBusy(true);setError('');try{await read();const r=await request({op:'usage'});if(alive.current)setUsage(r.usage);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'확인 실패');}finally{inflight.current=false;if(alive.current)setBusy(false);}};
    useEffect(()=>{if(open)void refresh();},[open]);
    useEffect(()=>{if(!open||status?.state!=='deleting')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[open,status?.state]);
    const seconds=status?.verifyAfter?Math.max(0,Math.ceil((Date.parse(status.verifyAfter)-now)/1000)):0;
    const purge=async(retry=false)=>{
        if(inflight.current||disabled||(!retry&&!ack))return;
        if(!retry&&!window.confirm(`‘${title}’의 ${mode==='all'?'사진·설명·분석·이력·모든 보고서':'사진 파일'}를 삭제합니다. 되돌릴 수 없습니다. 진행할까요?`))return;
        if(!retry)autoFired.current=false;
        inflight.current=true;setBusy(true);callbacks.current.onWorking?.(true);setError('');setAuto(false);
        try{const result=await request({op:'delete-inspection',id,expectedRevision:revision,confirmation:id,mode},85000);if(!alive.current)return;setStatus(result.status);callbacks.current.onLocked();if(!result.status?.verified)throw new Error('잔여 검증이 완료되지 않았습니다.');}
        catch(e){if(alive.current){setError(e instanceof Error?e.message:'삭제 미완료');try{const s=await read();if(s?.state==='deleting'&&s.verifyAfter&&Date.parse(s.verifyAfter)>Date.now()&&!s.pendingOperations&&!autoFired.current)setAuto(true);}catch{setError('삭제 상태 조회도 실패했습니다. 연결 복구 후 상태를 다시 확인하세요.');}}}
        finally{inflight.current=false;if(alive.current){setNow(Date.now());setBusy(false);callbacks.current.onWorking?.(false);}}
    };
    // Continue only this user's explicitly started deletion, while this panel stays open.
    // Reloading/closing never schedules background deletion or assumes an unfinished job succeeded.
    useEffect(()=>{if(open&&auto&&status?.state==='deleting'&&seconds===0&&!busy){autoFired.current=true;setAuto(false);void purge(true);}},[open,auto,status?.state,seconds,busy]);
    const saveReceipt=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({inspectionId:id,status},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`PSI-deletion-${id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    return <details className="si-storage-manager" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>보관 용량 · 이 점검 삭제</summary>{open&&<div>
        <p>선택 점검: <b>{title}</b></p>
        <p className="si-caption">사진은 Supabase 비공개 저장소, 설명·분석·보고서는 DB에 보관합니다. 기기 원본은 건드리지 않습니다.</p>
        {usage&&<div className="si-storage-usage"><b>프로젝트 파일 {mb(usage.projectBytes)}MB</b><progress aria-label="프로젝트 파일 보관량" value={usage.projectBytes} max={1_000_000_000}/><p>앱 업로드 한도까지 {mb(Math.max(0,900_000_000-usage.projectBytes))}MB · DB {mb(usage.databaseBytes)}MB</p><p className="si-caption">무료 참고: 파일 1GB · DB 500MB · 전송 5GB 및 캐시 전송 5GB. 프로젝트 파일 조회값이며 조직 전체 잔여량·이번 달 전송량은 아닙니다. 삭제해도 이미 사용한 전송량은 돌아오지 않습니다. DB 표시 용량은 삭제 직후 줄지 않고 정리 후 재사용될 수 있습니다. <a href="https://supabase.com/pricing" target="_blank" rel="noopener noreferrer">공식 한도 ↗</a></p></div>}
        <button type="button" className="si-btn" disabled={busy} onClick={()=>void refresh()}>보관·삭제 상태 다시 확인</button>
        {error&&<p className="si-notice si-error" role="alert">{error}</p>}
        {status&&<section className="si-deletion-status" aria-label="삭제 검증 결과" aria-live="polite"><h3>{status.verified?'선택 범위 삭제 검증 완료':status.state==='deleting'?'삭제 진행 · 아직 완료 아님':'현재 보관 상태'}</h3><dl><div><dt>남은 사진 파일</dt><dd>{status.remainingFiles}개 · {mb(status.remainingBytes)}MB</dd></div><div><dt>점검 / 사진정보 / 보고서 / 이력</dt><dd>{['inspections','evidence','reports','events'].map(k=>status.remainingRecords[k]).join(' / ')}건</dd></div><div><dt>진행 중 업로드·분석</dt><dd>{status.pendingOperations}건</dd></div></dl>
            {status.pendingOperations>0&&<p>작업 종료가 확인되기 전에는 완료 처리하지 않습니다. 오래 멈춘 작업은 관리자 확인이 필요합니다. 임의로 완료 상태로 바꾸지 않습니다.</p>}
            {status.state==='deleting'&&seconds>0&&<p role="status">기존 사진 링크 만료 대기 {seconds}초. {auto?'이 화면을 열어두면 자동으로 마무리합니다.':'대기 후 삭제를 마무리하세요.'}</p>}
            {status.state==='deleting'&&<button className="si-btn si-primary" disabled={busy||disabled||seconds>0||status.pendingOperations>0} onClick={()=>void purge(true)}>남은 삭제 마무리</button>}
            {status.verified&&<><p>{status.mode==='all'?'사진·점검·분석·이력·보고서 잔여 0건을 서버에서 다시 확인했습니다.':'사진 파일만 제거했습니다. 설명·분석·보고서는 남으며 추가 편집은 잠깁니다.'}</p><button className="si-btn" onClick={saveReceipt}>삭제 검증서 저장</button><button className="si-btn" onClick={()=>callbacks.current.onComplete(status.mode||mode)}>확인 · 점검 화면 정리</button></>}
            <p className="si-caption">확인 시각 {new Date(status.checkedAt).toLocaleString('ko-KR')} · 최소 삭제 영수증은 재시도 확인용으로 남습니다. 외부 AI·다운로드 PDF·기기·클립보드 및 제공자 백업·로그까지 지웠다는 보장은 아닙니다.</p>
        </section>}
        {status&&(status.state==='active'||status.state==='files-deleted')&&<div className="si-delete-choice"><label>삭제할 범위<select value={mode} disabled={busy||disabled} onChange={e=>{setMode(e.target.value as 'files'|'all');setAck(false);}}><option value="all">사진·설명·분석·이력·보고서 전체</option><option value="files" disabled={status.state==='files-deleted'}>사진 파일만 · 기록과 보고서 유지</option></select></label><label className="si-check"><input type="checkbox" checked={ack} disabled={busy||disabled} onChange={e=>setAck(e.target.checked)}/>이 점검에 포함된 자료가 삭제되고 되돌릴 수 없음을 확인했습니다.</label><button type="button" className="si-btn si-delete-button" disabled={busy||disabled||!ack} onClick={()=>void purge()}>{busy?'삭제·잔여 확인 중…':'선택 범위 삭제 시작'}</button>{disabled&&<p>진행 중 작업 또는 저장 전 수정사항을 먼저 정리해 주세요.</p>}</div>}
    </div>}</details>;
}
