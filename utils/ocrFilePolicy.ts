export const OCR_FILE_ACCEPT = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/heic',
    'image/heif',
].join(',');

/** Gemini에 원본 그대로 전송할 수 있는 최신 공식 지원 형식. */
export const OCR_DIRECT_AI_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
]);

/** 브라우저에서 JPEG로 변환한 뒤 전송하는 입력 형식. */
export const OCR_CONVERTIBLE_MIME_TYPES = new Set(['image/bmp']);

const SUPPORTED_OCR_MIME_TYPES = new Set([
    ...OCR_DIRECT_AI_MIME_TYPES,
    ...OCR_CONVERTIBLE_MIME_TYPES,
]);

export const OCR_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_OCR_EXTENSIONS = /\.(pdf|png|jpe?g|gif|bmp|webp|heic|heif)$/i;

export const isSupportedOcrFile = (file: Pick<File, 'name' | 'type'>): boolean => {
    const mimeType = String(file.type || '').toLowerCase();
    return SUPPORTED_OCR_MIME_TYPES.has(mimeType) || SUPPORTED_OCR_EXTENSIONS.test(file.name);
};

export const isDirectlySupportedOcrMimeType = (mimeType: string): boolean =>
    OCR_DIRECT_AI_MIME_TYPES.has(String(mimeType || '').trim().toLowerCase());

export const isGatewayProcessableOcrMimeType = (mimeType: string): boolean => {
    const normalized = String(mimeType || '').trim().toLowerCase();
    return OCR_DIRECT_AI_MIME_TYPES.has(normalized) || OCR_CONVERTIBLE_MIME_TYPES.has(normalized);
};
