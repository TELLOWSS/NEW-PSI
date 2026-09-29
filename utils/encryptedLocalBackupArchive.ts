import { createLocalArchive, openLocalArchive, readArchivedRecord, type ArchiveDirectory, type ArchiveFileHandle, type LocalArchiveIndex } from './localBackupArchive';

const HEADER_FILE = 'encryption.json';
const FORMAT = 'psi-encrypted-archive/v1';
const ITERATIONS = 600_000;
const MAX_PLAINTEXT = 32 * 1024 * 1024;
const MAX_ENVELOPE = Math.ceil((MAX_PLAINTEXT + 16) / 3) * 4 + 2048;
const encoder = new TextEncoder();
type Header = { format: typeof FORMAT; cipher: 'AES-256-GCM'; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; archiveId: string };
export type OpenArchive = { directory: ArchiveDirectory; index: LocalArchiveIndex; encrypted: boolean };

const base64 = (bytes: Uint8Array) => {
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    return btoa(chunks.join(''));
};
const unbase64 = (value: unknown, maxBytes: number): Uint8Array<ArrayBuffer> => {
    if (typeof value !== 'string' || !value.length || value.length % 4 !== 0
        || value.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('암호화 파일 형식이 올바르지 않습니다.');
    const text = atob(value);
    if (text.length > maxBytes) throw new Error('암호화 파일이 안전 한도를 초과했습니다.');
    return Uint8Array.from(text, char => char.charCodeAt(0));
};

export function validateArchivePassword(password: string) {
    if (password.trim().length < 12 || password.length > 1024) throw new Error('백업 비밀번호는 12자 이상, 1,024자 이하로 입력해 주세요.');
}

async function deriveKey(password: string, header: Header) {
    validateArchivePassword(password);
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unbase64(header.salt, 32), iterations: ITERATIONS }, material,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function validateHeader(value: any): Header {
    if (!value || value.format !== FORMAT || value.cipher !== 'AES-256-GCM' || value.kdf !== 'PBKDF2-SHA256'
        || value.iterations !== ITERATIONS || typeof value.archiveId !== 'string'
        || !/^[a-f0-9-]{36}$/.test(value.archiveId) || unbase64(value.salt, 32).length !== 32) {
        throw new Error('지원하지 않거나 손상된 암호화 보관함입니다.');
    }
    // Canonical authenticated header: edited KDF, salt, ID or format cannot decrypt existing files.
    return { format: FORMAT, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: value.salt, archiveId: value.archiveId };
}

function encryptedDirectory(folder: ArchiveDirectory, key: CryptoKey, header: Header, prefix = ''): ArchiveDirectory {
    const safeName = (name: string) => {
        if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === '.' || name === '..') throw new Error('허용하지 않는 보관 경로입니다.');
        return `${prefix}${name}`;
    };
    return {
        async getDirectoryHandle(name, options) {
            const path = safeName(name);
            return encryptedDirectory(await folder.getDirectoryHandle(name, options), key, header, `${path}/`);
        },
        async getFileHandle(name, options): Promise<ArchiveFileHandle> {
            const path = safeName(name);
            const handle = await folder.getFileHandle(name, options);
            const additionalData = encoder.encode(`${JSON.stringify(header)}\n${path}`);
            return {
                async getFile() {
                    const file = await handle.getFile();
                    if (file.size > MAX_ENVELOPE) throw new Error('암호화 파일이 안전 한도를 초과했습니다.');
                    let envelope: any;
                    try { envelope = JSON.parse(await file.text()); }
                    catch { throw new Error('암호화 파일이 손상되었습니다.'); }
                    if (envelope?.format !== FORMAT) throw new Error('암호화 파일 형식이 올바르지 않습니다.');
                    const iv = unbase64(envelope.iv, 12);
                    const ciphertext = unbase64(envelope.ciphertext, MAX_PLAINTEXT + 16);
                    if (iv.length !== 12 || ciphertext.length < 16) throw new Error('암호화 파일이 손상되었습니다.');
                    try {
                        const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, ciphertext);
                        return new File([clear], name, { type: 'application/json' });
                    } catch { throw new Error('비밀번호가 다르거나 보관 파일이 변경되었습니다. 원본을 보존하고 다시 확인해 주세요.'); }
                },
                async createWritable() {
                    const writer = await handle.createWritable();
                    return {
                        async write(text) {
                            const clear = encoder.encode(text);
                            if (clear.byteLength > MAX_PLAINTEXT) throw new Error('기록 1건이 32MiB를 초과합니다.');
                            const iv = crypto.getRandomValues(new Uint8Array(12));
                            const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, clear);
                            await writer.write(JSON.stringify({ format: FORMAT, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }));
                        },
                        close: () => writer.close(),
                        abort: () => writer.abort(),
                    };
                },
            };
        },
    };
}

