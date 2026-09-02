import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    buildMonthlyArchiveManifest,
    buildWorkerMonthlyContinuitySummaries,
    getMonthlyArchiveRecordDate,
    getMonthlyArchiveRecordMonth,
    isMonthlyArchiveManifest,
    verifyMonthlyArchiveMetadata,
    verifyMonthlyArchiveRecords,
} from '../utils/monthlyArchive';
import { createBackupEnvelope, resolveBackupPayload } from '../utils/backupDataQuality';
import { recoverBackupRecordsWithoutImages } from '../utils/streamingBackupRecovery';

const record = (id: string, patch: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id,
    name: '비공개 근로자',
    jobField: '형틀',
    date: '2026-08-12',
    nationality: '대한민국',
    language: 'ko',
    safetyScore: 70,
    safetyLevel: '중급',
    strengths: [], strengths_native: [], weakAreas: [], weakAreas_native: [],
    suggestions: [], suggestions_native: [], handwrittenAnswers: [],
    aiInsights: '비공개 분석', aiInsights_native: '', improvement: '', improvement_native: '',
    fullText: '비공개 원문', koreanTranslation: '비공개 번역', selfAssessedRiskLevel: '중',
    worker_uuid: 'WU-STABLE-001',
    originalImage: 'data:image/png;base64,PRIVATE_IMAGE',
    ...patch,
});

