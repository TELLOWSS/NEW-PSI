import { OCR_GATEWAY_MAX_LONG_EDGE, OCR_GATEWAY_TARGET_BYTES } from './ocrGatewayPayload';

export const OCR_LOCAL_PDF_SPLIT_MAX_PAGES = 12;
export const OCR_LOCAL_PDF_SPLIT_MAX_BYTES = 20 * 1024 * 1024;
const MAX_RENDER_PIXELS = 12_000_000;

/** A single page is a separate worker record; never combine pages into one OCR result. */
export const getOcrPdfPageName = (filename: string, page: number, total: number): string => {
    if (!Number.isInteger(page) || !Number.isInteger(total) || page < 1 || total < page)
        throw new Error('PDF 페이지 번호가 올바르지 않습니다.');
    const base = String(filename || 'record').replace(/\.pdf$/i, '')
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').trim().slice(0, 105) || 'record';
    const digits = Math.max(2, String(total).length);
    return base + '__p' + String(page).padStart(digits, '0') + '_of_' + String(total).padStart(digits, '0') + '.jpg';
};

export const assertOcrPdfSplitBounds = (pages: number, bytes: number): void => {
    if (!Number.isInteger(pages) || pages < 1 || pages > OCR_LOCAL_PDF_SPLIT_MAX_PAGES)
        throw new Error('1~12페이지 PDF만 기기에서 나눌 수 있습니다.');
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > OCR_LOCAL_PDF_SPLIT_MAX_BYTES)
        throw new Error('20MB 이하의 PDF만 기기에서 나눌 수 있습니다.');
};

const loadPdf = async (file: File) => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        stopAtErrors: true, enableXfa: false,
        maxImageSize: 16_000_000,
    });
};

export const inspectLocalPdfForOcr = async (file: File): Promise<{ pages: number; sizeOk: boolean }> => {
    const task = await loadPdf(file);
    try {
        const doc = await task.promise;
        return { pages: doc.numPages, sizeOk: file.size <= OCR_GATEWAY_TARGET_BYTES };
    } finally {
        await task.destroy().catch(() => undefined);
    }
};

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
    new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PDF 이미지를 변환하지 못했습니다.')), 'image/jpeg', quality));

/** User-triggered, browser-local only. All pages succeed or no images are returned. */
export const splitOcrPdfLocally = async (
    file: File,
    onProgress?: (page: number, total: number) => void,
): Promise<File[]> => {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')
        throw new Error('PDF 파일을 선택해 주세요.');
    if (file.size > OCR_LOCAL_PDF_SPLIT_MAX_BYTES)
        throw new Error('20MB 이하의 PDF만 기기에서 나눌 수 있습니다.');
    const task = await loadPdf(file);
    try {
        const doc = await task.promise;
        assertOcrPdfSplitBounds(doc.numPages, file.size);
        const images: File[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
            onProgress?.(n, doc.numPages);
            const page = await doc.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const area = base.width * base.height;
            if (!(area > 0)) throw new Error('PDF 페이지의 크기를 확인할 수 없습니다.');
            let scale = Math.min(OCR_GATEWAY_MAX_LONG_EDGE / Math.max(base.width, base.height), Math.sqrt(MAX_RENDER_PIXELS / area));
            let jpeg: Blob | null = null;
            try {
                for (const quality of [0.95, 0.92, 0.89, 0.85, 0.82]) {
                    const viewport = page.getViewport({ scale });
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(viewport.width));
                    canvas.height = Math.max(1, Math.round(viewport.height));
                    const context = canvas.getContext('2d', { alpha: false });
                    if (!context) throw new Error('PDF 페이지를 표시할 수 없습니다.');
                    try {
                        context.fillStyle = '#ffffff';
                        context.fillRect(0, 0, canvas.width, canvas.height);
                        await page.render({ canvas, canvasContext: context, viewport }).promise;
                        jpeg = await toJpeg(canvas, quality);
                    } finally {
                        canvas.width = 0;
                        canvas.height = 0;
                    }
                    if (jpeg.size <= OCR_GATEWAY_TARGET_BYTES) break;
                    scale *= 0.87;
                }
            } finally {
                page.cleanup();
            }
            if (!jpeg || jpeg.size > OCR_GATEWAY_TARGET_BYTES)
                throw new Error(String(n) + '페이지의 이미지 용량을 줄이지 못했습니다. 원본을 별도로 분리해 주세요.');
            images.push(new File([jpeg], getOcrPdfPageName(file.name, n, doc.numPages), { type: 'image/jpeg' }));
        }
        return images;
    } finally {
        await task.destroy().catch(() => undefined);
    }
};
