import {ensureJsZip} from './externalScripts';
import {
    MAX_PSI_PDF_PAGES, PSI_FLATTENED_PDF_REVIEW_SCHEMA,
    verifyPsiRasterPdfHasNoExtractableContent,
    type PsiPdfReviewManifest,
} from './psiPdfRasterReview';

const PDF_NAME='PSI_MASKED_REVIEW.pdf';
const MANIFEST_NAME='REVIEW_MANIFEST.json';
const SUMS_NAME='SHA256SUMS.txt';
const MAX_ARCHIVE_BYTES=60*1024*1024;
const MAX_PDF_BYTES=40*1024*1024;
const MAX_MANIFEST_BYTES=256*1024;
const MAX_SUMS_BYTES=2048;

type ZipEntry={
    dir?:boolean;
    _data?:{uncompressedSize?:number};
    async:(format:'uint8array')=>Promise<Uint8Array>;
};
type OpenedZip={
    files:Record<string,ZipEntry>;
    file:(name:string)=>ZipEntry|null;
};
type ZipReader=new()=>{loadAsync:(blob:Blob)=>Promise<OpenedZip>};
type Manifest=PsiPdfReviewManifest;

/** Digest bytes from the unpacked archive, not a displayed hash or a filename. */
const sha256=async(bytes:Uint8Array)=>{
    if(!globalThis.crypto?.subtle)throw new Error('로컬 검증에는 HTTPS 보안 연결이 필요합니다.');
    const hash=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes));
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
const hashPattern=/^[a-f0-9]{64}$/;
const requireSize=(entry:ZipEntry|null,name:string,max:number)=>{
    if(!entry||entry.dir||!entry._data||
        !Number.isSafeInteger(entry._data.uncompressedSize)||
        entry._data.uncompressedSize<1||entry._data.uncompressedSize>max)
        throw new Error(name+'의 ZIP 압축 해제 크기가 허용 범위를 벗어났습니다.');
};
const manifestValid=(x:Manifest):boolean=>{
    if(!x||x.schema!==PSI_FLATTENED_PDF_REVIEW_SCHEMA||
        x.status!=='INTERNAL_RASTER_PDF_REVIEW_NOT_APPROVED'||
        !hashPattern.test(x.originalSha256)||!hashPattern.test(x.rasterPdfSha256)||
        x.originalSha256===x.rasterPdfSha256||
        !Number.isSafeInteger(x.pageCount)||x.pageCount<1||x.pageCount>MAX_PSI_PDF_PAGES||
        x.originalDocumentEmbedded!==false||x.selectableOriginalText!==false||
        x.originalAttachmentsCopied!==false||x.originalAnnotationsCopied!==false||
        x.originalMetadataCopied!==false||x.humanReviewRequired!==true||
        x.disclosureApproved!==false||x.recipientDeliveryRecorded!==false||
        !Array.isArray(x.pageSummaries)||x.pageSummaries.length!==x.pageCount||
        x.pageSummaries.some((p,i)=>p.pageNumber!==i+1||p.reviewedByUser!==true||
            !Number.isSafeInteger(p.maskedAreas)||p.maskedAreas<0||p.maskedAreas>40||
            !Number.isSafeInteger(p.rasterWidth)||p.rasterWidth<1||
            !Number.isSafeInteger(p.rasterHeight)||p.rasterHeight<1)||
        !x.finalComparison||x.finalComparison.userAcknowledged!==true||
        x.finalComparison.independentlyApproved!==false||
        x.finalComparison.localDownloadFormat!=='SINGLE_REVIEW_ZIP')
        return false;
    const pages=x.finalComparison.comparedPages;
    return Array.isArray(pages)&&pages.length===x.pageCount&&
        pages.every((page,i)=>Number.isSafeInteger(page)&&page===i+1)&&
        typeof x.finalComparison.completedAt==='string'&&
        Number.isFinite(Date.parse(x.finalComparison.completedAt));
};

export type PsiSavedPdfArchiveVerification={
    verified:true;
    pageCount:number;
    originalSha256:string;
    rasterPdfSha256:string;
    boundToOpenSource:boolean;
    disclosureApproved:false;
    independentlyApproved:false;
};

