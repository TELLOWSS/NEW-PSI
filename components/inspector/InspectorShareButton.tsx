import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {shareInspectorPacket,shareResultMessage} from '../../lib/inspector/sharing';

function ShareDialog({title,text,prepareFiles,onClose}:{title:string;text:string;prepareFiles?:()=>Promise<File[]>;onClose:()=>void}){
    const ref=useRef<HTMLDialogElement>(null),[files,setFiles]=useState<File[]>([]),[selected,setSelected]=useState<number[]>([]),[loading,setLoading]=useState(!!prepareFiles),[fileError,setFileError]=useState(''),[message,setMessage]=useState(''),[sharing,setSharing]=useState(false);
    const [body,setBody]=useState(text);
    const [previews,setPreviews]=useState<string[]>([]);
    useEffect(()=>{const urls=files.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url));},[files]);
    useEffect(()=>{
        const previous=document.activeElement,dialog=ref.current;let alive=true;dialog?.showModal();
        if(prepareFiles)void prepareFiles().then(next=>{if(alive){setFiles(next);setSelected(next.map((_,n)=>n));}}).catch(()=>{if(alive)setFileError('사진을 준비하지 못했습니다. 사진 로딩·삭제 상태를 확인하고 다시 열어 주세요. 문구만 공유할 수 있습니다.');}).finally(()=>{if(alive)setLoading(false);});
        return()=>{alive=false;dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
    },[]);
    const share=async()=>{
        if(sharing)return;setSharing(true);setMessage('');
        const result=await shareInspectorPacket({title,text:body,files:selected.map(n=>files[n])});setMessage(shareResultMessage[result]);setSharing(false);
    };
    const download=(file:File)=>{const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
    return <dialog ref={ref} className="si-share-dialog si-workspace" aria-label="현장 자료 보내기" onCancel={e=>{e.preventDefault();if(!sharing)onClose();}}>
        <div className="si-section-heading"><h2>카톡 등으로 보내기</h2><button type="button" className="si-btn" disabled={sharing} onClick={onClose}>닫기</button></div>
        <p className="si-caption">내용을 확인한 뒤 공유창에서 앱·상대를 선택하세요. 설치된 앱과 브라우저에 따라 카카오톡 표시 및 사진·문구 동시 첨부가 달라집니다.</p>
        <label className="si-label" htmlFor="si-share-body">보낼 문구</label><textarea id="si-share-body" rows={7} maxLength={50000} value={body} disabled={sharing} onChange={e=>setBody(e.target.value)}/>
        {loading&&<p role="status">보관 사진을 공유용 파일로 준비 중…</p>}{fileError&&<p role="status">{fileError}</p>}
        {files.length>0&&<fieldset className="si-share-files" disabled={sharing}><legend>함께 보낼 사진 {selected.length} / {files.length}장</legend>{files.map((file,n)=><div key={file.name}><label><input type="checkbox" checked={selected.includes(n)} onChange={e=>setSelected(old=>e.target.checked?[...old,n]:old.filter(i=>i!==n))}/>{previews[n]&&<img src={previews[n]} alt={`공유할 사진 ${n+1}`}/>}<span>사진 {n+1} · {(file.size/1048576).toFixed(2)}MB</span></label><button type="button" className="si-btn" onClick={()=>download(file)}>사진 {n+1} 다운로드</button></div>)}</fieldset>}
        <div className="si-share-actions"><button type="button" className="si-btn si-primary" disabled={sharing||loading||!body.trim()} onClick={share}>{sharing?'공유창 처리 중…':selected.length?'사진·문구 공유창 열기':'문구 공유창 열기'}</button><button type="button" className="si-btn" disabled={sharing||!body.trim()} onClick={()=>void navigator.clipboard.writeText(body).then(()=>setMessage('문구를 복사했습니다. 카카오톡 대화창에 붙여넣고 사진을 첨부해 주세요.')).catch(()=>setMessage('복사하지 못했습니다. 위 문구를 선택해 복사하세요.'))}>문구 복사</button></div>
        {message&&<p role="status" className="si-notice">{message}</p>}
        <p className="si-caption">최적화 사진 사본을 보냅니다. 앱에서 사진과 문구 중 일부가 빠지면 복사·다운로드로 보완하세요. 공유한 사본은 이 점검을 삭제해도 상대방 기기에서 삭제되지 않습니다.</p>
    </dialog>;
}

export default function InspectorShareButton({title,text,prepareFiles,disabled=false,label='카톡 등으로 보내기'}:{title:string;text:string;prepareFiles?:()=>Promise<File[]>;disabled?:boolean;label?:string}){
    const [open,setOpen]=useState(false);
    return <><button type="button" className="si-btn" disabled={disabled} onClick={()=>setOpen(true)}>{label}</button>{open&&createPortal(<ShareDialog title={title} text={text} prepareFiles={prepareFiles} onClose={()=>setOpen(false)}/>,document.body)}</>;
}
