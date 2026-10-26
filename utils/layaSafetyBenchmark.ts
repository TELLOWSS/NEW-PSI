import { CURRENT_SITE_TRAINING_LANGUAGE_CODES, TRAINING_LANGUAGE_LABELS, type TrainingLanguageCode } from './constructionTrainingTranslation';

export const LAYA_RESEARCH_SCHEMA = 'psi.laya.offline-hazard-benchmark.v1' as const;
export const LAYA_HAZARD_LABELS = ['fall', 'struck_by', 'caught_in', 'electrical', 'fire', 'none'] as const;
export type LayaHazardLabel = (typeof LAYA_HAZARD_LABELS)[number];
export type LayaReviewStatus = 'pending' | 'reviewed';

export interface LayaSafetyCase {
    id: string;
    language: TrainingLanguageCode;
    referenceKo: string;
    text: string;
    expectedLabel: LayaHazardLabel;
    translationReview: LayaReviewStatus;
}
export interface LayaSafetyReferencePack {
    schema: typeof LAYA_RESEARCH_SCHEMA;
    purpose: 'synthetic-research-only';
    languageCount: number;
    cases: LayaSafetyCase[];
}
export interface LayaPrediction {
    caseId: string;
    predictedLabel: LayaHazardLabel;
    confidence: number | null;
}
export interface LayaOfflineRun {
    schema: typeof LAYA_RESEARCH_SCHEMA;
    engine: 'laya';
    checkpoint: string;
    checkpointRevision: string;
    runtime: 'local-offline';
    cases: LayaSafetyCase[];
    predictions: LayaPrediction[];
}
export interface LayaLanguageMetrics {
    language: TrainingLanguageCode;
    name: string;
    eligible: number;
    predicted: number;
    correct: number;
    missedHazard: number;
    falsePositive: number;
    wrongType: number;
    unmatched: number;
}
export interface LayaBenchReport {
    languageMetrics: LayaLanguageMetrics[];
    total: number;
    eligible: number;
    predicted: number;
    correct: number;
    missedHazard: number;
    falsePositive: number;
    wrongType: number;
    unmatched: number;
    accuracy: number | null;
    coverage: number | null;
    fullyReviewedLanguages: number;
    fullyPredictedLanguages: number;
    fixtureReviewCoverage: number;
    fixturePredictionCoverage: number;
    status: 'research-only';
    safetyApproved: false;
    provenanceVerified: false;
}
const VALID_LABELS: readonly string[] = LAYA_HAZARD_LABELS;
const FALL_KO = '고층 작업장 바닥 개구부의 덮개가 제거되어 근로자가 아래로 떨어질 위험이 있다.';
const STRUCK_KO = '상부 자재가 고정되지 않아 아래 작업자를 타격할 위험이 있다.';
const NONE_KO = '작업 전 위험성평가 서류를 보관함에 정리했다. 특정 사고위험은 기술하지 않았다.';
const ITEMS: Array<[string, string, LayaHazardLabel]> = [
    ['fall', FALL_KO, 'fall'],
    ['struck_by', STRUCK_KO, 'struck_by'],
    ['no_specific_hazard', NONE_KO, 'none'],
];

/** The foreign-language cells intentionally remain empty until native speakers validate them. */
export const buildLayaSafetyReferencePack = (): LayaSafetyReferencePack => ({
    schema: LAYA_RESEARCH_SCHEMA,
    purpose: 'synthetic-research-only',
    languageCount: CURRENT_SITE_TRAINING_LANGUAGE_CODES.length,
    cases: CURRENT_SITE_TRAINING_LANGUAGE_CODES.flatMap(language => ITEMS.map(([id, referenceKo, expectedLabel]) => ({
        id: language + ':' + id,
        language,
        referenceKo,
        expectedLabel,
        text: language === 'ko-KR' ? referenceKo : '',
        translationReview: language === 'ko-KR' ? 'reviewed' : 'pending',
    }))),
});

const asObject = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const allowed = (label: unknown): label is LayaHazardLabel =>
    typeof label === 'string' && VALID_LABELS.includes(label);
const isValidCode = (value: unknown): value is TrainingLanguageCode =>
    typeof value === 'string' && CURRENT_SITE_TRAINING_LANGUAGE_CODES.includes(value as TrainingLanguageCode);

