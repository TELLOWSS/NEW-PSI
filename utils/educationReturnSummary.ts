import type { AssessmentCycleSettings, WorkerRecord } from '../types';
import { getAssessmentCycleCopy, groupRecordsByAssessmentPeriod } from './assessmentCycle';

export interface EducationReturnSummary {
    totalRecords: number;
    completedRecords: number;
    reviewRequiredRecords: number;
    supportedLanguageCount: number;
    targetMonth: string;
    targetPeriod: string;
    workScopeLabel: string;
    topRisks: string[];
    repeatedRiskKeywords: string[];
    reportTargets: number;
    monthlyTrendPct: number;
    periodTrendPct: number;
    improvementRate: number;
    onePageStatus: '생성 가능' | '자료 대기';
    reportStatus: '확인 필요' | '확인 가능' | '자료 대기';
    monthlyStatus: '월별 집계 가능' | '자료 대기';
    trackingStatus: string;
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

export const buildEducationReturnSummary = (
    records: WorkerRecord[] = [],
    assessmentCycle?: Partial<AssessmentCycleSettings> | null,
): EducationReturnSummary => {
    const sorted = [...records].sort((a, b) => parseDateTime(b.date) - parseDateTime(a.date));
    const latest = sorted[0];
    const targetMonth = formatMonth(latest?.date);
    const cycleCopy = getAssessmentCycleCopy(assessmentCycle);
    const periodGroups = Array.from(groupRecordsByAssessmentPeriod(records, assessmentCycle).values())
        .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
    const latestPeriod = periodGroups[periodGroups.length - 1]?.period;

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

    const periodScores = periodGroups.map((group) => group.records
        .map((record) => Number(record.safetyScore))
        .filter((score) => Number.isFinite(score) && score > 0));
    const currentAverage = average(periodScores[periodScores.length - 1] || []);
    const previousAverage = average(periodScores[periodScores.length - 2] || []);
    const periodTrendPct = previousAverage > 0
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
        targetPeriod: latestPeriod?.label || targetMonth,
        workScopeLabel: jobFields.length > 0 ? jobFields[0][0] : '전체 공종',
        topRisks: topRisks.length > 0 ? topRisks : DEFAULT_TOP_RISKS,
        repeatedRiskKeywords: topRisks.length > 0 ? topRisks : DEFAULT_TOP_RISKS,
        reportTargets: records.length,
        monthlyTrendPct: periodTrendPct,
        periodTrendPct,
        improvementRate,
        onePageStatus: records.length > 0 ? '생성 가능' : '자료 대기',
        reportStatus: records.length === 0 ? '자료 대기' : reviewRequiredRecords > 0 ? '확인 필요' : '확인 가능',
        monthlyStatus: records.length > 0 ? '월별 집계 가능' : '자료 대기',
        trackingStatus: records.length > 0 ? `${cycleCopy.shortLabel} 집계 가능` : '자료 대기',
    };
};
