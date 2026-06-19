import type { WorkerRecord } from '../types';
import { analyzeWorkerEvidenceReadiness, getWorkerIdentityKey } from './workerIdentity';

export const PSI_BACKUP_SCHEMA_VERSION = 'psi-backup/v2';
export const BACKUP_LARGE_FILE_WARNING_BYTES = 50 * 1024 * 1024;
export const BACKUP_HARD_FILE_LIMIT_BYTES = 500 * 1024 * 1024;

const REQUIRED_STRING_FIELDS = ['id', 'name', 'jobField', 'date', 'nationality', 'safetyLevel'] as const;
const REQUIRED_ARRAY_FIELDS = ['strengths', 'weakAreas', 'suggestions'] as const;

export interface ResolvedBackupPayload {
    records: unknown[];
    schemaVersion: string;
    exportedAt: string;
}

export interface BackupImportAnalysis {
    rawRecordCount: number;
    objectRecordCount: number;
    validRecords: WorkerRecord[];
    invalidObjectCount: number;
    problematicRecordCount: number;
    missingFieldCounts: Record<string, number>;
    typeIssueCounts: Record<string, number>;
    sampleIssues: string[];
    duplicateIdCount: number;
    duplicateEvidenceCount: number;
    workerDateCollisionCount: number;
    workerDateCollisionGroups: number;
    maxWorkerDateCollisionSize: number;
    identityCollisionBlocked: boolean;
    existingIdCollisionCount: number;
    existingEvidenceCollisionCount: number;
    existingIdentityOverlapCount: number;
    newRecordCount: number;
    projectedTotalRecords: number;
    distinctDateCount: number;
    distinctMonthCount: number;
    validDateCount: number;
    invalidDateCount: number;
    futureDateCount: number;
    minDate: string;
    maxDate: string;
    dominantDate: string;
    dominantDateCount: number;
    dominantDateRate: number;
    singleDateConcentration: boolean;
    largeFileWarning: boolean;
    hardFileLimitExceeded: boolean;
    blocked: boolean;
    warnings: string[];
    summary: string;
    details: string;
    confirmationText: string;
}

export interface PsiBackupEnvelope {
    schemaVersion: typeof PSI_BACKUP_SCHEMA_VERSION;
    product: 'NEW-PSI';
    exportedAt: string;
    scope: 'full-browser-snapshot';
    manifest: {
        recordCount: number;
        workerGroups: number;
        repeatedWorkerGroups: number;
        multiMonthWorkerGroups: number;
        maxMonthsPerWorker: number;
        minDate: string;
        maxDate: string;
        distinctDateCount: number;
        distinctMonthCount: number;
        lowScoreRecords: number;
        imageCoverageRate: number;
        handwrittenCoverageRate: number;
        aiInsightCoverageRate: number;
        nativeGuidanceCoverageRate: number;
        identityBasis: string;
        warnings: string[];
    };
    records: WorkerRecord[];
}

const addCount = (bucket: Record<string, number>, key: string): void => {
    bucket[key] = (bucket[key] || 0) + 1;
};

const normalizeText = (value: unknown): string => String(value || '').trim();

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toLocalDateKey = (value: unknown): string => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    const raw = normalizeText(value);
    if (!raw) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() + 1 !== month
        || date.getUTCDate() !== day
    ) return '';
    return `${match[1]}-${match[2]}-${match[3]}`;
};

const toMonthKey = (dateKey: string): string => dateKey.slice(0, 7);

const getBackupWorkerKey = (record: Partial<WorkerRecord>): string => {
    const stableUuid = normalizeText(record.worker_uuid || record.workerUuid);
    return stableUuid ? `worker:${stableUuid}` : getWorkerIdentityKey(record as WorkerRecord);
};

const countDuplicates = (values: string[]): number => {
    const counts = new Map<string, number>();
    values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
};

