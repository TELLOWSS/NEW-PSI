import React,{useEffect,useId,useRef,useState} from 'react';
import {actionPriorityLabel,actionSourceNote,actionStatusLabel,actionSuggestions,buildRegisteredActionRequest,calendarDueDate,photoActionEntry,recentActionOwners,type ActionSource,type ActionSuggestion} from '../../lib/inspector/actionPlan';
import type {Evidence,Inspection,InspectorAction} from '../../lib/inspector/types';
import InspectorShareButton from './InspectorShareButton';
import InspectorActionFollowup,{type ImprovementSubmission} from './InspectorActionFollowup';
import {actionQueue,actionFilterLabels,overdueAction,type ActionFilter} from '../../lib/inspector/workQueue';
import {useInspectionDay} from './useInspectionDay';

function ActionDraft({suggestion,sources,busy,onSave,onDirty,onOpen,initialPhotoId,owners,today}:{key?:string;suggestion?:ActionSuggestion;sources:ActionSource[];busy:boolean;onSave:(action:InspectorAction)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;onOpen:(id:string)=>void;initialPhotoId?:string;owners:string[];today:string}){
    const initialTitle=suggestion&&suggestion.title.length<=1000?suggestion.title:'';
    const prefix=useId(),[title,setTitle]=useState(initialTitle),[owner,setOwner]=useState(''),[dueDate,setDueDate]=useState(''),[selected,setSelected]=useState<string[]>(()=>initialPhotoId&&sources.some(s=>s.photoId===initialPhotoId)?[initialPhotoId]:[]),[checked,setChecked]=useState(false),[saved,setSaved]=useState(false);
    const actionId=useRef(crypto.randomUUID());
    const dirty=!saved&&(!!owner||!!dueDate||!!selected.length||title!==initialTitle);
    useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
    useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
    const submit=async(e:React.FormEvent)=>{
        e.preventDefault();if(busy||!checked||!selected.length||!title.trim()||!owner.trim()||!dueDate)return;
        const action:InspectorAction={id:actionId.current,title:title.trim(),owner:owner.trim(),dueDate,status:'open',completionPhotoId:'',note:actionSourceNote(sources.filter(s=>selected.includes(s.photoId))),sourcePhotoIds:sources.filter(s=>selected.includes(s.photoId)).map(s=>s.photoId)};
        if(await onSave(action))setSaved(true);
    };
    if(saved)return <div><p role="status" className="si-notice">조치를 미조치 상태로 저장했습니다. ‘등록 조치’에서 요청문을 복사하세요.</p><button type="button" className="si-btn" onClick={()=>{actionId.current=crypto.randomUUID();setTitle(initialTitle);setSelected([]);setChecked(false);setSaved(false);}}>다른 범위의 조치 작성</button></div>;
    return <form className="si-action-draft" onSubmit={submit}>
        {suggestion&&<p className="si-caption">{actionPriorityLabel[suggestion.priority]} · {suggestion.kind==='ai'?'검토한 AI 제안에서 가져옴':'저장한 전문가 의견에서 가져옴'}</p>}
        {suggestion&&suggestion.title.length>1000&&<p className="si-notice">의견이 길어 자동으로 줄이지 않았습니다. 아래 사진의 의견 전체를 확인하고 요청할 조치를 1,000자 안으로 정리해 주세요.</p>}
        <div><label htmlFor={prefix+'title'}>현장에 요청할 조치</label><textarea id={prefix+'title'} required maxLength={1000} rows={3} value={title} disabled={busy} onChange={e=>{setTitle(e.target.value);setChecked(false);}}/></div>
        <fieldset className="si-action-sources"><legend>적용할 사진 선택</legend><p className="si-caption">같은 문구도 위치와 작업 범위가 다를 수 있습니다. 실제로 이 조치를 적용할 사진만 선택하세요.</p>
            {sources.map(source=><div key={source.photoId}><label><input type="checkbox" disabled={busy} checked={selected.includes(source.photoId)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,source.photoId]:ids.filter(id=>id!==source.photoId));setChecked(false);}}/><span><b>사진 {source.photoNumber}</b><span>{source.description||'사진 설명 미입력'}</span>{source.reviewNote&&<small>전문가 의견: {source.reviewNote}</small>}</span></label><button type="button" className="si-btn" disabled={busy} onClick={()=>onOpen(source.photoId)}>사진 {source.photoNumber} 다시 보기</button><details><summary>설명·의견 전체 보기</summary><p className="si-pre">{source.description||'사진 설명 미입력'}</p>{source.reviewNote&&<p className="si-pre">전문가 의견: {source.reviewNote}</p>}</details></div>)}
        </fieldset>
        <div className="si-action-assignment"><div><label htmlFor={prefix+'owner'}>담당자·공종</label><input id={prefix+'owner'} required maxLength={100} value={owner} disabled={busy} placeholder="예: 형틀반장" onChange={e=>{setOwner(e.target.value);setChecked(false);}}/>{owners.length>0&&<div className="si-assignment-shortcuts" role="group" aria-label="이 점검에서 사용한 담당자">{owners.map(name=><button key={name} type="button" className="si-btn" disabled={busy} aria-pressed={owner===name} onClick={()=>{setOwner(name);setChecked(false);}}>{name}</button>)}</div>}</div><div><label htmlFor={prefix+'due'}>완료기한</label><input id={prefix+'due'} aria-describedby={prefix+'due-hint'} type="date" required value={dueDate} disabled={busy} onChange={e=>{setDueDate(e.target.value);setChecked(false);}}/><div className="si-assignment-shortcuts" role="group" aria-label="완료기한 빠른 선택">{([[0,'오늘'],[1,'내일'],[3,'3일 뒤']] as const).map(([offset,label])=>{const date=calendarDueDate(today,offset);return <button key={offset} type="button" className="si-btn" title={date} disabled={busy||!date} aria-pressed={dueDate===date} onClick={()=>{setDueDate(date);setChecked(false);}}>{label}</button>;})}</div><p className="si-caption" id={prefix+'due-hint'}>선택 기한 {dueDate||'미선택'}<br/>{today} 기준 · 한국시간·기기 시계 · 달력일</p></div></div>
        <label className="si-action-ack"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/><span>선택한 사진의 실제 위치·상태와 조치 적용 범위를 확인했습니다.</span></label>
        <button className="si-btn si-primary" disabled={busy||!checked||!selected.length||!title.trim()||!owner.trim()||!dueDate}>확인한 조치 저장</button>
        <p className="si-caption">미조치로 등록합니다. 등록 조치에서 개선사진·전후 비교·현장 재점검을 이어갑니다.</p>
    </form>;
}

