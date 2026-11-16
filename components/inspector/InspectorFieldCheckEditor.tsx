import React,{useEffect,useId,useRef,useState} from 'react';
import type {InspectorAction,InspectorFieldCheck} from '../../lib/inspector/types';
import {effectiveFieldCheckDate,fieldCheckInputError,fieldCheckLabels,latestFieldCheck} from '../../lib/inspector/fieldCheck';
import './inspector-field-check.css';

export type FieldCheckSubmission={actionId:string;checkId:string;result:InspectorFieldCheck['result'];note:string;nextCheckDate:string};
export default function InspectorFieldCheckEditor({action,busy,today,onSave,onDirty}:{
 action:InspectorAction;busy:boolean;today:string;onSave:(input:FieldCheckSubmission)=>Promise<boolean>;
 onDirty:(key:string,dirty:boolean)=>void;
}){
 const uid=useId(),key='field-check:'+action.id;
 const [open,setOpen]=useState(false),[result,setResult]=useState<InspectorFieldCheck['result']|'0'>('0'),
 [note,setNote]=useState(''),[nextCheckDate,setNextCheckDate]=useState(''),
 [ack,setAck]=useState(false),[feedback,setFeedback]=useState('');
 const checkId=useRef(crypto.randomUUID());
 const dirty=open&&(result!=='0'||!!note||!!nextCheckDate||ack);
 useEffect(()=>{onDirty(key,dirty);return()=>onDirty(key,false);},[key,dirty,onDirty]);
 useEffect(()=>{if(!dirty)return;const onExit=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',onExit);return()=>window.removeEventListener('beforeunload',onExit);},[dirty]);
 const latest=latestFieldCheck(action),planned=effectiveFieldCheckDate(action);
 const error=result==='0'?'현장 확인 결과를 선택해 주세요.':fieldCheckInputError({result,note,nextCheckDate},today);
 const canSave=!busy&&!!ack&&!error&&action.status!=='verified'&&(action.fieldChecks?.length||0)<12;
 const reset=()=>{setOpen(false);setResult('0');setNote('');setNextCheckDate('');setAck(false);checkId.current=crypto.randomUUID();};
 const cancel=()=>{if(!dirty||window.confirm('저장 전 현장 확인 입력을 버릴까요?'))reset();};
 return <section className="si-field-check" aria-label="현장 임시 보호조치 이행 확인" data-field-check-history={action.id}>
  <div className="si-field-check-summary">
   <b>현장 확인 이력 {action.fieldChecks?.length||0}건</b>
   <span>다음 확인 {planned||'미지정'} · 원래 약정기한 {action.dueDate}</span>
  </div>
  {latest?<div className="si-field-check-latest" data-field-check-latest="true">
     <strong>{fieldCheckLabels[latest.result]}</strong>
     <p>기록시각 {new Date(latest.recordedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (서버 저장시각) · 다음 현장 확인 {latest.nextCheckDate||'미지정'}</p>
     <p className="si-pre">{latest.note}</p>
   </div>:<p className="si-caption">저장한 임시 보호조치 계획의 실제 이행 여부는 아직 기록되지 않았습니다. 계획이 있다고 시행된 것은 아닙니다.</p>}
  {!!action.fieldChecks?.length&&<details className="si-field-check-history"><summary>이전 현장 확인 기록 펼치기</summary>
    <ol>{action.fieldChecks.map(check=><li key={check.id}>
      <b>{fieldCheckLabels[check.result]}</b>
      <p>{new Date(check.recordedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 후속 확인 {check.nextCheckDate||'미지정'}</p>
      <p className="si-pre">{check.note}</p>
    </li>)}</ol>
   </details>}
  {action.status==='verified'?<p className="si-caption">최종 재점검 확인된 조치에는 현장 확인 기록을 추가하지 않습니다.</p>:
   !open?<button type="button" className="si-btn" disabled={busy||(action.fieldChecks?.length||0)>=12} onClick={()=>{setOpen(true);setFeedback('');}}>
    현장 확인 결과 기록
   </button>:<form aria-label="현장 확인 결과 입력" className="si-action-draft" onSubmit={async e=>{
    e.preventDefault();if(!canSave||result==='0')return;
    if(await onSave({actionId:action.id,checkId:checkId.current,result,note:note.trim(),nextCheckDate})){reset();setFeedback('현장 확인 기록을 서버에 저장했습니다. 새 보고서는 변경된 저장본으로 다시 작성하세요.');}
   }}>
    <p className="si-caption">현장 점검자가 직접 확인한 사실 또는 확인 불가를 선택하세요. 사진·AI가 판정한 상태가 아닙니다. 임시 보호조치 확인과 최종 시정조치 완료는 별개입니다.</p>
    <label htmlFor={uid+'result'}>현장 확인 결과</label>
    <select id={uid+'result'} value={result} disabled={busy} onChange={e=>{setResult(e.target.value as InspectorFieldCheck['result']);setAck(false);}}>
      <option value="0">직접 선택</option>
      {Object.entries(fieldCheckLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
    <label htmlFor={uid+'note'}>확인 내용·근거 (10~600자)</label>
    <textarea id={uid+'note'} rows={3} minLength={10} maxLength={600} required disabled={busy} value={note} placeholder="예: 2002동 3층 출입금지 라인 설치 여부를 작업반장 동행 하에 확인. 미설치 구역은 접근통제 유지 요청." onChange={e=>{setNote(e.target.value);setAck(false);}}/>
    <label htmlFor={uid+'next'}>후속 현장 확인 예정일 {result==='implemented'?'(선택)':'(미시행·확인 불가 시 필수)'}</label>
    <input id={uid+'next'} type="date" min={today} value={nextCheckDate} disabled={busy} onChange={e=>{setNextCheckDate(e.target.value);setAck(false);}}/>
    <p className="si-caption">후속 확인일은 달력상의 계획입니다. 기존 약정기한 변경·자동 알림·출입통제 시행·작업재개 승인을 의미하지 않습니다.</p>
    {result!=='0'&&error&&<p role="status" className="si-caption">{error}</p>}
    <label className="si-action-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/><span>현장 확인 결과를 직접 입력하며, 최종 시정 완료·작업재개를 승인하는 것이 아님을 확인합니다.</span></label>
    <div className="si-inline"><button className="si-btn si-primary" disabled={!canSave}>현장 확인 이력 저장</button><button type="button" className="si-btn" disabled={busy} onClick={cancel}>입력 취소</button></div>
   </form>}
  {feedback&&<p role="status" className="si-caption">{feedback}</p>}
  <p className="si-caption">서버 기록시각과 점검자 입력 내용이 남습니다. 실제 현장 이행에 대한 독립적인 증명이나 법적 승인 문서는 아닙니다.</p>
 </section>;
}
