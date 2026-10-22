import React, {useEffect,useRef} from 'react';
import {InspectorIcon} from './InspectorGraphics';
export default function InspectorPhotoDialog({src,onClose,caption}:{src:string;onClose:()=>void;caption?:string}) {
    const ref=useRef<HTMLDialogElement>(null);
    useEffect(()=>{
        const dialog=ref.current,previous=document.activeElement;
        dialog?.showModal();
        return()=>{dialog?.close();if(previous instanceof HTMLElement && previous.isConnected)previous.focus();};
    },[]);
    return <dialog ref={ref} className="si-lightbox" aria-label={caption?"점검 사진 확대":"원본사진 확대"} onKeyDown={event=>{if(event.key==='Tab'){event.preventDefault();ref.current?.querySelector('button')?.focus();}}} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
        <button className="si-btn" autoFocus onClick={onClose}><InspectorIcon name="close"/>닫기</button>
        <img src={src} alt={caption?"확대한 점검 사진":"확대한 점검 원본사진"}/>
        <p>{caption||"원본사진 · 원본 바이트를 변경하지 않습니다"}</p>
    </dialog>;
}