/**
 * Standalone local ZIP re-import. This checks format, file digests, the review
 * manifest and PDF-extractable content. It does NOT prove that the masking
 * covers every identity, authorize sending, or verify a trusted signatory.
 */
export const verifyPsiSavedReviewZipLocally=async(
    archiveFile:File,
    expectedOriginalSha256?:string,
):Promise<PsiSavedPdfArchiveVerification>=>{
    if(!archiveFile||archiveFile.size<1||archiveFile.size>MAX_ARCHIVE_BYTES||
        !/\.zip$/i.test(archiveFile.name))
        throw new Error('60MB 이하의 PSI 내부 검토 ZIP 파일만 확인할 수 있습니다.');
    if(expectedOriginalSha256!==undefined&&!hashPattern.test(expectedOriginalSha256))
        throw new Error('현재 원본 PDF의 SHA-256이 올바르지 않습니다.');

    const Zip=await ensureJsZip() as ZipReader|null;
    if(!Zip)throw new Error('ZIP 검증 기능을 불러오지 못했습니다.');
    const archive=await new Zip().loadAsync(archiveFile);
    const names=Object.keys(archive.files).sort();
    if(names.join('|')!==[PDF_NAME,MANIFEST_NAME,SUMS_NAME].sort().join('|'))
        throw new Error('내부 검토 ZIP에 허용되지 않은 파일이 있거나 필수 파일이 빠졌습니다.');
    const pdf=archive.file(PDF_NAME);
    const json=archive.file(MANIFEST_NAME);
    const sums=archive.file(SUMS_NAME);
    requireSize(pdf,PDF_NAME,MAX_PDF_BYTES);
    requireSize(json,MANIFEST_NAME,MAX_MANIFEST_BYTES);
    requireSize(sums,SUMS_NAME,MAX_SUMS_BYTES);
    const [pdfBytes,jsonBytes,sumsBytes]=await Promise.all([
        pdf!.async('uint8array'),json!.async('uint8array'),sums!.async('uint8array'),
    ]);
    if(pdfBytes.byteLength<64||pdfBytes.byteLength>MAX_PDF_BYTES||
        jsonBytes.byteLength>MAX_MANIFEST_BYTES||sumsBytes.byteLength>MAX_SUMS_BYTES||
        String.fromCharCode(...pdfBytes.subarray(0,5))!=='%PDF-')
        throw new Error('내부 검토 PDF 또는 검토 기록의 실제 파일 형식이 올바르지 않습니다.');
    let manifest:Manifest;
    try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(jsonBytes)) as Manifest;}
    catch{throw new Error('검토 JSON을 읽을 수 없습니다.');}
    if(!manifestValid(manifest))
        throw new Error('검토 기록이 불완전하거나 독립 승인 상태가 잘못되었습니다.');
    if(expectedOriginalSha256&&manifest.originalSha256!==expectedOriginalSha256)
        throw new Error('현재 선택한 원본 PDF의 해시와 ZIP 검토 기록이 다릅니다.');
    const [pdfHash,jsonHash]=await Promise.all([sha256(pdfBytes),sha256(jsonBytes)]);
    if(manifest.rasterPdfSha256!==pdfHash)
        throw new Error('ZIP 내부 PDF의 SHA-256이 검토 기록과 일치하지 않습니다.');
    const expectedSums=pdfHash+'  '+PDF_NAME+'\n'+jsonHash+'  '+MANIFEST_NAME+'\n';
    if(new TextDecoder('utf-8',{fatal:true}).decode(sumsBytes)!==expectedSums)
        throw new Error('ZIP SHA-256 목록이 실제 PDF·JSON 파일과 다릅니다.');
    // Do not trust the JSON claim "no selectable original text": decode PDF again.
    await verifyPsiRasterPdfHasNoExtractableContent(pdfBytes,manifest.pageCount);
    return {
        verified:true,pageCount:manifest.pageCount,
        originalSha256:manifest.originalSha256,
        rasterPdfSha256:pdfHash,boundToOpenSource:!!expectedOriginalSha256,
        disclosureApproved:false,independentlyApproved:false,
    };
};
