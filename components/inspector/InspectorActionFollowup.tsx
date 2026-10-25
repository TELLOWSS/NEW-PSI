import React,{useEffect,useId,useRef,useState} from 'react';
import {optimizePhoto,pastedPhotos} from '../../lib/inspector/photoAssets';
import type {Evidence,Inspection,InspectorAction,OptimizationReceipt} from '../../lib/inspector/types';
import {actionStatusLabel,buildRegisteredActionRequest} from '../../lib/inspector/actionPlan';
import {sharePhotoFile} from '../../lib/inspector/sharing';
import {formatInspectionTimestamp} from '../../lib/inspector/journey';
import {reinspectionStage} from '../../lib/inspector/noviceFollowThrough';
import {auditActionPhotoPair} from '../../lib/inspector/actionEvidenceAudit';
import InspectorCameraDialog from './InspectorCameraDialog';
import InspectorPhotoComparison from './InspectorPhotoComparison';
import InspectorPhotoDialog from './InspectorPhotoDialog';
import InspectorShareButton from './InspectorShareButton';

export type PreparedImprovement={id:string;file:File;receipt:OptimizationReceipt};
export type ImprovementSubmission={actionId:string;sourcePhotoIds:string[];photoId:string;prepared?:PreparedImprovement;note:string};
type Photo={id?:string;url?:string;blob?:Blob;failed?:boolean};
function usePhoto(id:string,local:Blob|undefined,enabled:boolean,loadPhoto:(id:string)=>Promise<Blob>){
    const [photo,setPhoto]=useState<Photo>({});
    useEffect(()=>{
        let alive=true,url='';setPhoto({});if(!enabled||(!id&&!local))return;
        void Promise.resolve().then(()=>local||loadPhoto(id)).then(blob=>{if(!alive)return;url=URL.createObjectURL(blob);setPhoto({id,url,blob});}).catch(()=>{if(alive)setPhoto({id,failed:true});});
        return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
    },[id,local,enabled,loadPhoto]);
    return enabled&&photo.id===id?photo:{};
}
export default function InspectorActionFollowup({item,action,evidence,busy,loadPhoto,onSubmit,onVerify,onDirty}:{key?:string;item:Inspection;action:InspectorAction;evidence:Evidence[];busy:boolean;loadPhoto:(id:string)=>Promise<Blob>;onSubmit:(input:ImprovementSubmission)=>Promise<boolean>;onVerify:(actionId:string,note:string)=>Promise<boolean>;onDirty:(id:string,dirty:boolean)=>void}){
    const prefix=useId(),[open,setOpen]=useState(false),[prepared,setPrepared]=useState<PreparedImprovement|null>(null),[choosing,setChoosing]=useState(false),[camera,setCamera]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState(false),[sending,setSending]=useState(false);
    const [beforeId,setBeforeId]=useState(action.sourcePhotoIds?.[0]||''),[afterId,setAfterId]=useState(action.completionPhotoId),[note,setNote]=useState(action.status==='review-requested'?action.note:''),[checked,setChecked]=useState(false),[verification,setVerification]=useState(''),[rechecked,setRechecked]=useState(false),[zoom,setZoom]=useState('');
    const choosingRef=useRef(false),sendingRef=useRef(false);
    const followupStage=reinspectionStage(action);
    const locked=busy||choosing||sending,verified=action.status==='verified',sourceIds=action.sourcePhotoIds|| (beforeId?[beforeId]:[]),selectedBefore=sourceIds.includes(beforeId)?beforeId:sourceIds[0]||'',selectedAfter=prepared?.id||afterId||action.completionPhotoId;
    const before=usePhoto(selectedBefore,undefined,open,loadPhoto),after=usePhoto(selectedAfter,prepared?.file,open,loadPhoto);
    const evidenceAudit=auditActionPhotoPair({
        beforeIds:sourceIds,afterId:selectedAfter,registeredIds:item.document.photoIds,
        evidence,preparedSha:prepared?.receipt.uploaded_asset_sha256,
    });
    const dirty=!verified&&(!!prepared||!!verification||!!note&&note!==action.note||!action.sourcePhotoIds&&!!beforeId||afterId!==action.completionPhotoId);
    useEffect(()=>{onDirty(action.id,dirty);return()=>onDirty(action.id,false);},[action.id,dirty,onDirty]);
    useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
    const choose=async(file:File)=>{
        if(locked||submitted||choosingRef.current)return;choosingRef.current=true;setChoosing(true);setError('');
        try{const optimized=await optimizePhoto(file);if(sourceIds.some(id=>evidence.find(p=>p.id===id)?.sha256===optimized.receipt.uploaded_asset_sha256))throw new Error('조치 전과 같은 사진입니다. 개선 후 사진을 선택해 주세요.');setPrepared({...optimized,id:crypto.randomUUID()});setAfterId('');setChecked(false);}catch(e){setError(e instanceof Error?e.message:'사진을 준비하지 못했습니다.');}finally{choosingRef.current=false;setChoosing(false);}
    };
    const send=async()=>{
        if(!checked||!sourceIds.length||!selectedAfter||note.trim().length<5||locked||sendingRef.current||!evidenceAudit.canSubmit)return;
        sendingRef.current=true;setSending(true);setSubmitted(true);setError('');
        try{
            const ok=await onSubmit({actionId:action.id,sourcePhotoIds:sourceIds,photoId:selectedAfter,...(prepared?{prepared}:{}),note:note.trim()});
            if(ok){setPrepared(null);setAfterId(selectedAfter);setChecked(false);setSubmitted(false);setNote(note.trim());setRechecked(false);}
            else setError('저장 여부가 아직 확인되지 않았습니다. 다른 사진으로 바꾸지 말고 같은 내용으로 다시 시도하세요. 저장된 사본은 기록 관리에서 확인할 수 있습니다.');
        }catch{
            setError('요청 결과를 확인하지 못했습니다. 같은 사진·내용으로 다시 시도하거나 저장 기록에서 먼저 확인하세요.');
        }finally{sendingRef.current=false;setSending(false);}
    };
    return <details className="si-action-followup" open={open} onToggle={e=>setOpen(e.currentTarget.open)} onPaste={e=>{const files=pastedPhotos(e.clipboardData);if(files.length){e.preventDefault();if(!verified&&!locked&&!submitted)void choose(files[0]);}}}>
        <summary>개선사진·전후 비교·재점검</summary>
        {open&&<>
            <nav className="si-followup-steps" aria-label="개선조치 세 단계"><ol><li className={followupStage===0?'is-current':'is-past'}><b>1. 개선 전후 사진</b><span>개선 내용 저장</span></li><li className={followupStage===1?'is-current':followupStage===2?'is-past':''}><b>2. 현장 재점검</b><span>실제 시공·안전조치 대조</span></li><li className={followupStage===2?'is-current':''}><b>3. 확인 기록</b><span>검토자 확인 후 완료 표시</span></li></ol><p>{followupStage===0?'미조치 상태입니다. 개선 후 사진을 연결해 완료 검토를 요청하세요.':followupStage===1?'개선사진을 받았습니다. 아직 완료가 아닙니다. 현장을 확인하고 판단을 기록하세요.':'현장 재점검 확인 기록이 저장된 상태입니다. 새 보고서에는 최신 기록을 반영하세요.'}</p></nav>
            {sourceIds.length>1?<label className="si-label">비교할 조치 전 사진<select aria-label="비교할 조치 전 사진" value={selectedBefore} disabled={locked} onChange={e=>setBeforeId(e.target.value)}>{sourceIds.map(id=><option key={id} value={id}>사진 {item.document.photoIds.indexOf(id)+1} · {item.document.photoNotes?.[id]?.slice(0,35)||'설명 없음'}</option>)}</select></label>:!action.sourcePhotoIds&&!verified?<label className="si-label">이전 조치의 원래 사진 지정<select aria-label="이전 조치의 원래 사진 지정" value={beforeId} disabled={locked||submitted} onChange={e=>{setBeforeId(e.target.value);setChecked(false);}}><option value="">실제 조치 전 사진을 직접 선택</option>{item.document.photoIds.filter(id=>id!==selectedAfter).map(id=><option key={id} value={id}>사진 {item.document.photoIds.indexOf(id)+1} · {item.document.photoNotes?.[id]?.slice(0,35)||'설명 없음'}</option>)}</select></label>:null}
            {verified&&!sourceIds.length&&<p className="si-caption">이전 기록에는 조치 전 사진 연결이 없습니다. 원래 기록을 임의로 추정하거나 변경하지 않습니다.</p>}
            <InspectorPhotoComparison before={before.url} after={after.url} beforeLabel={`조치 전${selectedBefore?` · 사진 ${item.document.photoIds.indexOf(selectedBefore)+1}`:''}`} afterLabel={prepared?'개선 후 · 저장 전 사본':`개선 후${selectedAfter?item.document.photoIds.includes(selectedAfter)?` · 사진 ${item.document.photoIds.indexOf(selectedAfter)+1}`:' · 연결 대기 사본':''}`} beforeError={before.failed} afterError={after.failed}/>
            <p className={'si-caption si-evidence-integrity '+(evidenceAudit.canSubmit?'is-linked':'is-attention')} data-photo-evidence-audit={evidenceAudit.code} role="status">
                <strong>사진 연결 확인 · {evidenceAudit.title}</strong> — {evidenceAudit.description} 사진이 달라도 같은 장소·범위 및 실제 조치 여부는 현장에서 직접 확인해야 합니다.
            </p>
            <div className="si-inline"><button type="button" className="si-btn" disabled={!before.url} onClick={()=>setZoom(before.url!)}>조치 전 크게 보기</button><button type="button" className="si-btn" disabled={!after.url} onClick={()=>setZoom(after.url!)}>개선 후 크게 보기</button></div>
            {!verified&&<>
                <p className="si-caption">사진 첨부는 완료 승인이 아닙니다. 개선사진도 기존 점검에 최적화 사본으로 보관하며 전체 삭제 범위에 포함합니다. AI 분석은 호출하지 않습니다.</p>
                <div className="si-inline"><button type="button" className="si-btn" disabled={locked||submitted||evidence.length>=20} onClick={()=>setCamera(true)}>개선사진 바로 촬영</button><label className="si-btn si-followup-file">개선사진 선택<input type="file" aria-label="개선사진 선택" accept="image/jpeg,image/png,image/webp" disabled={locked||submitted||evidence.length>=20} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void choose(file);}}/></label></div>
                {!prepared&&<label className="si-label">이미 보관한 개선사진<select aria-label="이미 보관한 개선사진" value={afterId} disabled={locked||submitted} onChange={e=>{setAfterId(e.target.value);setChecked(false);}}><option value="">사진을 촬영·선택하거나 기존 사진 지정</option>{evidence.filter(p=>!sourceIds.includes(p.id)).map(p=><option key={p.id} value={p.id}>{item.document.photoIds.includes(p.id)?`사진 ${item.document.photoIds.indexOf(p.id)+1} · ${item.document.photoNotes?.[p.id]?.slice(0,35)||'설명 없음'}`:`보관 사본 ${evidence.indexOf(p)+1} · 연결 대기`}</option>)}</select></label>}
                {!prepared&&evidence.some(p=>!item.document.photoIds.includes(p.id))&&<p className="si-caption">업로드 후 연결되지 않은 사본이 있습니다. 위에서 선택해 사진과 실제 위치를 확인하면 재업로드 없이 이어갈 수 있습니다.</p>}
                {evidence.length>=20&&<p className="si-caption">20장 보관 한도입니다. 이미 보관한 개선사진을 선택하거나 새 점검에서 후속 기록을 작성하세요.</p>}
                {prepared&&<p className="si-caption">최적화: {(prepared.receipt.source_bytes/1048576).toFixed(2)}MB → {(prepared.receipt.uploaded_bytes/1048576).toFixed(2)}MB · {prepared.receipt.uploaded_width}×{prepared.receipt.uploaded_height}px. 기기 원본은 변경하지 않습니다.</p>}
                <label htmlFor={prefix+'note'}>실제 개선 내용 (5자 이상)</label><textarea id={prefix+'note'} maxLength={2000} rows={3} disabled={locked||submitted} value={note} onChange={e=>{setNote(e.target.value);setChecked(false);}} placeholder="예: 해당 개구부 덮개 고정 및 주변 접근통제 보완"/>
                <label className="si-action-ack"><input type="checkbox" checked={checked} disabled={locked||submitted} onChange={e=>setChecked(e.target.checked)}/><span>적용 위치와 개선 내용을 확인했고, 사진 보관·민감정보 처리를 확인했습니다.</span></label>
                <button type="button" className="si-btn si-primary" disabled={locked||!checked||!sourceIds.length||!selectedAfter||note.trim().length<5||!evidenceAudit.canSubmit} onClick={()=>void send()}>{sending?'같은 사진 저장 결과 확인 중…':submitted?'같은 개선사진·내용으로 다시 시도':'개선사진 저장 · 완료 검토 요청'}</button>
                {!evidenceAudit.canSubmit&&!!selectedAfter&&<p className="si-caption" role="alert">사진 연결에 확인이 필요합니다. 조치 전·후 사진을 다시 선택하거나 저장본의 증거사진 보관 상태를 확인하세요.</p>}
                {submitted&&!busy&&!sending&&<p className="si-caption">사진·설명은 바꾸지 않고 동일한 요청으로 안전하게 재시도합니다. 이미 저장됐을 가능성이 있으므로 다른 사진이 필요하면 저장 기록을 먼저 확인하세요.</p>}
            </>}
            {action.status==='review-requested'&&!prepared&&afterId===action.completionPhotoId&&note===action.note&&<section className="si-reinspection"><h4>현장 재점검 확인</h4><p className="si-caption">사진만으로 이행을 확정하지 않습니다. 실제 현장 대조 후에만 관리자 확인을 기록하세요.</p><ol className="si-reinspection-checks"><li>원래 지적한 위치와 개선사진의 위치·범위가 같은지 확인</li><li>현장에서 고정 상태·접근통제 등 필요한 조치가 실제 유지되는지 확인</li><li>잔여 위험과 작업 재개 가능 여부를 별도 점검</li></ol><p className="si-caption">아래 확인은 위 항목을 실제로 대조했을 때만 선택합니다. 체크리스트 표시 자체는 점검 증빙이 아닙니다.</p><label htmlFor={prefix+'verify'}>현장에서 확인한 내용 (5자 이상)</label><textarea id={prefix+'verify'} rows={3} maxLength={2000} value={verification} disabled={locked} onChange={e=>{setVerification(e.target.value);setRechecked(false);}}/><label className="si-action-ack"><input type="checkbox" checked={rechecked} disabled={locked} onChange={e=>setRechecked(e.target.checked)}/><span>개선사진과 실제 현장 상태를 재점검했습니다.</span></label><button type="button" className="si-btn si-primary" disabled={locked||!rechecked||verification.trim().length<5} onClick={()=>void onVerify(action.id,verification.trim()).then(saved=>{if(saved){setVerification('');setRechecked(false);}})}>현장 재점검 확정</button></section>}
            {verified&&<p role="status" className="si-notice">{actionStatusLabel(action)} · {action.verifiedAt?formatInspectionTimestamp(action.verifiedAt):'확인시각 미기록'}<br/>{action.note}</p>}
            {!prepared&&selectedAfter===action.completionPhotoId&&before.blob&&after.blob&&<InspectorShareButton title={action.title} text={buildRegisteredActionRequest([action],item.document.title,item.document.photoIds)+`\n전후 비교 첨부: 조치 전 사진 ${item.document.photoIds.indexOf(selectedBefore)+1} / 개선 후 사진 ${item.document.photoIds.indexOf(selectedAfter)+1} (선택한 대표 사진)`} label="전후 사진·조치 보내기" prepareFiles={async()=>[sharePhotoFile(before.blob!,item.document.photoIds.indexOf(selectedBefore)+1),sharePhotoFile(after.blob!,item.document.photoIds.indexOf(selectedAfter)+1)]}/>}
            {choosing&&<p role="status">기기에서 개선사진 최적화 중…</p>}{error&&<p role="alert" className="si-notice si-error">{error}</p>}
            <p className="si-caption">기록 주체는 전용 설치 관리자이며 개인 전자서명은 아닙니다. 이미 만든 보고서는 변경하지 않으므로 재점검 후 새 보고서를 작성하세요.</p>
        </>}
        {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setCamera(false);void choose(file);}}/>}
        {zoom&&<InspectorPhotoDialog src={zoom} caption="점검에 연결된 사본입니다. 개선 이행은 현장에서 직접 대조하세요." onClose={()=>setZoom('')}/>}
    </details>;
}
