import { describe, expect, it } from 'vitest';
import { analyzeBackupImport } from '../utils/backupDataQuality';
import {
    inspectLegacyBackupImage,
    isLegacyMigratedRecord,
    LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION,
    LegacyBackupMigrationError,
    migrateLegacyBackupRecords,
    shouldPreserveLegacyEvaluation,
} from '../utils/legacyBackupMigration';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJa8AAAAASUVORK5CYII=';
// The migration checks container boundaries, not pixels; a full decoder is tested separately on real source files.
const JPEG_CONTAINER = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9));
const sourceRecord = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: '합성 시험자료', jobField: '형틀', date: '2025-08-10', nationality: '대한민국',
    safetyScore: 90, safetyLevel: '중급', strengths: ['확인'], weakAreas: [], suggestions: [],
    fullText: '실제 개인정보가 아닌 시험용 문서',
    handwrittenAnswers: [{ questionNumber: '1', answerText: '안전대 확인', koreanTranslation: '안전대 확인' }],
    imageBase64: PNG, mimeType: 'image/png', isValid: true,
    ...patch,
});

describe('legacy backup compatibility migration', () => {
    it('moves the legacy image without duplication and preserves all assessment content', async () => {
        const source = sourceRecord({ competencyProfile: { check: 27 }, selfAssessedRiskLevel: '중' });
        const original = structuredClone(source);
        const result = await migrateLegacyBackupRecords([source]);
        const record = result.records[0] as Record<string, unknown>;

        expect(record.id).toMatch(/^legacy-sha256-[a-f0-9]{64}$/);
        expect(record.originalImage).toBe(`data:image/png;base64,${PNG}`);
        expect(record).not.toHaveProperty('imageBase64');
        expect(record.safetyScore).toBe(90);
        expect(record.safetyLevel).toBe('중급');
        expect(record.fullText).toBe(original.fullText);
        expect(record.handwrittenAnswers).toEqual(original.handwrittenAnswers);
        expect(record.isValid).toBe(true);
        expect(source).toEqual(original);
        expect(result.report).toMatchObject({
            inputRecordCount: 1, migratedRecordCount: 1, generatedIdCount: 1,
            movedImageCount: 1, unchangedRecordCount: 0, quarantinedRecordCount: 0,
        });
        expect(isLegacyMigratedRecord(record)).toBe(true);
        if (!isLegacyMigratedRecord(record)) throw new Error('Expected provenance');
        expect(record.legacyBackup.schemaVersion).toBe(LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION);
        expect(record.legacyBackup.originalEvaluation).toEqual({
            safetyScore: 90, safetyLevel: '중급', competencyProfile: { check: 27 }, selfAssessedRiskLevel: '중', isValid: true,
        });
        expect(record).not.toHaveProperty('worker_uuid');
        expect(record).not.toHaveProperty('portableWorkerId');
        expect(record).not.toHaveProperty('employeeId');
        expect(record).not.toHaveProperty('approvalHistory');
        expect(record).not.toHaveProperty('auditTrail');
        expect(record.legacyBackup).not.toHaveProperty('timestamp');
        (record.competencyProfile as Record<string, unknown>).check = 99;
        expect(record.legacyBackup.originalEvaluation.competencyProfile).toEqual({ check: 27 });
    });

    it('uses deterministic document IDs independent of record order, object key order, progress and wall-clock time', async () => {
        const first = sourceRecord();
        const second = sourceRecord({ fullText: '다른 문서' });
        const reversedKeys = Object.fromEntries(Object.entries(first).reverse());
        const firstResult = await migrateLegacyBackupRecords([first, second]);
        const progress: number[] = [];
        const secondResult = await migrateLegacyBackupRecords([second, reversedKeys], { onProgress: (completed) => progress.push(completed) });
        expect((firstResult.records[0] as Record<string, unknown>).id).toBe((secondResult.records[1] as Record<string, unknown>).id);
        expect((firstResult.records[1] as Record<string, unknown>).id).toBe((secondResult.records[0] as Record<string, unknown>).id);
        expect(progress).toEqual([1, 2]);
        // Source file names cannot affect IDs: this API accepts only record content, not a path/name/date.
        expect((await migrateLegacyBackupRecords([first])).records).toEqual([firstResult.records[0]]);
    });

    it('preserves a valid original document ID when moving an image alias', async () => {
        const result = await migrateLegacyBackupRecords([sourceRecord({ id: 'original-document-id' })]);
        const record = result.records[0] as Record<string, unknown>;
        expect(record.id).toBe('original-document-id');
        expect(result.report.generatedIdCount).toBe(0);
        expect(isLegacyMigratedRecord(record) && record.legacyBackup.generatedRecordId).toBe(false);
    });

    it('does not merge different evaluation versions of the same image or identical incoming entries', async () => {
        const first = sourceRecord();
        const revision = sourceRecord({ safetyScore: 75 });
        const result = await migrateLegacyBackupRecords([first, revision, first]);
        const records = result.records as Record<string, unknown>[];
        expect(records).toHaveLength(3);
        expect(records[0].id).not.toBe(records[1].id);
        expect(records[0].id).toBe(records[2].id);
        // The preflight validator, not the migration, decides what to do with exact duplicate IDs.
        expect(analyzeBackupImport(records, []).duplicateIdCount).toBe(1);
    });

    it('is a no-op for a converted record and never restores a later edit from its historical snapshot', async () => {
        const converted = (await migrateLegacyBackupRecords([sourceRecord()])).records[0] as Record<string, unknown>;
        const result = await migrateLegacyBackupRecords([converted]);
        expect(result.records[0]).toBe(converted);
        expect(result.report.migratedRecordCount).toBe(0);
        expect(shouldPreserveLegacyEvaluation(converted)).toBe(true);
        const corrected = { ...converted, safetyScore: 55, safetyLevel: '초급' };
        const repeated = await migrateLegacyBackupRecords([corrected]);
        expect(repeated.records[0]).toBe(corrected);
        expect(shouldPreserveLegacyEvaluation(corrected)).toBe(false);
        expect(isLegacyMigratedRecord(corrected) && corrected.legacyBackup.originalEvaluation.safetyScore).toBe(90);
    });

    it('preserves real historical revisions and never manufactures a newer business timestamp', async () => {
        const history = [{ timestamp: '2025-08-11T08:00:00Z', note: '합성 자료' }];
        const result = await migrateLegacyBackupRecords([sourceRecord({ auditTrail: history, approvalHistory: [] })]);
        const record = result.records[0] as Record<string, unknown>;
        expect(record.auditTrail).toEqual(history);
        expect(record.approvalHistory).toEqual([]);
        expect(record).not.toHaveProperty('approvedAt');
        expect(JSON.stringify(record.legacyBackup)).not.toContain('2025-08-11');
    });

    it.each(['name', 'date', 'safetyScore', 'suggestions'])('does not fill a missing %s field to bypass validation', async (field) => {
        const source = sourceRecord();
        delete source[field];
        const result = await migrateLegacyBackupRecords([source]);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).not.toHaveProperty(field);
        expect(analyzeBackupImport(result.records, []).validRecords).toHaveLength(0);
    });

    it('does not default scores, dates or grades', async () => {
        const result = await migrateLegacyBackupRecords([sourceRecord({ safetyScore: 145, date: '2025-02-31' })]);
        const record = result.records[0] as Record<string, unknown>;
        expect(record.safetyScore).toBe(145);
        expect(record.date).toBe('2025-02-31');
        expect(record.safetyLevel).toBe('중급');
        expect(analyzeBackupImport(result.records, []).blocked).toBe(true);
    });

    it('quarantines unsupported legacy grades instead of silently translating them to 초급', async () => {
        const result = await migrateLegacyBackupRecords([sourceRecord({ safetyLevel: 'A+' })]);
        expect(result.records).toHaveLength(0);
        expect(result.quarantined[0].code).toBe('unsupported-evaluation');
    });

    it('leaves unrelated and modern JSON records untouched', async () => {
        const modern = sourceRecord({ id: 'modern', originalImage: `data:image/png;base64,${PNG}`, legacyBackup: { arbitrary: 'customer metadata' } });
        delete modern.imageBase64;
        const unknown = { imageBase64: 'an unrelated application field' };
        const values = [modern, unknown, null, 'plain text', [1, 2]];
        const result = await migrateLegacyBackupRecords(values);
        expect(result.records).toEqual(values);
        result.records.forEach((record, index) => expect(record).toBe(values[index]));
        expect(result.report.unchangedRecordCount).toBe(5);
    });

    it('can identify a recognizable text-only legacy record without inventing an image', async () => {
        const source = sourceRecord();
        delete source.imageBase64;
        delete source.mimeType;
        const result = await migrateLegacyBackupRecords([source]);
        expect((result.records[0] as Record<string, unknown>).id).toMatch(/^legacy-sha256-/);
        expect(result.records[0]).not.toHaveProperty('originalImage');
        expect(result.report.movedImageCount).toBe(0);
    });

    it('quarantines malformed/conflicting provenance and reconciles every source entry', async () => {
        const source = sourceRecord({ legacyBackup: { schemaVersion: LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION } });
        const progress: number[] = [];
        const result = await migrateLegacyBackupRecords([source, sourceRecord()], { onProgress: (completed) => progress.push(completed) });
        expect(result.records).toHaveLength(1);
        expect(result.quarantined).toHaveLength(1);
        expect(result.quarantined[0].record).toBe(source);
        expect(result.quarantined[0]).toMatchObject({ recordIndex: 1, code: 'invalid-provenance' });
        expect(result.report.inputRecordCount).toBe(result.records.length + result.quarantined.length);
        expect(result.report.inputRecordCount).toBe(result.report.migratedRecordCount + result.report.unchangedRecordCount + result.report.quarantinedRecordCount);
        expect(progress).toEqual([1, 2]);
        expect(JSON.stringify(result.report)).not.toContain('합성 시험자료');
    });

    it('rejects generated IDs that disagree with their provenance hash', async () => {
        const record = (await migrateLegacyBackupRecords([sourceRecord()])).records[0] as Record<string, unknown>;
        const tampered = { ...record, id: 'legacy-sha256-wrong' };
        expect(isLegacyMigratedRecord(tampered)).toBe(false);
        expect((await migrateLegacyBackupRecords([tampered])).quarantined[0].code).toBe('invalid-provenance');
    });

    it('rejects malformed reserved provenance even when optional legacy recognition fields are absent', async () => {
        const malformed = { id: 'bad', name: '합성자료', safetyScore: 50, legacyBackup: { schemaVersion: LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION } };
        expect(isLegacyMigratedRecord(malformed)).toBe(false);
        const result = await migrateLegacyBackupRecords([malformed]);
        expect(result.records).toHaveLength(0);
        expect(result.quarantined[0].code).toBe('invalid-provenance');
    });

    it('rejects non-JSON values instead of dropping data while hashing', async () => {
        const cyclic = sourceRecord();
        cyclic.extra = cyclic;
        const result = await migrateLegacyBackupRecords([cyclic, sourceRecord({ extra: undefined })]);
        expect(result.quarantined.map((entry) => entry.code)).toEqual(['invalid-source-data', 'invalid-source-data']);
    });
});

