import React,{useEffect,useState} from 'react';
import {reviewLabel} from '../../lib/inspector/expertReview';
import type {Inspection} from '../../lib/inspector/types';
export default function InspectorPhotoCollection({item,active,busy,title,onTitle,onOpen,onFinish}:{item:Inspection;active:boolean;busy:boolean;title:string;onTitle:(title:string)=>void;onOpen:(id:string)=>void;onFinish:()=>void}){
    const [open,setOpen]=useState(!active);
    useEffect(()=>setOpen(!active),[active]);
    const doc=item.document,reviewed=doc.photoIds.filter(id=>!!doc.reviews[id]).length;
    return <section className="si-photo-collection" aria-label="모은 사진과 보고서">
        <details open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>모은 사진 {doc.photoIds.length}장 <span>· 전문가 검토 {reviewed}장</span></summary>
            <ol>{doc.photoIds.map((id,n)=><li key={id}><span className="si-collected-index">{n+1}</span><div><strong>{doc.photoNotes?.[id]||`사진 ${n+1}`}</strong><small>{reviewLabel(doc.reviews[id],!!doc.analyses[id])}</small></div><button type="button" className="si-btn" disabled={busy||active} onClick={()=>onOpen(id)}>열어 검토</button></li>)}</ol>
            {active&&<p className="si-caption">현재 사진을 확인하고 ‘다음 사진’을 누르면 이전 사진을 열어 검토할 수 있습니다.</p>}
            <label htmlFor="si-report-title">보고서 제목</label><input id="si-report-title" value={title} maxLength={200} disabled={busy} onChange={e=>onTitle(e.target.value)}/>
            {!active&&doc.photoIds.length>0&&<button type="button" className="si-btn si-primary" disabled={busy} onClick={onFinish}>모은 자료로 보고서 완성</button>}
        </details>
    </section>;
}
