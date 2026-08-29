import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../pages/OcrAnalysis.tsx', import.meta.url), 'utf8');

describe('paid OCR approval UI contract', () => {
    it('requires a transient administrator password before approval', () => {
        expect(source).toContain("const [paidOcrApprovalPassword, setPaidOcrApprovalPassword] = useState('');");
        expect(source).toContain('type="password"');
        expect(source).toContain('autoComplete="off"');
        expect(source).toContain('paidOcrApprovalPassword.trim().length > 0');
        expect(source).toContain('disabled={!canSubmitPaidOcrApproval}');
    });

    it('supports Enter approval, Escape cancellation, and both OCR paths', () => {
        expect(source).toContain('onSubmit={(event) => {');
        expect(source).toContain("if (event.key === 'Escape')");
        expect(source).toContain('type="submit"');
        expect(source.match(/paidOcrAdminPassword: approval\.paidOcrAdminPassword/g)).toHaveLength(2);
    });

    it('clears the password and never persists or logs the password state', () => {
        expect((source.match(/setPaidOcrApprovalPassword\(''\)/g) || []).length).toBeGreaterThanOrEqual(4);

        const sensitiveStateLines = source
            .split(/\r?\n/)
            .filter((line) => line.includes('paidOcrApprovalPassword'));
        expect(sensitiveStateLines.some((line) => /localStorage|sessionStorage|console\.|ocrTrace|URLSearchParams/.test(line))).toBe(false);
    });
});
