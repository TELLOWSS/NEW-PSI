import type { WorkerRecord } from '../types';
import { ensureJsZip, ensureFileSaver } from './externalScripts';
import { preparePsiEvidencePackage, PSI_EVIDENCE_PACKAGE_VERSION } from './psiEvidencePackage';

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const hex = (bytes: ArrayBuffer): string =>
    [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

const hashBytes = async (bytes: Uint8Array): Promise<string> => {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 기능을 사용할 수 없습니다. HTTPS 환경에서 다시 실행해 주세요.');
    const buffer = Uint8Array.from(bytes);
    return hex(await crypto.subtle.digest('SHA-256', buffer));
};
const decodeImageBase64 = (text: string): Uint8Array => {
    const raw = atob(text);
    const buffer = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
    return buffer;
};

export interface EvidenceManifest {
    schema: string;
    exportedAt: string;
    cutoffIso: string | null;
    packageKind: 'manager-confidential-local-export';
    fileHashes: Array<{ path: string; sha256: string; bytes: number; mimeType: string }>;
    warning: string;
}

type EvidenceArchive = {
    file: (path: string, content: string | Uint8Array, options?: object) => void;
    generateAsync: (options: { type: 'blob'; compression: 'DEFLATE'; compressionOptions: { level: number } }) => Promise<Blob>;
};

const META_WARNING =
    'SHA-256는 내보낸 파일과 제공된 목록 사이의 무결성 검사용이며, 과거 작성 시점·신원·사진 원본 진위·현장 조치의 실제 이행을 독립적으로 증명하지 않습니다.';

export const buildPsiEvidenceArchive = async (
    record: WorkerRecord,
    options: { cutoffIso?: string | null; exportedAt?: string } = {},
): Promise<{ blob: Blob; manifest: EvidenceManifest; fileName: string; zipSha256: string }> => {
    const JSZipCtor = await ensureJsZip() as (new () => EvidenceArchive) | null;
    if (!JSZipCtor) throw new Error('ZIP 생성 모듈을 불러오지 못했습니다.');
    const exportedAt = options.exportedAt || new Date().toISOString();
    const draft = preparePsiEvidencePackage(record, { exportedAt, cutoffIso: options.cutoffIso });
    const zip = new JSZipCtor();
    const fileHashes: EvidenceManifest['fileHashes'] = [];
    for (const file of draft.files) {
        const bytes = encode(file.text);
        zip.file(file.path, bytes);
        fileHashes.push({ path: file.path, bytes: bytes.byteLength, mimeType: 'text/plain; charset=utf-8', sha256: await hashBytes(bytes) });
    }
    for (const asset of draft.assets) {
        const bytes = decodeImageBase64(asset.base64);
        if (bytes.byteLength > 24 * 1024 * 1024) throw new Error('증빙 원본 이미지가 24MB를 초과합니다. 별도 원본 파일로 보관하고 해당 참조를 등록하세요.');
        zip.file(asset.path, bytes);
        fileHashes.push({ path: asset.path, bytes: bytes.byteLength, mimeType: asset.mimeType, sha256: await hashBytes(bytes) });
    }
    const manifest: EvidenceManifest = {
        schema: PSI_EVIDENCE_PACKAGE_VERSION,
        exportedAt: draft.exportedAt, cutoffIso: draft.cutoffIso,
        packageKind: 'manager-confidential-local-export',
        fileHashes: fileHashes.sort((a,b)=>a.path.localeCompare(b.path)),
        warning: META_WARNING,
    };
    const manifestText = JSON.stringify(manifest, null, 2) + '\n';
    zip.file('manifest.json', encode(manifestText));
    const manifestHash = await hashBytes(encode(manifestText));
    const sums = [
        manifestHash + '  manifest.json',
        ...fileHashes.map(item => item.sha256 + '  ' + item.path),
        '',
    ].join('\n');
    zip.file('SHA256SUMS.txt', encode(sums));
    const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{level:6} });
    const safeRecordId = String(record.id || 'record').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 42);
    const fileName = 'PSI_evidence_' + safeRecordId + '_' + exportedAt.slice(0,10) + '.zip';
    const zipSha256 = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    return { blob, manifest, fileName, zipSha256 };
};

export const downloadPsiEvidenceArchive = async (
    record: WorkerRecord,
    options: { cutoffIso?: string | null } = {},
): Promise<{ name: string; count: number; zipSha256: string }> => {
    const { blob, manifest, fileName, zipSha256 } = await buildPsiEvidenceArchive(record, options);
    const saveAs = await ensureFileSaver();
    if (!saveAs) throw new Error('브라우저 저장 기능을 불러올 수 없습니다.');
    saveAs(blob, fileName);
    return { name: fileName, count: manifest.fileHashes.length + 1, zipSha256 };
};

export interface EvidencePackageVerification {
    verified: boolean;
    checkedFiles: number;
    fileInventory: EvidenceManifest['fileHashes'];
    zipSha256: string;
    externallyAnchored: boolean;
    errors: string[];
    description: string;
}

