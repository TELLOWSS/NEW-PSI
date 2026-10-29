import React,{useEffect,useId,useState} from 'react';
import {sourceReviewState} from '../../lib/inspector/sourceReview';
import type {VisionImport} from '../../lib/inspector/types';
import type {LegalReference} from '../../lib/inspector/legal';
import type {ExpertReview} from '../../lib/inspector/expertReview';
import './inspector-safety-cards.css';

type DeckPanel='risk'|'action'|'evidence'|'reference'|'handoff';
const PANELS:{id:DeckPanel;title:string;short:string}[]=[
    {id:'risk',title:'위험 요약',short:'위험'},
    {id:'action',title:'조치 제안',short:'조치'},
    {id:'evidence',title:'현장 대조',short:'확인'},
    {id:'reference',title:'법령·사례',short:'근거'},
    {id:'handoff',title:'보고·공유',short:'전달'}
];
const PRIORITY={immediate:'우선 통제 검토',soon:'빠른 개선 검토',routine:'관리 상태 확인'} as const;
const confidence={high:'높음',medium:'중간',low:'낮음'} as const;
const withHttps=(url:string|undefined)=>url&&/^https:\/\/[^\s]+$/i.test(url)?url:null;
const valueOr=(text:string|undefined,otherwise:string)=>text?.trim()||otherwise;
const guideCount=(value:number)=>String(value).padStart(2,'0');

type Props={
    analysis:VisionImport;reference:LegalReference;review:ExpertReview;reviewSaved:boolean;
    photoUrl?:string;note:string;photoId?:string;selectedFinding:number;
    onFindingChange:(value:number)=>void;onComposeCard?:()=>void;
    onSeePhoto?:()=>void;onSeeDetails?:()=>void;
    onCopy?:()=>void;copyDone?:boolean;disabled?:boolean;
};

