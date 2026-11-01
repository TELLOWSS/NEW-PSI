import {describe,expect,it} from 'vitest';
import {
    MAX_PSI_PDF_PAGES,MAX_PSI_PDF_BYTES,validatePsiPdfReviewPlan,
    choosePsiPdfRenderScale,readPsiLocalPdf,type PsiPdfPageReview,
} from '../utils/psiPdfRasterReview';

const reviewed=(page:number,masks:PsiPdfPageReview['masks']=[]):PsiPdfPageReview=>({
    pageNumber:page,manuallyReviewed:true,masks,
});

describe('PSI independent PDF privacy review fail-closed input',()=>{
    it('requires an explicit human review for every page, including unmasked pages',()=>{
        validatePsiPdfReviewPlan(2,[reviewed(1,[{x:.2,y:.2,width:.2,height:.2}]),reviewed(2)]);
        expect(()=>validatePsiPdfReviewPlan(2,[reviewed(1)])).toThrow('모든 페이지');
        expect(()=>validatePsiPdfReviewPlan(2,[reviewed(1),reviewed(1)])).toThrow();
        expect(()=>validatePsiPdfReviewPlan(2,[reviewed(1),{
            pageNumber:2,manuallyReviewed:false as true,masks:[],
        }])).toThrow('검토하지 않은');
    });
    it('rejects missing data, malformed masks, large page counts and pixel bombs',()=>{
        expect(()=>validatePsiPdfReviewPlan(0,[])).toThrow();
        expect(()=>validatePsiPdfReviewPlan(MAX_PSI_PDF_PAGES+1,[])).toThrow();
        expect(()=>validatePsiPdfReviewPlan(1,[reviewed(1,[{
            x:.9,y:.2,width:.3,height:.2,
        }])])).toThrow('좌표');
        expect(()=>validatePsiPdfReviewPlan(1,[reviewed(1,[{
            x:NaN,y:0,width:.5,height:.5,
        }])])).toThrow('좌표');
        expect(()=>choosePsiPdfRenderScale(4000,4000)).toThrow();
        expect(choosePsiPdfRenderScale(595,842)).toBe(2);
    });
    it('refuses spoofed non-PDF files and oversized sources before processing',async()=>{
        const fake=new File(['Not a PDF '+'.'.repeat(100)],'fake.pdf',{type:'application/pdf'});
        await expect(readPsiLocalPdf(fake)).rejects.toThrow('실제 PDF 형식');
        const tooBig=new File([new Uint8Array(MAX_PSI_PDF_BYTES+1)],'huge.pdf',
            {type:'application/pdf'});
        await expect(readPsiLocalPdf(tooBig)).rejects.toThrow('12MB');
    });
});
