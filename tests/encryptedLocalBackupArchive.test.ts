import { describe, expect, it } from 'vitest';
import { createEncryptedLocalArchive, openProtectedLocalArchive, verifyLocalArchiveRestore } from '../utils/encryptedLocalBackupArchive';
import { createLocalArchive, readArchivedRecord, type ArchiveDirectory, type ArchiveFileHandle } from '../utils/localBackupArchive';

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
const password = 'test-only-backup-password-2026';
const original = { id: 'record-1', name: '검증용근로자', date: '2025.11.29', safetyScore: 85, safetyLevel: '중급', fullText: '  원문\n', imageBase64: 'preserved-original-image-evidence', extra: { untouched: true } };
const source = () => new Blob([JSON.stringify({ records: [original, { ...original, id: 'record-2' }], customMetadata: { note: '원본출처검증' } })]);

describe('encrypted low-memory backup and restore', () => {
    it('encrypts index, original records, images and source metadata and restores them unchanged', async () => {
        const folder = new Folder();
        const input = source();
        const originalText = await input.text();
        await createEncryptedLocalArchive(input, folder, password);
        const stored = [...folder.files.values(), ...folder.directories.get('records')!.files.values()].join('\n');
        for (const sensitive of [password, original.name, original.date, original.imageBase64, '원본출처검증']) expect(stored).not.toContain(sensitive);
        const opened = await openProtectedLocalArchive(folder, password);
        expect(opened.encrypted).toBe(true);
        expect(opened.index.records).toBe(2);
        expect(await readArchivedRecord(opened.directory, opened.index.entries[0])).toEqual(original);
        const metadata = await (await opened.directory.getFileHandle('source-envelope.json')).getFile();
        expect(JSON.parse(await metadata.text()).customMetadata.note).toBe('원본출처검증');
        expect(await verifyLocalArchiveRestore(opened.directory, opened.index)).toEqual({ records: 2 });
        expect(await input.text()).toBe(originalText);
    });
    it('does not expose an index with a wrong password or a changed authentication tag', async () => {
        const folder = new Folder();
        await createEncryptedLocalArchive(source(), folder, password);
        await expect(openProtectedLocalArchive(folder, 'wrong-but-long-enough')).rejects.toThrow('비밀번호');
        const envelope = JSON.parse(folder.files.get('index.json')!);
        envelope.ciphertext = `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`;
        folder.files.set('index.json', JSON.stringify(envelope));
        await expect(openProtectedLocalArchive(folder, password)).rejects.toThrow('변경');
    });
    it('authenticates each record path, so swapping valid encrypted files is rejected', async () => {
        const folder = new Folder();
        await createEncryptedLocalArchive(source(), folder, password);
        const opened = await openProtectedLocalArchive(folder, password);
        const records = folder.directories.get('records')!;
        records.files.set('000001.json', records.files.get('000002.json')!);
        await expect(readArchivedRecord(opened.directory, opened.index.entries[0])).rejects.toThrow('변경');
        await expect(verifyLocalArchiveRestore(opened.directory, opened.index)).rejects.toThrow();
    });
    it('uses different archive salts and file IVs even for identical content and passwords', async () => {
        const first = new Folder(), second = new Folder();
        await createEncryptedLocalArchive(source(), first, password);
        await createEncryptedLocalArchive(source(), second, password);
        expect(JSON.parse(first.files.get('encryption.json')!).salt).not.toBe(JSON.parse(second.files.get('encryption.json')!).salt);
        const ivs = [...first.files.entries()].filter(([name]) => name !== 'encryption.json').map(([, text]) => JSON.parse(text).iv);
        expect(new Set(ivs).size).toBe(ivs.length);
        first.directories.get('records')!.files.set('000001.json', second.directories.get('records')!.files.get('000001.json')!);
        const opened = await openProtectedLocalArchive(first, password);
        await expect(readArchivedRecord(opened.directory, opened.index.entries[0])).rejects.toThrow();
    });
    it('rejects changed header parameters and removed encryption headers without a plaintext fallback', async () => {
        const folder = new Folder();
        await createEncryptedLocalArchive(source(), folder, password);
        const header = JSON.parse(folder.files.get('encryption.json')!);
        folder.files.set('encryption.json', JSON.stringify({ ...header, iterations: 1_000_000_000 }));
        await expect(openProtectedLocalArchive(folder, password)).rejects.toThrow('손상');
        folder.files.delete('encryption.json');
        await expect(openProtectedLocalArchive(folder, password)).rejects.toThrow('손상');
    });
    it('keeps existing plaintext archives readable and refuses to overwrite them', async () => {
        const folder = new Folder();
        await createLocalArchive(source(), folder);
        const before = [...folder.files.entries()];
        const opened = await openProtectedLocalArchive(folder, '');
        expect(opened.encrypted).toBe(false);
        expect(await readArchivedRecord(opened.directory, opened.index.entries[0])).toEqual(original);
        expect(await verifyLocalArchiveRestore(opened.directory, opened.index)).toEqual({ records: 2 });
        await expect(createEncryptedLocalArchive(source(), folder, password)).rejects.toThrow('덮어쓸');
        expect([...folder.files.entries()]).toEqual(before);
    });
    it('does not write anything for an inadequate password or an already canceled operation', async () => {
        const folder = new Folder();
        await expect(createEncryptedLocalArchive(source(), folder, 'short')).rejects.toThrow('12자');
        const cancellation = new AbortController(); cancellation.abort();
        await expect(createEncryptedLocalArchive(source(), folder, password, cancellation.signal)).rejects.toThrow('취소');
        expect(folder.files.size).toBe(0);
    });
    it('leaves interrupted creation incomplete and refuses to overwrite an interrupted archive', async () => {
        const folder = new Folder();
        const cancellation = new AbortController();
        await expect(createEncryptedLocalArchive(source(), folder, password, cancellation.signal, () => cancellation.abort())).rejects.toThrow();
        expect(folder.files.has('index.json')).toBe(false);
        expect(folder.files.has('encryption.json')).toBe(true);
        await expect(openProtectedLocalArchive(folder, password)).rejects.toThrow();
        await expect(createEncryptedLocalArchive(source(), folder, password)).rejects.toThrow('덮어쓸');
    });
    it('detects missing records and corrupt metadata during full restore verification', async () => {
        const folder = new Folder();
        const opened = await createEncryptedLocalArchive(source(), folder, password);
        const records = folder.directories.get('records')!;
        const saved = records.files.get('000002.json')!;
        records.files.delete('000002.json');
        await expect(verifyLocalArchiveRestore(opened.directory, opened.index)).rejects.toThrow();
        records.files.set('000002.json', saved);
        folder.files.set('source-envelope.json', '{}');
        await expect(verifyLocalArchiveRestore(opened.directory, opened.index)).rejects.toThrow();
    });
    it('supports cancellation of full restore verification without altering files', async () => {
        const folder = new Folder();
        const opened = await createEncryptedLocalArchive(source(), folder, password);
        const before = [...folder.files.entries()];
        const cancellation = new AbortController();
        await expect(verifyLocalArchiveRestore(opened.directory, opened.index, cancellation.signal, () => cancellation.abort())).rejects.toThrow('취소');
        expect([...folder.files.entries()]).toEqual(before);
    });
    it('keeps failed disk writes incomplete and preserves the original source', async () => {
        const folder = new Folder();
        const getDirectory = folder.getDirectoryHandle.bind(folder);
        folder.getDirectoryHandle = async (name, options) => {
            const result = await getDirectory(name, options);
            if (name === 'records' && options?.create) {
                result.getFileHandle = async () => { throw new DOMException('Disk full', 'QuotaExceededError'); };
            }
            return result;
        };
        const input = source(), before = await input.text();
        await expect(createEncryptedLocalArchive(input, folder, password)).rejects.toThrow('Disk full');
        expect(folder.files.has('index.json')).toBe(false);
        expect(await input.text()).toBe(before);
    });
    it('rejects unsupported file paths and malformed encryption envelopes', async () => {
        const folder = new Folder();
        const opened = await createEncryptedLocalArchive(source(), folder, password);
        await expect(opened.directory.getFileHandle('../outside.json')).rejects.toThrow('경로');
        const records = folder.directories.get('records')!;
        const envelope = JSON.parse(records.files.get('000001.json')!);
        records.files.set('000001.json', JSON.stringify({ ...envelope, iv: '!!!!' }));
        await expect(readArchivedRecord(opened.directory, opened.index.entries[0])).rejects.toThrow('형식');
    });
    it('rejects oversized encrypted files before reading their contents', async () => {
        const folder = new Folder();
        const opened = await createEncryptedLocalArchive(source(), folder, password);
        const records = folder.directories.get('records')!;
        let read = false;
        records.getFileHandle = async () => ({
            getFile: async () => ({ size: 50 * 1024 * 1024, text: async () => { read = true; return ''; } } as File),
            createWritable: async () => { throw new Error('Unexpected write'); },
        });
        await expect(readArchivedRecord(opened.directory, opened.index.entries[0])).rejects.toThrow('한도');
        expect(read).toBe(false);
    });
});
