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
