export const TRAINING_AUDIO_LANGUAGE_CODES = [
    'ko-KR',
    'cmn-CN',
    'vi-VN',
    'km-KH',
    'id-ID',
    'mn-MN',
    'my-MM',
    'ru-RU',
    'uz-UZ',
    'th-TH',
    'kk-KZ',
] as const;

export type TrainingAudioLanguageCode = typeof TRAINING_AUDIO_LANGUAGE_CODES[number];

export type TrainingAudioLanguageMeta = {
    code: TrainingAudioLanguageCode;
    label: string;
    shortLabel: string;
    flag: string;
    nationality: string;
  };

export const TRAINING_AUDIO_LANGUAGES: TrainingAudioLanguageMeta[] = [
    { code: 'ko-KR', label: '한국어', shortLabel: '한국어', flag: '🇰🇷', nationality: '대한민국' },
    { code: 'cmn-CN', label: '중국어', shortLabel: '중국', flag: '🇨🇳', nationality: '중국' },
    { code: 'vi-VN', label: '베트남어', shortLabel: '베트남', flag: '🇻🇳', nationality: '베트남' },
    { code: 'km-KH', label: '크메르어', shortLabel: '캄보디아', flag: '🇰🇭', nationality: '캄보디아' },
    { code: 'id-ID', label: '인도네시아어', shortLabel: '인도네시아', flag: '🇮🇩', nationality: '인도네시아' },
    { code: 'mn-MN', label: '몽골어', shortLabel: '몽골', flag: '🇲🇳', nationality: '몽골' },
    { code: 'my-MM', label: '미얀마어', shortLabel: '미얀마', flag: '🇲🇲', nationality: '미얀마' },
    { code: 'ru-RU', label: '러시아어', shortLabel: '러시아', flag: '🇷🇺', nationality: '러시아' },
    { code: 'uz-UZ', label: '우즈베크어', shortLabel: '우즈벡', flag: '🇺🇿', nationality: '우즈베키스탄' },
    { code: 'th-TH', label: '태국어', shortLabel: '태국', flag: '🇹🇭', nationality: '태국' },
    { code: 'kk-KZ', label: '카자흐어', shortLabel: '카자흐', flag: '🇰🇿', nationality: '카자흐스탄' },
];

export const TRAINING_AUDIO_LANGUAGE_LABELS: Record<TrainingAudioLanguageCode, string> = Object.fromEntries(
    TRAINING_AUDIO_LANGUAGES.map((item) => [item.code, item.label])
) as Record<TrainingAudioLanguageCode, string>;

export const TRAINING_AUDIO_LANGUAGE_FLAGS: Record<TrainingAudioLanguageCode, string> = Object.fromEntries(
    TRAINING_AUDIO_LANGUAGES.map((item) => [item.code, item.flag])
) as Record<TrainingAudioLanguageCode, string>;

export const TRAINING_AUDIO_LANGUAGE_NATIONALITY: Record<TrainingAudioLanguageCode, string> = Object.fromEntries(
    TRAINING_AUDIO_LANGUAGES.map((item) => [item.code, item.nationality])
) as Record<TrainingAudioLanguageCode, string>;

export const TRAINING_AUDIO_LANGUAGE_SET = new Set<string>(TRAINING_AUDIO_LANGUAGE_CODES);

export const resolveTrainingLanguageByNationality = (nationalityRaw: string): TrainingAudioLanguageCode => {
    const nationality = String(nationalityRaw || '').toLowerCase().trim();
    if (nationality.includes('중국') || nationality.includes('china')) return 'cmn-CN';
    if (nationality.includes('베트남') || nationality.includes('vietnam')) return 'vi-VN';
    if (nationality.includes('캄보디아') || nationality.includes('cambodia') || nationality.includes('khmer')) return 'km-KH';
    if (nationality.includes('인도네시아') || nationality.includes('indonesia')) return 'id-ID';
    if (nationality.includes('몽골') || nationality.includes('mongolia')) return 'mn-MN';
    if (nationality.includes('미얀마') || nationality.includes('myanmar')) return 'my-MM';
    if (nationality.includes('러시아') || nationality.includes('russia')) return 'ru-RU';
    if (nationality.includes('우즈벡') || nationality.includes('uzbek')) return 'uz-UZ';
    if (nationality.includes('태국') || nationality.includes('thailand')) return 'th-TH';
    if (nationality.includes('카자흐') || nationality.includes('kazakh')) return 'kk-KZ';
    return 'ko-KR';
};
