import type { TrainingLanguageCode } from './constructionTrainingTranslation';

export type A4TextDirection = 'ltr' | 'rtl';
export type A4WordBreak = 'normal' | 'keep-all' | 'break-word';

export interface A4LanguagePolicy {
    code: TrainingLanguageCode;
    lang: string;
    dir: A4TextDirection;
    fontFamily: string;
    lineHeight: number;
    wordBreak: A4WordBreak;
}

const LATIN_FONT = "'Noto Sans', 'Inter', Arial, sans-serif";
const CYRILLIC_FONT = "'Noto Sans', 'Segoe UI', Arial, sans-serif";
const DEVANAGARI_FONT = "'Noto Sans Devanagari', 'Nirmala UI', 'Mangal', sans-serif";

/**
 * Browser/PDF typography rules for every language offered by the A4 education UI.
 *
 * Keep this map exhaustive: adding a TrainingLanguageCode without a matching
 * print policy must fail at compile time instead of silently falling back to a
 * font that may render workers' text as empty squares.
 */
export const A4_LANGUAGE_POLICIES = {
    'ko-KR': {
        code: 'ko-KR',
        lang: 'ko-KR',
        dir: 'ltr',
        fontFamily: "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
        lineHeight: 1.48,
        wordBreak: 'keep-all',
    },
    'en-US': {
        code: 'en-US',
        lang: 'en-US',
        dir: 'ltr',
        fontFamily: LATIN_FONT,
        lineHeight: 1.45,
        wordBreak: 'normal',
    },
    'vi-VN': {
        code: 'vi-VN',
        lang: 'vi-VN',
        dir: 'ltr',
        fontFamily: LATIN_FONT,
        lineHeight: 1.5,
        wordBreak: 'normal',
    },
    'cmn-CN': {
        code: 'cmn-CN',
        lang: 'zh-CN',
        dir: 'ltr',
        fontFamily: "'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif",
        lineHeight: 1.5,
        wordBreak: 'normal',
    },
    'th-TH': {
        code: 'th-TH',
        lang: 'th-TH',
        dir: 'ltr',
        fontFamily: "'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif",
        lineHeight: 1.62,
        wordBreak: 'normal',
    },
    'id-ID': {
        code: 'id-ID',
        lang: 'id-ID',
        dir: 'ltr',
        fontFamily: LATIN_FONT,
        lineHeight: 1.48,
        wordBreak: 'normal',
    },
    'uz-UZ': {
        code: 'uz-UZ',
        lang: 'uz-UZ',
        dir: 'ltr',
        fontFamily: LATIN_FONT,
        lineHeight: 1.48,
        wordBreak: 'normal',
    },
    'mn-MN': {
        code: 'mn-MN',
        lang: 'mn-MN',
        dir: 'ltr',
        fontFamily: CYRILLIC_FONT,
        lineHeight: 1.5,
        wordBreak: 'normal',
    },
    'km-KH': {
        code: 'km-KH',
        lang: 'km-KH',
        dir: 'ltr',
        fontFamily: "'Noto Sans Khmer', 'Khmer UI', 'Leelawadee UI', sans-serif",
        lineHeight: 1.68,
        wordBreak: 'normal',
    },
    'ru-RU': {
        code: 'ru-RU',
        lang: 'ru-RU',
        dir: 'ltr',
        fontFamily: CYRILLIC_FONT,
        lineHeight: 1.48,
        wordBreak: 'normal',
    },
    'kk-KZ': {
        code: 'kk-KZ',
        lang: 'kk-KZ',
        dir: 'ltr',
        fontFamily: CYRILLIC_FONT,
        lineHeight: 1.5,
        wordBreak: 'normal',
    },
    'ne-NP': {
        code: 'ne-NP',
        lang: 'ne-NP',
        dir: 'ltr',
        fontFamily: DEVANAGARI_FONT,
        lineHeight: 1.62,
        wordBreak: 'normal',
    },
    'my-MM': {
        code: 'my-MM',
        lang: 'my-MM',
        dir: 'ltr',
        fontFamily: "'Noto Sans Myanmar', 'Myanmar Text', 'Nirmala UI', sans-serif",
        lineHeight: 1.7,
        wordBreak: 'normal',
    },
    'fil-PH': {
        code: 'fil-PH',
        lang: 'fil-PH',
        dir: 'ltr',
        fontFamily: LATIN_FONT,
        lineHeight: 1.48,
        wordBreak: 'normal',
    },
    'hi-IN': {
        code: 'hi-IN',
        lang: 'hi-IN',
        dir: 'ltr',
        fontFamily: DEVANAGARI_FONT,
        lineHeight: 1.62,
        wordBreak: 'normal',
    },
    'bn-BD': {
        code: 'bn-BD',
        lang: 'bn-BD',
        dir: 'ltr',
        fontFamily: "'Noto Sans Bengali', 'Nirmala UI', 'Vrinda', sans-serif",
        lineHeight: 1.64,
        wordBreak: 'normal',
    },
    'ur-PK': {
        code: 'ur-PK',
        lang: 'ur-PK',
        dir: 'rtl',
        fontFamily: "'Noto Sans Arabic', 'Noto Nastaliq Urdu', 'Nirmala UI', sans-serif",
        lineHeight: 1.72,
        wordBreak: 'normal',
    },
    'si-LK': {
        code: 'si-LK',
        lang: 'si-LK',
        dir: 'ltr',
        fontFamily: "'Noto Sans Sinhala', 'Nirmala UI', 'Iskoola Pota', sans-serif",
        lineHeight: 1.64,
        wordBreak: 'normal',
    },
} as const satisfies Record<TrainingLanguageCode, A4LanguagePolicy>;

export const isA4TrainingLanguageCode = (value: string): value is TrainingLanguageCode => (
    Object.prototype.hasOwnProperty.call(A4_LANGUAGE_POLICIES, value)
);

export const getA4LanguagePolicy = (languageCode?: string | null): A4LanguagePolicy => {
    if (languageCode && isA4TrainingLanguageCode(languageCode)) {
        return A4_LANGUAGE_POLICIES[languageCode];
    }

    return A4_LANGUAGE_POLICIES['ko-KR'];
};