/** Presentation-only: no API calls, auto-grading, edited evidence, or changes to stored records. */
export default function InspectorSafetyCardDeck({
    analysis,reference,review,reviewSaved,photoUrl,note,photoId,selectedFinding,
    onFindingChange,onComposeCard,onSeePhoto,onSeeDetails,onCopy,copyDone=false,disabled=false
}:Props){
    const [panel,setPanel]=useState<DeckPanel>('risk'),id=useId();
    const findings=analysis.risk_findings||[];
    const index=Math.min(Math.max(0,selectedFinding),Math.max(0,findings.length-1));
    const finding=findings[index];
    const observed=analysis.observed_facts||[];
    const observation=finding?observed[Number(finding.observation_index)]:observed[0];
    const rejected=review.decision==='rejected';
    const priority=finding?.priority||'routine';
    const reviewLabel=rejected?'AI 해석 미수용':reviewSaved?'전문가 검토 저장':'전문가 검토 저장 전';
    const sourceCount=reference.cards.length;
    useEffect(()=>{setPanel('risk');},[analysis.photo_id]);
    const displayedTitle=rejected?'전문가 의견을 우선 확인하세요':valueOr(finding?.problem,observed.length?'사진 관찰 내용을 대조하세요':'구체적 위험 특정 전');
    const key=panel+'-'+index;
    return <section className="si-safety-deck" aria-label="PSI 안전 분석 카드" data-psi-safety-deck="v1">
        <header className="si-safety-deck-heading">
            <div><span className="si-safety-deck-kicker">PSI INSPECTOR · SAFETY CARDS</span><h3>한 장씩 읽는 안전점검</h3><p>위험 제안부터 조치·근거·전달까지 필요한 내용만 확인합니다.</p></div>
            <span className="si-safety-deck-index" aria-hidden="true">{guideCount(PANELS.findIndex(v=>v.id===panel)+1)} <span>/ {guideCount(PANELS.length)}</span></span>
        </header>
        <nav className="si-safety-deck-nav" aria-label="안전카드 종류">
            {PANELS.map((v,n)=><button key={v.id} type="button" className={panel===v.id?'is-active':''} aria-current={panel===v.id?'page':undefined} aria-label={v.title} onClick={()=>setPanel(v.id)}><span className="si-safety-deck-nav-number">{guideCount(n+1)}</span><span>{v.short}</span></button>)}
        </nav>
        <article key={key} className={'si-safety-card si-safety-card-'+panel+(rejected?' is-rejected':'')} aria-label={PANELS.find(v=>v.id===panel)?.title}>
            <div className="si-safety-card-bar">
                <span className="si-safety-card-mark" aria-hidden="true">PSI / FIELD INTELLIGENCE</span>
                <span className="si-safety-card-phase">{panel==='risk'?'RISK SIGNAL':panel==='action'?'ACTION PATH':panel==='evidence'?'EVIDENCE REVIEW':panel==='reference'?'SOURCE TRACE':'FIELD HANDOFF'}</span>
            </div>
            {panel==='risk'&&<>
                <div className="si-safety-card-title">
                    <div className="si-safety-card-status">{rejected?'원래 AI 제안 · 미수용':finding?'AI 위험 단서 · 현장 판단 필요':'AI 관찰 제안 · 현장 판단 필요'}</div>
                    <h4>{displayedTitle}</h4>
                    <p>{rejected?valueOr(review.note,'전문가가 AI 해석을 수용하지 않았습니다. 원래 제안을 검토 자료로만 참고하세요.'):finding?valueOr(finding.risk,'구체적인 위험은 현장 확인이 필요합니다.'):valueOr(observation?.text,'사진만으로 구체적인 위험을 좁히지 못했습니다.')}</p>
                </div>
                <div className={'si-safety-card-media'+(photoUrl?' has-photo':'')}>
                    {photoUrl?<img src={photoUrl} alt="점검 사진 원본 또는 보관된 점검용 사진 미리보기 · 카드 효과가 적용되지 않은 사진" loading="lazy"/>:<div className="si-safety-card-no-photo">사진 미리보기 없음</div>}
                    <div className="si-safety-card-photo-hint">점검 사진 · 카드 효과는 저장되지 않음</div>
                    {photoUrl&&onSeePhoto&&<button type="button" className="si-safety-card-zoom" onClick={onSeePhoto}>사진 크게 확인</button>}
                </div>
                <div className="si-safety-card-risk-footer">
                    <div><span>검토 우선순위</span><strong>{rejected?'전문가 재검토':finding?PRIORITY[priority]:'추가 확인 필요'}</strong></div>
                    <div><span>현장 검토</span><strong>{reviewLabel}</strong></div>
                </div>
                {findings.length>1&&<div className="si-safety-card-finding-select" role="group" aria-label="위험 단서 전환">
                    {findings.map((v,n)=><button type="button" key={n} disabled={disabled} aria-pressed={n===index} onClick={()=>onFindingChange(n)}>위험 {n+1}</button>)}
                </div>}
                <p className="si-safety-card-disclaimer">AI 결과는 위험·법 위반 확정이나 조치 완료를 뜻하지 않습니다. 현장에서 직접 대조해 주세요.</p>
            </>}
            {panel==='action'&&<div className="si-safety-card-body">
                <p className="si-safety-card-eyebrow">PRIORITY ACTION / {finding?PRIORITY[priority]:'검토 필요'}</p>
                <h4>{rejected?'전문가 조치 의견 확인':'우선 확인할 조치'}</h4>
                <div className="si-safety-card-feature"><span className="si-safety-card-feature-number">01</span><p>{rejected?valueOr(review.note,'AI 제안을 수용하지 않았습니다. 현장 담당자가 필요한 조치를 작성·확정해 주세요.'):valueOr(finding?.action,analysis.recommended_controls[0]?.action||'촬영 대상과 주변 작업 상태를 안전한 위치에서 확인해 주세요.')}</p></div>
                {!rejected&&analysis.recommended_controls.length>0&&<div className="si-safety-card-mini-list"><h5>추가 조치 제안</h5>{analysis.recommended_controls.slice(0,3).map((c,n)=><div key={n}><span>{guideCount(n+2)}</span><p>{c.action}</p></div>)}</div>}
                <p className="si-safety-card-disclaimer">실제 작업중지·접근통제 필요성, 담당자와 조치기한은 현장에서 판단해 기록해야 합니다.</p>
            </div>}
            {panel==='evidence'&&<div className="si-safety-card-body">
                <p className="si-safety-card-eyebrow">FACT / STATEMENT / INFERENCE</p>
                <h4>사진으로 확인할 사항</h4>
                {note.trim()&&<section className="si-safety-card-evidence-block"><span>점검자 진술 · AI 판독 아님</span><p>{note.trim()}</p></section>}
                {observed.length>0?<section className="si-safety-card-evidence-block"><span>AI 관찰 제안 · 현장 대조 필요</span>{observed.slice(0,3).map((o,n)=><p key={n}>{o.text} <small>판독 확신 {confidence[o.confidence]}</small></p>)}</section>:<p>사진에서 특정할 관찰 단서가 아직 없습니다.</p>}
                {analysis.ai_hypotheses.length>0&&<section className="si-safety-card-evidence-block"><span>추정 · 확인된 사실 아님</span>{analysis.ai_hypotheses.slice(0,2).map((h,n)=><p key={n}>{h.text}</p>)}</section>}
                {(analysis.requires_confirmation.length>0||analysis.limitations.length>0)&&<section className="si-safety-card-evidence-block"><span>추가 확인·판단 한계</span>{analysis.requires_confirmation.slice(0,2).map((q,n)=><p key={n}>{q.question}</p>)}{analysis.limitations.slice(0,1).map((l,n)=><p key={'limit-'+n}>{l}</p>)}</section>}
            </div>}
            {panel==='reference'&&<div className="si-safety-card-body">
                <p className="si-safety-card-eyebrow">OFFICIAL SOURCE REVIEW</p>
                <h4>연결된 법령·사례 자료</h4>
                <p className="si-safety-card-lead">관련 자료 {sourceCount}건 · 실제 적용 조항과 사건 당시 시행본은 별도 확인해야 합니다.</p>
                {sourceCount?reference.cards.slice(0,3).map(c=>{const url=withHttps(c.duties.find(d=>withHttps(d.url))?.url);const status=sourceReviewState(c.sourceReview);return <section className="si-safety-card-source" key={c.id}><strong>{c.title}</strong><span>{status.label}</span>{url&&<a href={url} target="_blank" rel="noopener noreferrer">공식 근거 열기</a>}</section>}):<div className="si-safety-card-source"><strong>관련 기준이 자동 연결되지 않았습니다.</strong><span>법적 의무가 없다는 뜻이 아니므로 작업 내용과 실제 시설을 확인하세요.</span></div>}
                {(reference.inspectionCases||[]).length>0&&<div className="si-safety-card-cases"><h5>공개 감독·사고사례 참고 후보</h5><p>현재 현장의 발생 사실이나 동일 사고로 판단한 자료가 아닙니다.</p>{reference.inspectionCases!.slice(0,2).map(c=><section className="si-safety-card-source" key={c.id}><strong>{c.title}</strong><span>{c.agency} · {c.publishedAt} · {sourceReviewState(c.sourceReview).label}</span><span>{c.lesson}</span>{withHttps(c.url)&&<a href={c.url} target="_blank" rel="noopener noreferrer">공개 사례 원문 확인</a>}</section>)}</div>}
                <p className="si-safety-card-disclaimer">자동 연결은 법 위반 판정이 아닙니다. 벌금·과태료는 적용조건과 처분 주체에 따라 달라집니다.</p>
            </div>}
            {panel==='handoff'&&<div className="si-safety-card-body">
                <p className="si-safety-card-eyebrow">REVIEW · ACTION · REPORT</p>
                <h4>이제 현장 판단과 전달을 연결하세요</h4>
                <div className="si-safety-card-checks">
                    <div><span>01</span><p>AI 관찰과 점검자 진술을 대조합니다.</p></div>
                    <div><span>02</span><p>전문가 검토를 {reviewSaved?'저장했습니다.':'저장해야 합니다.'}</p></div>
                    <div><span>03</span><p>필요한 조치를 등록하고 개선 후 사진을 재점검합니다.</p></div>
                </div>
                <div className="si-safety-card-cta">
                    {onComposeCard&&<button type="button" onClick={onComposeCard} disabled={disabled}>사진·조치 전달 카드 만들기</button>}
                    {onCopy&&<button type="button" className="is-secondary" onClick={onCopy} disabled={disabled}>{copyDone?'결과 복사 완료':'결과 내용 복사'}</button>}
                    {onSeeDetails&&<button type="button" className="is-secondary" onClick={onSeeDetails}>상세 점검·보고서 단계로 이동</button>}
                </div>
                <p className="si-safety-card-disclaimer">전달 이미지는 별도 가공본입니다. 원본·검토·보고서의 저장 상태는 아래에서 확인하세요.</p>
            </div>}
            <footer className="si-safety-card-foot"><span>FIELD RECORD / {photoId?photoId.slice(0,8).toUpperCase():'UNLINKED'}</span><span>{PANELS.find(v=>v.id===panel)?.title} · {guideCount(PANELS.findIndex(v=>v.id===panel)+1)}/{guideCount(PANELS.length)}</span></footer>
        </article>
        <div className="si-safety-deck-bottom"><p id={id+'-notice'}>시각화 카드 · 검토용 AI 제안입니다. 상세 근거와 최종 조치 기록은 아래에서 확인할 수 있습니다.</p><button type="button" onClick={onSeeDetails} disabled={!onSeeDetails}>전체 점검 내용 보기</button></div>
    </section>;
}
