import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    appendManagerRiskBaselineHistory,
    MANAGER_RISK_BASELINE_HISTORY_STORAGE_KEY,
    normalizeManagerRiskBaselineBasis,
    readManagerRiskBaselineHistory,
    type ManagerRiskBaselineHistoryEntry,
} from '../utils/surveyRiskGap';

const createStorage = () => {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        getValue: (key: string) => values.get(key),
    };
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('manager risk baseline audit history', () => {
    it('normalizes the decision basis without accepting unknown enum values', () => {
        expect(normalizeManagerRiskBaselineBasis({
            severity: 'fatal',
            exposure: 'continuous',
            control: 'weak',
            reason: '고소 작업 집중',
            source: 'wizard',
            ruleVersion: 'wizard-v1',
            updatedBy: '안전관리자',
        })).toEqual({
            severity: 'fatal',
            exposure: 'continuous',
            control: 'weak',
            reason: '고소 작업 집중',
            source: 'wizard',
            ruleVersion: 'wizard-v1',
            updatedBy: '안전관리자',
        });
        expect(normalizeManagerRiskBaselineBasis({ source: 'unknown' })).toBeUndefined();
    });

    it('stores, filters, and orders local history as an audit fallback', () => {
        const storage = createStorage();
        vi.stubGlobal('window', { localStorage: storage });
        const entries: ManagerRiskBaselineHistoryEntry[] = [
            {
                id: 'older',
                monthKey: '2026-06',
                trade: '형틀',
                action: 'upsert',
                previousLevel: null,
                nextLevel: '중',
                basis: {
                    reason: '최초 등록',
                    source: 'manual',
                    ruleVersion: 'manual-v1',
                    updatedBy: '관리자',
                },
                changedAt: '2026-06-19T01:00:00.000Z',
            },
            {
                id: 'newer',
                monthKey: '2026-06',
                trade: '형틀',
                action: 'upsert',
                previousLevel: '중',
                nextLevel: '상',
                basis: {
                    severity: 'fatal',
                    exposure: 'continuous',
                    control: 'weak',
                    reason: '방호조치 미흡',
                    source: 'wizard',
                    ruleVersion: 'manager-baseline-wizard-v1',
                    updatedBy: '안전관리자',
                },
                changedAt: '2026-06-19T02:00:00.000Z',
            },
        ];

        appendManagerRiskBaselineHistory(entries);

        expect(readManagerRiskBaselineHistory({ monthKey: '2026-06', trade: '형틀' }))
            .toEqual([entries[1], entries[0]]);
        expect(storage.getValue(MANAGER_RISK_BASELINE_HISTORY_STORAGE_KEY)).toContain('방호조치 미흡');
    });
});
