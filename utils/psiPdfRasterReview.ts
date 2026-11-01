import { ensureJsPdfConstructor, ensureFileSaver } from './externalScripts';
import {
    applyOpaquePsiPhotoMasks, stripPsiCanvasPngMetadata,
    validatePsiPhotoMasks, type PsiPhotoMaskRect,
} from './psiPhotoMaskGeometry';

export const PSI_FLATTENED_PDF_REVIEW_SCHEMA='psi-pdf-raster-review-v1';
export const MAX_PSI_PDF_PAGES=5;
export const MAX_PSI_PDF_BYTES=12*1024*1024;
const MAX_PAGE_PIXELS=8_000_000;

export type PsiPdfPageReview={
    pageNumber:number;
    masks:readonly PsiPhotoMaskRect[];
    manuallyReviewed:true;
};

export type PsiPdfReviewManifest={
    schema:typeof PSI_FLATTENED_PDF_REVIEW_SCHEMA;
    status:'INTERNAL_RASTER_PDF_REVIEW_NOT_APPROVED';
    preparedAt:string;
    originalSha256:string;
    rasterPdfSha256:string;
    pageCount:number;
    pageSummaries:Array<{
        pageNumber:number;
        maskedAreas:number;
        rasterWidth:number;
        rasterHeight:number;
        reviewedByUser:true;
    }>;
    originalDocumentEmbedded:false;
    selectableOriginalText:false;
    originalAttachmentsCopied:false;
    originalAnnotationsCopied:false;
    originalMetadataCopied:false;
    humanReviewRequired:true;
    disclosureApproved:false;
    recipientDeliveryRecorded:false;
    warning:string;
};

const digest=async(data:Uint8Array):Promise<string>=>{
    if(!globalThis.crypto?.subtle)throw new Error('이 기능은 HTTPS 보안 연결이 필요합니다.');
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(data)));
    return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
};

export const validatePsiPdfReviewPlan=(
    pages:number,plans:readonly PsiPdfPageReview[],
):void=>{
    if(!Number.isSafeInteger(pages)||pages<1||pages>MAX_PSI_PDF_PAGES)
        throw new Error('PDF는 1~5페이지 검토용으로만 처리할 수 있습니다.');
    if(plans.length!==pages||new Set(plans.map(item=>item.pageNumber)).size!==pages)
        throw new Error('PDF의 모든 페이지를 각각 검토해야 합니다.');
    for(const plan of plans){
        if(!Number.isInteger(plan.pageNumber)||plan.pageNumber<1||plan.pageNumber>pages||
            plan.manuallyReviewed!==true||!Array.isArray(plan.masks)||plan.masks.length>40)
            throw new Error('검토하지 않은 PDF 페이지가 있거나 가림 영역 수가 초과되었습니다.');
        for(const rect of plan.masks){
            if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||
                rect.width<=0||rect.height<=0||rect.x<0||rect.y<0||
                rect.x+rect.width>1+1e-8||rect.y+rect.height>1+1e-8)
                throw new Error('PDF 가림 좌표가 잘못되었습니다.');
        }
    }
};

export const choosePsiPdfRenderScale=(width:number,height:number):number=>{
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||
        width*height>MAX_PAGE_PIXELS)
        throw new Error('PDF 페이지 크기가 너무 큽니다.');
    // About 144 dpi for A4 while respecting mobile-memory bounds.
    return Math.min(2,Math.sqrt(MAX_PAGE_PIXELS/(width*height)));
};

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
export const loadPsiPdfRenderer=async():Promise<PdfJs>=>{
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerUrl=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc=workerUrl.default;
    return pdfjs;
};

export const readPsiLocalPdf=async(file:File)=>{
    if(!file||file.size<64||file.size>MAX_PSI_PDF_BYTES||file.type&&file.type!=='application/pdf')
        throw new Error('12MB 이하의 PDF만 선택할 수 있습니다.');
    const source=new Uint8Array(await file.arrayBuffer());
    if(String.fromCharCode(...source.subarray(0,5))!=='%PDF-')
        throw new Error('실제 PDF 형식이 아닙니다.');
    const hash=await digest(source);
    const pdfjs=await loadPsiPdfRenderer();
    const task=pdfjs.getDocument({
        data:Uint8Array.from(source),stopAtErrors:true,enableXfa:false,
        maxImageSize:MAX_PAGE_PIXELS,disableAutoFetch:true,disableStream:true,
    });
    try{
        const pdf=await task.promise;
        if(pdf.numPages<1||pdf.numPages>MAX_PSI_PDF_PAGES)
            throw new Error('PDF는 최대 5페이지로 제한됩니다.');
        return {source,hash,pageCount:pdf.numPages};
    }finally{await task.destroy();}
};

