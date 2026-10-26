import {
    CURRENT_SITE_TRAINING_LANGUAGE_CODES,
    TRAINING_LANGUAGE_LABELS,
    type TrainingLanguageCode,
} from './constructionTrainingTranslation';
import { LAYA_HAZARD_LABELS, type LayaHazardLabel } from './layaSafetyBenchmark';

export const LAYA_EXTENDED_SCHEMA = 'psi.laya.offline-hazard-benchmark.v2' as const;
export const LAYA_V2_CASES_PER_LANGUAGE = 12;
export const LAYA_V2_EXPECTED_CASES = CURRENT_SITE_TRAINING_LANGUAGE_CODES.length * LAYA_V2_CASES_PER_LANGUAGE;
export type LayaV2ReviewStatus = 'pending' | 'reviewed';
export interface LayaV2Case {
    id: string;
    language: TrainingLanguageCode;
    expectedLabel: LayaHazardLabel;
    referenceKo: string;
    text: string;
    translationReview: LayaV2ReviewStatus;
    /** Unverified pseudonymous operator entry, NOT a verified professional license. */
    reviewerCode: string;
    reviewedAt: string | null;
}
export interface LayaV2Pack {
    schema: typeof LAYA_EXTENDED_SCHEMA;
    purpose: 'synthetic-research-only';
    cases: LayaV2Case[];
}
export interface LayaV2Prediction {
    caseId: string;
    predictedLabel: LayaHazardLabel;
    confidence: number | null;
}
export interface LayaV2Run extends LayaV2Pack {
    engine: 'laya';
    runtime: 'local-offline';
    checkpoint: string;
    checkpointRevision: string;
    predictions: LayaV2Prediction[];
}
export interface LayaV2Metrics {
    language: TrainingLanguageCode;
    name: string;
    reviewed: number;
    predicted: number;
    correct: number;
    falseNegative: number;
    falsePositive: number;
    wrongType: number;
    noPrediction: number;
    trueHazards: number;
    detectedHazards: number;
    accuracy: number | null;
    hazardDetectionRecall: number | null;
}
export interface LayaV2Report {
    schema: typeof LAYA_EXTENDED_SCHEMA;
    status: 'research-only';
    safetyApproved: false;
    provenanceVerified: false;
    reviewerIdentityVerified: false;
    casesTotal: number;
    reviewed: number;
    predicted: number;
    correct: number;
    falseNegative: number;
    falsePositive: number;
    wrongType: number;
    noPrediction: number;
    coverageAllCases: number;
    reviewedLanguagesComplete: number;
    predictedLanguagesComplete: number;
    accuracy: number | null;
    hazardDetectionRecall: number | null;
    languages: LayaV2Metrics[];
}
const DEFS: ReadonlyArray<readonly [string, LayaHazardLabel, string]> = [
    ['fall-opening', 'fall', '작업발판 옆 개구부 덮개가 제거되어 작업자가 아래로 떨어질 위험이 있다.'],
    ['fall-scaffold', 'fall', '시스템비계 작업발판 외측 안전난간이 없는 구간에서 추락할 위험이 있다.'],
    ['struck-loose', 'struck_by', '상부에서 고정되지 않은 자재가 낙하하여 아래 근로자를 타격할 위험이 있다.'],
    ['struck-crane', 'struck_by', '양중 중 매달린 자재가 이동하면서 근로자와 충돌할 위험이 있다.'],
    ['caught-drill', 'caught_in', '회전 중인 임팩드릴의 회전체에 장갑이 말려 손가락이 끼일 위험이 있다.'],
    ['caught-excavator', 'caught_in', '굴착기 선회 반경에서 장비와 구조물 사이에 근로자가 협착될 위험이 있다.'],
    ['electric-panel', 'electrical', '누전된 임시 분전함 외함에 접촉하면 감전될 위험이 있다.'],
    ['electric-cable', 'electrical', '피복이 손상된 전선의 노출된 도체에 접촉해 감전될 위험이 있다.'],
    ['fire-welding', 'fire', '용접 불티가 주변 가연성 자재에 튀어 화재가 발생할 위험이 있다.'],
    ['fire-solvent', 'fire', '인화성 용제가 놓인 곳에서 화기를 사용하면 착화·화재 위험이 있다.'],
    ['none-paperwork', 'none', '작업 전 위험성평가 서류를 정리하고 교육일지를 문서함에 보관했다. 특정 사고 위험은 기술하지 않았다.'],
    ['none-inventory', 'none', '현장 관리자가 보호구 반입 수량을 장부에 기록하고 재고를 확인했다. 특정 사고 위험은 기술하지 않았다.'],
];
const textField = (v: unknown): v is string => typeof v === 'string';
const isValidLabel = (v: unknown): v is LayaHazardLabel =>
    typeof v === 'string' && (LAYA_HAZARD_LABELS as readonly string[]).includes(v);
