import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRouteAccessibleInMode, isRouteVisibleInMode } from '../config/routeMeta';
import { LOCAL_RECORDS_CHANGED, persistLocalRecords } from '../utils/checkedLocalPersistence';
import { buildEducationReturnSummary } from '../utils/educationReturnSummary';
import type { WorkerRecord } from '../types';

afterEach(() => vi.unstubAllGlobals());

describe('product audit: evidence-based education summary', () => {
    it('does not invent risks, languages or comparison evidence for empty data', () => {
        const summary = buildEducationReturnSummary([]);
        expect(summary.topRisks).toEqual([]);
        expect(summary.repeatedRiskKeywords).toEqual([]);
        expect(summary.supportedLanguageCount).toBe(0);
        expect(summary.hasTrendComparison).toBe(false);
    });
    it('does not treat coaching text as a completed improvement or nationality as another language', () => {
        const summary = buildEducationReturnSummary([{
            id: 'synthetic', name: '검증', date: '2026-09-09', language: 'zh', nationality: '중국',
            safetyScore: 70, improvement: '교육 권고', weakAreas: ['추락'],
        } as WorkerRecord]);
        expect(summary.improvementRate).toBe(0);
        expect(summary.completedRecords).toBe(0);
        expect(summary.reviewRequiredRecords).toBe(1);
        expect(summary.supportedLanguageCount).toBe(1);
        expect(summary.topRisks).toEqual(['추락']);
        expect(summary.repeatedRiskKeywords).toEqual([]);
    });
});

describe('product audit: contextual navigation', () => {
    it('allows practitioner report links without a context-free menu entry', () => {
        expect(isRouteVisibleInMode('individual-report', 'practitioner')).toBe(false);
        expect(isRouteAccessibleInMode('individual-report', 'practitioner')).toBe(true);
    });
    it('does not grant workers contextual practitioner access', () => {
        expect(isRouteAccessibleInMode('individual-report', 'worker')).toBe(
            isRouteVisibleInMode('individual-report', 'worker'),
        );
    });
});

describe('product audit: durable local save acknowledgement', () => {
    it('returns success and notifies consumers only after a successful write', () => {
        const setItem = vi.fn();
        const dispatchEvent = vi.fn();
        vi.stubGlobal('localStorage', { setItem });
        vi.stubGlobal('window', { dispatchEvent, alert: vi.fn() });
        expect(persistLocalRecords('records', [{ id: 'synthetic' }])).toBe(true);
        expect(setItem).toHaveBeenCalledWith('records', '[{"id":"synthetic"}]');
        expect(dispatchEvent.mock.calls[0][0].type).toBe(LOCAL_RECORDS_CHANGED);
    });
    it('does not report success or notify consumers after quota failure', () => {
        const alert = vi.fn();
        const dispatchEvent = vi.fn();
        vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceededError'); } });
        vi.stubGlobal('window', { alert, dispatchEvent });
        expect(persistLocalRecords('records', [])).toBe(false);
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했습니다'));
        expect(dispatchEvent).not.toHaveBeenCalled();
    });
});
