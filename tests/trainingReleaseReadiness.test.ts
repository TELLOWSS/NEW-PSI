import { describe, expect, it } from 'vitest';
import {
    assessTrainingReleaseReadiness,
    embedTrainingReleaseMetadata,
    parseTrainingReleaseMetadata,
} from '../utils/trainingReleaseReadiness';

const readyReport = {
    status: 'ready' as const,
    sectionStructurePreserved: true,
    adequateLength: true,
    verificationKo: '검증 완료',
    warnings: [],
};

describe('training release readiness', () => {
    it('blocks release until every selected language has text, approved quality, and audio', () => {
        const result = assessTrainingReleaseReadiness({
            selectedLanguages: ['ko-KR', 'vi-VN'],
            sourceTextKo: '안전교육',
            translatedTexts: { 'ko-KR': '안전교육', 'vi-VN': 'Đào tạo an toàn' },
            audioUrls: { 'ko-KR': 'ko.mp3' },
            translationReports: { 'vi-VN': readyReport },
        });

        expect(result.ready).toBe(false);
        expect(result.blockers).toEqual([
            expect.objectContaining({ languageCode: 'vi-VN', kind: 'audio' }),
        ]);
    });

    it('requires explicit approval when automated translation quality is review', () => {
        const reviewReport = { ...readyReport, status: 'review' as const, warnings: ['대조 필요'] };
        const base = {
            selectedLanguages: ['vi-VN'],
            sourceTextKo: '안전교육',
            translatedTexts: { 'vi-VN': 'Đào tạo an toàn' },
            audioUrls: { 'vi-VN': 'vi.mp3' },
            translationReports: { 'vi-VN': reviewReport },
        };

        expect(assessTrainingReleaseReadiness(base).blockers[0]?.kind).toBe('quality');
        expect(assessTrainingReleaseReadiness({
            ...base,
            approvedReviewLanguages: ['vi-VN'],
        }).ready).toBe(true);
    });

    it('embeds and reads a server-verifiable draft or ready marker', () => {
        const readiness = assessTrainingReleaseReadiness({
            selectedLanguages: ['ko-KR'],
            sourceTextKo: '안전교육',
            translatedTexts: { 'ko-KR': '안전교육' },
            audioUrls: { 'ko-KR': 'ko.mp3' },
        });
        const texts = embedTrainingReleaseMetadata({ 'ko-KR': '안전교육' }, readiness);

        expect(parseTrainingReleaseMetadata(texts)).toMatchObject({
            version: 1,
            status: 'ready',
            selectedLanguages: ['ko-KR'],
        });
    });
});
