import React,{useEffect,useState} from 'react';
import InspectorCameraDialog from '../components/inspector/InspectorCameraDialog';
import {shareInspectorPacket,shareResultMessage,copyInspectorShareText,shareCopyResultMessage} from '../lib/inspector/sharing';
import '../components/inspector/inspector.css';
import '../components/inspector/inspector-experience.css';
import './field-camera.css';

/** Local capture entry: no inspection, upload, account or AI is created here. */
export default function FieldCamera(){
 const [camera,setCamera]=useState(false),[photo,setPhoto]=useState<File|null>(null),[url,setUrl]=useState(''),[message,setMessage]=useState('');
 const [site,setSite]=useState(''),[location,setLocation]=useState('');
 useEffect(()=>{if(!photo){setUrl('');return;}const next=URL.createObjectURL(photo);setUrl(next);return()=>URL.revokeObjectURL(next);},[photo]);
 useEffect(()=>{if(!photo)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[photo]);
 const choose=(file:File)=>{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>40*1024*1024){setMessage('JPG·PNG·WebP 사진을 40MB 이하로 선택해 주세요.');return;}setPhoto(file);setMessage('');};
 const newPhoto=()=>{if(photo&&!window.confirm('이 사진과 입력한 정보는 이 화면에만 있습니다. 필요한 내용을 저장했는지 확인하고 새 사진을 찍을까요?'))return;setPhoto(null);setSite('');setLocation('');setCamera(true);};
 const caption=['현장 사진',site.trim()&&`현장: ${site.trim()}`,location.trim()&&`위치: ${location.trim()}`].filter(Boolean).join('\n');
 const share=async()=>{if(!photo)return;const result=await shareInspectorPacket({title:'현장 사진',text:caption,files:[photo]});setMessage(shareResultMessage[result]);};
 const copy=async()=>{const result=await copyInspectorShareText(caption);setMessage(shareCopyResultMessage[result]);};
 return <main className="field-camera"><header><span>PSI · FIELD CAMERA</span><h1>현장 사진을 간편하게</h1><p>로그인 없이 촬영하고, 기기에 저장하거나 필요한 앱으로 공유하세요.</p></header>
  <section className="field-camera-card" aria-label="현장 카메라">
   {photo&&url?<><img src={url} alt="선택한 현장 사진 미리보기"/><div className="field-camera-status">이 화면에 임시 보관 중 · 기기에 자동 저장되지 않음</div><details className="field-camera-details"><summary>현장 정보 덧붙이기 (선택)</summary><label>현장명<input value={site} maxLength={100} onChange={e=>setSite(e.target.value)} placeholder="예: ○○ 현장"/></label><label>위치<input value={location} maxLength={100} onChange={e=>setLocation(e.target.value)} placeholder="예: 2동 3층"/></label><p>직접 입력한 정보는 사진 파일에 기록되지 않습니다. 공유 앱에 따라 문구가 제외될 수 있어 전달 내용을 확인하세요.</p><label>전달 문구<textarea readOnly rows={3} value={caption}/></label><button type="button" onClick={()=>void copy()}>문구 복사</button></details><div className="field-camera-actions"><a href={url} download={photo.name} className="field-camera-primary">사진 기기에 저장</a><button type="button" onClick={()=>void share()}>사진 공유</button><button type="button" onClick={newPhoto}>다음 사진 촬영</button></div></>:<><div className="field-camera-placeholder" aria-hidden="true">◎</div><h2>현장을 사진으로 남겨보세요</h2><p>사진은 서버로 전송되지 않고 이 화면에서만 사용됩니다.</p><div className="field-camera-actions"><button type="button" className="field-camera-primary" onClick={()=>setCamera(true)}>사진 촬영하기</button><label>사진첩에서 선택<input type="file" aria-label="사진첩에서 선택" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)choose(f);}}/></label></div></>}
   {message&&<p role="status">{message}</p>}
  </section><section className="field-camera-next"><h2>안전점검이 더 필요할 때</h2><p>법령 확인·AI 분석·조치 관리는 Inspector에서 이용할 수 있습니다. 이동 전 사진과 입력 정보를 저장하세요. 자동 전달되지 않습니다.</p><a href="/inspector" onClick={e=>{if(photo&&!window.confirm('사진과 입력 정보는 Inspector로 자동 전달되지 않습니다. 필요한 내용을 저장하고 이동할까요?'))e.preventDefault();}}>Inspector 열기 →</a></section>
  <p className="field-camera-foot">화면을 닫거나 새로고침하면 임시 사진이 사라질 수 있습니다. 공유 완료 여부는 선택한 앱에서 확인하세요.</p>
  {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setCamera(false);choose(file);}}/>}
 </main>;
}
