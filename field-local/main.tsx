import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import InspectorLocalDraft from '../components/inspector/InspectorLocalDraft';
import '../components/inspector/inspector-experience.css';
import '../components/inspector/inspector-field-entry.css';

async function verifyWorker(worker:ServiceWorker):Promise<boolean>{
 return new Promise<boolean>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(new Error('오프라인 준비 확인 시간이 초과됐습니다.'));},10000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.ok===true);};worker.postMessage({type:'VERIFY_LOCAL_ASSETS'},[channel.port2]);});
}
function LocalEntry(){
 const [status,setStatus]=useState('이 기기에서 오프라인으로 열려면 온라인에서 먼저 준비해 주세요.');
 const [storageStatus,setStorageStatus]=useState('');
 useEffect(()=>{let active=true;void (async()=>{
  if(!('serviceWorker' in navigator))return;
  try{const registration=await navigator.serviceWorker.getRegistration('/field-local/');
   if(!registration?.active)return;
   const verified=await verifyWorker(registration.active);
   if(active)setStatus(verified?'이 기기의 오프라인 점검 준비가 확인됐습니다. 이 주소를 즐겨찾기에 저장하세요.':'오프라인 준비 파일이 부족합니다. 인터넷 연결 후 다시 준비해 주세요.');
  }catch{if(active)setStatus('오프라인 준비 상태를 확인하지 못했습니다. 인터넷 연결 후 다시 준비해 주세요.');}
 })();return()=>{active=false;};},[]);
 const inspectStorage=async(requestPersistence=false)=>{
  const storage=navigator.storage;
  if(!storage){setStorageStatus('이 브라우저에서 저장 공간과 보관 설정을 확인할 수 없습니다. 중요한 기록은 별도로 백업하세요.');return;}
  let space='저장 공간을 확인할 수 없습니다.',persistence='보관 설정을 확인할 수 없습니다.';
  try{
   if(storage.estimate){const estimate=await storage.estimate();if(typeof estimate.usage==='number'&&typeof estimate.quota==='number'){
    const mb=(bytes:number)=>Math.round(bytes/1024/1024);
    space=`이 사이트의 사용량 약 ${mb(estimate.usage)}MB / 브라우저가 추정한 한도 약 ${mb(estimate.quota)}MB. 실제 저장 가능량은 달라질 수 있습니다.`;
   }}
  }catch{/* Estimate is optional and independent of persistence. */}
  try{
   if(requestPersistence&&storage.persist){
    const granted=await storage.persist();
    persistence=granted?'브라우저가 지속 보관 요청을 허용했습니다.':'브라우저가 지속 보관 요청을 허용하지 않았습니다.';
   }else if(storage.persisted){
    persistence=await storage.persisted()?'브라우저가 지속 보관을 허용한 상태입니다.':'브라우저의 지속 보관이 허용되지 않은 상태입니다.';
   }
  }catch{/* Denial or unsupported settings must never look like approval. */}
  setStorageStatus(space+' '+persistence+' 지속 보관이 허용되어도 사용자의 데이터 삭제나 기기 분실을 막지 못합니다. 중요한 기록은 별도로 백업하세요.');
 };
 const prepare=async()=>{
  try{
   if(!('serviceWorker' in navigator))throw new Error('이 브라우저는 오프라인 준비를 지원하지 않습니다.');
   if(!navigator.onLine)throw new Error('인터넷에 연결한 뒤 준비해 주세요.');
   setStatus('오프라인 파일을 준비하고 있습니다…');
   const registration=await navigator.serviceWorker.register('/field-local/sw.js',{scope:'/field-local/',updateViaCache:'none'});
   await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('오프라인 준비에 실패했거나 시간이 초과됐습니다. 연결을 확인하고 다시 시도해 주세요.')),15000))]);
   const worker=registration.active;
   if(!worker)throw new Error('오프라인 파일이 아직 활성화되지 않았습니다.');
   const verified=await verifyWorker(worker);
   if(!verified)throw new Error('필요한 오프라인 파일이 빠져 있습니다. 인터넷 연결 후 다시 준비해 주세요.');
   setStatus('이 기기의 오프라인 점검 준비가 확인됐습니다. 이 주소를 즐겨찾기에 저장하세요.');
  }catch(error){setStatus(error instanceof Error?error.message:'오프라인 준비에 실패했습니다.');}
 };
 return <main className="si-workspace si-quick" style={{maxWidth:820,margin:'auto',padding:16}}>
  <h1>PSI 기기 점검</h1><p>이 화면은 이 브라우저에 저장한 직접 점검만 엽니다. 서버 기록과 동기화되거나 로그인된 상태를 뜻하지 않습니다. 이 기기를 사용하는 다른 사람도 기록을 볼 수 있습니다.</p>
  <button type="button" className="si-btn si-primary" onClick={()=>void prepare()}>이 기기 오프라인 준비</button><p role="status">{status}</p>
  <p>최초 준비는 인터넷이 필요합니다. 브라우저 데이터 삭제·기기 분실 시 기록과 준비 파일이 사라질 수 있으므로 백업하세요.</p>
  <div aria-label="기기 저장 상태"><button type="button" className="si-btn" onClick={()=>void inspectStorage(false)}>저장 공간 확인</button> <button type="button" className="si-btn" onClick={()=>void inspectStorage(true)}>기록 지속 보관 요청</button>{storageStatus&&<p role="status">{storageStatus}</p>}</div>
  <InspectorLocalDraft offlineEntry/>
 </main>;
}
const root=document.getElementById('root');if(!root)throw new Error('root missing');createRoot(root).render(<LocalEntry/>);
