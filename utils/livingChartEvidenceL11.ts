import type { WorkerRecord } from '../types';
import { buildMonthlyCoreMetricSeries, hasValidSafetyScore, selectLatestCoreMetricRecords } from './coreMetrics';

export interface MonthlyScoreEvidencePoint {
    month: string;
    value: number | null;
    valid: number;
    excluded: number;
    population: number;
}
/** Preserve legitimate zero scores but never turn missing monthly scores into zero. */
export function buildMonthlyScoreEvidencePoints(records: readonly WorkerRecord[]): MonthlyScoreEvidencePoint[] {
    return buildMonthlyCoreMetricSeries([...records]).map(point => ({
        month: point.month,
        value: point.validScoreRecordCount > 0 ? point.averageScore : null,
        valid: point.validScoreRecordCount,
        excluded: point.excludedInvalidScoreCount,
        population: point.totalWorkers,
    }));
}

export interface GroupScoreEvidence {
    label: string;
    average: number;
    spreadReference: number | null;
    valid: number;
    total: number;
    excluded: number;
}
export interface GroupScoreChartEvidence {
    rows: GroupScoreEvidence[];
    groupsExcludedNoScore: number;
    sourceRecords: number;
    sourceLatestRecords: number;
    /**
     * Non-official descriptive heuristic (100 - population SD * 2.5).
     * This is NOT any of the six official/legacy score dimensions.
     */
    consistencyIsIllustrative: true;
}
export function buildGroupScoreChartEvidence(
    records: readonly WorkerRecord[],
    mode: 'field' | 'team' = 'field',
): GroupScoreChartEvidence {
    const latest = selectLatestCoreMetricRecords([...records]);
    const groups = new Map<string, { label: string; trade: string; scores: number[]; total: number }>();
    for (const record of latest) {
        const trade = String(record.jobField || '').trim() || '미분류 공종';
        const leader = String(record.teamLeader || '').trim();
        if (mode === 'team' && (!leader || leader === '미지정')) continue;
        const key = mode === 'team' ? JSON.stringify([leader, trade]) : trade;
        const label = mode === 'team' ? `${leader} (${trade})` : trade;
        const group = groups.get(key) || { label, trade, scores: [], total: 0 };
        group.total++;
        if (hasValidSafetyScore(record)) group.scores.push(record.safetyScore);
        groups.set(key, group);
    }
    const sorted = [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ko'));
    const excludedNoScore = sorted.filter(group => !group.scores.length).length;
    const limit = mode === 'team' ? 8 : 10;
    const rows = sorted.filter(group => group.scores.length).slice(0, limit).map((group,index) => {
        const average = group.scores.reduce((a, b) => a + b, 0) / group.scores.length;
        const variance = group.scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / group.scores.length;
        return {
            label: mode === 'team' ? `작업팀 ${index + 1} · ${group.trade}` : group.label, average: Math.round(average * 10) / 10,
            spreadReference: group.scores.length > 1 ? Math.round(Math.max(0, 100 - Math.sqrt(variance) * 2.5) * 10) / 10 : null,
            valid: group.scores.length, total: group.total, excluded: group.total - group.scores.length,
        };
    });
    return {
        rows, groupsExcludedNoScore: excludedNoScore,
        sourceRecords: records.length, sourceLatestRecords: latest.length,
        consistencyIsIllustrative: true,
    };
}
