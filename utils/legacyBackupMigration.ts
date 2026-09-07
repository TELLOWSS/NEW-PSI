/** Local, loss-aware compatibility migration. This module never calls OCR or stores data. */
export const LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION = 'psi-legacy-migration/v1' as const;
export const LEGACY_BACKUP_RECORD_ID_PREFIX = 'legacy-sha256-';

export interface LegacyOriginalEvaluation {
    safetyScore: unknown;
    safetyLevel: unknown;
    integrityScore?: unknown;
    competencyProfile?: unknown;
    selfAssessedRiskLevel?: unknown;
    isValid?: unknown;
}

export interface LegacyBackupProvenance {
    schemaVersion: typeof LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION;
    /** Document/version fingerprint, NOT a worker identity or an approval signature. */
    sourceRecordHash: string;
    imageSha256?: string;
    generatedRecordId: boolean;
    originalEvaluation: LegacyOriginalEvaluation;
}

export type LegacyMigratedRecord = Record<string, unknown> & { legacyBackup: LegacyBackupProvenance };

export type LegacyMigrationIssueCode =
    | 'invalid-image' | 'unsupported-image' | 'image-mime-mismatch'
    | 'conflicting-images' | 'invalid-provenance' | 'invalid-source-data' | 'unsupported-evaluation';

export interface LegacyMigrationIssue {
    /** One-based source position, used for diagnostics only, never for identity. */
    recordIndex: number;
    code: LegacyMigrationIssueCode;
    message: string;
}

export interface LegacyMigrationReport {
    inputRecordCount: number;
    migratedRecordCount: number;
    generatedIdCount: number;
    movedImageCount: number;
    unchangedRecordCount: number;
    quarantinedRecordCount: number;
    issues: LegacyMigrationIssue[];
}

export interface LegacyMigrationResult {
    records: unknown[];
    report: LegacyMigrationReport;
    /** Original references retained so callers can stop safely; never silently discard these. */
    quarantined: Array<LegacyMigrationIssue & { record: unknown }>;
}

export class LegacyBackupMigrationError extends Error {
    constructor(public readonly code: LegacyMigrationIssueCode, message: string) {
        super(message);
        this.name = 'LegacyBackupMigrationError';
    }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const owns = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);
const validId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export const isLegacyMigratedRecord = (value: unknown): value is LegacyMigratedRecord => {
    if (!isObject(value) || !validId(value.id) || !isObject(value.legacyBackup)) return false;
    const provenance = value.legacyBackup;
    if (provenance.schemaVersion !== LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION
        || typeof provenance.sourceRecordHash !== 'string' || !HASH_PATTERN.test(provenance.sourceRecordHash)
        || typeof provenance.generatedRecordId !== 'boolean'
        || !isObject(provenance.originalEvaluation)
        || !owns(provenance.originalEvaluation, 'safetyScore')
        || !owns(provenance.originalEvaluation, 'safetyLevel')) return false;
    if (provenance.imageSha256 !== undefined
        && (typeof provenance.imageSha256 !== 'string' || !HASH_PATTERN.test(provenance.imageSha256))) return false;
    return !provenance.generatedRecordId || value.id === `${LEGACY_BACKUP_RECORD_ID_PREFIX}${provenance.sourceRecordHash}`;
};

/** Preserve the imported assessment only until the user explicitly changes that assessment. */
export const shouldPreserveLegacyEvaluation = (value: unknown): value is LegacyMigratedRecord =>
    isLegacyMigratedRecord(value)
    && value.safetyScore === value.legacyBackup.originalEvaluation.safetyScore
    && value.safetyLevel === value.legacyBackup.originalEvaluation.safetyLevel;

const sha256 = async (bytes: Uint8Array): Promise<string> => {
    if (!globalThis.crypto?.subtle) {
        // Infrastructure failure must stop the operation, not turn every source entry into a rejection.
        throw new Error('안전한 백업 변환에 필요한 SHA-256 기능을 사용할 수 없습니다. HTTPS 환경에서 다시 시도해 주세요.');
    }
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
};

const normalizeMime = (value: unknown): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') throw new LegacyBackupMigrationError('invalid-image', '이미지 MIME 형식이 문자열이 아닙니다.');
    const mime = value.trim().toLowerCase();
    return mime === 'image/jpg' ? 'image/jpeg' : mime;
};

/**
 * Checks canonical Base64 plus JPEG/PNG container signatures and hashes decoded bytes.
 * This is a container check, not an OCR/content-quality check or a full image decoder.
 */
