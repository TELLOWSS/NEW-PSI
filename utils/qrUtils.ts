
import type { WorkerRecord } from '../types';

export type ReportShareDiagnostics = {
    url: string;
    payloadLength: number;
    urlLength: number;
    qrRisk: 'ok' | 'warning' | 'overflow';
    warning: string | null;
    schemaVersion: number;
};

const WORKFLOW_STATE_TO_CODE: Record<string, string> = {
    uploaded: 'UP',
    ocr_validating: 'OV',
    manual_review_required: 'MR',
    context_ready: 'CR',
    first_pass_analyzing: 'FPA',
    evaluator_review: 'ER',
    awaiting_manager_approval: 'AMA',
    manager_revised: 'MGR',
    second_pass_analyzing: 'SPA',
    completed: 'CP',
};

const CODE_TO_WORKFLOW_STATE = Object.fromEntries(
    Object.entries(WORKFLOW_STATE_TO_CODE).map(([key, value]) => [value, key]),
) as Record<string, string>;

const RISK_DECISION_TO_CODE: Record<string, string> = {
    SAFE_TO_PROCEED: 'STP',
    SUPPLEMENTARY_REVIEW: 'SUR',
    IMMEDIATE_ATTENTION: 'IMA',
    CRITICAL_STOP: 'CSP',
};

const CODE_TO_RISK_DECISION = Object.fromEntries(
    Object.entries(RISK_DECISION_TO_CODE).map(([key, value]) => [value, key]),
) as Record<string, string>;

const APPROVAL_STATE_TO_CODE: Record<string, string> = {
    NOT_REQUIRED: 'NOR',
    REQUIRED: 'REQ',
    PENDING: 'PND',
    APPROVED: 'APV',
    REJECTED: 'REJ',
};

const CODE_TO_APPROVAL_STATE = Object.fromEntries(
    Object.entries(APPROVAL_STATE_TO_CODE).map(([key, value]) => [value, key]),
) as Record<string, string>;

/**
 * [QR 데이터 생성 유틸리티]
 * 
 * 공유 링크(QR) 생성 시 URL 길이 제한(약 2000자)을 넘지 않도록
 * 이미지 데이터는 절대 포함하지 않고 순수 텍스트 데이터만 압축합니다.
 */

// 1단계: 전체 텍스트 데이터 포함 (이미지 제외)
const minifyFull = (record: WorkerRecord) => {
    const safeStr = (val: unknown): string => (typeof val === 'string') ? val : String(val ?? "");
    const safeNum = (val: unknown): number => (typeof val === 'number') ? val : Number(val) || 0;
    const safeArr = (val: unknown): string[] => Array.isArray(val) ? val.filter(v => typeof v === 'string') as string[] : [];
    // 배열 데이터를 | 로 구분하여 압축
    const safeJoin = (arr: unknown[], limit: number): string => safeArr(arr).slice(0, limit).map(safeStr).join('|');

    return [
        6, // Schema Version (Updated)
        safeStr(record.name).substring(0, 15),
        safeStr(record.jobField).substring(0, 10),
        safeStr(record.date),
        safeStr(record.nationality),
        safeNum(record.safetyScore),
        safeStr(record.safetyLevel),
        safeJoin(record.weakAreas, 2), // 취약점 최대 2개
        safeJoin(record.strengths, 1), // 강점 최대 1개
        safeStr(record.aiInsights).substring(0, 100), // 인사이트 100자 제한
        safeStr(record.teamLeader || ""),
        safeStr(record.role || "worker"),
        safeStr(record.employeeId || "").substring(0, 20),
        safeStr(record.qrId || "").substring(0, 20),
        Math.max(0, Math.min(100, Math.round(safeNum(record.integrityScore ?? 0)))),
        Math.max(0, Math.min(100, Math.round(safeNum((record.ocrConfidence ?? 0) * 100)))),
        safeStr(record.workflowRunId || '').substring(0, 48),
        WORKFLOW_STATE_TO_CODE[safeStr(record.workflowState || '')] || '',
        RISK_DECISION_TO_CODE[safeStr(record.riskDecision || '')] || '',
        APPROVAL_STATE_TO_CODE[safeStr(record.approvalState || '')] || '',
        safeStr(record.harnessPersistenceWarning || '').substring(0, 80),
        // 이미지는 URL 용량 초과 원인이므로 절대 포함하지 않음
    ];
};

const encodeData = (data: unknown[]): string => {
    try {
        const jsonStr = JSON.stringify(data);
        // UTF-8 안전 인코딩
        const utf8 = unescape(encodeURIComponent(jsonStr));
        const base64 = window.btoa(utf8);
        // URL 안전 문자열로 변환
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        console.warn("Encoding failed", e);
        return "";
    }
};

