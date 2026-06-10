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

const SUPPORTED_OCR_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/heic',
    'image/heif',
]);

export const OCR_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_OCR_EXTENSIONS = /\.(pdf|png|jpe?g|gif|bmp|webp|heic|heif)$/i;

export const isSupportedOcrFile = (file: Pick<File, 'name' | 'type'>): boolean => {
    const mimeType = String(file.type || '').toLowerCase();
    return SUPPORTED_OCR_MIME_TYPES.has(mimeType) || SUPPORTED_OCR_EXTENSIONS.test(file.name);
};
