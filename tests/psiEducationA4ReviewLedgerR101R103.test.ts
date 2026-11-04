import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    A4_REVIEW_LEDGER_STATUSES,
    buildA4ReviewLedger,
    buildA4ReviewLedgerCsv,
    buildA4ReviewLedgerText,
} from '../utils/educationA4ReviewLedger';
import {
    a4ReviewKey, calculateA4ReviewFingerprint, readA4ReviewStore,
    saveA4ReviewStore, validA4Review, type A4OutputReview,
} from '../utils/educationA4LocalReview';

const month = '2026-11';
const workType = '형틀';
const sha = 'a'.repeat(64);
const nextSha = 'b'.repeat(64);
const key = a4ReviewKey(month, workType, 'ko-KR');
const storedRecord: A4OutputReview = {
    version: 1, key, fingerprint: sha, language: 'ko-KR',
    role: 'joint-review', checkedAt: '2026-11-04T02:00:00.000Z',
    checks: { fileOpened: true, glyphsLegible: true, safetyMeaningCompared: true },
};
const options = () => ({
    educationMonth: month,
    workType,
    languages: ['ko-KR', 'en-US', 'my-MM'],
    labels: { 'ko-KR': '한국어', 'en-US': '영어', 'my-MM': '미얀마어' },
    fingerprints: { 'ko-KR': sha, 'en-US': nextSha, 'my-MM': sha },
    stored: { [key]: storedRecord },
    translationNeedsRefresh: false,
});

describe('PSI R101–R103 export ledger: privacy-safe independent validation', () => {
    it('separates recorded, pending, stale, and digest-calculating statuses without copying old acknowledgements', () => {
        const rows = buildA4ReviewLedger(options());
        expect(rows).toHaveLength(3);
        expect(rows.map(row => row.status)).toEqual(['recorded', 'pending', 'pending']);
        expect(rows[0].role).toBe('joint-review');
        expect(rows[0].checkedAt).toBe(storedRecord.checkedAt);
        expect(rows[1].role).toBeNull();
        expect(rows[1].checkedAt).toBeNull();
        const afterEdit = buildA4ReviewLedger({
            ...options(), fingerprints: { 'ko-KR': nextSha, 'en-US': sha, 'my-MM': sha },
        });
        expect(afterEdit[0].status).toBe('recheck');
        expect(afterEdit[0].role).toBeNull();
        expect(afterEdit[0].checkedAt).toBeNull();
        const staleTranslations = buildA4ReviewLedger({ ...options(), translationNeedsRefresh: true });
        expect(staleTranslations.map(row => row.status)).toEqual(['recorded', 'recheck', 'recheck']);
        expect(buildA4ReviewLedger({ ...options(), fingerprints: {} }).every(row => row.status === 'calculating')).toBe(true);
        expect(buildA4ReviewLedger({ ...options(), languages: ['ko-KR', 'ko-KR'] })).toHaveLength(1);
    });

    it('rejects a swapped key even with the exact same source hash and valid-looking checkboxes', () => {
        const wrongKey = a4ReviewKey(month, workType, 'my-MM');
        const injected = { ...storedRecord, key: wrongKey };
        expect(validA4Review({ [key]: injected }, key, sha)).toBeNull();
        const setItem = vi.fn();
        saveA4ReviewStore({ setItem }, { [key]: injected });
        expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({});
        expect(readA4ReviewStore({
            getItem: () => JSON.stringify({ [key]: injected }),
        })).toEqual({});
    });

    it('produces UTF-8 BOM/CRLF CSV with all statuses, exact hashes, no worker text and no obsolete signed role', () => {
        const rows = buildA4ReviewLedger({
            ...options(), fingerprints: { 'ko-KR': nextSha, 'en-US': sha, 'my-MM': sha },
        });
        const csv = buildA4ReviewLedgerCsv(month, workType, rows);
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain('\r\n');
        expect(csv).toContain('"한국어"');
        expect(csv).toContain('"변경됨 · 다시 확인"');
        expect(csv).toContain('"미확인"');
        expect(csv).toContain(nextSha);
        expect(csv).not.toContain('joint-review');
        expect(csv).not.toContain('2026-11-04T02:00:00.000Z');
        expect(csv).not.toContain('원문 작업중지');
        expect(csv.split('\r\n').filter(Boolean)).toHaveLength(5); // disclaimer, header, 3 languages
        const plain = buildA4ReviewLedgerText(rows);
        expect(plain).toContain('교육 이수·법정 증빙·서버 승인 아님');
        expect(plain).not.toContain(sha);
    });

    it('neutralizes CSV formula injection in a user-defined work type and label without losing quotes or commas', () => {
        const rows = buildA4ReviewLedger({
            ...options(),
            labels: { 'ko-KR': '=HYPERLINK("https://bad.example","open"),A' },
            languages: ['ko-KR'],
        });
        const csv = buildA4ReviewLedgerCsv(month, '=1+2', rows);
        expect(csv).toContain('"\'=1+2"');
        expect(csv).toContain('"\'=HYPERLINK(""https://bad.example"",""open""),A"');
        const negative = buildA4ReviewLedgerCsv(month, ' -CMD|/C calc', rows);
        expect(negative).toContain('"\' -CMD|/C calc"');
        const newline = buildA4ReviewLedgerCsv(month, '\t@SUM(2,3)\n', rows);
        expect(newline).toContain('"\' @SUM(2,3) "');
    });

    it('fails closed for missing source hashes, empty rows, oversized batches, and storage denied', async () => {
        expect(() => buildA4ReviewLedgerCsv(month, workType, [])).toThrow(/언어별/);
        expect(() => buildA4ReviewLedgerCsv(month, workType, [{
            language: 'ko-KR', languageLabel: '한국어', status: 'calculating', role: null,
            checkedAt: null, sourceSha256: '',
        }])).toThrow(/언어별/);
        const rows = Array.from({ length: 21 }, (_, i) => ({
            language: 'lang' + i, languageLabel: '언어' + i, status: 'pending' as const,
            role: null, checkedAt: null, sourceSha256: sha,
        }));
        expect(() => buildA4ReviewLedgerCsv(month, workType, rows)).toThrow();
        const setItem = vi.fn(() => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); });
        expect(() => saveA4ReviewStore({ setItem }, { [key]: storedRecord })).toThrow();
        expect(readA4ReviewStore({ getItem: () => { throw new Error('security denied'); } })).toEqual({});
        expect((await calculateA4ReviewFingerprint('원문 바뀜'))).not.toBe(await calculateA4ReviewFingerprint('원문 원래'));
        expect(A4_REVIEW_LEDGER_STATUSES.recorded).not.toContain('교육 완료');
    });

    it('exposes explicit mobile controls and entirely local transport in the A4 editor', () => {
        const src = readFileSync('pages/A4EducationMaterial.tsx', 'utf8');
        expect(src).toContain('data-psi-a4-review-ledger="true"');
        expect(src).toContain('data-psi-a4-review-ledger-table="true"');
        expect(src).toContain('data-psi-a4-review-export="true"');
        expect(src).toContain('data-psi-a4-review-copy="true"');
        expect(src).toContain('data-psi-a4-review-ready-download="true"');
        expect(src).toContain('overflow-x-auto');
        expect(src).toContain('aria-label="다국어 출력물 검수 현황표');
        expect(src).toContain('requestEducationDownload(blob, filename)');
        expect(src).toContain('setPreparedReviewCsv(null)');
        expect(src).not.toContain('fetchReviewLedger(');
    });
});
