export const TRAINING_LANGUAGE_FLAGS = {
    'ko-KR': '🇰🇷',
    'en-US': '🇺🇸',
    'vi-VN': '🇻🇳',
    'cmn-CN': '🇨🇳',
    'th-TH': '🇹🇭',
    'id-ID': '🇮🇩',
    'uz-UZ': '🇺🇿',
    'mn-MN': '🇲🇳',
    'km-KH': '🇰🇭',
    'ru-RU': '🇷🇺',
    'kk-KZ': '🇰🇿',
    'ne-NP': '🇳🇵',
    'my-MM': '🇲🇲',
    'fil-PH': '🇵🇭',
    'hi-IN': '🇮🇳',
    'bn-BD': '🇧🇩',
    'ur-PK': '🇵🇰',
    'si-LK': '🇱🇰',
} as const;

export const TRAINING_LANGUAGE_LABELS = {
    'ko-KR': '한국어',
    'en-US': '영어',
    'vi-VN': '베트남어',
    'cmn-CN': '중국어',
    'th-TH': '태국어',
    'id-ID': '인도네시아어',
    'uz-UZ': '우즈베크어',
    'mn-MN': '몽골어',
    'km-KH': '크메르어',
    'ru-RU': '러시아어',
    'kk-KZ': '카자흐어',
    'ne-NP': '네팔어',
    'my-MM': '미얀마어',
    'fil-PH': '필리핀어',
    'hi-IN': '힌디어',
    'bn-BD': '벵골어',
    'ur-PK': '우르두어',
    'si-LK': '싱할라어',
} as const;

export type TrainingLanguageCode = keyof typeof TRAINING_LANGUAGE_LABELS;

export type TranslationQualityReport = {
    status: 'ready' | 'review';
    sectionStructurePreserved: boolean;
    adequateLength: boolean;
    verificationKo: string;
    warnings: string[];
};

const SAFETY_GLOSSARY = [
    '작업 전 안전공유: 작업 시작 전에 작업내용, 위험요인, 안전조치를 함께 확인하는 짧은 안전회의. 첫 등장에는 현지 근로자가 이해할 수 있도록 뜻을 풀어 쓴다.',
    '위험성평가: 작업의 위험요인을 찾고 위험 수준과 안전조치를 정하는 절차.',
    '상등급 위험: 다음 달 작업에서 우선 관리해야 하는 높은 등급의 위험. 단순히 "좋은 등급"으로 번역하지 않는다.',
    '작업중지: 위험하거나 교육 내용과 실제 조건이 다르면 즉시 작업을 멈추는 행위. 권고가 아니라 실행 지시로 번역한다.',
    '추락: 사람이 높은 곳이나 개구부 아래로 떨어지는 위험.',
    '낙하·비래: 공구, 자재 또는 파편이 떨어지거나 날아오는 위험.',
    '끼임·협착: 신체가 장비나 자재 사이에 끼이는 위험.',
    '충돌: 사람, 차량 또는 장비가 서로 부딪히는 위험.',
    '개구부: 바닥이나 벽에 뚫려 있어 추락 위험이 있는 열린 부분.',
    '작업발판: 높은 곳에서 작업자가 서서 일하도록 설치한 발판.',
    '안전대: 추락 방지를 위해 몸에 착용하고 안전한 지점에 체결하는 보호구.',
    '유도자: 장비 이동 시 신호를 보내고 사람과 장비의 동선을 통제하는 사람.',
    '보호구: 안전모, 안전화, 안전대 등 작업자가 착용하는 개인보호장비.',
];

export const buildConstructionTranslationPrompt = (
    sourceTextKo: string,
    languageCode: TrainingLanguageCode,
): string => {
    const languageLabel = TRAINING_LANGUAGE_LABELS[languageCode];
    return [
        '당신은 한국 건설현장의 외국인 근로자 안전교육 전문 통역사입니다.',
        `아래 한국어 한 장 교육자료를 ${languageLabel}(${languageCode}) 모국어로 자연스럽고 짧게 번역하세요.`,
        '',
        '[절대 규칙]',
        '1. 원문의 1~5번 단계, 질문 번호, 시간, 숫자, 담당자, 작업중지 조건을 빠뜨리거나 순서를 바꾸지 마세요.',
        '2. 직역보다 해당 국가 건설현장에서 이해하기 쉬운 안전 표현을 사용하되 위험 수준을 약하게 만들지 마세요.',
        '3. "반드시", "즉시", "금지", "작업을 멈춘다"는 의무와 명령의 강도를 그대로 유지하세요.',
        '4. PSI처럼 필요한 약어를 제외하고 한국어를 남기지 마세요.',
        '5. 확인되지 않은 재해사례나 안전조치를 새로 만들어 넣지 마세요.',
        '6. 문장은 짧게 쓰고, 읽기 어려운 전문용어는 첫 등장 때 쉬운 말로 함께 설명하세요.',
        '',
        '[건설현장 용어 의미 기준]',
        ...SAFETY_GLOSSARY.map((item) => `- ${item}`),
        '',
        '[출력 형식]',
        'JSON 객체만 반환하세요.',
        '"translated": 전체 번역문',
        '"verificationKo": 용어 선택과 작업중지 의미가 보존되었는지 한국어로 1문장',
        '"warnings": 관리자 확인이 필요한 모호한 원문이 있으면 한국어 문자열 배열, 없으면 빈 배열',
        '',
        '[한국어 원문]',
        sourceTextKo,
    ].join('\n');
};

export const assessConstructionTranslation = (
    sourceTextKo: string,
    translated: string,
    verificationKo = '',
    modelWarnings: string[] = [],
): TranslationQualityReport => {
    const sourceHasFiveStages = [1, 2, 3, 4, 5].every((step) => sourceTextKo.includes(`${step}.`));
    const sectionStructurePreserved = !sourceHasFiveStages
        || [1, 2, 3, 4, 5].every((step) => translated.includes(`${step}.`));
    const ratio = translated.length / Math.max(1, sourceTextKo.length);
    const adequateLength = ratio >= 0.35 && ratio <= 3.2;
    const warnings = [...modelWarnings];

    if (!sectionStructurePreserved) warnings.push('원문의 1~5단계 번호가 모두 유지되지 않았습니다.');
    if (!adequateLength) warnings.push('원문 대비 번역문 길이 차이가 커서 누락 또는 과도한 설명을 확인해야 합니다.');
    if (!verificationKo.trim()) warnings.push('건설현장 용어와 작업중지 의미에 대한 번역 검증 설명이 없습니다.');

    return {
        status: warnings.length === 0 ? 'ready' : 'review',
        sectionStructurePreserved,
        adequateLength,
        verificationKo: verificationKo.trim() || '관리자 대조 확인 필요',
        warnings,
    };
};
