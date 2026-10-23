import React,{useEffect,useState} from 'react';

/** Real elapsed time only. Stage comes from the operation actually running, never a fake percentage. */
export default function InspectorTaskProgress({activity}:{activity:string}){
 const [elapsed,setElapsed]=useState(0),[visible,setVisible]=useState(false);
 useEffect(()=>{const started=Date.now(),show=setTimeout(()=>setVisible(true),250),tick=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>{clearTimeout(show);clearInterval(tick);};},[]);
 if(!visible)return null;
 return <div className="si-workspace si-task-progress" role="status" aria-live="polite" aria-label="현재 작업 진행"><span className="si-task-spinner" aria-hidden="true"/><div><strong>{activity||'작업 처리 중'}</strong><p>{elapsed>=20?'응답을 기다리고 있습니다. 중복 요청 없이 현재 작업을 확인합니다.':'완료되면 이어서 진행합니다. 잠시 기다려 주세요.'}</p></div><span className="si-task-time" aria-hidden="true">{elapsed}초</span></div>;
}
