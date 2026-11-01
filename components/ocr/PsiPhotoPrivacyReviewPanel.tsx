import React, {useEffect,useRef,useState} from 'react';
import type {EvidencePackageVerification} from '../../utils/psiEvidenceArchive';
import {
    loadPsiVerifiedPhoto,downloadPsiMaskedPhotoReviewArchive,
} from '../../utils/psiPhotoRedactionArchive';
import {
    psiMaskFromDrag,applyOpaquePsiPhotoMasks,type PsiPhotoMaskRect,
} from '../../utils/psiPhotoMaskGeometry';

interface Props {
    sourceZip:File;
    verification:EvidencePackageVerification;
    recordId:string;
    hasPendingEdits:boolean;
}
type Pointer={clientX:number;clientY:number};

export const PsiPhotoPrivacyReviewPanel:React.FC<Props>=({
    sourceZip,verification,recordId,hasPendingEdits,
})=>{
    const images=verification.fileInventory.filter(file=>
        /^assets\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/.test(file.path) &&
        ['image/jpeg','image/png','image/webp'].includes(file.mimeType));
    const [chosen,setChosen]=useState(images[0]?.path||'');
    const [loadedPath,setLoadedPath]=useState('');
    const [loading,setLoading]=useState(false);
    const [masks,setMasks]=useState<PsiPhotoMaskRect[]>([]);
    const [draft,setDraft]=useState<PsiPhotoMaskRect|null>(null);
    const [revision,setRevision]=useState(0);
    const [reviewed,setReviewed]=useState(false);
    const [resultHash,setResultHash]=useState('');
    const [notice,setNotice]=useState('');
    const canvasRef=useRef<HTMLCanvasElement|null>(null);
    const bitmapRef=useRef<ImageBitmap|null>(null);
    const dragStart=useRef<Pointer|null>(null);

    useEffect(()=>()=>{bitmapRef.current?.close();bitmapRef.current=null;},[]);
    useEffect(()=>{
        const bitmap=bitmapRef.current,canvas=canvasRef.current;
        if(!bitmap||!canvas)return;
        if(canvas.width!==bitmap.width)canvas.width=bitmap.width;
        if(canvas.height!==bitmap.height)canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d');
        if(!ctx)return;
        ctx.drawImage(bitmap,0,0,bitmap.width,bitmap.height);
        if(masks.length)applyOpaquePsiPhotoMasks(ctx,masks,bitmap.width,bitmap.height);
        if(draft) {
            ctx.fillStyle='rgba(0,0,0,0.65)';
            ctx.fillRect(draft.x*bitmap.width,draft.y*bitmap.height,
                draft.width*bitmap.width,draft.height*bitmap.height);
            ctx.strokeStyle='#fff';
            ctx.lineWidth=Math.max(2,Math.round(bitmap.width/600));
            ctx.strokeRect(draft.x*bitmap.width,draft.y*bitmap.height,
                draft.width*bitmap.width,draft.height*bitmap.height);
        }
    },[revision,masks,draft]);

    const clearPreview=()=>{
        bitmapRef.current?.close();
        bitmapRef.current=null;
        setLoadedPath('');setMasks([]);setDraft(null);
        setReviewed(false);setResultHash('');
        dragStart.current=null;
    };
    const load=async()=>{
        if(!chosen||loading||hasPendingEdits)return;
        setLoading(true);setNotice('');clearPreview();
        try{
            const original=await loadPsiVerifiedPhoto(sourceZip,verification,chosen,recordId);
            if(typeof createImageBitmap!=='function')
                throw new Error('브라우저가 사진 픽셀 편집을 지원하지 않습니다.');
            const image=await createImageBitmap(original.blob,{imageOrientation:'from-image'});
            if(image.width*image.height>20_000_000){
                image.close();throw new Error('이미지가 2천만 픽셀을 초과합니다.');
            }
            bitmapRef.current=image;
            setLoadedPath(chosen);
            setRevision(current=>current+1);
            setNotice('이미지를 확인했습니다. 얼굴·명찰·연락처·위치 단서를 검은 사각형으로 직접 지정하세요.');
        }catch(error){
            setNotice(error instanceof Error?error.message:'사진 확인에 실패했습니다.');
        }finally{setLoading(false);}
    };
    const rect=(start:Pointer,end:Pointer)=>{
        const element=canvasRef.current;
        if(!element)return null;
        return psiMaskFromDrag(start,end,element.getBoundingClientRect());
    };
    const finish=(end:Pointer)=>{
        const start=dragStart.current;
        dragStart.current=null;setDraft(null);
        if(!start||!bitmapRef.current)return;
        const selected=rect(start,end);
        if(!selected){setNotice('가릴 영역이 작습니다. 충분히 넓게 드래그하세요.');return;}
        setMasks(current=>{
            if(current.length>=40){setNotice('최대 40개 영역까지 선택할 수 있습니다.');return current;}
            return [...current,selected];
        });
        setReviewed(false);setResultHash('');
    };
    const save=async()=>{
        if(!sourceZip||!loadedPath||!masks.length||!reviewed||loading||hasPendingEdits)return;
        setLoading(true);setNotice('');setResultHash('');
        try{
            const result=await downloadPsiMaskedPhotoReviewArchive(
                sourceZip,verification,loadedPath,recordId,masks);
            setResultHash(result.zipSha256);
            setNotice(result.regions+'개 영역의 실제 픽셀을 검은색으로 가린 내부 검토 사본을 저장 요청했습니다. '
              +'가리지 않은 영역을 반드시 육안으로 확인하고 별도 승인 전 외부에 보내지 마세요.');
        }catch(error){
            setNotice(error instanceof Error?error.message:'사진 가림 저장에 실패했습니다.');
        }finally{setLoading(false);}
    };

    return <section data-psi-photo-mask="true" className="mt-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
        <h4 className="text-sm font-black text-slate-900">사진 개인정보 직접 가림 (16차)</h4>
        <p className="mt-2 text-xs leading-5 text-slate-700">
            사진 위의 얼굴·명찰·차량번호·문서 등을 직접 드래그하여
            <strong> 불투명한 검은색으로 픽셀을 덮어씁니다.</strong>
            자동 얼굴 인식은 하지 않으며 가리지 않은 정보는 그대로 남습니다.
            새 PNG에는 원본 사진 파일과 메타데이터를 넣지 않습니다.
        </p>
        {images.length===0?
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs">이 증빙 ZIP에서 가릴 수 있는 사진이 없습니다.</p>:
            <>
                <label className="mt-3 block text-xs font-bold text-slate-900">검토할 원본 사진
                    <select value={chosen} disabled={loading||hasPendingEdits}
                        onChange={e=>{setChosen(e.target.value);clearPreview();setNotice('');}}
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs">
                        {images.map(file=><option value={file.path} key={file.path}>{file.path} · {file.bytes.toLocaleString()} bytes</option>)}
                    </select>
                </label>
                <button type="button" onClick={()=>void load()} disabled={loading||hasPendingEdits||!chosen}
                    className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-bold text-slate-900 disabled:opacity-40">
                    {loading?'확인 중...':'원본 해시 재검증 후 사진 편집 열기'}
                </button>
                {loadedPath && bitmapRef.current && <>
                    <p className="mt-3 text-[11px] leading-5 text-slate-600">
                        영역: {masks.length}개 / 최대 40개. 손가락 또는 마우스로 드래그하세요.
                        사진 크기: {bitmapRef.current.width} × {bitmapRef.current.height}px
                    </p>
                    <canvas ref={canvasRef} aria-label="현장 사진 개인정보 사각형 가림 편집"
                        className="mt-2 block h-auto w-full cursor-crosshair rounded-lg border border-slate-300 bg-white"
                        style={{touchAction:'none'}}
                        onPointerDown={event=>{
                            if(loading||hasPendingEdits||!bitmapRef.current)return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            dragStart.current={clientX:event.clientX,clientY:event.clientY};
                            setDraft(null);
                        }}
                        onPointerMove={event=>{
                            if(!dragStart.current)return;
                            setDraft(rect(dragStart.current,{clientX:event.clientX,clientY:event.clientY}));
                        }}
                        onPointerUp={event=>finish({clientX:event.clientX,clientY:event.clientY})}
                        onPointerCancel={()=>{dragStart.current=null;setDraft(null);}} />
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={!masks.length||loading}
                            onClick={()=>{setMasks(current=>current.slice(0,-1));setReviewed(false);setResultHash('');}}
                            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold">
                            마지막 영역 취소
                        </button>
                        <button type="button" disabled={!masks.length||loading}
                            onClick={()=>{setMasks([]);setReviewed(false);setResultHash('');}}
                            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold">
                            전체 영역 초기화
                        </button>
                    </div>
                    <label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-slate-800">
                        <input className="mt-1" type="checkbox" checked={reviewed}
                            onChange={event=>setReviewed(event.target.checked)}/>
                        <span>검은 가림 영역 밖에 식별정보가 남을 수 있음을 확인했습니다.
                        이 사진은 내부 검토용이며 별도 검토·승인 전 외부 제출하지 않습니다.</span>
                    </label>
                    <button type="button" onClick={()=>void save()}
                        disabled={loading||hasPendingEdits||!masks.length||!reviewed}
                        className="mt-3 min-h-11 w-full rounded-lg bg-slate-900 p-3 text-xs font-black text-white disabled:opacity-40">
                        {loading?'가림 검증 중...':'검은 픽셀 가림·메타데이터 제거 후 내부 검토 ZIP 저장'}
                    </button>
                    {resultHash && <p className="mt-2 break-all rounded-lg bg-white p-2 font-mono text-[11px]">
                        새 검토 ZIP SHA-256: {resultHash}
                    </p>}
                </>}
            </>
        }
        {notice && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-700" role="status">{notice}</p>}
    </section>;
};
