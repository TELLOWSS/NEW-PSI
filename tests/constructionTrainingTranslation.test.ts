import { describe, expect, it } from 'vitest';
import {
    assessConstructionTranslation,
    buildConstructionTranslationPrompt,
    TRAINING_LANGUAGE_LABELS,
} from '../utils/constructionTrainingTranslation';

describe('construction training translation', () => {
    const source = [
        '1. 교육 전 5분 핵심 동영상',
        '2. 최근 재해사례',
        '3. 상등급 위험 공유',
        '4. 현장 중점관리',
        '5. 공지사항',
        '조건이 다르면 즉시 작업을 멈춘다.',
    ].join('\n');

    it('supports every language exposed by the training UI', () => {
        expect(Object.keys(TRAINING_LANGUAGE_LABELS)).toHaveLength(18);
        expect(TRAINING_LANGUAGE_LABELS['ne-NP']).toBe('네팔어');
        expect(TRAINING_LANGUAGE_LABELS['si-LK']).toBe('싱할라어');
    });

    it('builds a construction-specific prompt that preserves safety meaning', () => {
        const prompt = buildConstructionTranslationPrompt(source, 'vi-VN');

        expect(prompt).toContain('건설현장의 외국인 근로자 안전교육 전문 통역사');
        expect(prompt).toContain('작업중지');
        expect(prompt).toContain('상등급 위험');
        expect(prompt).toContain('1~5번 단계');
        expect(prompt).toContain('"verificationKo"');
    });

    it('flags translations that lose the five-stage structure', () => {
        const report = assessConstructionTranslation(
            source,
            '1. Video\n2. Case\n3. Risk',
            '',
        );

        expect(report.status).toBe('review');
        expect(report.sectionStructurePreserved).toBe(false);
        expect(report.warnings.some((warning) => warning.includes('1~5단계'))).toBe(true);
    });

    it('accepts a structurally complete translation with verification', () => {
        const translated = [
            '1. Video training before work',
            '2. Recent accident case',
            '3. High-priority risk',
            '4. Site control points',
            '5. Notices',
            'Stop work immediately when conditions differ.',
        ].join('\n');
        const report = assessConstructionTranslation(
            source,
            translated,
            '작업중지 명령과 상등급 위험 의미를 유지했습니다.',
        );

        expect(report.status).toBe('ready');
        expect(report.sectionStructurePreserved).toBe(true);
    });
});
