import type { WorkerRecord } from '../types';
import { isMonthlyArchiveManifest, type MonthlyArchiveManifest } from './monthlyArchive';
import { sha256Hex } from './evidenceUtils';

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

const stripHeavyImageEvidence = (record: Record<string, unknown>) => {
    const originalImage = typeof record.originalImage === 'string' ? record.originalImage : '';
    const profileImage = typeof record.profileImage === 'string' ? record.profileImage : '';
    return {
        record: {
            ...record,
            originalImage: '',
            profileImage: '',
            backupRecoveryNote: '대용량 스트리밍 복구: 브라우저 안정성을 위해 원본/프로필 이미지 제외',
        } as unknown as WorkerRecord,
        removedImageCharacters: originalImage.length + profileImage.length,
    };
};

export const recoverBackupRecordsWithoutImages = async (
    file: Blob,
    options: {
        onProgress?: (progress: StreamingBackupRecoveryProgress) => void;
        signal?: AbortSignal;
    } = {},
): Promise<StreamingBackupRecoveryResult> => {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    const records: WorkerRecord[] = [];
    let bytesRead = 0;
    let removedImageCharacters = 0;
    let prefixBuffer = '';
    let recordsArrayStarted = false;
    let recordsArrayFinished = false;
    let objectBuffer = '';
    let objectDepth = 0;
    let inString = false;
    let escaped = false;
    let monthlyArchive: MonthlyArchiveManifest | undefined;
    const archiveHashEntries: string[] = [];

    const emitProgress = () => options.onProgress?.({
        bytesRead,
        totalBytes: file.size,
        recoveredRecords: records.length,
    });

    const processText = async (text: string) => {
        let cursor = 0;
        if (!recordsArrayStarted) {
            prefixBuffer += text;
            const recordsMatch = /"records"\s*:\s*\[/.exec(prefixBuffer);
            if (!recordsMatch) {
                if (prefixBuffer.length > 1024 * 1024) {
                    throw new Error('백업 헤더가 안전 한도를 초과했습니다. records 배열 위치를 확인해 주세요.');
                }
                return;
            }
            const header = prefixBuffer.slice(0, recordsMatch.index).replace(/[\s,]+$/, '');
            let parsedHeader: { monthlyArchive?: unknown } | undefined;
            try {
                parsedHeader = JSON.parse(`${header}\n}`) as { monthlyArchive?: unknown };
            } catch {
                if (header.includes('"monthlyArchive"')) {
                    throw new Error('월 마감 manifest 헤더가 손상되어 복원을 중단했습니다.');
                }
            }
            if (parsedHeader?.monthlyArchive !== undefined) {
                if (!isMonthlyArchiveManifest(parsedHeader.monthlyArchive)) {
                    throw new Error('월 마감 manifest 형식이 손상되어 복원을 중단했습니다.');
                }
                monthlyArchive = parsedHeader.monthlyArchive;
            }
            recordsArrayStarted = true;
            cursor = recordsMatch.index + recordsMatch[0].length;
            text = prefixBuffer;
            prefixBuffer = '';
        }

        for (let index = cursor; index < text.length && !recordsArrayFinished; index += 1) {
            const char = text[index];
            if (objectDepth === 0) {
                if (char === ']') {
                    recordsArrayFinished = true;
                    break;
                }
                if (char !== '{') continue;
                objectBuffer = '{';
                objectDepth = 1;
                inString = false;
                escaped = false;
                continue;
            }

            objectBuffer += char;
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                objectDepth += 1;
            } else if (char === '}') {
                objectDepth -= 1;
                if (objectDepth === 0) {
                    const parsed = JSON.parse(objectBuffer) as Record<string, unknown>;
                    if (monthlyArchive) {
                        const recordId = String(parsed.id || '');
                        archiveHashEntries.push(`${recordId}:${await sha256Hex(JSON.stringify(parsed))}`);
                    }
                    const stripped = stripHeavyImageEvidence(parsed);
                    records.push(stripped.record);
                    removedImageCharacters += stripped.removedImageCharacters;
                    objectBuffer = '';
                }
            }
        }
    };

    while (!recordsArrayFinished) {
        if (options.signal?.aborted) throw new DOMException('복구가 취소되었습니다.', 'AbortError');
        const { value, done } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        await processText(decoder.decode(value, { stream: true }));
        emitProgress();
    }

    await processText(decoder.decode());
    emitProgress();

    if (!recordsArrayStarted) {
        throw new Error('백업의 records 배열을 찾지 못했습니다. NEW-PSI 전체 백업 JSON인지 확인해 주세요.');
    }
    if (objectDepth !== 0 || !recordsArrayFinished) {
        throw new Error('백업 JSON이 중간에서 끊겼거나 records 배열이 완전히 닫히지 않았습니다.');
    }

    return {
        records,
        recoveredRecords: records.length,
        removedImageCharacters,
        monthlyArchive,
        ...(monthlyArchive
            ? { contentRootHash: await sha256Hex(archiveHashEntries.sort().join('\n')) }
            : {}),
    };
};
