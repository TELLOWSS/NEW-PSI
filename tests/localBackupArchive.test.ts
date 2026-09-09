import { describe, expect, it } from 'vitest';
import { createLocalArchive, openLocalArchive, readArchivedRecord, type ArchiveDirectory, type ArchiveFileHandle } from '../utils/localBackupArchive';
import { recoverBackupRecordsWithoutImages } from '../utils/streamingBackupRecovery';

class Folder implements ArchiveDirectory {
    files = new Map<string, string>();
    directories = new Map<string, Folder>();
    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        if (!this.directories.has(name)) {
            if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
            this.directories.set(name, new Folder());
        }
        return this.directories.get(name)!;
    }
    async getFileHandle(name: string, options?: { create?: boolean }): Promise<ArchiveFileHandle> {
        if (!this.files.has(name)) {
            if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
            this.files.set(name, '');
        }
        return {
            getFile: async () => new File([this.files.get(name)!], name),
            createWritable: async () => {
                let pending = '';
                return { write: async value => { pending = value; }, close: async () => { this.files.set(name, pending); }, abort: async () => {} };
            },
        };
    }
}
const original = { id: 'test-1', name: '검증용', date: '2025.11.29', safetyScore: 85, safetyLevel: '중급', fullText: '  원문\n', imageBase64: 'original-image-evidence', extra: { untouched: true } };
describe('PC low-memory archive', () => {
    it('preserves every original field, opens only the index, verifies a selected record', async () => {
        const folder = new Folder();
        await createLocalArchive(new Blob([JSON.stringify([original])]), folder);
        const index = await openLocalArchive(folder);
        expect(index.records).toBe(1);
        expect(JSON.stringify(index)).not.toContain('original-image-evidence');
        expect(await readArchivedRecord(folder, index.entries[0])).toEqual(original);
    });
    it('also preserves root envelope metadata without duplicating the record array', async () => {
        const folder = new Folder();
        await createLocalArchive(new Blob([JSON.stringify({ schemaVersion: 'old', customMetadata: { note: '원본 출처' }, records: [original] })]), folder);
        expect(JSON.parse(folder.files.get('source-envelope.json')!)).toEqual({ schemaVersion: 'old', customMetadata: { note: '원본 출처' } });
    });
    it('does not mark a truncated source complete, or overwrite a previous run', async () => {
        const folder = new Folder();
        await expect(createLocalArchive(new Blob([`[${JSON.stringify(original)},`]), folder)).rejects.toThrow();
        expect(folder.files.has('index.json')).toBe(false);
        await expect(openLocalArchive(folder)).rejects.toThrow();
        const before = folder.directories.get('records')!.files.get('000001.json');
        await expect(createLocalArchive(new Blob(['[]']), folder)).rejects.toThrow('덮어쓸');
        expect(folder.directories.get('records')!.files.get('000001.json')).toBe(before);
    });
    it('detects changed bytes before displaying a document', async () => {
        const folder = new Folder();
        const index = await createLocalArchive(new Blob([JSON.stringify([original])]), folder);
        folder.directories.get('records')!.files.set('000001.json', JSON.stringify({ ...original, safetyScore: 86 }));
        await expect(readArchivedRecord(folder, index.entries[0])).rejects.toThrow('무결성');
    });
    it('cancellation leaves no completion index', async () => {
        const folder = new Folder();
        const controller = new AbortController();
        await expect(createLocalArchive(new Blob([JSON.stringify([original, original])]), folder, controller.signal, () => controller.abort())).rejects.toThrow();
        expect(folder.files.has('index.json')).toBe(false);
    });
    it('streams 2000 records to the sink without retaining result records or removing images', async () => {
        let count = 0;
        const result = await recoverBackupRecordsWithoutImages(new Blob([JSON.stringify(Array.from({ length: 2000 }, () => original))]), {
            onOriginalRecord: async record => { expect(record).toEqual(original); count++; },
        });
        expect(count).toBe(2000);
        expect(result.records).toEqual([]);
        expect(result.recoveredRecords).toBe(2000);
        expect(result.removedImageCharacters).toBe(0);
    });
    it('caps a single record and rejects unsafe index paths', async () => {
        await expect(recoverBackupRecordsWithoutImages(new Blob([JSON.stringify([original])]), { maxRecordCharacters: 16, onOriginalRecord: async () => {} })).rejects.toThrow('한도');
        const folder = new Folder();
        const index = await createLocalArchive(new Blob([JSON.stringify([original])]), folder);
        index.entries[0].file = '../secret.json';
        folder.files.set('index.json', JSON.stringify(index));
        await expect(openLocalArchive(folder)).rejects.toThrow('손상');
    });
    it('does not complete when disk writes fail', async () => {
        const folder = new Folder();
        const records = await folder.getDirectoryHandle('records', { create: true });
        records.getFileHandle = async () => { throw new DOMException('Disk full', 'QuotaExceededError'); };
        await expect(createLocalArchive(new Blob([JSON.stringify([original])]), folder)).rejects.toThrow('Disk full');
        expect(folder.files.has('index.json')).toBe(false);
    });
});
