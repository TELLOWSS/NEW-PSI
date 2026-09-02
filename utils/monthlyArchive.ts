import type { WorkerRecord } from '../types';
import { sha256Hex } from './evidenceUtils';
import { getWorkerUuidValue, hasWorkerUuidConflict } from './workerIdentity';

export const PSI_MONTHLY_ARCHIVE_SCHEMA_VERSION = 'psi-monthly-archive/v3';
export const PSI_MONTHLY_ARCHIVE_REGISTRY_KEY = 'psi_monthly_archive_registry_v3';
export const PSI_MONTHLY_ARCHIVE_UPDATED_EVENT = 'psi-monthly-archive-updated';

export type MonthlyArchiveStatus = 'saved-needs-verification' | 'download-requested' | 'verified';

export interface WorkerMonthlyContinuitySummary {
    workerUuid: string;
    assessmentCount: number;
    firstAssessmentDate: string;
    lastAssessmentDate: string;
    averageScore: number;
    minimumScore: number;
    latestScore: number;
    latestSafetyLevel: WorkerRecord['safetyLevel'];
    attentionCount: number;
    approvedCount: number;
}

export interface MonthlyArchiveManifest {
    schemaVersion: typeof PSI_MONTHLY_ARCHIVE_SCHEMA_VERSION;
    archiveId: string;
    periodMonth: string;
    generation: number;
    fileName: string;
    createdAt: string;
    recordCount: number;
    workerCount: number;
    portableWorkerCount: number;
    unresolvedWorkerCount: number;
    minDate: string;
    maxDate: string;
    contentRootHash: string;
}

export interface MonthlyArchiveRegistryEntry extends MonthlyArchiveManifest {
    status: MonthlyArchiveStatus;
    byteSize?: number;
    verifiedAt?: string;
    serverReceiptAt?: string;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Preserve the document's calendar date, not the browser timezone's UTC date. */
export const getMonthlyArchiveRecordDate = (record: Partial<WorkerRecord>): string => {
    const raw = typeof record.date === 'string' ? record.date.trim() : '';
    const dateOnly = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    const isoTimestamp = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/);
    const matched = dateOnly || isoTimestamp;
    if (!matched || (isoTimestamp && !Number.isFinite(Date.parse(raw)))) return '';
    const [, yearText, monthText, dayText] = matched;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return '';
    return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const buildCanonicalArchiveId = (periodMonth: string, generation: number, contentRootHash: string): string => (
    `${periodMonth}-g${String(generation).padStart(3, '0')}-${contentRootHash.slice(0, 16)}`
);

export const isMonthlyArchiveManifest = (value: unknown): value is MonthlyArchiveManifest => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const manifest = value as Record<string, unknown>;
    return manifest.schemaVersion === PSI_MONTHLY_ARCHIVE_SCHEMA_VERSION
        && typeof manifest.archiveId === 'string'
        && MONTH_PATTERN.test(String(manifest.periodMonth || ''))
        && Number.isSafeInteger(manifest.generation)
        && Number(manifest.generation) >= 1
        && Number(manifest.generation) <= 999_999
        && typeof manifest.fileName === 'string'
        && manifest.fileName.length > 0
        && typeof manifest.createdAt === 'string'
        && Number.isFinite(Date.parse(manifest.createdAt))
        && Number.isSafeInteger(manifest.recordCount)
        && Number(manifest.recordCount) >= 1
        && Number(manifest.recordCount) <= 10_000_000
        && Number.isSafeInteger(manifest.workerCount)
        && Number(manifest.workerCount) >= 0
        && Number(manifest.workerCount) <= Number(manifest.recordCount)
        && Number.isSafeInteger(manifest.portableWorkerCount)
        && Number(manifest.portableWorkerCount) >= 0
        && Number.isSafeInteger(manifest.unresolvedWorkerCount)
        && Number(manifest.unresolvedWorkerCount) >= 0
        && Number(manifest.portableWorkerCount) + Number(manifest.unresolvedWorkerCount) === Number(manifest.workerCount)
        && typeof manifest.minDate === 'string'
        && manifest.minDate === getMonthlyArchiveRecordDate({ date: manifest.minDate })
        && manifest.minDate.slice(0, 7) === manifest.periodMonth
        && typeof manifest.maxDate === 'string'
        && manifest.maxDate === getMonthlyArchiveRecordDate({ date: manifest.maxDate })
        && manifest.maxDate.slice(0, 7) === manifest.periodMonth
        && manifest.minDate <= manifest.maxDate
        && SHA256_PATTERN.test(String(manifest.contentRootHash || ''))
        && manifest.archiveId === buildCanonicalArchiveId(
            String(manifest.periodMonth), Number(manifest.generation), String(manifest.contentRootHash),
        );
};

