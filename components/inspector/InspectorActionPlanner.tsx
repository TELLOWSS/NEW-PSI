import React,{useEffect,useId,useRef,useState} from 'react';
import {actionPriorityLabel,actionSourceNote,actionStatusLabel,actionSuggestions,buildRegisteredActionRequest,type ActionSource,type ActionSuggestion} from '../../lib/inspector/actionPlan';
import type {Evidence,Inspection,InspectorAction} from '../../lib/inspector/types';
import InspectorShareButton from './InspectorShareButton';
import InspectorActionFollowup,{type ImprovementSubmission} from './InspectorActionFollowup';

function ActionDraft({suggestion,sources,busy,onSave,onDirty,onOpen}:{key?:string;suggestion?:ActionSuggestion;sources:ActionSource[];busy:boolean;onSave:(action:InspectorAction)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;onOpen:(id:string)=>void}){
    const initialTitle=suggestion&&suggestion.title.length<=1000?suggestion.title:'';
    const prefix=useId(),[title,setTitle]=useState(initialTitle),[owner,setOwner]=useState(''),[dueDate,setDueDate]=useState(''),[selected,setSelected]=useState<string[]>([]),[checked,setChecked]=useState(false),[saved,setSaved]=useState(false);
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
        <div className="si-action-assignment"><label htmlFor={prefix+'owner'}>담당자·공종<input id={prefix+'owner'} required maxLength={100} value={owner} disabled={busy} placeholder="예: 형틀반장" onChange={e=>setOwner(e.target.value)}/></label><label htmlFor={prefix+'due'}>완료기한<input id={prefix+'due'} type="date" required value={dueDate} disabled={busy} onChange={e=>setDueDate(e.target.value)}/></label></div>
        <label className="si-action-ack"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/><span>선택한 사진의 실제 위치·상태와 조치 적용 범위를 확인했습니다.</span></label>
        <button className="si-btn si-primary" disabled={busy||!checked||!selected.length||!title.trim()||!owner.trim()||!dueDate}>확인한 조치 저장</button>
        <p className="si-caption">미조치로 등록합니다. 등록 조치에서 개선사진·전후 비교·현장 재점검을 이어갑니다.</p>
    </form>;
}

