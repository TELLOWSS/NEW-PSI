import type { WorkerRecord } from '../types';

export type StreamingBackupRecoveryProgress = {
    bytesRead: number;
    totalBytes: number;
    recoveredRecords: number;
};

export type StreamingBackupRecoveryResult = {
    records: WorkerRecord[];
    recoveredRecords: number;
    removedImageCharacters: number;
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

    const emitProgress = () => options.onProgress?.({
        bytesRead,
        totalBytes: file.size,
        recoveredRecords: records.length,
    });

    const processText = (text: string) => {
        let cursor = 0;
        if (!recordsArrayStarted) {
            prefixBuffer += text;
            const recordsMatch = /"records"\s*:\s*\[/.exec(prefixBuffer);
            if (!recordsMatch) {
                prefixBuffer = prefixBuffer.slice(-64);
                return;
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
        processText(decoder.decode(value, { stream: true }));
        emitProgress();
    }

    processText(decoder.decode());
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
    };
};
