import type { HandwrittenAnswer, WorkerRecord } from '../types';
import {
    PSI_FORM_MASTER_VERSION,
    PSI_FORM_QUESTIONS,
    PSI_RISK_TYPE_CATALOG,
    PSI_STANDARD_JOB_FIELDS,
    getPsiQuestionDefinition,
} from '../config/psiFormMaster';
import { getNativeLanguageLabel, isKoreanNationality } from './ocrVerificationLanguageUtils';

export type PsiFormIntegrityIssueCode =
    | 'FORM_MASTER_VERSION'
    | 'JOB_FIELD_MISSING'
    | 'QUESTION_ANSWER_MISSING'
    | 'Q1_JOBFIELD_CONFUSION'
    | 'Q2_Q3_RISK_LINK_WEAK'
    | 'Q4_CONTROL_LINK_WEAK'
    | 'Q4_Q5_DUPLICATE_ACTION'
    | 'REPEAT_PENALTY_NOT_TRACKED';

export interface PsiFormIntegrityIssue {
    code: PsiFormIntegrityIssueCode;
    severity: 'info' | 'warning' | 'error';
    message: string;
    relatedQuestions?: string[];
}

export interface PsiFormIntegrityResult {
    ruleVersion: string;
    detectedRiskTypes: string[];
    issues: PsiFormIntegrityIssue[];
    isHealthy: boolean;
}

export interface NativeGuidanceRevisionSyncResult {
    ruleVersion: string;
    nativeLanguageLabel: string;
    changedKoreanFields: string[];
    changedNativeFields: string[];
    needsRefresh: boolean;
    issues: string[];
}

const normalizeText = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeDense = (value: unknown): string => normalizeText(value).replace(/\s+/g, '');

const normalizeQuestionNumber = (value: unknown): string => {
    const matched = String(value || '').match(/[1-5]/);
    return matched ? matched[0] : '';
};

export const getPsiAnswerByQuestion = (
    answers: HandwrittenAnswer[] | undefined,
    questionNumber: unknown,
): HandwrittenAnswer | undefined => {
    const normalized = normalizeQuestionNumber(questionNumber);
    if (!normalized || !Array.isArray(answers)) return undefined;
    return answers.find((answer, index) => {
        const answerNumber = normalizeQuestionNumber(answer.questionNumber);
        return answerNumber ? answerNumber === normalized : index === Number(normalized) - 1;
    });
};

const getAnswerText = (record: WorkerRecord, questionNumber: unknown): string => {
    const answer = getPsiAnswerByQuestion(record.handwrittenAnswers, questionNumber);
    return normalizeText(answer?.koreanTranslation || answer?.answerText || answer?.nativeTranslation);
};

export const detectPsiRiskTypes = (value: unknown): string[] => {
    const text = normalizeText(value);
    if (!text) return [];
    return PSI_RISK_TYPE_CATALOG
        .filter((risk) => risk.id !== 'other')
        .filter((risk) => risk.keywords.some((keyword) => text.includes(keyword)))
        .map((risk) => risk.label);
};

const hasAnyKeyword = (text: string, keywords: readonly string[]): boolean => (
    keywords.some((keyword) => text.includes(keyword))
);

const getMatchedRiskControls = (riskLabels: string[], controlText: string): string[] => (
    PSI_RISK_TYPE_CATALOG
        .filter((risk) => riskLabels.includes(risk.label))
        .filter((risk) => hasAnyKeyword(controlText, risk.controlKeywords))
        .map((risk) => risk.label)
);

const getSimilarity = (left: string, right: string): number => {
    const a = normalizeDense(left);
    const b = normalizeDense(right);
    if (!a || !b) return 0;
    const makeSet = (value: string) => {
        const size = value.length >= 4 ? 2 : 1;
        const set = new Set<string>();
        for (let index = 0; index <= value.length - size; index += 1) {
            set.add(value.slice(index, index + size));
        }
        return set;
    };
    const leftSet = makeSet(a);
    const rightSet = makeSet(b);
    const intersection = [...leftSet].filter((item) => rightSet.has(item)).length;
    return intersection / Math.max(leftSet.size, rightSet.size, 1);
};

