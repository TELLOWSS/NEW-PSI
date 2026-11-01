import {afterEach,describe,expect,it,vi} from 'vitest';

const saved=vi.hoisted(()=>vi.fn());
vi.mock('../utils/externalScripts',()=>({
    ensureJsPdfConstructor:vi.fn(),
    ensureFileSaver:vi.fn(async()=>saved),
}));

import {
    downloadPreparedPsiRasterPdfReview,
    validatePsiPdfComparedPages,
    type PsiPdfReviewManifest,
} from '../utils/psiPdfRasterReview';

const sourceHash='a'.repeat(64);
const outputHash='b'.repeat(64);
const prepared=()=>{
    const manifest:PsiPdfReviewManifest={
        schema:'psi-pdf-raster-review-v1',
        status:'INTERNAL_RASTER_PDF_REVIEW_NOT_APPROVED',
        preparedAt:'2026-11-01T00:00:00.000Z',
        originalSha256:sourceHash,rasterPdfSha256:outputHash,
        pageCount:2,
        pageSummaries:[
            {pageNumber:1,maskedAreas:1,rasterWidth:100,rasterHeight:120,reviewedByUser:true},
            {pageNumber:2,maskedAreas:0,rasterWidth:100,rasterHeight:120,reviewedByUser:true},
        ],
        originalDocumentEmbedded:false,selectableOriginalText:false,
        originalAttachmentsCopied:false,originalAnnotationsCopied:false,
        originalMetadataCopied:false,humanReviewRequired:true,
        disclosureApproved:false,recipientDeliveryRecorded:false,
        warning:'Test synthetic PDF, never submit externally.',
    };
    return {manifest,blob:new Blob(['synthetic only'],{type:'application/pdf'}),
        fileName:'PSI_TEST_ONLY.pdf'};
};
afterEach(()=>{saved.mockReset();});
describe('PSI 20th actual-output visual comparison gate',()=>{
    it('requires exactly one acknowledgement for every page',()=>{
        expect(validatePsiPdfComparedPages(2,[2,1])).toEqual([1,2]);
        expect(()=>validatePsiPdfComparedPages(2,[1])).toThrow('모든 페이지');
        expect(()=>validatePsiPdfComparedPages(2,[1,1])).toThrow('비교 기록');
        expect(()=>validatePsiPdfComparedPages(2,[1,3])).toThrow('비교 기록');
        expect(()=>validatePsiPdfComparedPages(11,Array.from({length:11},(_,i)=>i+1))).toThrow();
    });
    it('does not download a PDF or manifest if final comparison is incomplete',async()=>{
        await expect(downloadPreparedPsiRasterPdfReview(prepared(),[1])).rejects.toThrow('모든 페이지');
        expect(saved).not.toHaveBeenCalled();
    });
    it('persists explicit human comparison evidence without granting approval',async()=>{
        const result=await downloadPreparedPsiRasterPdfReview(prepared(),[2,1]);
        expect(saved).toHaveBeenCalledTimes(2);
        expect(result.finalComparison?.comparedPages).toEqual([1,2]);
        expect(result.finalComparison?.userAcknowledged).toBe(true);
        expect(result.finalComparison?.independentlyApproved).toBe(false);
        expect(result.disclosureApproved).toBe(false);
        expect(result.recipientDeliveryRecorded).toBe(false);
        expect(result.originalSha256).toBe(sourceHash);
        expect(result.rasterPdfSha256).toBe(outputHash);
        const manifestFile=saved.mock.calls[1][0] as Blob;
        const json=JSON.parse(await manifestFile.text());
        expect(json.finalComparison.comparedPages).toEqual([1,2]);
    });
    it('rejects an unapproved-provenance mismatch or an allegedly approved export',async()=>{
        const invalid=prepared();invalid.manifest.rasterPdfSha256=sourceHash;
        await expect(downloadPreparedPsiRasterPdfReview(invalid,[1,2])).rejects.toThrow('구분되는');
        const suspicious=prepared();suspicious.manifest.disclosureApproved=true as false;
        await expect(downloadPreparedPsiRasterPdfReview(suspicious,[1,2])).rejects.toThrow('유효한');
        expect(saved).not.toHaveBeenCalled();
    });
});
