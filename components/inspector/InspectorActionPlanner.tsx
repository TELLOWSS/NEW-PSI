import React,{lazy,Suspense,useEffect,useId,useRef,useState} from 'react';
import {actionDraftChanged,actionPriorityLabel,actionSourceNote,actionStatusLabel,actionSuggestions,buildRegisteredActionRequest,calendarDueDate,photoActionEntry,recentActionOwners,type ActionSource,type ActionSuggestion,type FindingActionEntry} from '../../lib/inspector/actionPlan';
import type {Evidence,Inspection,InspectorAction} from '../../lib/inspector/types';
import InspectorShareButton from './InspectorShareButton';
import InspectorActionFollowup,{type ImprovementSubmission} from './InspectorActionFollowup';
import {actionQueue,actionFilterLabels,actionDeadlineText,overdueAction,type ActionFilter} from '../../lib/inspector/workQueue';
import {useInspectionDay} from './useInspectionDay';
import InspectorAssignmentEditor from './InspectorAssignmentEditor';
import type {AssignmentChange} from '../../lib/inspector/actionAssignment';

const InspectorReplyInbox=lazy(()=>import('./InspectorReplyInbox'));
const InspectorActionShare=lazy(()=>import('./InspectorActionShare'));

function ActionDraft({suggestion,sources,busy,onSave,onDirty,onOpen,initialPhotoId,owners,today}:{key?:string;suggestion?:ActionSuggestion;sources:ActionSource[];busy:boolean;onSave:(action:InspectorAction)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;onOpen:(id:string)=>void;initialPhotoId?:string;owners:string[];today:string}){
    const initialTitle=suggestion&&suggestion.title.length<=1000?suggestion.title:'';
    const prefix=useId(),[title,setTitle]=useState(initialTitle),[owner,setOwner]=useState(''),[dueDate,setDueDate]=useState(''),[scheduleContext,setScheduleContext]=useState(''),[selected,setSelected]=useState<string[]>(()=>initialPhotoId&&sources.some(s=>s.photoId===initialPhotoId)?[initialPhotoId]:[]),[checked,setChecked]=useState(false),[saved,setSaved]=useState(false);
    const actionId=useRef(crypto.randomUUID());
    const initialSelected=initialPhotoId&&sources.some(s=>s.photoId===initialPhotoId)?[initialPhotoId]:[];
    const dirty=!saved&&actionDraftChanged(initialTitle,title,owner,dueDate,selected,initialSelected)||!!scheduleContext.trim();
    useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
    useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
    const submit=async(e:React.FormEvent)=>{
        e.preventDefault();if(busy||!checked||!selected.length||!title.trim()||!owner.trim()||!dueDate)return;
        const action:InspectorAction={id:actionId.current,title:title.trim(),owner:owner.trim(),dueDate,status:'open',completionPhotoId:'',note:actionSourceNote(sources.filter(s=>selected.includes(s.photoId))),...(scheduleContext.trim()?{scheduleContext:scheduleContext.trim()}:{}),sourcePhotoIds:sources.filter(s=>selected.includes(s.photoId)).map(s=>s.photoId)};
        if(await onSave(action))setSaved(true);
    };
    if(saved)return <div><p role="status" className="si-notice">조치를 미조치 상태로 저장했습니다. ‘등록 조치’에서 요청문을 복사하세요.</p><button type="button" className="si-btn" onClick={()=>{actionId.current=crypto.randomUUID();setTitle(initialTitle);setSelected([]);setScheduleContext('');setChecked(false);setSaved(false);}}>다른 범위의 조치 작성</button></div>;
    return <form className="si-action-draft" onSubmit={submit}>
        {suggestion&&<p className="si-caption">{actionPriorityLabel[suggestion.priority]} · {suggestion.kind==='ai'?'검토한 AI 제안에서 가져옴':'저장한 전문가 의견에서 가져옴'}</p>}
        {suggestion&&suggestion.title.length>1000&&<p className="si-notice">의견이 길어 자동으로 줄이지 않았습니다. 아래 사진의 의견 전체를 확인하고 요청할 조치를 1,000자 안으로 정리해 주세요.</p>}
        <div><label htmlFor={prefix+'title'}>현장에 요청할 조치</label><textarea id={prefix+'title'} required maxLength={1000} rows={3} value={title} disabled={busy} onChange={e=>{setTitle(e.target.value);setChecked(false);}}/></div>
        <fieldset className="si-action-sources"><legend>적용할 사진 선택</legend><p className="si-caption">같은 문구도 위치와 작업 범위가 다를 수 있습니다. 실제로 이 조치를 적용할 사진만 선택하세요.</p>
            {sources.map(source=><div key={source.photoId}><label><input type="checkbox" disabled={busy} checked={selected.includes(source.photoId)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,source.photoId]:ids.filter(id=>id!==source.photoId));setChecked(false);}}/><span><b>사진 {source.photoNumber}</b><span>{source.description||'사진 설명 미입력'}</span>{source.reviewNote&&<small>전문가 의견: {source.reviewNote}</small>}</span></label><button type="button" className="si-btn" disabled={busy} onClick={()=>onOpen(source.photoId)}>사진 {source.photoNumber} 다시 보기</button><details><summary>설명·의견 전체 보기</summary><p className="si-pre">{source.description||'사진 설명 미입력'}</p>{source.reviewNote&&<p className="si-pre">전문가 의견: {source.reviewNote}</p>}</details></div>)}
        </fieldset>
        <div className="si-action-assignment"><div><label htmlFor={prefix+'owner'}>담당자·공종</label><input id={prefix+'owner'} required maxLength={100} value={owner} disabled={busy} placeholder="예: 형틀반장" onChange={e=>{setOwner(e.target.value);setChecked(false);}}/>{owners.length>0&&<div className="si-assignment-shortcuts" role="group" aria-label="이 점검에서 사용한 담당자">{owners.map(name=><button key={name} type="button" className="si-btn" disabled={busy} aria-pressed={owner===name} onClick={()=>{setOwner(name);setChecked(false);}}>{name}</button>)}</div>}</div><div><label htmlFor={prefix+'due'}>완료기한</label><input id={prefix+'due'} aria-describedby={prefix+'due-hint'} type="date" required value={dueDate} disabled={busy} onChange={e=>{setDueDate(e.target.value);setChecked(false);}}/><div className="si-assignment-shortcuts" role="group" aria-label="완료기한 빠른 선택">{([[0,'당일'],[1,'1일'],[2,'2일'],[3,'3일'],[7,'7일']] as const).map(([offset,label])=>{const date=calendarDueDate(today,offset);return <button key={offset} type="button" className="si-btn" title={date} disabled={busy||!date} aria-pressed={dueDate===date} onClick={()=>{setDueDate(date);setChecked(false);}}>{label}</button>;})}</div><p className="si-caption" id={prefix+'due-hint'}>약정 완료기한 {dueDate||'미선택'}<br/>{today} 기준 · 한국시간·기기 시계 · 달력일. 달력일 기준이며 휴일을 자동 제외하지 않습니다.</p></div></div>
        <label htmlFor={prefix+'conditions'}>현장 여건·기한 설정 근거 (선택)</label><textarea id={prefix+'conditions'} rows={2} maxLength={300} value={scheduleContext} disabled={busy} placeholder="예: 자재 입고 후 2일 이내 난간 설치, 그 전까지 작업구역 출입통제" onChange={e=>{setScheduleContext(e.target.value);setChecked(false);}}/>
        <p className="si-caption">컨설팅·정기점검은 현장 여건에 따라 합리적인 조치기한을 지정할 수 있습니다. 단, 급박한 위험은 기한과 별개로 접근통제·작업중지 필요성을 먼저 검토하세요. 기한을 줬다는 이유로 안전이나 작업재개를 승인하지 않습니다.</p>
        <label className="si-action-ack"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/><span>선택한 사진의 실제 위치·상태와 조치 적용 범위를 확인했습니다.</span></label>
        <button className="si-btn si-primary" disabled={busy||!checked||!selected.length||!title.trim()||!owner.trim()||!dueDate}>확인한 조치 저장</button>
        <p className="si-caption">미조치로 등록합니다. 등록 조치에서 개선사진·전후 비교·현장 재점검을 이어갑니다.</p>
    </form>;
}

