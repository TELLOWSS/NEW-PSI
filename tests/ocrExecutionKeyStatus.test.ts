import { describe, expect, it } from 'vitest';
import { resolveOcrExecutionKeyStatus } from '../utils/ocrExecutionKeyStatus';

describe('OCR execution key mode isolation', () => {
    it('never selects the paid key while free mode is active', () => {
        const status = resolveOcrExecutionKeyStatus({
            isPaidApiMode: false,
            freeLocalKey: '',
            paidLocalKey: 'paid-key-must-not-be-used',
        });

        expect(status.ready).toBe(false);
        expect(status.source).toBe('none');
        expect(status.modeApiLabel).toBe('무료 분석');
    });

    it('never substitutes the free key for an explicitly selected paid mode', () => {
        const status = resolveOcrExecutionKeyStatus({
            isPaidApiMode: true,
            freeLocalKey: 'free-key',
            paidLocalKey: '',
        });

        expect(status.ready).toBe(false);
        expect(status.source).toBe('none');
        expect(status.modeApiLabel).toBe('유료 분석');
    });

    it('selects only the key belonging to the active mode', () => {
        expect(resolveOcrExecutionKeyStatus({
            isPaidApiMode: false,
            freeEnvKey: 'free-key',
            paidEnvKey: 'paid-key',
        }).source).toBe('env-primary');

        expect(resolveOcrExecutionKeyStatus({
            isPaidApiMode: true,
            freeEnvKey: 'free-key',
            paidEnvKey: 'paid-key',
        }).source).toBe('env-primary');
    });
});