export const inspectLegacyBackupImage = async (value: unknown, declaredMimeType?: unknown): Promise<{
    dataUri: string;
    mimeType: 'image/jpeg' | 'image/png';
    sha256: string;
}> => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new LegacyBackupMigrationError('invalid-image', '구형 이미지 항목이 비어 있거나 문자열이 아닙니다.');
    }
    let payload = value.trim();
    let embeddedMime: string | undefined;
    if (/^data:/i.test(payload)) {
        const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(payload);
        if (!match) throw new LegacyBackupMigrationError('invalid-image', '이미지 data URI 형식을 확인할 수 없습니다.');
        embeddedMime = normalizeMime(match[1]);
        payload = match[2];
    }
    payload = payload.replace(/[\t\n\r ]/g, '');
    if (!payload.length || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
        throw new LegacyBackupMigrationError('invalid-image', '이미지 Base64 내용이 올바르지 않습니다.');
    }
    let binary: string;
    try {
        binary = atob(payload);
        if (btoa(binary) !== payload) throw new Error('non-canonical-base64');
    } catch {
        throw new LegacyBackupMigrationError('invalid-image', '이미지 Base64 내용을 안전하게 해독할 수 없습니다.');
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    let mimeType: 'image/jpeg' | 'image/png';
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
        mimeType = 'image/jpeg';
    } else {
        const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        const trailer = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
        if (bytes.length < 45 || !header.every((byte, index) => bytes[index] === byte)
            || !trailer.every((byte, index) => bytes[bytes.length - trailer.length + index] === byte)) {
            throw new LegacyBackupMigrationError('unsupported-image', 'JPEG/PNG 이미지의 시작·끝 형식을 확인할 수 없습니다. 원본 확인이 필요합니다.');
        }
        mimeType = 'image/png';
    }
    const declared = normalizeMime(declaredMimeType);
    if ((declared && declared !== mimeType) || (embeddedMime && embeddedMime !== mimeType)) {
        throw new LegacyBackupMigrationError('image-mime-mismatch', '이미지의 선언된 형식과 실제 파일 형식이 다릅니다.');
    }
    return { dataUri: `data:${mimeType};base64,${payload}`, mimeType, sha256: await sha256(bytes) };
};

// Deliberately narrow: arbitrary JSON rows and modern records are not "repaired" by defaults.
const isRecognizableLegacyRecord = (record: Record<string, unknown>): boolean =>
    Array.isArray(record.handwrittenAnswers)
    && typeof record.fullText === 'string'
    && (typeof record.safetyScore === 'number' || typeof record.safetyLevel === 'string')
    && ['name', 'jobField', 'date', 'nationality'].some((key) => typeof record[key] === 'string');

