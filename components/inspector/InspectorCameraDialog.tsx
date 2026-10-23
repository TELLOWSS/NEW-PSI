import React, {useEffect, useRef, useState} from 'react';
import {InspectorIcon} from './InspectorGraphics';

/** Photos stay local until onUse passes the selected frame to the existing optimizer. */
export default function InspectorCameraDialog({onClose, onUse}: {onClose:()=>void; onUse:(file:File)=>void}) {
    const dialogRef=useRef<HTMLDialogElement>(null), videoRef=useRef<HTMLVideoElement>(null);
    const streamRef=useRef<MediaStream|null>(null), generation=useRef(0), encoding=useRef(false);
    const [mode,setMode]=useState<'landscape'|'portrait'>(()=>{try{return sessionStorage.getItem('psi.inspector.camera.mode.v1')==='portrait'?'portrait':'landscape';}catch{return 'landscape';}});
    const [frame,setFrame]=useState<{width:number;height:number}|null>(null);
    const [facing,setFacing]=useState<'environment'|'user'>('environment');
    const [attempt,setAttempt]=useState(0), [ready,setReady]=useState(false), [capturing,setCapturing]=useState(false);
    const [photo,setPhoto]=useState<File|null>(null), [preview,setPreview]=useState(''), [decoded,setDecoded]=useState(false);
    const [error,setError]=useState('');
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

    return <dialog ref={dialogRef} className="si-camera-dialog" aria-labelledby="si-camera-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div className="si-camera-heading"><div><p className="si-eyebrow">{photo?'CHECK YOUR PHOTO':'LIVE CAMERA'}</p><h2 id="si-camera-title">{photo?'촬영 사진 바로 확인':'카메라로 바로 촬영'}</h2></div><button className="si-btn" autoFocus onClick={onClose}><InspectorIcon name="close"/>닫기</button></div>
        <p className="si-caption">{photo?'초점과 촬영 범위를 확인하세요. ‘이 사진 사용’을 누르면 최적화 후 점검에 등록합니다.':'카메라 권한을 허용하면 화면을 보며 촬영할 수 있습니다. 소리는 녹음하지 않습니다.'}</p>
        {!photo&&<><div className="si-camera-modes" role="group" aria-label="촬영 방향"><button type="button" className="si-btn" aria-pressed={mode==='landscape'} disabled={capturing} onClick={()=>changeMode('landscape')}><span className="si-frame-icon si-frame-landscape" aria-hidden="true"/><span>가로 <small>현장 전경 · 기본</small></span></button><button type="button" className="si-btn" aria-pressed={mode==='portrait'} disabled={capturing} onClick={()=>changeMode('portrait')}><span className="si-frame-icon si-frame-portrait" aria-hidden="true"/><span>세로 <small>높이·설비</small></span></button></div><p className="si-camera-direction-guide">{mode==='landscape'?'현장 전경은 가로 촬영을 권장합니다. 휴대폰을 가로로 돌려 대상과 주변 동선을 함께 담으세요.':'세로로 긴 설비나 높이를 확인할 때 사용하세요. 휴대폰을 세로로 들고 대상의 위아래를 함께 담으세요.'}</p></>}
        <div className={`si-camera-stage si-camera-stage-${mode}${photo?' si-camera-stage-photo':''}`}>

            {photo?(preview&&<img src={preview} alt="등록 전 촬영 사진 미리보기" onLoad={e=>{setDecoded(true);setFrame({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight});}} onError={()=>{setDecoded(false);setError('사진 미리보기를 읽지 못했습니다. 다시 촬영해 주세요.');}}/>):<video ref={videoRef} autoPlay playsInline muted aria-label="실시간 카메라 화면" onLoadedData={refreshFrame} onResize={refreshFrame}/>}
            {!photo && !ready && <span className="si-camera-wait" role="status">{error?'카메라 연결을 확인해 주세요':'카메라 연결 중…'}</span>}
        </div>
        {frame&&<p className="si-camera-frame-status" role="status">{photo?'촬영본':'현재 영상'} · {actualDirection} {frame.width} × {frame.height}{!photo&&directionMismatch&&<span>선택 방향과 다릅니다. 기기를 {mode==='landscape'?'가로':'세로'}로 돌려 확인하세요. 지원하지 않는 기기에서는 현재 보이는 전체 영상으로 촬영됩니다.</span>}</p>}
        {!photo&&<p className="si-caption">촬영 방향은 카메라 지원 범위 안에서 요청합니다. 미리보기 전체를 저장하며, 앱에서 사진을 늘이거나 잘라 맞추지 않습니다.</p>}
        {error&&<p className="si-notice" role="alert">{error}</p>}
        <div className="si-camera-actions">{photo?<>
            <button className="si-btn" onClick={retry}>다시 촬영</button>
            {preview&&<a className="si-btn" href={preview} download={photo.name}>촬영 사진 기기에 저장</a>}
            <button className="si-btn si-primary" disabled={!decoded} onClick={()=>{if(decoded)onUse(photo);}}>이 사진 사용</button>
        </>:<>
            <button className="si-btn si-primary" disabled={!ready || capturing} onClick={capture}><InspectorIcon name="camera"/>{capturing?'사진 처리 중…':'지금 촬영'}</button>
            <button className="si-btn" disabled={capturing} onClick={()=>{setFacing(value=>value==='environment'?'user':'environment');}}>전면·후면 전환</button>
            {error&&<button className="si-btn" onClick={retry}>카메라 다시 연결</button>}
        </>}</div>
        {!photo&&<label className="si-camera-native si-btn">기기 카메라로 촬영<input aria-label="기기 카메라로 촬영" type="file" accept="image/jpeg,image/png,image/webp" capture={facing} disabled={capturing} onClick={()=>{++generation.current;stop();setReady(false);setError('기기 촬영을 취소했다면 카메라 다시 연결을 누르세요.');}} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setError('');setPhoto(file);}}}/></label>}
        <p className="si-caption">사용 전 사진은 이 창의 임시 메모리에만 있습니다. 원본이 필요하면 ‘촬영 사진 기기에 저장’으로 다운로드하세요. 사진 앱에 자동 저장되지는 않습니다.</p>
    </dialog>;
}
