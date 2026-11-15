import type { WorkerRecord } from '../types';

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
/** Never assign a missing/ambiguous date to the selected month. No cross-site inference. */
export const sliceLoadedNexusRecords = (
  rows: readonly Pick<WorkerRecord, 'date' | 'jobField' | 'selfAssessedRiskLevel' | 'reviewStatus' | 'approvalStatus'>[],
  filters: SafetyNexusLocalFilter,
): SafetyNexusLocalSlice => {
  const monthOptions = [...new Set(rows.map(row => monthOf(row.date)).filter(Boolean))].sort().reverse();
  const tradeOptions = [...new Set(rows.map(row => String(row.jobField || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const selected = rows.filter(row =>
    (!filters.month || monthOf(row.date) === filters.month)
    && (!filters.trade || String(row.jobField || '').trim() === filters.trade)
  );
  return {
    monthOptions,
    tradeOptions,
    matchingRows: selected.length,
    undatedRowsInAllPeriods: selected.filter(row => !monthOf(row.date)).length,
    snapshot: summarizeLoadedNexusRecords(selected),
    scope: 'CURRENTLY_LOADED_RECORDS_ONLY',
  };
};
