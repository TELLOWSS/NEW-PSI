import { fileToBase64 } from './fileUtils';
import {
    isDirectlySupportedOcrMimeType,
    isGatewayProcessableOcrMimeType,
} from './ocrFilePolicy';

/** Base64/JSON 오버헤드를 포함해 Vercel 4.5MB 함수 요청 한도 안에 남기는 원본 상한. */
export const OCR_GATEWAY_TARGET_BYTES = 2.85 * 1024 * 1024;
export const OCR_GATEWAY_MAX_LONG_EDGE = 3_508;
/** 현재 OCR 응답은 한 장의 PSI 기록만 반환하므로 PDF도 문서당 한 페이지만 허용한다. */
export const OCR_GATEWAY_MAX_PDF_PAGES = 1;

const BASE64_HEADER_PATTERN = /^data:([^;,]+);base64,/i;

const normalizeBase64 = (value: string): string => {
    const withoutHeader = String(value || '').trim().replace(BASE64_HEADER_PATTERN, '');
    const normalized = withoutHeader.replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    return `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
};

const decodeBase64 = (value: string): Uint8Array => {
    const normalized = normalizeBase64(value);
    if (!normalized || typeof atob !== 'function') {
        throw new Error('OCR 원본의 base64 데이터를 읽을 수 없습니다.');
    }
    let decoded = '';
    try {
        decoded = atob(normalized);
    } catch {
        throw new Error('OCR 원본의 base64 데이터가 손상되었습니다.');
    }
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
};

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
    Array.from(bytes.slice(start, start + length)).map((byte) => String.fromCharCode(byte)).join('');

export const detectOcrSourceMimeType = (source: string): string => {
    const headerMime = String(source || '').trim().match(BASE64_HEADER_PATTERN)?.[1]?.toLowerCase();
    const bytes = decodeBase64(source).slice(0, 32);
    if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (ascii(bytes, 0, 3) === 'GIF') return 'image/gif';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
    if (ascii(bytes, 0, 2) === 'BM') return 'image/bmp';
    if (ascii(bytes, 4, 4) === 'ftyp') {
        const brand = ascii(bytes, 8, 4).toLowerCase();
        if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
        if (['heif', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand)) return 'image/heif';
    }
    if (headerMime && isGatewayProcessableOcrMimeType(headerMime)) return headerMime;
    throw new Error('지원 형식을 확인할 수 없습니다. PDF, JPG, PNG, GIF, WebP, HEIC/HEIF 또는 BMP 파일을 사용해 주세요.');
};

const extensionForMimeType = (mimeType: string): string => {
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/gif') return '.gif';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/heic') return '.heic';
    if (mimeType === 'image/heif') return '.heif';
    if (mimeType === 'image/bmp') return '.bmp';
    return '.jpg';
};

const sourceToFile = (source: string, filenameHint: string): File => {
    const mimeType = detectOcrSourceMimeType(source);
    const bytes = decodeBase64(source);
    const safeBaseName = String(filenameHint || 'psi-document')
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
        .trim()
        .slice(0, 120) || 'psi-document';
    const hasExtension = /\.[a-z0-9]{2,5}$/i.test(safeBaseName);
    const filename = hasExtension ? safeBaseName : `${safeBaseName}${extensionForMimeType(mimeType)}`;
    return new File([bytes], filename, { type: mimeType });
};

const resolveFileMimeType = async (file: File): Promise<string> => {
    const declared = String(file.type || '').toLowerCase();
    if (isGatewayProcessableOcrMimeType(declared)) return declared;
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.pdf')) return 'application/pdf';
    if (lowerName.endsWith('.heic')) return 'image/heic';
    if (lowerName.endsWith('.heif')) return 'image/heif';
    if (lowerName.endsWith('.bmp')) return 'image/bmp';
    return detectOcrSourceMimeType(await fileToBase64(file));
};

const assertSinglePagePdf = async (file: File): Promise<void> => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerUrl = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    const loadingTask = pdfjs.getDocument({
        data: await file.arrayBuffer(),
        stopAtErrors: true,
        maxImageSize: 16_000_000,
        enableXfa: false,
    });
    try {
        const document = await loadingTask.promise;
        if (document.numPages > OCR_GATEWAY_MAX_PDF_PAGES) {
            throw new Error(`PDF는 PSI 기록 1건당 ${OCR_GATEWAY_MAX_PDF_PAGES}페이지만 분석할 수 있습니다. 페이지를 각각 분리해 업로드해 주세요.`);
        }
    } finally {
        await loadingTask.destroy();
    }
};

type DecodedImage = {
    source: CanvasImageSource;
    width: number;
    height: number;
    close: () => void;
};

const decodeImage = async (file: File): Promise<DecodedImage> => {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            close: () => bitmap.close(),
        };
    }

    if (typeof Image === 'undefined' || typeof URL === 'undefined') {
        throw new Error('이 브라우저에서는 OCR 이미지 크기를 안전하게 확인할 수 없습니다.');
    }
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('OCR 이미지를 열 수 없습니다.'));
            element.src = objectUrl;
        });
        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            close: () => URL.revokeObjectURL(objectUrl),
        };
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('OCR 전송용 이미지 변환에 실패했습니다.'));
    }, 'image/jpeg', quality);
});

const encodeImageForGateway = async (file: File, mimeType: string): Promise<string> => {
    let decoded: DecodedImage;
    try {
        decoded = await decodeImage(file);
    } catch (error) {
        if (isDirectlySupportedOcrMimeType(mimeType) && file.size <= OCR_GATEWAY_TARGET_BYTES) {
            // HEIC/HEIF처럼 브라우저 디코더가 없지만 Gemini가 직접 지원하는 형식은 서버 token guard에 맡긴다.
            return fileToBase64(file);
        }
        throw new Error(`이미지를 JPEG로 변환할 수 없습니다. JPG 또는 PNG로 다시 저장해 주세요. (${String((error as Error)?.message || error)})`);
    }

    try {
        const requiresConversion = mimeType === 'image/bmp';
        const longEdge = Math.max(decoded.width, decoded.height);
        const requiresResize = longEdge > OCR_GATEWAY_MAX_LONG_EDGE;
        if (!requiresConversion && !requiresResize && file.size <= OCR_GATEWAY_TARGET_BYTES) {
            return fileToBase64(file);
        }

        let scale = Math.min(1, OCR_GATEWAY_MAX_LONG_EDGE / Math.max(1, longEdge));
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('OCR 전송용 이미지 캔버스를 만들 수 없습니다.');

        for (const quality of [0.94, 0.9, 0.86, 0.82]) {
            canvas.width = Math.max(1, Math.round(decoded.width * scale));
            canvas.height = Math.max(1, Math.round(decoded.height * scale));
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
            const blob = await canvasToBlob(canvas, quality);
            if (blob.size <= OCR_GATEWAY_TARGET_BYTES) {
                const jpegName = file.name.replace(/\.[^.]+$/, '') || 'psi-document';
                return fileToBase64(new File([blob], `${jpegName}.jpg`, { type: 'image/jpeg' }));
            }
            scale *= 0.88;
        }
    } finally {
        decoded.close();
    }

    throw new Error('이미지를 안전 전송 크기로 줄이지 못했습니다. 문서가 화면에 꽉 차도록 다시 촬영해 주세요.');
};

/**
 * 운영 OCR은 서버를 통과하므로 모든 사진의 실제 해상도를 확인하고 필요한 경우 고품질 JPEG로 축소한다.
 * 300-DPI A4의 긴 변(약 3,508px)은 보존해 수기 판독 정밀도를 과도하게 희생하지 않는다.
 */
export const prepareOcrFileForGateway = async (file: File): Promise<string> => {
    const mimeType = await resolveFileMimeType(file);
    if (!isGatewayProcessableOcrMimeType(mimeType)) {
        throw new Error('지원하지 않는 OCR 파일 형식입니다.');
    }
    if (mimeType === 'application/pdf') {
        if (file.size > OCR_GATEWAY_TARGET_BYTES) {
            throw new Error('PDF가 서버 안전 전송 한도(약 2.8MB)를 넘습니다. 필요한 페이지만 분리하거나 용량을 줄여 다시 업로드해 주세요.');
        }
        await assertSinglePagePdf(file);
        return fileToBase64(file);
    }
    return encodeImageForGateway(file, mimeType);
};

/** 저장된 base64 원본도 신규 업로드와 같은 해상도·형식·페이지·본문 크기 정책을 통과시킨다. */
export const prepareOcrSourceForGateway = async (
    source: string,
    filenameHint = 'psi-document',
): Promise<string> => {
    return prepareOcrFileForGateway(sourceToFile(source, filenameHint));
};
