import { describe, expect, it } from 'vitest';
import { isPageBlockedByStartChecklist } from '../utils/navigationPolicy';

describe('start checklist navigation policy', () => {
    it('keeps risk assessment analysis available before checklist completion', () => {
        expect(isPageBlockedByStartChecklist('ocr-analysis')).toBe(false);
    });

    it('keeps administrator report pages protected', () => {
        expect(isPageBlockedByStartChecklist('reports')).toBe(true);
        expect(isPageBlockedByStartChecklist('individual-report')).toBe(true);
    });
});
