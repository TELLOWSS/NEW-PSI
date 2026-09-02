import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { selectSafeBackupImports } from '../utils/backupMerge';

const record = (id: string, timestamp?: string): WorkerRecord => ({
    id,
    auditTrail: timestamp ? [{ stage: 'correction', timestamp, actor: 'admin' }] : [],
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
});
