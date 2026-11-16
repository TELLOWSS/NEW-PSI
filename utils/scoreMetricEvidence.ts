import type { WorkerRecord } from '../types';
import { hasValidSafetyScore, selectLatestCoreMetricRecords } from './coreMetrics';
import { METRIC_MAX, metricValue, SIX_METRIC_KEYS, SIX_METRIC_LABELS } from './radarMetrics';

export const SCORE_EVIDENCE_VERSION = 'psi-score-evidence-v1';
export type ScoreMetricKey = typeof SIX_METRIC_KEYS[number];
export interface ScoreMetricEvidence {
    key: ScoreMetricKey;
    label: string;
    max: number;
    average: number | null;
    total: number;
    valid: number;
    missing: number;
    excluded: number;
    sourceRecords: WorkerRecord[];
}

/** Caller supplies the exact population. Missing and invalid values never enter a denominator. */
export function summarizeScoreMetricEvidence(records: readonly WorkerRecord[]): ScoreMetricEvidence[] {
    return SIX_METRIC_KEYS.map(key => {
        let missing = 0;
        let excluded = 0;
        let sum = 0;
        const sourceRecords: WorkerRecord[] = [];
        for (const record of records) {
            if (!hasValidSafetyScore(record)) { excluded++; continue; }
            const raw = record.scoreBreakdown?.[key];
            if (raw === undefined || raw === null) { missing++; continue; }
            const value = metricValue(key, raw);
            if (value === null) { excluded++; continue; }
            sourceRecords.push(record);
            sum += value;
        }
        return { key, label: SIX_METRIC_LABELS[key], max: METRIC_MAX[key],
            average: sourceRecords.length ? Math.round(sum / sourceRecords.length * 10) / 10 : null,
            total: records.length, valid: sourceRecords.length, missing, excluded, sourceRecords };
    });
}

export function buildLatestScoreMetricEvidence(records: readonly WorkerRecord[]) {
    return summarizeScoreMetricEvidence(selectLatestCoreMetricRecords([...records]));
}
