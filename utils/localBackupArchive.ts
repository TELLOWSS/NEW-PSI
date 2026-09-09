import { recoverBackupRecordsWithoutImages } from './streamingBackupRecovery';

// Explicit user-selected PC folder. No server, localStorage or operational DB writes.
export interface ArchiveFileHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}
export interface ArchiveDirectory {
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ArchiveDirectory>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<ArchiveFileHandle>;
}
export type ArchiveEntry = { file: string; name: string; date: string; sha256: string; bytes: number };
export type LocalArchiveIndex = {
    schema: 'psi-local-archive/v1'; complete: true; records: number; entries: ArchiveEntry[];
    sourceBytes: number; createdAt: string;
};
const MAX_RECORD = 32 * 1024 * 1024;
const MAX_INDEX = 8 * 1024 * 1024;
const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
const label = (value: unknown) => typeof value === 'string' ? value.slice(0, 160) : '';
async function writeChecked(folder: ArchiveDirectory, name: string, text: string) {
    const file = await folder.getFileHandle(name, { create: true });
    const writer = await file.createWritable();
    try { await writer.write(text); await writer.close(); }
    catch (error) { await writer.abort().catch(() => undefined); throw error; }
    const actual = await file.getFile();
    if (actual.size !== new TextEncoder().encode(text).byteLength
        || await digest(await actual.text()) !== await digest(text)) throw new Error('PC 저장 후 무결성 대조 실패. 보관 완료로 처리하지 않습니다.');
}

/** Destination must be a newly created empty child directory. Completion index is written LAST. */
export async function createLocalArchive(source: Blob, folder: ArchiveDirectory, signal?: AbortSignal, onProgress?: (count: number) => void) {
    // Refuse reuse: even a previous interrupted run must be kept untouched.
    try { await folder.getFileHandle('STARTED.json'); throw new Error('기존 보관 폴더를 덮어쓸 수 없습니다. 새 폴더를 선택하세요.'); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
    await writeChecked(folder, 'STARTED.json', JSON.stringify({ startedAt: new Date().toISOString(), sourceBytes: source.size, note: 'index.json이 없으면 미완료입니다. 원본 백업을 보관하세요.' }));
    const entries: ArchiveEntry[] = [];
    const sourceMetadata: Record<string, unknown> = Object.create(null);
    const recordsFolder = await folder.getDirectoryHandle('records', { create: true });
    await recoverBackupRecordsWithoutImages(source, {
        signal, maxRecordCharacters: MAX_RECORD,
        onRootMetadata: async (key, value) => { sourceMetadata[key] = value; },
        onOriginalRecord: async (record, rawJson) => {
            if (entries.length >= 10000) throw new Error('보관함 1개는 1만 건까지 지원합니다. 원본은 보존됩니다.');
            const bytes = new TextEncoder().encode(rawJson).byteLength;
            if (bytes > MAX_RECORD) throw new Error('기록 1건이 32MiB를 초과합니다. 별도 변환이 필요합니다.');
            const file = `${String(entries.length + 1).padStart(6, '0')}.json`;
            await writeChecked(recordsFolder, file, rawJson);
            entries.push({ file, name: label(record.name), date: label(record.date), bytes, sha256: await digest(rawJson) });
            onProgress?.(entries.length);
            await new Promise(resolve => setTimeout(resolve, 0));
        },
    });
    if (!entries.length) throw new Error('보관할 기록이 없습니다.');
    if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
    const index: LocalArchiveIndex = { schema: 'psi-local-archive/v1', complete: true, records: entries.length, entries, sourceBytes: source.size, createdAt: new Date().toISOString() };
    await writeChecked(folder, 'source-envelope.json', JSON.stringify(sourceMetadata));
    await writeChecked(folder, 'index.json', JSON.stringify(index));
    return index;
}

export async function openLocalArchive(folder: ArchiveDirectory): Promise<LocalArchiveIndex> {
    const file = await (await folder.getFileHandle('index.json')).getFile();
    if (file.size > MAX_INDEX) throw new Error('보관 목록이 안전 한도를 초과했습니다.');
    let index: LocalArchiveIndex;
    try { index = JSON.parse(await file.text()); } catch { throw new Error('보관 목록 JSON이 손상되었습니다.'); }
    if (!index || index.schema !== 'psi-local-archive/v1' || index.complete !== true || !Array.isArray(index.entries)
        || index.entries.length > 10000 || !index.entries.length || index.records !== index.entries.length
        || index.entries.some(entry => !entry || !/^\d{6}\.json$/.test(entry.file)
            || typeof entry.name !== 'string' || entry.name.length > 160 || typeof entry.date !== 'string' || entry.date.length > 160
            || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > MAX_RECORD)
        || new Set(index.entries.map(entry => entry.file)).size !== index.records) throw new Error('보관 목록이 미완료이거나 손상되었습니다.');
    return index;
}

export async function readArchivedRecord(folder: ArchiveDirectory, entry: ArchiveEntry): Promise<Record<string, unknown>> {
    if (!/^\d{6}\.json$/.test(entry.file)) throw new Error('허용하지 않는 기록 경로입니다.');
    const recordFolder = await folder.getDirectoryHandle('records');
    const file = await (await recordFolder.getFileHandle(entry.file)).getFile();
    if (file.size > MAX_RECORD || file.size !== entry.bytes) throw new Error('기록 크기가 보관 목록과 다릅니다.');
    const text = await file.text();
    if (await digest(text) !== entry.sha256) throw new Error('기록 무결성 불일치. 원본 백업과 대조해 주세요.');
    let record: unknown;
    try { record = JSON.parse(text); } catch { throw new Error('기록 JSON이 손상되었습니다.'); }
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('기록 형식이 올바르지 않습니다.');
    return record as Record<string, unknown>;
}
