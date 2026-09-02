import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('local-first persistence boundary', () => {
    it('retires old vector uploads and removes browser RAG embedding requests', () => {
        const gateway = readFileSync(new URL('../api/gateway.ts', import.meta.url), 'utf8');
        const start = gateway.indexOf('async function handleOcrUpsertBestPractice');
        const end = gateway.indexOf('const resolveAction', start);
        const retired = gateway.slice(start, end);
        expect(retired).toContain('req.body = undefined');
        expect(retired).toContain('isValidAdminAuthRequest');
        expect(retired).toContain("reason: 'local-first-storage-policy'");
        expect(retired).not.toContain('fetch(');
        expect(retired).not.toContain('.from(');
        expect(gateway).not.toContain('embedContent');
        const browserService = readFileSync(new URL('../services/geminiService.ts', import.meta.url), 'utf8');
        expect(browserService).not.toContain('match_risk_best_practice_vectors');
        expect(browserService).not.toContain('embedContent');
    });

    it('does not auto-upload raw records or worker identities from App save/import flows', () => {
        const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
        expect(source).not.toContain('record_sync_outbox');
        expect(source).not.toContain('registerWorkersToServer');
        expect(source).not.toContain('bulk-upload-workers');
        expect(source).not.toContain('queueBestPracticeEmbedding');
        expect(source).not.toContain('ocr.upsert-best-practice');
        expect(source).toContain('selectSafeBackupImports');
    });

    it('registers only verified archive summaries, not every record save', () => {
        const source = readFileSync(new URL('../pages/OcrAnalysis.tsx', import.meta.url), 'utf8');
        expect(source).toContain('verifyMonthlyArchiveRecords');
        expect(source).toContain('if (verifiedArchiveEntry)');
        expect(source).toContain('registerMonthlyArchiveReceipt(verifiedArchiveEntry, workerSummaries)');
        expect(source).toContain('평가 원문 서버 저장 안 함');
    });
});