/** Sorted, lossless JSON canonicalization; non-JSON/cyclic values fail rather than being coerced. */
const canonicalize = (value: unknown, ancestors = new Set<object>()): string => {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value !== 'object' || value === null || ancestors.has(value)) {
        throw new LegacyBackupMigrationError('invalid-source-data', '원본에 JSON으로 보존할 수 없는 값이 있습니다.');
    }
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        throw new LegacyBackupMigrationError('invalid-source-data', '원본에 일반 JSON 객체가 아닌 값이 있습니다.');
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry, ancestors)).join(',')}]`;
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`).join(',')}}`;
    } finally {
        ancestors.delete(value);
    }
};

const evaluationSnapshot = (record: Record<string, unknown>): LegacyOriginalEvaluation => {
    // Null in the snapshot documents an absent source field; the source field itself is NOT filled.
    const snapshot: LegacyOriginalEvaluation = {
        safetyScore: owns(record, 'safetyScore') ? record.safetyScore : null,
        safetyLevel: owns(record, 'safetyLevel') ? record.safetyLevel : null,
    };
    for (const field of ['integrityScore', 'competencyProfile', 'selfAssessedRiskLevel', 'isValid'] as const) {
        if (owns(record, field)) snapshot[field] = record[field];
    }
    // A small deep copy prevents later edits to nested competency values from changing the snapshot.
    return JSON.parse(JSON.stringify(snapshot)) as LegacyOriginalEvaluation;
};

export const migrateLegacyBackupRecords = async (
    inputRecords: unknown[],
    options: { onProgress?: (completed: number, total: number) => void } = {},
): Promise<LegacyMigrationResult> => {
    const records: unknown[] = [];
    const quarantined: LegacyMigrationResult['quarantined'] = [];
    const report: LegacyMigrationReport = {
        inputRecordCount: inputRecords.length, migratedRecordCount: 0, generatedIdCount: 0,
        movedImageCount: 0, unchangedRecordCount: 0, quarantinedRecordCount: 0, issues: [],
    };
    for (let index = 0; index < inputRecords.length; index += 1) {
        const source = inputRecords[index];
        try {
            const imageAlias = isObject(source) && owns(source, 'imageBase64');
            const missingId = isObject(source) && (source.id === undefined || source.id === null
                || (typeof source.id === 'string' && !source.id.trim()));
            if (isObject(source) && isObject(source.legacyBackup)
                && source.legacyBackup.schemaVersion === LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION) {
                if (!isLegacyMigratedRecord(source) || imageAlias) {
                    throw new LegacyBackupMigrationError('invalid-provenance', '구형 백업 변환 출처 정보가 일치하지 않습니다. 원본과 대조해 주세요.');
                }
                records.push(source);
                report.unchangedRecordCount += 1;
            } else if (!isObject(source) || !isRecognizableLegacyRecord(source)) {
                records.push(source);
                report.unchangedRecordCount += 1;
            } else if (owns(source, 'legacyBackup') && (missingId || imageAlias
                || (isObject(source.legacyBackup) && source.legacyBackup.schemaVersion === LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION))) {
                if (!isLegacyMigratedRecord(source) || imageAlias) {
                    throw new LegacyBackupMigrationError('invalid-provenance', '구형 백업 변환 출처 정보가 일치하지 않습니다. 원본과 대조해 주세요.');
                }
                // A later manual correction is legitimate: never reset it from the original snapshot.
                records.push(source);
                report.unchangedRecordCount += 1;
            } else if (!missingId && !imageAlias) {
                records.push(source);
                report.unchangedRecordCount += 1;
            } else {
                if (typeof source.safetyLevel === 'string' && source.safetyLevel.trim()
                    && !['초급', '중급', '고급'].includes(source.safetyLevel)) {
                    throw new LegacyBackupMigrationError('unsupported-evaluation', '현재 등급 체계와 다른 원본 등급입니다. 초급으로 바꾸지 않고 수동 확인을 요청합니다.');
                }
                let image: Awaited<ReturnType<typeof inspectLegacyBackupImage>> | undefined;
                if (imageAlias) image = await inspectLegacyBackupImage(source.imageBase64, source.mimeType);
                if (source.originalImage !== undefined && source.originalImage !== null && source.originalImage !== '') {
                    const currentImage = await inspectLegacyBackupImage(source.originalImage);
                    if (image && image.sha256 !== currentImage.sha256) {
                        throw new LegacyBackupMigrationError('conflicting-images', '구형 이미지와 현재 이미지 항목이 서로 다릅니다. 어느 쪽도 자동 삭제하지 않습니다.');
                    }
                    image = currentImage;
                }
                const metadata = { ...source };
                delete metadata.id;
                delete metadata.imageBase64;
                delete metadata.originalImage;
                // Import location, time and source position are intentionally absent from the hash.
                const canonicalSource = canonicalize({ metadata, imageSha256: image?.sha256 ?? null });
                const sourceRecordHash = await sha256(new TextEncoder().encode(canonicalSource));
                const provenance: LegacyBackupProvenance = {
                    schemaVersion: LEGACY_BACKUP_MIGRATION_SCHEMA_VERSION,
                    sourceRecordHash,
                    ...(image ? { imageSha256: image.sha256 } : {}),
                    generatedRecordId: missingId,
                    originalEvaluation: evaluationSnapshot(source),
                };
                const migrated: Record<string, unknown> = {
                    ...source,
                    ...(missingId ? { id: `${LEGACY_BACKUP_RECORD_ID_PREFIX}${sourceRecordHash}` } : {}),
                    ...(image ? { originalImage: image.dataUri } : {}),
                    legacyBackup: provenance,
                };
                // MOVE, do not duplicate a potentially hundreds-of-MB legacy image field.
                if (imageAlias) delete migrated.imageBase64;
                records.push(migrated);
                report.migratedRecordCount += 1;
                if (missingId) report.generatedIdCount += 1;
                if (imageAlias) report.movedImageCount += 1;
            }
        } catch (error) {
            if (!(error instanceof LegacyBackupMigrationError)) throw error;
            const issue: LegacyMigrationIssue = { recordIndex: index + 1, code: error.code, message: error.message };
            report.issues.push(issue);
            quarantined.push({ ...issue, record: source });
            report.quarantinedRecordCount += 1;
        }
        options.onProgress?.(index + 1, inputRecords.length);
    }
    return { records, report, quarantined };
};