const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const isIsoUtc = (v: unknown): v is string =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === new Date(Date.parse(v)).toISOString();

/** Does not translate, infer, or supply fake reviewer evidence. */
export const buildLayaExtendedReferencePack = (): LayaV2Pack => ({
    schema: LAYA_EXTENDED_SCHEMA,
    purpose: 'synthetic-research-only',
    cases: CURRENT_SITE_TRAINING_LANGUAGE_CODES.flatMap(language =>
        DEFS.map(([id, expectedLabel, referenceKo]): LayaV2Case => ({
            id: language + ':' + id,
            language,
            expectedLabel,
            referenceKo,
            text: language === 'ko-KR' ? referenceKo : '',
            translationReview: language === 'ko-KR' ? 'reviewed' : 'pending',
            reviewerCode: '',
            reviewedAt: null,
        }))),
});

/**
 * Validates the fixed gold labels and exact 132-case universe. A locally
 * asserted reviewer code is only a workflow signal, not identity proof.
 */
export const validateLayaExtendedPack = (value: unknown): LayaV2Pack => {
    const pack = asRecord(value);
    if (!pack || pack.schema !== LAYA_EXTENDED_SCHEMA || pack.purpose !== 'synthetic-research-only'
        || !Array.isArray(pack.cases) || pack.cases.length !== LAYA_V2_EXPECTED_CASES) {
        throw new Error('확장 시험은 11개 언어 × 12건 = 132건 고정 시험자료를 사용해야 합니다.');
    }
    const gold = new Map(buildLayaExtendedReferencePack().cases.map(c => [c.id, c]));
    const seen = new Set<string>();
    const cases: LayaV2Case[] = [];
    for (const raw of pack.cases) {
        const item = asRecord(raw);
        if (!item || !textField(item.id) || seen.has(item.id)) throw new Error('중복 또는 누락된 시험 사례 ID가 있습니다.');
        seen.add(item.id);
        const ref = gold.get(item.id);
        if (!ref || ref.language !== item.language || ref.expectedLabel !== item.expectedLabel
            || ref.referenceKo !== item.referenceKo) {
            throw new Error('시험 원문·언어·기대 위험유형이 변경됐습니다. 가상 기준문장은 수정할 수 없습니다.');
        }
        if (!textField(item.text) || item.text.length > 3000 || !['pending', 'reviewed'].includes(String(item.translationReview))
            || !textField(item.reviewerCode) || item.reviewerCode.length > 80
            || !(item.reviewedAt === null || isIsoUtc(item.reviewedAt))) {
            throw new Error('문장·검토 상태·검수자 코드·날짜 형식이 잘못되었습니다.');
        }
        if (ref.language === 'ko-KR') {
            if (item.text !== ref.referenceKo || item.translationReview !== 'reviewed'
                || item.reviewerCode !== '' || item.reviewedAt !== null) {
                throw new Error('한국어 원문 기준 사례는 변경할 수 없습니다.');
            }
        } else if (item.translationReview === 'reviewed') {
            if (item.text.trim().length < 10 || item.text.trim() === item.referenceKo
                || item.reviewerCode.trim().length < 3 || !isIsoUtc(item.reviewedAt)) {
                throw new Error('외국어 검토 완료에는 현지어 문장·검수자 코드·검수 일시가 필요합니다.');
            }
        } else if (item.reviewerCode !== '' || item.reviewedAt !== null) {
            throw new Error('미검토 사례에 검수 완료 기록을 입력할 수 없습니다.');
        }
        cases.push({
            id: ref.id, language: ref.language, referenceKo: ref.referenceKo,
            expectedLabel: ref.expectedLabel, text: item.text,
            translationReview: item.translationReview as LayaV2ReviewStatus,
            reviewerCode: item.reviewerCode, reviewedAt: item.reviewedAt as string | null,
        });
    }
    if (seen.size !== gold.size) throw new Error('필수 위험유형이 포함된 고정 시험자료가 누락됐습니다.');
    return { schema: LAYA_EXTENDED_SCHEMA, purpose: 'synthetic-research-only', cases };
};

