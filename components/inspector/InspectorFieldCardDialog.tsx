import {QRCodeSVG} from 'qrcode.react';
import {validMarks,type PhotoMark} from '../../lib/inspector/photoMarks';
import './inspector-share.css';
import React,{useEffect,useId,useRef,useState} from 'react';
import {FIELD_CARD_LIMITS,fieldCardText,validateFieldCard,type FieldCardDraft,type FieldCardSeed} from '../../lib/inspector/fieldCard';
import {shareInspectorPacket,shareResultMessage} from '../../lib/inspector/sharing';

export default function InspectorFieldCardDialog({photo,seed,source,replyUrl,onClose}:{photo:Blob;seed:FieldCardSeed;source:string;replyUrl?:string;onClose:()=>void}){
    const [marks,setMarks]=useState<PhotoMark[]>([]),[tool,setTool]=useState<'none'|'circle'|'arrow'>('none'),[photoUrl,setPhotoUrl]=useState(''),[size,setSize]=useState({w:1000,h:1000});
    const start=useRef<{x:number;y:number}|null>(null),qrRef=useRef<SVGSVGElement>(null);
    useEffect(()=>{const u=URL.createObjectURL(photo);setPhotoUrl(u);return()=>URL.revokeObjectURL(u);},[photo]);
    const ref=useRef<HTMLDialogElement>(null),previewRef=useRef<HTMLElement>(null),alive=useRef(true),working=useRef(false),id=useId();
    const [draft,setDraft]=useState(seed.draft),[card,setCard]=useState<File|null>(null),[url,setUrl]=useState(''),[building,setBuilding]=useState(false),[sharing,setSharing]=useState(false),[message,setMessage]=useState('');
    const invalid=validateFieldCard(draft),text=fieldCardText(draft,seed.basis,source)+(replyUrl?'\n조치 회신: '+replyUrl:'');
    useEffect(()=>{const previous=document.activeElement,dialog=ref.current;alive.current=true;dialog?.showModal();return()=>{alive.current=false;dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
    useEffect(()=>{if(!card){setUrl('');return;}const next=URL.createObjectURL(card);setUrl(next);requestAnimationFrame(()=>previewRef.current?.scrollIntoView({block:'start'}));return()=>URL.revokeObjectURL(next);},[card]);
    const change=(key:keyof FieldCardDraft,value:string)=>{setDraft(old=>({...old,[key]:value}));setCard(null);setMessage('');};
    const generate=async()=>{
        if(working.current||invalid)return;working.current=true;setBuilding(true);setCard(null);setMessage('');
        try{const {renderFieldCard}=await import('../../lib/inspector/fieldCardImage');const file=await renderFieldCard(photo,draft,seed.basis,source,getComputedStyle(ref.current!).fontFamily,{marks,qrSvg:qrRef.current?new XMLSerializer().serializeToString(qrRef.current):undefined});if(alive.current)setCard(file);}
        catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'카드를 만들지 못했습니다. 다시 시도하거나 문구를 복사해 주세요.');}
        finally{working.current=false;if(alive.current)setBuilding(false);}
    };
    const share=async()=>{
        if(working.current||!card)return;working.current=true;setSharing(true);setMessage('');
        const result=await shareInspectorPacket({title:'PSI 현장 전달 카드',text,files:[card]});
        working.current=false;if(alive.current){setSharing(false);setMessage(shareResultMessage[result]);}
    };
    const download=()=>{if(!card)return;const downloadUrl=URL.createObjectURL(card),link=document.createElement('a');link.href=downloadUrl;link.download=card.name;link.click();setTimeout(()=>URL.revokeObjectURL(downloadUrl),30000);setMessage('카드 다운로드를 요청했습니다. 기기의 다운로드 목록을 확인해 주세요.');};
    return <dialog ref={ref} className="si-field-card si-share-dialog si-workspace" aria-label="사진·조치 전달 카드" onCancel={e=>{e.preventDefault();if(!working.current)onClose();}}>
        <div className="si-section-heading"><div><p className="si-eyebrow">사진과 요청을 한 장에</p><h2>현장 전달 카드</h2></div><button autoFocus type="button" className="si-btn" disabled={building||sharing} onClick={onClose}>닫기</button></div>
        <p className="si-caption">사진과 문구를 한 이미지로 담습니다. 내용을 확인해 만든 뒤 카카오톡 등 공유 앱에서 상대를 선택하세요.</p>
        <p className="si-field-card-basis">{seed.basis} · {source}</p>
        {seed.shortened&&<p className="si-notice">긴 원문을 카드 길이에 맞춰 줄였습니다. 빠진 내용이 없는지 확인하고 수정하세요. 원래 결과는 유지됩니다.</p>}
        <details className="si-card-mark-controls"><summary>사진에 동그라미·화살표 넣기 (선택)</summary><div className="si-mark-tools" role="group" aria-label="사진 위치 표시 도구">{(['none','circle','arrow'] as const).map(t=><button className="si-btn" type="button" key={t} aria-pressed={tool===t} disabled={building||sharing} onClick={()=>setTool(t)}>{t==='none'?'스크롤':t==='circle'?'동그라미':'화살표'}</button>)}<button className="si-btn" type="button" disabled={building||sharing||!marks.length} onClick={()=>{setMarks(m=>m.slice(0,-1));setCard(null);}}>표시 하나 취소</button></div><p className="si-caption">동그라미는 누르고, 화살표는 시작점에서 끝점까지 그으세요. 최대 8개 · 원본은 바꾸지 않습니다.</p><div className={`si-photo-mark-editor ${tool!=='none'?'is-editing':''}`} onPointerDown={e=>{if(tool==='none'||building||sharing||marks.length>=8)return;const r=e.currentTarget.getBoundingClientRect();start.current={x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerCancel={()=>{start.current=null;}} onPointerUp={e=>{const a=start.current;start.current=null;if(!a||tool==='none')return;const r=e.currentTarget.getBoundingClientRect(),m:PhotoMark={kind:tool,x:a.x,y:a.y,endX:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),endY:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};if(validMarks([...marks,m])){setMarks(old=>[...old,m]);setCard(null);}}}><img src={photoUrl} alt="위치를 표시할 원본 사진" draggable={false} onLoad={e=>setSize({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})}/><svg viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">{marks.map((m,n)=>m.kind==='circle'?<circle key={n} cx={m.x*size.w} cy={m.y*size.h} r={Math.min(size.w,size.h)*.06} fill="none" stroke="#ffdc48" strokeWidth={Math.min(size.w,size.h)*.009}/>:<path key={n} d={`M${m.x*size.w},${m.y*size.h} L${m.endX*size.w},${m.endY*size.h}`} fill="none" stroke="#ffdc48" strokeWidth={Math.min(size.w,size.h)*.009}/>)}</svg></div><p role="status">위치 표시 {marks.length}개</p></details>
        {replyUrl&&<div className="si-card-qr"><QRCodeSVG ref={qrRef} value={replyUrl} size={220} marginSize={4} level="M"/><p className="si-caption">카드에 회신 QR이 포함됩니다. 링크 소지자에게만 전달하세요.</p></div>}
        <div className="si-field-card-fields">
            <label htmlFor={`${id}-problem`}>확인할 핵심 문제 <small>{draft.problem.length}/{FIELD_CARD_LIMITS.problem}</small></label><input id={`${id}-problem`} value={draft.problem} maxLength={FIELD_CARD_LIMITS.problem} disabled={building||sharing} onChange={e=>change('problem',e.target.value)}/>
            <label htmlFor={`${id}-action`}>요청할 조치 <small>{draft.action.length}/{FIELD_CARD_LIMITS.action}</small></label><textarea id={`${id}-action`} rows={3} value={draft.action} maxLength={FIELD_CARD_LIMITS.action} disabled={building||sharing} placeholder="안전한 위치에서 확인·보완할 사항을 적어 주세요." onChange={e=>change('action',e.target.value)}/>
            <details><summary>사진 위치·관찰 문구 수정</summary><label htmlFor={`${id}-location`}>사진에서 볼 위치 (선택)</label><input id={`${id}-location`} value={draft.location} maxLength={FIELD_CARD_LIMITS.location} disabled={building||sharing} onChange={e=>change('location',e.target.value)}/><label htmlFor={`${id}-evidence`}>관찰·점검자 의견 (선택)</label><textarea id={`${id}-evidence`} rows={3} value={draft.evidence} maxLength={FIELD_CARD_LIMITS.evidence} disabled={building||sharing} onChange={e=>change('evidence',e.target.value)}/></details>
        </div>
        <button type="button" className="si-btn si-primary si-card-generate" disabled={building||sharing||!!invalid} onClick={generate}>{building?'기기에서 카드 만드는 중…':card?'카드 다시 만들기':'내용 확인 · 카드 미리보기 만들기'}</button>
        {invalid&&<p className="si-caption">{invalid}</p>}
        {card&&url&&<section ref={previewRef} className="si-field-card-preview" aria-label="전달 카드 미리보기"><h3>보낼 카드 확인</h3><img src={url} alt="선택한 사진과 편집한 문제·위치·관찰·요청 조치를 담은 전달 카드"/><p className="si-caption">JPEG · {(card.size/1048576).toFixed(2)}MB · 사진 전체를 담은 최적화 사본</p><div className="si-share-actions"><button type="button" className="si-btn si-primary" disabled={sharing} onClick={share}>카드 공유창 열기</button><button type="button" className="si-btn" disabled={sharing} onClick={download}>카드 다운로드</button></div></section>}
        <button type="button" className="si-btn" disabled={building||sharing||!!invalid} onClick={()=>void navigator.clipboard.writeText(text).then(()=>{if(alive.current)setMessage('전달 문구를 복사했습니다.');}).catch(()=>{if(alive.current)setMessage('복사하지 못했습니다. 문구·사진 따로 보내기를 이용해 주세요.');})}>전달 문구 복사</button>
        {message&&<p className="si-notice" role="status">{message}</p>}
        <p className="si-caption">문구를 바꾸면 미리보기를 다시 만드세요. 카드 편집은 원래 검토·등록 조치·보고서에 저장되지 않습니다. 추가 AI 사용료·서버 사진 보관 없이 기기에서 만들며, 다운로드·공유한 사본은 점검 삭제로 회수되지 않습니다.</p>
    </dialog>;
}
