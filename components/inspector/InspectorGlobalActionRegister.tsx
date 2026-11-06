import React,{useEffect,useRef,useState} from 'react';
import {inspectionKindText} from '../../lib/inspector/types';
import {postAdminJson} from '../../utils/adminApiClient';
import {koreanDay} from '../../lib/inspector/workQueue';
import {buildGlobalActionRegisterCsv,filterGlobalActionsWithCriteria,globalActionCounts,globalActionCheckCounts,globalRegisterCriteriaError,globalActionDimensions,globalActionStatusText,globalActionNextStep,registerFilterLabel,type RegisterFilter,type GlobalActionRow,type GlobalRegisterCriteria} from '../../lib/inspector/globalActionRegister';
import './inspector-global-register.css';
type Cursor={before:string;beforeId:string};
type Response={ok:boolean;rows:GlobalActionRow[];inspectionCount:number;hasMore:boolean;nextCursor:Cursor|null};
export default function InspectorGlobalActionRegister({onOpenAction,blocked=false}:{onOpenAction:(inspectionId:string,actionId:string)=>void;blocked?:boolean}){
 const [rows,setRows]=useState<GlobalActionRow[]>([]),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false);
 const [inspections,setInspections]=useState(0),[more,setMore]=useState(false),[cursor,setCursor]=useState<Cursor|null>(null);
 const [filter,setFilter]=useState<RegisterFilter>('unresolved'),[search,setSearch]=useState(''),[error,setError]=useState('');
 const [site,setSite]=useState(''),[owner,setOwner]=useState(''),[dueFrom,setDueFrom]=useState(''),[dueTo,setDueTo]=useState('');
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
 const today=koreanDay(),criteria:GlobalRegisterCriteria={site,owner,dueFrom,dueTo};
 const criteriaError=globalRegisterCriteriaError(criteria);
 const sites:string[]=Array.from(new Set<string>(rows.map((row:GlobalActionRow)=>row.siteName.trim()).filter((value:string)=>value.length>0))).sort((a:string,b:string)=>a.localeCompare(b,'ko'));
 const owners:string[]=Array.from(new Set<string>(rows.map((row:GlobalActionRow)=>row.owner.trim()).filter((value:string)=>value.length>0))).sort((a:string,b:string)=>a.localeCompare(b,'ko'));
 const scoped=filterGlobalActionsWithCriteria(rows,'all',search,today,criteria);
 const counts=globalActionCounts(scoped,today),checks=globalActionCheckCounts(scoped,today);
 const filtered=filterGlobalActionsWithCriteria(rows,filter,search,today,criteria);
 const exportLoaded=()=>{
  if(!rows.length)return;
  if(exportUrl.current)URL.revokeObjectURL(exportUrl.current);
  const url=URL.createObjectURL(new Blob([buildGlobalActionRegisterCsv(filtered,today)],{type:'text/csv;charset=utf-8'}));exportUrl.current=url;
  const a=document.createElement('a');a.href=url;a.download='PSI_인스펙터_조회범위_조치대장_'+today+'.csv';a.click();
 };
 return <details className="si-global-register" data-global-register="loaded-pages-only" onToggle={e=>{if(e.currentTarget.open&&!loaded&&!inflight.current)void fetchPage(null,true);}}>
  <summary>전체 점검 통합 조치대장 <span>정기·컨설팅 점검의 약정기한 모아보기</span></summary>
  <div className="si-global-register-body">
   <p className="si-caption">정기·컨설팅점검은 합의된 개선기한을 추적하고 현장 재점검으로 완료를 확인합니다. 급박한 위험의 접근통제·작업중지 필요성은 기한과 별개로 판단합니다.</p>
   <p className="si-caption">관리자가 직접 열었을 때만 서버의 최근 점검을 20건씩 조회합니다. 사진 파일은 내려받지 않습니다. 검색과 현장·담당·기한 필터는 <strong>이미 불러온 점검기록만</strong> 대상으로 하며, 다른 현장 전체의 미결·무위험을 확정하지 않습니다.</p>
   <div className="si-global-register-toolbar">
    <button type="button" className="si-btn" disabled={loading} onClick={()=>void fetchPage(null,true)}>{loading?'조회 중…':loaded?'최신 저장 조치 새로고침':'조치대장 불러오기'}</button>
    <button type="button" className="si-btn" disabled={!filtered.length||loading||!!criteriaError} onClick={exportLoaded}>현재 필터 결과 CSV · {filtered.length}건</button>
   </div>
   {error&&<p role="alert" className="si-notice si-error">{error} · 다시 조회해 주세요. 저장한 조치 기록은 변경하지 않았습니다.</p>}
   {loaded&&<><p className="si-caption" role="status">불러온 점검 {inspections}건 · 저장 조치 {rows.length}건{more?' · 이전 점검 더 있음':''}. 검색·선택 범위 {scoped.length}건 · 조회 기준 {today} (한국시간)</p>
    <div className="si-global-register-stats" aria-label="불러온 점검의 조치현황">
     {([['unresolved',counts.unresolved],['scheduled',counts.scheduled],['today',counts.today],['overdue',counts.overdue],['check',checks.due],['assignment',counts.assignment],['reinspection',counts.reinspection],['verified',counts.verified]] as const).map(([kind,n])=><button type="button" key={kind} aria-pressed={filter===kind} className={filter===kind?'is-active':''} onClick={()=>setFilter(kind)}><b>{n}</b><span>{registerFilterLabel[kind]}</span></button>)}
    </div>
    {counts.overlappingOverdueReinspection>0&&<p className="si-global-register-overlap" role="status">기한 초과이면서 재점검 대기인 조치 {counts.overlappingOverdueReinspection}건이 양쪽에 포함됩니다. 초과 건수와 재점검 대기 건수를 더해 미결 건수로 계산하지 마세요.</p>}
    {(checks.overlapWithOverdue>0||checks.overlapWithReinspection>0)&&<p className="si-global-register-overlap" data-global-check-overlap="true">현장 확인일이 도래한 조치 중 기한 초과와 중복 {checks.overlapWithOverdue}건, 재점검 대기와 중복 {checks.overlapWithReinspection}건입니다. 다른 기준의 분류 건수를 합산하지 마세요.</p>}
    <div className="si-global-register-controls">
     <label>대상 검색<input type="search" aria-label="통합 조치 검색" maxLength={100} placeholder="점검명·현장·공종·담당·조치" value={search} onChange={e=>setSearch(e.target.value)}/></label>
     <label>목록 보기<select aria-label="통합 조치 필터" value={filter} onChange={e=>setFilter(e.target.value as RegisterFilter)}>{Object.entries(registerFilterLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <fieldset className="si-global-register-scope" data-global-filter-fields="true">
     <legend>현장·담당·약정기한으로 좁혀 보기</legend>
     <div className="si-global-register-scope-grid">
      <label>현장<select aria-label="통합 조치 현장 선택" value={site} onChange={e=>setSite(e.target.value)}><option value="">불러온 현장 전체</option>{sites.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label>담당자·공종<select aria-label="통합 조치 담당 선택" value={owner} onChange={e=>setOwner(e.target.value)}><option value="">불러온 담당 전체</option>{owners.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label>완료기한 시작<input type="date" aria-label="통합 조치 기한 시작일" value={dueFrom} onChange={e=>setDueFrom(e.target.value)}/></label>
      <label>완료기한 종료<input type="date" aria-label="통합 조치 기한 종료일" value={dueTo} onChange={e=>setDueTo(e.target.value)}/></label>
     </div>
     <div className="si-global-register-scope-footer"><span>완료기한은 약정기한 기준입니다. 다음 현장 확인 예정일과 서로 다릅니다.</span><button type="button" className="si-btn" disabled={!site&&!owner&&!dueFrom&&!dueTo&&!search} onClick={()=>{setSite('');setOwner('');setDueFrom('');setDueTo('');setSearch('');}}>검색 조건 초기화</button></div>
     {criteriaError&&<p role="alert" className="si-global-register-overlap">{criteriaError} 이전 점검기록은 변경되지 않았습니다.</p>}
    </fieldset>
    {counts.assignment>0&&<p className="si-global-register-assignment-notice" data-global-assignment-count="true">현재 검색·현장·담당·기한 선택 범위에 <b>담당자가 미지정되었거나 유효한 약정기한을 확인해야 할 미결 조치 {counts.assignment}건</b>이 있습니다. ‘담당·기한 확인 필요’를 선택해 원점검을 확인하세요. 날짜·담당자를 자동 배정하거나 조치 완료로 판단하지 않습니다.</p>}
    {checks.due>0&&<p className="si-global-register-check-notice" data-global-next-check-count="true">다음 현장 확인 예정일이 도래한 미결 조치 {checks.due}건 (예정일 지난 건 {checks.past}건). 계획상 날짜만 확인한 것이며 현장 확인·임시조치 시행·자동 알림 여부는 검증되지 않았습니다.</p>}
    <div className="si-global-register-list" aria-live="polite">
     {!filtered.length?<p className="si-caption">현재 불러온 범위에 일치하는 조치가 없습니다. 이전 점검은 ‘더 보기’로 추가 조회할 수 있습니다.</p>:filtered.map(row=>{
      const dimension=globalActionDimensions(row,today);
      return <article key={row.inspectionId+':'+row.actionId} className="si-global-register-entry" data-global-action-id={row.actionId} data-deadline-passed={dimension.overdue?'yes':'no'} data-reinspection-pending={dimension.reinspection?'yes':'no'} data-assignment-needed={dimension.assignmentNeeded?'yes':'no'}>
       <div><b>{row.title}</b><p>{inspectionKindText(row.inspectionKind)} · {row.inspectionTitle} · {row.siteName||'현장 미입력'} · {row.location||'위치 미입력'} · {row.workType||'공종 미입력'}</p>
        <p>담당 {row.owner?.trim()||'미지정'} · 약정기한 {row.dueDate||'미지정'} · <strong>{globalActionStatusText(row,today)}</strong></p>
        {dimension.assignmentNeeded&&<p className="si-global-register-assignment-detail" data-assignment-gap="true">확인 필요: {[dimension.ownerMissing?'담당자 미지정':'',dimension.dueDateNeedsReview?'약정기한 미입력·유효성 확인':''].filter(Boolean).join(' / ')} · 원점검에서 담당자·기한을 직접 확인하세요.</p>}
        {dimension.nextCheckDate&&<p className="si-global-register-next-check" data-next-check-date={dimension.nextCheckDate}>다음 현장 확인 예정: <b>{dimension.nextCheckDate}</b>{dimension.checkLate?' · 예정일 지남 · 현장 확인 필요':dimension.check?' · 오늘 현장 확인 예정':''} · 실제 확인·시행 여부 미확인</p>}
        <p className="si-global-register-next"><b>다음 확인:</b> {globalActionNextStep(row,today)}</p>
        {row.scheduleContext&&<p>기한 설정 근거: {row.scheduleContext}</p>}
        {row.urgent&&<p className="si-global-register-urgent">원점검에 긴급 검토 표시 · 기한과 별개로 현장 통제 필요성 확인</p>}
       </div>
       <button type="button" className="si-btn si-primary" disabled={blocked||loading} onClick={()=>onOpenAction(row.inspectionId,row.actionId)}>원점검 조치 열기</button>
      </article>;
     })}
    </div>
    {more&&cursor&&<button type="button" className="si-btn" disabled={loading} onClick={()=>void fetchPage(cursor,false)}>이전 점검 20건 더 보기</button>}
    <p className="si-caption">사진·회신의 실제 이행, 삭제 중 자료, 작업재개·법 위반 여부를 이 목록만으로 확정하지 않습니다. 완료 검토 요청은 현장 재점검 확인이 아니며, 약정기한이 경과했다는 사실만으로 기한 내 조치 여부를 확정할 수 없습니다. 기한 전이라도 필요한 임시 보호조치를 현장 관리자가 확인하세요. CSV는 불러온 기록 중 현재 필터 결과만 포함합니다. 다른 점검을 더 읽으려면 ‘이전 점검 20건 더 보기’를 누르세요.</p>
   </>}
  </div>
 </details>;
}
