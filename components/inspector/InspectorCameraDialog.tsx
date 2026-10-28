import React, {useEffect, useRef, useState} from 'react';
import {InspectorIcon} from './InspectorGraphics';

/** Photos stay local until onUse passes the selected frame to the existing optimizer. */
export default function InspectorCameraDialog({onClose, onUse, reference}: {onClose:()=>void; onUse:(file:File)=>void; reference?:{url?:string;label:string;failed?:boolean;missing?:boolean}}) {
    const dialogRef=useRef<HTMLDialogElement>(null), videoRef=useRef<HTMLVideoElement>(null);
    const streamRef=useRef<MediaStream|null>(null), generation=useRef(0), encoding=useRef(false);
    const [mode,setMode]=useState<'landscape'|'portrait'>(()=>{try{return sessionStorage.getItem('psi.inspector.camera.mode.v1')==='portrait'?'portrait':'landscape';}catch{return 'landscape';}});
    const [frame,setFrame]=useState<{width:number;height:number}|null>(null);
    const [facing,setFacing]=useState<'environment'|'user'>('environment');
    const [attempt,setAttempt]=useState(0), [ready,setReady]=useState(false), [capturing,setCapturing]=useState(false);
    const [photo,setPhoto]=useState<File|null>(null), [preview,setPreview]=useState(''), [decoded,setDecoded]=useState(false);
    const [error,setError]=useState('');
    const [overlayVisible,setOverlayVisible]=useState(true),[overlayOpacity,setOverlayOpacity]=useState(50),[overlayFailed,setOverlayFailed]=useState(false);
    useEffect(()=>setOverlayFailed(false),[reference?.url]);
    const stop=()=>{streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;if(videoRef.current)videoRef.current.srcObject=null;};

    useEffect(()=>{
        const dialog=dialogRef.current, previous=document.activeElement;
        dialog?.showModal();
        return()=>{dialog?.close();if(previous instanceof HTMLElement && previous.isConnected)previous.focus();};
    },[]);
    useEffect(()=>{
        if(!photo){setPreview('');setDecoded(false);return;}
        const url=URL.createObjectURL(photo);setDecoded(false);setPreview(url);
        return()=>URL.revokeObjectURL(url);
    },[photo]);
    useEffect(()=>{
        if(!photo)return;
        const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
        window.addEventListener('beforeunload',warn);
        return()=>window.removeEventListener('beforeunload',warn);
    },[photo]);
    useEffect(()=>{
        const token=++generation.current;
        setReady(false);setFrame(null);setError('');
        if(!photo){
            if(!navigator.mediaDevices?.getUserMedia)setError('이 브라우저에서는 실시간 카메라를 열 수 없습니다. 아래 기기 카메라를 이용하거나 사진 선택으로 돌아가세요.');
            else {
                // Prefer a native frame over software crop-and-scale; unsupported preferences are ignored.
                const video:MediaTrackConstraints&{resizeMode?:ConstrainDOMString}={facingMode:{ideal:facing},width:{ideal:mode==='landscape'?1920:1080},height:{ideal:mode==='landscape'?1080:1440},aspectRatio:{ideal:mode==='landscape'?16/9:3/4},resizeMode:{ideal:'none'}};
                void navigator.mediaDevices.getUserMedia({audio:false,video}).then(async stream=>{
                if(generation.current!==token){stream.getTracks().forEach(track=>track.stop());return;}
                streamRef.current=stream;
                const video=videoRef.current;
                if(video){video.srcObject=stream;await video.play();}
            }).catch(cause=>{
                if(generation.current!==token)return;
                stop();
                setError(cause?.name==='NotAllowedError'?'카메라 권한이 허용되지 않았습니다. 브라우저의 카메라 권한을 허용한 뒤 다시 연결하거나 아래 기기 카메라를 이용하세요.':'카메라를 연결하지 못했습니다. 다른 앱에서 사용 중인지 확인하거나 아래 기기 카메라를 이용하세요.');
            });
            }
        }
        const hide=()=>{if(document.hidden && !photo){++generation.current;stop();setReady(false);setError('화면을 벗어나 카메라를 중지했습니다. 다시 연결해 주세요.');}};
        document.addEventListener('visibilitychange',hide);
        return()=>{++generation.current;stop();document.removeEventListener('visibilitychange',hide);};
    },[facing,attempt,photo,mode]);

    const changeMode=(next:'landscape'|'portrait')=>{if(capturing||next===mode)return;++generation.current;stop();setReady(false);setFrame(null);setMode(next);try{sessionStorage.setItem('psi.inspector.camera.mode.v1',next);}catch{/* In-memory mode remains available. */}};
    const refreshFrame=()=>{const video=videoRef.current;if(streamRef.current&&video?.videoWidth&&video.videoHeight){setFrame({width:video.videoWidth,height:video.videoHeight});setReady(true);}};
    const actualDirection=frame?(frame.width===frame.height?'정방형':frame.width>frame.height?'가로':'세로'):'';
    const directionMismatch=!!frame&&(mode==='landscape'?frame.width<=frame.height:frame.height<=frame.width);
    const capture=()=>{
        const video=videoRef.current;
        if(!ready || !video?.videoWidth || !video.videoHeight || encoding.current)return;
        const token=generation.current,canvas=document.createElement('canvas');
        canvas.width=video.videoWidth;canvas.height=video.videoHeight;
        const context=canvas.getContext('2d');if(!context){setError('사진을 만들지 못했습니다. 기기 카메라를 이용하세요.');return;}
        encoding.current=true;setCapturing(true);context.drawImage(video,0,0);
        canvas.toBlob(blob=>{
            canvas.width=0;canvas.height=0;encoding.current=false;
            if(generation.current!==token)return;
            setCapturing(false);
            if(!blob){setError('사진을 만들지 못했습니다. 다시 촬영해 주세요.');return;}
            stop();setReady(false);setPhoto(new File([blob],`PSI-camera-${Date.now()}.jpg`,{type:'image/jpeg'}));
        },'image/jpeg',.95);
    };
    const retry=()=>{encoding.current=false;setCapturing(false);setDecoded(false);setPhoto(null);setAttempt(n=>n+1);};
    const close=()=>{if(photo&&!window.confirm('촬영한 사진은 아직 점검에 등록되지 않았습니다. 사진을 버리고 닫을까요?'))return;onClose();};
    const directionControls=<><div className="si-camera-modes" role="group" aria-label="촬영 방향"><button type="button" className="si-btn" aria-pressed={mode==='landscape'} disabled={capturing} onClick={()=>changeMode('landscape')}><span className="si-frame-icon si-frame-landscape" aria-hidden="true"/><span>가로 <small>현장 전경 · 기본</small></span></button><button type="button" className="si-btn" aria-pressed={mode==='portrait'} disabled={capturing} onClick={()=>changeMode('portrait')}><span className="si-frame-icon si-frame-portrait" aria-hidden="true"/><span>세로 <small>높이·설비</small></span></button></div><p className="si-camera-direction-guide">{mode==='landscape'?'현장 전경은 가로 촬영을 권장합니다. 휴대폰을 가로로 돌려 대상과 주변 동선을 함께 담으세요.':'세로로 긴 설비나 높이를 확인할 때 사용하세요. 휴대폰을 세로로 들고 대상의 위아래를 함께 담으세요.'}</p></>;

    return <dialog ref={dialogRef} className="si-camera-dialog" aria-labelledby="si-camera-title" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
        <div className="si-camera-heading"><div><p className="si-eyebrow">PSI INSPECTOR / {reference?'BEFORE & AFTER':'FIELD CAMERA'}</p><h2 id="si-camera-title">{photo?'촬영 사진 바로 확인':'카메라로 바로 촬영'}</h2></div><button className="si-btn" autoFocus onClick={close}><InspectorIcon name="close"/>닫기</button></div>
        <p className="si-caption si-camera-intro">{photo?'사진에서 위치와 주변 상태를 확인한 뒤 사용하세요.':reference?'조치 전 사진을 보며 같은 위치를 직접 맞춰 촬영하세요.':'카메라를 허용하고 촬영하세요. 소리는 녹음하지 않습니다.'}</p>
        <div className={`si-camera-stage si-camera-stage-${mode}${photo?' si-camera-stage-photo':''}`}>

            {photo?(preview&&<img src={preview} alt="등록 전 촬영 사진 미리보기" onLoad={e=>{setDecoded(true);setFrame({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight});}} onError={()=>{setDecoded(false);setError('사진 미리보기를 읽지 못했습니다. 다시 촬영해 주세요.');}}/>):<video ref={videoRef} autoPlay playsInline muted aria-label="실시간 카메라 화면" onLoadedData={refreshFrame} onResize={refreshFrame}/>}
            {!photo&&ready&&reference?.url&&overlayVisible&&!overlayFailed&&<img className="si-camera-reference" src={reference.url} alt="" aria-hidden="true" style={{opacity:overlayOpacity/100}} onError={()=>setOverlayFailed(true)}/>}
            {!photo && !ready && <span className="si-camera-wait" role="status">{error?'카메라 연결을 확인해 주세요':'카메라 연결 중…'}</span>}
        </div>
        {!photo&&reference&&<section className="si-camera-reference-controls" aria-label="전후 맞춤 렌즈">
            <strong>전후 맞춤 · {reference.label}</strong>
            {reference.failed||overlayFailed?<p role="status">기준 사진을 불러오지 못했습니다. 겹침 없이 촬영하거나 창을 닫고 사진을 다시 확인하세요.</p>:!reference.url?<p role="status">{reference.missing?'조치 전 사진을 선택하면 촬영 화면에 겹쳐 볼 수 있습니다.':'기준 사진을 불러오는 중입니다.'}</p>:<><button type="button" className="si-btn" aria-pressed={overlayVisible} onClick={()=>setOverlayVisible(value=>!value)}>기준 사진 {overlayVisible?'끄기':'켜기'}</button>{overlayVisible&&<label>겹침 투명도 <select aria-label="기준 사진 겹침 투명도" value={overlayOpacity} onChange={e=>setOverlayOpacity(Number(e.target.value))}><option value={25}>25%</option><option value={50}>50%</option><option value={75}>75%</option></select></label>}<p>사진의 비율이 다르면 위치가 달라 보일 수 있습니다. 같은 장소와 조치 결과는 현장에서 직접 확인하세요. 겹침은 촬영 사진에 저장되지 않습니다.</p></>}
        </section>}
        {frame&&<p className="si-camera-frame-status" role="status">{photo?'촬영본':'현재 영상'} · {actualDirection} {frame.width} × {frame.height}{!photo&&directionMismatch&&<span>선택 방향과 다릅니다. 기기를 {mode==='landscape'?'가로':'세로'}로 돌려 확인하세요. 지원하지 않는 기기에서는 현재 보이는 전체 영상으로 촬영됩니다.</span>}</p>}
        {error&&<div className="si-camera-recovery" role="alert"><strong>카메라 연결을 확인해 주세요</strong><p>{error}</p><p>연결이 안 되면 아래 <b>기기 카메라로 촬영</b>을 누르거나 창을 닫고 <b>사진첩·파일에서 선택</b>할 수 있습니다. 사진이 없는 상태에서 점검이 자동 등록되지는 않습니다.</p></div>}
        <div className="si-camera-actions">{photo?<>
            <button className="si-btn" onClick={retry}>다시 촬영</button>
            {preview&&<a className="si-btn" href={preview} download={photo.name}>촬영 사진 기기에 저장</a>}
            <button className="si-btn si-primary" disabled={!decoded} onClick={()=>{if(decoded)onUse(photo);}}>이 사진 사용</button>
        </>:<>
            <button className="si-btn si-primary si-camera-shutter" disabled={!ready || capturing} onClick={capture}><span className="si-camera-shutter-mark"><InspectorIcon name="camera"/></span><span>{capturing?'사진 처리 중…':'지금 촬영'}</span></button>
            <button className="si-btn si-camera-flip" disabled={capturing} onClick={()=>{setFacing(value=>value==='environment'?'user':'environment');}}>전면·후면 전환</button>
            {error&&<button className="si-btn" onClick={retry}>카메라 다시 연결</button>}
        </>}</div>
        {!photo&&(reference?<details className="si-camera-direction-options"><summary>촬영 방향 · {mode==='landscape'?'가로':'세로'}</summary>{directionControls}</details>:directionControls)}
        {!photo&&<><label className="si-camera-native si-btn">기기 카메라로 촬영<input aria-label="기기 카메라로 촬영" type="file" accept="image/jpeg,image/png,image/webp" capture={facing} disabled={capturing} onClick={()=>{++generation.current;stop();setReady(false);setError('기기 촬영을 취소했다면 카메라 다시 연결을 누르세요.');}} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setError('');setPhoto(file);}}}/></label>{reference&&<p className="si-caption">기기 카메라로 전환하면 기준 사진 겹침이 표시되지 않습니다.</p>}</>}
        <p className="si-caption">사용 전 사진은 이 창의 임시 메모리에만 있습니다. 원본이 필요하면 ‘촬영 사진 기기에 저장’으로 다운로드하세요. 사진 앱에 자동 저장되지는 않습니다.</p>
    </dialog>;
}
