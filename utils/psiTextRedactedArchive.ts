import { ensureJsZip, ensureFileSaver } from './externalScripts';
import { verifyPsiEvidenceArchive, type EvidencePackageVerification } from './psiEvidenceArchive';
import { redactPsiTextContent, normalizePsiPrivacyTerms } from './psiTextPrivacyRedaction';

export const PSI_TEXT_REDACTED_ARCHIVE_SCHEMA = 'psi-text-redacted-internal-review-v1';

type ZipFile = { async: (format: 'uint8array') => Promise<Uint8Array> };
type ZipCtor = new () => {
    file: (path: string, bytes: Uint8Array | string) => void;
    loadAsync: (blob: Blob) => Promise<{file: (path: string) => ZipFile | null}>;
    generateAsync: (settings: {
        type:'blob'; compression:'DEFLATE'; compressionOptions:{level:number};
    }) => Promise<Blob>;
};

const hash = async (bytes:Uint8Array):Promise<string> =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))]
        .map(byte=>byte.toString(16).padStart(2,'0')).join('');
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8',{fatal:true});
const allowedPaths = new Set(['record/snapshot.json','record/timeline.txt']);

export interface PsiRedactedReviewCopy {
    blob: Blob;
    fileName: string;
    zipSha256: string;
    manifest: {
        schema:typeof PSI_TEXT_REDACTED_ARCHIVE_SCHEMA;
        status:'LOCAL_TEXT_REVIEW_REDACTION_INCOMPLETE';
        createdAt:string;
        originalZipSha256:string;
        includedFiles:Array<{path:string;sha256:string;bytes:number;format:'json'|'txt';replacedSensitiveFields:number}>;
        excludedSourceFiles:number;
        imagesExcluded:true;
        automatedPersonalDataClearance:false;
        humanContentReviewRequired:true;
        legallyApprovedForRelease:false;
        sentToRecipient:false;
        warning:string;
    };
}

