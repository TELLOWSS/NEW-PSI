import { migrateLegacyBackupRecords } from './legacyBackupMigration';
import type { WorkerRecord } from '../types';

/** Explicit work-copy preparation; never mutates the archived evidence or starts OCR. */
export async function prepareArchiveWorkRecord(source: Record<string, unknown>): Promise<WorkerRecord> {
    const migration = await migrateLegacyBackupRecords([source], { preserveExistingEvaluation: true });
    if (migration.quarantined.length || migration.records.length !== 1) throw new Error('보관 기록의 호환 검사가 필요합니다. 원본을 변경하지 않았습니다.');
    return normalizeArchiveWorkDate(migration.records[0] as Record<string, unknown>) as unknown as WorkerRecord;
}

export function normalizeArchiveWorkDate(source: Record<string, unknown>): Record<string, unknown> {
    const record = { ...source };
    const date = typeof record.date === 'string' ? record.date : '';
    const match = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(date);
    if (match) {
        const [, year, month, day] = match;
        const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const parsed = new Date(`${normalized}T00:00:00Z`);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw new Error('원본 날짜가 실제 달력 날짜인지 확인해 주세요.');
        record.date = normalized;
        record.archiveDateNormalization = { originalDate: date, normalizedDate: normalized, reason: '작업 재개용 사본의 날짜 구분자 정규화' };
    }
    return record;
}
