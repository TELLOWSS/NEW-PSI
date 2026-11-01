import {afterEach,describe,expect,it,vi} from 'vitest';

const {setRecords,openedReads,pdfPostflight,FakeZip}=vi.hoisted(()=>{
    let records=new Map<string,Uint8Array>();
    let extractCalls=0;
    const openedReads=()=>extractCalls;
    const setRecords=(next:Map<string,Uint8Array>)=>{records=new Map(next);extractCalls=0;};
    const current=()=>records;
    const pdfPostflight=vi.fn(async()=>undefined);
    class FakeZip{
        async loadAsync(_data:Blob){
            const files=Object.fromEntries([...current()].map(([name,data])=>[
                name,{dir:false,_data:{uncompressedSize:data.length},
                    async:async(_format:'uint8array')=>{
                        extractCalls++;return Uint8Array.from(data);
                    }},
            ]));
            return {files,file:(name:string)=>files[name]||null};
        }
    }
    return {records:current,setRecords,openedReads,extractCalls:()=>extractCalls,pdfPostflight,FakeZip};
});
vi.mock('../utils/externalScripts',()=>({
    ensureJsZip:vi.fn(async()=>FakeZip),
}));
vi.mock('../utils/psiPdfRasterReview',()=>({
    MAX_PSI_PDF_PAGES:10,
    PSI_FLATTENED_PDF_REVIEW_SCHEMA:'psi-pdf-raster-review-v1',
    verifyPsiRasterPdfHasNoExtractableContent:pdfPostflight,
}));
import {verifyPsiSavedReviewZipLocally} from '../utils/psiPdfLocalArchiveVerifier';

const encode=(text:string)=>new TextEncoder().encode(text);
const sha=async(bytes:Uint8Array)=>{
    const hash=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes));
    return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
};
const init=async()=>{
    const pdf=encode('%PDF-1.4\n'+'X'.repeat(120));
    const original=await sha(encode('%PDF-1.4\n'+'O'.repeat(120)));
    const pdfHash=await sha(pdf);
    const manifest={
        schema:'psi-pdf-raster-review-v1',
        status:'INTERNAL_RASTER_PDF_REVIEW_NOT_APPROVED',
        preparedAt:'2026-11-01T00:00:00.000Z',
        originalSha256:original,rasterPdfSha256:pdfHash,
        pageCount:1,
        pageSummaries:[{pageNumber:1,maskedAreas:1,rasterWidth:100,
            rasterHeight:120,reviewedByUser:true}],
        originalDocumentEmbedded:false,selectableOriginalText:false,
        originalAttachmentsCopied:false,originalAnnotationsCopied:false,
        originalMetadataCopied:false,humanReviewRequired:true,
        disclosureApproved:false,recipientDeliveryRecorded:false,
        finalComparison:{
            completedAt:'2026-11-01T01:00:00.000Z',
            comparedPages:[1],userAcknowledged:true,independentlyApproved:false,
            localDownloadFormat:'SINGLE_REVIEW_ZIP',
        },
        warning:'Synthetic audit only.',
    };
    const json=encode(JSON.stringify(manifest)+'\n');
    const sums=encode(pdfHash+'  PSI_MASKED_REVIEW.pdf\n'
        +(await sha(json))+'  REVIEW_MANIFEST.json\n');
    const files=new Map([
        ['PSI_MASKED_REVIEW.pdf',pdf],
        ['REVIEW_MANIFEST.json',json],
        ['SHA256SUMS.txt',sums],
    ]);
    setRecords(files);
    return {files,manifest,original,pdf,pdfHash};
};
const zip=()=>new File(['synthetic archive'],'downloaded.zip',{type:'application/zip'});
afterEach(()=>{pdfPostflight.mockReset();});
describe('PSI saved PDF ZIP local re-import safety boundary',()=>{
    it('rechecks PDF, JSON and checksum without claiming approval or source linkage',async()=>{
        const {pdfHash}=await init();
        const result=await verifyPsiSavedReviewZipLocally(zip());
        expect(result).toMatchObject({
            verified:true,pageCount:1,rasterPdfSha256:pdfHash,
            boundToOpenSource:false,disclosureApproved:false,independentlyApproved:false,
        });
        expect(pdfPostflight).toHaveBeenCalledTimes(1);
    });
    it('binds the archive to the original PDF only when an expected SHA is provided',async()=>{
        const {original}=await init();
        const valid=await verifyPsiSavedReviewZipLocally(zip(),original);
        expect(valid.boundToOpenSource).toBe(true);
        await expect(verifyPsiSavedReviewZipLocally(zip(),'a'.repeat(64)))
            .rejects.toThrow('현재 선택한 원본');
    });
    it('blocks a changed output PDF despite its unchanged review manifest',async()=>{
        const {files}=await init();
        files.set('PSI_MASKED_REVIEW.pdf',encode('%PDF-1.4\n'+'Y'.repeat(120)));
        setRecords(files);
        await expect(verifyPsiSavedReviewZipLocally(zip())).rejects.toThrow('SHA-256');
        expect(pdfPostflight).not.toHaveBeenCalled();
    });
    it('rejects a false disclosure approval even if all checksums are recomputed',async()=>{
        const {files,manifest}=await init();
        const edited=encode(JSON.stringify({...manifest,disclosureApproved:true})+'\n');
        files.set('REVIEW_MANIFEST.json',edited);
        files.set('SHA256SUMS.txt',encode(manifest.rasterPdfSha256+'  PSI_MASKED_REVIEW.pdf\n'
            +(await sha(edited))+'  REVIEW_MANIFEST.json\n'));
        setRecords(files);
        await expect(verifyPsiSavedReviewZipLocally(zip())).rejects.toThrow('독립 승인');
        expect(pdfPostflight).not.toHaveBeenCalled();
    });
    it('rejects changed SHA256SUMS independently of PDF and JSON',async()=>{
        const {files}=await init();
        files.set('SHA256SUMS.txt',encode('invalid check sums'));
        setRecords(files);
        await expect(verifyPsiSavedReviewZipLocally(zip())).rejects.toThrow('SHA-256 목록');
    });
    it('rejects unexpected unreviewed source or nested files',async()=>{
        const {files}=await init();
        files.set('ORIGINAL_UNMASKED.pdf',encode('hidden original'));
        setRecords(files);
        await expect(verifyPsiSavedReviewZipLocally(zip())).rejects.toThrow('허용되지 않은 파일');
        expect(openedReads()).toBe(0);
    });
    it('rejects large ZIP entries before any decompression',async()=>{
        await init();
        // A 60 MB ZIP input must be blocked independently of its metadata.
        const giant=new File([new Uint8Array(60*1024*1024+1)],'large.zip');
        await expect(verifyPsiSavedReviewZipLocally(giant)).rejects.toThrow('60MB');
        expect(openedReads()).toBe(0);
    });
    it('rejects a PDF containing extractable text or annotations on reopening',async()=>{
        await init();
        pdfPostflight.mockRejectedValueOnce(new Error('PDF contains selectable text'));
        await expect(verifyPsiSavedReviewZipLocally(zip()))
            .rejects.toThrow('selectable text');
    });
});