const getDateStats = (records: Array<Partial<WorkerRecord>>, today: Date) => {
    const dateCounts = new Map<string, number>();
    let invalidDateCount = 0;
    let futureDateCount = 0;
    const todayKey = toLocalDateKey(today);

    records.forEach((record) => {
        const dateKey = toLocalDateKey(record.date);
        if (!dateKey) {
            invalidDateCount += 1;
            return;
        }
        dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
        if (todayKey && dateKey > todayKey) futureDateCount += 1;
    });

    const dates = Array.from(dateCounts.keys()).sort();
    const dominant = Array.from(dateCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    const validDateCount = records.length - invalidDateCount;
    const dominantDateCount = dominant?.[1] || 0;
    const dominantDateRate = validDateCount > 0
        ? Number(((dominantDateCount / validDateCount) * 100).toFixed(1))
        : 0;

    return {
        validDateCount,
        invalidDateCount,
        futureDateCount,
        distinctDateCount: dates.length,
        distinctMonthCount: new Set(dates.map(toMonthKey)).size,
        minDate: dates[0] || '',
        maxDate: dates.at(-1) || '',
        dominantDate: dominant?.[0] || '',
        dominantDateCount,
        dominantDateRate,
        singleDateConcentration: records.length >= 20 && dates.length === 1,
    };
};

export const resolveBackupPayload = (payload: unknown): ResolvedBackupPayload => {
    if (Array.isArray(payload)) {
        return { records: payload, schemaVersion: 'legacy-array', exportedAt: '' };
    }
    if (!payload || typeof payload !== 'object') {
        return { records: [], schemaVersion: 'unknown', exportedAt: '' };
    }

    const obj = payload as Record<string, unknown>;
    const candidates = [obj.records, obj.workerRecords, obj.data, obj.items];
    const records = candidates.find(Array.isArray) as unknown[] | undefined;
    return {
        records: records || [],
        schemaVersion: normalizeText(obj.schemaVersion) || 'legacy-object',
        exportedAt: normalizeText(obj.exportedAt),
    };
};

export const analyzeBackupImport = (
    records: unknown[],
    existingRecords: WorkerRecord[],
    options: {
        fileName?: string;
        fileSize?: number;
        schemaVersion?: string;
        today?: Date;
    } = {},
): BackupImportAnalysis => {
    const missingFieldCounts: Record<string, number> = {};
    const typeIssueCounts: Record<string, number> = {};
    const sampleIssues: string[] = [];
    const objectRecords = records.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    const validRecords: WorkerRecord[] = [];
    let problematicRecordCount = 0;

    objectRecords.forEach((item, index) => {
        const missingFields: string[] = [];
        const typeFields: string[] = [];

        REQUIRED_STRING_FIELDS.forEach((field) => {
            if (typeof item[field] !== 'string' || !String(item[field]).trim()) {
                missingFields.push(field);
                addCount(missingFieldCounts, field);
            }
        });
        REQUIRED_ARRAY_FIELDS.forEach((field) => {
            if (!Array.isArray(item[field])) {
                typeFields.push(`${field}(array)`);
                addCount(typeIssueCounts, `${field}(array)`);
            }
        });

        const score = item.safetyScore;
        if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
            typeFields.push('safetyScore(0-100 number)');
            addCount(typeIssueCounts, 'safetyScore(0-100 number)');
        }

        if (missingFields.length > 0 || typeFields.length > 0) {
            problematicRecordCount += 1;
            if (sampleIssues.length < 8) {
                sampleIssues.push(`#${index + 1}: 누락[${missingFields.join(', ') || '-'}], 타입[${typeFields.join(', ') || '-'}]`);
            }
            return;
        }
        validRecords.push(item as unknown as WorkerRecord);
    });

    const invalidObjectCount = records.length - objectRecords.length;
    const ids = validRecords.map((record) => normalizeText(record.id));
    const evidenceHashes = validRecords.map((record) => normalizeText(record.evidenceHash)).filter(Boolean);
    const duplicateIdCount = countDuplicates(ids);
    const duplicateEvidenceCount = countDuplicates(evidenceHashes);
    const workerDateCounts = new Map<string, number>();
    validRecords.forEach((record) => {
        const workerKey = getBackupWorkerKey(record);
        const dateKey = toLocalDateKey(record.date);
        if (!workerKey || !dateKey) return;
        const key = `${workerKey}|${dateKey}`;
        workerDateCounts.set(key, (workerDateCounts.get(key) || 0) + 1);
    });
    const workerDateCollisionSizes = Array.from(workerDateCounts.values()).filter((count) => count > 1);
    const workerDateCollisionCount = workerDateCollisionSizes
        .reduce((sum, count) => sum + count - 1, 0);
    const workerDateCollisionGroups = workerDateCollisionSizes.length;
    const maxWorkerDateCollisionSize = Math.max(0, ...workerDateCollisionSizes);
    const identityCollisionBlocked = maxWorkerDateCollisionSize >= 5;

    const existingIds = new Set(existingRecords.map((record) => normalizeText(record.id)).filter(Boolean));
    const existingEvidenceHashes = new Set(existingRecords.map((record) => normalizeText(record.evidenceHash)).filter(Boolean));
    const existingIdentityKeys = new Set(existingRecords.map(getBackupWorkerKey));
    const uniqueImportIds = new Set(ids);
    const uniqueImportIdentityKeys = new Set(validRecords.map(getBackupWorkerKey));
    const existingIdCollisionCount = Array.from(uniqueImportIds).filter((id) => existingIds.has(id)).length;
    const existingEvidenceCollisionCount = new Set(
        evidenceHashes.filter((hash) => existingEvidenceHashes.has(hash)),
    ).size;
    const existingIdentityOverlapCount = Array.from(uniqueImportIdentityKeys)
        .filter((key) => existingIdentityKeys.has(key))
        .length;
    const newRecordCount = Array.from(uniqueImportIds).filter((id) => !existingIds.has(id)).length;
    const projectedTotalRecords = existingRecords.length + newRecordCount;
    const fileSize = Number(options.fileSize || 0);
    const largeFileWarning = fileSize >= BACKUP_LARGE_FILE_WARNING_BYTES;
    const hardFileLimitExceeded = fileSize >= BACKUP_HARD_FILE_LIMIT_BYTES;
    const dateStats = getDateStats(validRecords, options.today || new Date());
    const warnings: string[] = [];

    if (problematicRecordCount + invalidObjectCount > 0) {
        warnings.push(`필수 필드 검증에서 제외될 항목 ${problematicRecordCount + invalidObjectCount}건`);
    }
    if (duplicateIdCount > 0) warnings.push(`백업 내부 중복 ID ${duplicateIdCount}건`);
    if (duplicateEvidenceCount > 0) warnings.push(`백업 내부 동일 증빙 해시 ${duplicateEvidenceCount}건`);
    if (workerDateCollisionCount > 0) {
        warnings.push(`동일 근로자·평가일 중복 ${workerDateCollisionCount}건 (${workerDateCollisionGroups}개 그룹, 최대 ${maxWorkerDateCollisionSize}건)`);
    }
    if (identityCollisionBlocked) {
        warnings.push('동일 근로자 식별자와 평가일에 5건 이상이 연결되어 대량 오병합 가능성 때문에 복원을 차단합니다.');
    }
    if (existingIdCollisionCount > 0) warnings.push(`기존 기록을 같은 ID로 갱신 ${existingIdCollisionCount}건`);
    if (existingEvidenceCollisionCount > 0) warnings.push(`기존 저장소와 동일 증빙 해시 ${existingEvidenceCollisionCount}건`);
    if (dateStats.invalidDateCount > 0) warnings.push(`날짜 해석 실패 ${dateStats.invalidDateCount}건`);
    if (dateStats.futureDateCount > 0) warnings.push(`미래일자 ${dateStats.futureDateCount}건`);
    if (dateStats.singleDateConcentration) {
        warnings.push(`유효 기록이 ${dateStats.dominantDate} 하루에 100% 집중되어 이 파일 단독으로는 다월 추적을 입증할 수 없음`);
    } else if (dateStats.dominantDateRate >= 80 && validRecords.length >= 20) {
        warnings.push(`최다 일자 ${dateStats.dominantDate}에 ${dateStats.dominantDateRate}% 집중`);
    }
    if (largeFileWarning) warnings.push(`대용량 파일 ${formatBytes(fileSize)}: 복원 중 브라우저 메모리 사용량 증가 가능`);
    if (hardFileLimitExceeded) warnings.push(`브라우저 안전 한도 ${formatBytes(BACKUP_HARD_FILE_LIMIT_BYTES)} 초과`);

    const blocked = validRecords.length === 0
        || duplicateIdCount > 0
        || hardFileLimitExceeded
        || dateStats.invalidDateCount > 0
        || dateStats.futureDateCount > 0
        || identityCollisionBlocked;
    const schemaVersion = options.schemaVersion || 'unknown';
    const dateRange = dateStats.minDate
        ? dateStats.minDate === dateStats.maxDate
            ? dateStats.minDate
            : `${dateStats.minDate} ~ ${dateStats.maxDate}`
        : '확인 불가';
    const summary = [
        `원본 ${records.length}건`,
        `검증 통과 ${validRecords.length}건`,
        `제외 ${problematicRecordCount + invalidObjectCount}건`,
        `현재 ${existingRecords.length}건 → 예상 ${projectedTotalRecords}건`,
    ].join(' · ');
    const details = [
        `[파일] ${options.fileName || '이름 없음'} / ${formatBytes(fileSize)} / ${schemaVersion}`,
        `[레코드] 원본 ${records.length} / 객체형 ${objectRecords.length} / 검증 통과 ${validRecords.length} / 제외 ${problematicRecordCount + invalidObjectCount}`,
        `[합산 결과] 신규 ID ${newRecordCount} / 기존 ID 갱신 ${existingIdCollisionCount} / 예상 총계 ${projectedTotalRecords}`,
        `[증빙 중복] 백업 내부 ${duplicateEvidenceCount} / 기존 저장소와 동일 ${existingEvidenceCollisionCount}`,
        `[식별 충돌] 동일 근로자·평가일 초과 ${workerDateCollisionCount} / 충돌 그룹 ${workerDateCollisionGroups} / 최대 묶음 ${maxWorkerDateCollisionSize}`,
        `[근로자 연결] 기존 관리 단위와 이어지는 식별키 ${existingIdentityOverlapCount}`,
        `[기간] ${dateRange} / 일자 ${dateStats.distinctDateCount}개 / 월 ${dateStats.distinctMonthCount}개`,
        `[최다 일자] ${dateStats.dominantDate || '-'} ${dateStats.dominantDateCount}건 (${dateStats.dominantDateRate}%)`,
        `[날짜 품질] 해석 실패 ${dateStats.invalidDateCount} / 미래일자 ${dateStats.futureDateCount}`,
        '',
        '[누락 필드 TOP]',
        ...(Object.keys(missingFieldCounts).length
            ? Object.entries(missingFieldCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => `- ${key}: ${count}`)
            : ['- 없음']),
        '',
        '[타입 불일치 TOP]',
        ...(Object.keys(typeIssueCounts).length
            ? Object.entries(typeIssueCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => `- ${key}: ${count}`)
            : ['- 없음']),
        '',
        '[주의 신호]',
        ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- 없음']),
        ...(sampleIssues.length ? ['', '[제외 샘플]', ...sampleIssues.map((issue) => `- ${issue}`)] : []),
    ].join('\n');
    const confirmationText = [
        '백업 사전검증이 완료되었습니다.',
        '',
        `- 현재 저장 기록: ${existingRecords.length}건`,
        `- 가져올 검증 통과 기록: ${validRecords.length}건`,
        `- 신규 ID: ${newRecordCount}건`,
        `- 같은 ID 갱신: ${existingIdCollisionCount}건`,
        `- 복원 후 예상 총계: ${projectedTotalRecords}건`,
        `- 데이터 기간: ${dateRange} (${dateStats.distinctMonthCount}개월)`,
        ...(warnings.length ? ['', '주의:', ...warnings.map((warning) => `- ${warning}`)] : []),
        '',
        '이 작업은 기존 기록에 합산합니다. 계속하시겠습니까?',
    ].join('\n');

    return {
        rawRecordCount: records.length,
        objectRecordCount: objectRecords.length,
        validRecords,
        invalidObjectCount,
        problematicRecordCount,
        missingFieldCounts,
        typeIssueCounts,
        sampleIssues,
        duplicateIdCount,
        duplicateEvidenceCount,
        workerDateCollisionCount,
        workerDateCollisionGroups,
        maxWorkerDateCollisionSize,
        identityCollisionBlocked,
        existingIdCollisionCount,
        existingEvidenceCollisionCount,
        existingIdentityOverlapCount,
        newRecordCount,
        projectedTotalRecords,
        ...dateStats,
        largeFileWarning,
        hardFileLimitExceeded,
        blocked,
        warnings,
        summary,
        details,
        confirmationText,
    };
};

