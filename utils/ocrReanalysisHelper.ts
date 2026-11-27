import type { OcrTraceInfo, WorkerRecord } from '../types';
import { OcrGatewayError } from '../services/ocrGatewayService';

const extractMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message?: unknown }).message || '');
    }
    return '';
};

const extractCode = (error: unknown): string => {
    if (error instanceof OcrGatewayError && error.code) {
        return String(error.code).trim().toUpperCase();
    }
    const raw = extractMessage(error).trim();
    const matched = raw.match(/^\[([A-Z0-9_]+)\]/);
    if (matched?.[1]) return matched[1].toUpperCase();
    if (raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('networkerror')) {
        return 'NETWORK_FETCH_FAILED';
    }
    return '';
};

const stripCodePrefix = (message: string): string => (
    String(message || '').replace(/^\[[A-Z0-9_]+\]\s*/, '').trim()
);

/**
 * 상류 AI 서버 일시 장애 또는 일시적인 네트워크 끊김만 1회 안전 재시도한다.
 * 한도 소진(402/429), 인증 오류(401/403), 시간 초과(504), 문서 불일치(422)는 중복 요청을 막기 위해 재시도하지 않는다.
 */
export const isTransientReanalysisError = (error: unknown): boolean => {
    const code = extractCode(error);
    if (code === 'OCR_UPSTREAM_FAILURE' || code === 'OCR_UPSTREAM_NETWORK' || code === 'HTTP_502' || code === 'HTTP_503' || code === 'NETWORK_FETCH_FAILED') {
        return true;
    }
    if (code) return false;
    const lower = extractMessage(error).toLowerCase();
    return lower.includes('failed to fetch') || lower.includes('networkerror');
};

export interface ReanalysisErrorGuidance {
    code: string;
    title: string;
    detail: string;
    fullMessage: string;
    retryable: boolean;
}

export const buildReanalysisErrorMessage = (error: unknown): ReanalysisErrorGuidance => {
    const code = extractCode(error);
    const rawDetail = stripCodePrefix(extractMessage(error));

    let title = '재분석을 완료하지 못했습니다.';
    let detail = rawDetail || '네트워크 상태 또는 원본 이미지를 확인한 뒤 다시 시도해 주세요.';
    let retryable = false;

    switch (code) {
        case 'OCR_PAID_APPROVAL_REQUIRED':
            title = '무료 AI 분석 한도가 소진되었습니다.';
            detail = '유료 전환은 자동 실행되지 않습니다. [OCR 분석] 화면에서 해당 기록의 1회 유료 승인을 진행하거나 한도 초기화 후 다시 시도해 주세요.';
            break;
        case 'OCR_UPSTREAM_FAILURE':
        case 'OCR_UPSTREAM_NETWORK':
        case 'HTTP_502':
        case 'HTTP_503':
        case 'NETWORK_FETCH_FAILED':
            title = 'AI 분석 서버 응답이 일시적으로 불안정합니다.';
            detail = '자동 재시도까지 진행했으나 상류 AI 응답이 완료되지 않았습니다. 원본은 그대로 보존되어 있으니 잠시 후 다시 시도해 주세요.';
            retryable = true;
            break;
        case 'OCR_TIMEOUT':
        case 'HTTP_504':
            title = 'AI 분석 대기 시간(90초)을 초과했습니다.';
            detail = '중복 실행을 막기 위해 요청을 멈췄습니다. 잠시 후 해당 기록만 다시 시도해 주세요.';
            retryable = true;
            break;
        case 'OCR_WRONG_DOCUMENT':
            title = '1안·2안 위험성평가 기록지 양식 확인이 필요합니다.';
            detail = `${rawDetail || '제목 또는 작성 항목이 충분히 인식되지 않았습니다.'}\n해상도가 높거나 양식 제목·표 항목이 잘리지 않은 원본 이미지로 다시 등록해 주세요.`;
            break;
        case 'OCR_QUOTA':
        case 'OCR_PAID_QUOTA':
        case 'OCR_RATE_LIMITED':
        case 'OCR_DAILY_BUDGET_EXCEEDED':
        case 'HTTP_429':
            title = '요청 한도에 도달해 잠시 대기해야 합니다.';
            detail = rawDetail || '잠시 기다렸다가 다시 시도해 주세요.';
            break;
        case 'HTTP_401':
        case 'HTTP_403':
        case 'ADMIN_AUTH_REQUIRED':
            title = '관리자 로그인 확인이 필요합니다.';
            detail = '로그인 유효 시간이 지났습니다. 새로고침 후 다시 로그인한 뒤 재분석을 실행해 주세요.';
            break;
        case 'OPENAI_API_NOT_CONFIGURED':
            title = 'OpenAI 연결키가 설정되어 있지 않습니다.';
            detail = '설정 화면에서 분석 방식을 [자동 추천]으로 변경한 뒤 다시 시도해 주세요.';
            break;
        case 'OCR_MODEL_UNAVAILABLE':
        case 'MISSING_SERVER_GEMINI_FREE_KEY':
        case 'MISSING_SERVER_GEMINI_PAID_KEY':
        case 'OCR_UPSTREAM_AUTH':
            title = '서버 AI 분석 연결 점검이 필요합니다.';
            detail = rawDetail || '관리자에게 서버 AI 키 및 모델 상태를 확인해 달라고 요청해 주세요.';
            break;
        case 'IMAGE_TOO_LARGE':
        case 'INVALID_BASE64':
        case 'UNSUPPORTED_IMAGE_FORMAT':
        case 'IMAGE_DATA_TOO_SHORT':
        case 'PDF_PAGE_LIMIT_EXCEEDED':
        case 'INVALID_PDF':
        case 'OCR_INVALID_ARGUMENT':
            title = '업로드된 원본 이미지 또는 PDF 형식을 확인해 주세요.';
            detail = rawDetail || '3MB 이하의 선명한 JPG·PNG 또는 1페이지 PDF 파일인지 확인해 주세요.';
            break;
        case 'OCR_PARSE_FAILURE':
        case 'OCR_INCOMPLETE_RESPONSE':
            title = 'AI 응답 결과를 해석하지 못했습니다.';
            detail = '사진의 글씨가 흐리거나 응답이 중간에 끊겼습니다. 잠시 후 다시 시도하거나 밝은 환경의 사진으로 등록해 주세요.';
            retryable = true;
            break;
        default:
            break;
    }

    const codeLabel = code ? ` (코드: ${code})` : '';
    const fullMessage = `${title}${codeLabel}\n\n${detail}`;
    return {
        code: code || 'UNKNOWN',
        title,
        detail,
        fullMessage,
        retryable,
    };
};

