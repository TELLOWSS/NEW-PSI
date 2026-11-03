import { getA4LanguagePolicy } from './a4LanguagePolicy';

/**
 * This is a browser font-loading diagnostic, NOT a glyph, translation,
 * safety-instruction or real-device visual certification.
 */
export interface FontFaceSnapshot {
    family: string;
    status: string;
}

export type A4FontPreflightLevel = 'loaded' | 'loading' | 'fallback' | 'unknown';

export interface A4FontPreflight {
    language: string;
    family: string;
    sample: string;
    level: A4FontPreflightLevel;
    detail: string;
    humanReviewRequired: true;
}

export const A4_SCRIPT_SAMPLES: Readonly<Record<string, string>> = {
    'ko-KR': '가나다라마',
    'en-US': 'ABCDE abcde',
    'vi-VN': 'Ă Â Đ Ê Ô Ơ Ư',
    'cmn-CN': '中文测试',
    'th-TH': 'กขคงจ',
    'id-ID': 'Bahasa Indonesia',
    'uz-UZ': 'Oʻzbekcha',
    'mn-MN': 'АБВГД',
    'km-KH': 'កខគឃង',
    'ru-RU': 'АБВГД',
    'kk-KZ': 'Ә Ғ Қ Ң Ө Ұ Ү',
    'ne-NP': 'कखगघङ',
    'my-MM': 'ကခဂဃင',
    'fil-PH': 'Abakada',
    'hi-IN': 'कखगघङ',
    'bn-BD': 'কখগঘঙ',
    'ur-PK': 'ابتثجح',
    'si-LK': 'අ ආ ඇ ඈ ඉ',
};

const cleanFamily = (value: string): string => value.trim().replace(/^["']|["']$/g, '').toLowerCase();

/** Deterministic pure evaluation; even "loaded" MUST be manually inspected. */
export const inspectA4FontPreflight = (
    language: string,
    faces: Iterable<FontFaceSnapshot> | null,
    fontsLoading = false,
): A4FontPreflight => {
    const policy = getA4LanguagePolicy(language);
    const first = policy.fontFamily.split(',')[0];
    const family = first.trim().replace(/^["']|["']$/g, '');
    const sample = A4_SCRIPT_SAMPLES[policy.code] || '';
    const matches = faces ? [...faces].filter(face => cleanFamily(face.family) === cleanFamily(family)) : [];
    let level: A4FontPreflightLevel = 'fallback';
    let detail = '전용 웹글꼴 로드를 확인하지 못했습니다. 기기 기본 글꼴로 표시될 수 있으니 문자 깨짐을 직접 확인하세요.';
    if (!faces) {
        level = 'unknown';
        detail = '이 브라우저는 글꼴 상태 확인을 지원하지 않습니다. 화면과 저장 파일의 글자를 직접 확인하세요.';
    } else if (fontsLoading || matches.some(face => face.status === 'loading')) {
        level = 'loading';
        detail = '웹글꼴 로딩 중입니다. 완료 후 다시 점검하고 저장한 파일을 육안 확인하세요.';
    } else if (matches.some(face => face.status === 'loaded')) {
        level = 'loaded';
        detail = '전용 웹글꼴의 로드 기록은 확인됐습니다. 문자 누락·글자 결합·번역 정확성까지 검증된 것은 아닙니다.';
    }
    return { language: policy.code, family, sample, level, detail, humanReviewRequired: true };
};
