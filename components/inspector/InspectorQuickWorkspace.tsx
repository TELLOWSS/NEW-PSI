import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {postAdminJson} from '../../utils/adminApiClient';
import {createInspectorAnalysisClient} from '../../lib/inspector/analysisClient';
import {optimizePhoto,pastedPhotos} from '../../lib/inspector/photoAssets';
import {LEGAL_CARDS,legalForText,sanctionText,type LegalReference} from '../../lib/inspector/legal';
import type {Evidence,Inspection,InspectionReport,OptimizationReceipt} from '../../lib/inspector/types';
import InspectorCameraDialog from './InspectorCameraDialog';
import InspectorLegalResult from './InspectorLegalResult';
import InspectorAnswer from './InspectorAnswer';
import InspectorReport from './InspectorReport';

const request=(body:unknown,timeoutMs=9000)=>postAdminJson<any>('/api/admin/inspector',body,{fallbackMessage:'점검 요청을 처리하지 못했습니다.',timeoutMs});
const base64=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('사진을 읽지 못했습니다.'));reader.readAsDataURL(file);});
type LocalPhoto={file:File;receipt:OptimizationReceipt;id:string};
export default function InspectorQuickWorkspace({onAdvanced}:{onAdvanced:()=>void}) {
    const [local,setLocal]=useState<LocalPhoto|null>(null),[preview,setPreview]=useState(''),[note,setNote]=useState('');
    const [item,setItem]=useState<Inspection|null>(null),[photo,setPhoto]=useState<Evidence|null>(null);
    const [apiEnabled,setApiEnabled]=useState(true),[ready,setReady]=useState<boolean|null>(null),[camera,setCamera]=useState(false);
    const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[activity,setActivity]=useState(''),[error,setError]=useState('');
    const [reference,setReference]=useState<LegalReference|null>(null),[showBasics,setShowBasics]=useState(false),[resultNote,setResultNote]=useState('');
    const [connection,setConnection]=useState({provider:'',model:''}),[editInput,setEditInput]=useState(false),[resultKey,setResultKey]=useState(0);
    const [analyzedResult,setAnalyzedResult]=useState(false),[analysisFailed,setAnalysisFailed]=useState(false);
    const [analyzePhoto]=useState(()=>createInspectorAnalysisClient());
    const [report,setReport]=useState<InspectionReport|null>(null),[copied,setCopied]=useState(false);
    const inflight=useRef(false),alive=useRef(true),createId=useRef(crypto.randomUUID()),latest=useRef<Inspection|null>(null),uploaded=useRef<Evidence|null>(null),noteRef=useRef<HTMLTextAreaElement>(null),resultRef=useRef<HTMLElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
    const analysis=analyzedResult&&item&&photo?item.document.analyses[photo.id]:null;
    useEffect(()=>{alive.current=true;void request({op:'ai-status'}).then(r=>{if(alive.current){setReady(r.ready);setConnection({provider:r.provider,model:r.model});}}).catch(()=>{if(alive.current)setReady(false);});return()=>{alive.current=false;};},[]);
    useEffect(()=>{if(!local){setPreview('');return;}const url=URL.createObjectURL(local.file);setPreview(url);return()=>URL.revokeObjectURL(url);},[local]);
    useEffect(()=>{if(reference)resultRef.current?.focus({preventScroll:true});},[reference]);
    useEffect(()=>{if(error){errorRef.current?.focus({preventScroll:true});errorRef.current?.scrollIntoView({block:'center',behavior:'smooth'});}},[error]);
    useEffect(()=>{if(!local||report)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[local,report]);
    const run=async(work:()=>Promise<void>)=>{if(inflight.current)return;inflight.current=true;setBusy(true);setError('');try{await work();}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'다시 시도해 주세요.');}finally{inflight.current=false;if(alive.current){setBusy(false);setActivity('');}}};
    const accept=(next:Inspection)=>{latest.current=next;if(alive.current)setItem(next);return next;};
    const choose=(file:File)=>void run(async()=>{if(photo)throw new Error('현재 결과를 확인하고 ‘다음 사진’을 눌러 주세요.');setActivity('기기에서 사진 최적화 중');const optimized=await optimizePhoto(file);if(!alive.current)return;setLocal({...optimized,id:crypto.randomUUID()});setReference(null);setReport(null);setResultNote('');requestAnimationFrame(()=>noteRef.current?.focus());});
    const savePhoto=async()=>{
        if(!local)throw new Error('먼저 사진을 찍거나 선택해 주세요.');
        if(!consent)throw new Error('사진 보관·외부 분석 안내를 확인해 주세요.');
        let current=latest.current;
        if(!current){setActivity('점검 기록 준비 중');current=accept((await request({op:'create',id:createId.current})).item);}
        let registered=uploaded.current;
        if(!registered&&current.document.photoIds.length>=20)throw new Error('한 점검에는 20장까지 보관할 수 있습니다. 현재 보고서를 저장한 뒤 상세 관리에서 새 점검을 시작해 주세요.');
        if(!registered){setActivity('최적화 사본 보관 중');registered=(await request({op:'upload',id:current.id,photoId:local.id,base64:await base64(local.file),optimizationReceipt:local.receipt,uploadConfirmed:true})).photo;uploaded.current=registered;if(alive.current)setPhoto(registered);}
        const old=current.document,changed=(old.photoNotes?.[registered.id]||'')!==note;
        const analyses={...old.analyses},reviews={...old.reviews},answers={...old.confirmationAnswers};
        if(changed){delete analyses[registered.id];delete reviews[registered.id];delete answers[registered.id];}
        const contextChanged=changed||!old.photoIds.includes(registered.id)||!!old.apiEnabled!==apiEnabled;
        const document={...old,title:old.title==='새 현장점검'?'사진 현장점검':old.title,photoIds:[...new Set([...old.photoIds,registered.id])],photoNotes:{...old.photoNotes,[registered.id]:note},apiEnabled,analyses,reviews,confirmationAnswers:answers,materialCompletion:contextChanged?undefined:old.materialCompletion};
        if(JSON.stringify(document)!==JSON.stringify(old))current=accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document})).item);
        return {current,registered};
    };
    const showResult=(current:Inspection,registered:Evidence,useAnalysis=true)=>{
        const a=useAnalysis?current.document.analyses[registered.id]:null;
        const signal=[note,...(a?.observed_facts.map(x=>x.text)||[]),...(a?.law_candidate_keywords||[])].join('\n');
        setEditInput(false);setResultKey(k=>k+1);setAnalyzedResult(!!a);setReference(legalForText(signal,current.document.eventAt));setResultNote(note);setReport(null);
        requestAnimationFrame(()=>resultRef.current?.scrollIntoView({block:'start',behavior:'smooth'}));
    };
    const analyze=()=>void run(async()=>{
        setAnalysisFailed(false);
        const {current,registered}=await savePhoto();
        if(!alive.current)return;
        if(!apiEnabled||ready!==true){showResult(current,registered);return;}
        setActivity('사진 분석 중 · 법령과 조치 함께 준비');
        // Only this explicit user action calls a paid provider. Uploading and topic lookup never do.
        try{
            const next=accept((await analyzePhoto({id:current.id,photoId:registered.id,expectedRevision:current.revision})).item);
            if(alive.current)showResult(next,registered);
        }catch(cause){
            if(alive.current){setAnalysisFailed(true);showResult(current,registered,false);}
            throw cause;
        }
    });
    const lookup=()=>{if(!note.trim()){setError('상황을 짧게 적거나 아래 주제를 선택해 주세요.');noteRef.current?.focus();return;}setError('');setEditInput(false);setResultKey(k=>k+1);setAnalyzedResult(false);setReference(legalForText(note));setResultNote(note);setReport(null);};
    const confirmCurrent=async()=>{let current=latest.current;const registered=uploaded.current;if(!current||!registered)throw new Error('사진 결과를 먼저 저장해 주세요.');if(current.document.analyses[registered.id]&&current.document.reviews[registered.id]?.decision!=='accepted')current=accept((await request({op:'confirm-photo',id:current.id,photoId:registered.id,expectedRevision:current.revision})).item);return current;};
    const nextPhoto=()=>void run(async()=>{if(photo){await savePhoto();await confirmCurrent();}setEditInput(false);setLocal(null);setPhoto(null);uploaded.current=null;setNote('');setReference(null);setReport(null);setResultNote('');window.scrollTo({top:0,behavior:'smooth'});});
    const finish=()=>void run(async()=>{
        if(resultNote!==note)throw new Error('설명이 바뀌었습니다. 결과를 다시 확인해 주세요.');
        const saved=await savePhoto();showResult(saved.current,saved.registered);
        let current=await confirmCurrent();
        // A fully AI-reviewed set uses the existing completion gate; explanation-only material is explicitly unanalysed.
        if(current.document.photoIds.every(id=>current.document.analyses[id]&&current.document.reviews[id]?.decision==='accepted')&&!current.document.materialCompletion)current=accept((await request({op:'complete-materials',id:current.id,expectedRevision:current.revision})).item);
        setActivity('사진·법령·금액을 보고서에 고정 중');
        const r=await request({op:'report',id:current.id,expectedRevision:current.revision});if(alive.current){setReport(r.report);requestAnimationFrame(()=>document.querySelector('.si-report')?.scrollIntoView({block:'start',behavior:'smooth'}));}
    });
    const toggleApi=()=>void run(async()=>{const enabled=!apiEnabled;const current=latest.current;if(current)accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document:{...current.document,apiEnabled:enabled,materialCompletion:undefined}})).item);setApiEnabled(enabled);});
    const brief=()=>[resultNote,...(analysis?.risk_findings?.flatMap(f=>[`문제 제안: ${f.problem}`,`가능 위험: ${f.risk}`,`우선 조치: ${f.action}`])||[]),...(analysis?.observed_facts.map(f=>`관찰 제안: ${f.text}`)||[]),...(analysis?.recommended_controls.map(c=>`조치 제안: ${c.action}`)||[]),...((reference?.cards||[]).flatMap(card=>[card.title,...card.actions,...card.duties.map(d=>`${d.label}: ${d.summary}\n${d.url}`),...card.sanctions.map(s=>`${s.actor}: ${sanctionText(s)} / 조건: ${s.condition} / 근거: ${s.basis}\n${s.url}`)])),...((reference?.inspectionCases||[]).flatMap(c=>[`공개 감독사례: ${c.title} (${c.publishedAt})`,c.finding,c.response,c.url])),`공식 원문 대조: ${reference?.reviewedAt} · 금액은 법정상한 · 실제 위반·부과액 확정 아님`].join('\n');
    return <div className="si-workspace si-quick" onPaste={e=>{if(busy||photo)return;const files=pastedPhotos(e.clipboardData);if(files.length){e.preventDefault();choose(files[0]);}}}>
        <header className="si-quick-heading"><div><p className="si-eyebrow">NEW-PSI · 현장 사진점검</p><h1>사진 한 장, 필요한 답을 한눈에</h1><p>위험요인 · 바로 할 조치 · 법령 요지 · 벌금·과태료</p></div><button className="si-btn" disabled={busy} onClick={()=>{if(!local||report||window.confirm('상세 관리로 이동합니다. 저장 전 사진·설명은 이 화면을 닫으면 사라집니다. 이동할까요?'))onAdvanced();}}>저장 기록 · 상세 관리</button></header>
        {reference&&<div className="si-input-recap">{preview&&<img src={preview} alt="점검 사진 미리보기"/>}<div><b>{analysis?'사진 분석 결과 준비됨':'설명으로 기준 조회됨'}</b><p>{resultNote||'사진 관찰 기준'}</p></div><button className="si-btn" disabled={busy} aria-expanded={editInput} aria-controls="si-quick-input" onClick={()=>setEditInput(v=>!v)}>{editInput?'입력 접기':'사진·설명 수정'}</button></div>}
        <section id="si-quick-input" hidden={!!reference&&!editInput} className="si-quick-input" aria-label="사진과 설명 입력">
            <div className="si-quick-photo">{preview?<><img src={preview} alt="분석할 현장사진"/>{!photo&&<button className="si-btn" disabled={busy} onClick={()=>{setLocal(null);setReference(null);}}>다른 사진 선택</button>}</>:<><div className="si-quick-camera-mark" aria-hidden="true">＋</div><h2>사진을 찍거나 가져오세요</h2><p>PC에서는 사진을 복사한 뒤 Ctrl+V로 붙여넣을 수 있습니다.</p><div className="si-quick-buttons"><button className="si-btn si-primary" disabled={busy} onClick={()=>setCamera(true)}>카메라로 바로 촬영</button><label className="si-btn">사진 선택<input aria-label="현장사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose(file);}}/></label></div></>}</div>
            <div className="si-quick-context"><label htmlFor="si-quick-note"><b>어떤 상황인가요?</b> <span>(짧게, 선택)</span></label><textarea ref={noteRef} id="si-quick-note" maxLength={4000} value={note} disabled={busy} placeholder="예: 3층 바닥 개구부에 덮개가 없고 작업자가 이동 중" onChange={e=>{setNote(e.target.value);setCopied(false);}}/>
                <div className="si-quick-api"><button type="button" className="si-btn" role="switch" aria-checked={apiEnabled} disabled={busy} onClick={toggleApi}>사진 AI 분석 {apiEnabled?'ON':'OFF'}</button><span>{ready===null?'연결 확인 중':ready?`${connection.provider==='gemini'?'Gemini':connection.provider==='openai'?'OpenAI':connection.provider} · ${connection.model} · 실행 시 API 사용료`:'API 연결 없음 · 설명으로 기준 조회 가능'}</span>{ready===false&&<button className="si-btn" disabled={busy} onClick={()=>void run(async()=>{const r=await request({op:'ai-status'});setReady(r.ready);setConnection({provider:r.provider,model:r.model});})}>연결 다시 확인</button>}</div><details className="si-api-explanation"><summary>API 연결은 어떻게 되나요?</summary><p>이 화면 → PSI 서버의 사진점검 API → 표시된 AI 공급자로 최적화 사진과 설명을 전송합니다. 서버에 설정된 키를 사용하며 다른 기능과 키·청구 계정을 공유할 수 있습니다. ChatGPT 구독과 별도이며, PSI 점수·SMART TBM으로 자동 전달하지 않습니다. 연결 표시는 설정 존재 여부이며 실제 요청 성공을 보장하지 않습니다. OFF이면 외부 AI 분석을 요청하지 않습니다.</p></details>
                <label className="si-quick-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>사진 보관을 허용합니다. AI ON이면 분석 실행 시 외부 AI로 전송되며, 불필요한 얼굴·명찰 등은 처리했습니다.</label>
                <button className="si-btn si-primary si-quick-start" disabled={busy||!local||!consent||ready===null} onClick={analyze}>{busy?activity||'처리 중…':apiEnabled&&ready?'사진 분석 · 법령·금액 보기':'사진 저장 · 설명으로 법령·금액 보기'}</button>
                <button className="si-btn si-quick-text" disabled={busy} onClick={lookup}>사진 저장 없이 설명으로 기준 바로 보기</button>
                <p className="si-caption">{local?`기기에서 최적화 완료: ${(local.receipt.source_bytes/1048576).toFixed(2)}MB → ${(local.receipt.uploaded_bytes/1048576).toFixed(2)}MB · ${local.receipt.uploaded_width}×${local.receipt.uploaded_height}px. `:''}기기 원본은 바꾸지 않습니다. 보관·삭제는 ‘저장 기록 · 상세 관리’에서 확인할 수 있습니다.</p>
            </div>
        </section>
        {error&&<div className="si-quick-error"><p ref={errorRef} className="si-notice si-error" role="alert" tabIndex={-1}>{error}</p>{analysisFailed&&local&&photo&&apiEnabled&&ready&&<button className="si-btn" disabled={busy} onClick={analyze}>사진 분석 다시 시도</button>}</div>}{busy&&<p role="status" aria-live="polite">{activity||'처리 중…'}</p>}
        {!reference&&<section className="si-quick-topics"><p>사진이 없어도 필요한 기준을 바로 볼 수 있습니다.</p><div>{LEGAL_CARDS.map(card=><button className="si-btn" key={card.id} disabled={busy} onClick={()=>{const text=card.keywords[0];setNote(text);setResultNote(text);setEditInput(false);setResultKey(k=>k+1);setAnalyzedResult(false);setReference(legalForText(text));setReport(null);}}>{card.title}</button>)}</div></section>}
        {reference&&<section ref={resultRef} tabIndex={-1} className="si-quick-result" aria-label="사진점검 결과">
            <div className="si-section-heading"><div><p className="si-eyebrow">한눈에 보는 점검 결과</p><h2>{analysis&&resultNote===note?'사진 분석과 관련 기준':'설명에 관련된 조치와 기준'}</h2></div><button className="si-btn" disabled={busy} onClick={()=>void navigator.clipboard.writeText(brief()).then(()=>setCopied(true)).catch(()=>setError('복사하지 못했습니다. 화면 내용을 선택해 주세요.'))}>{copied?'결과 복사 완료':'결과 복사'}</button></div>
            <p className="si-caption">{analysis&&resultNote===note?'AI 관찰·위험 해석은 현장 사진과 대조하세요.':'사진을 AI로 판독한 결과가 아닙니다. 입력 설명·선택 주제로 찾은 관련 기준입니다.'}</p>
            {resultNote!==note&&<p className="si-notice">설명이 변경되었습니다. 분석 또는 기준 조회를 다시 실행해 주세요.</p>}
            <InspectorAnswer key={resultKey} analysis={analysis&&resultNote===note?analysis:null} reference={reference} note={resultNote}/>

        </section>}
        <details className="si-quick-basics" open={showBasics} onToggle={e=>setShowBasics(e.currentTarget.open)}><summary>현장 필수 법령 요지 · 금액 전체 보기 ({LEGAL_CARDS.length}개 주제)</summary>{showBasics&&<InspectorLegalResult reference={{...legalForText(''),cards:LEGAL_CARDS}}/>}</details>
        {report&&<><div className="si-quick-print"><button className="si-btn si-primary" onClick={()=>window.print()}>보고서 인쇄 · PDF 저장</button><button className="si-btn" disabled={busy} onClick={()=>{latest.current=null;uploaded.current=null;createId.current=crypto.randomUUID();setItem(null);setPhoto(null);setLocal(null);setNote('');setReference(null);setReport(null);setConsent(false);setResultNote('');setError('');window.scrollTo({top:0,behavior:'smooth'});}}>새 점검 시작</button><p>사진·조치·법령 요지·조건별 금액을 포함한 검토용 보고서입니다.</p></div><InspectorReport report={report}/></>}
        {reference&&local&&photo&&!report&&!editInput&&createPortal(<div className="si-workspace si-dock-scope si-quick-dock"><div className="si-quick-finish" aria-label="결과 확인과 저장"><p>{busy?activity||'처리 중…':`${item?.document.photoIds.length||0}장 등록 · 결과 확인 후 저장`}</p><button className="si-btn" disabled={busy||resultNote!==note} onClick={nextPhoto}>확인하고 다음 사진</button><button className="si-btn si-primary" disabled={busy||resultNote!==note} onClick={finish}>확인 · 보고서 저장</button></div></div>,document.body)}
        {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setCamera(false);choose(file);}}/>}
    </div>;
}
