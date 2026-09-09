import { describe, expect, it } from 'vitest';
import { analyzeBackupImport, createBackupEnvelope, resolveBackupPayload } from '../utils/backupDataQuality';
import { migrateLegacyBackupRecords } from '../utils/legacyBackupMigration';
import { selectSafeBackupImports, selectSafeLegacyBackupImports } from '../utils/backupMerge';
import type { WorkerRecord } from '../types';

const legacy = {
    name: '합성 복원 검증', jobField: '철근', nationality: '대한민국', date: '2025-08-10',
    safetyScore: 73, safetyLevel: '중급', strengths: ['원본 강점'], weakAreas: ['원본 위험'], suggestions: ['원본 조치'],
    fullText: '합성 원문 보존 검증', handwrittenAnswers: [{ questionNumber: '1', answerText: '안전대 점검' }],
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJa8AAAAASUVORK5CYII=', mimeType: 'image/png',
};

describe('backup migration → envelope → safe merge', () => {
    it('preserves original assessment and makes a repeated restore idempotent', async () => {
        const source = structuredClone(legacy);
        const migrated = await migrateLegacyBackupRecords([source]);
        expect(migrated.report.quarantinedRecordCount).toBe(0);
        const migratedCheck = analyzeBackupImport(migrated.records, [], { today: new Date('2026-09-09') });
        expect(migratedCheck.blocked).toBe(false);
        const payload = resolveBackupPayload(JSON.parse(JSON.stringify(createBackupEnvelope(migratedCheck.validRecords))));
        const check = analyzeBackupImport(payload.records, [], { today: new Date('2026-09-09') });
        expect(check.blocked).toBe(false);
        expect(check.validRecords[0].fullText).toBe(legacy.fullText);
        expect(check.validRecords[0].safetyScore).toBe(73);
        const first = selectSafeBackupImports(check.validRecords, []);
        const repeat = await selectSafeLegacyBackupImports(check.validRecords, first.records);
        expect(selectSafeBackupImports(repeat.records, first.records).records).toEqual([]);
        const newerLocal = first.records.map(record => ({ ...record, fullText: 'PC에서 확인한 최신 내용', auditTrail: [{ stage: 'correction', actor: 'admin', timestamp: '2026-09-09T00:00:00Z' }] } as WorkerRecord));
        expect(selectSafeBackupImports(check.validRecords, newerLocal).protectedLocalCount).toBe(1);
        expect(source).toEqual(legacy);
        expect(newerLocal[0].fullText).toBe('PC에서 확인한 최신 내용');
    });
    it('validates 5000 synthetic monthly records without collapsing same names', () => {
        const records = Array.from({ length: 5000 }, (_, index) => ({
            ...legacy, id: `synthetic-${index}`, imageBase64: undefined,
            date: `2025-${String(index % 12 + 1).padStart(2, '0')}-10`,
            worker_uuid: `WP-SYNTHETIC-${index}`,
        } as unknown as WorkerRecord));
        const source = JSON.stringify(records);
        const resolved = resolveBackupPayload(JSON.parse(JSON.stringify(createBackupEnvelope(records))));
        const check = analyzeBackupImport(resolved.records, [], { today: new Date('2026-09-09') });
        expect(check.blocked).toBe(false);
        expect(check.validRecords).toHaveLength(5000);
        expect(check.distinctMonthCount).toBe(12);
        expect(check.duplicateIdCount).toBe(0);
        expect(JSON.stringify(records)).toBe(source);
    });
});