export const getReportShareDiagnostics = (record: WorkerRecord): ReportShareDiagnostics => {
    try {
        if (!record || typeof window === 'undefined') {
            return {
                url: '',
                payloadLength: 0,
                urlLength: 0,
                qrRisk: 'overflow',
                warning: '공유 링크를 만들 환경을 확인해 주세요.',
                schemaVersion: 6,
            };
        }

        const baseUrl = window.location.origin + window.location.pathname;
        const payload = encodeData(minifyFull(record));
        const url = payload ? `${baseUrl}?d=${payload}` : '';
        const payloadLength = payload.length;
        const urlLength = url.length;

        let qrRisk: ReportShareDiagnostics['qrRisk'] = 'ok';
        let warning: string | null = null;

        if (!payload || !url) {
            qrRisk = 'overflow';
            warning = '공유 링크 생성에 실패했습니다.';
        } else if (urlLength >= 1850 || payloadLength >= 1700) {
            qrRisk = 'overflow';
            warning = 'QR 길이가 한계에 가까워 일부 기기에서 스캔이 어려울 수 있습니다. 링크 공유 또는 PDF 전달을 함께 준비해 주세요.';
        } else if (urlLength >= 1200 || payloadLength >= 1050) {
            qrRisk = 'warning';
            warning = 'QR 길이가 길어 모바일 카메라·메신저 앱에 따라 인식 속도가 느릴 수 있습니다. 현장에서는 링크 복사본도 함께 준비해 주세요.';
        }

        return {
            url,
            payloadLength,
            urlLength,
            qrRisk,
            warning,
            schemaVersion: 6,
        };
    } catch {
        return {
            url: '',
            payloadLength: 0,
            urlLength: 0,
            qrRisk: 'overflow',
            warning: '공유 링크를 만들지 못했습니다.',
            schemaVersion: 6,
        };
    }
};

export const generateReportUrl = (record: WorkerRecord): string => {
    try {
        return getReportShareDiagnostics(record).url;
    } catch (e) {
        return "";
    }
};

export const restoreRecordFromUrl = (safeBase64: string): WorkerRecord | null => {
    try {
        if (!safeBase64 || typeof safeBase64 !== 'string') return null;

        const base64 = safeBase64.replace(/-/g, '+').replace(/_/g, '/');
        const utf8Bytes = window.atob(base64);
        const jsonStr = decodeURIComponent(escape(utf8Bytes));
        const data = JSON.parse(jsonStr);

        if (!Array.isArray(data)) return null;

        const safeGet = (index: number, defaultVal: unknown = ""): unknown => (data[index] !== undefined && data[index] !== null) ? data[index] : defaultVal;
        const splitStr = (val: unknown): string[] => (typeof val === 'string' && val.length > 0) ? val.split('|') : [];

        const schemaVersion = Number(safeGet(0, 4));
        const employeeId = schemaVersion >= 5 ? String(safeGet(12, "")) : "";
        const qrId = schemaVersion >= 5 ? String(safeGet(13, "")) : "";
        const integrityScore = schemaVersion >= 5 ? Number(safeGet(14, 0)) : undefined;
        const ocrConfidencePct = schemaVersion >= 5 ? Number(safeGet(15, 0)) : undefined;
        const workflowRunId = schemaVersion >= 6 ? String(safeGet(16, '')) : '';
        const workflowState = schemaVersion >= 6 ? CODE_TO_WORKFLOW_STATE[String(safeGet(17, ''))] : undefined;
        const riskDecision = schemaVersion >= 6 ? CODE_TO_RISK_DECISION[String(safeGet(18, ''))] : undefined;
        const approvalState = schemaVersion >= 6 ? CODE_TO_APPROVAL_STATE[String(safeGet(19, ''))] : undefined;
        const harnessPersistenceWarning = schemaVersion >= 6 ? String(safeGet(20, '')) : '';

        // 복원 시 이미지는 없으므로 빈 값 처리 (공유 받은 사람은 텍스트만 확인 가능)
        return {
            id: `shared-${Date.now()}`,
            name: String(safeGet(1, "공유된 근로자")),
            jobField: String(safeGet(2, "미분류")),
            date: String(safeGet(3, new Date().toISOString().split('T')[0])),
            nationality: String(safeGet(4, "미상")),
            safetyScore: Number(safeGet(5, 0)),
            safetyLevel: String(safeGet(6, "초급")) as '초급' | '중급' | '고급',
            weakAreas: splitStr(safeGet(7)),
            strengths: splitStr(safeGet(8)),
            aiInsights: String(safeGet(9, "공유된 요약 리포트입니다.")),
            teamLeader: String(safeGet(10, "")),
            role: String(safeGet(11, "worker")) as 'worker' | 'leader' | 'sub_leader',
            employeeId: employeeId || undefined,
            qrId: qrId || undefined,
            integrityScore: typeof integrityScore === 'number' && !Number.isNaN(integrityScore) ? integrityScore : undefined,
            ocrConfidence: typeof ocrConfidencePct === 'number' && !Number.isNaN(ocrConfidencePct) ? Math.max(0, Math.min(1, ocrConfidencePct / 100)) : undefined,
            workflowRunId: workflowRunId || undefined,
            workflowState: workflowState as WorkerRecord['workflowState'],
            riskDecision: riskDecision as WorkerRecord['riskDecision'],
            approvalState: approvalState as WorkerRecord['approvalState'],
            harnessPersistenceWarning: harnessPersistenceWarning || undefined,
            
            // 필수 필드 기본값 채움
            aiInsights_native: "",
            weakAreas_native: [],
            strengths_native: [],
            handwrittenAnswers: [],
            improvement: "",
            improvement_native: "",
            suggestions: [],
            suggestions_native: [],
            selfAssessedRiskLevel: '중',
            language: 'unknown',
            fullText: '',
            koreanTranslation: '',
            originalImage: undefined, // 이미지는 공유되지 않음
            profileImage: undefined   // 이미지는 공유되지 않음
        };
    } catch (e) {
        console.warn("Restoration failed", e);
        return null;
    }
};