export const verifyPsiRasterPdfHasNoExtractableContent=async(
    bytes:Uint8Array,pageCount:number,plans:readonly PsiPdfPageReview[]=[],
)=>{
    const pdfjs=await loadPsiPdfRenderer();
    const task=pdfjs.getDocument({data:Uint8Array.from(bytes),stopAtErrors:true,enableXfa:false});
    try{
        const pdf=await task.promise;
        if(pdf.numPages!==pageCount)throw new Error('가림 PDF의 페이지 수가 다릅니다.');
        for(let i=1;i<=pageCount;i++){
            const page=await pdf.getPage(i);
            const [text,annotations]=await Promise.all([page.getTextContent(),page.getAnnotations()]);
            if(text.items.length||annotations.length)
                throw new Error('가림 PDF에 복사 가능한 원문이나 주석이 남아 있습니다.');
        }
        const [attachments,fields]=await Promise.all([
            pdf.getAttachments(),
            pdf.getFieldObjects(),
        ]);
        if(attachments&&Object.keys(attachments).length)
            throw new Error('가림 PDF에 첨부파일이 남아 있습니다.');
        if(fields&&Object.keys(fields).length)
            throw new Error('가림 PDF에 양식 필드가 남아 있습니다.');
        // Final-file postflight: rasterize the EXPORTED PDF itself, not only
        // the intermediate canvas. This catches masks lost at PDF encoding.
        if(plans.length){
            validatePsiPdfReviewPlan(pageCount,plans);
            if(typeof document==='undefined')throw new Error('출력 PDF 픽셀 검증이 지원되지 않습니다.');
            for(const plan of plans){
                if(!plan.masks.length)continue;
                const page=await pdf.getPage(plan.pageNumber);
                const viewport=page.getViewport({scale:choosePsiPdfRenderScale(
                    page.getViewport({scale:1}).width,page.getViewport({scale:1}).height,
                )});
                const canvas=document.createElement('canvas');
                canvas.width=Math.ceil(viewport.width);
                canvas.height=Math.ceil(viewport.height);
                const ctx=canvas.getContext('2d',{willReadFrequently:true});
                if(!ctx)throw new Error('PDF 출력물 픽셀 검증을 시작할 수 없습니다.');
                try{
                    ctx.fillStyle='#fff';
                    ctx.fillRect(0,0,canvas.width,canvas.height);
                    await page.render({canvas,canvasContext:ctx,viewport}).promise;
                    const rectangles=validatePsiPhotoMasks(plan.masks,canvas.width,canvas.height);
                    for(const rect of rectangles){
                        // Sample inside each blackout region, away from edges
                        // where rasterizer interpolation can blend neighboring pixels.
                        for(const fx of [0.25,0.5,0.75]){
                            for(const fy of [0.25,0.5,0.75]){
                                const x=Math.min(canvas.width-1,rect.x+Math.floor((rect.width-1)*fx));
                                const y=Math.min(canvas.height-1,rect.y+Math.floor((rect.height-1)*fy));
                                const pixel=ctx.getImageData(x,y,1,1).data;
                                if(pixel[0]>16||pixel[1]>16||pixel[2]>16||pixel[3]!==255)
                                    throw new Error('완성된 PDF에 검은 가림 픽셀이 반영되지 않았습니다. 저장을 중단합니다.');
                            }
                        }
                    }
                }finally{
                    canvas.width=0;canvas.height=0;
                    page.cleanup();
                }
            }
        }
    }finally{await task.destroy();}
};

