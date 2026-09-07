import type { WorkerRecord } from '../types';
import { inspectLegacyBackupImage, isLegacyMigratedRecord, LegacyBackupMigrationError } from './legacyBackupMigration';

export interface LegacyBackupImportMatch {
    incomingId: string;
    existingIds: string[];
    reason: 'same-source-record' | 'same-image';
}

export interface SafeLegacyBackupImportSelection {
    records: WorkerRecord[];
    heldRecordCount: number;
    heldRecordIds: string[];
    matches: LegacyBackupImportMatch[];
    unreadableExistingImageCount: number;
    unreadableIncomingImageCount: number;
}

const getBackupImageSource = (record: WorkerRecord): unknown => {
    const source = record as unknown as Record<string, unknown>;
    return source.originalImage || source.imageBase64 || source.image || source.photo
        || source.base64 || source.documentImage || source.file;
};

const hasImageSource = (value: unknown): boolean => typeof value === 'string'
    ? value.trim().length > 0
    : typeof value === 'object' && value !== null;

const addHashRecord = (index: Map<string, Set<string>>, hash: string, id: string): void => {
    if (!hash) return;
    const ids = index.get(hash) || new Set<string>();
    ids.add(id);
    index.set(hash, ids);
};

/**
 * A restored legacy document can already exist under an old, random ID. Matching
 * source provenance or exact image bytes requires review, not an overwrite or
 * deletion. Deliberately compare only against the PC records: two evaluations
 * of one image within the incoming backup must both remain recoverable.
 */
export const selectSafeLegacyBackupImports = async (
    incoming: WorkerRecord[],
    existing: WorkerRecord[],
): Promise<SafeLegacyBackupImportSelection> => {
    const result: SafeLegacyBackupImportSelection = {
        records: incoming,
        heldRecordCount: 0,
        heldRecordIds: [],
        matches: [],
        unreadableExistingImageCount: 0,
        unreadableIncomingImageCount: 0,
    };
    const existingIds = new Set(existing.map((record) => record.id));
    // A repeated import may contain two legitimate versions of the same image.
    // Already-known IDs belong to the revision gate, not the cross-ID image gate.
    const legacyRecords = incoming.filter((record) => isLegacyMigratedRecord(record) && !existingIds.has(record.id));
    if (existing.length === 0 || legacyRecords.length === 0) return result;

    const existingSourceHashes = new Map<string, Set<string>>();
    existing.forEach((record) => {
        if (isLegacyMigratedRecord(record)) {
            addHashRecord(existingSourceHashes, record.legacyBackup.sourceRecordHash, record.id);
        }
    });

    const heldIds = new Set<string>();
    const imageCandidates: WorkerRecord[] = [];
    for (const record of legacyRecords) {
        const matchingIds = [...(existingSourceHashes.get(record.legacyBackup.sourceRecordHash) || [])]
            .filter((id) => id !== record.id);
        if (matchingIds.length > 0) {
            heldIds.add(record.id);
            result.matches.push({ incomingId: record.id, existingIds: matchingIds, reason: 'same-source-record' });
        } else {
            imageCandidates.push(record);
        }
    }

    // Decode and hash one image at a time. Do not retain another full set of
    // data-URI strings for large backups, and never send image bytes off-device.
    if (imageCandidates.some((record) => hasImageSource(getBackupImageSource(record)))) {
        const existingImageHashes = new Map<string, Set<string>>();
        for (const record of existing) {
            const source = getBackupImageSource(record);
            if (!hasImageSource(source)) continue;
            try {
                const image = await inspectLegacyBackupImage(source);
                addHashRecord(existingImageHashes, image.sha256, record.id);
            } catch (error) {
                if (!(error instanceof LegacyBackupMigrationError)) throw error;
                result.unreadableExistingImageCount += 1;
            }
        }

        for (const record of imageCandidates) {
            const source = getBackupImageSource(record);
            if (!hasImageSource(source)) continue;
            try {
                const image = await inspectLegacyBackupImage(source);
                const matchingIds = [...(existingImageHashes.get(image.sha256) || [])]
                    .filter((id) => id !== record.id);
                if (matchingIds.length > 0) {
                    heldIds.add(record.id);
                    result.matches.push({ incomingId: record.id, existingIds: matchingIds, reason: 'same-image' });
                }
            } catch (error) {
                if (!(error instanceof LegacyBackupMigrationError)) throw error;
                // The migration validator normally prevents this. Preserve the
                // record for explicit validation rather than guessing a match.
                result.unreadableIncomingImageCount += 1;
            }
        }
    }

    result.records = incoming.filter((record) => !heldIds.has(record.id));
    result.heldRecordIds = [...heldIds];
    result.heldRecordCount = incoming.length - result.records.length;
    return result;
};

export const getBackupRecordRevisionTime = (record: WorkerRecord): number => {
    const values = [
        ...(record.auditTrail || []).map((entry) => entry.timestamp),
        ...(record.correctionHistory || []).map((entry) => entry.timestamp),
        ...(record.actionHistory || []).map((entry) => entry.timestamp),
        ...(record.approvalHistory || []).map((entry) => entry.timestamp),
        record.approvedAt,
    ];
    return values.reduce((latest, value) => {
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
    }, 0);
};

export const selectSafeBackupImports = (
    incoming: WorkerRecord[],
    existing: WorkerRecord[],
): { records: WorkerRecord[]; protectedLocalCount: number } => {
    const existingById = new Map(existing.map((record) => [record.id, record]));
    let protectedLocalCount = 0;
    const records = incoming.filter((record) => {
        const local = existingById.get(record.id);
        if (!local) return true;
        // A tie or missing revision evidence is not permission to overwrite the PC copy.
        if (getBackupRecordRevisionTime(local) >= getBackupRecordRevisionTime(record)) {
            protectedLocalCount += 1;
            return false;
        }
        return true;
    });
    return { records, protectedLocalCount };
};