export const verifyPsiEvidenceArchive = async (input: Blob, expectedZipSha256 = ''): Promise<EvidencePackageVerification> => {
    if (input.size > 65 * 1024 * 1024) throw new Error('검증 가능한 증빙 패키지는 65MB 이하입니다.');
    const zipSha256 = hex(await crypto.subtle.digest('SHA-256', await input.arrayBuffer()));
    const expected = expectedZipSha256.trim().toLowerCase();
    if (expected && !/^[a-f0-9]{64}$/.test(expected)) throw new Error('별도 보관한 SHA-256 값은 64자리 16진수여야 합니다.');
    const JSZipCtor = await ensureJsZip() as (new () => {
        loadAsync: (blob: Blob) => Promise<{
            files: Record<string, { dir: boolean; async: (format: 'string' | 'uint8array') => Promise<string | Uint8Array> }>;
            file: (path: string) => { async: (format: 'string' | 'uint8array') => Promise<string | Uint8Array> } | null;
        }>;
    }) | null;
    if (!JSZipCtor) throw new Error('ZIP 검증 모듈을 불러오지 못했습니다.');
    const zip = await new JSZipCtor().loadAsync(input);
    const manifestFile = zip.file('manifest.json');
    const sumsFile = zip.file('SHA256SUMS.txt');
    if (!manifestFile || !sumsFile) throw new Error('manifest.json 또는 SHA256SUMS.txt가 없는 파일입니다.');
    const manifestText = await manifestFile.async('string') as string;
    const sumsText = await sumsFile.async('string') as string;
    const manifest = JSON.parse(manifestText) as EvidenceManifest;
    if (manifest.schema !== PSI_EVIDENCE_PACKAGE_VERSION || !Array.isArray(manifest.fileHashes)) {
        throw new Error('지원하지 않는 증빙 패키지 형식입니다.');
    }
    const errors: string[] = [];
    const expectedLines = new Map<string, string>();
    for (const line of sumsText.split(/\r?\n/).filter(Boolean)) {
        const match = line.match(/^([a-f0-9]{64})  (.+)$/);
        if (!match || expectedLines.has(match[2])) { errors.push('손상된 해시 목록 또는 중복 경로'); continue; }
        expectedLines.set(match[2], match[1]);
    }
    const allowedEvidencePath = /^(?:record\/(?:snapshot\.json|timeline\.txt)|assets\/[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp))$/;
    for (const entry of manifest.fileHashes) {
        if (!entry || typeof entry.path !== 'string' || !allowedEvidencePath.test(entry.path)
            || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)
            || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
            errors.push('매니페스트의 파일 경로나 검사값이 유효하지 않습니다.');
        }
    }
    const expectedNames = ['manifest.json', ...manifest.fileHashes.map(item => item.path)];
    if (new Set(expectedNames).size !== expectedNames.length) errors.push('매니페스트에 중복 파일명이 있습니다.');
    for (const path of expectedNames) {
        if (!expectedLines.has(path)) { errors.push(path + ': SHA256SUMS 누락'); continue; }
        const stored = zip.file(path);
        if (!stored) { errors.push(path + ': 압축파일 내 누락'); continue; }
        const bytes = await stored.async('uint8array') as Uint8Array;
        const actualHash = await hashBytes(bytes);
        if (actualHash !== expectedLines.get(path)) errors.push(path + ': 해시 불일치');
        const descriptor = manifest.fileHashes.find(item => item.path === path);
        if (descriptor && (descriptor.sha256 !== actualHash || descriptor.bytes !== bytes.length)) errors.push(path + ': 매니페스트 불일치');
    }
    if (expected && expected !== zipSha256) errors.push('독립 보관된 ZIP SHA-256 값과 불일치합니다.');
    const extra = Object.keys(zip.files).filter(path => !zip.files[path].dir && path !== 'SHA256SUMS.txt' && !expectedNames.includes(path));
    if (extra.length || expectedLines.size !== expectedNames.length) errors.push('확인 목록 외 파일이 추가되었거나 목록에 오류가 있습니다.');
    return {
        verified: errors.length === 0,
        checkedFiles: expectedNames.length,
        fileInventory: errors.length ? [] : manifest.fileHashes.map(file => ({...file})),
        zipSha256,
        externallyAnchored: Boolean(expected),
        errors,
        description: errors.length
            ? '파일 무결성 검증에 문제가 있습니다. 원본 ZIP과 내보내기 기록을 다시 확인하세요.'
            : (expected
                ? 'ZIP 전체 해시가 별도 보관한 값과 일치하며 내부 파일도 일치합니다. 해당 해시의 독립 보관시점과 출처는 별도 확인이 필요합니다.'
                : 'ZIP 내부의 파일·해시 목록이 일치합니다. 외부에 보관한 ZIP 해시를 입력하지 않아 이후 변조 여부를 독립적으로 검증한 것은 아닙니다.'),
    };
};
