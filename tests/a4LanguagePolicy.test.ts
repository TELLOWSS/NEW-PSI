import { describe, expect, it } from 'vitest';
import {
    A4_LANGUAGE_POLICIES,
    getA4LanguagePolicy,
    isA4TrainingLanguageCode,
} from '../utils/a4LanguagePolicy';
import { TRAINING_LANGUAGE_OPTIONS } from '../utils/constructionTrainingTranslation';

describe('A4 language print policy', () => {
    it('covers every language exposed by the education UI', () => {
        const supportedCodes = TRAINING_LANGUAGE_OPTIONS.map(({ code }) => code).sort();

        expect(Object.keys(A4_LANGUAGE_POLICIES).sort()).toEqual(supportedCodes);
        expect(supportedCodes).toHaveLength(18);
    });

    it('provides complete browser typography metadata for every language', () => {
        for (const policy of Object.values(A4_LANGUAGE_POLICIES)) {
            expect(policy.lang).not.toBe('');
            expect(['ltr', 'rtl']).toContain(policy.dir);
            expect(policy.fontFamily).toContain('sans-serif');
            expect(policy.lineHeight).toBeGreaterThanOrEqual(1.4);
            expect(['normal', 'keep-all', 'break-word']).toContain(policy.wordBreak);
        }
    });

    it('uses RTL Arabic typography for Urdu', () => {
        const policy = getA4LanguagePolicy('ur-PK');

        expect(policy.lang).toBe('ur-PK');
        expect(policy.dir).toBe('rtl');
        expect(policy.fontFamily).toContain('Noto Sans Arabic');
    });

    it.each([
        ['th-TH', 'Noto Sans Thai'],
        ['km-KH', 'Noto Sans Khmer'],
        ['my-MM', 'Noto Sans Myanmar'],
        ['hi-IN', 'Noto Sans Devanagari'],
        ['ne-NP', 'Noto Sans Devanagari'],
        ['bn-BD', 'Noto Sans Bengali'],
        ['si-LK', 'Noto Sans Sinhala'],
    ])('selects a script-capable font for %s', (code, font) => {
        expect(getA4LanguagePolicy(code).fontFamily).toContain(font);
    });

    it('falls back safely to Korean for an unknown or missing code', () => {
        expect(isA4TrainingLanguageCode('ur-PK')).toBe(true);
        expect(isA4TrainingLanguageCode('unknown')).toBe(false);
        expect(getA4LanguagePolicy('unknown').code).toBe('ko-KR');
        expect(getA4LanguagePolicy().code).toBe('ko-KR');
    });
});
