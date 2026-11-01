import { ensureJsZip, ensureFileSaver } from './externalScripts';
import { verifyPsiEvidenceArchive, type EvidencePackageVerification } from './psiEvidenceArchive';
import {
    applyOpaquePsiPhotoMasks, validatePsiPhotoMasks,
    stripPsiCanvasPngMetadata, type PsiPhotoMaskRect,
} from './psiPhotoMaskGeometry';

export const PSI_PHOTO_REDACTION_SCHEMA='psi-image-masked-internal-review-v1';

type ZipEntry={async:(format:'uint8array')=>Promise<Uint8Array>};
type ZipCtor=new()=>({
    file:(path:string,bytes:Uint8Array|string)=>void;
    loadAsync:(source:Blob)=>Promise<{file:(path:string)=>ZipEntry|null}>;
    generateAsync:(settings:{type:'blob';compression:'DEFLATE';compressionOptions:{level:number}})=>Promise<Blob>;
});

const digest=async(bytes:Uint8Array):Promise<string>=>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)))]
        .map(value=>value.toString(16).padStart(2,'0')).join('');

export type PsiVerifiedImageSource={
    blob:Blob;
    sha256:string;
    sourceBytes:number;
    mimeType:'image/jpeg'|'image/png'|'image/webp';
};

const allowedMimes=new Set(['image/jpeg','image/png','image/webp']);
const photoPath=/^assets\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/;

const sniff=(bytes:Uint8Array,mime:string):boolean=>{
    if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(mime==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    if(mime==='image/webp')return bytes.length>=12&&
        String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&
        String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
    return false;
};

/** Verify the entire source ZIP again and the exact chosen image bytes. */
export const loadPsiVerifiedPhoto = async (
    originalZip:Blob,
    verification:EvidencePackageVerification,
    assetPath:string,
    expectedRecordId:string,
):Promise<PsiVerifiedImageSource>=>{
    if(!globalThis.crypto?.subtle)throw new Error('SHA-256은 HTTPS에서만 사용할 수 있습니다.');
    if(!verification.verified||!verification.externallyAnchored||verification.errors.length
        ||verification.recordId!==expectedRecordId||!/^[a-f0-9]{64}$/.test(verification.zipSha256))
        throw new Error('먼저 현재 근로자 기록과 원본 ZIP 해시를 검증해야 합니다.');
    if(!photoPath.test(assetPath))throw new Error('자필 양식이나 현장 사진 파일만 선택하세요.');
    const asset=verification.fileInventory.find(file=>file.path===assetPath);
    if(!asset||!allowedMimes.has(asset.mimeType)||!Number.isSafeInteger(asset.bytes)
        ||asset.bytes<64||asset.bytes>16*1024*1024)
        throw new Error('이미지 형식 또는 파일 크기를 확인할 수 없습니다.');
    const rechecked=await verifyPsiEvidenceArchive(originalZip,verification.zipSha256);
    if(!rechecked.verified||rechecked.recordId!==expectedRecordId
        ||rechecked.zipSha256!==verification.zipSha256)
        throw new Error('원본 ZIP이 수정됐거나 근로자 기록이 다릅니다.');
    const zip=await ensureJsZip() as ZipCtor|null;
    if(!zip)throw new Error('사진을 확인할 ZIP 모듈을 불러오지 못했습니다.');
    const data=await new zip().loadAsync(originalZip);
    const entry=data.file(assetPath);
    if(!entry)throw new Error('선택 사진이 ZIP에 존재하지 않습니다.');
    const bytes=await entry.async('uint8array');
    const actual=await digest(bytes);
    if(bytes.length!==asset.bytes||actual!==asset.sha256||!sniff(bytes,asset.mimeType))
        throw new Error('선택 사진의 원본 바이트·해시·형식을 확인할 수 없습니다.');
    return {
        blob:new Blob([Uint8Array.from(bytes)],{type:asset.mimeType}),
        sha256:actual,sourceBytes:bytes.length,
        mimeType:asset.mimeType as PsiVerifiedImageSource['mimeType'],
    };
};

export type PsiMaskedPhotoResult={
    blob:Blob;
    fileName:string;
    zipSha256:string;
    manifest:{
        schema:typeof PSI_PHOTO_REDACTION_SCHEMA;
        status:'INTERNAL_PIXEL_MASK_REVIEW_NOT_APPROVED';
        createdAt:string;
        sourceZipSha256:string;
        originalImageSha256:string;
        maskedPngSha256:string;
        imageWidth:number;
        imageHeight:number;
        blackoutRegions:number;
        maskCoordinates:PsiPhotoMaskRect[];
        originalImageIncluded:false;
        sourceMetadataCopied:false;
        humanVisualInspectionRequired:true;
        legalDisclosureApproved:false;
        sentToRecipient:false;
        warning:string;
    };
};

const canvasBlob=async(canvas:HTMLCanvasElement):Promise<Blob>=>{
    const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!result||result.size<50)throw new Error('가림 이미지를 PNG로 출력하지 못했습니다.');
    return result;
};

