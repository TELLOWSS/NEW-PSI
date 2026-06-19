import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    analyzeBackupImport,
    createBackupEnvelope,
    PSI_BACKUP_SCHEMA_VERSION,
    resolveBackupPayload,
} from '../utils/backupDataQuality';

const record = (id: string, patch: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id,
    name: `근로자-${id}`,
    jobField: '형틀',
    date: '2026-03-26',
    nationality: '대한민국',
    language: 'ko',
    safetyScore: 70,
    safetyLevel: '중급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    suggestions: [],
    suggestions_native: [],
    handwrittenAnswers: [{ questionNumber: '1', answerText: '추락', koreanTranslation: '추락' }],
    aiInsights: '확인',
    aiInsights_native: 'guide',
    improvement: '',
    improvement_native: '',
    fullText: '',
    koreanTranslation: '',
    selfAssessedRiskLevel: '중',
    ...patch,
});

describe('backup data quality', () => {
    it('explains a 198 + 217 merge before importing', () => {
        const existing = Array.from({ length: 198 }, (_, index) => record(`existing-${index}`));
        const incoming = Array.from({ length: 217 }, (_, index) => record(`incoming-${index}`));
        const analysis = analyzeBackupImport(incoming, existing, {
            fileName: 'PSI_Backup.json',
            fileSize: 93_019_165,
            schemaVersion: 'legacy-array',
            today: new Date('2026-06-18T00:00:00+09:00'),
        });

        expect(analysis.validRecords).toHaveLength(217);
        expect(analysis.projectedTotalRecords).toBe(415);
        expect(analysis.singleDateConcentration).toBe(true);
        expect(analysis.distinctMonthCount).toBe(1);
        expect(analysis.confirmationText).toContain('복원 후 예상 총계: 415건');
        expect(analysis.confirmationText).toContain('이 파일 단독으로는 다월 추적을 입증할 수 없음');
    });

    it('excludes schema-invalid records instead of silently mixing them in', () => {
        const invalid = { ...record('bad'), safetyScore: 140 };
        const analysis = analyzeBackupImport([record('good'), invalid], [], {
            today: new Date('2026-06-18T00:00:00+09:00'),
        });

        expect(analysis.validRecords.map((item) => item.id)).toEqual(['good']);
        expect(analysis.problematicRecordCount).toBe(1);
        expect(analysis.typeIssueCounts['safetyScore(0-100 number)']).toBe(1);
    });

    it('blocks ambiguous duplicate IDs', () => {
        const analysis = analyzeBackupImport([record('same'), record('same')], []);
        expect(analysis.duplicateIdCount).toBe(1);
        expect(analysis.blocked).toBe(true);
    });

    it('blocks a mass same-worker same-date collision instead of silently merging people', () => {
        const incoming = Array.from({ length: 6 }, (_, index) => record(`collision-${index}`, {
            worker_uuid: 'shared-worker-uuid',
            date: '2026-01-22',
            evidenceHash: `evidence-${index}`,
        }));
        const analysis = analyzeBackupImport(incoming, [], {
            today: new Date('2026-06-18T00:00:00+09:00'),
        });

        expect(analysis.workerDateCollisionCount).toBe(5);
        expect(analysis.maxWorkerDateCollisionSize).toBe(6);
        expect(analysis.identityCollisionBlocked).toBe(true);
        expect(analysis.blocked).toBe(true);
    });

    it('blocks invalid calendar dates and future dates', () => {
        const invalid = analyzeBackupImport([record('invalid-date', { date: '2026-02-31' })], [], {
            today: new Date('2026-06-18T00:00:00+09:00'),
        });
        const future = analyzeBackupImport([record('future-date', { date: '2026-12-25' })], [], {
            today: new Date('2026-06-18T00:00:00+09:00'),
        });

        expect(invalid.invalidDateCount).toBe(1);
        expect(invalid.blocked).toBe(true);
        expect(future.futureDateCount).toBe(1);
        expect(future.blocked).toBe(true);
    });

    it('creates and resolves a self-describing v2 backup envelope', () => {
        const records = [
            record('jan', { name: 'A근로자', date: '2026-01-10', safetyScore: 55 }),
            record('feb', { name: 'A근로자', date: '2026-02-10', safetyScore: 70 }),
        ];
        const envelope = createBackupEnvelope(records, new Date('2026-06-18T00:00:00.000Z'));
        const resolved = resolveBackupPayload(envelope);

        expect(envelope.schemaVersion).toBe(PSI_BACKUP_SCHEMA_VERSION);
        expect(envelope.manifest.recordCount).toBe(2);
        expect(envelope.manifest.multiMonthWorkerGroups).toBe(1);
        expect(resolved.records).toHaveLength(2);
        expect(resolved.schemaVersion).toBe(PSI_BACKUP_SCHEMA_VERSION);
    });
});
