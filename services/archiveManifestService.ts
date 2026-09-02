import type {
    MonthlyArchiveManifest,
    WorkerMonthlyContinuitySummary,
} from '../utils/monthlyArchive';
import { postAdminJson } from '../utils/adminApiClient';

export type MonthlyArchiveReceipt = {
    archiveId: string;
    periodMonth: string;
    generation: number;
    contentRootHash: string;
    workerSummaryCount: number;
    continuityCurrent: boolean;
    receivedAt: string;
};

export type StoredMonthlyArchiveManifest = MonthlyArchiveManifest & {
    byteSize?: number;
    verifiedAt: string;
    receivedAt: string;
};

type RegisterableMonthlyArchiveManifest = MonthlyArchiveManifest & {
    byteSize?: number;
    verifiedAt: string;
};

// Fixed-field summaries only. Full archives stay on the PC regardless of whether
// a server receipt can be registered. Both ceilings apply to one atomic receipt.
export const MONTHLY_ARCHIVE_RECEIPT_LIMITS = {
    maxRequestBytes: 2 * 1024 * 1024,
    maxWorkerSummaries: 5_000,
} as const;

type ArchiveManifestApiResponse<T> = {
    ok: true;
    action: 'register' | 'list' | 'health';
    data: T;
};

const toRegisterManifestPayload = (manifest: RegisterableMonthlyArchiveManifest) => ({
    schemaVersion: manifest.schemaVersion,
    archiveId: manifest.archiveId,
    periodMonth: manifest.periodMonth,
    generation: manifest.generation,
    createdAt: manifest.createdAt,
    recordCount: manifest.recordCount,
    workerCount: manifest.workerCount,
    portableWorkerCount: manifest.portableWorkerCount,
    unresolvedWorkerCount: manifest.unresolvedWorkerCount,
    minDate: manifest.minDate,
    maxDate: manifest.maxDate,
    contentRootHash: manifest.contentRootHash,
    ...(Number.isSafeInteger(manifest.byteSize) && Number(manifest.byteSize) > 0
        ? { byteSize: Number(manifest.byteSize) }
        : {}),
    // This function is intentionally called only after the local archive file was
    // read back and hash-verified. The timestamp marks that explicit registration.
    verifiedAt: manifest.verifiedAt,
});

const toWorkerSummaryPayload = (summary: WorkerMonthlyContinuitySummary) => ({
    workerUuid: summary.workerUuid,
    assessmentCount: summary.assessmentCount,
    firstAssessmentDate: summary.firstAssessmentDate,
    lastAssessmentDate: summary.lastAssessmentDate,
    averageScore: summary.averageScore,
    minimumScore: summary.minimumScore,
    latestScore: summary.latestScore,
    latestSafetyLevel: summary.latestSafetyLevel,
    attentionCount: summary.attentionCount,
    approvedCount: summary.approvedCount,
});

/**
 * Register a tiny server receipt only after the PC archive has been read back and
 * verified. The outbound payload is rebuilt from a fixed allowlist so full risk
 * records, OCR text, images and worker PII cannot hitchhike on this request.
 */
export const registerMonthlyArchiveReceipt = async (
    manifest: RegisterableMonthlyArchiveManifest,
    workerSummaries: WorkerMonthlyContinuitySummary[],
): Promise<MonthlyArchiveReceipt> => {
    if (!manifest.verifiedAt || !Number.isFinite(Date.parse(manifest.verifiedAt))) {
        throw new Error('PC 백업 파일을 다시 읽어 검증한 후에만 서버 영수증을 등록할 수 있습니다.');
    }
    if (workerSummaries.length > MONTHLY_ARCHIVE_RECEIPT_LIMITS.maxWorkerSummaries) {
        throw new Error('서버 영수증 등록은 최대 5,000명까지입니다. PC 백업과 로컬 검증은 그대로 유지됩니다.');
    }
    const body = {
        action: 'register',
        payload: {
            manifest: toRegisterManifestPayload(manifest),
            workerSummaries: workerSummaries.map(toWorkerSummaryPayload),
        },
    };
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MONTHLY_ARCHIVE_RECEIPT_LIMITS.maxRequestBytes) {
        throw new Error('서버 영수증 요약 요청이 2 MiB를 초과하여 등록을 보류했습니다. PC 백업과 로컬 검증은 그대로 유지됩니다.');
    }
    const response = await postAdminJson<ArchiveManifestApiResponse<{ receipt: MonthlyArchiveReceipt }>>(
        '/api/admin/archive-manifest',
        body,
        { fallbackMessage: '월별 백업 검증 영수증 등록에 실패했습니다.' },
    );
    return response.data.receipt;
};

export const listMonthlyArchiveReceipts = async (options: {
    periodMonth?: string;
    limit?: number;
} = {}): Promise<StoredMonthlyArchiveManifest[]> => {
    const response = await postAdminJson<ArchiveManifestApiResponse<{
        manifests: StoredMonthlyArchiveManifest[];
    }>>(
        '/api/admin/archive-manifest',
        {
            action: 'list',
            payload: {
                ...(options.periodMonth ? { periodMonth: options.periodMonth } : {}),
                ...(options.limit === undefined ? {} : { limit: options.limit }),
            },
        },
        { fallbackMessage: '월별 백업 검증 영수증 조회에 실패했습니다.' },
    );
    return response.data.manifests;
};

export const checkMonthlyArchiveReceiptHealth = async (): Promise<{
    available: boolean;
    storagePolicy: 'verified-manifest-and-fixed-worker-summary-only';
    receiptCount: number;
    limits: typeof MONTHLY_ARCHIVE_RECEIPT_LIMITS;
}> => {
    const response = await postAdminJson<ArchiveManifestApiResponse<{
        available: boolean;
        storagePolicy: 'verified-manifest-and-fixed-worker-summary-only';
        receiptCount: number;
        limits: typeof MONTHLY_ARCHIVE_RECEIPT_LIMITS;
    }>>(
        '/api/admin/archive-manifest',
        { action: 'health', payload: {} },
        { fallbackMessage: '월별 백업 검증 영수증 저장소 상태 확인에 실패했습니다.' },
    );
    return response.data;
};
