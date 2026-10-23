import React,{useEffect,useId,useState} from 'react';
import type {InspectorAction} from '../../lib/inspector/types';
import type {AssignmentChange} from '../../lib/inspector/actionAssignment';
import {calendarDueDate} from '../../lib/inspector/actionPlan';
import {sameAction} from '../../lib/inspector/actionFollowup';

export default function InspectorAssignmentEditor({action,busy,today,owners,onSave,onDirty}:{action:InspectorAction;busy:boolean;today:string;owners:string[];onSave:(change:AssignmentChange)=>Promise<boolean>;onDirty:(id:string,dirty:boolean)=>void}){
    const id=useId(),[before,setBefore]=useState<InspectorAction|null>(null),[owner,setOwner]=useState(''),[dueDate,setDueDate]=useState(''),[reason,setReason]=useState(''),[checked,setChecked]=useState(false),[message,setMessage]=useState('');
    const dirty=!!before&&(owner!==before.owner||dueDate!==before.dueDate||!!reason),key='assignment:'+action.id;
    useEffect(()=>{onDirty(key,dirty);return()=>onDirty(key,false);},[key,dirty,onDirty]);
    useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
    useEffect(()=>{if(before&&!dirty&&!sameAction(before,action)){setBefore(structuredClone(action));setOwner(action.owner);setDueDate(action.dueDate);setChecked(false);}},[action,before,dirty]);
    if(action.status==='verified')return <p className="si-caption">재점검 확인된 조치의 담당·기한은 변경하지 않습니다.</p>;
    const reset=()=>{setBefore(null);setReason('');setChecked(false);};
    const close=()=>{if(!dirty||window.confirm('담당·기한의 저장 전 변경을 버릴까요?'))reset();};
    const changed=!!before&&(owner.trim()!==before.owner||dueDate!==before.dueDate);
    return <div className="si-assignment-editor">
        {!before?<button type="button" className="si-btn" disabled={busy} onClick={()=>{setBefore(structuredClone(action));setOwner(action.owner);setDueDate(action.dueDate);setReason('');setChecked(false);setMessage('');}}>담당·기한 변경</button>:<form className="si-action-draft" aria-label="등록 조치 담당·기한 변경" onSubmit={async e=>{e.preventDefault();if(!busy&&checked&&changed&&reason.trim().length>=5&&await onSave({before,owner,dueDate,reason})){reset();setMessage('담당·기한 변경을 저장했습니다. 요청문·조치대장은 새 저장본을 사용하세요.');}}}>
            <p className="si-caption">기존 담당 {before.owner} · 기한 {before.dueDate}<br/>조치 내용·적용 사진·진행상태는 유지합니다. 변경 이유는 조치 기록에 남깁니다.</p>
            <div className="si-action-assignment"><div><label htmlFor={id+'owner'}>변경 담당자·공종</label><input id={id+'owner'} required maxLength={100} disabled={busy} value={owner} onChange={e=>{setOwner(e.target.value);setChecked(false);}}/><div className="si-assignment-shortcuts">{owners.map(name=><button type="button" key={name} className="si-btn" disabled={busy} aria-pressed={owner===name} onClick={()=>{setOwner(name);setChecked(false);}}>{name}</button>)}</div></div><div><label htmlFor={id+'due'}>변경 완료기한</label><input id={id+'due'} required type="date" disabled={busy} value={dueDate} onChange={e=>{setDueDate(e.target.value);setChecked(false);}}/><div className="si-assignment-shortcuts">{([[0,'오늘'],[1,'내일'],[3,'3일 뒤']] as const).map(([n,label])=><button type="button" key={n} className="si-btn" disabled={busy} onClick={()=>{setDueDate(calendarDueDate(today,n));setChecked(false);}}>{label}</button>)}</div><p className="si-caption">{today} 기준 · 한국시간·기기 시계 · 달력일</p></div></div>
            <label htmlFor={id+'reason'}>변경 이유 (5~200자)</label><textarea id={id+'reason'} required minLength={5} maxLength={200} rows={2} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);setChecked(false);}}/>
            <label className="si-action-ack"><input type="checkbox" disabled={busy} checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>현장 여건과 담당·기한 변경을 확인했습니다.</span></label>
            <div className="si-inline"><button className="si-btn si-primary" disabled={busy||!changed||!owner.trim()||!dueDate||reason.trim().length<5||!checked}>담당·기한 변경 저장</button><button type="button" className="si-btn" disabled={busy} onClick={close}>변경 취소</button></div>
            <p className="si-caption">이미 만든 보고서·내려받거나 보낸 사본은 바뀌지 않습니다. 저장 후 새 보고서·요청문으로 전달하세요.</p>
        </form>}
        {message&&<p role="status" className="si-caption">{message}</p>}
    </div>;
}
