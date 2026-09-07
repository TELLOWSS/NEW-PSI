import { describe, expect, it } from 'vitest';
import { migrateLegacyBackupRecords } from '../utils/legacyBackupMigration';
import { deriveImportedRecordMetrics, deriveIntegrityScore, enforceSafetyLevel } from '../utils/evidenceUtils';
import { analyzeBackupImport } from '../utils/backupDataQuality';
import { selectSafeBackupImports } from '../utils/backupMerge';
import type { WorkerRecord } from '../types';

const oldRecord = {
    name: '합성 검증자료', jobField: '형틀', date: '2025-08-20', nationality: '대한민국',
    safetyScore: 85, safetyLevel: '중급', fullText: '합성 원문', aiInsights: '검토 근거',
    strengths: [], weakAreas: [], suggestions: [],
    handwrittenAnswers: [{ questionNumber: '1', answerText: '합성 답변', koreanTranslation: '합성 답변' }],
};

describe('historical backup evaluation remains historical', () => {
    it('migrates before strict preflight and retains grade across import and JSON reload', async () => {
        expect(analyzeBackupImport([oldRecord], []).blocked).toBe(true);
        const migrated = await migrateLegacyBackupRecords([oldRecord]);
        const validation = analyzeBackupImport(migrated.records, []);
        expect(validation.blocked).toBe(false);
        const record = validation.validRecords[0];
        expect(enforceSafetyLevel(record).safetyLevel).toBe('중급');
        const reloaded = enforceSafetyLevel(JSON.parse(JSON.stringify(enforceSafetyLevel(record))));
        expect(reloaded.safetyScore).toBe(85);
        expect(reloaded.safetyLevel).toBe('중급');
        expect(reloaded.handwrittenAnswers).toEqual(oldRecord.handwrittenAnswers);
        expect(reloaded.approvalHistory).toBeUndefined();
        expect(reloaded.auditTrail).toBeUndefined();
        expect(selectSafeBackupImports([record], [reloaded]).records).toHaveLength(0);
    });

    it('does not roll back an explicit score correction or rewrite the preserved original', async () => {
        const result = await migrateLegacyBackupRecords([oldRecord]);
        const current = { ...(result.records[0] as WorkerRecord), safetyScore: 92 };
        const corrected = enforceSafetyLevel(current);
        expect(corrected.safetyLevel).toBe('고급');
        expect(corrected.legacyBackup?.originalEvaluation.safetyLevel).toBe('중급');
        expect(corrected.legacyBackup?.originalEvaluation.safetyScore).toBe(85);
    });

    it('continues deriving grades for non-legacy records', () => {
        expect(enforceSafetyLevel({ ...oldRecord, id: 'modern' } as WorkerRecord).safetyLevel).toBe('고급');
    });

    it('does not preserve a sanitizer default of 100 as a missing historical integrity score', async () => {
        const result = await migrateLegacyBackupRecords([{ ...oldRecord, weakAreas: ['합성 보완항목'] }]);
        const sanitized = { ...(result.records[0] as WorkerRecord), integrityScore: 100 };
        const imported = deriveImportedRecordMetrics(sanitized);
        expect(imported.integrityScore).toBe(deriveIntegrityScore(sanitized));
        expect(imported.integrityScore).not.toBe(100);
        expect(imported.legacyBackup?.originalEvaluation).not.toHaveProperty('integrityScore');
        expect(enforceSafetyLevel(imported).safetyLevel).toBe('중급');
    });
});
