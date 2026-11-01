import {afterEach,describe,expect,it,vi} from 'vitest';

const saved=vi.hoisted(()=>vi.fn());
vi.mock('../utils/externalScripts',()=>({
    ensureJsPdfConstructor:vi.fn(),
    ensureFileSaver:vi.fn(async()=>saved),
}));

import {
    downloadPreparedPsiRasterPdfReview,
    validatePsiPdfComparedPages,verifyPsiPreparedPdfIntegrity,
    type PsiPdfReviewManifest,
} from '../utils/psiPdfRasterReview';

const sha=async(data:Blob)=>{
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',await data.arrayBuffer()));
    return [...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
};

const fixture=async()=>{
    // Synthetic-only files; full PDF syntax and raster decoding are separately tested.
    const original=new File(['%PDF-1.4\n'+'.'.repeat(100)],'original.pdf',{type:'application/pdf'});
    const blob=new Blob(['%PDF-1.4\n'+'x'.repeat(100)],{type:'application/pdf'});
    const manifest:PsiPdfReviewManifest={
        schema:'psi-pdf-raster-review-v1',
        status:'INTERNAL_RASTER_PDF_REVIEW_NOT_APPROVED',
        preparedAt:'2026-11-01T00:00:00.000Z',
        originalSha256:await sha(original),
        rasterPdfSha256:await sha(blob),
        pageCount:2,
        pageSummaries:[
            {pageNumber:1,maskedAreas:1,rasterWidth:100,rasterHeight:120,reviewedByUser:true},
            {pageNumber:2,maskedAreas:0,rasterWidth:100,rasterHeight:120,reviewedByUser:true},
        ],
        originalDocumentEmbedded:false,selectableOriginalText:false,
        originalAttachmentsCopied:false,originalAnnotationsCopied:false,
        originalMetadataCopied:false,humanReviewRequired:true,
        disclosureApproved:false,recipientDeliveryRecorded:false,
        warning:'Synthetic test file, never submit externally.',
    };
    return {original,pdf:{manifest,blob,fileName:'PSI_TEST_ONLY.pdf'}};
};
afterEach(()=>{saved.mockReset();});
describe('PSI 21st source + final output integrity gate',()=>{
    it('requires exactly one acknowledgement for every page',()=>{
        expect(validatePsiPdfComparedPages(2,[2,1])).toEqual([1,2]);
        expect(()=>validatePsiPdfComparedPages(2,[1])).toThrow('모든 페이지');
        expect(()=>validatePsiPdfComparedPages(2,[1,1])).toThrow('비교 기록');
        expect(()=>validatePsiPdfComparedPages(2,[1,3])).toThrow('비교 기록');
        expect(()=>validatePsiPdfComparedPages(11,Array.from({length:11},(_,i)=>i+1))).toThrow();
    });
    it('blocks incomplete comparison before saving PDF or manifest',async()=>{
        const {original,pdf}=await fixture();
        await expect(downloadPreparedPsiRasterPdfReview(pdf,[1],original))
            .rejects.toThrow('모든 페이지');
        expect(saved).not.toHaveBeenCalled();
    });
    it('writes separate checked manifest, never fabricates independent approval',async()=>{
        const {original,pdf}=await fixture();
        await verifyPsiPreparedPdfIntegrity(pdf,original);
        const result=await downloadPreparedPsiRasterPdfReview(pdf,[2,1],original);
        expect(saved).toHaveBeenCalledTimes(2);
        expect(result.finalComparison?.comparedPages).toEqual([1,2]);
        expect(result.finalComparison?.userAcknowledged).toBe(true);
        expect(result.finalComparison?.independentlyApproved).toBe(false);
        expect(result.disclosureApproved).toBe(false);
        expect(result.recipientDeliveryRecorded).toBe(false);
        expect(result.originalSha256).toBe(await sha(original));
        expect(result.rasterPdfSha256).toBe(await sha(pdf.blob));
        const manifestFile=saved.mock.calls[1][0] as Blob;
        const json=JSON.parse(await manifestFile.text());
        expect(json.finalComparison.comparedPages).toEqual([1,2]);
        expect(json.disclosureApproved).toBe(false);
    });
    it('refuses a tampered original even if the reviewed page count is complete',async()=>{
        const {pdf}=await fixture();
        const switched=new File(['%PDF-1.4\n'+'z'.repeat(100)],'switched.pdf',{type:'application/pdf'});
        await expect(downloadPreparedPsiRasterPdfReview(pdf,[1,2],switched))
            .rejects.toThrow('SHA-256');
        expect(saved).not.toHaveBeenCalled();
    });
    it('refuses a changed output PDF using the stale original manifest',async()=>{
        const {original,pdf}=await fixture();
        const mutated={...pdf,blob:new Blob(['%PDF-1.4\n'+'y'.repeat(100)],{type:'application/pdf'})};
        await expect(downloadPreparedPsiRasterPdfReview(mutated,[1,2],original))
            .rejects.toThrow('SHA-256');
        expect(saved).not.toHaveBeenCalled();
    });
    it('rejects invalid record status, matching hashes, and unapproved disclosures',async()=>{
        const {original,pdf}=await fixture();
        const same={...pdf,manifest:{...pdf.manifest,rasterPdfSha256:pdf.manifest.originalSha256}};
        await expect(downloadPreparedPsiRasterPdfReview(same,[1,2],original))
            .rejects.toThrow('유효하지');
        const suspicious={...pdf,manifest:{...pdf.manifest,disclosureApproved:true as false}};
        await expect(downloadPreparedPsiRasterPdfReview(suspicious,[1,2],original))
            .rejects.toThrow('유효하지');
        const badPages={...pdf,manifest:{...pdf.manifest,pageSummaries:[pdf.manifest.pageSummaries[0]]}};
        await expect(downloadPreparedPsiRasterPdfReview(badPages,[1,2],original))
            .rejects.toThrow('유효하지');
        expect(saved).not.toHaveBeenCalled();
    });
});
