import React,{useEffect,useRef,useState} from 'react';
import {
    MAX_PSI_PDF_PAGES,readPsiLocalPdf,loadPsiPdfRenderer,
    choosePsiPdfRenderScale,downloadPsiRasterPdfReview,
    type PsiPdfPageReview,
} from '../../utils/psiPdfRasterReview';
import {
    applyOpaquePsiPhotoMasks,psiMaskFromDrag,type PsiPhotoMaskRect,
} from '../../utils/psiPhotoMaskGeometry';

type Pointer={clientX:number;clientY:number};

export const PsiPdfPrivacyReviewPanel:React.FC<{hasPendingEdits:boolean}>=({hasPendingEdits})=>{
    const [source,setSource]=useState<File|null>(null);
    const [sourceHash,setSourceHash]=useState('');
    const [pageCount,setPageCount]=useState(0);
    const [current,setCurrent]=useState(1);
    const [masksByPage,setMasksByPage]=useState<Record<number,PsiPhotoMaskRect[]>>({});
    const [reviewed,setReviewed]=useState<number[]>([]);
    const [draft,setDraft]=useState<PsiPhotoMaskRect|null>(null);
    const [loading,setLoading]=useState(false);
    const [notice,setNotice]=useState('');
    const [doneHash,setDoneHash]=useState('');
    const canvas=useRef<HTMLCanvasElement|null>(null);
    const originalPixels=useRef<ImageData|null>(null);
    const documentRef=useRef<any>(null);
    const jobRef=useRef<any>(null);
    const dragStart=useRef<Pointer|null>(null);
    const generation=useRef(0);
    const activeMasks=masksByPage[current]||[];

    const closeDocument=()=>{
        generation.current++;
        originalPixels.current=null;
        dragStart.current=null;
        const old=jobRef.current;jobRef.current=null;
        documentRef.current=null;
        if(old)void old.destroy().catch(()=>undefined);
    };
    useEffect(()=>()=>{closeDocument();},[]);

    const paint=()=>{
        const ctx=canvas.current?.getContext('2d');
        if(!ctx||!originalPixels.current||!canvas.current)return;
        ctx.putImageData(originalPixels.current,0,0);
        if(activeMasks.length)applyOpaquePsiPhotoMasks(ctx,activeMasks,canvas.current.width,canvas.current.height);
        if(draft){
            ctx.fillStyle='rgba(0,0,0,0.55)';
            ctx.fillRect(draft.x*canvas.current.width,draft.y*canvas.current.height,
                draft.width*canvas.current.width,draft.height*canvas.current.height);
            ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
            ctx.strokeRect(draft.x*canvas.current.width,draft.y*canvas.current.height,
                draft.width*canvas.current.width,draft.height*canvas.current.height);
        }
    };
    useEffect(paint,[current,masksByPage,draft,pageCount]);
    const renderPage=async(num:number,doc:any)=>{
        const token=++generation.current;
        setLoading(true);setDraft(null);setCurrent(num);
        originalPixels.current=null;
        try{
            const page=await doc.getPage(num);
            const base=page.getViewport({scale:1});
            const viewport=page.getViewport({scale:choosePsiPdfRenderScale(base.width,base.height)});
            const node=canvas.current;
            if(!node)throw new Error('PDF 페이지 미리보기를 열 수 없습니다.');
            node.width=Math.ceil(viewport.width);node.height=Math.ceil(viewport.height);
            const ctx=node.getContext('2d',{willReadFrequently:true});
            if(!ctx)throw new Error('페이지 미리보기 렌더링에 실패했습니다.');
            ctx.fillStyle='#fff';ctx.fillRect(0,0,node.width,node.height);
            await page.render({canvas:node,canvasContext:ctx,viewport}).promise;
            if(token!==generation.current)return;
            originalPixels.current=ctx.getImageData(0,0,node.width,node.height);
            setCurrent(num);
            setNotice('현재 '+num+'페이지: 가릴 내용을 검은 영역으로 지정한 후 페이지 검토를 완료하세요.');
        }catch(error){
            if(token===generation.current)setNotice(error instanceof Error?error.message:'PDF 페이지를 표시할 수 없습니다.');
        }finally{if(token===generation.current)setLoading(false);}
    };
    const loadFile=async(file:File|null)=>{
        closeDocument();setSource(null);setSourceHash('');setPageCount(0);
        setCurrent(1);setMasksByPage({});setReviewed([]);setDoneHash('');setNotice('');
        if(!file)return;
        setLoading(true);
        try{
            const metadata=await readPsiLocalPdf(file);
            const pdfjs=await loadPsiPdfRenderer();
            const task=pdfjs.getDocument({
                data:new Uint8Array(await file.arrayBuffer()),stopAtErrors:true,enableXfa:false,
                maxImageSize:8_000_000,disableAutoFetch:true,disableStream:true,
            });
            jobRef.current=task;
            const doc=await task.promise;
            documentRef.current=doc;
            setSource(file);setSourceHash(metadata.hash);setPageCount(metadata.pageCount);
            // The preview canvas is permanently mounted, including before file selection.
            await renderPage(1,doc);
        }catch(error){
            setNotice(error instanceof Error?error.message:'PDF 파일을 열 수 없습니다.');
        }finally{setLoading(false);}
    };
    const bounds=()=>{
        const rect=canvas.current?.getBoundingClientRect();
        return rect?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:null;
    };
    const makeRect=(end:Pointer)=>{
        const start=dragStart.current,box=bounds();
        return start&&box?psiMaskFromDrag(start,end,box):null;
    };
    const commit=(end:Pointer)=>{
        const candidate=makeRect(end);dragStart.current=null;setDraft(null);
        if(!candidate||loading||!originalPixels.current)return;
        if(activeMasks.length>=40){setNotice('페이지별 가림 영역은 최대 40개입니다.');return;}
        setMasksByPage(prev=>({...prev,[current]:[...(prev[current]||[]),candidate]}));
        setReviewed(prev=>prev.filter(page=>page!==current));setDoneHash('');
    };
    const removeMask=()=>{
        setMasksByPage(prev=>({...prev,[current]:(prev[current]||[]).slice(0,-1)}));
        setReviewed(prev=>prev.filter(page=>page!==current));setDoneHash('');
    };
    const save=async()=>{
        if(!source||loading||hasPendingEdits||reviewed.length!==pageCount)return;
        setLoading(true);setNotice('');setDoneHash('');
        try{
            const plans:PsiPdfPageReview[]=Array.from({length:pageCount},(_,index)=>({
                pageNumber:index+1,masks:masksByPage[index+1]||[],manuallyReviewed:true,
            }));
            const result=await downloadPsiRasterPdfReview(source,sourceHash,plans);
            setDoneHash(result.rasterPdfSha256);
            setNotice('원본 PDF 텍스트·주석을 복사하지 않은 이미지 기반 검토 PDF와 '
                +'검토 내역 JSON의 로컬 저장을 요청했습니다. '
                +'검은 영역 밖에 남은 개인정보가 없는지 다시 열어 확인하고, 별도 승인 전 외부 제출하지 마세요.');
        }catch(error){
            setNotice(error instanceof Error?error.message:'검토용 PDF를 만들지 못했습니다.');
        }finally{setLoading(false);}
    };
    return <section data-psi-pdf-review="true" className="mt-3 rounded-xl border border-slate-300 bg-white p-3 sm:p-4">
        <h4 className="text-sm font-black text-slate-900">PDF 페이지 개인정보 직접 가림 (17차)</h4>
        <p className="mt-2 text-xs leading-5 text-slate-700">
            로컬 PDF를 선택해 모든 페이지를 직접 확인합니다. 선택한 영역을 검정 픽셀로 덮은
            <strong> 이미지 기반 새 PDF</strong>만 만듭니다. 원본 텍스트·첨부파일·주석을
            새 PDF에 복사하지 않습니다. 이 PDF는 기존 PSI 증빙 ZIP에 자동 등록되지 않으며,
            원본의 작성시각·진정성이나 외부 제출 승인을 보증하지 않습니다.
        </p>
        <label className="mt-3 block text-xs font-bold text-slate-800">
            검토할 로컬 PDF (최대 12MB, {MAX_PSI_PDF_PAGES}페이지)
            <input type="file" accept=".pdf,application/pdf" className="mt-1 block w-full text-xs"
                disabled={loading||hasPendingEdits}
                onChange={e=>void loadFile(e.currentTarget.files?.[0]||null)}/>
        </label>
        {sourceHash&&<p className="mt-2 break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px]">
            선택한 PDF SHA-256: {sourceHash}
        </p>}
        <canvas ref={canvas} aria-label="PDF 페이지 픽셀 가림 미리보기"
            className={pageCount?'mt-3 block h-auto w-full touch-none rounded-lg border border-slate-300':'hidden'}
            style={{touchAction:'none'}}
            onPointerDown={e=>{
                if(loading||hasPendingEdits||!originalPixels.current)return;
                e.currentTarget.setPointerCapture(e.pointerId);
                dragStart.current={clientX:e.clientX,clientY:e.clientY};setDraft(null);
            }}
            onPointerMove={e=>{
                if(!dragStart.current)return;
                setDraft(makeRect({clientX:e.clientX,clientY:e.clientY}));
            }}
            onPointerUp={e=>commit({clientX:e.clientX,clientY:e.clientY})}
            onPointerCancel={()=>{dragStart.current=null;setDraft(null);}}/>
        {pageCount>0&&<>
            <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({length:pageCount},(_,index)=>index+1).map(number=>
                    <button key={number} type="button"
                        disabled={loading} onClick={()=>void renderPage(number,documentRef.current)}
                        className={'min-h-10 rounded-lg border px-3 text-xs font-bold '+
                            (current===number?'border-indigo-800 bg-indigo-900 text-white':
                                'border-slate-300 bg-white text-slate-800')}>
                        {number}쪽 {reviewed.includes(number)?'✓':''}
                    </button>)}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{current}/{pageCount}페이지 · 검정 가림 {activeMasks.length}개</span>
                <button type="button" disabled={loading||!activeMasks.length}
                    onClick={removeMask}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-bold">
                    마지막 가림 취소
                </button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs leading-5">
                <input type="checkbox" className="mt-1" disabled={loading}
                    checked={reviewed.includes(current)}
                    onChange={e=>{
                        setReviewed(prev=>e.target.checked?[...new Set([...prev,current])]:
                            prev.filter(page=>page!==current));
                        setDoneHash('');
                    }}/>
                <span>이 페이지를 확대해 검토했고 가림이 필요 없는 부분까지 확인했습니다.
                가림 영역 밖의 식별정보가 남을 수 있음을 이해합니다.</span>
            </label>
            <p className="mt-2 text-xs text-slate-700">
                검토 완료: {reviewed.length}/{pageCount}페이지.
                모든 페이지의 검토 표시가 있어야 내부용 PDF가 생성됩니다.
            </p>
            <button type="button" disabled={loading||hasPendingEdits||reviewed.length!==pageCount}
                onClick={()=>void save()}
                className="mt-3 min-h-11 w-full rounded-xl bg-indigo-900 p-3 text-xs font-bold text-white disabled:opacity-40">
                {loading?'PDF 검증·출력 중...':'모든 페이지를 이미지화한 내부 검토용 PDF 생성'}
            </button>
            {doneHash&&<p className="mt-2 break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px]">
                새 내부 검토 PDF SHA-256: {doneHash}
            </p>}
        </>}
        {notice&&<p role="status" className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">{notice}</p>}
    </section>;
};
