import { describe, expect, it, vi } from 'vitest';
import { recoverBackupRecordsWithoutImages } from '../utils/streamingBackupRecovery';
import { migrateLegacyBackupRecords } from '../utils/legacyBackupMigration';
import { buildMonthlyArchiveManifest } from '../utils/monthlyArchive';
import type { WorkerRecord } from '../types';

const chunkedFile = (text: string, chunkSize: number) => {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (offset >= bytes.length) { controller.close(); return; }
            controller.enqueue(bytes.slice(offset, offset + chunkSize));
            offset += chunkSize;
        },
        cancel,
    });
    return { file: { size: bytes.length, stream: () => stream } as Blob, stream, cancel };
};

const legacyRecord = () => ({
    name: '테스트', jobField: '형틀', nationality: '대한민국', date: '2025-08-12',
    fullText: '보존할 원문', safetyScore: 70, safetyLevel: '중급',
    handwrittenAnswers: [{ questionNumber: 1, answerText: '답변' }],
    strengths: [], weakAreas: [], suggestions: [],
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDz8AAAAASUVORK5CYII=',
    mimeType: 'image/png',
});

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

    it('removes every App-recognized string alias so sanitizing cannot rehydrate images', async () => {
        const imagePayload = `data:image/png;base64,${legacyRecord().imageBase64}`;
        const original = {
            id: 'aliases', image: imagePayload, photo: imagePayload, base64: imagePayload,
            documentImage: imagePayload, file: imagePayload,
            fullText: '보존할 원문', note: { description: '이미지 외 메타데이터' },
        };
        const originalJson = JSON.stringify(original);
        const result = await recoverBackupRecordsWithoutImages(new Blob([JSON.stringify([original])]));
        const restored = result.records[0] as unknown as Record<string, unknown>;
        // This is the source-selection expression used by App.sanitizeRecords.
        expect(restored.originalImage || restored.image || restored.photo || restored.base64 || restored.documentImage || restored.file).toBeUndefined();
        expect(restored).toMatchObject({ fullText: original.fullText, note: original.note });
        expect(result.removedImageCharacters).toBe(imagePayload.length * 5);
        expect(JSON.stringify(original)).toBe(originalJson);
    });

    it('strips inlineData/data alias payloads while retaining all non-image object metadata', async () => {
        const imagePayload = legacyRecord().imageBase64;
        const unrelatedData = '이 값은 inlineData 옆에 있는 일반 메타데이터입니다. '.repeat(3);
        const aliases = ['image', 'photo', 'base64', 'documentImage', 'file'];
        const originals = aliases.flatMap((alias) => ['inlineData', 'data'].map((shape) => ({
            id: `${alias}-${shape}`,
            [alias]: shape === 'inlineData'
                ? { fileName: '원본.png', description: '유지', data: unrelatedData, inlineData: { mimeType: 'image/png', data: imagePayload, caption: '보존' } }
                : { fileName: '원본.png', mimeType: 'image/png', data: imagePayload, caption: '보존' },
            other: { data: '이 필드는 이미지 별칭이 아니므로 보존', code: 12 },
        })));
        const metadataOnly = {
            id: 'metadata', image: { note: '알 수 없는 이미지 외 객체', nested: { data: '보존' } },
            photo: 12, base64: false, documentImage: ['문서 메타데이터'], file: '원본 문서.pdf',
        };
        const sourceJson = JSON.stringify([...originals, metadataOnly]);
        const result = await recoverBackupRecordsWithoutImages(new Blob([sourceJson]));
        for (const [index, original] of originals.entries()) {
            const alias = aliases[Math.floor(index / 2)];
            const actual = result.records[index] as unknown as Record<string, unknown>;
            const container = actual[alias] as Record<string, unknown>;
            expect(container.fileName).toBe('원본.png');
            expect(actual.other).toEqual(original.other);
            if (index % 2 === 0) {
                expect(container).toEqual({ fileName: '원본.png', description: '유지', data: unrelatedData, inlineData: { mimeType: 'image/png', caption: '보존' } });
            } else {
                expect(container).toEqual({ fileName: '원본.png', mimeType: 'image/png', caption: '보존' });
            }
            // Neither extraction path used by App.normalizeImage has a payload.
            const appPayload = container.inlineData && typeof container.inlineData === 'object'
                ? (container.inlineData as Record<string, unknown>).data
                : container.data;
            expect(appPayload).toBeUndefined();
        }
        expect(result.records.at(-1)).toMatchObject(metadataOnly);
        expect(result.removedImageCharacters).toBe(imagePayload.length * originals.length);
        expect(JSON.stringify([...originals, metadataOnly])).toBe(sourceJson);
    });

    it('rejects truncated backup JSON instead of silently importing partial data', async () => {
        const truncated = new Blob(['{"records":[{"id":"one"}'], { type: 'application/json' });
        await expect(recoverBackupRecordsWithoutImages(truncated)).rejects.toThrow(/중간에서 끊겼거나/);
    });

    it.each([1, 2, 3, 7, 31, 1024])('preserves nested/escaped strings across %i-byte chunks', async (chunkSize) => {
        const original = {
            id: 'one', name: '한글😀',
            nested: { note: '인용 "문자" \\ 끝 } ] [ {', child: [{ value: '\\\"records\":[' }] },
            originalImage: 'data:image/png;base64,AAAA',
        };
        const text = JSON.stringify({
            metadata: { records: [{ id: 'decoy' }], flags: [true, false, null, 1.25e7] },
            schemaVersion: 'test', records: [original], exported: true, count: 1, trailing: null,
        });
        const { file, stream } = chunkedFile(text, chunkSize);
        const result = await recoverBackupRecordsWithoutImages(file);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({ id: 'one', name: original.name, nested: original.nested });
        expect(stream.locked).toBe(false);
    });

    it.each(['array', 'records', 'workerRecords', 'data', 'items'])('supports the %s root backup shape', async (root) => {
        const records = [{ id: 'one' }, { id: 'two' }];
        const payload = root === 'array' ? records : { schemaVersion: 'legacy', [root]: records };
        const { file } = chunkedFile(JSON.stringify(payload), 1);
        const result = await recoverBackupRecordsWithoutImages(file);
        expect(result.records.map((item) => item.id)).toEqual(['one', 'two']);
    });

    it('reads through the closing root and reports all bytes, not only the records array', async () => {
        const { file } = chunkedFile('{"records":[{"id":"one"}],"tail":{"valid":true}} \n\t', 2);
        const progress: number[] = [];
        await recoverBackupRecordsWithoutImages(file, { onProgress: ({ bytesRead }) => progress.push(bytesRead) });
        expect(progress.at(-1)).toBe(file.size);
    });

    it.each([
        '{"records":[{"id":"one"}]',
        '[{"id":"one"}',
        '{"records":[{"id":"one"}],"tail":',
        '{"records":[{"id":"one"}],"tail":"unterminated',
    ])('rejects a truncated root or trailing metadata: %s', async (text) => {
        const { file, stream } = chunkedFile(text, 2);
        await expect(recoverBackupRecordsWithoutImages(file)).rejects.toThrow(/중간에서 끊겼거나/);
        expect(stream.locked).toBe(false);
    });

    it.each([
        '{"records":[{"id":"one"}]} trailing',
        '{"records":[{"id":"one"}]} {}',
        '[{"id":"one"}] []',
        '{"records":[{"id":"one"}],}',
        '{"records":[{"id":"one"} {"id":"two"}]}',
        '{"records":[{"id":"one"},]}',
        '{"records":[null,{"id":"one"}]}',
        '{"records":[17,{"id":"one"}]}',
        '{"records":[[],{"id":"one"}]}',
        '{"records":["ignored",{"id":"one"}]}',
        '{"records":[,{"id":"one"}]}',
        '{"records":[{"id":"one",}]}',
        '{"records":[{"id":NaN}]}',
        '{"records":[{"nested":[}]}',
        '{"records":[{"id":"one"}],"tail":tru}',
        '{"bad":tru,"records":[{"id":"one"}]}',
        '{"records":[],"records":[]}',
        '{"records":[],"items":[]}',
        '{"records":null}',
        '{"metadata":{"records":[{"id":"decoy"}]}}',
        'null',
    ])('fails closed without dropping malformed input: %s', async (text) => {
        const { file, stream } = chunkedFile(text, 3);
        await expect(recoverBackupRecordsWithoutImages(file)).rejects.toThrow();
        expect(stream.locked).toBe(false);
    });

    it('preserves the normal migration fingerprint before removing legacy evidence', async () => {
        const original = legacyRecord();
        const normal = await migrateLegacyBackupRecords([original]);
        const { file } = chunkedFile(JSON.stringify([original]), 7);
        const result = await recoverBackupRecordsWithoutImages(file);
        expect(normal.quarantined).toHaveLength(0);
        expect(result.records[0].id).toBe((normal.records[0] as Record<string, unknown>).id);
        expect(result.records[0]).toMatchObject({
            safetyScore: original.safetyScore, safetyLevel: original.safetyLevel,
            fullText: original.fullText, handwrittenAnswers: original.handwrittenAnswers,
            originalImage: '', profileImage: '',
        });
        expect(result.records[0]).not.toHaveProperty('imageBase64');
        expect(result.records[0]).toHaveProperty('legacyBackup');
        expect(result.removedImageCharacters).toBeGreaterThan(original.imageBase64.length);
        expect(original).toHaveProperty('imageBase64');
        expect(original).not.toHaveProperty('id');
    });

    it.each([
        { ...legacyRecord(), imageBase64: 'BROKEN' },
        { id: 'unknown-shape', imageBase64: 'AAAA' },
    ])('does not silently discard an unsupported or quarantined legacy image', async (source) => {
        await expect(recoverBackupRecordsWithoutImages(new Blob([JSON.stringify([source])]))).rejects.toThrow(/구형/);
    });

    it('rejects a manifest after records rather than bypassing monthly integrity', async () => {
        const records = [{ ...legacyRecord(), id: 'one', originalImage: 'original' }] as unknown as WorkerRecord[];
        const { manifest } = await buildMonthlyArchiveManifest({
            records, periodMonth: '2025-08', generation: 1, fileName: 'test.json',
        });
        const { file } = chunkedFile(JSON.stringify({ records: [{ id: 'one' }], monthlyArchive: manifest }), 7);
        await expect(recoverBackupRecordsWithoutImages(file)).rejects.toThrow(/manifest.*뒤/);
    });

    it('does not recover from corrupt monthly metadata by guessing a header', async () => {
        const { file } = chunkedFile('{"monthlyArchive":{"broken":true},"records":[{"id":"one"}]}', 2);
        await expect(recoverBackupRecordsWithoutImages(file)).rejects.toThrow(/manifest/);
    });

    it('hashes original monthly source records before legacy migration and stripping', async () => {
        const original = { ...legacyRecord(), id: 'one' };
        const { manifest } = await buildMonthlyArchiveManifest({
            records: [original] as unknown as WorkerRecord[], periodMonth: '2025-08', generation: 1, fileName: 'test.json',
        });
        const { file } = chunkedFile(JSON.stringify({ monthlyArchive: manifest, records: [original] }), 13);
        const result = await recoverBackupRecordsWithoutImages(file);
        expect(result.contentRootHash).toBe(manifest.contentRootHash);
        expect(result.records[0]).not.toHaveProperty('imageBase64');
        expect(result.records[0].originalImage).toBe('');
    });

    it.each(['content', 'record-count', 'worker-count', 'date-range'])('rejects a monthly %s mismatch before returning recovery data', async (mismatch) => {
        const original = { ...legacyRecord(), id: 'one', portableWorkerId: 'WP-CONFIRMED' };
        const { manifest } = await buildMonthlyArchiveManifest({
            records: [original] as unknown as WorkerRecord[], periodMonth: '2025-08', generation: 1, fileName: 'test.json',
        });
        const actualManifest = mismatch === 'record-count' ? { ...manifest, recordCount: 2 }
            : mismatch === 'worker-count' ? { ...manifest, portableWorkerCount: 0, unresolvedWorkerCount: 1 }
                : mismatch === 'date-range' ? { ...manifest, minDate: '2025-08-01' }
                    : manifest;
        const actualRecord = mismatch === 'content' ? { ...original, safetyScore: 10 } : original;
        const { file, stream } = chunkedFile(JSON.stringify({ monthlyArchive: actualManifest, records: [actualRecord] }), 17);
        await expect(recoverBackupRecordsWithoutImages(file)).rejects.toThrow(/원본 내용 또는 manifest/);
        expect(stream.locked).toBe(false);
    });

    it('compares monthly source identity metadata before generating a legacy ID', async () => {
        const original = legacyRecord();
        const { manifest } = await buildMonthlyArchiveManifest({
            records: [original] as unknown as WorkerRecord[], periodMonth: '2025-08', generation: 1, fileName: 'test.json',
        });
        const { file } = chunkedFile(JSON.stringify({ monthlyArchive: manifest, records: [original] }), 19);
        const result = await recoverBackupRecordsWithoutImages(file);
        expect(result.contentRootHash).toBe(manifest.contentRootHash);
        expect(result.records[0].id).toMatch(/^legacy-sha256-/);
    });

    it('uses the monthly archive sort order even for repeated source IDs', async () => {
        // Backup quality validation will hold repeated IDs. The source hasher
        // must nevertheless reproduce the manifest, not sort ties by hash.
        const originals = [
            { id: 'same', date: '2025-08-12', name: 'first' },
            { id: 'same', date: '2025-08-12', name: 'second' },
        ];
        const { manifest } = await buildMonthlyArchiveManifest({
            records: originals as unknown as WorkerRecord[], periodMonth: '2025-08', generation: 1, fileName: 'test.json',
        });
        const { file } = chunkedFile(JSON.stringify({ monthlyArchive: manifest, records: originals }), 23);
        const result = await recoverBackupRecordsWithoutImages(file);
        expect(result.contentRootHash).toBe(manifest.contentRootHash);
    });

    it('limits non-record metadata rather than retaining an unlimited prefix', async () => {
        const { file } = chunkedFile(JSON.stringify({ large: 'x'.repeat(1024 * 1024), records: [] }), 65536);
        await expect(recoverBackupRecordsWithoutImages(file)).rejects.toThrow(/안전 한도/);
    });

    it('cancels and releases its reader on parse failure', async () => {
        const { file, cancel, stream } = chunkedFile(`null${' '.repeat(100)}`, 1);
        await expect(recoverBackupRecordsWithoutImages(file)).rejects.toThrow();
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(stream.locked).toBe(false);
    });

    it('cancels an already aborted read and releases its reader', async () => {
        const controller = new AbortController();
        controller.abort();
        const { file, cancel, stream } = chunkedFile('{"records":[]}', 1);
        await expect(recoverBackupRecordsWithoutImages(file, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(stream.locked).toBe(false);
    });

    it('wakes and releases a pending read when aborted', async () => {
        const abortController = new AbortController();
        const cancel = vi.fn();
        const stream = new ReadableStream<Uint8Array>({ cancel });
        const file = { size: 1, stream: () => stream } as Blob;
        const pending = recoverBackupRecordsWithoutImages(file, { signal: abortController.signal });
        abortController.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(stream.locked).toBe(false);
    });

    it('stops after progress cancellation without returning partial records', async () => {
        const controller = new AbortController();
        const { file, cancel, stream } = chunkedFile('[{"id":"one"},{"id":"two"}]', 1);
        await expect(recoverBackupRecordsWithoutImages(file, {
            signal: controller.signal,
            onProgress: ({ recoveredRecords }) => { if (recoveredRecords === 1) controller.abort(); },
        })).rejects.toMatchObject({ name: 'AbortError' });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(stream.locked).toBe(false);
    });

    it('honors cancellation from the final EOF progress callback', async () => {
        const controller = new AbortController();
        const { file, stream } = chunkedFile('[]', 2);
        let progressCount = 0;
        await expect(recoverBackupRecordsWithoutImages(file, {
            signal: controller.signal,
            onProgress: () => { if (++progressCount === 2) controller.abort(); },
        })).rejects.toMatchObject({ name: 'AbortError' });
        expect(stream.locked).toBe(false);
    });

    it.each([
        new Uint8Array([0xff]),
        new Uint8Array([0x5b, 0x5d, 0xc3]),
    ])('rejects invalid UTF-8 without returning repaired JSON', async (bytes) => {
        await expect(recoverBackupRecordsWithoutImages(new Blob([bytes]))).rejects.toThrow();
    });

    it('accepts a single UTF-8 BOM without treating it as backup content', async () => {
        const { file } = chunkedFile('\uFEFF[{"id":"one"}]', 1);
        expect((await recoverBackupRecordsWithoutImages(file)).records[0].id).toBe('one');
    });
});