async function assertUnused(folder: ArchiveDirectory) {
    for (const name of [HEADER_FILE, 'STARTED.json', 'index.json', 'source-envelope.json']) {
        try { await folder.getFileHandle(name); }
        catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') continue; throw error; }
        throw new Error('기존 보관 폴더를 덮어쓸 수 없습니다. 새 폴더를 선택하세요.');
    }
    try { await folder.getDirectoryHandle('records'); }
    catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return; throw error; }
    throw new Error('기존 기록 폴더를 덮어쓸 수 없습니다. 새 폴더를 선택하세요.');
}

export async function createEncryptedLocalArchive(source: Blob, folder: ArchiveDirectory, password: string,
    signal?: AbortSignal, onProgress?: (count: number) => void): Promise<OpenArchive> {
    validateArchivePassword(password);
    if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
    await assertUnused(folder);
    const header: Header = { format: FORMAT, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
        salt: base64(crypto.getRandomValues(new Uint8Array(32))), archiveId: crypto.randomUUID() };
    const key = await deriveKey(password, header);
    if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
    const headerText = JSON.stringify(header);
    const handle = await folder.getFileHandle(HEADER_FILE, { create: true });
    const writer = await handle.createWritable();
    try { await writer.write(headerText); await writer.close(); }
    catch (error) { await writer.abort().catch(() => undefined); throw error; }
    if (await (await handle.getFile()).text() !== headerText) throw new Error('암호화 설정 저장 확인에 실패했습니다.');
    const directory = encryptedDirectory(folder, key, header);
    const index = await createLocalArchive(source, directory, signal, onProgress);
    return { directory, index, encrypted: true };
}

export async function openProtectedLocalArchive(folder: ArchiveDirectory, password: string): Promise<OpenArchive> {
    let handle: ArchiveFileHandle;
    try { handle = await folder.getFileHandle(HEADER_FILE); }
    catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return { directory: folder, index: await openLocalArchive(folder), encrypted: false };
        throw error;
    }
    const file = await handle.getFile();
    if (file.size > 2048) throw new Error('암호화 설정 파일이 손상되었습니다.');
    let header: Header;
    try { header = validateHeader(JSON.parse(await file.text())); }
    catch { throw new Error('지원하지 않거나 손상된 암호화 보관함입니다.'); }
    const key = await deriveKey(password, header);
    const directory = encryptedDirectory(folder, key, header);
    return { directory, index: await openLocalArchive(directory), encrypted: true };
}

/** Verify all records one at a time; never imports them into the operational database. */
export async function verifyLocalArchiveRestore(directory: ArchiveDirectory, index: LocalArchiveIndex,
    signal?: AbortSignal, onProgress?: (count: number) => void) {
    let records = 0;
    for (const entry of index.entries) {
        if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
        await readArchivedRecord(directory, entry);
        records += 1;
        onProgress?.(records);
    }
    if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
    const metadata = await (await directory.getFileHandle('source-envelope.json')).getFile();
    if (metadata.size > 8 * 1024 * 1024) throw new Error('출처 정보가 안전 한도를 초과했습니다.');
    const value = JSON.parse(await metadata.text());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('출처 정보가 손상되었습니다.');
    return { records };
}