export default function InspectorActionPlanner({item,busy,active,onSave,onReassign,onDirty,onOpen,evidence,loadPhoto,onSubmitImprovement,onVerify,onAdoptShare,initialPhotoId,initialSelection,onCloseEntry,initialRegistered=false,inboxRequest=0,draftRequest=0,priorityFocus}:{key?:string;item:Inspection;busy:boolean;active:boolean;onSave:(action:InspectorAction)=>Promise<boolean>;onReassign:(change:AssignmentChange)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;onOpen:(id:string)=>void;evidence:Evidence[];loadPhoto:(id:string)=>Promise<Blob>;onSubmitImprovement:(input:ImprovementSubmission)=>Promise<boolean>;onVerify:(id:string,note:string)=>Promise<boolean>;onAdoptShare:(id:string)=>Promise<boolean>;initialPhotoId?:string;initialSelection?:FindingActionEntry;onCloseEntry?:()=>void;initialRegistered?:boolean;inboxRequest?:number;draftRequest?:number;priorityFocus?:{actionId:string;request:number}|null}){
    const selectId=useId();
    const [filter,setFilter]=useState<ActionFilter>(initialRegistered?'unresolved':'all'),[query,setQuery]=useState(''),[order,setOrder]=useState<'registered'|'due'>(initialRegistered?'due':'registered'),[editingFollowup,setEditingFollowup]=useState(false);
    const today=useInspectionDay(editingFollowup);
    const doc=item.document,suggestions=actionSuggestions(doc),[selected,setSelected]=useState(()=>{
        if(!initialSelection)return initialPhotoId?photoActionEntry(doc,initialPhotoId):'';
        return suggestions.some(s=>s.key===initialSelection.key&&s.sources.some(source=>source.photoId===initialPhotoId))?initialSelection.key:'manual';
    }),[mode,setMode]=useState<'draft'|'registered'|'inbox'>(initialRegistered?'registered':'draft'),[message,setMessage]=useState(''),[page,setPage]=useState(0);
    const root=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(!!initialPhotoId||initialRegistered);
    useEffect(()=>{if(!initialPhotoId&&!initialRegistered)return;const frame=requestAnimationFrame(()=>{root.current?.scrollIntoView({block:'start',behavior:'smooth'});if(initialPhotoId)root.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({preventScroll:true});else root.current?.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[initialPhotoId,initialRegistered]);
    const dirty=useRef(false),followupDirty=useRef(new Set<string>());
    const [replyTarget,setReplyTarget]=useState<{actionId:string;shareId:string;request:number}|null>(null);
    const [priorityId,setPriorityId]=useState('');
    useEffect(()=>{
        if(!priorityFocus?.request)return;
        if(busy||dirty.current||followupDirty.current.size){
            setMessage('저장하지 않은 담당·개선사진·재점검 입력을 먼저 저장하거나 정리해 주세요. 이동하면서 입력을 버리지 않습니다.');
            return;
        }
        const index=doc.actions.findIndex(a=>a.id===priorityFocus.actionId);
        if(index<0){setMessage('선택한 조치가 최신 저장본에 없습니다. 조치 목록을 다시 확인하세요.');return;}
        // The registered order is the original array order, so paging is deterministic.
        setOpen(true);setMode('registered');setFilter('all');setQuery('');setOrder('registered');
        setPage(Math.floor(index/3));setPriorityId(priorityFocus.actionId);setMessage('');
    },[priorityFocus?.request]);
    useEffect(()=>{
        if(!priorityId||!open||mode!=='registered'||filter!=='all'||query||order!=='registered')return;
        const frame=requestAnimationFrame(()=>{
            const rows:HTMLElement[]=root.current?Array.from(root.current.querySelectorAll<HTMLElement>('[data-action-id]')):[];
            const row=rows.find(el=>el.dataset.actionId===priorityId);
            if(!row)return;
            const followup=row.querySelector<HTMLDetailsElement>('.si-action-followup');
            if(followup)followup.open=true;
            const focus=followup?.querySelector<HTMLElement>('summary')||row;
            focus.scrollIntoView({block:'center',behavior:'smooth'});focus.focus({preventScroll:true});
            setPriorityId('');
        });
        return()=>cancelAnimationFrame(frame);
    },[priorityId,open,mode,filter,query,order,page,doc.actions]);
    useEffect(()=>{if(!inboxRequest)return;setOpen(true);setMode('inbox');const frame=requestAnimationFrame(()=>{root.current?.scrollIntoView({block:'start',behavior:'smooth'});root.current?.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[inboxRequest]);
    useEffect(()=>{
        if(!draftRequest)return;setOpen(true);setMode(dirty.current?'draft':'registered');
        const frame=requestAnimationFrame(()=>{
            let target:HTMLElement|null=null;
            if(dirty.current)target=root.current?.querySelector<HTMLElement>('.si-action-draft textarea,.si-action-draft input')||null;
            else{const key=[...followupDirty.current][0],id=key?.replace(/^assignment:/,'');const row=id?root.current?.querySelector<HTMLElement>(`[data-action-id="${CSS.escape(id)}"]`):null;if(row){const scope=row.querySelector<HTMLElement>(key?.startsWith('assignment:')?'.si-assignment-editor':'.si-action-followup');if(scope instanceof HTMLDetailsElement)scope.open=true;target=scope?.querySelector<HTMLElement>('textarea,input:not([type=checkbox]):not([type=file]),summary')||scope;}}
            (target||root.current)?.scrollIntoView({block:'center',behavior:'instant'});target?.focus({preventScroll:true});
        });return()=>cancelAnimationFrame(frame);
    },[draftRequest]);
    const openReply=(actionId:string,shareId:string)=>{
        if(busy||dirty.current||followupDirty.current.size)return;
        const index=doc.actions.findIndex(a=>a.id===actionId);if(index<0)return;
        setFilter('all');setQuery('');setOrder('registered');setPage(Math.floor(index/3));setMode('registered');setReplyTarget(old=>({actionId,shareId,request:(old?.request||0)+1}));
    };
    const updateDirty=React.useCallback((value:boolean)=>{dirty.current=value;onDirty(value||followupDirty.current.size>0);},[onDirty]);
    const updateFollowupDirty=React.useCallback((id:string,value:boolean)=>{if(value)followupDirty.current.add(id);else followupDirty.current.delete(id);setEditingFollowup(followupDirty.current.size>0);onDirty(dirty.current||followupDirty.current.size>0);},[onDirty]);
    const changePage=(next:number)=>{if(!followupDirty.current.size||window.confirm('페이지를 바꾸면 저장 전 담당·기한 변경 또는 개선사진·재점검 입력이 사라집니다. 바꿀까요?'))setPage(next);};
    const current=suggestions.find(s=>s.key===(selected||suggestions[0]?.key)),manual=selected==='manual';
    const sources=manual?doc.photoIds.map((photoId,index)=>({photoId,photoNumber:index+1,description:doc.photoNotes?.[photoId]||'',reviewNote:''})):current?.sources||[];
    const remaining=doc.actions.filter(a=>a.status!=='verified'),filtered=actionQueue(doc.actions,filter,query,today,order),filteredRemaining=filtered.filter(a=>a.status!=='verified'),pages=Math.max(1,Math.ceil(filtered.length/3)),activePage=Math.min(page,pages-1);
    const changeList=(nextFilter:ActionFilter,nextQuery:string,nextOrder:'registered'|'due')=>{
        const nextIds=new Set(actionQueue(doc.actions,nextFilter,nextQuery,today,nextOrder).slice(0,3).map(a=>a.id));
        if([...followupDirty.current].some(id=>!nextIds.has(id.replace(/^assignment:/,'')))&&!window.confirm('분류·검색·정렬을 바꾸면 저장 전 담당·기한 변경 또는 개선사진·재점검 입력이 사라집니다. 바꿀까요?'))return;
        setFilter(nextFilter);setQuery(nextQuery);setOrder(nextOrder);setPage(0);
    };
    const copy=(actions:InspectorAction[])=>void navigator.clipboard.writeText(buildRegisteredActionRequest(actions,doc.title,doc.photoIds)).then(()=>setMessage('등록한 조치요청문을 복사했습니다.')).catch(()=>setMessage('복사하지 못했습니다. 아래 조치 내용을 선택해 주세요.'));
    return <details ref={root} className="si-action-planner" hidden={active} open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>조치 모아보기 <span>· 제안 {suggestions.length}개 · 미결 {remaining.length}건</span></summary>
        {initialRegistered&&<p className="si-caption si-action-record-title">점검: <b>{doc.title}</b> · 저장 버전 {item.revision}</p>}
        <p className="si-caption">{initialRegistered?'미조치와 완료 검토 요청을 기한순으로 열었습니다. 개선사진과 현장 상태를 대조해 이어서 확인하세요.':'선택 기능 · 검토한 사진의 같은 조치 문구를 묶어 봅니다. 조치는 직접 확인해 저장하세요.'}</p>
        {initialPhotoId&&doc.photoIds.includes(initialPhotoId)&&<p className="si-notice">사진 {doc.photoIds.indexOf(initialPhotoId)+1}에서 이어 작성합니다. 이 사진만 먼저 선택했으며 다른 사진은 직접 추가하세요. 담당자·기한·적용 범위를 확인한 뒤 저장합니다. {onCloseEntry&&<button type="button" className="si-btn" disabled={busy} onClick={onCloseEntry}>이 조치 작성 닫기</button>}</p>}
        {initialSelection&&selected===initialSelection.key&&<p className="si-notice si-action-origin" aria-label="조치 작성 출처">{initialSelection.context}</p>}
        <div className="si-action-views"><button type="button" className="si-btn" aria-pressed={mode==='draft'} onClick={()=>setMode('draft')}>조치 정리</button><button type="button" className="si-btn" aria-pressed={mode==='registered'} onClick={()=>setMode('registered')}>등록 조치 {doc.actions.length}</button><button type="button" className="si-btn" aria-pressed={mode==='inbox'} disabled={busy} onClick={()=>setMode('inbox')}>받은 회신</button></div>
        {mode==='inbox'&&open&&<Suspense fallback={<p role="status">회신 모아보기 준비 중…</p>}><InspectorReplyInbox item={item} busy={busy} blocked={editingFollowup||dirty.current} onOpen={openReply}/></Suspense>}
        <div hidden={mode!=='draft'} onFocusCapture={()=>{if(!selected&&current)setSelected(current.key);}}>
            <label className="si-label" htmlFor={selectId}>정리할 제안</label><select id={selectId} value={manual?'manual':current?.key||''} disabled={busy} onChange={e=>{if(!dirty.current||window.confirm('제안을 바꾸면 작성 중인 조치 입력이 지워집니다. 바꿀까요?'))setSelected(e.target.value);}}>{!suggestions.length&&<option value="">검토한 사진의 조치 제안 없음</option>}{suggestions.map((s,n)=><option key={s.key} value={s.key}>{n+1}. {actionPriorityLabel[s.priority]} · {s.title.slice(0,45)} · 사진 {s.sources.length}장</option>)}<option value="manual">직접 조치 작성</option></select>
            {doc.actions.length>=30?<p className="si-notice">한 점검의 조치 30건을 모두 사용했습니다.</p>:(current||manual)?<ActionDraft key={manual?'manual':current!.key} suggestion={manual?undefined:current} sources={sources} busy={busy} onSave={onSave} onDirty={updateDirty} onOpen={onOpen} initialPhotoId={initialPhotoId} owners={recentActionOwners(doc.actions)} today={today}/>:<p className="si-caption">사진 결과를 검토하거나 ‘직접 조치 작성’을 선택하세요. AI를 끈 점검도 직접 작성할 수 있습니다.</p>}
        </div><div className="si-registered-actions" hidden={mode!=='registered'}>
            <p>미결 {remaining.length}건 · 재점검 확인 {doc.actions.length-remaining.length}건</p><button type="button" className="si-btn" disabled={!remaining.length} onClick={()=>copy(remaining)}>미결 조치요청문 복사</button><InspectorShareButton title="현장 미결 조치 요청" text={buildRegisteredActionRequest(remaining,doc.title,doc.photoIds)} disabled={!remaining.length} label="미결 조치 보내기"/>
            <details className="si-queue-tools" open={!initialRegistered&&doc.actions.length>3}><summary>분류·검색·정렬 · {filtered.length}/{doc.actions.length}건</summary>
            <div className="si-queue-filters" role="group" aria-label="등록 조치 분류">{(Object.entries(actionFilterLabels) as [ActionFilter,string][]).map(([id,label])=><button type="button" key={id} className="si-btn" aria-pressed={filter===id} onClick={()=>changeList(id,query,order)}>{label} {id==='all'?doc.actions.length:actionQueue(doc.actions,id,'',today).length}</button>)}</div>
            <div className="si-action-queue-controls"><label htmlFor={selectId+'search'}>조치·담당 검색<input id={selectId+'search'} type="search" maxLength={200} value={query} onChange={e=>changeList(filter,e.target.value,order)} placeholder="예: 개구부, 형틀반장"/></label><label htmlFor={selectId+'sort'}>목록 순서<select aria-label="목록 순서" id={selectId+'sort'} value={order} onChange={e=>changeList(filter,query,e.target.value as 'registered'|'due')}><option value="registered">등록 순서</option><option value="due">기한 빠른 미결부터</option></select></label></div>
            <p className="si-caption">{filtered.length}건 일치 · 기준일 {today} (한국시간·기기 시계). 오늘 기한은 지연으로 세지 않습니다.{editingFollowup?' 저장 전 담당·기한/개선 입력을 보호하기 위해 기준일을 잠시 유지합니다.':''}</p></details>
            {((filter!=='all'&&filter!=='unresolved')||query.trim())&&filteredRemaining.length>0&&<div className="si-filtered-dispatch"><p className="si-caption">분류·검색에 맞는 미결 {filteredRemaining.length}건 전체 · 다른 페이지의 일치 조치도 포함</p><button type="button" className="si-btn" disabled={busy} onClick={()=>copy(filteredRemaining)}>분류한 미결 요청문 복사</button><InspectorShareButton title="분류한 현장 미결 조치 요청" text={buildRegisteredActionRequest(filteredRemaining,doc.title,doc.photoIds)} disabled={busy} label="분류한 미결 보내기"/></div>}
            {filtered.slice(activePage*3,activePage*3+3).map(action=><section key={action.id} tabIndex={-1} data-action-id={action.id} className={replyTarget?.actionId===action.id||priorityId===action.id?'si-reply-target':undefined}><h3>{action.title}</h3><p>{action.owner} · 약정기한 {action.dueDate} · {actionDeadlineText(action,today)}{overdueAction(action,today)&&<strong className="si-overdue-label"> · 기한 지남</strong>}</p>{action.scheduleContext&&<p className="si-caption">기한 설정 근거: {action.scheduleContext}</p>}<details><summary>적용 사진·기록 보기</summary><p className="si-pre">{action.note||'기록 없음'}</p></details><button type="button" className="si-btn" onClick={()=>copy([action])}>이 조치요청문 복사</button><Suspense fallback={<p role="status">공유 기능 준비 중…</p>}><InspectorActionShare item={item} action={action} busy={busy||editingFollowup||dirty.current} onAdopt={onAdoptShare} focusShareId={replyTarget?.actionId===action.id?replyTarget.shareId:undefined} focusRequest={replyTarget?.actionId===action.id?replyTarget.request:0}/></Suspense><InspectorAssignmentEditor action={action} busy={busy||followupDirty.current.has(action.id)} today={today} owners={recentActionOwners(doc.actions)} onSave={onReassign} onDirty={updateFollowupDirty}/><InspectorActionFollowup key={`${action.id}:${action.owner}:${action.dueDate}`} item={item} action={action} evidence={evidence} busy={busy||followupDirty.current.has('assignment:'+action.id)} loadPhoto={loadPhoto} onSubmit={onSubmitImprovement} onVerify={onVerify} onDirty={updateFollowupDirty}/></section>)}
            {!doc.actions.length&&<p className="si-caption">아직 등록한 조치가 없습니다. 보고서 작성은 조치 등록 없이도 가능합니다.</p>}
            {!!doc.actions.length&&!filtered.length&&<p className="si-caption">분류·검색에 맞는 조치가 없습니다. <button type="button" className="si-btn" onClick={()=>changeList('all','','registered')}>전체 조치로 돌아가기</button></p>}
            {pages>1&&<div className="si-action-pagination"><button type="button" className="si-btn" disabled={!activePage||busy} onClick={()=>changePage(activePage-1)}>이전 조치</button><span>{activePage+1} / {pages}</span><button type="button" className="si-btn" disabled={activePage>=pages-1||busy} onClick={()=>changePage(activePage+1)}>다음 조치</button></div>}
        </div>
        {message&&<p role="status">{message}</p>}
    </details>;
}
