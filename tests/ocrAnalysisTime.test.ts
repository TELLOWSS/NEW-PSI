import { describe, it, expect } from 'vitest';
import { formatOcrAnalysisTime } from '../utils/ocrAnalysisTime';

describe('OCR analysis clock', () => {
    it('shows the actual instant in Korea including seconds', () => {
        expect(formatOcrAnalysisTime({ ocrAnalyzedAt: '2026-09-08T01:02:03Z' })).toContain('10:02:03');
    });
    it('never invents midnight for legacy date-only records', () => {
        expect(formatOcrAnalysisTime({})).toBe('분석 시각 미기록');
        expect(formatOcrAnalysisTime({ ocrAnalyzedAt: '2025-08-10' })).toBe('분석 시각 미기록');
    });
});
