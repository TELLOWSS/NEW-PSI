import { describe, expect, it } from 'vitest';
import { shouldBypassAdminGuardForWorkerTraining } from '../utils/adminGuard';

describe('client admin guard boundary', () => {
    it('allows only the active worker kiosk training page to bypass admin login', () => {
        expect(shouldBypassAdminGuardForWorkerTraining({
            currentPage: 'worker-training',
            isWorkerKioskMode: true,
            requestedMode: 'worker-kiosk',
            sessionId: 'session-1',
        })).toBe(true);
    });

    it('does not keep the bypass when the page changes', () => {
        expect(shouldBypassAdminGuardForWorkerTraining({
            currentPage: 'ocr-analysis',
            isWorkerKioskMode: true,
            requestedMode: 'worker-kiosk',
            sessionId: 'session-1',
        })).toBe(false);
    });

    it('rejects incomplete or non-kiosk requests', () => {
        expect(shouldBypassAdminGuardForWorkerTraining({
            currentPage: 'worker-training',
            isWorkerKioskMode: true,
            requestedMode: 'worker-training',
            sessionId: 'session-1',
        })).toBe(false);
        expect(shouldBypassAdminGuardForWorkerTraining({
            currentPage: 'worker-training',
            isWorkerKioskMode: true,
            requestedMode: 'worker-kiosk',
            sessionId: '',
        })).toBe(false);
    });
});