export const getMonthlyArchiveRecordMonth = (record: Partial<WorkerRecord>): string => {
    return getMonthlyArchiveRecordDate(record).slice(0, 7);
};

const isPortableWorkerUuid = (value: string): boolean => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized || /^(?:WN-|WU-EMP-|WU-QR-)/.test(normalized)) return false;
    return /^(?:WP-|WU-)[A-Z0-9._:-]{1,92}$/.test(normalized)
        || /^[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(normalized);
};

const getPortableSummaryWorkerUuid = (record: Partial<WorkerRecord>): string => {
    if (hasWorkerUuidConflict(record)) return '';
    const workerUuid = getWorkerUuidValue(record);
    return isPortableWorkerUuid(workerUuid) ? workerUuid : '';
};

const getArchiveRecordMetadata = (records: WorkerRecord[]) => {
    const portableWorkers = new Set<string>();
    const unresolvedRecords = new Set<string>();
    const dates: string[] = [];
    for (const [index, record] of records.entries()) {
        const workerUuid = getPortableSummaryWorkerUuid(record);
        if (workerUuid) portableWorkers.add(workerUuid);
        // Without a confirmed identity, each record remains a separate pending
        // identity. Never merge conflicting IDs or same-name workers here.
        else unresolvedRecords.add(String(record.id || `missing-id:${index}`));
        dates.push(getMonthlyArchiveRecordDate(record));
    }
    dates.sort();
    return {
        recordCount: records.length,
        workerCount: portableWorkers.size + unresolvedRecords.size,
        portableWorkerCount: portableWorkers.size,
        unresolvedWorkerCount: unresolvedRecords.size,
        minDate: dates[0] || '',
        maxDate: dates[dates.length - 1] || '',
    };
};

/**
 * Shared metadata verification for both full and image-stripped streaming reads.
 * This does not hash records; the streaming caller must separately compare its
 * original-content hash with manifest.contentRootHash.
 */
export const verifyMonthlyArchiveMetadata = (
    records: WorkerRecord[],
    manifest: MonthlyArchiveManifest,
): boolean => {
    if (!isMonthlyArchiveManifest(manifest)
        || records.length !== manifest.recordCount
        || records.some((record) => getMonthlyArchiveRecordMonth(record) !== manifest.periodMonth)) return false;
    const actual = getArchiveRecordMetadata(records);
    return manifest.recordCount === actual.recordCount
        && manifest.workerCount === actual.workerCount
        && manifest.portableWorkerCount === actual.portableWorkerCount
        && manifest.unresolvedWorkerCount === actual.unresolvedWorkerCount
        && manifest.minDate === actual.minDate
        && manifest.maxDate === actual.maxDate;
};

const parseDateValue = (value: unknown): number => {
    const parsed = new Date(String(value || '')).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeScore = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;
};

export const buildWorkerMonthlyContinuitySummaries = (
    records: WorkerRecord[],
): WorkerMonthlyContinuitySummary[] => {
    const grouped = new Map<string, WorkerRecord[]>();
    for (const record of records) {
        const workerUuid = getPortableSummaryWorkerUuid(record);
        if (!workerUuid || !getMonthlyArchiveRecordDate(record)) continue;
        const bucket = grouped.get(workerUuid) || [];
        bucket.push(record);
        grouped.set(workerUuid, bucket);
    }

    return Array.from(grouped.entries()).map(([workerUuid, items]) => {
        const sorted = [...items].sort((a, b) => (
            getMonthlyArchiveRecordDate(a).localeCompare(getMonthlyArchiveRecordDate(b))
            || parseDateValue(a.date) - parseDateValue(b.date)
            || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        ));
        const scores = sorted.map((record) => normalizeScore(record.safetyScore));
        const latest = sorted[sorted.length - 1];
        return {
            workerUuid,
            assessmentCount: sorted.length,
            firstAssessmentDate: getMonthlyArchiveRecordDate(sorted[0]),
            lastAssessmentDate: getMonthlyArchiveRecordDate(latest),
            averageScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length)),
            minimumScore: Math.min(...scores),
            latestScore: scores[scores.length - 1] || 0,
            latestSafetyLevel: latest?.safetyLevel || '초급',
            attentionCount: sorted.filter((record) => (
                Boolean(record.ocrErrorType)
                || normalizeScore(record.safetyScore) < 60
                || record.selfAssessedRiskLevel === '상'
            )).length,
            approvedCount: sorted.filter((record) => (
                record.reviewStatus === 'APPROVED'
                || record.approvalStatus === 'APPROVED'
                || record.approvalStatus === 'OVERRIDDEN'
            )).length,
        };
    }).sort((a, b) => a.workerUuid.localeCompare(b.workerUuid));
};