export const createBackupEnvelope = (
    records: WorkerRecord[],
    now: Date = new Date(),
): PsiBackupEnvelope => {
    const readiness = analyzeWorkerEvidenceReadiness(records, now);
    const dateStats = getDateStats(records, now);
    const warnings: string[] = [];
    if (dateStats.singleDateConcentration) {
        warnings.push(`전체 기록이 ${dateStats.dominantDate} 하루에 집중되어 이 백업 단독으로는 다월 추적을 입증할 수 없습니다.`);
    }
    if (dateStats.invalidDateCount > 0) warnings.push(`날짜 해석 실패 ${dateStats.invalidDateCount}건`);
    if (dateStats.futureDateCount > 0) warnings.push(`미래일자 ${dateStats.futureDateCount}건`);

    return {
        schemaVersion: PSI_BACKUP_SCHEMA_VERSION,
        product: 'NEW-PSI',
        exportedAt: now.toISOString(),
        scope: 'full-browser-snapshot',
        manifest: {
            recordCount: records.length,
            workerGroups: readiness.workerGroups,
            repeatedWorkerGroups: readiness.repeatedWorkerGroups,
            multiMonthWorkerGroups: readiness.multiMonthWorkerGroups,
            maxMonthsPerWorker: readiness.maxMonthsPerWorker,
            minDate: dateStats.minDate,
            maxDate: dateStats.maxDate,
            distinctDateCount: dateStats.distinctDateCount,
            distinctMonthCount: dateStats.distinctMonthCount,
            lowScoreRecords: readiness.lowScoreRecords,
            imageCoverageRate: readiness.imageCoverageRate,
            handwrittenCoverageRate: readiness.handwrittenCoverageRate,
            aiInsightCoverageRate: readiness.aiInsightCoverageRate,
            nativeGuidanceCoverageRate: readiness.nativeGuidanceCoverageRate,
            identityBasis: '공종 + 한글 관리명 + 국적, 보조 식별자 UUID/사번/QR',
            warnings,
        },
        records,
    };
};
