import React,{lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {postAdminJson} from '../../utils/adminApiClient';
import {createInspectorAnalysisClient} from '../../lib/inspector/analysisClient';
import {assetHash,optimizePhoto,pastedPhotos} from '../../lib/inspector/photoAssets';
import {LEGAL_CARDS,legalForText,legalForPhoto,sanctionText,type LegalReference} from '../../lib/inspector/legal';
import {reviewIsSaved,recoveredReview,photoWorkUnsaved,parseReviewPosition} from '../../lib/inspector/reviewPersistence';
import {recordResumeStatus,validResumeEntry,type RecordResumeEntry,type RecordResumeIntent} from '../../lib/inspector/recordResume';
import type {Evidence,Inspection,InspectionReport,InspectorAction,OptimizationReceipt} from '../../lib/inspector/types';
import InspectorCameraDialog from './InspectorCameraDialog';
import InspectorLegalResult from './InspectorLegalResult';
import InspectorAnswer from './InspectorAnswer';
import {InspectorIcon,InspectorScene} from './InspectorGraphics';
const InspectorReport=lazy(()=>import('./InspectorReport'));
const InspectorFieldCardDialog=lazy(()=>import('./InspectorFieldCardDialog'));
import {seedFieldCard,type FieldCardSeed} from '../../lib/inspector/fieldCard';
import InspectorPhotoDialog from './InspectorPhotoDialog';
import InspectorStorageManager from './InspectorStorageManager';
import InspectorExpertReview from './InspectorExpertReview';
import InspectorPhotoCollection from './InspectorPhotoCollection';
import InspectorReviewNavigator from './InspectorReviewNavigator';
import {pendingReviewQueue} from '../../lib/inspector/reviewQueue';
import InspectorActionPlanner from './InspectorActionPlanner';
import InspectorShareButton from './InspectorShareButton';
import {sharePhotoFile} from '../../lib/inspector/sharing';
import {duplicateAction,findingActionEntry,type FindingActionEntry} from '../../lib/inspector/actionPlan';
import {sameAction} from '../../lib/inspector/actionFollowup';
import {changeActionAssignment,recoveredAssignment,type AssignmentChange} from '../../lib/inspector/actionAssignment';
import type {ImprovementSubmission} from './InspectorActionFollowup';
import {buildActionRequest,DEFAULT_REVIEW_NOTE,type ExpertReview} from '../../lib/inspector/expertReview';

const request=(body:unknown,timeoutMs=9000)=>postAdminJson<any>('/api/admin/inspector',body,{fallbackMessage:'점검 요청을 처리하지 못했습니다.',timeoutMs});
const base64=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('사진을 읽지 못했습니다.'));reader.readAsDataURL(file);});
const LAST_INSPECTION='psi.inspector.quick.last.v1';
const REVIEW_POSITION='psi.inspector.quick.review-position.v1';
const reviewPosition=()=>{try{return parseReviewPosition(sessionStorage.getItem(REVIEW_POSITION));}catch{return null;}};
const forgetReviewPosition=(id?:string)=>{try{if(!id||reviewPosition()?.inspectionId===id)sessionStorage.removeItem(REVIEW_POSITION);}catch{}};
const lastInspection=()=>{try{const id=sessionStorage.getItem(LAST_INSPECTION)||'';return /^[a-f0-9-]{36}$/i.test(id)?id:'';}catch{return '';}};
type LocalPhoto={file:File;receipt:OptimizationReceipt;id:string};
export default function InspectorQuickWorkspace({onAdvanced,initialEntry}:{onAdvanced:()=>void;initialEntry?:RecordResumeEntry}) {
    const [entryIntent,setEntryIntent]=useState<RecordResumeIntent|null>(null),[entryNotice,setEntryNotice]=useState('');
    const [reviewNotice,setReviewNotice]=useState('');
    const [actionDraftDirty,setActionDraftDirty]=useState(false);
    const [actionEntry,setActionEntry]=useState<{photoId:string;token:string;selection?:FindingActionEntry}|null>(null);
    const [hintOpen,setHintOpen]=useState(false);
    const [selectedFinding,setSelectedFinding]=useState(0);
    const [zoomFocus,setZoomFocus]=useState('');
    const [fieldCard,setFieldCard]=useState<{photo:Blob;seed:FieldCardSeed;source:string}|null>(null);
    const [storageLocked,setStorageLocked]=useState(false),[storageBusy,setStorageBusy]=useState(false),[deletedResumeId,setDeletedResumeId]=useState('');
    const [local,setLocal]=useState<LocalPhoto|null>(null),[preview,setPreview]=useState(''),[note,setNote]=useState('');
    const [evidence,setEvidence]=useState<Evidence[]>([]),[storedPhoto,setStoredPhoto]=useState<Blob|null>(null),[resumeId,setResumeId]=useState(()=>validResumeEntry(initialEntry)?initialEntry.id:lastInspection());
    const [review,setReview]=useState<ExpertReview>({decision:'accepted',note:''}),[reportTitle,setReportTitle]=useState('사진 현장점검'),[actionCopied,setActionCopied]=useState(false),[zoom,setZoom]=useState(false);
    const [item,setItem]=useState<Inspection|null>(null),[photo,setPhoto]=useState<Evidence|null>(null);
    const [apiEnabled,setApiEnabled]=useState(true),[ready,setReady]=useState<boolean|null>(null),[camera,setCamera]=useState(false);
    const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[activity,setActivity]=useState(''),[error,setError]=useState('');
    const [reference,setReference]=useState<LegalReference|null>(null),[showBasics,setShowBasics]=useState(false),[resultNote,setResultNote]=useState('');
    const [connection,setConnection]=useState({provider:'',model:''}),[editInput,setEditInput]=useState(false),[resultKey,setResultKey]=useState(0);
    const [analyzedResult,setAnalyzedResult]=useState(false),[analysisFailed,setAnalysisFailed]=useState(false);
    const [analyzePhoto]=useState(()=>createInspectorAnalysisClient());
    const [report,setReport]=useState<InspectionReport|null>(null),[copied,setCopied]=useState(false);
    const inflight=useRef(false),alive=useRef(true),createId=useRef(crypto.randomUUID()),latest=useRef<Inspection|null>(null),uploaded=useRef<Evidence|null>(null),noteRef=useRef<HTMLTextAreaElement>(null),startRef=useRef<HTMLButtonElement>(null),resultRef=useRef<HTMLElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
    const analysis=analyzedResult&&item&&photo?item.document.analyses[photo.id]:null;
    const pendingPhoto=item?pendingReviewQueue(item.document)[0]?.id:undefined;
    const nextPending=item&&photo?pendingReviewQueue(item.document,photo.id)[0]:undefined;
    useEffect(()=>{alive.current=true;void request({op:'ai-status'}).then(r=>{if(alive.current){setReady(r.ready);setConnection({provider:r.provider,model:r.model});}}).catch(()=>{if(alive.current)setReady(false);});return()=>{alive.current=false;};},[]);
    useEffect(()=>{const file=local?.file||storedPhoto;if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[local,storedPhoto]);
    useEffect(()=>{if(reference)resultRef.current?.focus({preventScroll:true});},[reference]);
    useEffect(()=>{if(error){errorRef.current?.focus({preventScroll:true});errorRef.current?.scrollIntoView({block:'center',behavior:'smooth'});}},[error]);
    const unsavedPhoto=photoWorkUnsaved(item,photo,local?.id,note,reportTitle,review);
    useEffect(()=>{if(!unsavedPhoto)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[unsavedPhoto]);
    const run=async(work:()=>Promise<void>)=>{if(inflight.current)return;inflight.current=true;setBusy(true);setError('');try{await work();}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'다시 시도해 주세요.');}finally{inflight.current=false;if(alive.current){setBusy(false);setActivity('');}}};
    const accept=(next:Inspection)=>{latest.current=next;try{sessionStorage.setItem(LAST_INSPECTION,next.id);}catch{}if(alive.current){setItem(next);setResumeId(next.id);}return next;};
    const loadEvidencePhoto=useCallback(async(photoId:string)=>{
        const current=latest.current,registered=evidence.find(p=>p.id===photoId);if(!current||!registered)throw new Error('보관 사진을 확인해 주세요.');
        const signed=await request({op:'photo',id:current.id,photoId}),response=await fetch(signed.url,{cache:'no-store'});if(!response.ok)throw new Error('사진을 불러오지 못했습니다.');
        const blob=await response.blob();if(await assetHash(blob)!==registered.sha256)throw new Error('사진 무결성 검사 실패');return blob;
    },[evidence]);
    const choose=(file:File)=>void run(async()=>{if(photo)throw new Error('현재 결과를 확인하고 ‘다음 사진’을 눌러 주세요.');setActivity('기기에서 사진 최적화 중');const optimized=await optimizePhoto(file);if(!alive.current)return;setStoredPhoto(null);setReview({decision:'accepted',note:''});setActionCopied(false);setLocal({...optimized,id:crypto.randomUUID()});setReference(null);setReport(null);setResultNote('');setHintOpen(!!note.trim());requestAnimationFrame(()=>startRef.current?.focus({preventScroll:true}));});
    const savePhoto=async()=>{
        if(!local&&!uploaded.current)throw new Error('먼저 사진을 찍거나 선택해 주세요.');
        if(!uploaded.current&&!consent)throw new Error('사진 보관·외부 분석 안내를 확인해 주세요.');
        let current=latest.current;
        if(!current){setActivity('점검 기록 준비 중');current=accept((await request({op:'create',id:createId.current})).item);}
        let registered=uploaded.current;
        if(!registered&&current.document.photoIds.length>=20)throw new Error('한 점검에는 20장까지 보관할 수 있습니다. 현재 보고서를 저장한 뒤 상세 관리에서 새 점검을 시작해 주세요.');
        if(!registered){if(!local)throw new Error('사진을 다시 선택해 주세요.');setActivity('최적화 사본 보관 중');registered=(await request({op:'upload',id:current.id,photoId:local.id,base64:await base64(local.file),optimizationReceipt:local.receipt,uploadConfirmed:true})).photo;uploaded.current=registered;if(alive.current){setPhoto(registered);setEvidence(list=>list.some(p=>p.id===registered.id)?list:[...list,registered]);}}
        const old=current.document,changed=(old.photoNotes?.[registered.id]||'')!==note;
        const analyses={...old.analyses},reviews={...old.reviews},answers={...old.confirmationAnswers};
        if(changed){delete analyses[registered.id];delete reviews[registered.id];delete answers[registered.id];}
        const contextChanged=old.title!==(reportTitle.trim()||'사진 현장점검')||changed||!old.photoIds.includes(registered.id)||!!old.apiEnabled!==apiEnabled;
        const document={...old,title:reportTitle.trim()||'사진 현장점검',photoIds:[...new Set([...old.photoIds,registered.id])],photoNotes:{...old.photoNotes,[registered.id]:note},apiEnabled,analyses,reviews,confirmationAnswers:answers,materialCompletion:contextChanged?undefined:old.materialCompletion};
        if(JSON.stringify(document)!==JSON.stringify(old))current=accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document})).item);
        return {current,registered};
    };
    const showResult=(current:Inspection,registered:Evidence,useAnalysis=true)=>{
        setReviewNotice('');
        const a=useAnalysis?current.document.analyses[registered.id]:null;
        setEditInput(false);setSelectedFinding(0);setResultKey(k=>k+1);setAnalyzedResult(!!a);setReference(legalForPhoto(a,note,current.document.eventAt));setResultNote(note);setReport(null);
        requestAnimationFrame(()=>resultRef.current?.scrollIntoView({block:'start',behavior:'smooth'}));
    };
    const analyze=()=>void run(async()=>{
        setAnalysisFailed(false);
        if(apiEnabled&&ready===true&&!consent)throw new Error('외부 AI 분석 허용을 확인해 주세요.');
        const {current,registered}=await savePhoto();
        if(!alive.current)return;
        if(!apiEnabled||ready!==true){showResult(current,registered);return;}
        setActivity('사진 분석 중 · 법령과 조치 함께 준비');
        // Only this explicit user action calls a paid provider. Uploading and topic lookup never do.
        try{
            const next=accept((await analyzePhoto({id:current.id,photoId:registered.id,expectedRevision:current.revision})).item);
            if(alive.current){setReview({decision:'accepted',note:''});showResult(next,registered);}
        }catch(cause){
            if(alive.current){setAnalysisFailed(true);showResult(current,registered,false);}
            throw cause;
        }
    });
    const lookup=()=>{if(!note.trim()){setHintOpen(true);setError('설명 기준을 조회하려면 아는 상황만 짧게 적거나 아래 주제를 선택해 주세요. 사진 AI 분석에는 설명이 없어도 됩니다.');requestAnimationFrame(()=>noteRef.current?.focus());return;}setError('');setEditInput(false);setSelectedFinding(0);setResultKey(k=>k+1);setAnalyzedResult(false);setReference(legalForText(note));setResultNote(note);setReport(null);};
    const viewStoredResult=()=>{
        const current=latest.current,registered=uploaded.current;
        if(!current||!registered||!current.document.analyses[registered.id]||(current.document.photoNotes?.[registered.id]||'')!==note)return;
        const prior=current.document.reviews[registered.id];
        setReview({decision:prior?.decision||'accepted',note:prior?.note===DEFAULT_REVIEW_NOTE?'':prior?.note||''});setError('');setAnalysisFailed(false);showResult(current,registered);
    };
    const confirmCurrent=async()=>{
        let current=latest.current;const registered=uploaded.current;
        if(!current||!registered)throw new Error('사진 결과를 먼저 저장해 주세요.');
        if(current.document.analyses[registered.id]){
            if(!analyzedResult)throw new Error('저장된 사진 분석을 먼저 열어 확인해 주세요.');
            const note=review.note.trim();
            if((note&&note.length<5)||(review.decision==='rejected'&&note.length<5))throw new Error('현장 판단이나 AI 해석과 다른 점을 5자 이상 적어 주세요.');
            if(!reviewIsSaved(current,registered.id,review)){
                try{current=accept((await request({op:'confirm-photo',id:current.id,photoId:registered.id,expectedRevision:current.revision,decision:review.decision,reviewNote:note})).item);}
                catch(cause){
                    let readback;try{readback=await request({op:'detail',id:current.id});}catch{throw cause;}
                    if(!recoveredReview(current,readback.item,registered,readback.evidence||[],review,readback.control))throw cause;
                    current=accept(readback.item);
                }
            }
        }
        return current;
    };
    const saveReviewOnly=()=>void run(async()=>{
        if(!photo||!analysis||resultNote!==note||storageLocked)throw new Error('저장된 사진 분석과 설명을 확인한 뒤 검토를 저장해 주세요.');
        setReviewNotice('');setActivity('현재 사진의 검토 의견 저장 중');
        const current=await confirmCurrent();if(!current||!alive.current)return;
        let remembered=true;try{sessionStorage.setItem(REVIEW_POSITION,JSON.stringify({inspectionId:current.id,photoId:photo.id}));}catch{remembered=false;}
        setReviewNotice(remembered?'검토를 저장했습니다. 이 탭에서 다시 열면 같은 사진으로 이어집니다.':'검토는 서버에 저장했습니다. 이 탭의 이어보기 위치는 보관하지 못했으니 저장 기록에서 사진을 열어 주세요.');
    });
    const clearActive=()=>{forgetReviewPosition(latest.current?.id);setReviewNotice('');setEditInput(false);setHintOpen(false);setLocal(null);setStoredPhoto(null);setPhoto(null);uploaded.current=null;setNote('');setReview({decision:'accepted',note:''});setReference(null);setReport(null);setResultNote('');setAnalyzedResult(false);setAnalysisFailed(false);setActionCopied(false);};
    const nextPhoto=()=>void run(async()=>{if(photo){await savePhoto();await confirmCurrent();}forgetReviewPosition(latest.current?.id);clearActive();window.scrollTo({top:0,behavior:'smooth'});});
    const draftPhotoAction=(useSelected=false)=>{
        if(busy||!photo||resultNote!==note)return;
        if(actionDraftDirty&&!window.confirm('이 사진의 새 조치를 작성하면 저장 전 조치·개선 입력이 사라집니다. 바꿀까요?'))return;
        void run(async()=>{
            if(!latest.current||storageLocked)throw new Error('저장된 사진 점검을 다시 확인해 주세요.');
            if(latest.current.document.actions.length>=30)throw new Error('한 점검의 조치 30건을 모두 사용했습니다.');
            const {registered}=await savePhoto();const saved=await confirmCurrent();
            const selection=useSelected?findingActionEntry(saved.document,registered.id,selectedFinding):undefined;
            if(alive.current){clearActive();setActionDraftDirty(false);setActionEntry({photoId:registered.id,token:crypto.randomUUID(),selection});}
        });
    };
    const closeActionEntry=()=>{if(actionDraftDirty&&!window.confirm('이 조치 작성을 닫으면 저장 전 조치·개선 입력이 사라집니다. 사진과 저장한 검토 기록은 유지됩니다. 닫을까요?'))return;setActionEntry(null);setActionDraftDirty(false);};
    const finish=()=>void run(async()=>{
        if(actionDraftDirty)throw new Error('입력 중인 조치를 먼저 저장하거나 정리한 뒤 보고서를 작성해 주세요.');
        let current=latest.current;
        if(local||photo){
            if(resultNote!==note)throw new Error('설명이 바뀌었습니다. 결과를 다시 확인해 주세요.');
            current=(await savePhoto()).current;
            current=await confirmCurrent();
        }
        if(!current?.document.photoIds.length)throw new Error('보고서에 넣을 사진이 없습니다.');
        if(current.document.photoIds.some(id=>current.document.analyses[id]&&!current.document.reviews[id]))throw new Error('모은 사진에서 ‘검토 대기’ 사진을 열어 확인해 주세요.');
        const title=reportTitle.trim()||'사진 현장점검';
        if(current.document.title!==title)current=accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document:{...current.document,title,materialCompletion:undefined}})).item);
        if(current.document.photoIds.every(id=>current.document.analyses[id]&&current.document.reviews[id]?.decision==='accepted')&&!current.document.materialCompletion)current=accept((await request({op:'complete-materials',id:current.id,expectedRevision:current.revision})).item);
        setActivity('사진·전문가 의견·근거를 보고서에 저장 중');
        const r=await request({op:'report',id:current.id,expectedRevision:current.revision});
        if(alive.current){forgetReviewPosition(current.id);setReviewNotice('');setReport(r.report);requestAnimationFrame(()=>document.querySelector('.si-report')?.scrollIntoView({block:'start',behavior:'smooth'}));}
    });
    const restoreSavedPhoto=async(current:Inspection,registered:Evidence)=>{
        const photoId=registered.id;
        setActivity('보관 사진과 기존 결과 불러오는 중');
        const signed=await request({op:'photo',id:current.id,photoId});
        const response=await fetch(signed.url,{cache:'no-store'});if(!response.ok)throw new Error('보관 사진을 불러오지 못했습니다.');
        const blob=await response.blob();if(await assetHash(blob)!==registered.sha256)throw new Error('보관 사진의 무결성을 확인하지 못했습니다.');
        if(!alive.current)return;
        const text=current.document.photoNotes?.[photoId]||'',prior=current.document.reviews[photoId],a=current.document.analyses[photoId];
        setReviewNotice('');setLocal(null);setCopied(false);setActionCopied(false);setZoom(false);setFieldCard(null);uploaded.current=registered;setPhoto(registered);setStoredPhoto(blob);setNote(text);setHintOpen(!!text.trim());setResultNote(text);setReview({decision:prior?.decision||'accepted',note:prior?.note===DEFAULT_REVIEW_NOTE?'':prior?.note||''});setAnalyzedResult(!!a);setAnalysisFailed(false);setReport(null);setEditInput(false);setSelectedFinding(0);setResultKey(k=>k+1);setReference(legalForPhoto(a,text,current.document.eventAt));
        requestAnimationFrame(()=>resultRef.current?.scrollIntoView({block:'start',behavior:'smooth'}));
    };
    const continueReview=()=>void run(async()=>{
        if(!photo||!analysis||resultNote!==note||storageLocked||actionDraftDirty)throw new Error('현재 사진의 분석·설명과 입력 중인 조치를 확인한 뒤 이어가세요.');
        if(!latest.current||!pendingReviewQueue(latest.current.document,photo.id).length)throw new Error('다음 AI 검토 대기 사진이 없습니다.');
        setReviewNotice('');setActivity('현재 검토 저장 후 다음 사진 확인 중');
        const saved=await confirmCurrent();
        if(!alive.current)return;
        // Preserve the current saved position if fetching the next image fails.
        try{sessionStorage.setItem(REVIEW_POSITION,JSON.stringify({inspectionId:saved.id,photoId:photo.id}));}catch{}
        const target=pendingReviewQueue(saved.document,photo.id)[0];
        const registered=target&&evidence.find(p=>p.id===target.id&&p.inspection_id===saved.id);
        if(!registered)throw new Error('현재 검토는 저장했습니다. 다음 사진의 보관 정보를 확인하지 못해 현재 화면을 유지합니다.');
        try{await restoreSavedPhoto(saved,registered);}
        catch(cause){throw new Error(`현재 검토는 저장했습니다. 다음 사진을 열지 못해 현재 사진을 유지합니다. ${cause instanceof Error?cause.message:'보관 사진을 확인해 주세요.'}`);}
        if(!alive.current)return;
        let remembered=true;try{sessionStorage.setItem(REVIEW_POSITION,JSON.stringify({inspectionId:saved.id,photoId:registered.id}));}catch{remembered=false;}
        setReviewNotice(`이전 사진 검토를 저장했습니다. 사진 ${target.number}의 ${target.label}부터 확인하세요.${remembered?'':' 이어보기 위치는 보관하지 못했습니다.'}`);
        requestAnimationFrame(()=>resultRef.current?.focus({preventScroll:true}));
    });
    const openSavedPhoto=(photoId:string)=>void run(async()=>{
        const current=latest.current,registered=evidence.find(p=>p.id===photoId);
        if(!current||!registered||local||photo)throw new Error('현재 사진을 확인한 뒤 이전 사진을 열어 주세요.');
        await restoreSavedPhoto(current,registered);
    });
    const loadSaved=(id:string,intent?:RecordResumeIntent,positionPhotoId?:string)=>void run(async()=>{
        setActivity('선택한 저장 점검 불러오는 중');
        let r;try{r=await request({op:'detail',id});}catch(cause){const deleted=await request({op:'deletion-status',id});if(deleted.status?.state==='purged'&&deleted.status.verified){if(!alive.current)return;setDeletedResumeId(id);setStorageLocked(true);return;}throw cause;}
        if(!alive.current)return;accept(r.item);setStorageLocked(!!r.control&&r.control.state!=='active');setEvidence(r.evidence);setReportTitle(r.item.document.title==='새 현장점검'?'사진 현장점검':r.item.document.title);setApiEnabled(!!r.item.document.apiEnabled);setConsent(false);setEntryIntent(intent||null);setEntryNotice('');
        if(r.control&&r.control.state!=='active')return;
        if(positionPhotoId){
            const registered=r.evidence.find((p:Evidence)=>p.id===positionPhotoId);
            if(!r.item.document.photoIds.includes(positionPhotoId)||!registered){forgetReviewPosition(id);setEntryNotice('마지막 검토 사진을 현재 저장본에서 찾지 못했습니다. 다른 사진을 대신 열지 않았습니다. 저장한 목록을 확인하세요.');setEntryIntent('overview');return;}
            setEntryIntent('overview');await restoreSavedPhoto(r.item,registered);return;
        }
        if(intent==='review'){
            const next=recordResumeStatus(r.item.document).pendingPhotoId;
            if(!next){setEntryNotice('최신 저장 내용에는 검토 대기 사진이 없습니다. 저장한 사진과 조치를 아래에서 확인하세요.');return;}
            const registered=r.evidence.find((p:Evidence)=>p.id===next);
            if(!registered)throw new Error('검토할 사진의 보관 정보를 찾지 못했습니다. 저장 기록에서 보관·삭제 상태를 확인해 주세요.');
            await restoreSavedPhoto(r.item,registered);
        }
    });
    const resume=()=>{const intent=validResumeEntry(initialEntry)?initialEntry.intent:undefined,position=reviewPosition();return loadSaved(resumeId,intent,!intent&&position?.inspectionId===resumeId?position.photoId:undefined);};
    // StrictMode's discarded mount must not start a duplicate read or leave the UI busy.
    useEffect(()=>{if(!validResumeEntry(initialEntry))return;const timer=setTimeout(()=>loadSaved(initialEntry.id,initialEntry.intent),0);return()=>clearTimeout(timer);},[]);
    const startNew=()=>{if(actionDraftDirty&&!storageLocked&&!window.confirm('저장하지 않은 조치 입력이 있습니다. 정리하고 새 점검을 시작할까요?'))return;forgetReviewPosition();setDeletedResumeId('');setEntryIntent(null);setEntryNotice('');setStorageLocked(false);clearActive();setActionEntry(null);latest.current=null;createId.current=crypto.randomUUID();setItem(null);setEvidence([]);setReportTitle('사진 현장점검');setConsent(false);setResumeId('');setError('');try{sessionStorage.removeItem(LAST_INSPECTION);}catch{}window.scrollTo({top:0,behavior:'smooth'});};
    const saveAction=async(action:InspectorAction)=>{
        let saved=false;
        await run(async()=>{
            const current=latest.current;
            if(!current||storageLocked||local||photo)throw new Error('현재 사진을 확인하고 다음 사진을 누른 뒤 조치를 정리해 주세요.');
            if(current.document.actions.length>=30)throw new Error('한 점검에는 조치를 30건까지 등록할 수 있습니다.');
            if(duplicateAction(current.document.actions,action))throw new Error('같은 사진·조치·담당·기한으로 이미 등록했습니다. 등록 조치에서 확인해 주세요.');
            setActivity('전문가가 확인한 조치 저장 중');
            const document={...current.document,actions:[...current.document.actions,action],materialCompletion:undefined};
            try{accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document})).item);}
            catch(cause){
                // A response can be lost after a committed save. Read back the same UUID;
                // never append a second action or overwrite a concurrent revision.
                let recovered;try{recovered=await request({op:'detail',id:current.id});}catch{throw cause;}
                if(!recovered.item.document.actions.some((a:InspectorAction)=>sameAction(a,action)))throw cause;
                accept(recovered.item);
            }
            if(alive.current){setReport(null);saved=true;}
        });
        return saved;
    };
    const reassignAction=async(change:AssignmentChange)=>{
        let saved=false;await run(async()=>{
            const current=latest.current;
            if(!current||storageLocked||local||photo)throw new Error('현재 사진을 확인한 뒤 등록 조치를 변경해 주세요.');
            const document=changeActionAssignment(current.document,change);
            setActivity('등록 조치 담당·기한 변경 저장 중');
            try{accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document})).item);}
            catch(cause){
                let recovered;try{recovered=await request({op:'detail',id:current.id});}catch{throw cause;}
                if(!recoveredAssignment(current,document,recovered.item,recovered.control))throw cause;
                accept(recovered.item);
            }
            if(alive.current){setReport(null);setEntryNotice('담당·기한 변경을 저장했습니다. 요청문·조치대장·보고서는 새 저장본으로 전달하세요.');saved=true;}
        });return saved;
    };
    const submitImprovement=async(input:ImprovementSubmission)=>{
        let saved=false;await run(async()=>{
            const current=latest.current,action=current?.document.actions.find(a=>a.id===input.actionId);
            if(!current||!action||action.status==='verified'||storageLocked||local||photo)throw new Error('등록 조치의 현재 상태를 다시 확인해 주세요.');
            const sourcePhotoIds=action.sourcePhotoIds||input.sourcePhotoIds;
            if(!sourcePhotoIds.length||sourcePhotoIds.some(id=>!current.document.photoIds.includes(id)))throw new Error('실제 조치 전 사진을 선택해 주세요.');
            if(input.note.trim().length<5)throw new Error('개선 내용을 5자 이상 적어 주세요.');
            let registered=evidence.find(p=>p.id===input.photoId);
            if(input.prepared){
                if(input.prepared.id!==input.photoId)throw new Error('개선사진 번호를 확인해 주세요.');
                if(sourcePhotoIds.some(id=>evidence.find(p=>p.id===id)?.sha256===input.prepared!.receipt.uploaded_asset_sha256))throw new Error('조치 전과 같은 사진입니다. 다른 개선사진을 선택해 주세요.');
                setActivity('최적화한 개선사진 보관 중');
                registered=(await request({op:'upload',id:current.id,photoId:input.photoId,base64:await base64(input.prepared.file),optimizationReceipt:input.prepared.receipt,uploadConfirmed:true})).photo;
                if(alive.current)setEvidence(list=>list.some(p=>p.id===registered!.id)?list:[...list,registered!]);
            }
            if(!registered||registered.inspection_id!==current.id)throw new Error('같은 점검에 보관한 개선사진을 선택해 주세요.');
            const nextAction:InspectorAction={...action,sourcePhotoIds,completionPhotoId:registered.id,note:input.note.trim(),status:'review-requested'};
            const document={...current.document,photoIds:[...new Set([...current.document.photoIds,registered.id])],...(input.prepared||!current.document.photoIds.includes(registered.id)?{photoNotes:{...current.document.photoNotes,[registered.id]:`개선 후: ${input.note.trim()}`}}:{}),actions:current.document.actions.map(a=>a.id===action.id?nextAction:a),materialCompletion:undefined};
            setActivity('개선사진 연결·완료 검토 요청 저장 중');
            try{accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document})).item);}
            catch(cause){let recovered;try{recovered=await request({op:'detail',id:current.id});}catch{throw cause;}if(!recovered.item.document.actions.some((a:InspectorAction)=>sameAction(a,nextAction)))throw cause;accept(recovered.item);if(alive.current)setEvidence(recovered.evidence);}
            if(alive.current){setReport(null);saved=true;}
        });return saved;
    };
    const verifyAction=async(actionId:string,note:string)=>{
        let saved=false;await run(async()=>{
            const current=latest.current,action=current?.document.actions.find(a=>a.id===actionId);if(!current||!action||action.status!=='review-requested'||storageLocked||local||photo)throw new Error('개선사진을 저장하고 완료 검토를 요청한 뒤 확인해 주세요.');
            setActivity('현장 재점검 확인 기록 중');
            try{accept((await request({op:'verify-action',id:current.id,actionId,expectedRevision:current.revision,verificationNote:note})).item);}
            catch(cause){let recovered;try{recovered=await request({op:'detail',id:current.id});}catch{throw cause;}const a:InspectorAction|undefined=recovered.item.document.actions.find((a:InspectorAction)=>a.id===actionId);if(!a||!a.verifiedAt||!sameAction(a,{...action,status:'verified',note,verifiedAt:a.verifiedAt}))throw cause;accept(recovered.item);}
            if(alive.current){setReport(null);saved=true;}
        });return saved;
    };
    const toggleApi=()=>void run(async()=>{const enabled=!apiEnabled;const current=latest.current;if(current)accept((await request({op:'save',id:current.id,expectedRevision:current.revision,document:{...current.document,apiEnabled:enabled,materialCompletion:undefined}})).item);setApiEnabled(enabled);});
    const effectiveReference=analysis?review.decision==='rejected'?legalForText([review.note,resultNote].join(' '),item?.document.eventAt):legalForPhoto(analysis,resultNote,item?.document.eventAt):reference;
    const reviewSaved=!!photo&&reviewIsSaved(item,photo.id,review);
    const brief=()=>[...(analysis?[`${reviewSaved?'저장한 전문가 검토':'저장 전 검토 선택'}: ${review.decision==='rejected'?'AI 해석 수용 안 함':'AI 참고 활용'}`,review.note.trim()?`전문가 의견${reviewSaved?'':' (저장 전)'}: ${review.note.trim()}`:'']:[]),resultNote,...((review.decision==='rejected'?null:analysis)?.risk_findings?.flatMap(f=>[`문제 제안: ${f.problem}`,`가능 위험: ${f.risk}`,`우선 조치: ${f.action}`])||[]),...((review.decision==='rejected'?null:analysis)?.observed_facts.map(f=>`관찰 제안: ${f.text}`)||[]),...((review.decision==='rejected'?null:analysis)?.recommended_controls.map(c=>`조치 제안: ${c.action}`)||[]),...((effectiveReference?.cards||[]).flatMap(card=>[card.title,...card.actions,...card.duties.map(d=>`${d.label}: ${d.summary}\n${d.url}`),...card.sanctions.map(s=>`${s.actor}: ${sanctionText(s)} / 조건: ${s.condition} / 근거: ${s.basis}\n${s.url}`),...(card.sanctionNote?[card.sanctionNote]:[])])),...((effectiveReference?.inspectionCases||[]).flatMap(c=>[`공개 감독사례: ${c.title} (${c.publishedAt})`,c.finding,c.response,c.url])),`공식 원문 대조: ${reference?.reviewedAt} · 금액은 법정상한 · 실제 위반·부과액 확정 아님`].join('\n');
    return <div className="si-workspace si-quick" onPaste={e=>{if(e.defaultPrevented||busy||photo)return;const files=pastedPhotos(e.clipboardData);if(files.length){e.preventDefault();choose(files[0]);}}}>
        <header className="si-quick-heading"><div><p className="si-eyebrow">NEW-PSI · 현장 사진점검</p><h1>사진 한 장, 필요한 답을 한눈에</h1><p>위험요인 · 바로 할 조치 · 법령 요지 · 벌금·과태료</p></div><button className="si-btn" disabled={busy||storageBusy} onClick={()=>{if(!unsavedPhoto&&!actionDraftDirty||window.confirm('상세 관리로 이동합니다. 저장 전 사진·설명·검토·작성 중인 조치는 이 화면을 닫으면 사라집니다. 이동할까요?'))onAdvanced();}}>저장 기록 · 상세 관리</button></header>
        {!item&&!local&&!deletedResumeId&&<a className="si-product-entry" href="/product">처음이라면 결과 미리보기 · 현장 도입 안내 <span aria-hidden="true">↗</span></a>}
        {(item||deletedResumeId)&&<InspectorStorageManager key={item?.id||deletedResumeId} id={item?.id||deletedResumeId} revision={item?.revision||0} title={item?.document.title||'이 탭의 이전 점검 · 삭제 결과'} initialOpen={!!deletedResumeId} disabled={busy||!!local&&!photo} onWorking={setStorageBusy} onLocked={()=>{setStorageLocked(true);clearActive();}} onComplete={()=>startNew()}/>}
        {storageLocked&&<p className="si-notice">삭제 중이거나 사진이 삭제된 점검입니다. 위 보관·삭제 관리에서 검증 결과를 확인하세요.</p>}
        <fieldset className="si-work-area" hidden={storageLocked} disabled={storageBusy}>
        {!item&&!local&&!deletedResumeId&&resumeId&&<section className="si-resume" aria-label="이전 점검 이어하기"><div><b>이 탭에서 저장한 점검이 있습니다</b><p>보관한 사진과 전문가 검토를 불러와 이어서 완성하세요.</p></div><button className="si-btn" disabled={busy} onClick={resume}>이전 점검 이어하기</button></section>}
        {item&&entryIntent&&<section className="si-resumed-context" aria-label="현재 저장 점검"><p className="si-eyebrow">저장한 점검 이어하기</p><h2>{item.document.title}</h2><p>버전 {item.revision} · 사진 {item.document.photoIds.length}장 · 검토 대기 {recordResumeStatus(item.document).pendingPhotos}장 · 미결 조치 {recordResumeStatus(item.document).remainingActions}건</p>{entryNotice&&<p role="status" className="si-notice">{entryNotice}</p>}</section>}
        {item&&!entryIntent&&entryNotice&&<p role="status" className="si-notice">{entryNotice}</p>}
        {item&&item.document.photoIds.length>0&&<InspectorPhotoCollection item={item} active={!!(local||photo)} busy={busy} title={reportTitle} onTitle={setReportTitle} onOpen={openSavedPhoto} onFinish={finish}/>}
        {item&&!storageLocked&&(item.document.photoIds.length>0||item.document.actions.length>0)&&<InspectorActionPlanner key={`${item.id}:${actionEntry?.token||''}`} item={item} active={!!(local||photo)} busy={busy} onSave={saveAction} onReassign={reassignAction} onDirty={setActionDraftDirty} onOpen={openSavedPhoto} evidence={evidence} loadPhoto={loadEvidencePhoto} onSubmitImprovement={submitImprovement} onVerify={verifyAction} initialPhotoId={actionEntry?.photoId} initialSelection={actionEntry?.selection} initialRegistered={entryIntent==='actions'&&!actionEntry} onCloseEntry={closeActionEntry}/>}
        {reference&&<div className="si-input-recap">{preview&&<button className="si-preview-open" aria-label="점검 사진 크게 보기" onClick={()=>{setZoomFocus('');setZoom(true);}}><img src={preview} alt="점검 사진 미리보기"/></button>}<div><b>{analysis?'사진 분석 결과 준비됨':photo&&!resultNote.trim()?'사진 저장 · 아직 AI 판독 전':'설명으로 기준 조회됨'}</b><p>{resultNote||'설명 없이 사진에서 단서 찾기'}</p></div><button className="si-btn" disabled={busy} aria-expanded={editInput} aria-controls="si-quick-input" onClick={()=>{if(note.trim())setHintOpen(true);setEditInput(v=>!v);}}>{editInput?'입력 접기':'사진·설명 수정'}</button></div>}
        <section id="si-quick-input" hidden={!!reference&&!editInput} className="si-quick-input" aria-label="사진과 설명 입력">
            <div className="si-quick-photo">{preview?<><img src={preview} alt="분석할 현장사진"/>{!photo&&<button className="si-btn" disabled={busy} onClick={()=>{setLocal(null);setReference(null);}}>다른 사진 선택</button>}</>:<><InspectorScene/><span className="si-capture-label">현장 사진으로 시작</span><div className="si-quick-camera-mark" aria-hidden="true"><InspectorIcon name="camera"/></div><h2>사진을 찍거나 가져오세요</h2><p>PC에서는 사진을 복사한 뒤 Ctrl+V로 붙여넣을 수 있습니다.</p><div className="si-quick-buttons"><button className="si-btn si-primary" disabled={busy} onClick={()=>setCamera(true)}><InspectorIcon name="camera"/>카메라로 바로 촬영</button><label className="si-btn"><InspectorIcon name="upload"/>사진 선택<input aria-label="현장사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose(file);}}/></label></div></>}</div>
            <div className="si-quick-context"><div className="si-discovery-start"><b>무엇이 문제인지 모르겠어요</b><p>설명 없이 사진만으로 시작하세요. 의심 지점·사진 근거·가능 위험·먼저 할 일을 함께 찾습니다.</p></div><details className="si-photo-hint" open={hintOpen} onToggle={e=>setHintOpen(e.currentTarget.open)}><summary>힌트가 있으면 덧붙이기 (선택)</summary><label htmlFor="si-quick-note"><b>어떤 상황인가요?</b> <span>(짧게, 선택)</span></label><textarea ref={noteRef} id="si-quick-note" maxLength={4000} value={note} disabled={busy} placeholder="예: 2002동 3층, 다음 작업 전, 사진 오른쪽이 신경 쓰임" onChange={e=>{setNote(e.target.value);setCopied(false);}}/><p className="si-caption">위험 이름을 몰라도 됩니다. 위치·작업 상황 등 아는 내용만 적어 주세요.</p></details>
                <div className="si-quick-api"><button type="button" className="si-btn" role="switch" aria-checked={apiEnabled} disabled={busy} onClick={toggleApi}>사진 AI 분석 {apiEnabled?'ON':'OFF'}</button><span>{ready===null?'연결 확인 중':ready?`${connection.provider==='gemini'?'Gemini':connection.provider==='openai'?'OpenAI':connection.provider} · ${connection.model} · 실행 시 API 사용료`:'API 연결 없음 · 설명으로 기준 조회 가능'}</span>{ready===false&&<button className="si-btn" disabled={busy} onClick={()=>void run(async()=>{const r=await request({op:'ai-status'});setReady(r.ready);setConnection({provider:r.provider,model:r.model});})}>연결 다시 확인</button>}</div><details className="si-api-explanation"><summary>API 연결은 어떻게 되나요?</summary><p>이 화면 → PSI 서버의 사진점검 API → 표시된 AI 공급자로 최적화 사진과 설명을 전송합니다. 서버에 설정된 키를 사용하며 다른 기능과 키·청구 계정을 공유할 수 있습니다. ChatGPT 구독과 별도이며, PSI 점수·SMART TBM으로 자동 전달하지 않습니다. 연결 표시는 설정 존재 여부이며 실제 요청 성공을 보장하지 않습니다. OFF이면 외부 AI 분석을 요청하지 않습니다.</p></details>
                <label className="si-quick-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>사진 보관을 허용합니다. AI ON이면 분석 실행 시 외부 AI로 전송되며, 불필요한 얼굴·명찰 등은 처리했습니다.</label>
                <button ref={startRef} className="si-btn si-primary si-quick-start" disabled={busy||(!local&&!photo)||!consent||ready===null} onClick={analyze}>{busy?activity||'처리 중…':apiEnabled&&ready?note.trim()?'사진 분석 · 법령·금액 보기':'사진에서 위험 단서 찾기':note.trim()?'사진 저장 · 설명으로 법령·금액 보기':'사진만 저장 · AI 판독은 하지 않음'}</button>
                <button className="si-btn si-quick-text" disabled={busy} onClick={lookup}>사진 저장 없이 설명으로 기준 바로 보기</button>
                <p className="si-caption">{local?`기기에서 최적화 완료: ${(local.receipt.source_bytes/1048576).toFixed(2)}MB → ${(local.receipt.uploaded_bytes/1048576).toFixed(2)}MB · ${local.receipt.uploaded_width}×${local.receipt.uploaded_height}px. `:''}기기 원본은 바꾸지 않습니다. 보관·삭제는 ‘저장 기록 · 상세 관리’에서 확인할 수 있습니다.</p>
            </div>
        </section>
        {error&&<div className="si-quick-error"><p ref={errorRef} className="si-notice si-error" role="alert" tabIndex={-1}>{error}</p>{analysisFailed&&local&&photo&&apiEnabled&&ready&&<button className="si-btn" disabled={busy} onClick={analyze}>사진 분석 다시 시도</button>}</div>}{busy&&<p role="status" aria-live="polite">{activity||'처리 중…'}</p>}
        {!reference&&<section className="si-quick-topics"><p>사진이 없어도 필요한 기준을 바로 볼 수 있습니다.</p><div>{LEGAL_CARDS.map(card=><button className="si-btn" key={card.id} disabled={busy} onClick={()=>{const text=card.keywords[0];setNote(text);setResultNote(text);setEditInput(false);setSelectedFinding(0);setResultKey(k=>k+1);setAnalyzedResult(false);setReference(legalForText(text));setReport(null);}}>{card.title}</button>)}</div></section>}
        {reference&&<section ref={resultRef} tabIndex={-1} className="si-quick-result" aria-label="사진점검 결과">
            {entryIntent&&item&&photo&&<p className="si-current-photo-scope">{item.document.title} · 사진 {item.document.photoIds.indexOf(photo.id)+1}/{item.document.photoIds.length} · 저장 버전 {item.revision}</p>}
            <div className="si-section-heading"><div><p className="si-eyebrow">한눈에 보는 점검 결과</p><h2>{analysis&&resultNote===note?'사진 분석과 관련 기준':photo&&!resultNote.trim()?'사진 저장 · AI 판독 전':'설명에 관련된 조치와 기준'}</h2></div><button className="si-btn" disabled={busy} onClick={()=>void navigator.clipboard.writeText(brief()).then(()=>setCopied(true)).catch(()=>setError('복사하지 못했습니다. 화면 내용을 선택해 주세요.'))}>{copied?'결과 복사 완료':'결과 복사'}</button></div>
            <p className="si-caption">{analysis&&resultNote===note?'AI 관찰·위험 해석은 현장 사진과 대조하세요.':photo&&!resultNote.trim()?'사진만 보관된 상태입니다. 위험이 없다고 판단한 결과가 아닙니다.':'사진을 AI로 판독한 결과가 아닙니다. 입력 설명·선택 주제로 찾은 관련 기준입니다.'}</p>
            {photo&&!analysis&&!resultNote.trim()&&<div className="si-discovery-off"><b>{analysisFailed?'사진 분석을 완료하지 못했습니다':!ready?'사진 AI 연결이 없어 판독하지 않았습니다':'사진 AI가 OFF이거나 아직 실행 전입니다'}</b><p>사진 저장과 사진 판독은 다릅니다. {ready?'사진 AI를 켜고 실행하면 설명 없이도 단서를 검토할 수 있습니다.':'AI 연결 후 실행하거나, 아는 상황·선택 주제로 일반 기준을 조회할 수 있습니다.'}</p>{ready&&!apiEnabled&&<button type="button" className="si-btn" disabled={busy} onClick={()=>{toggleApi();setEditInput(true);}}>사진 AI 켜고 실행 안내 보기</button>}</div>}
            {photo&&!analyzedResult&&item?.document.analyses[photo.id]&&(item.document.photoNotes?.[photo.id]||'')===note&&<button className="si-btn" disabled={busy} onClick={viewStoredResult}>저장된 분석 결과 보기</button>}
            {resultNote!==note&&<p className="si-notice">설명이 변경되었습니다. 분석 또는 기준 조회를 다시 실행해 주세요.</p>}
            {analysis&&review.decision==='rejected'&&<p className="si-notice">전문가 의견 우선 · AI 해석을 수용하지 않은 상태입니다. 아래 원래 제안은 대조용입니다.</p>}
            <InspectorAnswer key={`${resultKey}:${review.decision}`} analysis={analysis&&resultNote===note?analysis:null} reference={effectiveReference!} note={resultNote} selectedFinding={selectedFinding} onFindingChange={setSelectedFinding} onDraftAction={!busy&&!storageBusy&&photo&&resultNote===note&&analysis?()=>draftPhotoAction(true):undefined} hasPhoto={!!photo} rejected={review.decision==='rejected'} onViewPhoto={preview?location=>{setZoomFocus(location.length>180?location.slice(0,180)+'…(요약)':location);setZoom(true);}:undefined} onComposeCard={!busy&&photo&&(local?.file||storedPhoto)&&resultNote===note&&(!item?.document.analyses[photo.id]||analyzedResult)?index=>setFieldCard({photo:local?.file||storedPhoto!,seed:seedFieldCard(analysis,review,resultNote,index),source:`사진 ${item!.document.photoIds.indexOf(photo.id)+1} · 자료 ${photo.id.slice(0,8)}`}):undefined}/>
            {analysis&&resultNote===note&&<InspectorExpertReview key={resultKey} value={review} busy={busy} saved={reviewSaved} notice={reviewNotice} onSave={saveReviewOnly} onChange={value=>{if(value.decision!==review.decision)setSelectedFinding(0);setReviewNotice('');setReview(value);setReport(null);setCopied(false);setActionCopied(false);}}/>}
            {item&&photo&&analysis&&<InspectorReviewNavigator item={item} photoId={photo.id} busy={busy||storageBusy||resultNote!==note||actionDraftDirty} onContinue={continueReview} onNextPhoto={nextPhoto}/>}
            {photo&&<div className="si-photo-action-entry"><button type="button" className="si-btn si-primary" disabled={busy||resultNote!==note||!!item?.document.analyses[photo.id]&&!analyzedResult} onClick={()=>draftPhotoAction(!!analysis?.risk_findings?.length)}>{analysis?'검토 저장 · 이 사진 조치 작성':'이 사진으로 조치 작성'}</button><span>조치 내용·담당자·기한은 이어지는 화면에서 확인 후 저장하세요.</span></div>}
            <div className="si-action-copy"><button className="si-btn" disabled={busy} onClick={()=>void navigator.clipboard.writeText(buildActionRequest(resultNote,analysis,{...review,note:review.note||DEFAULT_REVIEW_NOTE},true)).then(()=>setActionCopied(true)).catch(()=>setError('조치요청문을 복사하지 못했습니다.'))}>{actionCopied?'조치요청문 복사 완료':'조치요청문 복사'}</button><InspectorShareButton title="현장 사진점검 결과 · 검토용" text={brief()} disabled={busy||resultNote!==note} prepareFiles={local?.file||storedPhoto?async()=>[sharePhotoFile(local?.file||storedPhoto!,item&&photo?item.document.photoIds.indexOf(photo.id)+1:1)]:undefined}/><span>사진·분석·관련 기준을 확인하고 전달</span></div>

        </section>}
        {fieldCard&&createPortal(<Suspense fallback={<div role="status">전달 카드 편집기 준비 중…</div>}><InspectorFieldCardDialog {...fieldCard} onClose={()=>setFieldCard(null)}/></Suspense>,document.body)}
        <details className="si-quick-basics" open={showBasics} onToggle={e=>setShowBasics(e.currentTarget.open)}><summary>현장 필수 법령 요지 · 금액 전체 보기 ({LEGAL_CARDS.length}개 주제)</summary>{showBasics&&<InspectorLegalResult reference={{...legalForText(''),cards:LEGAL_CARDS}}/>}</details>
        {report&&<><div className="si-quick-print"><button className="si-btn si-primary" onClick={()=>window.print()}>보고서 인쇄 · PDF 저장</button><button className="si-btn" disabled={busy} onClick={nextPhoto}>사진 더 추가</button><button className="si-btn" disabled={busy} onClick={startNew}>새 점검 시작</button><p>사진·조치·법령 요지·조건별 금액을 포함한 검토용 보고서입니다.</p></div><Suspense fallback={<p role="status">보고서 화면을 준비합니다…</p>}><InspectorReport report={report}/></Suspense></>}
        {!storageLocked&&item&&item.document.photoIds.length>0&&!report&&!editInput&&(!local||photo)&&createPortal(<div className="si-workspace si-dock-scope si-quick-dock"><div className="si-quick-finish" aria-label="결과 확인과 저장"><p>{busy?activity||'처리 중…':`${item.document.photoIds.length}장 보관 · ${item.document.photoIds.filter(id=>!!item.document.reviews[id]).length}장 전문가 검토`}</p>{photo&&analysis&&nextPending?<button className="si-btn si-primary" disabled={busy||storageBusy||resultNote!==note||actionDraftDirty} onClick={continueReview}>검토 저장 · 다음 대기</button>:photo?<button className="si-btn" disabled={busy||storageBusy||resultNote!==note} onClick={nextPhoto}>확인하고 다음 사진</button>:<button className="si-btn" disabled={busy||storageBusy} onClick={()=>setCamera(true)}>다음 사진 촬영</button>}<button className={`si-btn${photo&&analysis&&nextPending?'':' si-primary'}`} disabled={busy||storageBusy||(!!photo&&resultNote!==note)} onClick={!photo&&pendingPhoto?()=>openSavedPhoto(pendingPhoto):finish}>{photo?'확인 · 보고서 저장':pendingPhoto?'검토 대기 사진 이어보기':'모은 자료로 보고서 완성'}</button></div></div>,document.body)}
        {zoom&&preview&&<InspectorPhotoDialog src={preview} onClose={()=>setZoom(false)} caption={(zoomFocus?`AI 관찰 위치: ${zoomFocus} · `:'')+(local||photo?.optimization_receipt?'점검용 최적화 사본입니다. 고화질 원본은 기기에 별도로 보관하세요.':'보관한 점검 사진입니다. 기기 원본 보관 상태는 별도로 확인하세요.')}/>}
        </fieldset>
        {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setCamera(false);choose(file);}}/>}
    </div>;
}
