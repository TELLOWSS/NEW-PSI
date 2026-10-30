import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import InspectorLocalDraft from '../components/inspector/InspectorLocalDraft';
import '../components/inspector/inspector-experience.css';
import '../components/inspector/inspector-field-entry.css';

function LocalEntry(){
 const [status,setStatus]=useState('이 기기에서 오프라인으로 열려면 온라인에서 먼저 준비해 주세요.');
 const prepare=async()=>{
  try{
   if(!('serviceWorker' in navigator))throw new Error('이 브라우저는 오프라인 준비를 지원하지 않습니다.');
   if(!navigator.onLine)throw new Error('인터넷에 연결한 뒤 준비해 주세요.');
   setStatus('오프라인 파일을 준비하고 있습니다…');
   const registration=await navigator.serviceWorker.register('/field-local/sw.js',{scope:'/field-local/',updateViaCache:'none'});
   await navigator.serviceWorker.ready;
   const worker=registration.active;
   if(!worker)throw new Error('오프라인 파일이 아직 활성화되지 않았습니다.');
   const verified=await new Promise<boolean>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('오프라인 준비 확인 시간이 초과됐습니다.')),10000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data?.ok===true);};worker.postMessage({type:'VERIFY_LOCAL_ASSETS'},[channel.port2]);});
   if(!verified)throw new Error('필요한 오프라인 파일이 빠져 있습니다. 인터넷 연결 후 다시 준비해 주세요.');
   setStatus('이 기기의 오프라인 점검 준비가 확인됐습니다. 이 주소를 즐겨찾기에 저장하세요.');
  }catch(error){setStatus(error instanceof Error?error.message:'오프라인 준비에 실패했습니다.');}
 };
 return <main className="si-workspace si-quick" style={{maxWidth:820,margin:'auto',padding:16}}>
  <h1>PSI 기기 점검</h1><p>이 화면은 이 브라우저에 저장한 직접 점검만 엽니다. 서버 기록과 동기화되거나 로그인된 상태를 뜻하지 않습니다. 이 기기를 사용하는 다른 사람도 기록을 볼 수 있습니다.</p>
  <button type="button" className="si-btn si-primary" onClick={()=>void prepare()}>이 기기 오프라인 준비</button><p role="status">{status}</p>
  <p>최초 준비는 인터넷이 필요합니다. 브라우저 데이터 삭제·기기 분실 시 기록과 준비 파일이 사라질 수 있으므로 백업하세요.</p>
  <InspectorLocalDraft offlineEntry/>
 </main>;
}
const root=document.getElementById('root');if(!root)throw new Error('root missing');createRoot(root).render(<LocalEntry/>);