export default function InspectorActionPlanner({item,busy,active,onSave,onDirty,onOpen,evidence,loadPhoto,onSubmitImprovement,onVerify}:{key?:string;item:Inspection;busy:boolean;active:boolean;onSave:(action:InspectorAction)=>Promise<boolean>;onDirty:(dirty:boolean)=>void;onOpen:(id:string)=>void;evidence:Evidence[];loadPhoto:(id:string)=>Promise<Blob>;onSubmitImprovement:(input:ImprovementSubmission)=>Promise<boolean>;onVerify:(id:string,note:string)=>Promise<boolean>}){
    const selectId=useId();
    const doc=item.document,suggestions=actionSuggestions(doc),[selected,setSelected]=useState(''),[mode,setMode]=useState<'draft'|'registered'>('draft'),[message,setMessage]=useState(''),[page,setPage]=useState(0);
    const dirty=useRef(false),followupDirty=useRef(new Set<string>());
    const updateDirty=React.useCallback((value:boolean)=>{dirty.current=value;onDirty(value||followupDirty.current.size>0);},[onDirty]);
    const updateFollowupDirty=React.useCallback((id:string,value:boolean)=>{if(value)followupDirty.current.add(id);else followupDirty.current.delete(id);onDirty(dirty.current||followupDirty.current.size>0);},[onDirty]);
    const changePage=(next:number)=>{if(!followupDirty.current.size||window.confirm('페이지를 바꾸면 저장 전 개선사진·재점검 입력이 사라집니다. 바꿀까요?'))setPage(next);};
    const current=suggestions.find(s=>s.key===(selected||suggestions[0]?.key)),manual=selected==='manual';
    const sources=manual?doc.photoIds.map((photoId,index)=>({photoId,photoNumber:index+1,description:doc.photoNotes?.[photoId]||'',reviewNote:''})):current?.sources||[];
    const remaining=doc.actions.filter(a=>a.status!=='verified'),pages=Math.max(1,Math.ceil(doc.actions.length/3)),activePage=Math.min(page,pages-1);
    const copy=(actions:InspectorAction[])=>void navigator.clipboard.writeText(buildRegisteredActionRequest(actions,doc.title,doc.photoIds)).then(()=>setMessage('등록한 조치요청문을 복사했습니다.')).catch(()=>setMessage('복사하지 못했습니다. 아래 조치 내용을 선택해 주세요.'));
    return <details className="si-action-planner" hidden={active}><summary>조치 모아보기 <span>· 제안 {suggestions.length}개 · 미결 {remaining.length}건</span></summary>
        <p className="si-caption">선택 기능 · 검토한 사진의 같은 조치 문구를 묶어 봅니다. 조치는 직접 확인해 저장하세요.</p>
        <div className="si-action-views"><button type="button" className="si-btn" aria-pressed={mode==='draft'} onClick={()=>setMode('draft')}>조치 정리</button><button type="button" className="si-btn" aria-pressed={mode==='registered'} onClick={()=>setMode('registered')}>등록 조치 {doc.actions.length}</button></div>
        <div hidden={mode!=='draft'} onFocusCapture={()=>{if(!selected&&current)setSelected(current.key);}}>
            <label className="si-label" htmlFor={selectId}>정리할 제안</label><select id={selectId} value={manual?'manual':current?.key||''} disabled={busy} onChange={e=>{if(!dirty.current||window.confirm('제안을 바꾸면 작성 중인 조치 입력이 지워집니다. 바꿀까요?'))setSelected(e.target.value);}}>{!suggestions.length&&<option value="">검토한 사진의 조치 제안 없음</option>}{suggestions.map((s,n)=><option key={s.key} value={s.key}>{n+1}. {actionPriorityLabel[s.priority]} · {s.title.slice(0,45)} · 사진 {s.sources.length}장</option>)}<option value="manual">직접 조치 작성</option></select>
            {doc.actions.length>=30?<p className="si-notice">한 점검의 조치 30건을 모두 사용했습니다.</p>:(current||manual)?<ActionDraft key={manual?'manual':current!.key} suggestion={manual?undefined:current} sources={sources} busy={busy} onSave={onSave} onDirty={updateDirty} onOpen={onOpen}/>:<p className="si-caption">사진 결과를 검토하거나 ‘직접 조치 작성’을 선택하세요. AI를 끈 점검도 직접 작성할 수 있습니다.</p>}
        </div><div className="si-registered-actions" hidden={mode!=='registered'}>
            <p>미결 {remaining.length}건 · 재점검 확인 {doc.actions.length-remaining.length}건</p><button type="button" className="si-btn" disabled={!remaining.length} onClick={()=>copy(remaining)}>미결 조치요청문 복사</button><InspectorShareButton title="현장 미결 조치 요청" text={buildRegisteredActionRequest(remaining,doc.title,doc.photoIds)} disabled={!remaining.length} label="미결 조치 보내기"/>
            {doc.actions.slice(activePage*3,activePage*3+3).map(action=><section key={action.id}><h3>{action.title}</h3><p>{action.owner} · {action.dueDate} · {actionStatusLabel(action)}</p><details><summary>적용 사진·기록 보기</summary><p className="si-pre">{action.note||'기록 없음'}</p></details><button type="button" className="si-btn" onClick={()=>copy([action])}>이 조치요청문 복사</button><InspectorActionFollowup item={item} action={action} evidence={evidence} busy={busy} loadPhoto={loadPhoto} onSubmit={onSubmitImprovement} onVerify={onVerify} onDirty={updateFollowupDirty}/></section>)}
            {!doc.actions.length&&<p className="si-caption">아직 등록한 조치가 없습니다. 보고서 작성은 조치 등록 없이도 가능합니다.</p>}
            {pages>1&&<div className="si-action-pagination"><button type="button" className="si-btn" disabled={!activePage||busy} onClick={()=>changePage(activePage-1)}>이전 조치</button><span>{activePage+1} / {pages}</span><button type="button" className="si-btn" disabled={activePage>=pages-1||busy} onClick={()=>changePage(activePage+1)}>다음 조치</button></div>}
        </div>
        {message&&<p role="status">{message}</p>}
    </details>;
}
