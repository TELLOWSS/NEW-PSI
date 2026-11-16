import type { SixMetricBreakdown, WorkerRecord } from '../types';
import { getKoreanCalendarDay } from './monthlyFieldFollowup';

export function nexusEventsAsOf(record: Pick<WorkerRecord, 'date' | 'riskFollowupEvents'>, question: number, asOfDate: string) {
  const recordDay = String(record.date || '').slice(0, 10);
  const parsedDay = new Date(recordDay + 'T00:00:00.000Z');
  const validRecordDay = /^\d{4}-\d{2}-\d{2}$/.test(recordDay) && Number.isFinite(parsedDay.getTime())
    && parsedDay.toISOString().slice(0, 10) === recordDay;
  if (validRecordDay && recordDay > asOfDate) return [];
  return (record.riskFollowupEvents || []).filter(event => {
    if (!event || !event.id || !event.caseId || event.questionNumber !== question) return false;
    const date = new Date(event.timestamp);
    return Number.isFinite(date.getTime()) && getKoreanCalendarDay(date) <= asOfDate;
  });
}

export const NEXUS_SCORE_FIELDS: { key: keyof SixMetricBreakdown; label: string; max: number }[] = [
  { key: 'psychological', label: '응답 충실도', max: 10 },
  { key: 'jobUnderstanding', label: '업무이해도', max: 20 },
  { key: 'riskAssessmentUnderstanding', label: '위험성평가 이해도', max: 20 },
  { key: 'proficiency', label: '숙련도', max: 30 },
  { key: 'improvementExecution', label: '개선이행도', max: 20 },
];

export function summarizeNexusScoreEvidence(rows: readonly Pick<WorkerRecord, 'scoreBreakdown'>[]) {
  return NEXUS_SCORE_FIELDS.map(field => {
    const values = rows.map(row => row.scoreBreakdown?.[field.key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= field.max);
    return { ...field, valid: values.length, missing: rows.length - values.length,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
  });
}

/**
 * Read-only, privacy-minimal snapshot of the records already loaded by App.
 * Not site/month scoped, deduplicated, official risk ratings, or verified approvals.
 * Do not merge this view into official Reports calculations.
 */
export type SelfRiskLevel = '상' | '중' | '하';
export interface SafetyNexusSnapshot {
  loadedRecordRows: number;
  selfRiskLevels: Record<SelfRiskLevel, number>;
  unclassifiedRows: number;
  pendingReviewMarkedRows: number;
  scopeVerified: false;
  officialReportComparable: false;
}

export const summarizeLoadedNexusRecords = (
  rows: readonly Pick<WorkerRecord, 'selfAssessedRiskLevel' | 'reviewStatus' | 'approvalStatus'>[],
): SafetyNexusSnapshot => {
  const selfRiskLevels: Record<SelfRiskLevel, number> = { '상': 0, '중': 0, '하': 0 };
  let unclassifiedRows = 0;
  let pendingReviewMarkedRows = 0;
  for (const row of rows) {
    const level = row.selfAssessedRiskLevel;
    if (level === '상' || level === '중' || level === '하') selfRiskLevels[level]++;
    else unclassifiedRows++;
    if (row.reviewStatus === 'PENDING' || row.approvalStatus === 'PENDING') {
      pendingReviewMarkedRows++;
    }
  }
  return {
    loadedRecordRows: rows.length,
    selfRiskLevels,
    unclassifiedRows,
    pendingReviewMarkedRows,
    scopeVerified: false,
    officialReportComparable: false,
  };
};

/** Exactly the date / trade fields already carried by a loaded WorkerRecord. */
export interface SafetyNexusLocalFilter {
  month: string; // 'YYYY-MM' or '' for all; NOT an authenticated site scope
  trade: string; // exact WorkerRecord.jobField or ''
}
export interface SafetyNexusLocalSlice {
  monthOptions: string[];
  tradeOptions: string[];
  matchingRows: number;
  undatedRowsInAllPeriods: number;
  snapshot: SafetyNexusSnapshot;
  scope: 'CURRENTLY_LOADED_RECORDS_ONLY';
}
const monthOf = (value: unknown): string => {
  const day = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T|\s)/.test(day)) return '';
  const date = new Date(day.slice(0, 10) + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day.slice(0, 10)
    ? day.slice(0, 7) : '';
};
/** Select the same loaded assessment rows for perception, follow-ups and rechecks.
 * This is only an in-memory assessment-date/trade filter; NOT a site authorization.
 */
export const filterLoadedNexusRecords = <T extends Pick<WorkerRecord, 'date' | 'jobField'>>(
  rows: readonly T[],
  filters: SafetyNexusLocalFilter,
): T[] => rows.filter(row =>
  (!filters.month || monthOf(row.date) === filters.month)
  && (!filters.trade || String(row.jobField || '').trim() === filters.trade)
);

/** Never assign a missing/ambiguous date to the selected month. No cross-site inference. */
export const sliceLoadedNexusRecords = (
  rows: readonly Pick<WorkerRecord, 'date' | 'jobField' | 'selfAssessedRiskLevel' | 'reviewStatus' | 'approvalStatus'>[],
  filters: SafetyNexusLocalFilter,
): SafetyNexusLocalSlice => {
  const monthOptions = [...new Set(rows.map(row => monthOf(row.date)).filter(Boolean))].sort().reverse();
  const tradeOptions = [...new Set(rows.map(row => String(row.jobField || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const selected = filterLoadedNexusRecords(rows, filters);
  return {
    monthOptions,
    tradeOptions,
    matchingRows: selected.length,
    undatedRowsInAllPeriods: selected.filter(row => !monthOf(row.date)).length,
    snapshot: summarizeLoadedNexusRecords(selected),
    scope: 'CURRENTLY_LOADED_RECORDS_ONLY',
  };
};
