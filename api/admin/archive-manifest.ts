import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { createSupabaseServerClient } from '../../lib/server/supabaseServer.js';

export type ArchiveManifestAction = 'register' | 'list' | 'health';

export type ArchiveScope = {
    organizationId: string;
    siteId: string;
};

type SupabaseErrorLike = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

type NormalizedManifest = {
    schemaVersion: 'psi-monthly-archive/v3';
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
    byteSize: number | null;
    verifiedAt: string;
};

type NormalizedWorkerSummary = {
    workerUuid: string;
    assessmentCount: number;
    firstAssessmentDate: string;
    lastAssessmentDate: string;
    averageScore: number;
    minimumScore: number;
    latestScore: number;
    latestSafetyLevel: '초급' | '중급' | '고급';
    attentionCount: number;
    approvedCount: number;
};

// Summary-only requests: never increase this limit to upload original archives.
export const MAX_ARCHIVE_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_WORKER_SUMMARIES = 5_000;
const ARCHIVE_SCHEMA_VERSION = 'psi-monthly-archive/v3';
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const SAFE_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u;
const PORTABLE_WORKER_ID_PATTERN = /^(?:WP-|WU-)[A-Z0-9._:-]{1,92}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set<ArchiveManifestAction>(['register', 'list', 'health']);

const BODY_KEYS = new Set(['action', 'payload']);
const REGISTER_PAYLOAD_KEYS = new Set(['manifest', 'workerSummaries']);
const LIST_PAYLOAD_KEYS = new Set(['periodMonth', 'limit']);
const MANIFEST_KEYS = new Set([
    'schemaVersion',
    'archiveId',
    'periodMonth',
    'generation',
    'createdAt',
    'recordCount',
    'workerCount',
    'portableWorkerCount',
    'unresolvedWorkerCount',
    'minDate',
    'maxDate',
    'contentRootHash',
    'byteSize',
    'verifiedAt',
]);
const WORKER_SUMMARY_KEYS = new Set([
    'workerUuid',
    'assessmentCount',
    'firstAssessmentDate',
    'lastAssessmentDate',
    'averageScore',
    'minimumScore',
    'latestScore',
    'latestSafetyLevel',
    'attentionCount',
    'approvedCount',
]);
const SENSITIVE_KEYS = new Set([
    'record',
    'records',
    'recordjson',
    'rawrecord',
    'rawrecords',
    'text',
    'fulltext',
    'documenttext',
    'ocrtext',
    'image',
    'images',
    'imagedata',
    'imageurl',
    'base64',
    'name',
    'workername',
    'phone',
    'phonenumber',
    'birth',
    'birthdate',
    'passport',
    'passportnumber',
    'employeeid',
    'qrid',
    'handwrittenanswers',
    'translations',
]);

export class ArchiveManifestHttpError extends Error {
    statusCode: number;
    code: string;

    constructor(message: string, statusCode: number, code: string) {
        super(message);
        this.name = 'ArchiveManifestHttpError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const toObject = (value: unknown, label = '요청 값'): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ArchiveManifestHttpError(`${label} 형식이 올바르지 않습니다.`, 400, 'INVALID_INPUT');
    }
    return value as Record<string, unknown>;
};

const normalizeKey = (value: string): string => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const assertOnlyKeys = (
    value: Record<string, unknown>,
    allowedKeys: Set<string>,
    label: string,
): void => {
    for (const key of Object.keys(value)) {
        if (allowedKeys.has(key)) continue;
        if (SENSITIVE_KEYS.has(normalizeKey(key))) {
            throw new ArchiveManifestHttpError(
                `${label}에는 원문·이미지·개인식별정보를 포함할 수 없습니다.`,
                400,
                'SENSITIVE_FIELD_REJECTED',
            );
        }
        throw new ArchiveManifestHttpError(
            `${label}에 허용되지 않은 필드가 있습니다.`,
            400,
            'UNEXPECTED_FIELD',
        );
    }
};

const normalizeSafeId = (value: unknown, label: string, maxLength = 120): string => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > maxLength || !SAFE_ID_PATTERN.test(normalized)) {
        throw new ArchiveManifestHttpError(`${label} 설정이 올바르지 않습니다.`, 503, 'ARCHIVE_SCOPE_MISSING');
    }
    return normalized;
};

