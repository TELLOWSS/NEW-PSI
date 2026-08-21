import type { WorkerRecord } from '../types';
import { getSafetyLevelFromScore, getSafetyLevelThresholds } from './safetyLevelUtils.js';

export type NormalizedOcrScoreBreakdown = NonNullable<WorkerRecord['scoreBreakdown']>;

const clampScore = (value: unknown, fallback = 0): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return Math.max(0, Math.min(100, Math.round(fallback)));
    return Math.max(0, Math.min(100, Math.round(numeric)));
};

const normalizeScoreReasoning = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item || '').trim())
        .filter((item) => item.length > 0)
        .slice(0, 8);
};

const normalizeScoreMetric = (value: unknown, min: number, max: number): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, Math.round(numeric)));
};

const normalizeScoreBreakdown = (value: unknown): NormalizedOcrScoreBreakdown | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as Record<string, unknown>;
    const requiredMetricKeys = [
        'psychological',
        'jobUnderstanding',
        'riskAssessmentUnderstanding',
        'proficiency',
        'improvementExecution',
    ];
    if (!requiredMetricKeys.every((key) => Number.isFinite(Number(source[key])))) return undefined;
    return {
        psychological: normalizeScoreMetric(source.psychological, 0, 10),
        jobUnderstanding: normalizeScoreMetric(source.jobUnderstanding, 0, 20),
        riskAssessmentUnderstanding: normalizeScoreMetric(source.riskAssessmentUnderstanding, 0, 20),
        proficiency: normalizeScoreMetric(source.proficiency, 0, 30),
        improvementExecution: normalizeScoreMetric(source.improvementExecution, 0, 20),
        repeatViolationPenalty: normalizeScoreMetric(source.repeatViolationPenalty, 0, 30),
    };
};

const computeScoreFromBreakdown = (breakdown: NormalizedOcrScoreBreakdown): number => clampScore(
    breakdown.psychological
    + breakdown.jobUnderstanding
    + breakdown.riskAssessmentUnderstanding
    + breakdown.proficiency
    + breakdown.improvementExecution
    - breakdown.repeatViolationPenalty,
    0,
);

const enforceScoreGradeConsistency = (
    scoreInput: unknown,
    levelInput: unknown,
    reasoningInput: unknown,
    fallbackScore: number,
): { safetyScore: number; safetyLevel: WorkerRecord['safetyLevel']; scoreReasoning: string[] } => {
    const safetyScore = clampScore(scoreInput, fallbackScore);
    const derivedLevel = getSafetyLevelFromScore(safetyScore);
    const requestedLevel = (typeof levelInput === 'string' ? levelInput : '').trim();
    const scoreReasoning = normalizeScoreReasoning(reasoningInput);
    const thresholds = getSafetyLevelThresholds();

    if (requestedLevel && requestedLevel !== derivedLevel) {
        scoreReasoning.push(`점수-등급 정합성 검증에 따라 등급을 ${derivedLevel}으로 보정함 (기준: ${thresholds.advancedMin}/${thresholds.intermediateMin}점)`);
    }
    return { safetyScore, safetyLevel: derivedLevel, scoreReasoning };
};

export const isGenericSlogan = (text: string): boolean => {
    const clean = text.replace(/\s+/g, '');
    if (clean.length === 0) return true;
    if (clean.length <= 4) {
        return /조심|주의|준수|확인|착용|체결|철저|안전|제일|열심히|잘하|대비|단속/.test(clean);
    }
    const sloganPatterns = [
        /안전제일/,
        /안전\s*수칙\s*준수/,
        /안전\s*수칙/,
        /조심하겠/,
        /주의하겠/,
        /열심히\s*하겠/,
        /잘\s*하겠/,
        /준수하겠/,
        /확인하겠/,
    ];
    return sloganPatterns.some((pattern) => pattern.test(clean)) && clean.length <= 12;
};

const normalizeScoreQuestionNumber = (value: unknown): string => {
    const matched = String(value || '').match(/[1-5]/);
    return matched ? matched[0] : String(value || '').trim();
};

const getScoreAnswerText = (handwrittenAnswers: unknown[], qNum: string): string => {
    const questionIndex = Number(qNum) - 1;
    const found = handwrittenAnswers.find((answer, index) => {
        if (!answer || typeof answer !== 'object') return false;
        const row = answer as Record<string, unknown>;
        const rawQuestionNumber = row.questionNumber;
        if (normalizeScoreQuestionNumber(rawQuestionNumber) === qNum) return true;
        return !String(rawQuestionNumber || '').trim() && index === questionIndex;
    }) as Record<string, unknown> | undefined;
    return found
        ? String(found.koreanTranslation || found.answerText || found.nativeTranslation || '').trim()
        : '';
};

