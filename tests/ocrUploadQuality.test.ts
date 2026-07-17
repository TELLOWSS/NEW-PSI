import { describe, expect, it } from 'vitest';
import {
    calculatePixelQualityMetrics,
    mergeUniqueOcrFiles,
} from '../utils/ocrUploadQuality';

const fileStub = (name: string, size: number, lastModified: number) => ({
    name,
    size,
    lastModified,
}) as File;

describe('OCR upload preflight utilities', () => {
    it('adds files without replacing the existing selection and skips duplicates', () => {
        const first = fileStub('first.jpg', 100, 1);
        const second = fileStub('second.jpg', 200, 2);
        const result = mergeUniqueOcrFiles([first], [first, second]);

        expect(result.files).toEqual([first, second]);
        expect(result.addedCount).toBe(1);
        expect(result.duplicateCount).toBe(1);
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