describe('legacy image conversion', () => {
    it('honors PNG/JPEG container MIME and hashes decoded image bytes', async () => {
        const raw = await inspectLegacyBackupImage(PNG, 'image/png');
        const uri = await inspectLegacyBackupImage(`data:image/png;base64,${PNG}`);
        const whitespace = await inspectLegacyBackupImage(` \n${PNG.slice(0, 40)}\r\n${PNG.slice(40)} `, 'image/png');
        expect(raw.mimeType).toBe('image/png');
        expect(raw.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(uri).toEqual(raw);
        expect(whitespace).toEqual(raw);
        const jpeg = await inspectLegacyBackupImage(JPEG_CONTAINER, 'image/jpg');
        expect(jpeg.mimeType).toBe('image/jpeg');
        expect(jpeg.dataUri).toBe(`data:image/jpeg;base64,${JPEG_CONTAINER}`);
        expect(jpeg.sha256).not.toBe(raw.sha256);
    });

    it.each([null, '', 'not an image!', 'AA=', 'A===', '/x==', 'data:image/png,not-base64'])('quarantines invalid image alias %j without losing the original', async (imageBase64) => {
        const source = sourceRecord({ imageBase64 });
        const result = await migrateLegacyBackupRecords([source]);
        expect(result.records).toHaveLength(0);
        expect(result.quarantined).toHaveLength(1);
        expect(result.quarantined[0].record).toBe(source);
        expect(result.report.movedImageCount).toBe(0);
    });

    it('rejects MIME mismatches and truncated image containers', async () => {
        await expect(inspectLegacyBackupImage(PNG, 'image/jpeg')).rejects.toMatchObject({ code: 'image-mime-mismatch' });
        await expect(inspectLegacyBackupImage(`data:image/jpeg;base64,${PNG}`)).rejects.toMatchObject({ code: 'image-mime-mismatch' });
        await expect(inspectLegacyBackupImage(btoa(atob(PNG).slice(0, -12)))).rejects.toMatchObject({ code: 'unsupported-image' });
        await expect(inspectLegacyBackupImage('AA==')).rejects.toBeInstanceOf(LegacyBackupMigrationError);
    });

    it('removes a redundant legacy alias only when decoded images match', async () => {
        const result = await migrateLegacyBackupRecords([sourceRecord({ originalImage: `data:image/png;base64,${PNG}` })]);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).not.toHaveProperty('imageBase64');
        expect((result.records[0] as Record<string, unknown>).originalImage).toBe(`data:image/png;base64,${PNG}`);
    });

    it('quarantines conflicting image fields instead of choosing or deleting one', async () => {
        const source = sourceRecord({ originalImage: `data:image/jpeg;base64,${JPEG_CONTAINER}` });
        const result = await migrateLegacyBackupRecords([source]);
        expect(result.records).toHaveLength(0);
        expect(result.quarantined[0].code).toBe('conflicting-images');
        expect(source.imageBase64).toBe(PNG);
        expect(source.originalImage).toBe(`data:image/jpeg;base64,${JPEG_CONTAINER}`);
    });
});
