import React,{useEffect,useState} from 'react';
import {photoQueue,photoFilterLabels,overdueAction,type PhotoFilter} from '../../lib/inspector/workQueue';
import {useInspectionDay} from './useInspectionDay';
import type {Inspection} from '../../lib/inspector/types';
import {pendingReviewQueue} from '../../lib/inspector/reviewQueue';
import InspectorHandover from './InspectorHandover';
export default function InspectorPhotoCollection({item,active,busy,title,onTitle,onOpen,onFinish}:{item:Inspection;active:boolean;busy:boolean;title:string;onTitle:(title:string)=>void;onOpen:(id:string)=>void;onFinish:()=>void}){
    const [open,setOpen]=useState(!active&&item.document.photoIds.length<=5),[filter,setFilter]=useState<PhotoFilter>('all'),[page,setPage]=useState(0);
    useEffect(()=>setOpen(!active&&item.document.photoIds.length<=5),[active,item.document.photoIds.length]);
    const today=useInspectionDay(),doc=item.document,rows=photoQueue(doc),reviewed=doc.photoIds.filter(id=>!!doc.reviews[id]).length;
    const filtered=rows.filter(p=>filter==='all'||p.kind===filter),pages=Math.max(1,Math.ceil(filtered.length/5)),current=Math.min(page,pages-1);
    const pending=pendingReviewQueue(doc),requested=doc.actions.filter(a=>a.status==='review-requested'),late=doc.actions.filter(a=>overdueAction(a,today));
    return <section className="si-photo-collection" aria-label="모은 사진과 보고서">
        {!active&&<div className="si-work-summary" aria-label="이 점검의 다음 할 일"><div><b>이어서 처리할 사항</b><span>기준일 {today} · 한국시간 · 기기 시계</span></div><dl><div><dt>AI 검토 대기</dt><dd>{pending.length}장</dd></div><div><dt>완료 검토 요청</dt><dd>{requested.length}건</dd></div><div><dt>기한 지난 미결</dt><dd>{late.length}건</dd></div></dl>{pending.length>0?<button type="button" className="si-btn" disabled={busy} onClick={()=>onOpen(pending[0].id)}>검토 대기 사진 {pending[0].number}부터 이어보기</button>:<p className="si-caption">AI 검토 대기 사진이 없습니다. 조치 완료·안전 승인 여부와는 별개입니다.</p>}</div>}
        <details open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>모은 사진 {doc.photoIds.length}장 <span>· 전문가 검토 {reviewed}장</span></summary>
            <div className="si-queue-filters" role="group" aria-label="모은 사진 분류">{(Object.entries(photoFilterLabels) as [PhotoFilter,string][]).map(([id,label])=><button key={id} type="button" className="si-btn" aria-pressed={filter===id} onClick={()=>{setFilter(id);setPage(0);}}>{label} {id==='all'?rows.length:rows.filter(p=>p.kind===id).length}</button>)}</div>
            <p className="si-caption">분류는 화면 표시만 바꿉니다. 보고서 사진을 제외하거나 재분석·승인하지 않습니다. 개선 증빙에 AI 분석이 없으면 검토 대기로 세지 않습니다.</p>
            <ol>{filtered.slice(current*5,current*5+5).map(row=><li key={row.id}><span className="si-collected-index">{row.number}</span><div><strong>{row.description}</strong><small>{row.label}</small></div><button type="button" className="si-btn" disabled={busy||active} onClick={()=>onOpen(row.id)}>열어 검토</button></li>)}</ol>
            {!filtered.length&&<p className="si-caption">선택한 분류에 사진이 없습니다.</p>}
            {pages>1&&<div className="si-action-pagination"><button type="button" className="si-btn" disabled={!current} onClick={()=>setPage(current-1)}>이전 사진 목록</button><span>{current+1} / {pages} · {filtered.length}장</span><button type="button" className="si-btn" disabled={current>=pages-1} onClick={()=>setPage(current+1)}>다음 사진 목록</button></div>}
            {active&&<p className="si-caption">현재 사진을 확인하고 ‘다음 사진’을 누르면 이전 사진을 열어 검토할 수 있습니다.</p>}
        </details>
        {!active&&doc.photoIds.length>0&&<InspectorHandover item={item} busy={busy} title={title} onTitle={onTitle} onOpen={onOpen} onFinish={onFinish}/>}
    </section>;
}
