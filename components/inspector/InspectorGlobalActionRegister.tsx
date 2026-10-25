import React,{useEffect,useRef,useState} from 'react';
import {postAdminJson} from '../../utils/adminApiClient';
import {actionDeadlineText} from '../../lib/inspector/workQueue';
import {koreanDay} from '../../lib/inspector/workQueue';
import {buildGlobalActionRegisterCsv,filterGlobalActions,globalActionCounts,globalActionPhase,registerFilterLabel,type RegisterFilter,type GlobalActionRow} from '../../lib/inspector/globalActionRegister';
import './inspector-global-register.css';
type Cursor={before:string;beforeId:string};
type Response={ok:boolean;rows:GlobalActionRow[];inspectionCount:number;hasMore:boolean;nextCursor:Cursor|null};
export default function InspectorGlobalActionRegister({onOpenAction,blocked=false}:{onOpenAction:(inspectionId:string,actionId:string)=>void;blocked?:boolean}){
 const [rows,setRows]=useState<GlobalActionRow[]>([]),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false);
 const [inspections,setInspections]=useState(0),[more,setMore]=useState(false),[cursor,setCursor]=useState<Cursor|null>(null);
 const [filter,setFilter]=useState<RegisterFilter>('unresolved'),[search,setSearch]=useState(''),[error,setError]=useState('');
 const alive=useRef(true),inflight=useRef(false),exportUrl=useRef('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(exportUrl.current)URL.revokeObjectURL(exportUrl.current);};},[]);
 const fetchPage=async(next:Cursor|null,reset:boolean)=>{
  if(inflight.current)return;
  inflight.current=true;setLoading(true);setError('');
  try{
   const result=await postAdminJson<Response>('/api/admin/inspector',{op:'global-action-register',...(next||{})},{
    timeoutMs:18000,fallbackMessage:'통합 조치 목록을 읽지 못했습니다. 저장된 원본은 그대로 유지됩니다.',
   });
   if(!alive.current)return;
   setRows(old=>reset?result.rows:[...old,...result.rows.filter(r=>!old.some(x=>x.inspectionId===r.inspectionId&&x.actionId===r.actionId))]);
   setInspections(old=>reset?result.inspectionCount:old+result.inspectionCount);
   setMore(result.hasMore);setCursor(result.nextCursor);setLoaded(true);
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'목록을 읽지 못했습니다.');}
  finally{inflight.current=false;if(alive.current)setLoading(false);}
 };
 const today=koreanDay(),counts=globalActionCounts(rows,today),filtered=filterGlobalActions(rows,filter,search,today);
 const exportLoaded=()=>{
  if(!rows.length)return;
  if(exportUrl.current)URL.revokeObjectURL(exportUrl.current);
  const url=URL.createObjectURL(new Blob([buildGlobalActionRegisterCsv(filtered,today)],{type:'text/csv;charset=utf-8'}));exportUrl.current=url;
  const a=document.createElement('a');a.href=url;a.download='PSI_인스펙터_조회범위_조치대장_'+today+'.csv';a.click();
 };
 return <details className="si-global-register" data-global-register="loaded-pages-only" onToggle={e=>{if(e.currentTarget.open&&!loaded&&!inflight.current)void fetchPage(null,true);}}>
  <summary>전체 점검 통합 조치대장 <span>정기·컨설팅 점검의 약정기한 모아보기</span></summary>
  <div className="si-global-register-body">
   <p className="si-caption">관리자가 직접 열었을 때만 서버의 최근 점검을 20건씩 조회합니다. 사진 파일은 내려받지 않습니다. 집계는 불러온 점검 범위만이며, 실제 현장 전체의 미결·무위험을 확정하지 않습니다.</p>
   <div className="si-global-register-toolbar">
    <button type="button" className="si-btn" disabled={loading} onClick={()=>void fetchPage(null,true)}>{loading?'조회 중…':loaded?'최신 저장 조치 새로고침':'조치대장 불러오기'}</button>
    <button type="button" className="si-btn" disabled={!rows.length||loading} onClick={exportLoaded}>현재 조회 결과 CSV</button>
   </div>
   {error&&<p role="alert" className="si-notice si-error">{error} · 다시 조회해 주세요. 저장한 조치 기록은 변경하지 않았습니다.</p>}
   {loaded&&<><p className="si-caption" role="status">불러온 점검 {inspections}건 · 저장 조치 {rows.length}건{more?' · 이전 점검 더 있음':''}. 조회 기준 {today} (한국시간)</p>
    <div className="si-global-register-stats" aria-label="불러온 점검의 조치현황">
     {([['unresolved',counts.unresolved],['scheduled',counts.scheduled],['today',counts.today],['overdue',counts.overdue],['reinspection',counts.reinspection],['verified',counts.verified]] as const).map(([kind,n])=><button type="button" key={kind} aria-pressed={filter===kind} className={filter===kind?'is-active':''} onClick={()=>setFilter(kind)}><b>{n}</b><span>{registerFilterLabel[kind]}</span></button>)}
    </div>
    <div className="si-global-register-controls">
     <label>대상 검색<input type="search" aria-label="통합 조치 검색" maxLength={100} placeholder="점검명·현장·공종·담당·조치" value={search} onChange={e=>setSearch(e.target.value)}/></label>
     <label>목록 보기<select aria-label="통합 조치 필터" value={filter} onChange={e=>setFilter(e.target.value as RegisterFilter)}>{Object.entries(registerFilterLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="si-global-register-list" aria-live="polite">
     {!filtered.length?<p className="si-caption">현재 불러온 범위에 일치하는 조치가 없습니다. 이전 점검은 ‘더 보기’로 추가 조회할 수 있습니다.</p>:filtered.map(row=>{
      const phase=globalActionPhase(row,today);
      return <article key={row.inspectionId+':'+row.actionId} className="si-global-register-entry" data-global-action-id={row.actionId}>
       <div><b>{row.title}</b><p>{row.inspectionTitle} · {row.siteName||'현장 미입력'} · {row.location||'위치 미입력'} · {row.workType||'공종 미입력'}</p>
        <p>담당 {row.owner} · 약정기한 {row.dueDate} · <strong>{actionDeadlineText({status:row.status,dueDate:row.dueDate} as import('../../lib/inspector/types').InspectorAction,today)}</strong></p>
        {row.scheduleContext&&<p>기한 설정 근거: {row.scheduleContext}</p>}
        {row.urgent&&<p className="si-global-register-urgent">원점검에 긴급 검토 표시 · 기한과 별개로 현장 통제 필요성 확인</p>}
       </div>
       <button type="button" className="si-btn si-primary" disabled={blocked||loading} onClick={()=>onOpenAction(row.inspectionId,row.actionId)}>원점검 조치 열기</button>
      </article>;
     })}
    </div>
    {more&&cursor&&<button type="button" className="si-btn" disabled={loading} onClick={()=>void fetchPage(cursor,false)}>이전 점검 20건 더 보기</button>}
    <p className="si-caption">사진·회신의 실제 이행, 삭제 중 자료, 작업재개·법 위반 여부를 이 목록만으로 확정하지 않습니다. 기한 전이라도 필요한 임시 보호조치를 현장 관리자가 확인하세요. CSV는 조회한 조치만 포함합니다.</p>
   </>}
  </div>
 </details>;
}
