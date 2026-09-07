import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { selectSafeBackupImports, selectSafeLegacyBackupImports } from '../utils/backupMerge';

const record = (id: string, timestamp?: string): WorkerRecord => ({
    id,
    auditTrail: timestamp ? [{ stage: 'correction', timestamp, actor: 'admin' }] : [],
} as WorkerRecord);

const PNG_A = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF8sAAAAASUVORK5CYII=';
const PNG_B = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const legacyRecord = (id: string, hashCharacter = 'a', image = PNG_A): WorkerRecord => ({
    ...record(id),
    originalImage: image ? `data:image/png;base64,${image}` : undefined,
    legacyBackup: {
        schemaVersion: 'psi-legacy-migration/v1',
        sourceRecordHash: hashCharacter.repeat(64),
        generatedRecordId: false,
        originalEvaluation: { safetyScore: 70, safetyLevel: '중급' },
    },
} as WorkerRecord);

describe('safe backup merge', () => {
    it('protects newer, tied and undated local records', () => {
        const result = selectSafeBackupImports(
            [record('newer-local', '2026-08-01'), record('tie', '2026-08-01'), record('undated'), record('new-id')],
            [record('newer-local', '2026-08-02'), record('tie', '2026-08-01'), record('undated')],
        );
        expect(result.records.map((item) => item.id)).toEqual(['new-id']);
        expect(result.protectedLocalCount).toBe(3);
    });

    it('allows a verifiably newer backup revision', () => {
        const result = selectSafeBackupImports([record('same', '2026-08-02')], [record('same', '2026-08-01')]);
        expect(result.records).toHaveLength(1);
        expect(result.protectedLocalCount).toBe(0);
    });

    it('does not treat a migration timestamp as a newer business revision', () => {
        const incoming = {
            ...legacyRecord('same'),
            migrationHistory: [{ timestamp: '2026-09-03T12:00:00Z' }],
        } as WorkerRecord;
        const result = selectSafeBackupImports([incoming], [record('same')]);
        expect(result.records).toEqual([]);
        expect(result.protectedLocalCount).toBe(1);
    });
});

describe('legacy backup cross-ID review gate', () => {
    it('does not decode images when there are no existing PC records', async () => {
        const incoming = [legacyRecord('first', 'a', 'invalid-image')];
        const result = await selectSafeLegacyBackupImports(incoming, []);
        expect(result.records).toBe(incoming);
        expect(result.heldRecordCount).toBe(0);
        expect(result.unreadableIncomingImageCount).toBe(0);
    });

    it('does not change modern backup behavior', async () => {
        const incoming = [{ ...record('modern'), originalImage: `data:image/png;base64,${PNG_A}` }];
        const existing = [{ ...record('old'), originalImage: `data:image/png;base64,${PNG_A}` }];
        const result = await selectSafeLegacyBackupImports(incoming, existing);
        expect(result.records).toBe(incoming);
        expect(result.heldRecordCount).toBe(0);
    });

    it('holds a legacy image already saved under a different random ID without changing either copy', async () => {
        const incoming = [legacyRecord('legacy-new')];
        const existing = [{ ...record('random-old'), imageBase64: PNG_A } as WorkerRecord];
        const before = JSON.stringify({ incoming, existing });
        const result = await selectSafeLegacyBackupImports(incoming, existing);
        expect(result.records).toEqual([]);
        expect(result.heldRecordCount).toBe(1);
        expect(result.heldRecordIds).toEqual(['legacy-new']);
        expect(result.matches).toEqual([{
            incomingId: 'legacy-new', existingIds: ['random-old'], reason: 'same-image',
        }]);
        expect(JSON.stringify({ incoming, existing })).toBe(before);
    });

    it('compares decoded image bytes rather than data URI formatting', async () => {
        const incoming = [legacyRecord('new')];
        const existing = [{
            ...record('old'),
            originalImage: `data:image/png;base64,${PNG_A.slice(0, 32)}\n${PNG_A.slice(32)}`,
        }];
        const result = await selectSafeLegacyBackupImports(incoming, existing);
        expect(result.heldRecordCount).toBe(1);
        expect(result.unreadableExistingImageCount).toBe(0);
    });

    it('retains different evaluation versions of one image within the incoming file', async () => {
        const incoming = [legacyRecord('version-a', 'a'), legacyRecord('version-b', 'b')];
        const existing = [{ ...record('unrelated'), originalImage: `data:image/png;base64,${PNG_B}` }];
        const result = await selectSafeLegacyBackupImports(incoming, existing);
        expect(result.records).toEqual(incoming);
        expect(result.heldRecordCount).toBe(0);
    });

    it('holds matching source provenance even when archived images are absent', async () => {
        const incoming = [legacyRecord('new-id', 'c', '')];
        const existing = [legacyRecord('old-id', 'c', '')];
        const result = await selectSafeLegacyBackupImports(incoming, existing);
        expect(result.records).toEqual([]);
        expect(result.matches).toEqual([{
            incomingId: 'new-id', existingIds: ['old-id'], reason: 'same-source-record',
        }]);
    });

    it('leaves same-ID revision protection to the ordinary merge gate', async () => {
        const incoming = [legacyRecord('same')];
        const existing = [legacyRecord('same')];
        const result = await selectSafeLegacyBackupImports(incoming, existing);
        expect(result.records).toEqual(incoming);
        expect(result.heldRecordCount).toBe(0);
        const merged = selectSafeBackupImports(result.records, existing);
        expect(merged.records).toEqual([]);
        expect(merged.protectedLocalCount).toBe(1);
    });

    it('allows a repeated import of two known evaluation versions of the same image', async () => {
        const incoming = [legacyRecord('version-a', 'a'), legacyRecord('version-b', 'b')];
        const result = await selectSafeLegacyBackupImports(incoming, structuredClone(incoming));
        expect(result.heldRecordCount).toBe(0);
        expect(result.records).toEqual(incoming);
        const merge = selectSafeBackupImports(result.records, incoming);
        expect(merge.records).toHaveLength(0);
        expect(merge.protectedLocalCount).toBe(2);
    });

    it('reports unreadable PC images without guessing that they are duplicates', async () => {
        const incoming = [legacyRecord('new')];
        const existing = [{ ...record('old'), originalImage: 'data:image/png;base64,broken' }];
        const result = await selectSafeLegacyBackupImports(incoming, existing);
        expect(result.records).toEqual(incoming);
        expect(result.heldRecordCount).toBe(0);
        expect(result.unreadableExistingImageCount).toBe(1);
    });
});
