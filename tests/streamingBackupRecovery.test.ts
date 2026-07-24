import { describe, expect, it } from 'vitest';
import { recoverBackupRecordsWithoutImages } from '../utils/streamingBackupRecovery';

describe('streaming backup recovery', () => {
    it('reads the records array without loading the full file and removes heavy image fields', async () => {
        const payload = {
            schemaVersion: 'psi-backup/v2',
            manifest: { recordCount: 2 },
            records: [
                { id: 'one', name: '홍길동', originalImage: 'data:image/png;base64,AAAA', nested: { note: '중괄호 { 포함 }' } },
                { id: 'two', name: 'Nguyen', profileImage: 'data:image/png;base64,BBBB', strengths: ['safe'] },
            ],
        };
        const progress: number[] = [];
        const result = await recoverBackupRecordsWithoutImages(
            new Blob([JSON.stringify(payload)], { type: 'application/json' }),
            { onProgress: ({ recoveredRecords }) => progress.push(recoveredRecords) },
        );

        expect(result.recoveredRecords).toBe(2);
        expect(result.records.map((record) => record.id)).toEqual(['one', 'two']);
        expect(result.records[0].originalImage).toBe('');
        expect(result.records[1].profileImage).toBe('');
        expect(result.removedImageCharacters).toBeGreaterThan(0);
        expect(progress.at(-1)).toBe(2);
    });

    it('rejects truncated backup JSON instead of silently importing partial data', async () => {
        const truncated = new Blob(['{"records":[{"id":"one"}'], { type: 'application/json' });
        await expect(recoverBackupRecordsWithoutImages(truncated)).rejects.toThrow(/중간에서 끊겼거나/);
    });
});
