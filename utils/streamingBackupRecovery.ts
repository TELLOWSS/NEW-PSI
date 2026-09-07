import type { WorkerRecord } from '../types';
import { isMonthlyArchiveManifest, verifyMonthlyArchiveMetadata, type MonthlyArchiveManifest } from './monthlyArchive';
import { sha256Hex } from './evidenceUtils';
import { migrateLegacyBackupRecords } from './legacyBackupMigration';

export type StreamingBackupRecoveryProgress = {
    bytesRead: number;
    totalBytes: number;
    recoveredRecords: number;
};

export type StreamingBackupRecoveryResult = {
    records: WorkerRecord[];
    recoveredRecords: number;
    removedImageCharacters: number;
    monthlyArchive?: MonthlyArchiveManifest;
    contentRootHash?: string;
};

const ORIGINAL_IMAGE_ALIASES = ['image', 'photo', 'base64', 'documentImage', 'file'] as const;
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Match App.normalizeImage's accepted string boundary. A short file name or
// arbitrary non-image object is metadata, and must not be deleted as an image.
const canRestoreImageString = (value: unknown): value is string => typeof value === 'string'
    && value.length >= 50
    && (value.trim().startsWith('data:image')
        || value.replace(/^data:image\/[a-z0-9]+;base64,/i, '').replace(/\s/g, '').length >= 50);

const stripAliasImagePayload = (value: unknown): { value: unknown; removedCharacters: number } => {
    if (canRestoreImageString(value)) return { value: undefined, removedCharacters: value.length };
    if (!isPlainObject(value)) return { value, removedCharacters: 0 };
    const stripped = { ...value };
    let removedCharacters = 0;
    const hasInlineContainer = typeof stripped.inlineData === 'object' && stripped.inlineData !== null;
    if (!hasInlineContainer && canRestoreImageString(stripped.data)) {
        removedCharacters += stripped.data.length;
        delete stripped.data;
    }
    if (isPlainObject(stripped.inlineData) && canRestoreImageString(stripped.inlineData.data)) {
        const inlineData = { ...stripped.inlineData };
        removedCharacters += String(inlineData.data).length;
        delete inlineData.data;
        // Retain MIME/caption/other metadata without an image payload. Keeping
        // the container also prevents App's fallback to an unrelated data field,
        // which must be preserved even when that metadata happens to be long.
        stripped.inlineData = inlineData;
    }
    return { value: removedCharacters ? stripped : value, removedCharacters };
};

const stripHeavyImageEvidence = (record: Record<string, unknown>) => {
    const originalImage = typeof record.originalImage === 'string' ? record.originalImage : '';
    const profileImage = typeof record.profileImage === 'string' ? record.profileImage : '';
    // Migration has already consumed the legacy image when creating its stable ID.
    // Do not retain a second, unrecognised copy of the heavy evidence in the result.
    const { imageBase64, ...withoutLegacyImage } = record;
    let aliasImageCharacters = 0;
    for (const alias of ORIGINAL_IMAGE_ALIASES) {
        const stripped = stripAliasImagePayload(withoutLegacyImage[alias]);
        if (!stripped.removedCharacters) continue;
        aliasImageCharacters += stripped.removedCharacters;
        if (stripped.value === undefined) delete withoutLegacyImage[alias];
        else withoutLegacyImage[alias] = stripped.value;
    }
    return {
        record: {
            ...withoutLegacyImage,
            originalImage: '',
            profileImage: '',
            backupRecoveryNote: '대용량 스트리밍 복구: 브라우저 안정성을 위해 원본/프로필 이미지와 구형 이미지 별칭 제외. 원본 파일은 변경하지 않음',
        } as unknown as WorkerRecord,
        removedImageCharacters: originalImage.length + profileImage.length
            + (typeof imageBase64 === 'string' ? imageBase64.length : 0) + aliasImageCharacters,
    };
};

const ROOT_RECORD_KEYS = new Set(['records', 'workerRecords', 'data', 'items']);
const MAX_METADATA_CHARACTERS = 1024 * 1024;
const isWhitespace = (char: string) => char === ' ' || char === '\n' || char === '\r' || char === '\t';

type ParserState = 'root' | 'key-or-end' | 'key' | 'colon' | 'value' | 'object-separator'
    | 'record-or-end' | 'record' | 'record-separator' | 'done';
type ValueCapture = {
    kind: 'key' | 'metadata' | 'record';
    parts: string[];
    length: number;
    closing: string[];
    inString: boolean;
    escaped: boolean;
    primitive: boolean;
};

/**
 * Read one record at a time, but validate the framing of the ENTIRE JSON file.
 * Metadata is parsed as an opaque value, so a nested "records" array can never
 * be mistaken for the root backup. Monthly manifests must precede the records
 * so original-content integrity can be calculated before evidence is removed.
 */