export const buildPsiRasterPdfReview=async(
    file:File,
    independentHash:string,
    plans:readonly PsiPdfPageReview[],
):Promise<{blob:Blob;fileName:string;manifest:PsiPdfReviewManifest}>=>{
    const original=await readPsiLocalPdf(file);
    if(!/^[a-f0-9]{64}$/.test(independentHash)||independentHash!==original.hash)
        throw new Error('처음 확인한 원본 PDF SHA-256이 변경되었습니다.');
    validatePsiPdfReviewPlan(original.pageCount,plans);
    const pdfjs=await loadPsiPdfRenderer();
    const loading=pdfjs.getDocument({
        data:Uint8Array.from(original.source),stopAtErrors:true,enableXfa:false,
        maxImageSize:MAX_PAGE_PIXELS,disableAutoFetch:true,disableStream:true,
    });
    type RasterPdfWriter={
        addPage:(format:[number,number],orientation:'p'|'l')=>void;
        addImage:(bytes:Uint8Array,format:'PNG',x:number,y:number,w:number,h:number,
            alias?:string,compression?:string)=>void;
        output:(format:'arraybuffer')=>ArrayBuffer;
    };
    let output:RasterPdfWriter|null=null;
    const pageSummaries:PsiPdfReviewManifest['pageSummaries']=[];
    try{
        const pdf=await loading.promise;
        if(pdf.numPages!==original.pageCount)throw new Error('PDF 페이지 수가 변경됐습니다.');
        const Constructor=await ensureJsPdfConstructor();
        if(!Constructor)throw new Error('PDF 출력 모듈을 불러오지 못했습니다.');
        for(let i=1;i<=pdf.numPages;i++){
            const page=await pdf.getPage(i);
            const base=page.getViewport({scale:1});
            const scale=choosePsiPdfRenderScale(base.width,base.height);
            const viewport=page.getViewport({scale});
            const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
            if(width*height>MAX_PAGE_PIXELS)throw new Error('PDF 페이지 메모리 한도를 초과했습니다.');
            const canvas=document.createElement('canvas');
            canvas.width=width;canvas.height=height;
            const context=canvas.getContext('2d',{willReadFrequently:true});
            if(!context)throw new Error('PDF 이미지를 처리할 수 없습니다.');
            context.fillStyle='#ffffff';context.fillRect(0,0,width,height);
            await page.render({canvas,canvasContext:context,viewport}).promise;
            const plan=plans.find(item=>item.pageNumber===i)!;
            if(plan.masks.length){
                applyOpaquePsiPhotoMasks(context,plan.masks,width,height);
                for(const rect of validatePsiPhotoMasks(plan.masks,width,height)){
                    const pixels=context.getImageData(rect.x,rect.y,rect.width,rect.height).data;
                    for(let n=0;n<pixels.length;n+=4){
                        if(pixels[n]!==0||pixels[n+1]!==0||pixels[n+2]!==0||pixels[n+3]!==255)
                            throw new Error('가림 영역의 원본 픽셀이 남아 저장을 중단했습니다.');
                    }
                }
            }
            const pngBlob=await new Promise<Blob|null>(done=>canvas.toBlob(done,'image/png'));
            if(!pngBlob)throw new Error('PDF 페이지 이미지를 저장하지 못했습니다.');
            const cleanPng=stripPsiCanvasPngMetadata(new Uint8Array(await pngBlob.arrayBuffer()));
            const pointsWidth=base.width,pointsHeight=base.height;
            const portrait=pointsWidth<=pointsHeight;
            if(i===1){
                output=new (Constructor as unknown as new (opts:{
                    orientation:'p'|'l';unit:'pt';format:[number,number];compress:boolean;
                })=>RasterPdfWriter)({
                    orientation:portrait?'p':'l',unit:'pt',
                    format:[pointsWidth,pointsHeight],compress:true,
                });
            }else{
                output!.addPage([pointsWidth,pointsHeight],portrait?'p':'l');
            }
            output!.addImage(cleanPng,'PNG',0,0,pointsWidth,pointsHeight,undefined,'NONE');
            pageSummaries.push({pageNumber:i,maskedAreas:plan.masks.length,
                rasterWidth:width,rasterHeight:height,reviewedByUser:true});
            canvas.width=0;canvas.height=0;
            page.cleanup();
        }
        if(!output)throw new Error('PDF가 비어 있습니다.');
        const pdfBytes=new Uint8Array(output!.output('arraybuffer'));
        if(!pdfBytes.length||pdfBytes.length>40*1024*1024)
            throw new Error('가림 PDF 출력 크기가 허용 한도를 초과했습니다.');
        await verifyPsiRasterPdfHasNoExtractableContent(pdfBytes,original.pageCount,plans);
        const maskedHash=await digest(pdfBytes);
        const manifest:PsiPdfReviewManifest={
            schema:PSI_FLATTENED_PDF_REVIEW_SCHEMA,
            status:'INTERNAL_RASTER_PDF_REVIEW_NOT_APPROVED',
            preparedAt:new Date().toISOString(),originalSha256:original.hash,
            rasterPdfSha256:maskedHash,pageCount:original.pageCount,pageSummaries,
            originalDocumentEmbedded:false,selectableOriginalText:false,
            originalAttachmentsCopied:false,originalAnnotationsCopied:false,
            originalMetadataCopied:false,humanReviewRequired:true,
            disclosureApproved:false,recipientDeliveryRecorded:false,
            warning:'원본 PDF를 이미지로 렌더링해 검은 픽셀 가림을 적용한 별도 내부 검토본입니다. '
                +'PDF 텍스트/주석/첨부파일을 복제하지 않았으며, 모든 페이지 육안 검토 및 독립 결재 전 외부 제출할 수 없습니다. '
                +'검토자가 미처 가리지 못한 이미지 속 식별정보는 남을 수 있습니다.',
        };
        return {
            blob:new Blob([pdfBytes],{type:'application/pdf'}),
            fileName:'PSI_INTERNAL_MASKED_PDF_REVIEW_'+manifest.preparedAt.slice(0,10)+'.pdf',
            manifest,
        };
    }finally{await loading.destroy();}
};

export const downloadPsiRasterPdfReview=async(
    file:File,sourceHash:string,plans:readonly PsiPdfPageReview[],
)=>{
    const result=await buildPsiRasterPdfReview(file,sourceHash,plans);
    const save=await ensureFileSaver();
    if(!save)throw new Error('파일 다운로드 기능을 사용할 수 없습니다.');
    save(result.blob,result.fileName);
    // Save a separate review manifest, not embedded in output PDF.
    save(new Blob([JSON.stringify(result.manifest,null,2)+'\n'],
        {type:'application/json;charset=utf-8'}),'PSI_PDF_REVIEW_MANIFEST_'+result.manifest.preparedAt.slice(0,10)+'.json');
    return result.manifest;
};