const hasTrackingEvidenceForRepeatPenalty = (record: WorkerRecord): boolean => {
    const text = [
        record.reviewReason,
        record.adminComment,
        record.approvalReason,
        record.score_reason,
        ...(record.scoreReasoning || []),
        ...(record.actionHistory || []).map((entry) => entry.detail),
        ...(record.scoreAdjustmentHistory || []).flatMap((entry) => [entry.reasonDetail, entry.evidenceSummary]),
        ...(record.auditTrail || []).map((entry) => entry.note),
    ].map(normalizeText).join(' ');
    return /다음\s*(?:달|주|작업일|운영\s*주기|회차)|직전\s*(?:작업일|주|2주|운영\s*주기|회차)|전월|지난\s*(?:달|주)|추적|현장\s*확인|약속\s*미이행|개선\s*미이행|동일\s*위험\s*재발|반복\s*위반|재발/.test(text);
};

export const evaluatePsiFormIntegrity = (record: WorkerRecord): PsiFormIntegrityResult => {
    const issues: PsiFormIntegrityIssue[] = [];
    const jobField = normalizeText(record.jobField);
    const q1 = getAnswerText(record, '1');
    const q2 = getAnswerText(record, '2');
    const q3 = getAnswerText(record, '3');
    const q4 = getAnswerText(record, '4');
    const q5 = getAnswerText(record, '5');

    if (!jobField || jobField === '미분류' || jobField === '기타') {
        issues.push({
            code: 'JOB_FIELD_MISSING',
            severity: 'warning',
            message: '하단 공종 칸이 비었거나 불명확합니다. Q1 세부작업으로 공종을 자동 확정하지 말고 원본 하단 공종 칸을 확인하세요.',
        });
    }

    PSI_FORM_QUESTIONS.forEach((question) => {
        const answerText = getAnswerText(record, question.questionNumber);
        if (!answerText) {
            issues.push({
                code: 'QUESTION_ANSWER_MISSING',
                severity: 'warning',
                message: `${question.key} 답변이 비어 있습니다. 원본 이미지와 문항별 인식 결과를 대조하세요.`,
                relatedQuestions: [question.key],
            });
        }
    });

    const q1LooksLikeJobOnly = q1 && PSI_STANDARD_JOB_FIELDS
        .filter((field) => field !== '기타' && field !== '미분류')
        .some((field) => q1 === field || q1 === `${field}작업` || q1 === `${field} 작업`);

    if (q1LooksLikeJobOnly) {
        issues.push({
            code: 'Q1_JOBFIELD_CONFUSION',
            severity: 'info',
            message: 'Q1은 공종 자체가 아니라 공종 안의 가장 위험한 세부작업입니다. 필요하면 세부작업 표현을 보강하세요.',
            relatedQuestions: ['Q1'],
        });
    }

    const detectedRiskTypes = Array.from(new Set([
        ...detectPsiRiskTypes(q2),
        ...detectPsiRiskTypes(q3),
        ...detectPsiRiskTypes(q4),
        ...detectPsiRiskTypes(record.weakAreas?.join(' ')),
    ]));

    if ((q2 || q3) && detectedRiskTypes.length === 0) {
        issues.push({
            code: 'Q2_Q3_RISK_LINK_WEAK',
            severity: 'warning',
            message: 'Q2·Q3에서 표준 위험유형이 뚜렷하지 않습니다. 사고 원인과 위험수준 이유를 원본 기준으로 다시 확인하세요.',
            relatedQuestions: ['Q2', 'Q3'],
        });
    }

    if (detectedRiskTypes.length > 0 && q4) {
        const matchedControls = getMatchedRiskControls(detectedRiskTypes, q4);
        if (matchedControls.length === 0) {
            issues.push({
                code: 'Q4_CONTROL_LINK_WEAK',
                severity: 'warning',
                message: `Q4 감소대책이 감지된 위험유형(${detectedRiskTypes.slice(0, 3).join(', ')})과 직접 연결되는지 확인이 필요합니다.`,
                relatedQuestions: ['Q2', 'Q4'],
            });
        }
    }

    if (q4 && q5 && getSimilarity(q4, q5) >= 0.82) {
        issues.push({
            code: 'Q4_Q5_DUPLICATE_ACTION',
            severity: 'info',
            message: 'Q4 대책과 Q5 실천행동이 거의 같습니다. 반복위반이 아니라 개선이행도 보강 신호로 봅니다.',
            relatedQuestions: ['Q4', 'Q5'],
        });
    }

    const repeatPenalty = Number(record.scoreBreakdown?.repeatViolationPenalty || 0);
    if (repeatPenalty > 0 && !hasTrackingEvidenceForRepeatPenalty(record)) {
        issues.push({
            code: 'REPEAT_PENALTY_NOT_TRACKED',
            severity: 'error',
            message: '반복위반 패널티는 다음 운영 주기의 현장 확인·동일 위험 재발·약속 미이행 증거가 있을 때만 적용할 수 있습니다.',
        });
    }

    return {
        ruleVersion: PSI_FORM_MASTER_VERSION,
        detectedRiskTypes,
        issues,
        isHealthy: !issues.some((issue) => issue.severity === 'error'),
    };
};

