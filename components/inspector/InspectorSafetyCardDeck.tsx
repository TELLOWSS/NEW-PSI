import React,{useEffect,useId,useRef,useState} from 'react';
import {sourceReviewState} from '../../lib/inspector/sourceReview';
import type {VisionImport} from '../../lib/inspector/types';
import type {LegalReference} from '../../lib/inspector/legal';
import type {ExpertReview} from '../../lib/inspector/expertReview';
import {InspectorIcon,type InspectorIconName} from './InspectorGraphics';
import './inspector-safety-cards.css';

type DeckPanel='risk'|'action'|'evidence'|'reference'|'handoff';
const PANELS:{id:DeckPanel;title:string;short:string;icon:InspectorIconName;subtitle:string}[]=[
    {id:'risk',title:'위험 요약',short:'위험',icon:'alert',subtitle:'위험의 핵심'},
    {id:'action',title:'조치 제안',short:'조치',icon:'check',subtitle:'현장 실천'},
    {id:'evidence',title:'현장 대조',short:'확인',icon:'search',subtitle:'사실과 판단'},
    {id:'reference',title:'법령·사례',short:'근거',icon:'document',subtitle:'검토할 자료'},
    {id:'handoff',title:'보고·공유',short:'전달',icon:'upload',subtitle:'업무 연결'}
];
const PRIORITY={immediate:'우선 통제 검토',soon:'빠른 개선 검토',routine:'관리 상태 확인'} as const;
const confidence={high:'높음',medium:'중간',low:'낮음'} as const;
const withHttps=(url:string|undefined)=>url&&/^https:\/\/[^\s]+$/i.test(url)?url:null;
const valueOr=(text:string|undefined,otherwise:string)=>text?.trim()||otherwise;
const guideCount=(value:number)=>String(value).padStart(2,'0');

type Props={
    analysis:VisionImport;reference:LegalReference;review?:ExpertReview;reviewSaved:boolean;
    photoUrl?:string;note:string;photoId?:string;selectedFinding:number;
    onFindingChange:(value:number)=>void;onComposeCard?:()=>void;onDraftAction?:()=>void;
    onSeePhoto?:()=>void;onSeeDetails?:()=>void;
    onCopy?:()=>void;copyDone?:boolean;disabled?:boolean;
};

