import type { WorkerRecord } from '../types';

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
