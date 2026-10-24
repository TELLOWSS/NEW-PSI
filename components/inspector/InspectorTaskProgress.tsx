import React,{useEffect,useState} from 'react';
import {photoProgressStage} from '../../lib/inspector/noviceExperience';

/** Real elapsed time only. Stage comes from the operation actually running, never a fake percentage. */
export default function InspectorTaskProgress({activity}:{activity:string}){
 const [elapsed,setElapsed]=useState(0),[visible,setVisible]=useState(false);
 useEffect(()=>{const started=Date.now(),show=setTimeout(()=>setVisible(true),250),tick=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>{clearTimeout(show);clearInterval(tick);};},[]);
 const phase=photoProgressStage(activity);
 if(!visible)return null;
 return <div className="si-workspace si-task-progress" role="status" aria-live="polite" aria-label="현재 작업 진행">
  <span className="si-task-spinner" aria-hidden="true"/>
  <div className="si-task-body"><strong>{activity||'작업 처리 중'}</strong>
   {phase!==null&&<ol className="si-task-phases" aria-label="실제 작업 단계">{['사진 준비','점검 저장','위험 확인','결과 준비'].map((label,index)=><li key={label} className={index===phase?'is-current':index<phase?'is-past':''} aria-current={index===phase?'step':undefined}>{index<phase?'✓ ':index===phase?'● ':'○ '}{label}</li>)}</ol>}
   <p>{elapsed>=20?'현재 작업을 확인하고 있습니다. 다시 누르지 않아도 됩니다.':'사진과 입력 내용은 그대로 유지합니다. 완료되면 결과가 열립니다.'}</p>
  </div><span className="si-task-time" aria-hidden="true">{elapsed}초 경과</span>
 </div>;
}
