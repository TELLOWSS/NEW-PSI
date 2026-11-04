import { canvasToBlob, getCanvasPlacementOnA4 } from './pdfCapture';
import type { EducationPdfPage } from './educationLocalPdf';

interface DecodedPng {
    source: CanvasImageSource;
    width: number;
    height: number;
    method: 'bitmap' | 'local-image';
    release: () => void;
}

const cachedPngError = (detail: string): Error =>
    new Error(`저장된 PNG를 PDF로 변환하지 못했습니다. ${detail} 원본 ZIP을 확인하거나 PDF를 다시 생성해 주세요.`);

const decodeWithBitmap = async (blob: Blob, timeoutMs: number): Promise<DecodedPng | null> => {
    if (typeof createImageBitmap !== 'function') return null;

    // A late ImageBitmap must be closed even after a timeout: otherwise a
    // stalled native decoder can retain high-resolution image memory.
    let expired = false;
    let timer: number | undefined;
    try {
        const pending = createImageBitmap(blob).then(bitmap => {
            if (expired) {
                bitmap.close();
                throw new Error('Late PNG bitmap was discarded');
            }
            return bitmap;
        });
        const bitmap = await Promise.race([
            pending,
            new Promise<never>((_, reject) => {
                timer = window.setTimeout(() => {
                    expired = true;
                    reject(new Error('ImageBitmap decode timeout'));
                }, timeoutMs);
            }),
        ]);
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            method: 'bitmap',
            release: () => bitmap.close(),
        };
    } catch {
        // Some mobile/WebKit builds omit createImageBitmap, reject valid PNGs
        // or stall. The blob-local <img> path does not require any network.
        return null;
    } finally {
        if (timer !== undefined) window.clearTimeout(timer);
    }
};

const decodeWithLocalImage = async (blob: Blob, timeoutMs: number): Promise<DecodedPng> => {
    let url: string;
    try {
        url = URL.createObjectURL(blob);
    } catch {
        throw cachedPngError('이 기기에서 임시 이미지 주소를 만들 수 없습니다.');
    }

    const image = new Image();
    try {
        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const settle = (failure?: Error) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                image.onload = null;
                image.onerror = null;
                if (failure) reject(failure);
                else resolve();
            };
            const timer = window.setTimeout(() => {
                settle(cachedPngError('이미지 읽기 제한시간을 초과했습니다.'));
            }, timeoutMs);
            image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
                ? settle()
                : settle(cachedPngError('이미지 크기를 읽지 못했습니다.'));
            image.onerror = () => settle(cachedPngError('PNG 파일이 손상됐거나 브라우저에서 읽을 수 없습니다.'));
            try {
                image.src = url;
            } catch {
                settle(cachedPngError('이 기기의 이미지 열기 기능이 차단됐습니다.'));
            }
        });

        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            method: 'local-image',
            release: () => URL.revokeObjectURL(url),
        };
    } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
};

/**
 * Re-use an already-exported PNG page as a local A4 PDF page.
 * - ImageBitmap: fast path on supported browsers.
 * - Object URL + HTMLImageElement: Safari/WebKit/Android fallback.
 * Both paths have deadlines; the fallback never fetches a CDN or a server.
 * The working canvas, ImageBitmap and local URL are released even on failure.
 */
export const cachedEducationPngToPdfPage = async (
    png: Blob,
    timeoutMs = 8_000,
): Promise<{ page: EducationPdfPage; method: DecodedPng['method'] }> => {
    if (!(png instanceof Blob) || png.type !== 'image/png' || png.size < 8 || png.size > 25 * 1024 * 1024) {
        throw cachedPngError('PNG 파일 형식 또는 크기가 올바르지 않습니다.');
    }
    const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30_000) : 8_000;
    const decoded = await decodeWithBitmap(png, limit) || await decodeWithLocalImage(png, limit);
    let canvas: HTMLCanvasElement | null = null;
    try {
        const { width, height } = decoded;
        if (!Number.isInteger(width) || !Number.isInteger(height)
            || width < 1 || height < 1 || width > 16_000 || height > 16_000 || width * height > 100_000_000) {
            throw cachedPngError('입력 이미지 크기가 브라우저의 안전한 처리 범위를 넘었습니다.');
        }
        // Some older A4 captures applied the 3x pixel ratio twice, producing
        // ~72 million decoded pixels. Never allocate another giant canvas:
        // a 12MP output still exceeds 300dpi at A4 and preserves aspect ratio.
        const factor = Math.min(1, Math.sqrt(12_000_000 / (width * height)), 5_000 / Math.max(width, height));
        const outputWidth = Math.max(1, Math.round(width * factor));
        const outputHeight = Math.max(1, Math.round(height * factor));
        canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw cachedPngError('이 기기에서 2D 이미지 변환을 사용할 수 없습니다.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, outputWidth, outputHeight);
        context.drawImage(decoded.source, 0, 0, outputWidth, outputHeight);
        const placement = getCanvasPlacementOnA4(canvas);
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.94);
        if (jpeg.type !== 'image/jpeg' || jpeg.size === 0) throw cachedPngError('JPEG 변환을 지원하지 않습니다.');
        return {
            page: {
                jpeg: new Uint8Array(await jpeg.arrayBuffer()),
                pixelWidth: outputWidth,
                pixelHeight: outputHeight,
                placement,
            },
            method: decoded.method,
        };
    } catch (error) {
        throw error instanceof Error ? error : cachedPngError('이미지 변환 과정에서 오류가 발생했습니다.');
    } finally {
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }
        decoded.release();
    }
};