const countUniqueMatches = (text: string, pattern: RegExp): number => new Set(text.match(pattern) || []).size;

const normalizeCalibrationText = (value: unknown): string => String(value || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();

const calcNgramSimilarity = (left: string, right: string): number => {
    const makeSet = (value: string): Set<string> => {
        const clean = normalizeCalibrationText(value);
        const size = clean.length >= 4 ? 2 : 1;
        const items = new Set<string>();
        for (let index = 0; index <= clean.length - size; index += 1) {
            items.add(clean.slice(index, index + size));
        }
        return items;
    };
    const leftSet = makeSet(left);
    const rightSet = makeSet(right);
    if (leftSet.size === 0 || rightSet.size === 0) return 0;
    const intersection = [...leftSet].filter((item) => rightSet.has(item)).length;
    return intersection / Math.max(leftSet.size, rightSet.size);
};

const adjustBreakdownToTarget = (
    breakdown: NormalizedOcrScoreBreakdown,
    targetScore: number,
): NormalizedOcrScoreBreakdown => {
    const adjusted = { ...breakdown };
    let delta = clampScore(targetScore, computeScoreFromBreakdown(adjusted)) - computeScoreFromBreakdown(adjusted);
    const subtractOrder: Array<keyof Omit<NormalizedOcrScoreBreakdown, 'repeatViolationPenalty'>> = [
        'improvementExecution', 'proficiency', 'riskAssessmentUnderstanding', 'jobUnderstanding', 'psychological',
    ];
    const addOrder: Array<keyof Omit<NormalizedOcrScoreBreakdown, 'repeatViolationPenalty'>> = [
        'riskAssessmentUnderstanding', 'proficiency', 'jobUnderstanding', 'improvementExecution', 'psychological',
    ];
    const maxByMetric: Record<keyof Omit<NormalizedOcrScoreBreakdown, 'repeatViolationPenalty'>, number> = {
        psychological: 10,
        jobUnderstanding: 20,
        riskAssessmentUnderstanding: 20,
        proficiency: 30,
        improvementExecution: 20,
    };

    if (delta < 0) {
        for (const metric of subtractOrder) {
            if (delta === 0) break;
            const reducible = Math.min(adjusted[metric], Math.abs(delta));
            adjusted[metric] -= reducible;
            delta += reducible;
        }
    } else if (delta > 0) {
        for (const metric of addOrder) {
            if (delta === 0) break;
            const room = Math.min(maxByMetric[metric] - adjusted[metric], delta);
            adjusted[metric] += room;
            delta -= room;
        }
    }
    return adjusted;
};

const buildFallbackScoreBreakdownFromAnswers = (
    handwrittenAnswers: unknown[],
    scoreInput: number,
): { breakdown: NormalizedOcrScoreBreakdown; reasoning: string[] } | undefined => {
    const answers = Array.isArray(handwrittenAnswers) ? handwrittenAnswers : [];
    const q1 = getScoreAnswerText(answers, '1');
    const q2 = getScoreAnswerText(answers, '2');
    const q3 = getScoreAnswerText(answers, '3');
    const q4 = getScoreAnswerText(answers, '4');
    const q5 = getScoreAnswerText(answers, '5');
    const allAnswers = [q1, q2, q3, q4, q5];
    const answeredCount = allAnswers.filter(Boolean).length;
    const totalLength = allAnswers.join('').replace(/\s+/g, '').length;
    if (answeredCount === 0 || totalLength === 0) return undefined;

    const riskText = q2 + q3;
    const hasConcreteRisk = /추락|낙하|감전|미끄러|넘어|베임|찔림|붕괴|충돌|끼임|깔림|분진|먼지|화재|폭발|협착|전도/.test(riskText);
    const hasRiskLevel = /상|중|하|높|낮|위험|매우|보통|낮음|중간/.test(q3);
    const hasCause = /때문|경우|하면|으로|해서|않|미착용|미설치|불안정|부족|없/.test(riskText);
    const q4ControlCount = countUniqueMatches(q4, /줄걸이|안전고리|고리|체결|안전벨트|안전모|난간|발판|사다리|장비|보호구|고정|설치|배치|결속|묶음/g);
    const q4HasProcess = /확인\s*후|작업\s*(시|전|후|중)|작업전|작업중|작업후|사전|먼저|확인하고|배치하고|설치하고/.test(q4);
    const q4HasDetail = /정상\s*작동|거리|높이|하중|각도|상태|튼튼|단단|고정|체결|걸고|설치|점검|기준|범위|결속|묶/.test(q4);
    const q4HasNumeric = /[0-9]+(m|cm|kg|t|V|Volt|%|개|번|회|도|초|분|시간|인|명|대)/i.test(q4);
    const q5ActionCount = countUniqueMatches(q5, /줄걸이|안전벨트|안전고리|고리|안전모|난간|발판|사다리|장비|보호구|체결|착용|사용|점검|확인|설치|고정|결속|묶음|신호수|통제선|유도/g);
    const q5HasTimeOrActor = /작업\s*(전|중|후)|작업전|작업중|작업후|시작\s*전|개시\s*전|착수\s*전|종료\s*후|사전|먼저|내가|팀원|신호수|관리자|작업자/.test(q5);

    const heuristicBreakdown: NormalizedOcrScoreBreakdown = {
        psychological: totalLength >= 80 && answeredCount === 5 ? 8 : totalLength >= 40 ? 7 : answeredCount >= 4 ? 6 : 4,
        jobUnderstanding: !q1 ? 0 : isGenericSlogan(q1) ? 5 : q1.replace(/\s+/g, '').length >= 12 ? 18 : 12,
        riskAssessmentUnderstanding: !q2 && !q3 ? 0 : isGenericSlogan(q2) || isGenericSlogan(q3) ? 8 : hasConcreteRisk && hasRiskLevel && hasCause ? 18 : hasConcreteRisk && hasRiskLevel ? 15 : hasConcreteRisk ? 12 : 8,
        proficiency: !q4 ? 0 : isGenericSlogan(q4) ? 5 : q4HasNumeric || (q4ControlCount >= 2 && q4HasProcess && q4HasDetail) ? 24 : q4HasProcess && (q4HasDetail || q4ControlCount >= 1) ? 18 : q4ControlCount >= 1 || q4HasDetail ? 12 : 8,
        improvementExecution: !q5 ? 0 : isGenericSlogan(q5) ? 5 : q5HasTimeOrActor && q5ActionCount >= 2 ? 16 : q5ActionCount >= 2 ? 13 : q5HasTimeOrActor || q5ActionCount >= 1 ? 10 : 6,
        repeatViolationPenalty: 0,
    };
    const heuristicScore = computeScoreFromBreakdown(heuristicBreakdown);
    const targetScore = Number.isFinite(scoreInput)
        ? Math.min(clampScore(scoreInput, heuristicScore), Math.min(100, heuristicScore + 8))
        : heuristicScore;
    return {
        breakdown: adjustBreakdownToTarget(heuristicBreakdown, targetScore),
        reasoning: ['AI 응답에 6대 지표 세부점수가 누락되어 Q1~Q5 답변 근거로 보수적 지표를 복원함'],
    };
};

export const calibrateScoreBreakdown = (
    breakdown: NormalizedOcrScoreBreakdown,
    handwrittenAnswers: unknown[],
): { breakdown: NormalizedOcrScoreBreakdown; reasoning: string[] } => {
    const calibrated = { ...breakdown };
    const reasoning: string[] = [];
    const answers = Array.isArray(handwrittenAnswers) ? handwrittenAnswers : [];
    const q1 = getScoreAnswerText(answers, '1');
    const q2 = getScoreAnswerText(answers, '2');
    const q3 = getScoreAnswerText(answers, '3');
    const q4 = getScoreAnswerText(answers, '4');
    const q5 = getScoreAnswerText(answers, '5');
    const totalLength = (q1 + q2 + q3 + q4 + q5).replace(/\s+/g, '').length;
    const answeredCount = [q1, q2, q3, q4, q5].filter(Boolean).length;
    const sloganCount = [q1, q2, q3, q4, q5].filter((answer) => answer && isGenericSlogan(answer)).length;

    if (totalLength === 0) {
        calibrated.psychological = 0;
        reasoning.push('응답이 작성되지 않아 응답 충실도 0점 처리');
    } else if (totalLength <= 5) {
        calibrated.psychological = Math.min(2, calibrated.psychological);
        reasoning.push('응답 글자 수가 너무 짧아(5자 이하) 응답 충실도 감점 적용');
    } else if (totalLength <= 15) {
        calibrated.psychological = Math.min(5, calibrated.psychological);
        reasoning.push('응답 글자 수가 짧아(15자 이하) 응답 충실도 감점 적용');
    } else if (answeredCount > 0 && sloganCount >= 3) {
        calibrated.psychological = Math.min(4, calibrated.psychological);
        reasoning.push('대부분의 문항에 형식적인 상투어구가 기재되어 응답 충실도 감점 적용');
    }

    if (!q1) {
        calibrated.jobUnderstanding = 0;
        reasoning.push('Q1(세부작업) 미작성으로 업무이해도 0점 처리');
    } else if (isGenericSlogan(q1)) {
        calibrated.jobUnderstanding = Math.min(5, calibrated.jobUnderstanding);
        reasoning.push('Q1(세부작업)에 상투어 또는 추상적 구호가 사용되어 업무이해도 감점 적용');
    }

    const q23Combined = q2 + q3;
    if (!q2 && !q3) {
        calibrated.riskAssessmentUnderstanding = 0;
        reasoning.push('Q2(위험요인) 및 Q3(위험수준) 미작성으로 위험성평가 이해도 0점 처리');
    } else if (q23Combined.replace(/\s+/g, '').length <= 4) {
        calibrated.riskAssessmentUnderstanding = Math.min(5, calibrated.riskAssessmentUnderstanding);
        reasoning.push('Q2, Q3 위험 분석이 부실하여 위험성평가 이해도 감점 적용');
    } else if (isGenericSlogan(q2) || isGenericSlogan(q3)) {
        calibrated.riskAssessmentUnderstanding = Math.min(8, calibrated.riskAssessmentUnderstanding);
        reasoning.push('위험요인 분석에 상투어구가 사용되어 위험성평가 이해도 감점 적용');
    }

    if (!q4) {
        calibrated.proficiency = 0;
        reasoning.push('Q4(감소대책) 미작성으로 숙련도 0점 처리');
    } else if (isGenericSlogan(q4)) {
        calibrated.proficiency = Math.min(5, calibrated.proficiency);
        reasoning.push('Q4(감소대책)에 형식적인 구호가 기재되어 숙련도 감점 적용');
    } else {
        const hasNumericCriterion = /[0-9]+(m|cm|kg|t|V|Volt|%|개|번|회|도|초|분|시간|인|명|대)/i.test(q4);
        const controlKeywordCount = countUniqueMatches(q4, /줄걸이|안전고리|고리|체결|안전벨트|안전모|난간|발판|사다리|장비|보호구|고정|설치|배치/g);
        const hasProcessSteps = /확인\s*후|작업\s*(시|전|후|중)|작업전|작업중|작업후|사전|먼저|확인하고|배치하고|설치하고/.test(q4);
        const hasVerificationDetail = /정상\s*작동|거리|높이|하중|각도|상태|튼튼|단단|고정|체결|걸고|설치|점검|기준|범위/.test(q4);
        if (hasNumericCriterion || (controlKeywordCount >= 2 && hasProcessSteps && hasVerificationDetail)) {
            calibrated.proficiency = Math.max(24, calibrated.proficiency);
        } else if (hasProcessSteps && hasVerificationDetail) {
            calibrated.proficiency = Math.max(16, Math.min(23, calibrated.proficiency));
        } else {
            calibrated.proficiency = Math.min(15, calibrated.proficiency);
            if (controlKeywordCount >= 1) reasoning.push('Q4(감소대책)가 안전장비 단일 조치 중심이라 검증기준 없는 단일조치 구간으로 보정');
        }
    }

    if (!q5) {
        calibrated.improvementExecution = 0;
        reasoning.push('Q5(실천행동) 미작성으로 개선이행도 0점 처리');
    } else if (isGenericSlogan(q5)) {
        calibrated.improvementExecution = Math.min(5, calibrated.improvementExecution);
        reasoning.push('Q5(실천행동)에 형식적 구호가 기재되어 개선이행도 감점 적용');
    } else {
        const hasTimeMarker = /작업\s*(전|중|후)|작업전|작업중|작업후|시작\s*전|개시\s*전|착수\s*전|종료\s*후|사전|먼저/.test(q5);
        const hasActorMarker = /내가|내가\s*직접|팀원|신호수|관리자|작업자/.test(q5);
        const actionKeywordCount = countUniqueMatches(q5, /줄걸이|안전벨트|안전고리|고리|안전모|난간|발판|사다리|장비|보호구|체결|착용|사용|점검|확인|설치|고정|결속|묶음|신호수|통제선|유도/g);
        calibrated.improvementExecution = (hasTimeMarker || hasActorMarker) && actionKeywordCount >= 2
            ? Math.max(14, calibrated.improvementExecution)
            : Math.min(13, calibrated.improvementExecution);
    }

    const combinedText = (q1 + q2 + q3 + q4 + q5).replace(/\s+/g, '');
    let repeatedFillerCount = 0;
    [/조심하겠/g, /주의하겠/g, /안전제일/g, /준수하겠/g, /확인하겠/g, /열심히하겠/g, /안전수칙/g].forEach((regex) => {
        const matches = combinedText.match(regex);
        if (matches && matches.length >= 2) repeatedFillerCount += matches.length - 1;
    });
    if (repeatedFillerCount > 0) {
        calibrated.psychological = Math.min(calibrated.psychological, 4);
        calibrated.improvementExecution = Math.min(calibrated.improvementExecution, 5);
        reasoning.push('상투적인 안전 표현이 반복되어 응답 충실도와 개선이행도 감점 적용');
    }

    const q4q5Similarity = calcNgramSimilarity(q4, q5);
    if (q4 && q5 && q4q5Similarity >= 0.72) {
        calibrated.improvementExecution = Math.min(calibrated.improvementExecution, q4q5Similarity >= 0.88 ? 10 : 13);
        reasoning.push('Q4 감소대책과 Q5 실천행동이 유사하여 개선이행도 감점 적용');
    }
    if (calibrated.repeatViolationPenalty > 0) {
        calibrated.repeatViolationPenalty = 0;
        reasoning.push('현재 단일 기록지에서는 다음 운영 주기 이행 여부를 확정할 수 없어 반복위반 패널티를 추적관리 단계로 보류');
    }
    return { breakdown: calibrated, reasoning };
};

export const enforceBreakdownDrivenScore = (
    scoreInput: unknown,
    levelInput: unknown,
    reasoningInput: unknown,
    breakdownInput: unknown,
    handwrittenAnswers: unknown,
    fallbackScore: number,
): {
    safetyScore: number;
    safetyLevel: WorkerRecord['safetyLevel'];
    scoreReasoning: string[];
    scoreBreakdown?: NormalizedOcrScoreBreakdown;
} => {
    const normalizedBreakdown = normalizeScoreBreakdown(breakdownInput);
    const firstPass = enforceScoreGradeConsistency(scoreInput, levelInput, reasoningInput, fallbackScore);
    const answersArray = Array.isArray(handwrittenAnswers) ? handwrittenAnswers : [];

    if (!normalizedBreakdown) {
        const fallbackBreakdown = buildFallbackScoreBreakdownFromAnswers(answersArray, firstPass.safetyScore);
        if (!fallbackBreakdown) return { ...firstPass, scoreBreakdown: undefined };
        const fallbackBreakdownScore = computeScoreFromBreakdown(fallbackBreakdown.breakdown);
        const finalized = enforceScoreGradeConsistency(
            fallbackBreakdownScore,
            firstPass.safetyLevel,
            [...firstPass.scoreReasoning, ...fallbackBreakdown.reasoning, `6대 지표 누락 복원 결과에 따라 점수를 ${fallbackBreakdownScore}점으로 보정함`],
            fallbackBreakdownScore,
        );
        return { ...finalized, scoreBreakdown: fallbackBreakdown.breakdown };
    }

    const calibrationResult = calibrateScoreBreakdown(normalizedBreakdown, answersArray);
    const breakdownScore = computeScoreFromBreakdown(calibrationResult.breakdown);
    const reasons = [...firstPass.scoreReasoning, ...calibrationResult.reasoning];
    if (Math.abs(firstPass.safetyScore - breakdownScore) >= 2 && calibrationResult.reasoning.length === 0) {
        reasons.push(`6대 지표 합산 정합성 검증에 따라 점수를 ${breakdownScore}점으로 보정함`);
    }
    const finalized = enforceScoreGradeConsistency(
        breakdownScore,
        firstPass.safetyLevel,
        reasons,
        fallbackScore,
    );
    return { ...finalized, scoreBreakdown: calibrationResult.breakdown };
};
