import {afterEach,describe,expect,it,vi} from 'vitest';

const pdfMock=vi.hoisted(()=>({
    getDocument:vi.fn(),
    black:true,
    extraText:false,
    extraAnnotation:false,
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
    const ctx={
        fillStyle:'#fff',
        fillRect:vi.fn(),
        getImageData:vi.fn(()=>({
            data:new Uint8ClampedArray(pdfMock.black?[0,0,0,255]:[255,255,255,255]),
        })),
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
        getAttachments:vi.fn(async()=>null),
        getFieldObjects:vi.fn(async()=>null),
    };
    const destroy=vi.fn(async()=>undefined);
    pdfMock.getDocument.mockReturnValue({promise:Promise.resolve(pdf),destroy});
    return {page,ctx,pdf,destroy};
};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

describe('PSI 18th final-PDF postflight verifies actual output page',()=>{
    it('rerenders output PDF and samples black pixels within the masked area',async()=>{
        const {page,ctx,destroy}=setup();
        await verifyPsiRasterPdfHasNoExtractableContent(bytes,1,plan);
        expect(ctx.getImageData).toHaveBeenCalledTimes(9);
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
});
