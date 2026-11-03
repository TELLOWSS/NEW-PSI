import { getA4LanguagePolicy, isA4TrainingLanguageCode } from './a4LanguagePolicy';

export interface EducationZipFile {
    name: string;
    content: Blob;
}

/** A4 output has two independent lang markers. Never label an old rendered poster as a new language. */
export const isMatchingA4Language = (
    requested: string,
    pageLanguage: string | null,
    posterLanguage: string | null,
): boolean => isA4TrainingLanguageCode(requested)
    && getA4LanguagePolicy(requested).lang === pageLanguage
    && requested === posterLanguage;

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        table[i] = crc >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};
const put16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const put32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value >>> 0, true);

/**
 * Builds a single PNG archive without JSZip, CDN, compression, uploads or paid calls.
 * PNG is already compressed; ZIP's STORE method avoids costly phone-side recompression.
 * Rejects unsafe names and excessive archives before starting a download.
 */
export const buildEducationPngZip = async (files: readonly EducationZipFile[]): Promise<Blob> => {
    if (!files.length || files.length > 20) {
        throw new Error('한 번에 보관할 PNG 파일은 1~20개여야 합니다.');
    }
    const encoder = new TextEncoder();
    const names = new Set<string>();
    const localParts: BlobPart[] = [];
    const centralParts: BlobPart[] = [];
    let offset = 0;
    let centralSize = 0;
    let totalBytes = 0;
    for (const file of files) {
        const name = file.name;
        if (!name || /[\\/\u0000-\u001f\u007f]/.test(name) || name === '.' || name === '..' || !/\.png$/i.test(name)) {
            throw new Error('PNG 보관 파일 이름을 확인할 수 없습니다.');
        }
        const nameBytes = encoder.encode(name);
        if (nameBytes.byteLength > 240 || names.has(name)) throw new Error('PNG 파일 이름이 중복되거나 너무 깁니다.');
        names.add(name);
        if (!(file.content instanceof Blob) || file.content.size === 0 || file.content.size > 25 * 1024 * 1024) {
            throw new Error('PNG 이미지 1개가 비어 있거나 25MB를 초과합니다.');
        }
        totalBytes += file.content.size;
        if (totalBytes > 100 * 1024 * 1024) {
            throw new Error('PNG 묶음이 100MB를 초과합니다. 언어별로 나누어 저장해 주세요.');
        }
        const bytes = new Uint8Array(await file.content.arrayBuffer());
        const checksum = crc32(bytes);
        const local = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(local.buffer);
        put32(localView, 0, 0x04034b50);
        put16(localView, 4, 20); // version needed to extract
        put16(localView, 6, 0x0800); // UTF-8 file names
        put16(localView, 8, 0); // STORE, no compression
        put32(localView, 14, checksum);
        put32(localView, 18, bytes.length);
        put32(localView, 22, bytes.length);
        put16(localView, 26, nameBytes.length);
        local.set(nameBytes, 30);
        localParts.push(local, bytes);

        const central = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(central.buffer);
        put32(centralView, 0, 0x02014b50);
        put16(centralView, 4, 20);
        put16(centralView, 6, 20);
        put16(centralView, 8, 0x0800);
        put16(centralView, 10, 0);
        put32(centralView, 16, checksum);
        put32(centralView, 20, bytes.length);
        put32(centralView, 24, bytes.length);
        put16(centralView, 28, nameBytes.length);
        put32(centralView, 42, offset);
        central.set(nameBytes, 46);
        centralParts.push(central);
        offset += local.byteLength + bytes.byteLength;
        centralSize += central.byteLength;
    }
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    put32(endView, 0, 0x06054b50);
    put16(endView, 8, files.length);
    put16(endView, 10, files.length);
    put32(endView, 12, centralSize);
    put32(endView, 16, offset);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
};

/** A click requests one browser download; success is not proof the file reached the device. */
export const requestEducationDownload = (blob: Blob, filename: string): void => {
    if (!blob.size) throw new Error('다운로드할 파일이 비어 있습니다.');
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
};