export const resolveArchiveScope = (env: NodeJS.ProcessEnv = process.env): ArchiveScope => ({
    organizationId: normalizeSafeId(env.PSI_ORGANIZATION_ID, 'PSI_ORGANIZATION_ID'),
    siteId: normalizeSafeId(env.PSI_SITE_ID, 'PSI_SITE_ID'),
});

const normalizeMonth = (value: unknown, label = '대상 월'): string => {
    const normalized = String(value || '').trim();
    if (!MONTH_PATTERN.test(normalized)) {
        throw new ArchiveManifestHttpError(`${label}은 YYYY-MM 형식이어야 합니다.`, 400, 'INVALID_INPUT');
    }
    return normalized;
};

const normalizeDate = (value: unknown, label: string): string => {
    const normalized = String(value || '').trim();
    if (!DATE_PATTERN.test(normalized)) {
        throw new ArchiveManifestHttpError(`${label}은 YYYY-MM-DD 형식이어야 합니다.`, 400, 'INVALID_INPUT');
    }
    const [year, month, day] = normalized.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        throw new ArchiveManifestHttpError(`${label}이 실제 달력 날짜와 일치하지 않습니다.`, 400, 'INVALID_INPUT');
    }
    return normalized;
};

const normalizeIsoTimestamp = (value: unknown, label: string): string => {
    const normalized = String(value || '').trim();
    const parsed = new Date(normalized);
    if (!normalized || !Number.isFinite(parsed.getTime())) {
        throw new ArchiveManifestHttpError(`${label} 형식이 올바르지 않습니다.`, 400, 'INVALID_INPUT');
    }
    return parsed.toISOString();
};

const normalizeInteger = (
    value: unknown,
    label: string,
    min: number,
    max: number,
): number => {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        throw new ArchiveManifestHttpError(`${label} 범위가 올바르지 않습니다.`, 400, 'INVALID_INPUT');
    }
    return Number(value);
};