/** Presentation-only: no API calls, auto-grading, edited evidence, or changes to stored records. */
export default function InspectorSafetyCardDeck({
    analysis,reference,review,reviewSaved,photoUrl,note,photoId,selectedFinding,
    onFindingChange,onComposeCard,onDraftAction,onSeePhoto,onSeeDetails,onCopy,copyDone=false,disabled=false
}:Props){
    const [panel,setPanel]=useState<DeckPanel>('risk'),id=useId();
    const [expanded,setExpanded]=useState(false);
    const [largeText,setLargeText]=useState(()=>{try{return sessionStorage.getItem('psi.inspector.cards.large-text.v1')==='on';}catch{return false;}});
    const toggleText=()=>setLargeText(was=>{const next=!was;try{sessionStorage.setItem('psi.inspector.cards.large-text.v1',next?'on':'off');}catch{}return next;});
    const cardRef=useRef<HTMLElement>(null),deckRootRef=useRef<HTMLElement>(null),exportInFlight=useRef(false);
    const [exporting,setExporting]=useState(false),[exportMessage,setExportMessage]=useState('');
    const shareOrDownloadCard=async()=>{
      if(exportInFlight.current||!cardRef.current)return;
      exportInFlight.current=true;setExporting(true);setExportMessage('');
      try{
        // Prevent a card claiming to include evidence when the preview cannot be decoded.
        // The photo URL is displayed as supplied; it is never rewritten or painted on the source file.
        if(photoUrl){
          const images=Array.from(cardRef.current.querySelectorAll('img')) as HTMLImageElement[];
          if(!images.length)throw new Error('Missing inspection preview');
          await Promise.all(images.map(async (image:HTMLImageElement)=>{
            if(!image.complete||image.naturalWidth===0)await image.decode();
            if(image.naturalWidth===0)throw new Error('Inspection preview failed to load');
          }));
        }
        // Measure a separate export layout after removing controls. Measuring the
        // live card first leaves large empty areas in PNGs when controls are filtered.
        const width=cardRef.current.getBoundingClientRect().width;
        if(!width||!deckRootRef.current)throw new Error('Card layout unavailable');
        const stage=document.createElement('div');
        stage.setAttribute('aria-hidden','true');stage.dataset.psiCardExportStage='true';
        stage.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-1';
        if(cardRef.current.closest('.dark'))stage.classList.add('dark');
        const deck=document.createElement('div');
        deck.className=deckRootRef.current.className;
        deck.style.width=width+'px';
        const card=cardRef.current.cloneNode(true) as HTMLElement;
        card.classList.remove('si-safety-card-compact');
        card.querySelectorAll('[data-card-exclude="true"]').forEach(node=>node.remove());
        card.style.animation='none';
        deck.appendChild(card);stage.appendChild(deck);document.body.appendChild(stage);
        let blob:Blob|null=null;
        try{
          const images=Array.from(card.querySelectorAll('img')) as HTMLImageElement[];
          await Promise.all(images.map(async image=>{
            if(!image.complete||image.naturalWidth===0)await image.decode();
            if(!image.naturalWidth)throw new Error('Export photo failed to load');
          }));
          const rect=card.getBoundingClientRect();
          const pixelRatio=Math.max(1,Math.min(2,Math.sqrt(14000000/Math.max(1,rect.width*rect.height))));
          const {toBlob}=await import('html-to-image');
          const isDark=panel==='risk'||panel==='evidence';
          blob=await toBlob(card,{backgroundColor:isDark?'#102c37':'#f8fbf9',pixelRatio,cacheBust:false});
        }finally{stage.remove();}
        if(!blob)throw new Error('Card export failed');
        const file=new File([blob],`PSI_SAFETY_${panel.toUpperCase()}_${(photoId||'field').replace(/[^A-Za-z0-9_-]/g,'').slice(0,12)}.png`,{type:'image/png'});
        if(navigator.share&&navigator.canShare?.({files:[file]})){
          try{await navigator.share({files:[file],text:'PSI 안전점검 카드 · AI 제안 및 현장 확인이 필요한 자료입니다.'});setExportMessage('기기 공유창에서 선택을 마쳤습니다. 상대방에게 전달되었는지는 공유한 앱에서 확인해 주세요.');}
          catch(error){if((error as Error)?.name==='AbortError')setExportMessage('카드 공유를 취소했습니다.');else throw error;}
        }else{
          const url=URL.createObjectURL(blob);
          try{const a=document.createElement('a');a.href=url;a.download=file.name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setExportMessage('현재 카드 PNG 저장을 요청했습니다. 기기 다운로드 위치를 확인하세요.');}
          finally{window.setTimeout(()=>URL.revokeObjectURL(url),60000);}
        }
      }catch{setExportMessage('카드 이미지 생성에 실패했습니다. 사진 권한·저장공간을 확인하거나 기존 전달 카드 기능을 이용해 주세요.');}
      finally{exportInFlight.current=false;setExporting(false);}
    };
    const findings=analysis.risk_findings||[];
    const index=Math.min(Math.max(0,selectedFinding),Math.max(0,findings.length-1));
    const finding=findings[index];
    const observed=analysis.observed_facts||[];
    const observation=finding?observed[Number(finding.observation_index)]:observed[0];
    const rejected=review?.decision==='rejected';
    const priority=finding?.priority||'routine';
    const reviewLabel=rejected?'AI 해석 미수용':reviewSaved?'전문가 검토 저장':'전문가 검토 저장 전';
    const sourceCount=reference.cards.length;
    useEffect(()=>{setPanel('risk');setExportMessage('');},[analysis.photo_id]);
    useEffect(()=>{setExportMessage('');},[panel,index]);
    const displayedTitle=rejected?'전문가 의견을 우선 확인하세요':valueOr(finding?.problem,observed.length?'사진 관찰 내용을 대조하세요':'구체적 위험 특정 전');
    const key=panel+'-'+index;
    const longTexts=panel==='risk'?[displayedTitle,finding?.risk,observation?.text,analysis.requires_confirmation[0]?.question,finding?.action]:
      panel==='action'?[finding?.action,review?.note,...analysis.recommended_controls.slice(0,3).map(c=>c.action)]:
      panel==='evidence'?[note,...observed.slice(0,3).map(o=>o.text),...analysis.ai_hypotheses.slice(0,2).map(h=>h.text),...analysis.requires_confirmation.slice(0,2).map(q=>q.question),...analysis.limitations.slice(0,1)]:[];
    const hasLongText=longTexts.some(value=>typeof value==='string'&&value.length>120);
    useEffect(()=>{setExpanded(false);},[panel,index,analysis.photo_id]);
    const currentPanel=PANELS.find(v=>v.id===panel)!;
    const panelIndex=PANELS.findIndex(v=>v.id===panel);
    const goPanel=(offset:number)=>{
      const next=PANELS[panelIndex+offset];
      if(!next)return;
      setPanel(next.id);
      // A long finding can leave the reader below the next shorter card.
      // Return to its heading after explicit Previous/Next interaction.
      requestAnimationFrame(()=>deckRootRef.current?.scrollIntoView({
        block:'start',
        behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'
      }));
    };
    // All exported cards retain a visible evidence-photo reference when provided.
    // This is a non-annotated preview, not AI-detected evidence.
    const photoStrip=photoUrl&&<div className="si-safety-card-photo-strip">
       <img src={photoUrl} alt="해당 점검의 사진 미리보기, 위험 위치 표시 없음" loading="eager"/>
       <div><span>FIELD PHOTO · PREVIEW</span><strong>이 사진을 기준으로 작성한 점검 카드</strong><small>점검에 사용한 사진 미리보기입니다. 위험 위치를 자동 판정하지 않습니다.</small></div>
       {onSeePhoto&&<button type="button" data-card-exclude="true" onClick={onSeePhoto} aria-label="점검 사진 확대"><InspectorIcon name="expand"/></button>}
    </div>;
    return <section ref={deckRootRef} className={'si-safety-deck'+(largeText?' si-safety-deck-large':'')} aria-label="PSI 안전 분석 카드" data-psi-safety-deck="v1">
        <header className="si-safety-deck-heading">
            <div><span className="si-safety-deck-kicker">PSI INSPECTOR · SAFETY CARDS</span><h3>한 장씩 읽는 안전점검</h3><p>위험 제안부터 조치·근거·전달까지 필요한 내용만 확인합니다.</p></div>
            <span className="si-safety-deck-index" aria-hidden="true">{guideCount(PANELS.findIndex(v=>v.id===panel)+1)} <span>/ {guideCount(PANELS.length)}</span></span>
        </header>
        <div className="si-safety-deck-tools"><div className="si-safety-deck-progress" role="progressbar" aria-label="안전카드 읽기 진행" aria-valuemin={1} aria-valuemax={PANELS.length} aria-valuenow={panelIndex+1}><span style={{width:((panelIndex+1)/PANELS.length)*100+'%'}}/></div><button type="button" className="si-safety-deck-text-toggle" aria-pressed={largeText} onClick={toggleText}>{largeText?'기본 글씨':'가독성 크게'}</button></div>
        <nav className="si-safety-deck-nav" aria-label="안전카드 종류">
            {PANELS.map((v,n)=><button key={v.id} type="button" className={panel===v.id?'is-active':''} aria-current={panel===v.id?'page':undefined} aria-label={v.title} onClick={()=>setPanel(v.id)}><span className="si-safety-deck-nav-ornament" aria-hidden="true"><InspectorIcon name={v.icon}/></span><span className="si-safety-deck-nav-copy"><strong>{v.short}</strong><small>{v.subtitle}</small></span><span className="si-safety-deck-nav-number" aria-hidden="true">{guideCount(n+1)}</span></button>)}
        </nav>
        <article ref={cardRef} key={key} className={'si-safety-card si-safety-card-'+panel+(rejected?' is-rejected':'')+(hasLongText&&!expanded?' si-safety-card-compact':'')} data-panel={panel} data-priority={finding?.priority||'unclassified'} aria-label={currentPanel.title}>
            <div className="si-safety-card-bar">
                <span className="si-safety-card-mark" aria-hidden="true">PSI / FIELD INTELLIGENCE</span>
                <span className="si-safety-card-phase"><span className="si-safety-card-phase-pip" aria-hidden="true"/>{panel==='risk'?'RISK SIGNAL':panel==='action'?'ACTION PATH':panel==='evidence'?'EVIDENCE REVIEW':panel==='reference'?'SOURCE TRACE':'FIELD HANDOFF'}</span>
            </div>
            {panel==='risk'&&<>
                <div className="si-safety-card-title">
                    <div className="si-safety-card-status">{rejected?'원래 AI 제안 · 미수용':finding?'AI 위험 단서 · 현장 판단 필요':'AI 관찰 제안 · 현장 판단 필요'}</div>
                    <h4>{displayedTitle}</h4>
                    <p>{rejected?valueOr(review?.note,'전문가가 AI 해석을 수용하지 않았습니다. 원래 제안을 검토 자료로만 참고하세요.'):finding?valueOr(finding.risk,'구체적인 위험은 현장 확인이 필요합니다.'):valueOr(observation?.text,'사진만으로 구체적인 위험을 좁히지 못했습니다.')}</p>
                </div>
                <div className={'si-safety-card-media'+(photoUrl?' has-photo':'')}>
                    {photoUrl?<img src={photoUrl} alt="점검 사진 원본 또는 보관된 점검용 사진 미리보기 · 카드 효과가 적용되지 않은 사진" loading="lazy"/>:<div className="si-safety-card-no-photo">사진 미리보기 없음</div>}
                </div>
                <div className="si-safety-card-photo-caption">
                    <p className="si-safety-card-photo-hint">점검용 사진 미리보기 · 원본 저장 여부는 점검 기록에서 확인</p>
                    {photoUrl&&onSeePhoto&&<button type="button" className="si-safety-card-zoom" data-card-exclude="true" onClick={onSeePhoto}>사진 크게 확인</button>}
                </div>
                <div className="si-safety-card-essential" aria-label="점검 카드 핵심 3항목">
                    <div><span>01 · 사진 관찰 제안</span><p>{valueOr(observation?.text,'사진에서 확인할 사실을 현장에서 대조하세요.')}</p></div>
                    <div><span>02 · 추가 현장 확인</span><p>{analysis.requires_confirmation[0]?.question||'사진 바깥의 방호·작업 상황은 현장에서 확인해야 합니다.'}</p></div>
                    <div><span>03 · 조치 참고</span><p>{rejected?'AI 제안은 승인된 조치가 아닙니다. 전문가 의견에 따라 현장 대조와 안전조치를 결정하세요.':valueOr(finding?.action,analysis.recommended_controls[0]?.action||'확인 결과에 따라 안전조치를 계획하세요.')}</p></div>
                </div>
                <div className="si-safety-card-risk-footer">
                    <div><span>검토 우선순위</span><strong>{rejected?'전문가 재검토':finding?PRIORITY[priority]:'추가 확인 필요'}</strong></div>
                    <div><span>현장 검토</span><strong>{reviewLabel}</strong></div>
                </div>
                {findings.length>1&&<div className="si-safety-card-finding-select" data-card-exclude="true" role="group" aria-label="위험 단서 전환">
                    {findings.map((v,n)=><button type="button" key={n} disabled={disabled} aria-pressed={n===index} onClick={()=>onFindingChange(n)}>위험 {n+1}</button>)}
                </div>}
                <button className="si-safety-card-advance" data-card-exclude="true" type="button" onClick={()=>goPanel(1)}><span>이 위험에 필요한 조치 살펴보기</span><InspectorIcon name="arrow"/></button>
                <p className="si-safety-card-disclaimer">AI 결과는 위험·법 위반 확정이나 조치 완료를 뜻하지 않습니다. 현장에서 직접 대조해 주세요.</p>
            </>}
            {panel==='action'&&<div className="si-safety-card-body">
                <p className="si-safety-card-eyebrow">PRIORITY ACTION / {finding?PRIORITY[priority]:'검토 필요'}</p>
                <h4>{rejected?'전문가 조치 의견 확인':'우선 확인할 조치'}</h4>
                {photoUrl&&<div className="si-safety-card-context"><img src={photoUrl} alt="조치 검토에 사용한 현장 사진 미리보기" loading="lazy"/><div><span>FIELD PHOTO / REVIEW</span><strong>사진을 보면서 조치 내용을 대조하세요</strong><small>카드에 위험부위가 자동 표시된 것은 아닙니다.</small></div>{onSeePhoto&&<button type="button" data-card-exclude="true" onClick={onSeePhoto} aria-label="검토 사진 크게 보기"><InspectorIcon name="expand"/></button>}</div>}
                <div className="si-safety-card-feature"><span className="si-safety-card-feature-number">01</span><p>{rejected?valueOr(review?.note,'AI 제안을 수용하지 않았습니다. 현장 담당자가 필요한 조치를 작성·확정해 주세요.'):valueOr(finding?.action,analysis.recommended_controls[0]?.action||'촬영 대상과 주변 작업 상태를 안전한 위치에서 확인해 주세요.')}</p></div>
                {!rejected&&analysis.recommended_controls.length>0&&<div className="si-safety-card-mini-list"><h5>추가 조치 제안</h5>{analysis.recommended_controls.slice(0,3).map((c,n)=><div key={n}><span>{guideCount(n+2)}</span><p>{c.action}</p></div>)}</div>}
                <p className="si-safety-card-disclaimer">실제 작업중지·접근통제 필요성, 담당자와 조치기한은 현장에서 판단해 기록해야 합니다.</p>
                {(onDraftAction||onSeeDetails)&&<div className="si-safety-card-cta" data-card-exclude="true">
                    {onDraftAction&&<button type="button" onClick={onDraftAction} disabled={disabled}>{finding?'검토 저장 · 이 위험 조치 작성':'검토 저장 · 이 사진 조치 작성'}</button>}
                    {onSeeDetails&&<button type="button" className="is-secondary" onClick={onSeeDetails} disabled={disabled}>상세 점검 내용 확인</button>}
                </div>}
                {onDraftAction&&<p className="si-safety-card-disclaimer" data-card-exclude="true">현재 사진의 검토 선택과 의견을 저장한 뒤 조치 작성 화면이 열립니다. 조치 완료는 별도 확인·저장해야 합니다.</p>}
            </div>}
            {panel==='evidence'&&<div className="si-safety-card-body">
                {photoStrip}
                <p className="si-safety-card-eyebrow">FACT / STATEMENT / INFERENCE</p>
                <h4>사진으로 확인할 사항</h4>
                {note.trim()&&<section className="si-safety-card-evidence-block"><span>점검자 진술 · AI 판독 아님</span><p>{note.trim()}</p></section>}
                {observed.length>0?<section className="si-safety-card-evidence-block"><span>AI 관찰 제안 · 현장 대조 필요</span>{observed.slice(0,3).map((o,n)=><p key={n}>{o.text} <small>판독 확신 {confidence[o.confidence]}</small></p>)}</section>:<p>사진에서 특정할 관찰 단서가 아직 없습니다.</p>}
                {analysis.ai_hypotheses.length>0&&<section className="si-safety-card-evidence-block"><span>추정 · 확인된 사실 아님</span>{analysis.ai_hypotheses.slice(0,2).map((h,n)=><p key={n}>{h.text}</p>)}</section>}
                {(analysis.requires_confirmation.length>0||analysis.limitations.length>0)&&<section className="si-safety-card-evidence-block"><span>추가 확인·판단 한계</span>{analysis.requires_confirmation.slice(0,2).map((q,n)=><p key={n}>{q.question}</p>)}{analysis.limitations.slice(0,1).map((l,n)=><p key={'limit-'+n}>{l}</p>)}</section>}
            </div>}
            {panel==='reference'&&<div className="si-safety-card-body">
                {photoStrip}
                <p className="si-safety-card-eyebrow">OFFICIAL SOURCE REVIEW</p>
                <h4>연결된 법령·사례 자료</h4>
                <p className="si-safety-card-lead">관련 자료 {sourceCount}건 · 실제 적용 조항과 사건 당시 시행본은 별도 확인해야 합니다.</p>
                {sourceCount?reference.cards.slice(0,3).map(c=>{const url=withHttps(c.duties.find(d=>withHttps(d.url))?.url);const status=sourceReviewState(c.sourceReview);return <section className="si-safety-card-source" key={c.id}><strong>{c.title}</strong><span>{status.label}</span>{url&&<a href={url} target="_blank" rel="noopener noreferrer" data-card-exclude="true">공식 근거 열기</a>}</section>}):<div className="si-safety-card-source"><strong>관련 기준이 자동 연결되지 않았습니다.</strong><span>법적 의무가 없다는 뜻이 아니므로 작업 내용과 실제 시설을 확인하세요.</span></div>}
                {(reference.inspectionCases||[]).length>0&&<div className="si-safety-card-cases"><h5>공개 감독·사고사례 참고 후보</h5><p>현재 현장의 발생 사실이나 동일 사고로 판단한 자료가 아닙니다.</p>{reference.inspectionCases!.slice(0,2).map(c=><section className="si-safety-card-source" key={c.id}><strong>{c.title}</strong><span>{c.agency} · {c.publishedAt} · {sourceReviewState(c.sourceReview).label}</span><span>{c.lesson}</span>{withHttps(c.url)&&<a href={c.url} target="_blank" rel="noopener noreferrer" data-card-exclude="true">공개 사례 원문 확인</a>}</section>)}</div>}
                <p className="si-safety-card-disclaimer">자동 연결은 법 위반 판정이 아닙니다. 벌금·과태료는 적용조건과 처분 주체에 따라 달라집니다.</p>
            </div>}
            {panel==='handoff'&&<div className="si-safety-card-body">
                {photoStrip}
                <p className="si-safety-card-eyebrow">REVIEW · ACTION · REPORT</p>
                <h4>이제 현장 판단과 전달을 연결하세요</h4>
                <div className="si-safety-card-checks">
                    <div><span>01</span><p>AI 관찰과 점검자 진술을 대조합니다.</p></div>
                    <div><span>02</span><p>전문가 검토를 {reviewSaved?'저장했습니다.':'저장해야 합니다.'}</p></div>
                    <div><span>03</span><p>필요한 조치를 등록하고 개선 후 사진을 재점검합니다.</p></div>
                </div>
                <div className="si-safety-card-cta" data-card-exclude="true">
                    {onComposeCard&&<button type="button" onClick={onComposeCard} disabled={disabled}>사진·조치 전달 카드 만들기</button>}
                    {onCopy&&<button type="button" className="is-secondary" onClick={onCopy} disabled={disabled}>{copyDone?'결과 복사 완료':'결과 내용 복사'}</button>}
                    {onSeeDetails&&<button type="button" className="is-secondary" onClick={onSeeDetails}>상세 점검·보고서 단계로 이동</button>}
                </div>
                <p className="si-safety-card-disclaimer">전달 이미지는 별도 가공본입니다. 원본·검토·보고서의 저장 상태는 점검 기록에서 확인하세요.</p>
            </div>}
            {hasLongText&&<div className="si-safety-card-expand" data-card-exclude="true"><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'내용 접기':'긴 내용 전체 보기'}</button><span>{expanded?'전체 내용을 표시 중입니다.':'긴 내용 일부를 접었습니다. 저장하는 카드에는 전체 내용이 담깁니다.'}</span></div>}
            <footer className="si-safety-card-foot"><span>FIELD RECORD / {photoId?photoId.slice(0,8).toUpperCase():'UNLINKED'}</span><span>{currentPanel.title} · {guideCount(PANELS.findIndex(v=>v.id===panel)+1)}/{guideCount(PANELS.length)}</span></footer>
        </article>
        <div className="si-safety-deck-pagination" role="group" aria-label="안전카드 페이지 넘기기">
            <button type="button" disabled={panelIndex===0} onClick={()=>goPanel(-1)} aria-label="이전 카드"><InspectorIcon name="arrow"/> 이전</button>
            <span aria-live="polite">{currentPanel.title} · {panelIndex+1}/{PANELS.length}</span>
            <button type="button" disabled={panelIndex===PANELS.length-1} onClick={()=>goPanel(1)} aria-label="다음 카드">다음 <InspectorIcon name="arrow"/></button>
        </div>
        <div className="si-safety-deck-export">
            <div><strong>현재 카드 이미지</strong><p>현재 화면의 카드 한 장을 별도 PNG로 만듭니다. 사진이 있으면 이미지에 포함됩니다. 공유 전 내용을 확인하세요.</p></div>
            <button type="button" onClick={()=>void shareOrDownloadCard()} disabled={exporting||disabled} aria-busy={exporting}><InspectorIcon name="upload"/>{exporting?'이미지 제작 중…':'카드 저장·공유'}</button>
        </div>
        <p className="si-safety-deck-export-message" role="status" aria-live="polite">{exportMessage}</p>
        <div className="si-safety-deck-bottom"><p id={id+'-notice'}>시각화 카드 · 검토용 AI 제안입니다. 상세 근거와 최종 조치 기록은 아래에서 확인할 수 있습니다.</p><button type="button" onClick={onSeeDetails} disabled={!onSeeDetails}>전체 점검 내용 보기</button></div>
    </section>;
}