export const mergeReanalyzedWorkerRecord = (
    previous: WorkerRecord,
    serverRecord: WorkerRecord,
    trace?: OcrTraceInfo,
): WorkerRecord => {
    const isReviewOnlyServerResult = serverRecord.ocrErrorType === 'QUALITY' || serverRecord.ocrErrorType === 'HANDWRITING';
    const hasNewHandwritten = Array.isArray(serverRecord.handwrittenAnswers)
        && serverRecord.handwrittenAnswers.some((answer) => (
            String(answer?.answerText || '').trim().length > 0
            || String(answer?.koreanTranslation || '').trim().length > 0
            || String(answer?.nativeTranslation || '').trim().length > 0
        ));

    return {
        ...previous,
        ...serverRecord,
        id: previous.id,
        worker_uuid: previous.worker_uuid || serverRecord.worker_uuid,
        workerUuid: previous.workerUuid || serverRecord.workerUuid,
        portableWorkerId: previous.portableWorkerId || serverRecord.portableWorkerId,
        employeeId: previous.employeeId || serverRecord.employeeId,
        employeeIdGenerated: previous.employeeId ? previous.employeeIdGenerated : serverRecord.employeeIdGenerated,
        employeeIdScope: previous.employeeId ? previous.employeeIdScope : serverRecord.employeeIdScope,
        qrId: previous.qrId || serverRecord.qrId,
        qrIdGenerated: previous.qrId ? previous.qrIdGenerated : serverRecord.qrIdGenerated,
        originalImage: previous.originalImage,
        profileImage: previous.profileImage,
        date: serverRecord.date || previous.date || new Date().toISOString().split('T')[0],
        filename: previous.filename,
        role: previous.role,
        isTranslator: previous.isTranslator,
        isSignalman: previous.isSignalman,
        handwrittenAnswers: hasNewHandwritten ? serverRecord.handwrittenAnswers : previous.handwrittenAnswers,
        aiInsights_native: String(serverRecord.aiInsights_native || '').trim() || previous.aiInsights_native,
        ocrErrorType: isReviewOnlyServerResult ? serverRecord.ocrErrorType : undefined,
        ocrErrorMessage: isReviewOnlyServerResult ? serverRecord.ocrErrorMessage : undefined,
        ocrFailureCode: isReviewOnlyServerResult ? serverRecord.ocrFailureCode : undefined,
        ocrUnknownSubCategory: undefined,
        secondPassStatus: isReviewOnlyServerResult ? 'NEEDED' : 'DONE',
        workflowState: isReviewOnlyServerResult ? 'manual_review_required' : 'completed',
        riskDecision: isReviewOnlyServerResult ? 'SUPPLEMENTARY_REVIEW' : 'SAFE_TO_PROCEED',
        approvalState: isReviewOnlyServerResult ? 'PENDING' : 'APPROVED',
        ocrTrace: trace ?? serverRecord.ocrTrace ?? previous.ocrTrace,
        auditTrail: [
            ...(previous.auditTrail || []),
            ...(serverRecord.auditTrail || []),
            {
                stage: 'reassessment',
                timestamp: new Date().toISOString(),
                actor: 'manager',
                note: isReviewOnlyServerResult
                    ? `상세 모달 원문 재확인 완료 (관리자 확인 필요: ${serverRecord.ocrErrorMessage || '품질 검토'})`
                    : '상세 모달 원문 재확인 성공 · 기존 오류 상태 초기화',
            },
        ],
    };
};
