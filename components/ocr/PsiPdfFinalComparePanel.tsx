import React,{useEffect,useRef,useState} from 'react';
import {
    buildPsiRasterPdfReview,choosePsiPdfRenderScale,
    downloadPreparedPsiRasterPdfReview,loadPsiPdfRenderer,
} from '../../utils/psiPdfRasterReview';

type PreparedPdf=Awaited<ReturnType<typeof buildPsiRasterPdfReview>>;
type Props={
    source:File;
    prepared:PreparedPdf;
    disabled:boolean;
    onBack:()=>void;
    onDownloaded:(sha256:string)=>void;
};

/** Compare the actual exported PDF against the original before requesting a local download. */
export const PsiPdfFinalComparePanel:React.FC<Props>=({
    source,prepared,disabled,onBack,onDownloaded,
})=>{
    const [page,setPage]=useState(1);
    const [zoom,setZoom]=useState<100|150|200>(100);
    const [loaded,setLoaded]=useState(false);
    const [readyPage,setReadyPage]=useState(0);
    const [confirmed,setConfirmed]=useState<number[]>([]);
    const [error,setError]=useState('');
    const [saving,setSaving]=useState(false);
    const [saved,setSaved]=useState(false);
    const originalCanvas=useRef<HTMLCanvasElement|null>(null);
    const outputCanvas=useRef<HTMLCanvasElement|null>(null);
    const sourceDoc=useRef<any>(null);
    const outputDoc=useRef<any>(null);
    const count=prepared.manifest.pageCount;

    useEffect(()=>{
        let cancelled=false;
        let sourceTask:any=null;
        let outputTask:any=null;
        setLoaded(false);
        setReadyPage(0);
        setError('');
        const open=async()=>{
            const pdfjs=await loadPsiPdfRenderer();
            const [sourceData,outputData]=await Promise.all([
                source.arrayBuffer(),prepared.blob.arrayBuffer(),
            ]);
            if(cancelled)return;
            sourceTask=pdfjs.getDocument({
                data:new Uint8Array(sourceData),stopAtErrors:true,enableXfa:false,
                maxImageSize:8_000_000,disableAutoFetch:true,disableStream:true,
            });
            outputTask=pdfjs.getDocument({
                data:new Uint8Array(outputData),stopAtErrors:true,enableXfa:false,
                maxImageSize:8_000_000,disableAutoFetch:true,disableStream:true,
            });
            const [original,output]=await Promise.all([sourceTask.promise,outputTask.promise]);
            if(cancelled)return;
            if(original.numPages!==count||output.numPages!==count)
                throw new Error('원본과 출력 PDF 페이지 수가 맞지 않습니다.');
            sourceDoc.current=original;
            outputDoc.current=output;
            setLoaded(true);
        };
        void open().catch(e=>{
            if(!cancelled)setError(e instanceof Error?e.message:'최종 PDF 비교 화면을 열 수 없습니다.');
        });
        return ()=>{
            cancelled=true;
            sourceDoc.current=null;
            outputDoc.current=null;
            if(sourceTask)void sourceTask.destroy().catch(()=>undefined);
            if(outputTask)void outputTask.destroy().catch(()=>undefined);
        };
    },[source,prepared,count]);

    useEffect(()=>{
        if(!loaded)return;
        const original=originalCanvas.current,output=outputCanvas.current;
        if(!original||!output)return;
        const originalPdf=sourceDoc.current,redacted=outputDoc.current;
        if(!originalPdf||!redacted)return;
        let cancelled=false;
        const tasks:any[]=[];
        setReadyPage(0);
        setError('');
        const draw=async(pdf:any,canvas:HTMLCanvasElement)=>{
            const item=await pdf.getPage(page);
            if(cancelled){item.cleanup();return;}
            const base=item.getViewport({scale:1});
            // Comparison is deliberately lower-resolution than the export for mobile RAM.
            const viewport=item.getViewport({scale:Math.min(1.25,
                choosePsiPdfRenderScale(base.width,base.height))});
            canvas.width=Math.ceil(viewport.width);
            canvas.height=Math.ceil(viewport.height);
            const ctx=canvas.getContext('2d',{willReadFrequently:false});
            if(!ctx)throw new Error('PDF 비교용 캔버스를 사용할 수 없습니다.');
            ctx.fillStyle='#fff';
            ctx.fillRect(0,0,canvas.width,canvas.height);
            const task=item.render({canvas,canvasContext:ctx,viewport});
            tasks.push(task);
            try{await task.promise;}finally{item.cleanup();}
        };
        void Promise.all([draw(originalPdf,original),draw(redacted,output)])
            .then(()=>{if(!cancelled)setReadyPage(page);})
            .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'PDF 비교 렌더링 실패');});
        return ()=>{cancelled=true;for(const task of tasks)task.cancel();};
    },[loaded,page]);

    const complete=confirmed.length===count&&readyPage===page&&!error&&loaded;
    const save=async()=>{
        if(saving||saved||disabled||!complete)return;
        setSaving(true);
        setError('');
        try{
            const manifest=await downloadPreparedPsiRasterPdfReview(prepared,confirmed,source);
            setSaved(true);
            onDownloaded(manifest.rasterPdfSha256);
        }catch(e){
            setError(e instanceof Error?e.message:'내부 검토 PDF 저장에 실패했습니다.');
        }finally{setSaving(false);}
    };

    return <section data-psi-pdf-final-compare="true"
        className="mt-4 rounded-xl border-2 border-indigo-300 bg-indigo-50/40 p-3 sm:p-4">
        <h5 className="text-sm font-black text-slate-900">22차 · 최종 출력 PDF 원본 비교·단일 ZIP 저장</h5>
        <p className="mt-2 text-xs leading-5 text-slate-700">
            검정 가림 처리 후 생성한 <strong>실제 PDF 출력물</strong>을 다시 열었습니다.
            각 페이지에서 원본과 결과를 대조하고, 이름·서명·전화번호·식별번호 등
            가림 영역 밖에 남은 정보가 없는지 직접 살피세요. 화면 비교는 내부 검토이며 외부 제출 승인이 아닙니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onBack} disabled={saving}
                className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 text-xs font-bold text-slate-900">
                가림 영역 다시 수정
            </button>
            <span className="text-xs font-bold text-slate-800">비교 확대</span>
            {([100,150,200] as const).map(level=>
                <button key={level} type="button" aria-pressed={zoom===level}
                    onClick={()=>setZoom(level)}
                    className={'min-h-10 rounded-lg border px-3 text-xs font-bold '+
                        (zoom===level?'border-indigo-800 bg-indigo-900 text-white':
                            'border-slate-300 bg-white text-slate-900')}>
                    {level}%
                </button>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="최종 출력 PDF 비교할 페이지">
            {Array.from({length:count},(_,i)=>i+1).map(number=>
                <button key={number} type="button" disabled={!loaded||saving}
                    onClick={()=>setPage(number)} aria-pressed={page===number}
                    className={'min-h-10 rounded-lg border px-3 text-xs font-bold '+
                        (page===number?'border-indigo-800 bg-indigo-900 text-white':
                            'border-slate-300 bg-white text-slate-900')}>
                    {number}쪽 {confirmed.includes(number)?'✓':''}
                </button>)}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
                <p className="mb-2 text-xs font-bold text-slate-800">원본 · 내부에서만 표시</p>
                <div className="max-h-[58vh] overflow-auto rounded-lg border border-slate-300 bg-white">
                    <canvas key={'original-'+page} ref={originalCanvas} aria-label="원본 PDF 비교 이미지"
                        className="block h-auto bg-white" style={{width:zoom+'%',maxWidth:'none'}}/>
                </div>
            </div>
            <div>
                <p className="mb-2 text-xs font-bold text-slate-800">가림본 · 실제 출력 PDF</p>
                <div className="max-h-[58vh] overflow-auto rounded-lg border border-slate-300 bg-white">
                    <canvas key={'redacted-'+page} ref={outputCanvas} aria-label="출력 PDF 가림 결과 이미지"
                        className="block h-auto bg-white" style={{width:zoom+'%',maxWidth:'none'}}/>
                </div>
            </div>
        </div>
        <p role="status" className="mt-2 text-xs text-slate-700">
            {readyPage===page?`${page}페이지 양쪽 화면 표시 완료`:'원본과 완성본 페이지를 불러오는 중입니다.'}
            {' '}비교 확인: {confirmed.length}/{count}페이지
        </p>
        <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-800">
            <input type="checkbox" className="mt-1" disabled={readyPage!==page||saving||saved}
                checked={confirmed.includes(page)}
                onChange={e=>setConfirmed(prev=>e.target.checked?
                    [...new Set([...prev,page])]:prev.filter(number=>number!==page))}/>
            <span>이 페이지의 원본과 <strong>실제 출력 PDF</strong>를 비교했습니다.
                검정 영역 밖의 개인정보를 살폈으며, 최종 검토가 모든 개인정보 제거를 보증하지 않음을 이해합니다.</span>
        </label>
        <button type="button" onClick={()=>void save()}
            disabled={!complete||saving||saved||disabled}
            className="mt-4 min-h-12 w-full rounded-xl bg-indigo-900 p-3 text-xs font-bold text-white disabled:opacity-40">
            {saving?'검토 PDF 저장 처리 중...':saved?'내부 검토 PDF 저장 요청 완료':
                '모든 페이지 비교 확인 후 PDF·JSON 묶음 ZIP 저장'}
        </button>
        <p className="mt-2 text-xs leading-5 text-slate-600">
            저장 직전 원본·최종 PDF의 SHA-256을 다시 대조합니다. 가림 PDF·검토 JSON·SHA-256 목록을
            하나의 ZIP으로 묶고, 압축을 다시 풀어 무결성을 확인한 후 로컬 저장을 요청합니다.
            ZIP을 압축 해제하면 PDF를 다시 열어 볼 수 있습니다. 서버 승인·외부 반출·수신 기록은 수행하지 않습니다.
        </p>
        {error&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-900">{error}</p>}
        {saved&&<p role="status" className="mt-2 text-xs text-emerald-900">
            로컬 ZIP 저장을 요청했습니다. 기기 다운로드 폴더에서 ZIP 압축을 해제한 후 PDF와 검토 JSON을 확인하세요.
        </p>}
    </section>;
};
