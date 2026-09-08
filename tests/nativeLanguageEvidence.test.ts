import { describe, it, expect } from 'vitest';
import type { WorkerRecord } from '../types';
import { summarizeNativeLanguageEvidence, buildNativeLanguageEvidenceCsv } from '../utils/nativeLanguageEvidence';

describe('native-language evidence', () => {
    it('flags numerical disagreement and does not claim native review', () => {
        const record = { language: 'vi', nationality: '베트남', handwrittenAnswers: [{ questionNumber: '1', answerText: '2m', koreanTranslation: '2m', nativeTranslation: '3m' }] } as WorkerRecord;
        const rows = summarizeNativeLanguageEvidence([record]);
        expect(rows[0]).toMatchObject({ language: 'vi', records: 1, numberWarnings: 1, checksPassed: 0 });
        expect(buildNativeLanguageEvidenceCsv(rows, '2026-09-08T01:00:00Z')).toContain('증빙 미등록');
    });
    it('does not assert quality for languages with no sample records', () => {
        expect(summarizeNativeLanguageEvidence([])).toEqual([]);
    });
});