const hashArchiveRecords = async (records: WorkerRecord[]): Promise<string> => {
    const entries: string[] = [];
    for (const record of [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
        const recordHash = await sha256Hex(JSON.stringify(record));
        entries.push(`${record.id}:${recordHash}`);
    }
    return sha256Hex(entries.join('\n'));
};

export const loadMonthlyArchiveRegistry = (): MonthlyArchiveRegistryEntry[] => {
    if (typeof window === 'undefined') return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(PSI_MONTHLY_ARCHIVE_REGISTRY_KEY) || '[]');
        return Array.isArray(parsed) ? parsed as MonthlyArchiveRegistryEntry[] : [];
    } catch {
        return [];
    }
};

export const saveMonthlyArchiveRegistryEntry = (entry: MonthlyArchiveRegistryEntry): void => {
    if (typeof window === 'undefined') return;
    try {
        const current = loadMonthlyArchiveRegistry();
        const next = [entry, ...current.filter((item) => item.archiveId !== entry.archiveId)]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 240);
        localStorage.setItem(PSI_MONTHLY_ARCHIVE_REGISTRY_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(PSI_MONTHLY_ARCHIVE_UPDATED_EVENT));
    } catch (error) {
        console.warn('[PSI][MonthlyArchive] 로컬 백업 목록 저장 실패:', error);
    }
};

export const getNextMonthlyArchiveGeneration = (periodMonth: string): number => {
    const generations = loadMonthlyArchiveRegistry()
        .filter((entry) => entry.periodMonth === periodMonth)
        .map((entry) => Number(entry.generation || 0));
    return Math.max(0, ...generations) + 1;
};

export const buildMonthlyArchiveManifest = async (options: {
    records: WorkerRecord[];
    periodMonth: string;
    generation: number;
    fileName: string;
    now?: Date;
}): Promise<{ manifest: MonthlyArchiveManifest; workerSummaries: WorkerMonthlyContinuitySummary[] }> => {
    if (!MONTH_PATTERN.test(options.periodMonth)) {
        throw new Error('월별 백업 대상 월 형식이 올바르지 않습니다.');
    }
    const records = options.records.filter((record) => getMonthlyArchiveRecordMonth(record) === options.periodMonth);
    if (records.length === 0) throw new Error(`${options.periodMonth}에 해당하는 기록이 없습니다.`);
    if (!Number.isSafeInteger(options.generation) || options.generation < 1 || options.generation > 999_999) {
        throw new Error('월별 백업 세대 번호가 올바르지 않습니다.');
    }

    const workerSummaries = buildWorkerMonthlyContinuitySummaries(records);
    const contentRootHash = await hashArchiveRecords(records);
    const metadata = getArchiveRecordMetadata(records);
    const now = options.now || new Date();
    const archiveId = buildCanonicalArchiveId(options.periodMonth, options.generation, contentRootHash);

    return {
        manifest: {
            schemaVersion: PSI_MONTHLY_ARCHIVE_SCHEMA_VERSION,
            archiveId,
            periodMonth: options.periodMonth,
            generation: options.generation,
            fileName: options.fileName,
            createdAt: now.toISOString(),
            ...metadata,
            contentRootHash,
        },
        workerSummaries,
    };
};

export const verifyMonthlyArchiveRecords = async (
    records: WorkerRecord[],
    manifest: MonthlyArchiveManifest,
): Promise<{ valid: boolean; actualHash: string; actualCount: number }> => {
    if (!isMonthlyArchiveManifest(manifest)) {
        return { valid: false, actualHash: '', actualCount: 0 };
    }
    const monthlyRecords = records.filter((record) => getMonthlyArchiveRecordMonth(record) === manifest.periodMonth);
    const actualHash = await hashArchiveRecords(monthlyRecords);
    return {
        valid: verifyMonthlyArchiveMetadata(records, manifest)
            && actualHash === manifest.contentRootHash,
        actualHash,
        actualCount: monthlyRecords.length,
    };
};
