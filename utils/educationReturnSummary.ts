import type { WorkerRecord } from '../types';

export interface EducationReturnSummary {
    totalRecords: number;
    completedRecords: number;
    reviewRequiredRecords: number;
    supportedLanguageCount: number;
    targetMonth: string;
    workScopeLabel: string;
    topRisks: string[];
    repeatedRiskKeywords: string[];
    reportTargets: number;
    monthlyTrendPct: number;
    improvementRate: number;
    onePageStatus: '생성 가능' | '자료 대기';
    reportStatus: '확인 필요' | '확인 가능' | '자료 대기';
    monthlyStatus: '월별 집계 가능' | '자료 대기';
}

const DEFAULT_TOP_RISKS = ['추락', '장비 충돌', '자재 낙하'];
const DEFAULT_SUPPORTED_LANGUAGE_COUNT = 8;

const parseDateTime = (value: string | undefined): number => {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
};

const formatMonth = (value: string | undefined): string => {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
    return new Date().toISOString().slice(0, 7);
};

const countBy = (items: string[]): Array<[string, number]> => {
    const counts = new Map<string, number>();
    items
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
};

const average = (values: number[]): number => {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const isReviewRequired = (record: WorkerRecord): boolean => {
    return record.reviewStatus === 'PENDING'
        || record.approvalStatus === 'PENDING'
        || record.approvalState === 'PENDING'
        || record.workflowState === 'manual_review_required'
        || record.workflowState === 'awaiting_manager_approval'
        || record.workflowState === 'second_pass_analyzing'
        || record.secondPassStatus === 'NEEDED'
        || Boolean(record.ocrFailureCode || record.ocrErrorType);
};

const isCompleted = (record: WorkerRecord): boolean => {
    return record.workflowState === 'completed'
        || record.reviewStatus === 'APPROVED'
        || record.approvalStatus === 'APPROVED'
        || record.approvalState === 'APPROVED'
        || (Number(record.safetyScore) > 0 && !record.ocrFailureCode && !record.ocrErrorType);
};

export const buildEducationReturnSummary = (records: WorkerRecord[] = []): EducationReturnSummary => {
    const sorted = [...records].sort((a, b) => parseDateTime(b.date) - parseDateTime(a.date));
    const latest = sorted[0];
    const targetMonth = formatMonth(latest?.date);

    const topRisks = countBy(records.flatMap((record) => record.weakAreas || []))
        .slice(0, 3)
        .map(([risk]) => risk);

    const jobFields = countBy(records.map((record) => record.jobField || ''));
    const languages = new Set(
        records
            .flatMap((record) => [record.language, record.nationality])
            .map((value) => String(value || '').trim())
            .filter(Boolean),
    );

    const monthScores = new Map<string, number[]>();
    records.forEach((record) => {
        const score = Number(record.safetyScore);
        if (!Number.isFinite(score) || score <= 0) return;
        const month = formatMonth(record.date);
        monthScores.set(month, [...(monthScores.get(month) || []), score]);
    });

    const monthKeys = Array.from(monthScores.keys()).sort();
    const currentMonth = monthKeys[monthKeys.length - 1];
    const previousMonth = monthKeys[monthKeys.length - 2];
    const currentAverage = average(currentMonth ? monthScores.get(currentMonth) || [] : []);
    const previousAverage = average(previousMonth ? monthScores.get(previousMonth) || [] : []);
    const monthlyTrendPct = previousAverage > 0
        ? Math.round(((currentAverage - previousAverage) / previousAverage) * 100)
        : 0;

    const improvedRecords = records.filter((record) => {
        const approved = record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED' || record.approvalState === 'APPROVED';
        const hasAction = Boolean(String(record.improvement || record.actionable_coaching || '').trim());
        return approved || hasAction;
    }).length;

    const improvementRate = records.length > 0 ? Math.round((improvedRecords / records.length) * 100) : 0;
    const reviewRequiredRecords = records.filter(isReviewRequired).length;

    return {
        totalRecords: records.length,
        completedRecords: records.filter(isCompleted).length,
        reviewRequiredRecords,
        supportedLanguageCount: Math.max(DEFAULT_SUPPORTED_LANGUAGE_COUNT, languages.size),
        targetMonth,
        workScopeLabel: jobFields.length > 0 ? jobFields[0][0] : '전체 공종',
        topRisks: topRisks.length > 0 ? topRisks : DEFAULT_TOP_RISKS,
        repeatedRiskKeywords: topRisks.length > 0 ? topRisks : DEFAULT_TOP_RISKS,
        reportTargets: records.length,
        monthlyTrendPct,
        improvementRate,
        onePageStatus: records.length > 0 ? '생성 가능' : '자료 대기',
        reportStatus: records.length === 0 ? '자료 대기' : reviewRequiredRecords > 0 ? '확인 필요' : '확인 가능',
        monthlyStatus: records.length > 0 ? '월별 집계 가능' : '자료 대기',
    };
};