/** Reject unknown/unreviewed data rather than counting it as a successful classification. */
export const evaluateLayaOfflineRun = (input: unknown): LayaBenchReport => {
    const run = asObject(input);
    if (!run || run.schema !== LAYA_RESEARCH_SCHEMA || run.engine !== 'laya' || run.runtime !== 'local-offline') {
        throw new Error('PSI 오프라인 Laya 시험 결과 파일의 형식이 올바르지 않습니다.');
    }
    if (typeof run.checkpoint !== 'string' || !run.checkpoint.trim()
        || typeof run.checkpointRevision !== 'string' || !run.checkpointRevision.trim()) {
        throw new Error('Laya 모델 이름과 체크포인트 리비전이 기록되지 않았습니다.');
    }
    if (!Array.isArray(run.cases) || !Array.isArray(run.predictions)
        || run.cases.length > 2000 || run.predictions.length > 2000) {
        throw new Error('평가 사례 또는 예측 결과 목록이 없거나 제한(2,000건)을 초과했습니다.');
    }
    const reference = new Map(buildLayaSafetyReferencePack().cases.map(x => [x.id, x]));
    if (run.cases.length !== reference.size) {
        throw new Error('11개 언어 33건 고정 시험자료가 누락되거나 추가되었습니다.');
    }
    const unique = new Set<string>();
    const eligible = new Map<string, LayaSafetyCase>();
    for (const raw of run.cases) {
        const item = asObject(raw);
        if (!item || typeof item.id !== 'string' || unique.has(item.id)) {
            throw new Error('중복되거나 올바르지 않은 사례 ID가 있습니다.');
        }
        unique.add(item.id);
        const golden = reference.get(item.id);
        if (!golden || item.referenceKo !== golden.referenceKo || item.expectedLabel !== golden.expectedLabel
            || !isValidCode(item.language) || item.language !== golden.language) {
            throw new Error('시험 사례의 원문·기준 위험유형 또는 언어 코드가 변경되었습니다.');
        }
        if (item.language === 'ko-KR' && item.text !== golden.referenceKo) {
            throw new Error('한국어 원문 사례 텍스트가 변경되었습니다.');
        }
        if (item.translationReview === 'reviewed' && item.language !== 'ko-KR'
            && typeof item.text === 'string' && item.text.trim() === golden.referenceKo) {
            throw new Error('외국어 검토 완료로 표시했지만 한국어 원문이 그대로 들어 있습니다.');
        }
        if (item.translationReview === 'reviewed' && typeof item.text === 'string'
            && item.text.trim().length >= 10 && item.text.length <= 3000) {
            eligible.set(item.id, item as unknown as LayaSafetyCase);
        } else if (item.translationReview !== 'pending' && item.translationReview !== 'reviewed') {
            throw new Error('번역 검토 여부 값이 잘못되었습니다.');
        }
    }
    const predictions = new Map<string, LayaPrediction>();
    for (const raw of run.predictions) {
        const item = asObject(raw);
        if (!item || typeof item.caseId !== 'string' || predictions.has(item.caseId)
            || !unique.has(item.caseId) || !allowed(item.predictedLabel)
            || (item.confidence !== null && (typeof item.confidence !== 'number'
                || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1))) {
            throw new Error('예측 결과 ID·위험유형·확률값을 확인해 주세요.');
        }
        predictions.set(item.caseId, item as unknown as LayaPrediction);
    }
    const languageMetrics: LayaLanguageMetrics[] = CURRENT_SITE_TRAINING_LANGUAGE_CODES.map(language => {
        const cases = Array.from(eligible.values()).filter(x => x.language === language);
        let correct = 0;
        let missedHazard = 0;
        let falsePositive = 0;
        let wrongType = 0;
        let predicted = 0;
        for (const item of cases) {
            const estimate = predictions.get(item.id);
            if (!estimate) continue;
            predicted++;
            if (estimate.predictedLabel === item.expectedLabel) correct++;
            else if (item.expectedLabel !== 'none' && estimate.predictedLabel === 'none') missedHazard++;
            else if (item.expectedLabel === 'none' && estimate.predictedLabel !== 'none') falsePositive++;
            else wrongType++;
        }
        return {
            language, name: TRAINING_LANGUAGE_LABELS[language], eligible: cases.length,
            predicted, correct, missedHazard, falsePositive, wrongType, unmatched: cases.length - predicted,
        };
    });
    const sum = (key: keyof Pick<LayaLanguageMetrics, 'eligible' | 'predicted' | 'correct' | 'missedHazard' | 'falsePositive' | 'wrongType' | 'unmatched'>) =>
        languageMetrics.reduce((total, row) => total + row[key], 0);
    const eligibleCount = sum('eligible');
    const predictedCount = sum('predicted');
    return {
        languageMetrics, total: unique.size, eligible: eligibleCount, predicted: predictedCount,
        correct: sum('correct'), missedHazard: sum('missedHazard'),
        falsePositive: sum('falsePositive'), wrongType: sum('wrongType'), unmatched: sum('unmatched'),
        accuracy: predictedCount > 0 ? sum('correct') / predictedCount : null,
        coverage: eligibleCount > 0 ? predictedCount / eligibleCount : null,
        fullyReviewedLanguages: languageMetrics.filter(row => row.eligible === ITEMS.length).length,
        fullyPredictedLanguages: languageMetrics.filter(row => row.predicted === ITEMS.length).length,
        fixtureReviewCoverage: eligibleCount / reference.size,
        fixturePredictionCoverage: predictedCount / reference.size,
        status: 'research-only', safetyApproved: false, provenanceVerified: false,
    };
};
