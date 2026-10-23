import React,{useEffect,useRef,useState} from 'react';
import InspectorStorageManager from './InspectorStorageManager';
import type {DeletionPointer} from '../../lib/inspector/recordHistory';

export default function InspectorRecordDeletionDialog({record,onClose,onStarted,onLocked,onVerified,onWorking}:{
    key?:string;record:DeletionPointer&{title:string};onClose:()=>void;onStarted:()=>void;onLocked:()=>void;
    onVerified:(mode:'files'|'all')=>void;onWorking:(value:boolean)=>void;
}){
    const dialogRef=useRef<HTMLDialogElement>(null),working=useRef(false),notified=useRef('');
    const [busy,setBusy]=useState(false);
    useEffect(()=>{
        const dialog=dialogRef.current,previous=document.activeElement;
        dialog?.showModal();
        return()=>{dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();else document.querySelector<HTMLInputElement>('[aria-label="불러온 점검 검색"]')?.focus();};
    },[]);
    const close=()=>{if(!working.current)onClose();};
    return <dialog ref={dialogRef} className="si-workspace si-record-delete-dialog" aria-labelledby="si-record-delete-title" onCancel={event=>{event.preventDefault();close();}}>
        <header><div><p className="si-eyebrow">점검기록 정리</p><h2 id="si-record-delete-title">선택한 기록 삭제</h2></div><button type="button" className="si-btn" autoFocus disabled={busy} onClick={close}>닫기</button></header>
        <div className="si-record-delete-body"><p className="si-caption">점검번호 {record.id.slice(0,8).toUpperCase()} · 버전 {record.revision}. 삭제 범위와 대상을 확인해 주세요. 완료 전까지 기록을 목록에서 지우지 않습니다.</p>
            <InspectorStorageManager id={record.id} revision={record.revision} title={record.title} initialOpen compact onLocked={onLocked}
                onWorking={value=>{working.current=value;setBusy(value);onWorking(value);if(value)onStarted();}}
                onStatus={status=>{if(status.verified&&status.mode&&notified.current!==status.mode){notified.current=status.mode;onVerified(status.mode);}}}
                onComplete={close}/>
            <p className="si-caption">창을 닫으면 자동 마무리가 중지됩니다. 이 탭의 ‘삭제 상태 확인’에서 다시 확인할 수 있습니다. 사진·분석을 새로 불러오거나 AI를 호출하지 않습니다.</p>
        </div>
    </dialog>;
}