export const recoverBackupRecordsWithoutImages = async (
    file: Blob,
    options: {
        onProgress?: (progress: StreamingBackupRecoveryProgress) => void;
        signal?: AbortSignal;
    } = {},
): Promise<StreamingBackupRecoveryResult> => {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const records: WorkerRecord[] = [];
    let bytesRead = 0;
    let removedImageCharacters = 0;
    let state: ParserState = 'root';
    // TypeScript does not track assignments made inside processText across
    // awaits; read the current parser state through its declared state type.
    const currentState = (): ParserState => state;
    let rootIsArray = false;
    let recordsArrayStarted = false;
    let rootKey = '';
    let metadataCharacters = 0;
    let capture: ValueCapture | undefined;
    let streamEnded = false;
    let monthlyArchive: MonthlyArchiveManifest | undefined;
    const rootKeys = new Set<string>();
    const archiveHashEntries: Array<{ id: WorkerRecord['id']; entry: string }> = [];
    // Keep only fields used by the shared manifest verifier, not another copy
    // of source images/text. These values must describe the pre-migration file.
    const originalArchiveMetadata: WorkerRecord[] = [];

    const abortError = () => new DOMException('복구가 취소되었습니다.', 'AbortError');
    const checkAborted = () => { if (options.signal?.aborted) throw abortError(); };
    const onAbort = () => { void reader.cancel().catch(() => undefined); };
    const failFraming = (): never => {
        throw new Error('백업 JSON 형식이 손상되었습니다. 배열 항목·구분자·파일 끝을 확인해 주세요.');
    };
    const emitProgress = () => options.onProgress?.({
        bytesRead,
        totalBytes: file.size,
        recoveredRecords: records.length,
    });

    const finishCapture = async () => {
        const completed = capture!;
        capture = undefined;
        let parsed: unknown;
        try {
            parsed = JSON.parse(completed.parts.join(''));
        } catch {
            // Never echo JSON.parse's source excerpt, which may contain personal data.
            throw new Error('백업 JSON 값이 손상되었습니다. 원본 파일을 확인해 주세요.');
        }
        if (completed.kind === 'key') {
            if (typeof parsed !== 'string' || rootKeys.has(parsed)) {
                throw new Error('백업 최상위 항목 이름이 중복되었거나 손상되었습니다.');
            }
            rootKey = parsed;
            rootKeys.add(parsed);
            state = 'colon';
        } else if (completed.kind === 'metadata') {
            if (rootKey === 'monthlyArchive') {
                if (recordsArrayStarted) {
                    throw new Error('월 마감 manifest가 records 배열 뒤에 있습니다. 무결성 검증을 위해 manifest를 먼저 배치한 백업이 필요합니다.');
                }
                if (!isMonthlyArchiveManifest(parsed)) {
                    throw new Error('월 마감 manifest 형식이 손상되어 복원을 중단했습니다.');
                }
                monthlyArchive = parsed;
            }
            state = 'object-separator';
        } else {
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) failFraming();
            const original = parsed as Record<string, unknown>;
            if (monthlyArchive) {
                archiveHashEntries.push({
                    id: original.id as WorkerRecord['id'],
                    entry: `${original.id}:${await sha256Hex(JSON.stringify(original))}`,
                });
                originalArchiveMetadata.push({
                    id: original.id,
                    date: original.date,
                    portableWorkerId: original.portableWorkerId,
                    worker_uuid: original.worker_uuid,
                    workerUuid: original.workerUuid,
                } as WorkerRecord);
            }
            // Hash/migrate before stripping: source image bytes are part of a
            // legacy document ID, and monthly hashes refer to the original file.
            const migrated = await migrateLegacyBackupRecords([original]);
            checkAborted();
            if (migrated.quarantined.length || migrated.records.length !== 1) {
                throw new Error(`대용량 백업 ${records.length + 1}번째 기록의 구형 형식을 안전하게 변환할 수 없습니다. 이미지 포함 일반 복구 또는 별도 호환 변환이 필요합니다.`);
            }
            const migratedRecord = migrated.records[0] as Record<string, unknown>;
            if (Object.prototype.hasOwnProperty.call(migratedRecord, 'imageBase64')) {
                throw new Error(`대용량 백업 ${records.length + 1}번째 기록의 구형 이미지를 확인할 수 없습니다. 원본을 보존한 별도 호환 변환이 필요합니다.`);
            }
            const stripped = stripHeavyImageEvidence(migratedRecord);
            records.push(stripped.record);
            removedImageCharacters += stripped.removedImageCharacters;
            state = 'record-separator';
        }
    };

    const beginCapture = (kind: ValueCapture['kind'], firstChar: string) => {
        capture = {
            kind, parts: [], length: 0, closing: [], inString: false, escaped: false,
            primitive: firstChar !== '{' && firstChar !== '[' && firstChar !== '"',
        };
    };

    const processText = async (text: string) => {
        let segmentStart = capture ? 0 : -1;
        const appendSegment = (end: number) => {
            if (!capture || segmentStart < 0 || end === segmentStart) return;
            const part = text.slice(segmentStart, end);
            capture.parts.push(part);
            capture.length += part.length;
            if (capture.kind !== 'record') {
                metadataCharacters += part.length;
                if (metadataCharacters > MAX_METADATA_CHARACTERS) {
                    throw new Error('백업 메타데이터가 안전 한도를 초과했습니다. 기록 배열 외의 대용량 내용을 확인해 주세요.');
                }
            }
            segmentStart = end;
        };

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (!capture) {
                if (isWhitespace(char)) continue;
                if (state === 'root') {
                    if (char === '[') {
                        rootIsArray = true;
                        recordsArrayStarted = true;
                        state = 'record-or-end';
                        continue;
                    }
                    if (char !== '{') failFraming();
                    state = 'key-or-end';
                    continue;
                }
                if (state === 'key-or-end' || state === 'key') {
                    if (char === '}' && state === 'key-or-end') { state = 'done'; continue; }
                    if (char !== '"') failFraming();
                    beginCapture('key', char);
                } else if (state === 'colon') {
                    if (char !== ':') failFraming();
                    state = 'value';
                    continue;
                } else if (state === 'value') {
                    if (ROOT_RECORD_KEYS.has(rootKey)) {
                        if (char !== '[' || recordsArrayStarted) {
                            throw new Error('백업 최상위 기록 배열이 없거나 여러 개여서 안전하게 선택할 수 없습니다.');
                        }
                        recordsArrayStarted = true;
                        state = 'record-or-end';
                        continue;
                    }
                    if (!'"{[-0123456789tfn'.includes(char)) failFraming();
                    beginCapture('metadata', char);
                } else if (state === 'object-separator') {
                    if (char === ',') { state = 'key'; continue; }
                    if (char === '}') { state = 'done'; continue; }
                    failFraming();
                } else if (state === 'record-or-end' || state === 'record') {
                    if (char === ']' && state === 'record-or-end') {
                        state = rootIsArray ? 'done' : 'object-separator';
                        continue;
                    }
                    if (char !== '{') {
                        throw new Error('백업 기록 배열에 객체가 아닌 항목 또는 잘못된 구분자가 있습니다. 일부 항목을 생략하지 않고 복원을 중단했습니다.');
                    }
                    beginCapture('record', char);
                } else if (state === 'record-separator') {
                    if (char === ',') { state = 'record'; continue; }
                    if (char === ']') { state = rootIsArray ? 'done' : 'object-separator'; continue; }
                    failFraming();
                } else {
                    failFraming();
                }
                segmentStart = index;
            }

            const active = capture!;
            if (active.primitive && !active.inString && (isWhitespace(char) || ',]}'.includes(char))) {
                appendSegment(index);
                await finishCapture();
                segmentStart = -1;
                index -= 1; // The delimiter belongs to the containing object.
                continue;
            }
            let complete = false;
            if (active.inString) {
                if (active.escaped) active.escaped = false;
                else if (char === '\\') active.escaped = true;
                else if (char === '"') {
                    active.inString = false;
                    complete = active.closing.length === 0;
                }
            } else if (char === '"') active.inString = true;
            else if (char === '{' || char === '[') active.closing.push(char === '{' ? '}' : ']');
            else if (char === '}' || char === ']') {
                if (active.closing.pop() !== char) failFraming();
                complete = active.closing.length === 0;
            }
            if (complete) {
                appendSegment(index + 1);
                await finishCapture();
                segmentStart = -1;
            }
        }
        appendSegment(text.length);
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
        checkAborted();
        // Continue through EOF even after the array closes. Trailing corruption
        // and a late monthly manifest must never turn into a successful import.
        while (true) {
            const { value, done } = await reader.read();
            checkAborted();
            if (done) { streamEnded = true; break; }
            bytesRead += value.byteLength;
            await processText(decoder.decode(value, { stream: true }));
            emitProgress();
        }
        await processText(decoder.decode());
        if (capture || currentState() !== 'done') {
            throw new Error('백업 JSON이 중간에서 끊겼거나 최상위 배열/객체가 완전히 닫히지 않았습니다.');
        }
        if (!recordsArrayStarted) {
            throw new Error('백업의 최상위 기록 배열을 찾지 못했습니다. records/workerRecords/data/items 또는 배열 백업인지 확인해 주세요.');
        }
        const contentRootHash = monthlyArchive
            ? await sha256Hex(archiveHashEntries
                .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
                .map(({ entry }) => entry).join('\n'))
            : undefined;
        checkAborted();
        if (monthlyArchive && (contentRootHash !== monthlyArchive.contentRootHash
            || !verifyMonthlyArchiveMetadata(originalArchiveMetadata, monthlyArchive))) {
            throw new Error('월 마감 파일의 원본 내용 또는 manifest 정보가 일치하지 않아 복원을 중단했습니다. 파일 변경·누락 여부를 확인해 주세요.');
        }
        emitProgress();
        checkAborted();
        return {
            records,
            recoveredRecords: records.length,
            removedImageCharacters,
            monthlyArchive,
            ...(contentRootHash ? { contentRootHash } : {}),
        };
    } finally {
        options.signal?.removeEventListener('abort', onAbort);
        if (!streamEnded) await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
};
