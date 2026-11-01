import { describe, it, expect, vi } from 'vitest';
import type { WorkerRecord } from '../types';

class MockZip {
    private store = new Map<string, Uint8Array>();
    file(path: string, content?: Uint8Array | string): {async: (kind: 'string' | 'uint8array') => Promise<string | Uint8Array>} | void | null {
        if (content === undefined) {
            const existing = this.store.get(path);
            if (!existing) return null;
            return { async: async kind => kind === 'string' ? new TextDecoder().decode(existing) : existing };
        }
        this.store.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
    }
    get files(): Record<string, {dir: boolean}> {
        return Object.fromEntries([...this.store.keys()].map(path => [path, {dir:false}]));
    }
    async generateAsync(): Promise<Blob> {
        const contents = [...this.store].map(([path, bytes]) => [path, [...bytes]]);
        return new Blob([JSON.stringify(contents)], {type:'application/zip'});
    }
    async loadAsync(blob: Blob): Promise<MockZip> {
        const contents = JSON.parse(await blob.text()) as Array<[string, number[]]>;
        this.store = new Map(contents.map(([path, bytes])=>[path,Uint8Array.from(bytes)]));
        return this;
    }
}
vi.mock('../utils/externalScripts', () => ({
    ensureJsZip: async () => MockZip,
    ensureFileSaver: async () => (_blob: Blob, _name: string) => undefined,
}));
import { buildPsiEvidenceArchive, verifyPsiEvidenceArchive } from '../utils/psiEvidenceArchive';

const record = (): WorkerRecord => ({
    id:'dummy-001', name:'가상 테스트', jobField:'형틀', language:'zh', date:'2026-10-20',
    handwrittenAnswers:[{questionNumber:'Q1', answerText:'高处作业', koreanTranslation:'고소작업'}],
    originalImage:'data:image/jpeg;base64,QUJD',
} as unknown as WorkerRecord);

describe('evidence ZIP SHA-256 and external custody check', () => {
    it('builds a manifest and verifies all file digests plus the separately retained ZIP digest', async () => {
        const {blob,manifest,zipSha256} = await buildPsiEvidenceArchive(record(), {exportedAt:'2026-11-01T00:00:00Z'});
        expect(zipSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(manifest.fileHashes.map(item=>item.path)).toContain('assets/currently-stored-original-form.jpg');
        const verified = await verifyPsiEvidenceArchive(blob, zipSha256);
        expect(verified.verified).toBe(true);
        expect(verified.externallyAnchored).toBe(true);
        expect(verified.zipSha256).toBe(zipSha256);
    });

    it('rejects mismatch with independent fingerprint even if internal list matches', async () => {
        const {blob} = await buildPsiEvidenceArchive(record(), {exportedAt:'2026-11-01T00:00:00Z'});
        const result = await verifyPsiEvidenceArchive(blob, '0'.repeat(64));
        expect(result.verified).toBe(false);
        expect(result.errors.join(' ')).toContain('별도 보관된 ZIP SHA-256');
    });

    it('detects tampering with one file while retaining original checksum listings', async () => {
        const {blob} = await buildPsiEvidenceArchive(record(), {exportedAt:'2026-11-01T00:00:00Z'});
        const files = JSON.parse(await blob.text()) as Array<[string, number[]]>;
        const pos = files.findIndex(([path])=>path==='record/timeline.txt');
        expect(pos).toBeGreaterThanOrEqual(0);
        files[pos][1].push(88);
        const altered = new Blob([JSON.stringify(files)],{type:'application/zip'});
        const result = await verifyPsiEvidenceArchive(altered);
        expect(result.verified).toBe(false);
        expect(result.errors.join(' ')).toContain('해시 불일치');
    });
});