export default function InspectorActionPlanner({item,busy,active,onSave,onDirty,onOpen,evidence,loadPhoto,onSubmitImprovement,onVerify,initialPhotoId,onCloseEntry,initialRegistered=false}:{key?:string;item:Inspection;busy:boolean;active:boolean;onSave:(action:InspectorAction)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;onOpen:(id:string)=>void;evidence:Evidence[];loadPhoto:(id:string)=>Promise<Blob>;onSubmitImprovement:(input:ImprovementSubmission)=>Promise<boolean>;onVerify:(id:string,note:string)=>Promise<boolean>;initialPhotoId?:string;onCloseEntry?:()=>void;initialRegistered?:boolean}){
    const selectId=useId();
    const [filter,setFilter]=useState<ActionFilter>(initialRegistered?'unresolved':'all'),[query,setQuery]=useState(''),[order,setOrder]=useState<'registered'|'due'>(initialRegistered?'due':'registered'),[editingFollowup,setEditingFollowup]=useState(false);
    const today=useInspectionDay(editingFollowup);
    const doc=item.document,suggestions=actionSuggestions(doc),[selected,setSelected]=useState(()=>initialPhotoId?photoActionEntry(doc,initialPhotoId):''),[mode,setMode]=useState<'draft'|'registered'>(initialRegistered?'registered':'draft'),[message,setMessage]=useState(''),[page,setPage]=useState(0);
    const root=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(!!initialPhotoId||initialRegistered);
    useEffect(()=>{if(!initialPhotoId&&!initialRegistered)return;const frame=requestAnimationFrame(()=>{root.current?.scrollIntoView({block:'start',behavior:'smooth'});if(initialPhotoId)root.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({preventScroll:true});else root.current?.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[initialPhotoId,initialRegistered]);
    const dirty=useRef(false),followupDirty=useRef(new Set<string>());
    const updateDirty=React.useCallback((value:boolean)=>{dirty.current=value;onDirty(value||followupDirty.current.size>0);},[onDirty]);
    const updateFollowupDirty=React.useCallback((id:string,value:boolean)=>{if(value)followupDirty.current.add(id);else followupDirty.current.delete(id);setEditingFollowup(followupDirty.current.size>0);onDirty(dirty.current||followupDirty.current.size>0);},[onDirty]);
    const changePage=(next:number)=>{if(!followupDirty.current.size||window.confirm('페이지를 바꾸면 저장 전 개선사진·재점검 입력이 사라집니다. 바꿀까요?'))setPage(next);};
    const current=suggestions.find(s=>s.key===(selected||suggestions[0]?.key)),manual=selected==='manual';
    const sources=manual?doc.photoIds.map((photoId,index)=>({photoId,photoNumber:index+1,description:doc.photoNotes?.[photoId]||'',reviewNote:''})):current?.sources||[];
    const remaining=doc.actions.filter(a=>a.status!=='verified'),filtered=actionQueue(doc.actions,filter,query,today,order),filteredRemaining=filtered.filter(a=>a.status!=='verified'),pages=Math.max(1,Math.ceil(filtered.length/3)),activePage=Math.min(page,pages-1);
    const changeList=(nextFilter:ActionFilter,nextQuery:string,nextOrder:'registered'|'due')=>{
        const nextIds=new Set(actionQueue(doc.actions,nextFilter,nextQuery,today,nextOrder).slice(0,3).map(a=>a.id));
        if([...followupDirty.current].some(id=>!nextIds.has(id))&&!window.confirm('분류·검색·정렬을 바꾸면 저장 전 개선사진·재점검 입력이 사라집니다. 바꿀까요?'))return;
        setFilter(nextFilter);setQuery(nextQuery);setOrder(nextOrder);setPage(0);
    };
    const copy=(actions:InspectorAction[])=>void navigator.clipboard.writeText(buildRegisteredActionRequest(actions,doc.title,doc.photoIds)).then(()=>setMessage('등록한 조치요청문을 복사했습니다.')).catch(()=>setMessage('복사하지 못했습니다. 아래 조치 내용을 선택해 주세요.'));
    return <details ref={root} className="si-action-planner" hidden={active} open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>조치 모아보기 <span>· 제안 {suggestions.length}개 · 미결 {remaining.length}건</span></summary>
        {initialRegistered&&<p className="si-caption si-action-record-title">점검: <b>{doc.title}</b> · 저장 버전 {item.revision}</p>}
        <p className="si-caption">{initialRegistered?'미조치와 완료 검토 요청을 기한순으로 열었습니다. 개선사진과 현장 상태를 대조해 이어서 확인하세요.':'선택 기능 · 검토한 사진의 같은 조치 문구를 묶어 봅니다. 조치는 직접 확인해 저장하세요.'}</p>
        {initialPhotoId&&doc.photoIds.includes(initialPhotoId)&&<p className="si-notice">사진 {doc.photoIds.indexOf(initialPhotoId)+1}에서 이어 작성합니다. 이 사진만 먼저 선택했으며 다른 사진은 직접 추가하세요. 담당자·기한·적용 범위를 확인한 뒤 저장합니다. {onCloseEntry&&<button type="button" className="si-btn" disabled={busy} onClick={onCloseEntry}>이 조치 작성 닫기</button>}</p>}
        <div className="si-action-views"><button type="button" className="si-btn" aria-pressed={mode==='draft'} onClick={()=>setMode('draft')}>조치 정리</button><button type="button" className="si-btn" aria-pressed={mode==='registered'} onClick={()=>setMode('registered')}>등록 조치 {doc.actions.length}</button></div>
        <div hidden={mode!=='draft'} onFocusCapture={()=>{if(!selected&&current)setSelected(current.key);}}>
            <label className="si-label" htmlFor={selectId}>정리할 제안</label><select id={selectId} value={manual?'manual':current?.key||''} disabled={busy} onChange={e=>{if(!dirty.current||window.confirm('제안을 바꾸면 작성 중인 조치 입력이 지워집니다. 바꿀까요?'))setSelected(e.target.value);}}>{!suggestions.length&&<option value="">검토한 사진의 조치 제안 없음</option>}{suggestions.map((s,n)=><option key={s.key} value={s.key}>{n+1}. {actionPriorityLabel[s.priority]} · {s.title.slice(0,45)} · 사진 {s.sources.length}장</option>)}<option value="manual">직접 조치 작성</option></select>
            {doc.actions.length>=30?<p className="si-notice">한 점검의 조치 30건을 모두 사용했습니다.</p>:(current||manual)?<ActionDraft key={manual?'manual':current!.key} suggestion={manual?undefined:current} sources={sources} busy={busy} onSave={onSave} onDirty={updateDirty} onOpen={onOpen} initialPhotoId={initialPhotoId} owners={recentActionOwners(doc.actions)} today={today}/>:<p className="si-caption">사진 결과를 검토하거나 ‘직접 조치 작성’을 선택하세요. AI를 끈 점검도 직접 작성할 수 있습니다.</p>}
        </div><div className="si-registered-actions" hidden={mode!=='registered'}>
            <p>미결 {remaining.length}건 · 재점검 확인 {doc.actions.length-remaining.length}건</p><button type="button" className="si-btn" disabled={!remaining.length} onClick={()=>copy(remaining)}>미결 조치요청문 복사</button><InspectorShareButton title="현장 미결 조치 요청" text={buildRegisteredActionRequest(remaining,doc.title,doc.photoIds)} disabled={!remaining.length} label="미결 조치 보내기"/>
            <details className="si-queue-tools" open={!initialRegistered&&doc.actions.length>3}><summary>분류·검색·정렬 · {filtered.length}/{doc.actions.length}건</summary>
            <div className="si-queue-filters" role="group" aria-label="등록 조치 분류">{(Object.entries(actionFilterLabels) as [ActionFilter,string][]).map(([id,label])=><button type="button" key={id} className="si-btn" aria-pressed={filter===id} onClick={()=>changeList(id,query,order)}>{label} {id==='all'?doc.actions.length:actionQueue(doc.actions,id,'',today).length}</button>)}</div>
            <div className="si-action-queue-controls"><label htmlFor={selectId+'search'}>조치·담당 검색<input id={selectId+'search'} type="search" maxLength={200} value={query} onChange={e=>changeList(filter,e.target.value,order)} placeholder="예: 개구부, 형틀반장"/></label><label htmlFor={selectId+'sort'}>목록 순서<select aria-label="목록 순서" id={selectId+'sort'} value={order} onChange={e=>changeList(filter,query,e.target.value as 'registered'|'due')}><option value="registered">등록 순서</option><option value="due">기한 빠른 미결부터</option></select></label></div>
            <p className="si-caption">{filtered.length}건 일치 · 기준일 {today} (한국시간·기기 시계). 오늘 기한은 지연으로 세지 않습니다.{editingFollowup?' 저장 전 개선 입력을 보호하기 위해 기준일을 잠시 유지합니다.':''}</p></details>
            {(filter!=='all'||query.trim())&&filteredRemaining.length>0&&<div className="si-filtered-dispatch"><p className="si-caption">분류·검색에 맞는 미결 {filteredRemaining.length}건 전체 · 다른 페이지의 일치 조치도 포함</p><button type="button" className="si-btn" disabled={busy} onClick={()=>copy(filteredRemaining)}>분류한 미결 요청문 복사</button><InspectorShareButton title="분류한 현장 미결 조치 요청" text={buildRegisteredActionRequest(filteredRemaining,doc.title,doc.photoIds)} disabled={busy} label="분류한 미결 보내기"/></div>}
            {filtered.slice(activePage*3,activePage*3+3).map(action=><section key={action.id}><h3>{action.title}</h3><p>{action.owner} · {action.dueDate} · {actionStatusLabel(action)}{overdueAction(action,today)&&<strong className="si-overdue-label"> · 기한 지남</strong>}</p><details><summary>적용 사진·기록 보기</summary><p className="si-pre">{action.note||'기록 없음'}</p></details><button type="button" className="si-btn" onClick={()=>copy([action])}>이 조치요청문 복사</button><InspectorActionFollowup item={item} action={action} evidence={evidence} busy={busy} loadPhoto={loadPhoto} onSubmit={onSubmitImprovement} onVerify={onVerify} onDirty={updateFollowupDirty}/></section>)}
            {!doc.actions.length&&<p className="si-caption">아직 등록한 조치가 없습니다. 보고서 작성은 조치 등록 없이도 가능합니다.</p>}
            {!!doc.actions.length&&!filtered.length&&<p className="si-caption">분류·검색에 맞는 조치가 없습니다. <button type="button" className="si-btn" onClick={()=>changeList('all','','registered')}>전체 조치로 돌아가기</button></p>}
            {pages>1&&<div className="si-action-pagination"><button type="button" className="si-btn" disabled={!activePage||busy} onClick={()=>changePage(activePage-1)}>이전 조치</button><span>{activePage+1} / {pages}</span><button type="button" className="si-btn" disabled={activePage>=pages-1||busy} onClick={()=>changePage(activePage+1)}>다음 조치</button></div>}
        </div>
        {message&&<p role="status">{message}</p>}
    </details>;
}
