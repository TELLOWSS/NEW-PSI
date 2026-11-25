import { describe, expect, it } from 'vitest';
import { assertOcrPdfSplitBounds, getOcrPdfPageName } from '../utils/ocrLocalPdfSplit';
import {
    calculatePixelQualityMetrics,
    buildOcrUploadIssues,
    mergeUniqueOcrFiles,
} from '../utils/ocrUploadQuality';

const fileStub = (name: string, size: number, lastModified: number) => ({
    name,
    size,
    lastModified,
}) as File;

describe('OCR upload preflight utilities', () => {
    it('does not block OCR based only on thumbnail brightness, blur, or page shape', () => {
        const issues = buildOcrUploadIssues(300, 1600, { meanLuminance: 30, contrast: 10, brightPixelRatio: 0.3, laplacianVariance: 5 });
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.every(issue => issue.severity === 'warning')).toBe(true);
    });
    it('does not mislabel high-contrast white paper as glare based on bright pixels alone', () => {
        const issues = buildOcrUploadIssues(1400, 2000, { meanLuminance: 225, contrast: 65, brightPixelRatio: 0.8, laplacianVariance: 150 });
        expect(issues.some(issue => issue.code === 'POSSIBLE_GLARE')).toBe(false);
    });
    it('adds files without replacing the existing selection and skips duplicates', () => {
        const first = fileStub('first.jpg', 100, 1);
        const second = fileStub('second.jpg', 200, 2);
        const result = mergeUniqueOcrFiles([first], [first, second]);

        expect(result.files).toEqual([first, second]);
        expect(result.addedCount).toBe(1);
        expect(result.duplicateCount).toBe(1);
    });

    it('supports 3-page legacy records without widening the server document contract', () => {
        expect(getOcrPdfPageName('2025년기록.pdf', 1, 3)).toBe('2025년기록__p01_of_03.jpg');
        expect(getOcrPdfPageName('기록표.PDF', 3, 3)).toBe('기록표__p03_of_03.jpg');
        expect(() => getOcrPdfPageName('record.pdf', 4, 3)).toThrow();
        expect(() => assertOcrPdfSplitBounds(3, 4.3 * 1024 * 1024)).not.toThrow();
        expect(() => assertOcrPdfSplitBounds(13, 1000)).toThrow();
        expect(() => assertOcrPdfSplitBounds(0, 1000)).toThrow();
        expect(() => assertOcrPdfSplitBounds(3, 21 * 1024 * 1024)).toThrow();
    });

    it('preserves other uploads while replacing an already queued multi-page PDF',()=>{
        const original=fileStub('legacy.pdf', 4200000, 456);
        const unrelated=fileStub('unrelated.jpg', 500000, 123);
        const page1=fileStub('legacy__p01_of_03.jpg', 510000, 456);
        const page2=fileStub('legacy__p02_of_03.jpg', 480000, 456);
        const page3=fileStub('legacy__p03_of_03.jpg', 850000, 456);
        const existing=[unrelated, original];
        const retained=existing.filter(item=>
            item.name !== original.name || item.size !== original.size || item.lastModified !== original.lastModified);
        const result=mergeUniqueOcrFiles(retained,[page1,page2,page3]);
        expect(result.files).toEqual([unrelated,page1,page2,page3]);
        expect(result.files).not.toContain(original);
        expect(mergeUniqueOcrFiles(result.files,[page1,page2,page3]).addedCount).toBe(0);
        expect(existing).toContain(original);
    });

    it('detects a flat image as low contrast and low sharpness', () => {
        const width = 12;
        const height = 12;
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let index = 0; index < pixels.length; index += 4) {
            pixels[index] = 128;
            pixels[index + 1] = 128;
            pixels[index + 2] = 128;
            pixels[index + 3] = 255;
        }

        const metrics = calculatePixelQualityMetrics(pixels, width, height);
        expect(metrics.meanLuminance).toBeCloseTo(128, 0);
        expect(metrics.contrast).toBeCloseTo(0, 4);
        expect(metrics.laplacianVariance).toBeCloseTo(0, 4);
    });
});
