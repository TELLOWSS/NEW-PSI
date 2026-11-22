import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Legacy scanned multi-page PDF upload guard', () => {
    it('does not weaken the server single-page constraint', () => {
        expect(source('utils/ocrGatewayPayload.ts')).toContain('OCR_GATEWAY_MAX_PDF_PAGES = 1');
        expect(source('api/gateway.ts')).toContain('OCR_RETRY_MAX_PDF_PAGES = 1');
    });
    it('splits only on explicit local request without persistence or remote calls', () => {
        const file = source('utils/ocrLocalPdfSplit.ts');
        expect(file).toContain("pdfjs-dist/legacy/build/pdf.mjs");
        expect(file).toContain('onProgress?.(n, doc.numPages)');
        expect(file).toContain('return images;');
        expect(file).not.toMatch(/fetch\s*\(|sendBeacon|localStorage|indexedDB|supabase/);
        const ui = source('components/FileUpload.tsx');
        expect(ui).toContain('여러 장 PDF 페이지별 나누기');
        expect(ui).toContain('splitOcrPdfLocally');
        expect(ui).toContain('onFilesChange(merged.files)');
        expect(source('utils/ocrLocalPdfSplit.ts')).toContain('lastModified: file.lastModified');
        expect(ui).not.toContain('await onAnalyze(');
    });
    it('requires real synthetic PDF raster verification in Chromium CI',()=>{
        const flow=source('.github/workflows/psi-company-wide.yml');
        expect(flow).toContain('node scripts/verify-psi-legacy-pdf-split.mjs');
        expect(flow).toContain('artifacts/audit/psi-legacy-pdf-split/');
        expect(source('scripts/verify-psi-legacy-pdf-split.mjs')).toContain('Repeat split must not add duplicate pages');
    });
    it('does not display multi-page, oversize or damaged PDF as ready', () => {
        const preflight = source('utils/ocrUploadQuality.ts');
        for (const item of ['PDF_PAGE_SPLIT_REQUIRED', 'PDF_TOO_LARGE', 'PDF_OPEN_FAILED'])
            expect(preflight).toContain(item);
    });
});
