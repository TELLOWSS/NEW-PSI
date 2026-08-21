import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { attachEvidenceHash } from '../utils/evidenceUtils';

const record = (originalImage: string): WorkerRecord => ({
    id: 'record-1',
    name: '김근로',
    jobField: '형틀',
    date: '2026-08-21',
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [],
    fullText: '같은 판독 내용',
    koreanTranslation: '같은 판독 내용',
    safetyScore: 75,
    safetyLevel: '중급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
    originalImage,
});

describe('evidence content checksum', () => {
    it('changes when the original image content changes', async () => {
        const first = await attachEvidenceHash(record('data:image/png;base64,AAAA'));
        const second = await attachEvidenceHash(record('data:image/png;base64,BBBB'));

        expect(first.evidenceHash).toBeTruthy();
        expect(second.evidenceHash).toBeTruthy();
        expect(first.evidenceHash).not.toBe(second.evidenceHash);
    });

    it('is stable for the same evidence content', async () => {
        const first = await attachEvidenceHash(record('data:image/png;base64,AAAA'));
        const second = await attachEvidenceHash(record('data:image/png;base64,AAAA'));

        expect(first.evidenceHash).toBe(second.evidenceHash);
    });
});
