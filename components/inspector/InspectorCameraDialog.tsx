import React, {useEffect, useRef, useState} from 'react';
import {InspectorIcon} from './InspectorGraphics';
import './inspector-camera-field.css';
import {rotateInspectionPhoto} from '../../lib/inspector/photoRotation';

const CAMERA_GUIDES = {
  scaffold:{label:'시스템비계',short:'발판 · 지지부 · 주변',hint:'발판·지지부와 주변 작업구역을 함께 담으세요.'},
  opening:{label:'개구부',short:'가장자리 · 방호 · 동선',hint:'개구부의 경계, 주변 방호 상태와 이동 동선을 함께 담으세요.'},
  lifting:{label:'양중',short:'하중 · 경로 · 통제',hint:'양중물과 이동 경로, 통제구역을 안전한 거리에서 촬영하세요.'},
  gangform:{label:'갱폼',short:'연결부 · 인양 경로 · 통제',hint:'안전한 위치에서 갱폼과 연결부, 인양 경로와 주변 통제 상황을 담을 수 있는지 확인하세요.'},
  formwork:{label:'거푸집·동바리',short:'받침 · 지지 · 주변',hint:'안전한 위치에서 동바리의 받침과 지지 상태, 주변 작업 상황을 담을 수 있는지 확인하세요.'},
  rebar:{label:'철근',short:'배근 · 단부 · 주변',hint:'안전한 위치에서 철근 배근과 돌출 단부, 주변 이동 공간을 함께 담을 수 있는지 확인하세요.'},
  equipment:{label:'장비',short:'장비 · 동선 · 주변',hint:'안전한 위치에서 장비와 작업 범위, 주변 보행 동선을 함께 담을 수 있는지 확인하세요.'}
} as const;
type CameraGuide = keyof typeof CAMERA_GUIDES | '';

/** The first camera frame/file is retained for edited images; 0° captures use the same file. */
export type CameraEditEvidence={initialFile:File;rotationDegrees:90|180|270;recordedAt:string};
const cameraEditEvidence=(initial:File|null,turns:number):CameraEditEvidence|undefined=>
  initial&&turns>0?{initialFile:initial,rotationDegrees:(turns*90) as 90|180|270,recordedAt:new Date().toISOString()}:undefined;