export const buildPsiTextRedactedReviewArchive = async (
    originalZip:Blob,
    verified:EvidencePackageVerification,
    selectedPaths:readonly string[],
    expectedRecordId:string,
    manualSensitiveTerms:readonly string[],
    createdAt=new Date().toISOString(),
):Promise<PsiRedactedReviewCopy> => {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256은 HTTPS 환경에서 사용할 수 있습니다.');
    if (!Number.isFinite(Date.parse(createdAt))) throw new Error('생성시각 형식을 확인하세요.');
    if (!verified.verified || !verified.externallyAnchored || verified.errors.length
        || verified.recordId !== expectedRecordId || !/^[a-f0-9]{64}$/.test(verified.zipSha256)) {
        throw new Error('현재 근로자 기록과 원본 ZIP 해시를 먼저 대조하세요.');
    }
    if (!selectedPaths.length || selectedPaths.length > 2
        || new Set(selectedPaths).size !== selectedPaths.length
        || selectedPaths.some(path => !allowedPaths.has(path))) {
        throw new Error('문서 2종(JSON/TXT)만 선택할 수 있습니다. 사진·PDF는 별도 가림 검증 전까지 제외됩니다.');
    }
    const manual = normalizePsiPrivacyTerms(manualSensitiveTerms);
    if (!manual.length) {
        throw new Error('근로자 이름 등 직접 가릴 식별 문구를 하나 이상 입력하세요.');
    }
    const current = await verifyPsiEvidenceArchive(originalZip, verified.zipSha256);
    if (!current.verified || current.recordId !== expectedRecordId || current.zipSha256 !== verified.zipSha256) {
        throw new Error('원본 ZIP이 바뀌었거나 기록 ID가 일치하지 않습니다.');
    }
    const inventory = new Map(current.fileInventory.map(file=>[file.path,file]));
    const JSZip=await ensureJsZip() as ZipCtor | null;
    if (!JSZip) throw new Error('ZIP 생성 기능을 사용할 수 없습니다.');
    const source=await new JSZip().loadAsync(originalZip);
    const target=new JSZip();
    const includedFiles:PsiRedactedReviewCopy['manifest']['includedFiles']=[];
    let fileNumber=0;
    for (const path of selectedPaths) {
        const sourceInfo=inventory.get(path);
        const entry=source.file(path);
        if (!sourceInfo || !entry) throw new Error('검증된 원본에서 선택한 텍스트를 확인할 수 없습니다.');
        const originalBytes=await entry.async('uint8array');
        if (originalBytes.length !== sourceInfo.bytes || await hash(originalBytes) !== sourceInfo.sha256) {
            throw new Error('원본 텍스트 바이트·해시가 변경되었습니다.');
        }
        if (originalBytes.length > 4 * 1024 * 1024) throw new Error('4MB 초과 텍스트는 별도 검토가 필요합니다.');
        const format=path.endsWith('.json')?'json':'txt';
        const result=redactPsiTextContent(textDecoder.decode(originalBytes),format,manual);
        const bytes=textEncoder.encode(result.text);
        fileNumber+=1;
        // Generate non-identifying names rather than copying user filenames.
        const outputPath='REVIEW_TEXT_'+String(fileNumber).padStart(2,'0')+'.'+format;
        target.file(outputPath,bytes);
        includedFiles.push({path:outputPath,sha256:await hash(bytes),bytes:bytes.length,
            format,replacedSensitiveFields:result.replacedSensitiveFields});
    }
    const manifest:PsiRedactedReviewCopy['manifest']={
        schema:PSI_TEXT_REDACTED_ARCHIVE_SCHEMA,
        status:'LOCAL_TEXT_REVIEW_REDACTION_INCOMPLETE',
        createdAt,originalZipSha256:verified.zipSha256,
        includedFiles,
        excludedSourceFiles:verified.fileInventory.length-includedFiles.length,
        imagesExcluded:true,automatedPersonalDataClearance:false,
        humanContentReviewRequired:true,legallyApprovedForRelease:false,
        sentToRecipient:false,
        warning:'전화번호·이메일·주민번호 형식 및 입력한 이름/식별 문구, 일부 식별 필드를 가린 내부 검토 사본입니다. '
            +'사진·PDF는 포함하지 않았으며 이름 변형·외국어 표기·장소·사건맥락 등에 의한 재식별 가능성이 남습니다. '
            +'전체 문서의 수동 검수 및 독립 승인 전에는 외부 공개하지 마세요.',
    };
    const manifestBytes=textEncoder.encode(JSON.stringify(manifest,null,2)+'\n');
    target.file('REVIEW_MANIFEST.json',manifestBytes);
    target.file('SHA256SUMS.txt',[
        ...includedFiles.map(item=>item.sha256+'  '+item.path),
        await hash(manifestBytes)+'  REVIEW_MANIFEST.json','',
    ].join('\n'));
    const blob=await target.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    return {
        blob,manifest,
        zipSha256:await hash(new Uint8Array(await blob.arrayBuffer())),
        fileName:'PSI_INTERNAL_TEXT_PRIVACY_REVIEW_'+createdAt.slice(0,10)+'.zip',
    };
};

export const downloadPsiTextRedactedReviewArchive = async (
    originalZip:Blob,
    verified:EvidencePackageVerification,
    paths:readonly string[],
    recordId:string,
    sensitiveTerms:readonly string[],
):Promise<{fileName:string;zipSha256:string;count:number}> => {
    const result=await buildPsiTextRedactedReviewArchive(
        originalZip,verified,paths,recordId,sensitiveTerms);
    const saveAs=await ensureFileSaver();
    if (!saveAs) throw new Error('파일 저장 기능을 사용할 수 없습니다.');
    saveAs(result.blob,result.fileName);
    return {fileName:result.fileName,zipSha256:result.zipSha256,count:result.manifest.includedFiles.length};
};