export const evaluateLayaExtendedRun = (value: unknown): LayaV2Report => {
    const run = asRecord(value);
    if (!run || run.engine !== 'laya' || run.runtime !== 'local-offline'
        || !textField(run.checkpoint) || !run.checkpoint.trim()
        || !textField(run.checkpointRevision) || !run.checkpointRevision.trim()
        || !Array.isArray(run.predictions) || run.predictions.length > LAYA_V2_EXPECTED_CASES) {
        throw new Error('Laya 모델 정보·로컬 실행 방식·예측 배열을 확인해 주세요.');
    }
    const pack = validateLayaExtendedPack(run);
    const seen = new Set<string>();
    const preds = new Map<string, LayaHazardLabel>();
    const all = new Set(pack.cases.map(x => x.id));
    for (const raw of run.predictions) {
        const p = asRecord(raw);
        if (!p || !textField(p.caseId) || seen.has(p.caseId) || !all.has(p.caseId) || !isValidLabel(p.predictedLabel)
            || (p.confidence !== null && (typeof p.confidence !== 'number'
                || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1))) {
            throw new Error('중복·허위 예측 ID, 위험유형 또는 신뢰도 값이 잘못되었습니다.');
        }
        seen.add(p.caseId);
        preds.set(p.caseId, p.predictedLabel);
    }
    const languages: LayaV2Metrics[] = CURRENT_SITE_TRAINING_LANGUAGE_CODES.map(language => {
        const eligible = pack.cases.filter(c => c.language === language && c.translationReview === 'reviewed');
        let correct=0, falseNegative=0, falsePositive=0, wrongType=0, predicted=0, trueHazards=0, detectedHazards=0;
        for (const c of eligible) {
            if (c.expectedLabel !== 'none') trueHazards++;
            const actual = preds.get(c.id);
            if (actual === undefined) continue;
            predicted++;
            if (c.expectedLabel !== 'none' && actual !== 'none') detectedHazards++;
            if (c.expectedLabel === actual) correct++;
            else if (c.expectedLabel !== 'none' && actual === 'none') falseNegative++;
            else if (c.expectedLabel === 'none' && actual !== 'none') falsePositive++;
            else wrongType++;
        }
        const noPrediction = eligible.length - predicted;
        return {
            language, name: TRAINING_LANGUAGE_LABELS[language], reviewed: eligible.length, predicted,
            correct, falseNegative, falsePositive, wrongType, noPrediction, trueHazards, detectedHazards,
            accuracy: predicted ? correct / predicted : null,
            // Missing model predictions are not evidence of a detected hazard.
            hazardDetectionRecall: trueHazards ? detectedHazards / trueHazards : null,
        };
    });
    const sum = (key: 'reviewed'|'predicted'|'correct'|'falseNegative'|'falsePositive'|'wrongType'|'noPrediction'|'trueHazards'|'detectedHazards') =>
        languages.reduce((n,x)=>n+x[key],0);
    const reviewed=sum('reviewed'), predicted=sum('predicted'), trueHazards=sum('trueHazards');
    return {
        schema: LAYA_EXTENDED_SCHEMA, status: 'research-only',
        safetyApproved: false, provenanceVerified: false, reviewerIdentityVerified: false,
        casesTotal: pack.cases.length, reviewed, predicted, correct:sum('correct'),
        falseNegative:sum('falseNegative'), falsePositive:sum('falsePositive'),
        wrongType:sum('wrongType'), noPrediction:sum('noPrediction'),
        coverageAllCases: predicted / LAYA_V2_EXPECTED_CASES,
        reviewedLanguagesComplete: languages.filter(x=>x.reviewed===LAYA_V2_CASES_PER_LANGUAGE).length,
        predictedLanguagesComplete: languages.filter(x=>x.predicted===LAYA_V2_CASES_PER_LANGUAGE).length,
        accuracy: predicted ? sum('correct')/predicted : null,
        hazardDetectionRecall: trueHazards ? sum('detectedHazards')/trueHazards : null,
        languages,
    };
};
