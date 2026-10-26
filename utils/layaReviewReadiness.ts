import {
    LAYA_V2_CASES_PER_LANGUAGE,
    validateLayaExtendedPack,
    type LayaV2Case,
    type LayaV2Pack,
} from './layaExtendedSafetyBenchmark';
import {
    CURRENT_SITE_TRAINING_LANGUAGE_CODES,
    TRAINING_LANGUAGE_LABELS,
    type TrainingLanguageCode,
} from './constructionTrainingTranslation';

export interface LayaReviewReadinessRow {
    language: TrainingLanguageCode;
    name: string;
    reviewed: number;
    missing: number;
    suspiciousDuplicates: number;
    allReviewed: boolean;
}
export interface LayaReviewReadiness {
    total: number;
    reviewed: number;
    awaiting: number;
    languagesComplete: number;
    possibleCopyPasteCases: number;
    rows: LayaReviewReadinessRow[];
    /** A completed text form does not prove interpretation accuracy or model safety. */
    semanticReviewVerified: false;
    modelValidated: false;
    operationallyApproved: false;
}
const normalize = (text: string): string => text.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

/**
 * Missing-review and duplicate-text signals are quality-control prompts.
 * They do not assert the text is invalid in any human language.
 */
export const inspectLayaReviewReadiness = (raw: unknown): LayaReviewReadiness => {
    const pack = validateLayaExtendedPack(raw);
    const rows: LayaReviewReadinessRow[] = CURRENT_SITE_TRAINING_LANGUAGE_CODES.map(language => {
        const cases = pack.cases.filter(item => item.language === language);
        const reviewed = cases.filter(item => item.translationReview === 'reviewed');
        const frequencies = new Map<string, number>();
        for (const item of reviewed) {
            const key = normalize(item.text);
            frequencies.set(key, (frequencies.get(key) || 0) + 1);
        }
        const suspiciousDuplicates = reviewed.filter(item =>
            language !== 'ko-KR' && frequencies.get(normalize(item.text))! > 1
        ).length;
        return {
            language,
            name: TRAINING_LANGUAGE_LABELS[language],
            reviewed: reviewed.length,
            missing: cases.length - reviewed.length,
            suspiciousDuplicates,
            allReviewed: reviewed.length === LAYA_V2_CASES_PER_LANGUAGE,
        };
    });
    const reviewed = rows.reduce((n, r) => n + r.reviewed, 0);
    return {
        total: pack.cases.length, reviewed,
        awaiting: pack.cases.length - reviewed,
        languagesComplete: rows.filter(r => r.allReviewed).length,
        possibleCopyPasteCases: rows.reduce((n, r) => n + r.suspiciousDuplicates, 0),
        rows, semanticReviewVerified: false, modelValidated: false, operationallyApproved: false,
    };
};

/**
 * Prevents scoring an imported Laya JSON that refers to an older/different
 * local 132-case review draft. Never trusts the file's model/reviewer identity.
 */
export const verifyLayaRunMatchesCurrentPack = (
    rawRun: unknown, currentPack: LayaV2Pack,
): void => {
    const original = validateLayaExtendedPack(currentPack);
    const imported = validateLayaExtendedPack(rawRun);
    const expected = new Map(original.cases.map(item => [item.id, item]));
    let changed = 0;
    for (const item of imported.cases) {
        const prev = expected.get(item.id);
        if (!prev || !sameReview(prev, item)) changed++;
    }
    if (changed) {
        throw new Error(
            '불러온 예측 결과와 현재 132건 검수표의 내용·검수상태·시각이 '
            + changed + '건 다릅니다. 시험에 사용한 검수표 JSON을 먼저 다시 열어 주세요.',
        );
    }
};
const sameReview = (a: LayaV2Case, b: LayaV2Case): boolean =>
    a.id === b.id && a.language === b.language
    && a.referenceKo === b.referenceKo && a.expectedLabel === b.expectedLabel
    && a.text === b.text && a.translationReview === b.translationReview
    && a.reviewerCode === b.reviewerCode && a.reviewedAt === b.reviewedAt;
