import { ensureJsZip, ensureFileSaver } from './externalScripts';
import { verifyPsiEvidenceArchive, type EvidencePackageVerification } from './psiEvidenceArchive';

export const PSI_REVIEW_SUBSET_SCHEMA = 'psi-review-subset-v1';

type ZipEntry = { async: (format: 'uint8array') => Promise<Uint8Array> };
type LoadedZip = { file: (path: string) => ZipEntry | null };
type ZipConstructor = new () => {
    file: (path: string, bytes: Uint8Array | string) => void;
    loadAsync: (input: Blob) => Promise<LoadedZip>;
    generateAsync: (settings: {
        type: 'blob'; compression: 'DEFLATE'; compressionOptions: { level: number };
    }) => Promise<Blob>;
};
type FileDigest = { path: string; sha256: string; bytes: number; mimeType: string };

const digest = async (bytes: Uint8Array): Promise<string> =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');

export interface PsiReviewSubsetResult {
    blob: Blob;
    fileName: string;
    zipSha256: string;
    manifest: {
        schema: typeof PSI_REVIEW_SUBSET_SCHEMA;
        status: 'INTERNAL_REVIEW_COPY_NOT_APPROVED_FOR_DISCLOSURE';
        createdAt: string;
        originalZipSha256: string;
        selectedFiles: FileDigest[];
        excludedFileCount: number;
        originalPackageRetained: true;
        disclosureApproved: false;
        privacyRedactionCompleted: false;
        humanContentReviewRequired: true;
        warning: string;
    };
}

/**
 * Create a genuinely reduced COPY containing exactly the selected source
 * bytes. It deliberately makes NO claim of anonymization/redaction/approval
 * and cannot dispatch files to third parties.
 */
export const buildPsiMinimizedReviewArchive = async (
    originalZip: Blob,
    prior: EvidencePackageVerification,
    selectedPaths: readonly string[],
    expectedRecordId: string,
    createdAt = new Date().toISOString(),
): Promise<PsiReviewSubsetResult> => {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256을 사용할 수 없습니다. HTTPS에서 시도하세요.');
    if (!Number.isFinite(Date.parse(createdAt))) throw new Error('파일 작성시각을 확인할 수 없습니다.');
    if (!prior.verified || !prior.externallyAnchored || prior.errors.length ||
        prior.recordId !== expectedRecordId || !/^[a-f0-9]{64}$/.test(prior.zipSha256)) {
        throw new Error('원본 ZIP 해시와 현재 근로자 기록을 먼저 확인해야 합니다.');
    }
    if (!selectedPaths.length || selectedPaths.length > 50 ||
        new Set(selectedPaths).size !== selectedPaths.length) {
        throw new Error('제출 검토 파일을 중복 없이 1~50개 선택하세요.');
    }
    const inventory = new Map(prior.fileInventory.map(file => [file.path, file]));
    if (selectedPaths.some(path => !inventory.has(path))) {
        throw new Error('검증된 원본 ZIP에 없는 파일은 추가할 수 없습니다.');
    }
    // This second verification prevents a different Blob being substituted
    // after the operator inspects the original ZIP.
    const rechecked = await verifyPsiEvidenceArchive(originalZip, prior.zipSha256);
    if (!rechecked.verified || rechecked.recordId !== expectedRecordId ||
        rechecked.zipSha256 !== prior.zipSha256) {
        throw new Error('원본 ZIP의 무결성·기록 ID가 달라졌습니다. 다시 검사하세요.');
    }
    const JSZip = await ensureJsZip() as ZipConstructor | null;
    if (!JSZip) throw new Error('ZIP 모듈을 불러오지 못했습니다.');
    const original = await new JSZip().loadAsync(originalZip);
    const outgoing = new JSZip();
    const selectedFiles: FileDigest[] = [];
    for (const path of selectedPaths) {
        const entry = original.file(path);
        if (!entry) throw new Error('원본 ZIP에서 선택한 파일을 읽을 수 없습니다.');
        const bytes = await entry.async('uint8array');
        const source = inventory.get(path)!;
        const actualHash = await digest(bytes);
        if (bytes.length !== source.bytes || actualHash !== source.sha256) {
            throw new Error('선택 파일이 검증된 원본과 다릅니다: ' + path);
        }
        if (bytes.length > 24 * 1024 * 1024) {
            throw new Error('24MB를 넘는 원본은 검토용 ZIP에 넣을 수 없습니다.');
        }
        outgoing.file('selected/' + path, Uint8Array.from(bytes));
        selectedFiles.push({ path: 'selected/' + path, sha256: actualHash,
            bytes: bytes.length, mimeType: source.mimeType });
    }

    const manifest: PsiReviewSubsetResult['manifest'] = {
        schema: PSI_REVIEW_SUBSET_SCHEMA,
        status: 'INTERNAL_REVIEW_COPY_NOT_APPROVED_FOR_DISCLOSURE',
        createdAt, originalZipSha256: prior.zipSha256,
        selectedFiles,
        excludedFileCount: prior.fileInventory.length - selectedFiles.length,
        originalPackageRetained: true, disclosureApproved: false,
        privacyRedactionCompleted: false, humanContentReviewRequired: true,
        warning: '선택한 원본 파일만 복제했으며 내용은 마스킹하지 않았습니다. '
            + '내부 검토용이며 승인·실제 반출·개인정보 비식별화가 아닙니다. '
            + '이미지와 PDF의 육안 검토, 파일별 개인정보 확인, 별도 승인 후에만 외부 제출 여부를 판단하세요.',
    };
    const json = JSON.stringify(manifest, null, 2) + '\n';
    outgoing.file('REVIEW_MANIFEST.json', json);
    const sums = [
        ...selectedFiles.map(file => file.sha256 + '  ' + file.path),
        await digest(new TextEncoder().encode(json)) + '  REVIEW_MANIFEST.json',
        '',
    ].join('\n');
    outgoing.file('SHA256SUMS.txt', sums);
    const blob = await outgoing.generateAsync({
        type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 },
    });
    const zipSha256 = await digest(new Uint8Array(await blob.arrayBuffer()));
    return {
        blob, zipSha256, manifest,
        fileName: 'PSI_INTERNAL_REVIEW_SUBSET_' + createdAt.slice(0, 10) + '.zip',
    };
};

export const downloadPsiMinimizedReviewArchive = async (
    originalZip: Blob,
    verified: EvidencePackageVerification,
    paths: readonly string[],
    recordId: string,
): Promise<{ fileName: string; zipSha256: string; selectedCount: number }> => {
    const result = await buildPsiMinimizedReviewArchive(originalZip, verified, paths, recordId);
    const saveAs = await ensureFileSaver();
    if (!saveAs) throw new Error('파일 저장 기능을 사용할 수 없습니다.');
    saveAs(result.blob, result.fileName);
    return { fileName: result.fileName, zipSha256: result.zipSha256,
        selectedCount: result.manifest.selectedFiles.length };
};