const KOREAN_SOURCE_FIELDS = [
    'aiInsights',
    'koreanTranslation',
    'score_reason',
    'actionable_coaching',
    'improvement',
    'suggestions',
    'weakAreas',
    'strengths',
    'handwrittenAnswers',
] as const;

const NATIVE_TARGET_FIELDS = [
    'aiInsights_native',
    'score_reason_native',
    'actionable_coaching_native',
    'improvement_native',
    'suggestions_native',
    'weakAreas_native',
    'strengths_native',
    'handwrittenAnswers',
] as const;

const valueChanged = (left: unknown, right: unknown): boolean => {
    try {
        return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
    } catch {
        return String(left ?? '') !== String(right ?? '');
    }
};

const getChangedFieldsFromPrevious = (record: WorkerRecord, previous?: WorkerRecord): string[] => {
    if (previous) {
        return [...KOREAN_SOURCE_FIELDS, ...NATIVE_TARGET_FIELDS]
            .filter((field) => valueChanged(previous[field as keyof WorkerRecord], record[field as keyof WorkerRecord]));
    }
    const latestCorrection = (record.correctionHistory || []).slice(-1)[0];
    return Array.isArray(latestCorrection?.changedFields) ? latestCorrection.changedFields : [];
};

export const evaluateNativeGuidanceRevisionSync = (
    record: WorkerRecord,
    previousRecord?: WorkerRecord,
): NativeGuidanceRevisionSyncResult => {
    const nativeLanguageLabel = getNativeLanguageLabel(record.nationality, record.language);
    const changedFields = getChangedFieldsFromPrevious(record, previousRecord);
    const changedKoreanFields = changedFields.filter((field) => KOREAN_SOURCE_FIELDS.includes(field as typeof KOREAN_SOURCE_FIELDS[number]));
    const changedNativeFields = changedFields.filter((field) => NATIVE_TARGET_FIELDS.includes(field as typeof NATIVE_TARGET_FIELDS[number]));
    const isKoreanWorker = isKoreanNationality(record.nationality, record.language);
    const issues: string[] = [];

    const aiNative = normalizeText(record.aiInsights_native);
    const scoreNative = normalizeText(record.score_reason_native);
    const coachingNative = normalizeText(record.actionable_coaching_native);
    const hasNativeBasics = isKoreanWorker || Boolean(aiNative);

    if (!hasNativeBasics) {
        issues.push(`${nativeLanguageLabel} 보호 안내가 비어 있습니다.`);
    }
    if (!isKoreanWorker && normalizeText(record.score_reason) && !scoreNative) {
        issues.push(`${nativeLanguageLabel} 점수 근거 안내가 비어 있습니다.`);
    }
    if (!isKoreanWorker && normalizeText(record.actionable_coaching) && !coachingNative) {
        issues.push(`${nativeLanguageLabel} 실천 안내가 비어 있습니다.`);
    }
    if (!isKoreanWorker && changedKoreanFields.length > 0 && changedNativeFields.length === 0) {
        issues.push(`한국어 판단(${changedKoreanFields.join(', ')})이 바뀌었지만 ${nativeLanguageLabel} 안내 갱신 흔적이 없습니다.`);
    }

    return {
        ruleVersion: PSI_FORM_MASTER_VERSION,
        nativeLanguageLabel,
        changedKoreanFields,
        changedNativeFields,
        needsRefresh: issues.length > 0,
        issues,
    };
};

export const buildPsiFormIntegritySummary = (record: WorkerRecord): string => {
    const result = evaluatePsiFormIntegrity(record);
    if (result.issues.length === 0) return `기준데이터 ${result.ruleVersion}: 문항 연결 정상`;
    return result.issues.slice(0, 3).map((issue) => issue.message).join(' / ');
};

export const getPsiQuestionIntent = (questionNumber: unknown): string => (
    getPsiQuestionDefinition(questionNumber)?.workerIntent || '위험성평가 문항 의도를 확인합니다.'
);