const normalizeManifest = (raw: unknown): NormalizedManifest => {
    const manifest = toObject(raw, '월별 백업 매니페스트');
    assertOnlyKeys(manifest, MANIFEST_KEYS, '월별 백업 매니페스트');

    if (manifest.schemaVersion !== ARCHIVE_SCHEMA_VERSION) {
        throw new ArchiveManifestHttpError('지원하지 않는 월별 백업 형식입니다.', 400, 'INVALID_SCHEMA_VERSION');
    }
    const periodMonth = normalizeMonth(manifest.periodMonth);
    const generation = normalizeInteger(manifest.generation, '백업 세대', 1, 999_999);
    const recordCount = normalizeInteger(manifest.recordCount, '기록 수', 1, 10_000_000);
    const workerCount = normalizeInteger(manifest.workerCount, '근로자 수', 0, recordCount);
    const portableWorkerCount = normalizeInteger(manifest.portableWorkerCount, '연속 추적 근로자 수', 0, workerCount);
    const unresolvedWorkerCount = normalizeInteger(manifest.unresolvedWorkerCount, '식별 대기 근로자 수', 0, workerCount);
    if (portableWorkerCount + unresolvedWorkerCount !== workerCount) {
        throw new ArchiveManifestHttpError('근로자 집계가 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }

    const minDate = normalizeDate(manifest.minDate, '최초 기록일');
    const maxDate = normalizeDate(manifest.maxDate, '최종 기록일');
    if (minDate.slice(0, 7) !== periodMonth || maxDate.slice(0, 7) !== periodMonth || minDate > maxDate) {
        throw new ArchiveManifestHttpError('기록일 범위가 대상 월과 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }

    const contentRootHash = String(manifest.contentRootHash || '').trim().toLowerCase();
    if (!HASH_PATTERN.test(contentRootHash)) {
        throw new ArchiveManifestHttpError('콘텐츠 루트 해시 형식이 올바르지 않습니다.', 400, 'INVALID_INPUT');
    }
    const archiveId = `${periodMonth}-g${String(generation).padStart(3, '0')}-${contentRootHash.slice(0, 16)}`;
    if (manifest.archiveId !== archiveId) {
        throw new ArchiveManifestHttpError('아카이브 ID가 월·세대·해시와 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }
    const createdAt = normalizeIsoTimestamp(manifest.createdAt, '백업 생성 시각');
    const verifiedAt = normalizeIsoTimestamp(manifest.verifiedAt, '백업 검증 시각');
    if (verifiedAt < createdAt) {
        throw new ArchiveManifestHttpError('검증 시각은 백업 생성 시각보다 빠를 수 없습니다.', 400, 'INVALID_INPUT');
    }

    const byteSize = manifest.byteSize === undefined
        ? null
        : normalizeInteger(manifest.byteSize, '백업 파일 크기', 1, Number.MAX_SAFE_INTEGER);

    return {
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        archiveId,
        periodMonth,
        generation,
        // A local filename can contain names, company details or folder paths.
        // It never crosses this boundary; retain only a generated server label.
        fileName: `PSI_${archiveId}.json`,
        createdAt,
        recordCount,
        workerCount,
        portableWorkerCount,
        unresolvedWorkerCount,
        minDate,
        maxDate,
        contentRootHash,
        byteSize,
        verifiedAt,
    };
};

const normalizeWorkerUuid = (value: unknown): string => {
    const normalized = String(value || '').trim().toUpperCase();
    if (
        normalized.startsWith('WN-')
        || (!PORTABLE_WORKER_ID_PATTERN.test(normalized) && !UUID_PATTERN.test(normalized))
    ) {
        throw new ArchiveManifestHttpError('휴대 가능한 근로자 ID 형식이 올바르지 않습니다.', 400, 'INVALID_INPUT');
    }
    return normalized;
};

const normalizeWorkerSummary = (
    raw: unknown,
    manifest: NormalizedManifest,
): NormalizedWorkerSummary => {
    const summary = toObject(raw, '근로자 월별 연속성 요약');
    assertOnlyKeys(summary, WORKER_SUMMARY_KEYS, '근로자 월별 연속성 요약');

    const firstAssessmentDate = normalizeDate(summary.firstAssessmentDate, '최초 평가일');
    const lastAssessmentDate = normalizeDate(summary.lastAssessmentDate, '최종 평가일');
    if (
        firstAssessmentDate.slice(0, 7) !== manifest.periodMonth
        || lastAssessmentDate.slice(0, 7) !== manifest.periodMonth
        || firstAssessmentDate > lastAssessmentDate
        || firstAssessmentDate < manifest.minDate
        || lastAssessmentDate > manifest.maxDate
    ) {
        throw new ArchiveManifestHttpError('근로자 요약 날짜가 대상 월과 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }

    const assessmentCount = normalizeInteger(summary.assessmentCount, '평가 수', 1, manifest.recordCount);
    const latestSafetyLevel = String(summary.latestSafetyLevel || '').trim();
    if (!['초급', '중급', '고급'].includes(latestSafetyLevel)) {
        throw new ArchiveManifestHttpError('최근 안전 수준이 올바르지 않습니다.', 400, 'INVALID_INPUT');
    }

    const averageScore = normalizeInteger(summary.averageScore, '평균 점수', 0, 100);
    const minimumScore = normalizeInteger(summary.minimumScore, '최저 점수', 0, 100);
    const latestScore = normalizeInteger(summary.latestScore, '최근 점수', 0, 100);
    if (minimumScore > averageScore || minimumScore > latestScore) {
        throw new ArchiveManifestHttpError('근로자 점수 집계가 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }
    return {
        workerUuid: normalizeWorkerUuid(summary.workerUuid),
        assessmentCount,
        firstAssessmentDate,
        lastAssessmentDate,
        averageScore,
        minimumScore,
        latestScore,
        latestSafetyLevel: latestSafetyLevel as NormalizedWorkerSummary['latestSafetyLevel'],
        attentionCount: normalizeInteger(summary.attentionCount, '주의 평가 수', 0, assessmentCount),
        approvedCount: normalizeInteger(summary.approvedCount, '승인 평가 수', 0, assessmentCount),
    };
};

const normalizeRegisterPayload = (raw: unknown) => {
    const payload = toObject(raw, '등록 요청');
    assertOnlyKeys(payload, REGISTER_PAYLOAD_KEYS, '등록 요청');
    const manifest = normalizeManifest(payload.manifest);
    if (!Array.isArray(payload.workerSummaries)) {
        throw new ArchiveManifestHttpError('근로자 월별 요약 목록 형식이 올바르지 않습니다.', 400, 'INVALID_INPUT');
    }
    if (payload.workerSummaries.length > MAX_WORKER_SUMMARIES) {
        throw new ArchiveManifestHttpError('월별 영수증은 최대 5,000명의 고정 필드 요약만 등록할 수 있습니다. PC 백업은 유지됩니다.', 413, 'TOO_MANY_WORKER_SUMMARIES');
    }
    const workerSummaries = payload.workerSummaries.map((item) => normalizeWorkerSummary(item, manifest));
    if (workerSummaries.length !== manifest.portableWorkerCount) {
        throw new ArchiveManifestHttpError('휴대 가능 근로자 수와 요약 수가 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }
    if (new Set(workerSummaries.map((item) => item.workerUuid)).size !== workerSummaries.length) {
        throw new ArchiveManifestHttpError('동일한 근로자 ID가 중복되어 있습니다.', 400, 'INVALID_INPUT');
    }
    const summarizedAssessmentCount = workerSummaries.reduce((sum, item) => sum + item.assessmentCount, 0);
    if (
        summarizedAssessmentCount + manifest.unresolvedWorkerCount > manifest.recordCount
        || (manifest.unresolvedWorkerCount === 0 && summarizedAssessmentCount !== manifest.recordCount)
    ) {
        throw new ArchiveManifestHttpError('근로자 평가 집계가 전체 기록 수와 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }
    return { manifest, workerSummaries };
};

const normalizeListPayload = (raw: unknown): { periodMonth?: string; limit: number } => {
    const payload = raw === undefined ? {} : toObject(raw, '목록 요청');
    assertOnlyKeys(payload, LIST_PAYLOAD_KEYS, '목록 요청');
    return {
        periodMonth: payload.periodMonth === undefined ? undefined : normalizeMonth(payload.periodMonth),
        limit: payload.limit === undefined ? 60 : normalizeInteger(payload.limit, '조회 개수', 1, 120),
    };
};

const toRpcManifest = (manifest: NormalizedManifest) => ({
    schema_version: manifest.schemaVersion,
    archive_id: manifest.archiveId,
    period_month: manifest.periodMonth,
    generation: manifest.generation,
    file_name: manifest.fileName,
    archive_created_at: manifest.createdAt,
    record_count: manifest.recordCount,
    worker_count: manifest.workerCount,
    portable_worker_count: manifest.portableWorkerCount,
    unresolved_worker_count: manifest.unresolvedWorkerCount,
    min_date: manifest.minDate,
    max_date: manifest.maxDate,
    content_root_hash: manifest.contentRootHash,
    byte_size: manifest.byteSize,
    verified_at: manifest.verifiedAt,
});

const toRpcWorkerSummary = (summary: NormalizedWorkerSummary) => ({
    worker_uuid: summary.workerUuid,
    assessment_count: summary.assessmentCount,
    first_assessment_date: summary.firstAssessmentDate,
    last_assessment_date: summary.lastAssessmentDate,
    average_score: summary.averageScore,
    minimum_score: summary.minimumScore,
    latest_score: summary.latestScore,
    latest_safety_level: summary.latestSafetyLevel,
    attention_count: summary.attentionCount,
    approved_count: summary.approvedCount,
});

const mapManifestRow = (row: any) => ({
    archiveId: String(row?.archive_id || ''),
    schemaVersion: String(row?.schema_version || ''),
    periodMonth: String(row?.period_month || ''),
    generation: Number(row?.generation || 0),
    recordCount: Number(row?.record_count || 0),
    workerCount: Number(row?.worker_count || 0),
    portableWorkerCount: Number(row?.portable_worker_count || 0),
    unresolvedWorkerCount: Number(row?.unresolved_worker_count || 0),
    minDate: String(row?.min_date || ''),
    maxDate: String(row?.max_date || ''),
    contentRootHash: String(row?.content_root_hash || ''),
    fileName: String(row?.file_name || ''),
    byteSize: row?.byte_size === null || row?.byte_size === undefined ? undefined : Number(row.byte_size),
    createdAt: String(row?.archive_created_at || ''),
    verifiedAt: String(row?.verified_at || ''),
    receivedAt: String(row?.received_at || row?.created_at || ''),
});

const isMissingSchemaError = (error: SupabaseErrorLike | null | undefined): boolean => {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    return (
        code === '42P01'
        || code === '42883'
        || code === 'PGRST202'
        || code === 'PGRST205'
        || ((message.includes('does not exist') || message.includes('schema cache'))
            && (message.includes('risk_archive_manifests') || message.includes('psi_register_monthly_archive')))
    );
};

const throwDatabaseError = (error: SupabaseErrorLike | null | undefined): never => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    if (isMissingSchemaError(error)) {
        throw new ArchiveManifestHttpError(
            '월별 백업 영수증 저장소가 준비되지 않았습니다.',
            503,
            'ARCHIVE_SCHEMA_MISSING',
        );
    }
    if (code === '23505' || message.includes('archive generation conflict')) {
        throw new ArchiveManifestHttpError(
            '같은 월과 세대에 다른 백업 영수증이 이미 존재합니다.',
            409,
            'ARCHIVE_GENERATION_CONFLICT',
        );
    }
    if (['22023', '22P02', '22007', '22008', '23502', '23514', 'P0001'].includes(code)) {
        throw new ArchiveManifestHttpError('월별 백업 영수증 값이 올바르지 않습니다.', 400, 'INVALID_INPUT');
    }
    throw new ArchiveManifestHttpError(
        '월별 백업 영수증 저장소 요청을 처리하지 못했습니다.',
        500,
        'ARCHIVE_DATABASE_ERROR',
    );
};

export const executeArchiveManifestAction = async (
    supabase: any,
    action: ArchiveManifestAction,
    rawPayload: unknown,
    scope: ArchiveScope,
): Promise<unknown> => {
    // Keep the callable execution helper fail-closed too, not just the handler.
    scope = resolveArchiveScope({ PSI_ORGANIZATION_ID: scope?.organizationId, PSI_SITE_ID: scope?.siteId });
    if (!ACTIONS.has(action)) {
        throw new ArchiveManifestHttpError('지원하지 않는 월별 백업 영수증 요청입니다.', 400, 'INVALID_ACTION');
    }
    if (action === 'register') {
        const { manifest, workerSummaries } = normalizeRegisterPayload(rawPayload);
        const result = await supabase.rpc('psi_register_monthly_archive', {
            p_organization_id: scope.organizationId,
            p_site_id: scope.siteId,
            p_manifest: toRpcManifest(manifest),
            p_worker_summaries: workerSummaries.map(toRpcWorkerSummary),
        });
        if (result.error) throwDatabaseError(result.error);
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!row) throwDatabaseError({ message: 'empty archive receipt result' });
        return {
            limits: { maxRequestBytes: MAX_ARCHIVE_REQUEST_BYTES, maxWorkerSummaries: MAX_WORKER_SUMMARIES },
            receipt: {
                archiveId: String(row.archive_id || manifest.archiveId),
                periodMonth: String(row.period_month || manifest.periodMonth),
                generation: Number(row.generation || manifest.generation),
                contentRootHash: String(row.content_root_hash || manifest.contentRootHash),
                workerSummaryCount: Number(row.worker_summary_count ?? workerSummaries.length),
                continuityCurrent: row.continuity_is_current === true,
                receivedAt: String(row.received_at || ''),
            },
        };
    }

    if (action === 'list') {
        const options = normalizeListPayload(rawPayload);
        let query = supabase
            .from('risk_archive_manifests')
            .select('archive_id, schema_version, period_month, generation, record_count, worker_count, portable_worker_count, unresolved_worker_count, min_date, max_date, content_root_hash, file_name, byte_size, archive_created_at, verified_at, received_at')
            .eq('organization_id', scope.organizationId)
            .eq('site_id', scope.siteId)
            .order('period_month', { ascending: false })
            .order('generation', { ascending: false })
            .limit(options.limit);
        if (options.periodMonth) query = query.eq('period_month', options.periodMonth);
        const result = await query;
        if (result.error) throwDatabaseError(result.error);
        return { manifests: (result.data || []).map(mapManifestRow) };
    }

    const payload = rawPayload === undefined ? {} : toObject(rawPayload, '상태 확인 요청');
    assertOnlyKeys(payload, new Set(), '상태 확인 요청');
    const result = await supabase
        .from('risk_archive_manifests')
        .select('archive_id', { count: 'exact', head: true })
        .eq('organization_id', scope.organizationId)
        .eq('site_id', scope.siteId);
    if (result.error) throwDatabaseError(result.error);
    return {
        available: true,
        storagePolicy: 'verified-manifest-and-fixed-worker-summary-only',
        receiptCount: Number(result.count || 0),
        limits: { maxRequestBytes: MAX_ARCHIVE_REQUEST_BYTES, maxWorkerSummaries: MAX_WORKER_SUMMARIES },
    };
};

const parseRequestBody = (rawBody: unknown): Record<string, unknown> => {
    let parsed = rawBody;
    if (typeof rawBody === 'string') {
        try {
            parsed = JSON.parse(rawBody || '{}');
        } catch {
            throw new ArchiveManifestHttpError('요청 본문 형식이 올바르지 않습니다.', 400, 'INVALID_JSON');
        }
    }
    const body = toObject(parsed, '요청 본문');
    assertOnlyKeys(body, BODY_KEYS, '요청 본문');
    return body;
};

const getRequestBodyByteLength = (rawBody: unknown): number => {
    if (typeof rawBody === 'string') return Buffer.byteLength(rawBody, 'utf8');
    try {
        return Buffer.byteLength(JSON.stringify(rawBody ?? {}), 'utf8');
    } catch {
        throw new ArchiveManifestHttpError('요청 본문 형식이 올바르지 않습니다.', 400, 'INVALID_JSON');
    }
};

const assertRequestSize = (req: any): void => {
    const contentLength = Number(req?.headers?.['content-length']);
    if (
        (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_REQUEST_BYTES)
        || getRequestBodyByteLength(req?.body) > MAX_ARCHIVE_REQUEST_BYTES
    ) {
        throw new ArchiveManifestHttpError(
            '월별 백업 영수증 요약 요청은 2 MiB·5,000명 이내여야 합니다. 원본 PC 백업은 유지됩니다.',
            413,
            'PAYLOAD_TOO_LARGE',
        );
    }
};

export default async function handler(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
        req.body = undefined;
        return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' });
    }
    if (!isValidAdminAuthRequest(req)) {
        req.body = undefined;
        return sendUnauthorizedAdminResponse(res);
    }

    let action = '';
    try {
        assertRequestSize(req);
        const body = parseRequestBody(req.body);
        req.body = undefined;
        const requestedAction = typeof body.action === 'string' ? body.action : '';
        if (!ACTIONS.has(requestedAction as ArchiveManifestAction)) {
            throw new ArchiveManifestHttpError('지원하지 않는 월별 백업 영수증 요청입니다.', 400, 'INVALID_ACTION');
        }
        action = requestedAction;

        const scope = resolveArchiveScope();
        const supabase = createSupabaseServerClient({
            includeAdminSecret: false,
            errorMessage: '월별 백업 영수증 서버 연결값이 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.',
        });
        const data = await executeArchiveManifestAction(
            supabase,
            action as ArchiveManifestAction,
            body.payload,
            scope,
        );
        return res.status(200).json({ ok: true, action, data });
    } catch (error: any) {
        req.body = undefined;
        const statusCode = error instanceof ArchiveManifestHttpError ? error.statusCode : 500;
        const code = error instanceof ArchiveManifestHttpError ? error.code : 'ARCHIVE_UNEXPECTED_ERROR';
        const message = error instanceof ArchiveManifestHttpError
            ? error.message
            : '월별 백업 영수증 요청을 처리하지 못했습니다.';
        const logFailure = statusCode >= 500 ? console.error : console.warn;
        logFailure('[archive-manifest] request failed', {
            action: action || 'unknown',
            statusCode,
            code,
        });
        return res.status(statusCode).json({
            ok: false, code, message,
            limits: { maxRequestBytes: MAX_ARCHIVE_REQUEST_BYTES, maxWorkerSummaries: MAX_WORKER_SUMMARIES },
        });
    }
}
