import {afterEach,describe,expect,it,vi} from 'vitest';

const pdfMock=vi.hoisted(()=>({
    getDocument:vi.fn(),
    black:true,
    extraText:false,
    extraAnnotation:false,
    extraAttachment:false,
    extraField:false,
    corruptInterior:false,
}));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs',()=>({
    GlobalWorkerOptions:{workerSrc:''},
    getDocument:pdfMock.getDocument,
}));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({
    default:'mock-worker-url',
}));
import {
    verifyPsiRasterPdfHasNoExtractableContent,
    type PsiPdfPageReview,
} from '../utils/psiPdfRasterReview';

const plan:readonly PsiPdfPageReview[]=[{
    pageNumber:1,
    manuallyReviewed:true,
    masks:[{x:0.2,y:0.2,width:0.3,height:0.3}],
}];
const bytes=new Uint8Array([37,80,68,70,45,49,46,55]);

const setup=()=>{
    pdfMock.black=true;pdfMock.extraText=false;pdfMock.extraAnnotation=false;
    pdfMock.extraAttachment=false;pdfMock.extraField=false;pdfMock.corruptInterior=false;
    const ctx={
        fillStyle:'#fff',
        fillRect:vi.fn(),
        getImageData:vi.fn((_x:number,_y:number,width:number,height:number)=>{
            const data=new Uint8ClampedArray(width*height*4);
            for(let i=0;i<data.length;i+=4){
                data[i]=pdfMock.black?0:255;
                data[i+1]=pdfMock.black?0:255;
                data[i+2]=pdfMock.black?0:255;
                data[i+3]=255;
            }
            if(pdfMock.corruptInterior){
                // A single unmasked pixel far from legacy nine sample points.
                const index=(Math.floor(height/3)*width+Math.floor(width/7))*4;
                data[index]=255;
            }
            return {data};
        }),
    };
    vi.stubGlobal('document',{
        createElement:vi.fn(()=>({
            width:0,height:0,
            getContext:vi.fn(()=>ctx),
        })),
    });
    const page={
        getViewport:vi.fn(({scale}:{scale:number})=>({width:200*scale,height:300*scale})),
        getTextContent:vi.fn(async()=>({items:pdfMock.extraText?[{str:'original secret'}]:[]})),
        getAnnotations:vi.fn(async()=>pdfMock.extraAnnotation?[{id:'secret-note'}]:[]),
        render:vi.fn(()=>({promise:Promise.resolve()})),
        cleanup:vi.fn(),
    };
    const pdf={
        numPages:1,
        getPage:vi.fn(async()=>page),
        getAttachments:vi.fn(async()=>pdfMock.extraAttachment?{'private.txt':{content:'secret'}}:null),
        getFieldObjects:vi.fn(async()=>pdfMock.extraField?{'person.name':[]}:null),
    };
    const destroy=vi.fn(async()=>undefined);
    pdfMock.getDocument.mockReturnValue({promise:Promise.resolve(pdf),destroy});
    return {page,ctx,pdf,destroy};
};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

describe('PSI 19th full-interior PDF blackout postflight',()=>{
    it('rerenders the exported PDF and checks each interior pixel in bounded chunks',async()=>{
        const {page,ctx,destroy}=setup();
        await verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan);
        expect(ctx.getImageData).toHaveBeenCalledTimes(6);
        expect(ctx.getImageData).toHaveBeenCalledWith(expect.any(Number),expect.any(Number),118,expect.any(Number));
        expect(page.render).toHaveBeenCalledTimes(1);
        expect(page.cleanup).toHaveBeenCalled();
        expect(destroy).toHaveBeenCalled();
    });
    it('refuses to save when final decoded PDF contains unmasked white pixels',async()=>{
        const {destroy}=setup();
        pdfMock.black=false;
        await expect(verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan))
            .rejects.toThrow('완성된 PDF');
        expect(destroy).toHaveBeenCalled();
    });
    it('detects one nonblack pixel in the interior, not just nine selected samples',async()=>{
        setup();pdfMock.corruptInterior=true;
        await expect(verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan))
            .rejects.toThrow('완성된 PDF');
    });
    it('blocks selectable text even if blackout pixels look valid',async()=>{
        setup();pdfMock.extraText=true;
        await expect(verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan))
            .rejects.toThrow('복사 가능한 원문');
    });
    it('blocks annotations and page count mismatches',async()=>{
        setup();pdfMock.extraAnnotation=true;
        await expect(verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan))
            .rejects.toThrow('주석');
        setup();
        await expect(verifyPsiRasterPdfHasNoExtractableContent(bytes,2,plan))
            .rejects.toThrow('페이지 수');
    });
    it('blocks attachments and form fields in the output PDF',async()=>{
        setup();pdfMock.extraAttachment=true;
        await expect(verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan))
            .rejects.toThrow('첨부파일');
        setup();pdfMock.extraField=true;
        await expect(verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan))
            .rejects.toThrow('양식 필드');
    });
});
