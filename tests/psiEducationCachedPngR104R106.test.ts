import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cachedEducationPngToPdfPage } from '../utils/educationCachedPngPdf';

describe('PSI R104–R106 cached A4 PNG to PDF conversion / mobile fallback', () => {
    it('refuses missing, empty, oversized, and mislabeled PNG blobs before allocating any image memory', async () => {
        await expect(cachedEducationPngToPdfPage(new Blob())).rejects.toThrow(/PNG 파일 형식 또는 크기/);
        await expect(cachedEducationPngToPdfPage(new Blob(['not a png'], { type: 'image/jpeg' }))).rejects.toThrow(/PNG 파일 형식 또는 크기/);
        await expect(cachedEducationPngToPdfPage(new Blob([new Uint8Array(26 * 1024 * 1024)], { type: 'image/png' })))
            .rejects.toThrow(/PNG 파일 형식 또는 크기/);
    });

    it('keeps the native decoder optional and an entirely local image fallback with explicit timeouts', () => {
        const source = readFileSync('utils/educationCachedPngPdf.ts', 'utf8');
        expect(source).toContain("typeof createImageBitmap !== 'function'");
        expect(source).toContain('createImageBitmap(blob).then(bitmap =>');
        expect(source).toContain('bitmap.close()');
        expect(source).toContain('new Image()');
        expect(source).toContain('URL.createObjectURL(blob)');
        expect(source).toContain('URL.revokeObjectURL(url)');
        expect(source).toContain('window.setTimeout');
        expect(source).toContain('image.onload = null;');
        expect(source).toContain('image.onerror = null;');
        expect(source).toContain('canvas.width = 0');
        expect(source).toContain('canvas.height = 0');
        expect(source).toContain('Math.sqrt(12_000_000 / (width * height))');
        expect(source).toContain('context.drawImage(decoded.source, 0, 0, outputWidth, outputHeight)');
        expect(source).not.toContain('fetch(');
        expect(source).not.toContain('cdnjs.');
    });

    it('reclaims the isolated A4 capture host when image readiness throws before cleanup is returned', () => {
        const source = readFileSync('utils/pdfCapture.ts', 'utf8');
        const start = source.indexOf('const createIsolatedCaptureTarget');
        const end = source.indexOf('export const captureReportCanvas', start);
        const snippet = source.slice(start, end);
        expect(snippet).toContain('await waitForStableLayout(clone, assetTimeoutMs)');
        expect(snippet).toContain('} catch (error) {');
        expect(snippet).toContain('host.remove();');
        expect(snippet).toContain('throw error;');
        expect(source).toContain('canvasWidth: Math.round(width * (options.strictLocalCapture ? 1 : scale))');
        expect(source).toContain('canvasHeight: Math.round(height * (options.strictLocalCapture ? 1 : scale))');
    });

    it('only uses cached local PNG and never falsely treats PDF export as human review', () => {
        const source = readFileSync('pages/A4EducationMaterial.tsx', 'utf8');
        expect(source).toContain('const converted = await cachedEducationPngToPdfPage(source.content)');
        expect(source).toContain("converted.method === 'local-image'");
        expect(source).toContain('pdfPages.push(converted.page)');
        expect(source).toContain('setPreparedBundle(null)');
        expect(source).toContain('묶음 다운로드는 요청하지 않았습니다');
        expect(source).toContain('출력물 현장 확인기록');
        expect(source).not.toContain('await createImageBitmap(source.content)');
    });
});