describe('monthly archive', () => {
    it('builds a monthly content hash and rejects altered or extra-month records', async () => {
        const records = [record('b'), record('a', { date: '2026-08-01' })];
        const { manifest } = await buildMonthlyArchiveManifest({
            records: [...records, record('next-month', { date: '2026-09-01' })],
            periodMonth: '2026-08', generation: 1, fileName: 'monthly.json',
        });
        expect(manifest.recordCount).toBe(2);
        expect(manifest.contentRootHash).toMatch(/^[a-f0-9]{64}$/);
        expect((await verifyMonthlyArchiveRecords([...records].reverse(), manifest)).valid).toBe(true);
        expect((await verifyMonthlyArchiveRecords([records[0], { ...records[1], fullText: 'tampered' }], manifest)).valid).toBe(false);
        expect((await verifyMonthlyArchiveRecords([...records, record('extra', { date: '2026-09-01' })], manifest)).valid).toBe(false);
    });

    it('keeps names, raw text and images out of fixed-field continuity summaries', () => {
        const summaries = buildWorkerMonthlyContinuitySummaries([
            record('one', { safetyScore: 50 }),
            record('two', { safetyScore: 90, date: '2026-08-20', reviewStatus: 'APPROVED' }),
            record('legacy', { worker_uuid: 'WN-NAME-DERIVED' }),
        ]);
        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({ assessmentCount: 2, averageScore: 70, minimumScore: 50, latestScore: 90, approvedCount: 1 });
        const serialized = JSON.stringify(summaries);
        expect(serialized).not.toMatch(/비공개|PRIVATE_IMAGE|fullText|name|originalImage|handwrittenAnswers/);
    });

    it('retains the monthly manifest and fails closed on malformed metadata', async () => {
        const records = [record('one')];
        const { manifest } = await buildMonthlyArchiveManifest({ records, periodMonth: '2026-08', generation: 2, fileName: 'monthly.json' });
        const envelope = createBackupEnvelope(records, new Date(), { monthlyArchive: manifest });
        expect(resolveBackupPayload(JSON.parse(JSON.stringify(envelope))).monthlyArchive).toEqual(manifest);
        expect(() => resolveBackupPayload({ ...envelope, monthlyArchive: { ...manifest, contentRootHash: 'broken' } })).toThrow(/manifest/);
    });

    it('verifies original image content while streaming metadata-only recovery across small chunks', async () => {
        const records = [record('z'), record('a', { profileImage: 'PRIVATE_PROFILE' })];
        const { manifest } = await buildMonthlyArchiveManifest({ records, periodMonth: '2026-08', generation: 1, fileName: 'monthly.json' });
        const bytes = new TextEncoder().encode(JSON.stringify(createBackupEnvelope(records, new Date(), { monthlyArchive: manifest })));
        const file = {
            size: bytes.length,
            stream: () => new ReadableStream<Uint8Array>({
                start(controller) {
                    for (let offset = 0; offset < bytes.length; offset += 31) controller.enqueue(bytes.slice(offset, offset + 31));
                    controller.close();
                },
            }),
        } as Blob;
        const recovered = await recoverBackupRecordsWithoutImages(file);
        expect(recovered.monthlyArchive).toEqual(manifest);
        expect(recovered.contentRootHash).toBe(manifest.contentRootHash);
        expect(recovered.records.every((item) => item.originalImage === '' && item.profileImage === '')).toBe(true);
        expect(recovered.recoveredRecords).toBe(2);
        expect(verifyMonthlyArchiveMetadata(recovered.records, manifest)).toBe(true);
        expect(verifyMonthlyArchiveMetadata(recovered.records, { ...manifest, workerCount: 2, portableWorkerCount: 2 })).toBe(false);
    });

    it.each([
        { archiveId: 'arbitrary-archive-label' },
        { generation: 0 }, { generation: 1.5 }, { generation: 1_000_000 }, { generation: 2 },
        { recordCount: 2 },
        { workerCount: 2, portableWorkerCount: 2 },
        { portableWorkerCount: 0, unresolvedWorkerCount: 1 },
        { workerCount: 2, unresolvedWorkerCount: 1 },
        { minDate: '2026-08-01' }, { maxDate: '2026-08-31' },
        { minDate: '2026-08-32' }, { maxDate: '2026-08-12T00:00:00Z' },
        { createdAt: 'invalid-timestamp' },
    ])('rejects forged metadata even when the record hash is unchanged: %j', async (patch) => {
        const records = [record('one')];
        const { manifest } = await buildMonthlyArchiveManifest({ records, periodMonth: '2026-08', generation: 1, fileName: 'monthly.json' });
        const altered = { ...manifest, ...patch };
        expect(altered.contentRootHash).toBe(manifest.contentRootHash);
        expect(verifyMonthlyArchiveMetadata(records, altered)).toBe(false);
        expect((await verifyMonthlyArchiveRecords(records, altered)).valid).toBe(false);
    });

    it('uses the same metadata verifier for an image-stripped streaming recovery', async () => {
        const records = [record('one'), record('two', { date: '2026-08-20' })];
        const { manifest } = await buildMonthlyArchiveManifest({ records, periodMonth: '2026-08', generation: 12, fileName: 'monthly.json' });
        const imageStripped = records.map((item) => ({ ...item, originalImage: '', profileImage: '' }));
        expect(verifyMonthlyArchiveMetadata(imageStripped, manifest)).toBe(true);
        // Metadata validation deliberately does not pretend an image-stripped
        // object can recreate the hash of the complete original archive.
        expect((await verifyMonthlyArchiveRecords(imageStripped, manifest)).valid).toBe(false);
        expect(verifyMonthlyArchiveMetadata(imageStripped, { ...manifest, maxDate: '2026-08-21' })).toBe(false);
    });

    it('excludes conflicting and legacy identities from summaries and counts them as unresolved', async () => {
        const records = [
            record('confirmed'),
            record('conflict-one', { portableWorkerId: 'WP-ONE', worker_uuid: 'WP-TWO' }),
            record('conflict-two', { portableWorkerId: 'WP-ONE', worker_uuid: 'WP-TWO' }),
            record('legacy-name', { worker_uuid: 'WN-NAME-BASED' }),
            record('legacy-employee', { worker_uuid: 'WU-EMP-2026-1234' }),
            record('legacy-qr', { worker_uuid: 'WU-QR-1234' }),
            record('invalid-id', { worker_uuid: 'WP-비공개근로자' }),
        ];
        const { manifest, workerSummaries } = await buildMonthlyArchiveManifest({ records, periodMonth: '2026-08', generation: 1, fileName: 'monthly.json' });
        expect(workerSummaries).toHaveLength(1);
        expect(workerSummaries[0]).toMatchObject({ workerUuid: 'WU-STABLE-001', assessmentCount: 1 });
        expect(manifest).toMatchObject({ recordCount: 7, workerCount: 7, portableWorkerCount: 1, unresolvedWorkerCount: 6 });
        expect(verifyMonthlyArchiveMetadata(records, manifest)).toBe(true);
        expect((await verifyMonthlyArchiveRecords(records, manifest)).valid).toBe(true);
        expect(verifyMonthlyArchiveMetadata(records, { ...manifest, workerCount: 6, unresolvedWorkerCount: 5 })).toBe(false);
    });

    it('normalizes assessment calendar dates without timezone-dependent month changes', async () => {
        const records = [
            record('latest', { date: '2026-08-31T23:30:00-07:00', safetyScore: 90 }),
            record('first', { date: '2026/8/1' }),
            record('middle', { date: '2026.08.02' }),
        ];
        const { manifest, workerSummaries } = await buildMonthlyArchiveManifest({ records, periodMonth: '2026-08', generation: 1, fileName: 'monthly.json' });
        expect(manifest).toMatchObject({ recordCount: 3, minDate: '2026-08-01', maxDate: '2026-08-31' });
        expect(workerSummaries[0]).toMatchObject({ firstAssessmentDate: '2026-08-01', lastAssessmentDate: '2026-08-31', latestScore: 90 });
        expect(getMonthlyArchiveRecordMonth(records[0])).toBe('2026-08');
        expect(isMonthlyArchiveManifest(manifest)).toBe(true);
        expect((await verifyMonthlyArchiveRecords(records, manifest)).valid).toBe(true);
    });

    it.each(['2026-02-29', '2026-08-32', '2026-08-00', '2026-13-01', '2026-08', '2026-08-01T25:00:00Z', '2026-08-01 trailing text'])('does not silently roll an invalid document date into another month: %s', (date) => {
        expect(getMonthlyArchiveRecordDate({ date })).toBe('');
        expect(getMonthlyArchiveRecordMonth({ date })).toBe('');
        expect(buildWorkerMonthlyContinuitySummaries([record('invalid-date', { date })])).toEqual([]);
    });

    it('accepts a real leap day and zero-pads valid legacy numeric date notation', () => {
        expect(getMonthlyArchiveRecordDate({ date: '2024-02-29' })).toBe('2024-02-29');
        expect(getMonthlyArchiveRecordDate({ date: '2026-8-2' })).toBe('2026-08-02');
        expect(getMonthlyArchiveRecordDate({ date: '2026-08-02 12:30:00' })).toBe('2026-08-02');
    });

    it('produces deterministic same-day summaries when archive records are reordered', () => {
        const records = [record('a', { safetyScore: 50 }), record('b', { safetyScore: 90 })];
        const summaries = buildWorkerMonthlyContinuitySummaries(records);
        expect(summaries[0].latestScore).toBe(90);
        expect(buildWorkerMonthlyContinuitySummaries([...records].reverse())).toEqual(summaries);
    });
});
