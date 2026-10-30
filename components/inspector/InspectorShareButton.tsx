import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './inspector-share-review.css';
import {shareInspectorPacket,shareResultMessage,copyInspectorShareText,shareCopyResultMessage} from '../../lib/inspector/sharing';

export function ShareDialog({title,text,prepareFiles,onClose}:{title:string;text:string;prepareFiles?:()=>Promise<File[]>;onClose:()=>void}){
    const inFlight=useRef(false);
    const ref=useRef<HTMLDialogElement>(null),[files,setFiles]=useState<File[]>([]),[selected,setSelected]=useState<number[]>([]),[loading,setLoading]=useState(!!prepareFiles),[fileError,setFileError]=useState(''),[message,setMessage]=useState(''),[sharing,setSharing]=useState(false);
    const [body,setBody]=useState(text);
    const [previews,setPreviews]=useState<string[]>([]);
    useEffect(()=>{const urls=files.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url));},[files]);
    useEffect(()=>{
        const previous=document.activeElement,dialog=ref.current;let alive=true;dialog?.showModal();
        if(prepareFiles)void prepareFiles().then(next=>{if(alive){setFiles(next);setSelected(next.map((_,n)=>n));}}).catch(()=>{if(alive)setFileError('사진을 준비하지 못했습니다. 사진 로딩·삭제 상태를 확인하고 다시 열어 주세요. 문구만 공유할 수 있습니다.');}).finally(()=>{if(alive)setLoading(false);});
        return()=>{alive=false;dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
    },[]);
    const share=async(includePhotos:boolean)=>{
        if(inFlight.current)return;
        inFlight.current=true;setSharing(true);setMessage('');
        try{
            const attachments=includePhotos?selected.map(n=>files[n]).filter((file):file is File=>!!file):[];
            const result=await shareInspectorPacket({title,text:body,files:attachments});
            setMessage(shareResultMessage[result]);
        }catch{
            setMessage(shareResultMessage.failed);
        }finally{
            inFlight.current=false;setSharing(false);
        }
    };
    const copyText=async()=>setMessage(shareCopyResultMessage[await copyInspectorShareText(body)]);
    const download=(file:File)=>{const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
    return <dialog ref={ref} className="si-share-dialog si-workspace" aria-label="현장 자료 보내기" onCancel={e=>{e.preventDefault();if(!sharing)onClose();}}>
        <div className="si-section-heading"><h2>카톡 등으로 보내기</h2><button type="button" className="si-btn" disabled={sharing} onClick={onClose}>닫기</button></div>
        <p className="si-caption">내용과 사진을 확인한 다음 공유할 앱과 상대를 선택하세요. 사진을 함께 보내지 못하는 기기에서는 '문구만 공유창 열기'로 진행한 뒤 사진을 따로 첨부할 수 있습니다.</p>
        <label className="si-label" htmlFor="si-share-body">보낼 문구</label><textarea id="si-share-body" rows={7} maxLength={50000} value={body} disabled={sharing} onChange={e=>setBody(e.target.value)}/>
        {loading&&<p role="status">보관 사진을 공유용 파일로 준비 중…</p>}{fileError&&<p role="status">{fileError}</p>}
        {files.length>0&&<fieldset className="si-share-files" disabled={sharing}><legend>함께 보낼 사진 {selected.length} / {files.length}장</legend><p className="si-caption">선택한 사진만 공유창에 전달됩니다. 이름·얼굴·연락처 등의 포함 여부를 먼저 확인해 주세요.</p><button type="button" className="si-btn" disabled={sharing} onClick={()=>{setSelected(selected.length===files.length?[]:files.map((_,n)=>n));setMessage('');}}>{selected.length===files.length?'사진 선택 모두 해제':'사진 전체 선택'}</button>{files.map((file,n)=><div key={file.name+'-'+n}><label><input type="checkbox" checked={selected.includes(n)} onChange={e=>setSelected(old=>e.target.checked?[...old,n]:old.filter(i=>i!==n))}/>{previews[n]&&<img src={previews[n]} alt={`공유할 사진 ${n+1}`}/>}<span>사진 {n+1} · {(file.size/1048576).toFixed(2)}MB</span></label><button type="button" className="si-btn" onClick={()=>download(file)}>사진 {n+1} 다운로드</button></div>)}</fieldset>}
        <div className="si-share-review" role="status" aria-live="polite"><strong>공유할 내용 확인</strong><span>{loading?'사진 준비 중':selected.length?`사진 ${selected.length}장과 문구`:'문구만 보내기'}</span></div>
        <div className="si-share-actions"><button type="button" className="si-btn si-primary" disabled={sharing||loading||!body.trim()} onClick={()=>void share(true)}>{sharing?'공유창 처리 중…':selected.length?'사진·문구 공유창 열기':'문구 공유창 열기'}</button><button type="button" className="si-btn" disabled={sharing||!body.trim()} onClick={()=>void share(false)}>문구만 공유창 열기</button><button type="button" className="si-btn" disabled={sharing||!body.trim()} onClick={()=>void copyText()}>문구 복사</button></div>
        {message&&<p role="status" className="si-notice">{message}</p>}
        <p className="si-caption">공유창으로 넘기는 것은 실제 메시지 전송 완료를 뜻하지 않습니다. 받는 사람과 전송 여부를 앱에서 확인하세요. {prepareFiles?'선택한 최적화 사진 사본만 보낼 수 있으며, 실패하면 문구와 사진을 따로 전달하세요.':'문구만 공유합니다.'} 공유한 사본은 이 점검을 삭제해도 상대방 기기에서 삭제되지 않습니다.</p>
    </dialog>;
}

export default function InspectorShareButton({title,text,prepareFiles,disabled=false,label='카톡 등으로 보내기'}:{title:string;text:string;prepareFiles?:()=>Promise<File[]>;disabled?:boolean;label?:string}){
    const [open,setOpen]=useState(false);
    return <><button type="button" className="si-btn" disabled={disabled} onClick={()=>setOpen(true)}>{label}</button>{open&&createPortal(<ShareDialog title={title} text={text} prepareFiles={prepareFiles} onClose={()=>setOpen(false)}/>,document.body)}</>;
}
