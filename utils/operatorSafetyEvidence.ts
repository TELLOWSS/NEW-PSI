import type { WorkerRecord } from '../types';
import {
    calculateCoreMetricSnapshot, hasValidSafetyScore,
    isOperationalWorkerRecord, selectLatestCoreMetricRecords,
} from './coreMetrics';
import {
    isPendingOperationsReviewRecord,
    isProtectionPriorityRecord,
} from './operationsBoard';
import { getSafetyLevelThresholds } from './safetyLevelUtils';

/**
 * Read-only safety evidence for the main operator landing screen.
 * Source scope is the already loaded self-risk assessment records,
 * NOT all site inspections, equipment, photos, or Inspector server actions.
 */
export interface OperatorSafetyEvidence {
    loadedSourceRecords: number;
    excludedNonWorkerRecords: number;
    operationalSourceRecords: number;
    latestAssessmentRecords: number;
    latestCriticalStopSignals: number;
    olderCriticalStopRecords: number;
    latestImmediateAttention: number;
    latestSelfDeclaredHighRisk: number;
    latestProtectionPriority: number;
    latestPendingReview: number;
    validScoreRecords: number;
    missingOrInvalidScoreRecords: number;
    validImprovementResponseRecords: number;
    unidentifiedLatestRecords: number;
    /** Neither current nor previous CRITICAL_STOP signals prove site status. */
    siteControlVerified: false;
    inspectorActionsQueried: false;
}

export const summarizeOperatorSafetyEvidence = (
    records: readonly WorkerRecord[],
): OperatorSafetyEvidence => {
    const operational = records.filter(isOperationalWorkerRecord);
    const latest = selectLatestCoreMetricRecords(operational);
    const latestRefs = new Set(latest);
    const scoreSnapshot = calculateCoreMetricSnapshot(operational);
    const threshold = getSafetyLevelThresholds().intermediateMin;

    return {
        loadedSourceRecords: records.length,
        excludedNonWorkerRecords: records.length - operational.length,
        operationalSourceRecords: operational.length,
        latestAssessmentRecords: latest.length,
        latestCriticalStopSignals: latest.filter(x => x.riskDecision === 'CRITICAL_STOP').length,
        olderCriticalStopRecords: operational.filter(x =>
            x.riskDecision === 'CRITICAL_STOP' && !latestRefs.has(x)
        ).length,
        latestImmediateAttention: latest.filter(x => x.riskDecision === 'IMMEDIATE_ATTENTION').length,
        latestSelfDeclaredHighRisk: latest.filter(x => x.selfAssessedRiskLevel === '상').length,
        latestProtectionPriority: latest.filter(x => isProtectionPriorityRecord(x, threshold)).length,
        latestPendingReview: latest.filter(isPendingOperationsReviewRecord).length,
        validScoreRecords: scoreSnapshot.validScoreRecordCount,
        missingOrInvalidScoreRecords: scoreSnapshot.excludedInvalidScoreCount,
        validImprovementResponseRecords: latest.filter(x =>
            hasValidSafetyScore(x) &&
            typeof x.scoreBreakdown?.improvementExecution === 'number' &&
            Number.isFinite(x.scoreBreakdown.improvementExecution) &&
            x.scoreBreakdown.improvementExecution >= 0 &&
            x.scoreBreakdown.improvementExecution <= 20
        ).length,
        unidentifiedLatestRecords: scoreSnapshot.unconfirmedIdentityCount,
        siteControlVerified: false,
        inspectorActionsQueried: false,
    };
};