/** Photos stay local until onUse passes the selected frame to the existing optimizer. */
export default function InspectorCameraDialog({onClose, onUse, reference, onSaveAndContinue, storedCount,onHome}: {onClose:()=>void; onUse:(file:File,evidence?:CameraEditEvidence)=>void;onHome?:()=>void; reference?:{url?:string;label:string;failed?:boolean;missing?:boolean;selection?:{value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}};onSaveAndContinue?:(file:File,evidence?:CameraEditEvidence)=>Promise<boolean>;storedCount?:number}) {
    const dialogRef=useRef<HTMLDialogElement>(null), videoRef=useRef<HTMLVideoElement>(null), guidePanelRef=useRef<HTMLDetailsElement>(null);
    const streamRef=useRef<MediaStream|null>(null), generation=useRef(0), encoding=useRef(false), nativePending=useRef(false);
    // Follow the browser's displayed orientation on every turn; no manual mode lock.
    const [mode,setMode]=useState<'landscape'|'portrait'>(()=>window.innerWidth>window.innerHeight?'landscape':'portrait');
    useEffect(()=>{
      const followDevice=()=>setMode(window.innerWidth>window.innerHeight?'landscape':'portrait');
      window.addEventListener('resize',followDevice);
      window.addEventListener('orientationchange',followDevice);
      return()=>{window.removeEventListener('resize',followDevice);window.removeEventListener('orientationchange',followDevice);};
    },[]);
    const [frame,setFrame]=useState<{width:number;height:number}|null>(null);
    const [facing,setFacing]=useState<'environment'|'user'>('environment');
    const [attempt,setAttempt]=useState(0), [ready,setReady]=useState(false), [capturing,setCapturing]=useState(false);
    const [photo,setPhoto]=useState<File|null>(null), [preview,setPreview]=useState(''), [decoded,setDecoded]=useState(false);
    const originalCapture=useRef<File|null>(null),rotateToken=useRef(0);
    const [rotation,setRotation]=useState(0),[rotating,setRotating]=useState(false),[originalPreview,setOriginalPreview]=useState('');
    const [error,setError]=useState('');
    const [sequenceSaving,setSequenceSaving]=useState(false),[sequenceError,setSequenceError]=useState('');
    const [torchSupported,setTorchSupported]=useState(false),[torchOn,setTorchOn]=useState(false),[torchBusy,setTorchBusy]=useState(false),[torchMessage,setTorchMessage]=useState('');
    const [overlayVisible,setOverlayVisible]=useState(true),[overlayOpacity,setOverlayOpacity]=useState(50),[overlayFailed,setOverlayFailed]=useState(false);
    const [grid,setGrid]=useState(()=>{try{return sessionStorage.getItem('psi.inspector.camera.grid.v1')==='on';}catch{return false;}});
    const [guide,setGuide]=useState<CameraGuide>('');
    const [guideActivation,setGuideActivation]=useState(0);
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
        if(!photo||rotation===0||!originalCapture.current){setOriginalPreview('');return;}
        const url=URL.createObjectURL(originalCapture.current);setOriginalPreview(url);
        return()=>URL.revokeObjectURL(url);
    },[photo,rotation]);
    useEffect(()=>{
        if(!photo)return;
        const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
        window.addEventListener('beforeunload',warn);
        return()=>window.removeEventListener('beforeunload',warn);
    },[photo]);
    useEffect(()=>{
        const token=++generation.current;
        setReady(false);setCapturing(false);setFrame(null);setError('');setTorchSupported(false);setTorchOn(false);setTorchBusy(false);setTorchMessage('');
        if(!photo){
            if(!navigator.mediaDevices?.getUserMedia)setError('이 브라우저에서는 실시간 카메라를 열 수 없습니다. 아래 기기 카메라를 이용하거나 사진 선택으로 돌아가세요.');
            else {
                // Prefer a native frame over software crop-and-scale; unsupported preferences are ignored.
                const video:MediaTrackConstraints&{resizeMode?:ConstrainDOMString}={facingMode:{ideal:facing},width:{ideal:mode==='landscape'?1920:1080},height:{ideal:mode==='landscape'?1080:1440},aspectRatio:{ideal:mode==='landscape'?16/9:3/4},resizeMode:{ideal:'none'}};
                void navigator.mediaDevices.getUserMedia({audio:false,video}).then(async stream=>{
                if(generation.current!==token){stream.getTracks().forEach(track=>track.stop());return;}
                streamRef.current=stream;
                try{const track=stream.getVideoTracks()[0],capabilities=track?.getCapabilities?.() as (MediaTrackCapabilities & {torch?:boolean})|undefined;setTorchSupported(capabilities?.torch===true);const settings=track?.getSettings?.() as (MediaTrackSettings & {torch?:boolean})|undefined;setTorchOn(settings?.torch===true);}catch{setTorchSupported(false);}
                const video=videoRef.current;
                if(video){video.srcObject=stream;await video.play();}
            }).catch(cause=>{
                if(generation.current!==token)return;
                stop();
                setError(cause?.name==='NotAllowedError'?'카메라 권한이 허용되지 않았습니다. 브라우저의 카메라 권한을 허용한 뒤 다시 연결하거나 아래 기기 카메라를 이용하세요.':'카메라를 연결하지 못했습니다. 다른 앱에서 사용 중인지 확인하거나 아래 기기 카메라를 이용하세요.');
            });
            }
        }
        const hide=()=>{if(document.hidden && !photo){++generation.current;stop();setReady(false);setCapturing(false);setError('화면을 벗어나 카메라를 중지했습니다. 다시 연결해 주세요.');}};
        document.addEventListener('visibilitychange',hide);
        return()=>{++generation.current;stop();document.removeEventListener('visibilitychange',hide);};
    },[facing,attempt,photo,mode]);

    const toggleTorch=async()=>{
        const stream=streamRef.current,track=stream?.getVideoTracks()[0],token=generation.current;
        if(!track||!torchSupported||torchBusy)return;
        const next=!torchOn;setTorchBusy(true);setTorchMessage('');
        try{
          await track.applyConstraints({advanced:[{torch:next} as MediaTrackConstraintSet]});
          if(token!==generation.current||streamRef.current!==stream)return;
          const settings=track.getSettings?.() as (MediaTrackSettings & {torch?:boolean})|undefined;
          if(typeof settings?.torch==='boolean'&&settings.torch!==next){setTorchOn(settings.torch);setTorchMessage('기기 조명 상태를 변경하지 못했습니다. 현장 조명을 확인하세요.');return;}
          setTorchOn(next);setTorchMessage('기기 조명 '+(next?'켜기':'끄기')+' 요청을 적용했습니다.');
        }catch{if(token===generation.current)setTorchMessage('기기 조명을 변경하지 못했습니다. 현장 조명을 확보하거나 기기 카메라를 이용하세요.');}
        finally{if(token===generation.current)setTorchBusy(false);}
    };
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
            stop();setReady(false);const next=new File([blob],`PSI-camera-${Date.now()}.jpg`,{type:'image/jpeg'});originalCapture.current=next;setRotation(0);setPhoto(next);
        },'image/jpeg',.95);
    };
    const retry=()=>{++rotateToken.current;originalCapture.current=null;setRotation(0);setRotating(false);setSequenceError('');encoding.current=false;setCapturing(false);setDecoded(false);setPhoto(null);setAttempt(n=>n+1);};
    const turnPhoto=async(delta:number)=>{
      if(!photo||!decoded||rotating||sequenceSaving)return;
      const original=originalCapture.current||photo,turns=((rotation+delta)%4+4)%4,token=++rotateToken.current;
      setRotating(true);setDecoded(false);setError('');setSequenceError('');
      try{
        const rotated=await rotateInspectionPhoto(original,turns);
        if(token!==rotateToken.current)return;
        setRotation(turns);setPhoto(rotated);
      }catch(cause){
        if(token===rotateToken.current){setError(cause instanceof Error?cause.message:'사진 회전에 실패했습니다. 원본은 유지됩니다.');setDecoded(true);}
      }finally{if(token===rotateToken.current)setRotating(false);}
    };
    const close=()=>{if(sequenceSaving||rotating)return;if(photo&&!window.confirm('촬영한 사진은 아직 등록되지 않았습니다. 사진을 버리고 닫을까요?'))return;onClose();};
    const goHome=()=>{if(sequenceSaving||rotating)return;if(photo&&!window.confirm('등록하지 않은 촬영 사진을 버리고 첫 화면으로 이동할까요?'))return;(onHome||onClose)();};
    const goBack=()=>{if(sequenceSaving||rotating)return;if(photo){if(!window.confirm('아직 등록되지 않은 사진을 버리고 촬영 화면으로 돌아갈까요?'))return;retry();return;}onClose();};
    const saveAndContinue=async()=>{if(!photo||!decoded||!onSaveAndContinue||sequenceSaving||rotating)return;setSequenceSaving(true);setSequenceError('');try{if(await onSaveAndContinue(photo,cameraEditEvidence(originalCapture.current,rotation)))retry();else setSequenceError('사진을 보관하지 못했습니다. 이 사진을 기기에 저장하거나 다시 시도하세요.');}catch{setSequenceError('사진을 보관하지 못했습니다. 이 사진을 기기에 저장하거나 다시 시도하세요.');}finally{setSequenceSaving(false);}};

    return <dialog ref={dialogRef} className={`si-camera-dialog si-camera-immersive ${photo?'si-camera-review':'si-camera-live'}`} aria-labelledby="si-camera-title" onCancel={e=>{e.preventDefault();if(nativePending.current){nativePending.current=false;retry();return;}if(e.target===e.currentTarget)close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
        <div className="si-camera-heading"><div className="si-camera-heading-title"><p className="si-eyebrow">PSI INSPECTOR / {reference?'BEFORE & AFTER':'FIELD CAMERA'}</p><h2 id="si-camera-title">{photo?'촬영 사진 바로 확인':'카메라로 바로 촬영'}</h2></div><div className="si-camera-header-tools">
        {!photo&&<details ref={guidePanelRef} className="si-camera-guide-options" data-active={Boolean(guide)}><summary aria-label="구도 선택"><span className="si-camera-guide-summary-icon" aria-hidden="true">✧</span><span className="si-camera-guide-summary-text">구도</span></summary><div className="si-camera-guide-content">
<div className="si-camera-guide-dock-head"><strong>촬영 구도 선택</strong><button type="button" onClick={()=>{if(guidePanelRef.current)guidePanelRef.current.open=false;}} aria-label="구도 선택 닫기">닫기 ×</button></div>
          <p className="si-camera-guide-headline">사진에 담을 대상을 선택하세요</p>
          <div className="si-camera-guide-picks" role="group" aria-label="촬영할 대상">
            {(['scaffold','opening','lifting','gangform','formwork','rebar','equipment'] as const).map((option)=><button type="button" key={option} className="si-camera-guide-pick" aria-pressed={guide===option} onClick={()=>{setGuide(option);setGuideActivation(n=>n+1);if(guidePanelRef.current)guidePanelRef.current.open=false;}}>
              <span className={`si-camera-guide-pictogram si-camera-guide-pictogram-${option}`} aria-hidden="true">{option==='scaffold'?'▦':option==='opening'?'□':option==='lifting'?'⌁':option==='gangform'?'▥':option==='formwork'?'╫':option==='rebar'?'╬':'◇'}</span>
              <span className="si-camera-guide-pick-title">{CAMERA_GUIDES[option].label}</span>
            </button>)}
          </div>
          <p className="si-camera-guide-review-note">참고 질문 초안 · 현장 안전 담당자 검토 필요. 안전한 위치에서 촬영하세요.</p>
          <div className="si-camera-guide-dock-actions">
            <label className="si-camera-grid-choice"><input type="checkbox" checked={grid} onChange={e=>{const enabled=e.target.checked;setGrid(enabled);try{sessionStorage.setItem('psi.inspector.camera.grid.v1',enabled?'on':'off');}catch{/* The setting still applies in this window. */}}}/> 3×3 격자</label>
            <button type="button" className="si-camera-guide-clear" disabled={!guide} onClick={()=>{setGuide('');if(guidePanelRef.current)guidePanelRef.current.open=false;}}>구도 끄기</button>
          </div>
          <details className="si-camera-guide-more"><summary>촬영 요령 · 영상 정보</summary><div className="si-camera-guide-extra">
            {guide&&<p className="si-camera-guide-tip">{CAMERA_GUIDES[guide].hint}</p>}
            {frame&&<details className="si-camera-frame-details"><summary>{directionMismatch?'영상 방향 확인 필요':'영상 정보'}</summary><p className="si-camera-frame-status" role="status">{photo?'촬영본':'현재 영상'} · {actualDirection} {frame.width} × {frame.height}{!photo&&directionMismatch&&<span>화면 방향과 카메라 영상 비율이 다릅니다. 화면 회전 설정을 확인하거나 기기 카메라를 이용하세요.</span>}</p></details>}
            <p>어둡거나 역광이면 안전한 곳에서 현장 조명을 확보하거나 기기 카메라로 촬영하세요. 기기 조명은 지원되는 경우에만 표시됩니다.</p>
            <p className="si-camera-guide-disclaimer">구도만 참고로 표시합니다. 실제 위험 자동 판정이 아니며 가이드선은 촬영 파일에 저장되지 않습니다.</p>
          </div></details>
                  </div></details>}
        {!photo&&torchSupported&&<button type="button" className="si-btn si-camera-torch" aria-pressed={torchOn} disabled={!ready||torchBusy} onClick={()=>void toggleTorch()}>기기 조명 {torchOn?'끄기':'켜기'}</button>}
        <button type="button" className="si-btn si-camera-nav-back" onClick={goBack} disabled={sequenceSaving||rotating}>← 이전</button>
        <button type="button" className="si-btn si-camera-nav-home" onClick={goHome} disabled={sequenceSaving||rotating}>첫 화면</button>
        <button className="si-btn si-camera-close" aria-label="닫기" autoFocus onClick={close}><InspectorIcon name="close"/><span>닫기</span></button>
        </div></div>
        <p className="si-caption si-camera-intro">{photo?'사진에서 위치와 주변 상태를 확인한 뒤 사용하세요.':reference?'조치 전 사진을 보며 같은 위치를 직접 맞춰 촬영하세요.':'카메라를 허용하고 촬영하세요. 소리는 녹음하지 않습니다.'}</p>
        {onSaveAndContinue&&<p className="si-camera-count" role="status">이 브라우저에 보관된 사진 {storedCount||0}장</p>}
        <div className={`si-camera-stage si-camera-stage-${mode}${photo?' si-camera-stage-photo':''}`}>

            {photo?(preview&&<img src={preview} alt="등록 전 촬영 사진 미리보기" onLoad={e=>{setDecoded(true);setFrame({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight});}} onError={()=>{setDecoded(false);setError('사진 미리보기를 읽지 못했습니다. 다시 촬영해 주세요.');}}/>):<video ref={videoRef} autoPlay playsInline muted aria-label="실시간 카메라 화면" onLoadedData={refreshFrame} onResize={refreshFrame}/>}
            {!photo&&ready&&reference?.url&&overlayVisible&&!overlayFailed&&<img className="si-camera-reference" src={reference.url} alt="" aria-hidden="true" style={{opacity:overlayOpacity/100}} onError={()=>setOverlayFailed(true)}/>}
            {!photo&&ready&&grid&&<div className="si-camera-grid" aria-hidden="true"/>}
            {!photo&&ready&&guide&&<div key={`${guide}-${guideActivation}`} className={`si-camera-target-overlay si-camera-target-${guide}`} aria-hidden="true">
              <div className="si-camera-target-frame">
                <span className="si-camera-target-sweep"/>
                <i className="si-camera-target-corner si-camera-target-tl"/><i className="si-camera-target-corner si-camera-target-tr"/>
                <i className="si-camera-target-corner si-camera-target-bl"/><i className="si-camera-target-corner si-camera-target-br"/>
                <svg viewBox="0 0 320 218" fill="none" aria-hidden="true">
                  {guide==='scaffold'&&<g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".76">
                    <path d="M71 36V190M158 36V190M245 36V190M54 85H262M54 147H262M71 85L158 147M158 85L245 147" strokeDasharray="7 8"/>
                    <path d="M71 147H245" strokeWidth="7" opacity=".5"/>
                  </g>}
                  {guide==='opening'&&<g stroke="currentColor" strokeLinecap="round">
                    <path d="M77 56H243V166H77Z" strokeWidth="4" strokeDasharray="14 10" opacity=".84"/>
                    <path d="M112 103H208M112 117H208" strokeWidth="2.5" opacity=".55"/>
                    <circle cx="160" cy="111" r="27" strokeWidth="2" strokeDasharray="4 8" opacity=".48"/>
                  </g>}
                  {guide==='gangform'&&<g stroke="currentColor" strokeWidth="3" opacity=".7"><path d="M91 38H229V176H91ZM116 38V176M160 38V176M204 38V176M91 84H229M91 130H229" strokeDasharray="8 7"/></g>}
                  {guide==='formwork'&&<g stroke="currentColor" strokeWidth="3" opacity=".7"><path d="M65 58H255M78 67V174M132 67V174M188 67V174M242 67V174M64 176H256" strokeDasharray="8 7"/></g>}
                  {guide==='rebar'&&<g stroke="currentColor" strokeWidth="3" opacity=".7"><path d="M85 47V173M122 47V173M159 47V173M196 47V173M233 47V173M65 72H255M65 110H255M65 148H255" strokeDasharray="8 7"/></g>}
                  {guide==='equipment'&&<g stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity=".7"><path d="M85 97H196L224 125V157H85ZM103 97V75H174V97M95 174H220" strokeDasharray="8 7"/><circle cx="112" cy="157" r="15"/><circle cx="196" cy="157" r="15"/></g>}
                  {guide==='lifting'&&<g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M160 32V80M147 80H173M147 80V101Q160 119 173 101V95" strokeWidth="4" opacity=".9"/>
                    <path d="M107 122L160 106L213 122V172H107Z" strokeWidth="3" strokeDasharray="9 7" opacity=".72"/>
                    <path d="M73 179Q160 196 247 179" strokeWidth="4" strokeDasharray="12 8" opacity=".56"/>
                  </g>}
                </svg>
              </div>
              <span className="si-camera-target-tag">{CAMERA_GUIDES[guide].label} 구도 참고</span>
              <span className="si-camera-target-activate">구도 가이드 활성화 · {CAMERA_GUIDES[guide].label}</span>
            </div>}
            {!photo&&guide&&<span className="si-camera-screenreader" role="status">{CAMERA_GUIDES[guide].label} 촬영 구도 가이드가 적용됐습니다. 실제 위험을 분석하는 기능은 아닙니다.</span>}
            {!photo && !ready && <span className="si-camera-wait" role="status">{error?'카메라 연결을 확인해 주세요':'카메라 연결 중…'}</span>}
        </div>
        {!photo&&reference&&<section className="si-camera-reference-controls" aria-label="전후 맞춤 렌즈">
            <strong>전후 맞춤 · {reference.label}</strong>
            {reference.selection&&<><label>겹쳐 볼 조치 전 사진 <select aria-label="겹쳐 볼 조치 전 사진" value={reference.selection.value} onChange={e=>reference.selection?.onChange(e.target.value)}>{reference.selection.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p>겹침 기준은 촬영 보조용이며 점검에 별도로 저장되지 않습니다.</p></>}
            {reference.failed||overlayFailed?<p role="status">기준 사진을 불러오지 못했습니다. 겹침 없이 촬영하거나 창을 닫고 사진을 다시 확인하세요.</p>:!reference.url?<p role="status">{reference.missing?'조치 전 사진을 선택하면 촬영 화면에 겹쳐 볼 수 있습니다.':'기준 사진을 불러오는 중입니다.'}</p>:<><button type="button" className="si-btn" aria-pressed={overlayVisible} onClick={()=>setOverlayVisible(value=>!value)}>기준 사진 {overlayVisible?'끄기':'켜기'}</button>{overlayVisible&&<label>겹침 투명도 <select aria-label="기준 사진 겹침 투명도" value={overlayOpacity} onChange={e=>setOverlayOpacity(Number(e.target.value))}><option value={25}>25%</option><option value={50}>50%</option><option value={75}>75%</option></select></label>}<p>사진의 비율이 다르면 위치가 달라 보일 수 있습니다. 같은 장소와 조치 결과는 현장에서 직접 확인하세요. 겹침은 촬영 사진에 저장되지 않습니다.</p></>}
        </section>}
        
        {torchMessage&&!photo&&<p className="si-camera-torch-message" role="status">{torchMessage}</p>}
        {error&&<div className="si-camera-recovery" role="alert"><strong>카메라 연결을 확인해 주세요</strong><p>{error}</p><p>연결이 안 되면 아래 <b>기기 카메라로 촬영</b>을 누르거나 창을 닫고 <b>사진첩·파일에서 선택</b>할 수 있습니다. 사진이 없는 상태에서 점검이 자동 등록되지는 않습니다.</p></div>}
        {photo&&<section className="si-camera-photo-editor" aria-label="촬영 사진 회전 편집">
           <div className="si-camera-photo-editor-heading"><strong>촬영 사진 방향</strong><span role="status">{rotating?'회전 중…':rotation===0?'원래 촬영 방향':`원래 사진 기준 ${rotation*90}° 회전 · 별도 편집본`}</span></div>
           {rotation!==0&&originalPreview&&<a className="si-btn" href={originalPreview} download={originalCapture.current?.name||'PSI-original.jpg'} aria-disabled={rotating||sequenceSaving} onClick={e=>{if(rotating||sequenceSaving)e.preventDefault();}}>최초 촬영 파일 기기에 저장</a>}
           <div className="si-camera-photo-editor-tools">
             <button type="button" className="si-btn" disabled={!decoded||rotating||sequenceSaving} onClick={()=>void turnPhoto(-1)}>↶ 왼쪽 90°</button>
             <button type="button" className="si-btn" disabled={!decoded||rotating||sequenceSaving} onClick={()=>void turnPhoto(1)}>↷ 오른쪽 90°</button>
             <button type="button" className="si-btn" disabled={rotation===0||rotating||sequenceSaving} onClick={()=>void turnPhoto(-rotation)}>원래 방향</button>
           </div>
           <p>회전한 사진은 별도 사본입니다. 최초 촬영 파일이 필요하면 이 창을 닫기 전에 기기에 저장하세요.</p>
         </section>}
         <div className="si-camera-actions">{photo?<>
            <button className="si-btn" disabled={sequenceSaving||rotating} onClick={()=>{if(!window.confirm('아직 등록하지 않은 이 사진을 버리고 다시 촬영할까요?'))return;retry();}}>다시 촬영</button>
            {preview&&<a className="si-btn" href={preview} download={photo.name} aria-disabled={rotating||!decoded} onClick={e=>{if(rotating||!decoded)e.preventDefault();}}>{rotation?'회전한 사본 기기에 저장':'촬영 사진 기기에 저장'}</a>}
            {onSaveAndContinue&&<button className="si-btn si-primary" disabled={!decoded||sequenceSaving||rotating} onClick={()=>void saveAndContinue()}>{sequenceSaving?'사진 보관 중…':'보관하고 계속 촬영'}</button>}
            <button className="si-btn si-primary" disabled={!decoded||sequenceSaving||rotating} onClick={()=>{if(decoded&&!rotating)onUse(photo,cameraEditEvidence(originalCapture.current,rotation));}}>이 사진 사용</button>
        </>:<>
            <button className="si-btn si-primary si-camera-shutter" disabled={!ready || capturing} onClick={capture}><span className="si-camera-shutter-mark"><InspectorIcon name="camera"/></span><span>{capturing?'사진 처리 중…':'지금 촬영'}</span></button>
            <button className="si-btn si-camera-flip" disabled={capturing} onClick={()=>{setFacing(value=>value==='environment'?'user':'environment');}}><span className="si-camera-flip-symbol" aria-hidden="true">⟳</span><span>전면·후면 전환</span></button>
            {error&&<button className="si-btn" onClick={retry}>카메라 다시 연결</button>}
        </>}</div>
        {sequenceError&&<p role="alert">{sequenceError}</p>}
        {photo&&frame&&<details className="si-camera-frame-details"><summary>{directionMismatch?'영상 방향 확인 필요':'영상 정보'}</summary><p className="si-camera-frame-status" role="status">{photo?'촬영본':'현재 영상'} · {actualDirection} {frame.width} × {frame.height}{!photo&&directionMismatch&&<span>화면 방향과 카메라 영상 비율이 다릅니다. 화면 회전 설정을 확인하거나 기기 카메라를 이용하세요.</span>}</p></details>}
        {!photo&&<p className="si-camera-auto-direction" role="status">화면 방향 자동 · {mode==='landscape'?'가로':'세로'}</p>}
        {!photo&&<><label className="si-camera-native si-btn">기기 카메라로 촬영<input aria-label="기기 카메라로 촬영" type="file" accept="image/jpeg,image/png,image/webp" capture={facing} disabled={capturing} onClick={()=>{nativePending.current=true;++generation.current;stop();setReady(false);setError('기기 촬영을 취소했다면 카메라 다시 연결을 누르세요.');}} onChange={e=>{nativePending.current=false;const file=e.target.files?.[0];e.target.value='';if(file){originalCapture.current=file;setRotation(0);setError('');setPhoto(file);}else retry();}}/></label>{reference&&<p className="si-caption">기기 카메라로 전환하면 기준 사진 겹침이 표시되지 않습니다.</p>}</>}
        <p className="si-caption">편집 전 촬영 파일은 사진 회전 시 점검 기록에 함께 저장·백업되도록 전달됩니다. 저장 전에는 임시 메모리에만 있으며 사진첩에 자동 저장되지 않습니다. 기기 저장공간과 백업 한도를 확인하세요.</p>
    </dialog>;
}