export const buildPsiMaskedPhotoReviewArchive=async(
    originalZip:Blob,
    verified:EvidencePackageVerification,
    assetPath:string,
    recordId:string,
    regions:readonly PsiPhotoMaskRect[],
    createdAt=new Date().toISOString(),
):Promise<PsiMaskedPhotoResult>=>{
    if(!Number.isFinite(Date.parse(createdAt)))throw new Error('출력시각 형식을 확인하세요.');
    const input=await loadPsiVerifiedPhoto(originalZip,verified,assetPath,recordId);
    if(typeof document==='undefined'||typeof createImageBitmap!=='function')
        throw new Error('이 브라우저는 사진 픽셀 가림 기능을 지원하지 않습니다.');
    let bitmap:ImageBitmap|null=null;
    try {
        bitmap=await createImageBitmap(input.blob,{imageOrientation:'from-image'});
        const width=bitmap.width,height=bitmap.height;
        validatePsiPhotoMasks(regions,width,height);
        const canvas=document.createElement('canvas');
        canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        if(!ctx)throw new Error('사진 픽셀 편집 화면을 만들 수 없습니다.');
        // Flatten the entire new image to opaque pixels; do not reuse original
        // compressed bytes, embedded EXIF/GPS, or JPG thumbnail.
        ctx.fillStyle='#ffffff';
        ctx.fillRect(0,0,width,height);
        ctx.drawImage(bitmap,0,0,width,height);
        applyOpaquePsiPhotoMasks(ctx,regions,width,height);
        // Verify the actual covered pixels, rather than trusting overlay CSS.
        const pixelRects=validatePsiPhotoMasks(regions,width,height);
        for(const rect of pixelRects){
            const sample=ctx.getImageData(rect.x,rect.y,rect.width,rect.height).data;
            for(let i=0;i<sample.length;i+=4){
                if(sample[i]!==0||sample[i+1]!==0||sample[i+2]!==0||sample[i+3]!==255)
                    throw new Error('검은색 가림 영역의 픽셀 검증에 실패했습니다.');
            }
        }
        const png=await canvasBlob(canvas);
        const pngBytes=stripPsiCanvasPngMetadata(new Uint8Array(await png.arrayBuffer()));
        const maskedPngSha256=await digest(pngBytes);
        const JSZip=await ensureJsZip() as ZipCtor|null;
        if(!JSZip)throw new Error('이미지 검토 ZIP 생성 모듈을 불러오지 못했습니다.');
        const output=new JSZip();
        output.file('MASKED_IMAGE.png',pngBytes);
        const manifest:PsiMaskedPhotoResult['manifest']={
            schema:PSI_PHOTO_REDACTION_SCHEMA,
            status:'INTERNAL_PIXEL_MASK_REVIEW_NOT_APPROVED',
            createdAt,sourceZipSha256:verified.zipSha256,
            originalImageSha256:input.sha256,maskedPngSha256,
            imageWidth:width,imageHeight:height,
            blackoutRegions:regions.length,
            maskCoordinates:regions.map(item=>({...item})),
            originalImageIncluded:false,sourceMetadataCopied:false,
            humanVisualInspectionRequired:true,legalDisclosureApproved:false,
            sentToRecipient:false,
            warning:'검은색 사각 영역의 실제 픽셀을 덮어쓴 별도 PNG입니다. '
                +'원본 JPG/WEBP/PNG 메타데이터는 복제하지 않았으며 PNG 메타 청크를 제거했습니다. '
                +'검은 영역 밖의 얼굴·명찰·문서·위치 단서와 문맥은 남아 있을 수 있습니다. '
                +'전체 화면 육안 검토와 독립 승인 전 외부에 제공하지 마세요.',
        };
        const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n');
        output.file('REVIEW_MANIFEST.json',manifestBytes);
        output.file('SHA256SUMS.txt',
            maskedPngSha256+'  MASKED_IMAGE.png\n'
            +await digest(manifestBytes)+'  REVIEW_MANIFEST.json\n');
        const blob=await output.generateAsync({
            type:'blob',compression:'DEFLATE',compressionOptions:{level:6},
        });
        return {blob,manifest,
            zipSha256:await digest(new Uint8Array(await blob.arrayBuffer())),
            fileName:'PSI_INTERNAL_MASKED_PHOTO_REVIEW_'+createdAt.slice(0,10)+'.zip'};
    }finally{bitmap?.close();}
};

export const downloadPsiMaskedPhotoReviewArchive=async(
    zip:Blob,verified:EvidencePackageVerification,path:string,recordId:string,
    regions:readonly PsiPhotoMaskRect[],
):Promise<{fileName:string;zipSha256:string;regions:number}>=>{
    const result=await buildPsiMaskedPhotoReviewArchive(zip,verified,path,recordId,regions);
    const saveAs=await ensureFileSaver();
    if(!saveAs)throw new Error('이미지 저장 기능을 불러오지 못했습니다.');
    saveAs(result.blob,result.fileName);
    return {fileName:result.fileName,zipSha256:result.zipSha256,regions:result.manifest.blackoutRegions};
};
