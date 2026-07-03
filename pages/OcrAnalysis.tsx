
import React, { useState, useCallback, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { FileUpload } from '../components/FileUpload';
import { Spinner } from '../components/Spinner';
import { analyzeWorkerRiskAssessment, updateAnalysisBasedOnEdits, getQuotaState, setQuotaExhausted, clearQuotaState, isRateLimitError, inferOcrFailureCode, validateImageFormat, isFormatCompatibleWithAI, verifyActiveOcrApiKey } from '../services/geminiService';
import { extractMessage } from '../utils/errorUtils';
import type { WorkerRecord, OcrErrorType, OcrFailureCode, AppSettings, HarnessApprovalState, HarnessRiskDecision, HarnessWorkflowState, OcrUnknownSubCategory } from '../types';
import { fileToBase64 } from '../utils/fileUtils';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import { getApiCallState, incrementApiCallCount, resetApiCallCount, type DailyCounterState } from '../utils/apiCounterUtils';
import { BRAND_ACTION_LABELS, BRAND_STATUS_LABELS } from '../utils/brandLabels';
import { BRAND_TONE } from '../utils/brandToneTokens';
import { OCR_POLICY } from '../config/ocrPolicy';
import { MasterTemplateList, type MasterTemplate } from '../components/shared/MasterTemplateList';
import { MasterAssignment, type MasterAssignmentItem, type MasterGroup } from '../components/shared/MasterAssignment';
import { CollapsibleSection } from '../components/shared/CollapsibleSection';
import { ControlPanelCard } from '../components/shared/ControlPanelCard';
import { ActionButton } from '../components/shared/ActionButton';
import { EmptyStatePanel } from '../components/shared/EmptyStatePanel';
import { InterpretationCardGrid } from '../components/shared/InterpretationCardGrid';
import { OperationalPreviewCard } from '../components/shared/OperationalPreviewCard';
import { SectionPanelCard } from '../components/shared/SectionPanelCard';
import { StatusBadge, type StatusBadgeVariant } from '../components/shared/StatusBadge';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { StatusEvidenceActionPanel } from '../components/shared/StatusEvidenceActionPanel';
import { analyzeHarnessRecord, reanalyzeHarnessRecord } from '../services/harnessService';
import { handleSupabasePermissionError, supabase } from '../lib/supabaseClient';
import { useMobileBackGuard } from '../hooks/useMobileBackGuard';
import { API_MODE_CHANGED_EVENT, getIsPaidApiMode } from '../utils/apiModeUtils';
import { resolveOcrExecutionKeyStatus } from '../utils/ocrExecutionKeyStatus';
import {
    AI_ENGINE_SETTINGS_CHANGED_EVENT,
    getAiEngineSettings,
    getOcrEngineLabel,
    setAiEngineSettings,
    type OcrEngineMode,
} from '../utils/aiEngineSettings';
import { useDevMode } from '../contexts/DevModeContext';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { evaluateOcrVerificationCompleteness } from '../utils/ocrVerificationLanguageUtils';
import { useJudgmentTaggingQuality } from '../hooks/useJudgmentTaggingQuality';
import { analyzeWorkerEvidenceReadiness, getWorkerIdentityKey, getWorkerTrackingCandidateIdentityKey } from '../utils/workerIdentity';
import {
    analyzeBackupImport,
    BACKUP_HARD_FILE_LIMIT_BYTES,
    BACKUP_LARGE_FILE_WARNING_BYTES,
    createBackupEnvelope,
    resolveBackupPayload,
} from '../utils/backupDataQuality';

const OCR_STATUS_COPY = {
    secondPassEmpty: {
        title: '2차 재분석 대상이 아직 없습니다.',
        description: '현재 필터에서는 OCR 성공 기록과 원문 텍스트, 선택한 추가 조건을 동시에 만족한 항목만 노출합니다.',
    },
    retryGuideClear: {
        title: `현재 집계 기준으로 별도 ${BRAND_STATUS_LABELS.attention} 대응이 필요한 항목이 없습니다.`,
        description: '지연·오류·재시도 케이스가 생기면 이 영역에 우선 조치 가이드가 자동으로 표시됩니다.',
    },
} as const;

type ExportFeedback = {
    tone: 'info' | 'success' | 'warning' | 'error';
    message: string;
    detail?: string;
    fileName?: string;
} | null;

type BackupWritableTarget = {
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
};

type BackupFileHandle = {
    createWritable: () => Promise<BackupWritableTarget>;
};

type BackupSaveFilePickerWindow = Window & {
    showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: Array<{
            description: string;
            accept: Record<string, string[]>;
        }>;
    }) => Promise<BackupFileHandle>;
};

const formatExportFileSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getExportFeedbackClassName = (tone: NonNullable<ExportFeedback>['tone']): string => {
    switch (tone) {
        case 'success':
            return 'border-emerald-300 bg-emerald-50 text-emerald-800';
        case 'warning':
            return 'border-amber-300 bg-amber-50 text-amber-800';
        case 'error':
            return 'border-rose-300 bg-rose-50 text-rose-800';
        default:
            return 'border-sky-300 bg-sky-50 text-sky-800';
    }
};

const yieldToBrowser = (): Promise<void> => (
    new Promise((resolve) => window.setTimeout(resolve, 0))
);

const buildBackupJsonPrefix = (records: WorkerRecord[]): string => {
    const envelope = createBackupEnvelope(records);
    const metadata: Partial<ReturnType<typeof createBackupEnvelope>> = { ...envelope };
    delete metadata.records;

    const metadataJson = JSON.stringify(metadata, null, 2);
    const closingBraceIndex = metadataJson.lastIndexOf('\n}');
    const metadataWithoutClosingBrace = closingBraceIndex >= 0
        ? metadataJson.slice(0, closingBraceIndex)
        : metadataJson.replace(/\}$/, '');

    return `${metadataWithoutClosingBrace},\n  "records": [\n`;
};

const writeBackupJsonChunks = async (
    records: WorkerRecord[],
    writeChunk: (chunk: string) => Promise<void>,
    onProgress?: (writtenRecords: number, totalRecords: number) => void,
): Promise<void> => {
    await writeChunk(buildBackupJsonPrefix(records));

    for (let index = 0; index < records.length; index += 1) {
        let recordJson = '';
        try {
            recordJson = JSON.stringify(records[index]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '알 수 없는 오류');
            throw new Error(`백업 ${index + 1}번째 기록 JSON 변환 실패: ${message}`);
        }

        await writeChunk(`${index > 0 ? ',\n' : ''}${recordJson}`);

        const writtenRecords = index + 1;
        if (writtenRecords === 1 || writtenRecords % 20 === 0 || writtenRecords === records.length) {
            onProgress?.(writtenRecords, records.length);
            await yieldToBrowser();
        }
    }

    await writeChunk('\n  ]\n}\n');
};

const buildMasterDataLoadErrorMessage = (rawMessage?: string) => {
    const message = String(rawMessage || '알 수 없는 오류');
    return `기록 양식/배정 데이터 조회 실패: ${message}\n\n현재 group 전용 모드입니다. 중앙 서버에 작업 그룹 설정이 적용되었는지 확인해 주세요.`;
};

const buildReassessmentAuditNote = (before: WorkerRecord, updated: Partial<WorkerRecord>): string => {
    const beforeScore = typeof before.safetyScore === 'number' ? before.safetyScore : 0;
    const afterScore = typeof updated.safetyScore === 'number' ? updated.safetyScore : beforeScore;
    const beforeLevel = before.safetyLevel;
    const afterLevel = (updated.safetyLevel as WorkerRecord['safetyLevel']) || beforeLevel;
    const beforeErrorType = isFailedRecord(before) ? getOcrErrorTypeKoreanLabel(getOcrErrorTypeFromRecord(before)) : '';

    const beforeReasons = Array.isArray(before.scoreReasoning) ? before.scoreReasoning : [];
    const afterReasons = Array.isArray(updated.scoreReasoning) ? updated.scoreReasoning : beforeReasons;
    const addedReasons = afterReasons.filter(reason => !beforeReasons.includes(reason)).slice(0, 2);

    const parts = [`점수 ${beforeScore}→${afterScore}`, `등급 ${beforeLevel}→${afterLevel}`];

    if (beforeErrorType) {
        parts.push(`이전 오류: ${beforeErrorType}`);
    }

    if (addedReasons.length > 0) {
        parts.push(`근거추가: ${addedReasons.join(' / ')}`);
    } else if (afterReasons.length > 0) {
        parts.push(`근거유지: ${afterReasons.slice(0, 2).join(' / ')}`);
    }

    return `2차 재가공 실행 (${parts.join(' | ')})`;
};

const getSafetyLevelClass = (level: '초급' | '중급' | '고급') => {
    switch (level) {
        case '고급': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
        case '중급': return 'bg-amber-100 text-amber-800 border border-amber-200';
        case '초급': return 'bg-rose-100 text-rose-800 border border-rose-200';
        default: return 'bg-slate-100 text-slate-800';
    }
};

const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const classifyLegacyOcrErrorType = (raw: string): OcrErrorType => {
    const message = (raw || '').toLowerCase();

    if (
        message.includes('api key') ||
        message.includes('api 키') ||
        message.includes('quota') ||
        message.includes('429') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('gateway') ||
        message.includes('parse') ||
        message.includes('json') ||
        message.includes('ocr_')
    ) return 'QUALITY';

    if (message.includes('모서리') || message.includes('잘림') || message.includes('배경') || message.includes('layout') || message.includes('crop')) return 'LAYOUT';
    if (message.includes('해상도') || message.includes('low resolution') || message.includes('too short') || message.includes('멀리')) return 'RESOLUTION';
    if (message.includes('악필') || message.includes('손글씨') || message.includes('handwriting') || message.includes('illegible')) return 'HANDWRITING';
    if (message.includes('반사') || message.includes('그림자') || message.includes('초점') || message.includes('흔들') || message.includes('blur') || message.includes('glare')) return 'QUALITY';
    return 'UNKNOWN';
};

const getOcrErrorTypeFromRecord = (record: WorkerRecord): OcrErrorType => {
    if (record.ocrErrorType) return record.ocrErrorType;
    return classifyLegacyOcrErrorType(String(record.aiInsights || ''));
};

const getOcrErrorGuideMessage = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '📸 사진에 빛 반사가 있거나 흔들렸습니다. 밝은 곳에서 초점을 맞춰 다시 찍어주세요.';
        case 'HANDWRITING':
            return '✍️ 글씨를 인식하기 어렵습니다. 정자체로 작성되었는지 확인해 주세요.';
        case 'LAYOUT':
            return '📄 문서의 모서리가 잘렸습니다. 기록지 전체가 화면에 들어오게 찍어주세요.';
        case 'RESOLUTION':
            return '🔎 해상도가 낮거나 너무 멀리서 촬영되었습니다. 문서에 가까이 다가가 선명하게 촬영해 주세요.';
        default:
            return '🛠️ 서버 또는 네트워크 확인이 더 필요합니다. 잠시 후 다시 촬영하거나 다시 확인해 주세요.';
    }
};

const getOcrErrorGuideSummary = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '조치: 반사/흔들림 최소화 후 재촬영';
        case 'HANDWRITING':
            return '조치: 정자체 확인 후 재작성/재촬영';
        case 'LAYOUT':
            return '조치: 문서 전체(모서리 포함) 재촬영';
        case 'RESOLUTION':
            return '조치: 가까이서 고해상도 재촬영';
        default:
            return '조치: 잠시 후 다시 확인 또는 네트워크 점검';
    }
};

const getOcrErrorTypeKoreanLabel = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '촬영 품질';
        case 'RESOLUTION':
            return '해상도';
        case 'HANDWRITING':
            return '악필/필기';
        case 'LAYOUT':
            return '문서 구도';
        default:
            return '기타 오류';
    }
};

const FAILURE_CODE_LABELS: Record<OcrFailureCode, string> = {
    QUOTA: 'API 한도',
    KEY: '키/권한',
    FORMAT: '파일 형식',
    PARSE: '양식 판독',
    PAYLOAD: '이미지 데이터',
    NETWORK: '네트워크',
    UNKNOWN: '기타',
};

const getFailureCodeTone = (code: OcrFailureCode): string => {
    switch (code) {
        case 'QUOTA':
            return BRAND_TONE.darkAmber;
        case 'KEY':
        case 'NETWORK':
            return BRAND_TONE.darkRose;
        case 'FORMAT':
        case 'PAYLOAD':
            return BRAND_TONE.darkIndigo;
        case 'PARSE':
            return BRAND_TONE.darkVioletStrong;
        default:
            return BRAND_TONE.glassSoft;
    }
};

const getFailureCodeAction = (code: OcrFailureCode): string => {
    switch (code) {
        case 'QUOTA':
            return '호출량 급증 여부를 확인하고 냉각 후 재분석하거나 브라우저 대체 분석 성공률을 먼저 확인하세요.';
        case 'KEY':
            return '서버 분석 연결키와 사용 권한, 운영 연결 정보 누락 여부를 가장 먼저 확인하세요.';
        case 'FORMAT':
            return '지원 형식(JPG/PNG/GIF/WebP/HEIC) 여부를 확인하고 원본 이미지를 다시 등록하세요.';
        case 'PARSE':
            return '문서 판독 결과를 읽을 수 있는지 확인하고 자동 분석 출력의 이상 징후를 기록하세요.';
        case 'PAYLOAD':
            return 'Base64 손상, 이미지 누락, 용량 초과 여부를 먼저 확인하세요.';
        case 'NETWORK':
            return '서버 지연 또는 업스트림 연결 문제 가능성이 높으니 네트워크 상태와 브라우저 대체 분석 경로를 확인하세요.';
        default:
            return '동일 코드 반복 여부와 최근 배포 변경점을 함께 확인하세요.';
    }
};

type FailureImmediateActionType = 'key-check' | 'quota-wait' | 'network-check';

type FailureImmediateAction = {
    type: FailureImmediateActionType;
    label: string;
    title: string;
    className: string;
};

const getFailureImmediateActions = (code: OcrFailureCode): FailureImmediateAction[] => {
    if (code === 'KEY') {
        return [
            {
                type: 'key-check',
                label: '키 점검',
                title: '서버 Gemini 분석 연결키와 권한 점검 목록을 복사합니다.',
                className: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
            },
        ];
    }

    if (code === 'QUOTA') {
        return [
            {
                type: 'quota-wait',
                label: '쿼터 대기',
                title: '쿼터 냉각 안내를 적용하고 재시도 체크리스트를 복사합니다.',
                className: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
            },
        ];
    }

    if (code === 'NETWORK') {
        return [
            {
                type: 'network-check',
                label: '네트워크 점검',
                title: '업스트림/게이트웨이 장애 점검 체크리스트를 복사합니다.',
                className: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
            },
        ];
    }

    return [];
};

const inferHarnessWorkflowState = (record: Partial<WorkerRecord>): HarnessWorkflowState => {
    if (record.secondPassStatus === 'IN_PROGRESS') return 'second_pass_analyzing';
    if (record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING') return 'awaiting_manager_approval';
    if (record.ocrErrorType || record.secondPassStatus === 'NEEDED') return 'manual_review_required';
    if (record.secondPassStatus === 'DONE' || record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'completed';
    return 'uploaded';
};

const inferHarnessRiskDecision = (record: Partial<WorkerRecord>): HarnessRiskDecision => {
    if (record.ocrErrorType) return 'IMMEDIATE_ATTENTION';
    if (record.secondPassStatus === 'NEEDED') return 'SUPPLEMENTARY_REVIEW';
    return 'SAFE_TO_PROCEED';
};

const inferHarnessApprovalState = (record: Partial<WorkerRecord>, workflowState: HarnessWorkflowState): HarnessApprovalState => {
    if (record.reviewStatus === 'REJECTED') return 'REJECTED';
    if (record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'APPROVED';
    if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') return 'PENDING';
    return 'NOT_REQUIRED';
};

const withHarnessState = (record: WorkerRecord, patch: Partial<WorkerRecord>): WorkerRecord => {
    const next = { ...record, ...patch };
    const workflowState = patch.workflowState ?? inferHarnessWorkflowState(next);
    const riskDecision = patch.riskDecision ?? inferHarnessRiskDecision(next);
    const approvalState = patch.approvalState ?? inferHarnessApprovalState(next, workflowState);

    return {
        ...next,
        workflowState,
        riskDecision,
        approvalState,
    };
};

const buildHarnessPayloadFromRecord = (record: WorkerRecord, fileNameOverride?: string) => ({
    recordId: record.id,
    documentText: String(record.fullText || record.koreanTranslation || record.aiInsights || '').trim(),
    ocrConfidence: typeof record.ocrConfidence === 'number' ? record.ocrConfidence : null,
    jobType: String(record.jobField || '').trim() || undefined,
    fileName: String(fileNameOverride || record.filename || record.name || '').trim() || undefined,
    imageQualityScore: typeof record.integrityScore === 'number'
        ? Math.max(0, Math.min(1, Number((record.integrityScore / 100).toFixed(4))))
        : null,
    metadata: {
        recordDate: record.date,
        name: record.name,
        teamLeader: record.teamLeader,
        language: record.language,
        source: 'ocr-analysis',
    },
});

type HarnessPersistenceState = 'connected' | 'fallback' | 'pending';

const getHarnessPersistenceState = (record: Partial<WorkerRecord>): HarnessPersistenceState => {
    if (String(record.harnessPersistenceWarning || '').trim()) return 'fallback';
    if (String(record.workflowRunId || '').trim()) return 'connected';
    return 'pending';
};

const getHarnessPersistenceLabel = (state: HarnessPersistenceState): string => {
    switch (state) {
        case 'connected': return '중앙 저장소 연결 완료';
        case 'fallback': return '로컬 보관중';
        default: return '저장 대기';
    }
};

const getHarnessPersistenceBadgeVariant = (state: HarnessPersistenceState): StatusBadgeVariant => {
    switch (state) {
        case 'connected': return 'emeraldSoft';
        case 'fallback': return 'amberSoft';
        default: return 'slateSoft';
    }
};

const getHarnessWorkflowStateLabel = (state: HarnessWorkflowState): string => {
    switch (state) {
        case 'uploaded': return '서류 업로드 완료';
        case 'ocr_validating': return '서류 판독 및 검증 중';
        case 'manual_review_required': return '추가 검토 필요';
        case 'context_ready': return '분석 환경 구성 완료';
        case 'first_pass_analyzing': return '1차 평가 분석 중';
        case 'evaluator_review': return '평가 정합성 검증 중';
        case 'awaiting_manager_approval': return '현장 소장 승인 대기';
        case 'manager_revised': return '현장 소장 검토/수정 완료';
        case 'second_pass_analyzing': return '2차 심층 재평가 중';
        case 'completed':
        default:
            return '이행 검증 완료';
    }
};

const getHarnessRiskDecisionLabel = (decision: HarnessRiskDecision): string => {
    switch (decision) {
        case 'SAFE_TO_PROCEED': return '작업 진행 가능';
        case 'SUPPLEMENTARY_REVIEW': return '안전 조치 보완 검토';
        case 'IMMEDIATE_ATTENTION': return '즉시 관찰 보호';
        case 'CRITICAL_STOP':
        default:
            return '작업 즉시 중단 및 보완';
    }
};

const getHarnessApprovalStateLabel = (state: HarnessApprovalState): string => {
    switch (state) {
        case 'NOT_REQUIRED': return '승인 대상 제외';
        case 'REQUIRED': return '소장 결재 필요';
        case 'PENDING': return '결재 대기';
        case 'APPROVED': return '결재 승인 완료';
        case 'REJECTED':
        default:
            return '결재 반려';
    }
};

const getHarnessWorkflowBadgeVariant = (state: HarnessWorkflowState): StatusBadgeVariant => {
    switch (state) {
        case 'completed': return 'emeraldSoft';
        case 'second_pass_analyzing': return 'sky';
        case 'awaiting_manager_approval': return 'amberSoft';
        case 'manual_review_required':
        default:
            return 'slateSoft';
    }
};

const getHarnessRiskBadgeVariant = (decision: HarnessRiskDecision): StatusBadgeVariant => {
    switch (decision) {
        case 'SAFE_TO_PROCEED': return 'emeraldSoft';
        case 'SUPPLEMENTARY_REVIEW': return 'amber';
        case 'IMMEDIATE_ATTENTION': return 'rose';
        case 'CRITICAL_STOP':
        default:
            return 'roseSoft';
    }
};

const getHarnessApprovalBadgeVariant = (state: HarnessApprovalState): StatusBadgeVariant => {
    switch (state) {
        case 'APPROVED': return 'emerald';
        case 'PENDING': return 'amberSoft';
        case 'REJECTED': return 'roseSoft';
        case 'REQUIRED': return 'amber';
        case 'NOT_REQUIRED':
        default:
            return 'slateSoft';
    }
};

const getOcrErrorMobileLabel = (errorType: OcrErrorType): string => {
    switch (errorType) {
        case 'QUALITY':
            return '📸 품질';
        case 'HANDWRITING':
            return '✍️ 악필';
        case 'LAYOUT':
            return '📄 레이아웃';
        case 'RESOLUTION':
            return '🔎 해상도';
        default:
            return '🛠️ 기타';
    }
};

const getFailureChecklist = (errorType: OcrErrorType): string[] => {
    switch (errorType) {
        case 'LAYOUT':
            return [
                '문서 모서리 4개가 모두 보이는지 확인',
                '기록지 전체가 한 화면에 들어오도록 재촬영',
                '기울어짐/잘림 없는 원본으로 다시 업로드',
            ];
        case 'QUALITY':
            return [
                '반사광·그림자·흔들림 여부 확인',
                '초점이 맞는 원본 사진으로 재업로드',
                '야간/역광 촬영이면 밝기 보정 후 다시 확인',
            ];
        case 'RESOLUTION':
            return [
                '문자 식별이 가능한 해상도인지 확인',
                '문서와 카메라 거리를 좁혀 다시 촬영',
                '압축본 대신 원본 이미지를 우선 사용',
            ];
        case 'HANDWRITING':
            return [
                '핵심 문항을 육안으로 직접 대조 확인',
                '판독 어려운 필기는 관리자 보정 여부 검토',
                '필요 시 재작성 요청 또는 정상분류 기준 검토',
            ];
        default:
            return [
                '네트워크/API 상태를 먼저 확인',
                '같은 오류 반복 여부를 집계에서 확인',
                '재분석과 정상분류 중 적절한 조치를 선택',
            ];
    }
};

const getFailureChecklistSummary = (errorType: OcrErrorType): string => {
    return getFailureChecklist(errorType).slice(0, 2).join(' · ');
};

const normalizeRetryImageData = (image?: string): string => {
    if (!image || typeof image !== 'string') return '';
    const trimmed = image.trim();
    const withoutHeader = trimmed.includes('base64,')
        ? trimmed.split('base64,').pop() || ''
        : trimmed;
    return withoutHeader.replace(/[\r\n\s]/g, '');
};

const hasRetryableOriginalImage = (image?: string): boolean => {
    return normalizeRetryImageData(image).length >= 100;
};

const UNKNOWN_RECORD_MONTH_KEY = 'unknown-month';
const INITIAL_RECORD_RENDER_LIMIT = 80;
const RECORD_RENDER_INCREMENT = 80;
const LARGE_RECORD_MONTH_FIRST_THRESHOLD = 240;

type OcrRecordScopeFilter = 'ocr-only' | 'all';

type OcrRecordMonthBucket = {
    key: string;
    label: string;
    count: number;
    records: WorkerRecord[];
    ocrCount: number;
    failedCount: number;
    successCount: number;
    imageReadyCount: number;
    averageScore: number | null;
    latestDateLabel: string;
    newestTimestamp: number;
};

type OcrRecordMonthIndex = {
    records: WorkerRecord[];
    buckets: OcrRecordMonthBucket[];
    bucketByKey: Map<string, OcrRecordMonthBucket>;
    total: number;
    totalFailedCount: number;
    totalImageReadyCount: number;
    averageScore: number | null;
    latestMonthKey: string;
    largeDataset: boolean;
};

const isOcrAnalyzedRecord = (record: WorkerRecord): boolean => {
    return Boolean(
        hasRetryableOriginalImage(record.originalImage) ||
        String(record.filename || '').trim() ||
        typeof record.ocrConfidence === 'number' ||
        record.ocrTrace ||
        record.ocrErrorType ||
        record.ocrFailureCode ||
        record.ocrStatus ||
        record.secondPassStatus ||
        (record.auditTrail || []).some((entry) => entry.stage === 'ocr' || entry.actor === 'psi-harness')
    );
};

const getRecordMonthKey = (record: WorkerRecord): string => {
    const raw = String(record.date || '').trim();
    const matched = raw.match(/^(\d{4})-(\d{2})/);
    if (matched) return `${matched[1]}-${matched[2]}`;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return UNKNOWN_RECORD_MONTH_KEY;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const formatRecordMonthLabel = (monthKey: string): string => {
    if (monthKey === UNKNOWN_RECORD_MONTH_KEY) return '날짜 미확인';
    const [year, month] = monthKey.split('-');
    return `${year}년 ${Number(month)}월`;
};

const getRecordTimestamp = (record: WorkerRecord): number => {
    const parsed = new Date(record.date || '').getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const getRecordDateLabel = (record: WorkerRecord): string => {
    const raw = String(record.date || '').slice(0, 10);
    return raw || '날짜 미확인';
};

const buildOcrRecordMonthIndex = (records: WorkerRecord[]): OcrRecordMonthIndex => {
    const bucketByKey = new Map<string, OcrRecordMonthBucket & { scoreTotal: number; scoreCount: number }>();
    let totalFailedCount = 0;
    let totalImageReadyCount = 0;
    let scoreTotal = 0;
    let scoreCount = 0;

    records.forEach((record) => {
        const key = getRecordMonthKey(record);
        const timestamp = getRecordTimestamp(record);
        const failed = isFailedRecord(record);
        const imageReady = hasRetryableOriginalImage(record.originalImage) || hasRetryableOriginalImage(record.profileImage);
        const score = Number(record.safetyScore);
        const bucket = bucketByKey.get(key) || {
            key,
            label: formatRecordMonthLabel(key),
            count: 0,
            records: [],
            ocrCount: 0,
            failedCount: 0,
            successCount: 0,
            imageReadyCount: 0,
            averageScore: null,
            latestDateLabel: '날짜 미확인',
            newestTimestamp: 0,
            scoreTotal: 0,
            scoreCount: 0,
        };

        bucket.records.push(record);
        bucket.count += 1;
        if (isOcrAnalyzedRecord(record)) bucket.ocrCount += 1;
        if (failed) bucket.failedCount += 1;
        else bucket.successCount += 1;
        if (imageReady) bucket.imageReadyCount += 1;
        if (Number.isFinite(score)) {
            bucket.scoreTotal += score;
            bucket.scoreCount += 1;
            scoreTotal += score;
            scoreCount += 1;
        }
        if (timestamp >= bucket.newestTimestamp) {
            bucket.newestTimestamp = timestamp;
            bucket.latestDateLabel = getRecordDateLabel(record);
        }

        if (failed) totalFailedCount += 1;
        if (imageReady) totalImageReadyCount += 1;
        bucketByKey.set(key, bucket);
    });

    const buckets = Array.from(bucketByKey.values())
        .map((bucket) => ({
            ...bucket,
            averageScore: bucket.scoreCount > 0 ? Math.round(bucket.scoreTotal / bucket.scoreCount) : null,
        }))
        .sort((left, right) => {
            if (left.key === UNKNOWN_RECORD_MONTH_KEY) return 1;
            if (right.key === UNKNOWN_RECORD_MONTH_KEY) return -1;
            return right.key.localeCompare(left.key);
        });

    const publicBucketByKey = new Map<string, OcrRecordMonthBucket>(
        buckets.map((bucket) => [bucket.key, bucket])
    );
    const latestMonthKey = buckets.find((bucket) => bucket.key !== UNKNOWN_RECORD_MONTH_KEY)?.key || buckets[0]?.key || 'all';

    return {
        records,
        buckets,
        bucketByKey: publicBucketByKey,
        total: records.length,
        totalFailedCount,
        totalImageReadyCount,
        averageScore: scoreCount > 0 ? Math.round(scoreTotal / scoreCount) : null,
        latestMonthKey,
        largeDataset: records.length >= LARGE_RECORD_MONTH_FIRST_THRESHOLD,
    };
};

const OCR_FAILED_ONLY_DEFAULT_KEY = 'psi_ocr_failed_only_default';
const OCR_VIEW_STATE_KEY = 'psi_ocr_view_state_v1';
const OCR_BATCH_CHECKPOINT_KEY = 'psi_ocr_batch_checkpoint_v1';

type OcrViewState = {
    savedAt: number;
    searchTerm: string;
    filterLevel: string;
    filterField: string;
    filterLeader: string;
    filterTrust: 'all' | 'pending' | 'finalized';
    filterReason: 'all' | 'has-reason' | 'missing-reason' | 'weak-reason';
    filterStatus: 'all' | 'success' | 'failed';
    secondPassStatusFilter: 'all' | 'done' | 'not-done';
    secondPassEditedOnly: boolean;
    secondPassExcludedOnly: boolean;
    secondPassReasonFilter: string;
    recordSortMode: RecordSortMode;
    recordScopeFilter: OcrRecordScopeFilter;
    recordMonthFilter: string;
};

type OcrBatchCheckpoint = {
    savedAt: number;
    title: string;
    forceReanalyze: boolean;
    total: number;
    nextIndex: number;
    successCount: number;
    failCount: number;
    serverSuccessCount: number;
    clientFallbackSuccessCount: number;
    preflightFailCount: number;
    processingFailCount: number;
    serverRouteFailCount: number;
    keyFailureCount: number;
    lastRecordName?: string;
};

const OCR_VIEW_STATE_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const OCR_BATCH_CHECKPOINT_TTL_MS = 1000 * 60 * 60 * 24;

const getStoredOcrViewState = (): Partial<OcrViewState> => {
    try {
        const raw = localStorage.getItem(OCR_VIEW_STATE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Partial<OcrViewState>;
        if (typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt > OCR_VIEW_STATE_TTL_MS) {
            localStorage.removeItem(OCR_VIEW_STATE_KEY);
            return {};
        }
        return parsed;
    } catch {
        return {};
    }
};

const getFailedOnlyDefaultOption = (): boolean => {
    try {
        const raw = localStorage.getItem(OCR_FAILED_ONLY_DEFAULT_KEY);
        if (raw === null) return true;
        return raw === '1';
    } catch {
        return true;
    }
};

const getStoredBatchCheckpoint = (): OcrBatchCheckpoint | null => {
    try {
        const raw = localStorage.getItem(OCR_BATCH_CHECKPOINT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as OcrBatchCheckpoint;
        if (!parsed?.savedAt || Date.now() - parsed.savedAt > OCR_BATCH_CHECKPOINT_TTL_MS) {
            localStorage.removeItem(OCR_BATCH_CHECKPOINT_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

const saveBatchCheckpoint = (checkpoint: OcrBatchCheckpoint): void => {
    try {
        localStorage.setItem(OCR_BATCH_CHECKPOINT_KEY, JSON.stringify({ ...checkpoint, savedAt: Date.now() }));
    } catch {
        // ignore quota/localstorage errors
    }
};

const clearBatchCheckpoint = (): void => {
    try {
        localStorage.removeItem(OCR_BATCH_CHECKPOINT_KEY);
    } catch {
        // ignore
    }
};

const createFileAnalysisErrorRecord = (file: File, message: string, errorType: OcrErrorType = 'UNKNOWN'): WorkerRecord => {
    const now = Date.now();
    const filename = String(file.name || 'unknown-file');
    const baseName = filename.includes('.') ? filename.replace(/\.[^/.]+$/, '') : filename;

    return {
        id: `upload-fail-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: baseName || '분석 실패',
        jobField: '미분류',
        teamLeader: '미지정',
        role: 'worker',
        isTranslator: false,
        isSignalman: false,
        date: new Date().toISOString().split('T')[0],
        nationality: '미상',
        language: 'unknown',
        handwrittenAnswers: [],
        fullText: '분석 실패',
        koreanTranslation: '',
        safetyScore: 0,
        ocrErrorType: errorType,
        ocrFailureCode: inferOcrFailureCode(message),
        ocrErrorMessage: message,
        safetyLevel: '초급',
        strengths: [],
        strengths_native: [],
        weakAreas: [],
        weakAreas_native: [],
        improvement: '',
        improvement_native: '',
        suggestions: [],
        suggestions_native: [],
        aiInsights: message,
        aiInsights_native: message,
        selfAssessedRiskLevel: '중',
        filename,
    };
};

const withFailureCodePrefix = (code: OcrFailureCode, message: string): string => {
    const normalized = String(message || '').trim();
    if (!normalized) return `[${code}]`;
    return normalized.startsWith('[') ? normalized : `[${code}] ${normalized}`;
};

const getPreflightFailureReason = (record: WorkerRecord): string | null => {
    const rawImage = String(record.originalImage || '').trim();
    if (!rawImage) return '원본 이미지가 없습니다. 문서 이미지를 다시 등록해야 합니다.';

    const cleanImage = normalizeRetryImageData(rawImage);
    if (!cleanImage || cleanImage.length < 100) {
        return '이미지 데이터가 너무 짧거나 손상되었습니다. 원본 문서를 다시 업로드해야 합니다.';
    }

    const formatValidation = validateImageFormat(cleanImage);
    if (!formatValidation.isValid) {
        return `이미지 데이터 손상 또는 base64 형식 오류입니다. (${formatValidation.error || '형식 오류'})`;
    }

    if (!formatValidation.supportedFormat) {
        return `지원하지 않는 파일 형식입니다. 감지 형식: ${formatValidation.detectedFormat}`;
    }

    if (!isFormatCompatibleWithAI(formatValidation.detectedFormat)) {
        return `AI 미지원 형식입니다. PDF/JPG/PNG/WebP/HEIC로 변환 후 다시 등록하세요. (현재: ${formatValidation.detectedFormat})`;
    }

    return null;
};

const resolveFailureCodeFromRecord = (record: WorkerRecord): OcrFailureCode => {
    if (record.ocrFailureCode) return record.ocrFailureCode;
    if (record.ocrTrace?.finalCode) return record.ocrTrace.finalCode;

    const inferred = inferOcrFailureCode(`${String(record.ocrErrorMessage || '')} ${String(record.aiInsights || '')}`);
    return inferred;
};

const normalizeFailureCode = (value: unknown): OcrFailureCode | undefined => {
    const normalized = String(value || '').trim().toUpperCase();
    switch (normalized) {
        case 'QUOTA':
        case 'KEY':
        case 'FORMAT':
        case 'PARSE':
        case 'PAYLOAD':
        case 'NETWORK':
        case 'UNKNOWN':
            return normalized;
        default:
            return undefined;
    }
};

const getFailureCodeDisplayLabel = (code: OcrFailureCode): string => {
    switch (code) {
        case 'QUOTA':
            return 'API 한도 초과';
        case 'KEY':
            return 'API 키/권한 문제';
        case 'NETWORK':
            return '네트워크/서버 연결 문제';
        case 'FORMAT':
            return '파일 형식 문제';
        case 'PAYLOAD':
            return '이미지 데이터 문제';
        case 'PARSE':
            return '양식 판독/응답 파싱 문제';
        default:
            return '기타 확인 필요';
    }
};

const getRecordFailureDisplayLabel = (record: WorkerRecord): string => {
    const failureCode = resolveFailureCodeFromRecord(record);
    if (failureCode && failureCode !== 'UNKNOWN') return getFailureCodeDisplayLabel(failureCode);
    return getOcrErrorTypeKoreanLabel(getOcrErrorTypeFromRecord(record));
};

const getRecordFailureHeadline = (record: WorkerRecord): string => {
    const failureCode = resolveFailureCodeFromRecord(record);
    if (failureCode === 'QUOTA') return 'API 한도 초과로 대기 중입니다.';
    if (failureCode === 'KEY') return 'API 키 또는 권한 확인이 필요합니다.';
    if (failureCode === 'NETWORK') return '서버 또는 네트워크 연결 확인이 필요합니다.';
    if (failureCode === 'PARSE') return '양식 판독 결과 검증이 필요합니다.';
    if (failureCode === 'FORMAT' || failureCode === 'PAYLOAD') return '이미지 파일 형식 또는 데이터 확인이 필요합니다.';
    return `${getRecordFailureDisplayLabel(record)} 신호가 남아 있습니다.`;
};

// [강화된 실패 판단 로직 - 안전성 강화]
const isFailedRecord = (r: WorkerRecord): boolean => {
    if (r.ocrErrorType) return true;

    const hasSourceText =
        String(r.fullText || '').trim().length > 0 ||
        String(r.koreanTranslation || '').trim().length > 0 ||
        (r.handwrittenAnswers || []).some((answer) => String(answer?.answerText || '').trim().length > 0);

    if (hasOperationalFailureSignal(r)) return true;

    if (!String(r.aiInsights || '').trim() && !hasSourceText) return true;
    
    return false;
};

const hasOperationalFailureSignal = (record: Partial<WorkerRecord>): boolean => {
    const errorText = String(record.ocrErrorMessage || '').toLowerCase();
    const failureCode = String(record.ocrFailureCode || '').toUpperCase();
    const hasSourceText =
        String(record.fullText || '').trim().length > 0 ||
        String(record.koreanTranslation || '').trim().length > 0 ||
        (record.handwrittenAnswers || []).some((answer) => String(answer?.answerText || '').trim().length > 0);

    if (OCR_POLICY.FAILURE_DETECTION.hardFailureCodes.includes(failureCode as typeof OCR_POLICY.FAILURE_DETECTION.hardFailureCodes[number])) return true;

    const hasHardFailureKeyword = OCR_POLICY.FAILURE_DETECTION.hardFailureKeywords.some((keyword) =>
        errorText.includes(String(keyword).toLowerCase())
    );

    if (hasHardFailureKeyword) return true;

    if ((Number(record.safetyScore) || 0) <= 0 && !hasSourceText) return true;

    return false;
};

/**
 * UNKNOWN 실패코드 2차 분류 헬퍼 (P0)
 * 에러 메시지/insights 텍스트를 바탕으로 sub-category를 결정한다.
 */
const classifyUnknownSubCategory = (record: Partial<WorkerRecord>): import('../types').OcrUnknownSubCategory => {
    const explicitFailureCode = String(record.ocrFailureCode || '').toUpperCase();
    if (explicitFailureCode === 'KEY' || explicitFailureCode === 'QUOTA') return 'policy-like';
    if (explicitFailureCode === 'NETWORK') return 'network-like';
    if (explicitFailureCode === 'PARSE' || explicitFailureCode === 'FORMAT' || explicitFailureCode === 'PAYLOAD') return 'parse-like';

    const combined = `${String(record.ocrErrorMessage || '')} ${String(record.aiInsights || '')}`.toLowerCase();
    if (
        combined.includes('failed to fetch') || combined.includes('network') ||
        combined.includes('timeout') || combined.includes('gateway') ||
        combined.includes('econnreset') || combined.includes('연결') ||
        combined.includes('네트워크') || combined.includes('타임아웃')
    ) return 'network-like';
    if (
        combined.includes('parse') || combined.includes('json') ||
        combined.includes('파싱') || combined.includes('응답 형식') ||
        combined.includes('syntax error') || combined.includes('empty result')
    ) return 'parse-like';
    if (
        combined.includes('quota') || combined.includes('429') ||
        combined.includes('resource_exhausted') || combined.includes('unauthorized') ||
        combined.includes('forbidden') || combined.includes('api 키') ||
        combined.includes('할당량') || combined.includes('권한')
    ) return 'policy-like';
    return 'uncategorized';
};

/**
 * 승인 사유 품질 게이트 헬퍼 (P1)
 * 원인-조치-검증 구조를 점검하여 사유의 실질적 충실성을 평가한다.
 */
const evaluateApprovalReasonQuality = (reason: string): {
    score: 'strong' | 'adequate' | 'weak';
    hasCause: boolean;
    hasAction: boolean;
    hasVerification: boolean;
    hint: string;
} => {
    const text = reason.trim().toLowerCase();
    if (text.length === 0) return { score: 'weak', hasCause: false, hasAction: false, hasVerification: false, hint: '사유를 입력해 주세요.' };
    const hasCause = /원인|이유|때문|인해|발생|확인|누락|오류/.test(text);
    const hasAction = /조치|수정|보완|재분석|처리|정상|완료|변경|적용/.test(text);
    const hasVerification = /검증|이상없음|정상확인|재확인|검토 완료|적합|인정/.test(text);
    const metCount = [hasCause, hasAction, hasVerification].filter(Boolean).length;
    if (text.length >= 30 || metCount === 3) return { score: 'strong', hasCause, hasAction, hasVerification, hint: '사유 충실도: 우수' };
    if (metCount >= 2) return { score: 'adequate', hasCause, hasAction, hasVerification, hint: '사유 충실도: 보통 (검증 서술 보완 권장)' };
    return {
        score: 'weak', hasCause, hasAction, hasVerification,
        hint: `사유 충실도: 부족 — ${!hasCause ? '원인 서술' : ''}${!hasAction ? ' · 조치 내용' : ''}${!hasVerification ? ' · 검증/확인' : ''} 추가 권장`,
    };
};

const hasManagerCorrections = (record: WorkerRecord): boolean => {
    return Array.isArray(record.correctionHistory) && record.correctionHistory.length > 0;
};

const CORRECTION_FIELD_LABELS: Record<string, string> = {
    name: '이름',
    nationality: '국적',
    language: '언어',
    date: '작성일',
    jobField: '공종',
    teamLeader: '팀장',
    handwrittenAnswers: '수기답변',
    fullText: 'OCR 원문',
    koreanTranslation: '한글 번역',
    strengths: '강점',
    weakAreas: '약점',
    aiInsights: 'AI 인사이트',
    safetyScore: '응답품질',
    safetyLevel: '확인단계',
    scoreReasoning: '품질 근거',
    actionable_coaching: '개선 코칭',
    improvement: '개선사항',
    suggestions: '권장사항',
};

const getLatestCorrectionPreview = (record: WorkerRecord): string | null => {
    const latest = Array.isArray(record.correctionHistory)
        ? record.correctionHistory[record.correctionHistory.length - 1]
        : null;

    if (!latest) return null;

    const fields = Array.isArray(latest.changedFields) ? latest.changedFields.filter(Boolean) : [];
    const localizedFields = fields.map(field => CORRECTION_FIELD_LABELS[field] || field);
    const fieldSummary = localizedFields.length > 0
        ? `${localizedFields.slice(0, 3).join(', ')}${localizedFields.length > 3 ? ` 외 ${localizedFields.length - 3}건` : ''}`
        : '수정 필드 없음';
    const reasonSummary = String(latest.reason || '').trim();

    return reasonSummary
        ? `${fieldSummary} · ${reasonSummary}`
        : fieldSummary;
};

const getLatestCorrectionReason = (record: WorkerRecord): string => {
    const latest = Array.isArray(record.correctionHistory)
        ? record.correctionHistory[record.correctionHistory.length - 1]
        : null;

    return String(latest?.reason || '').trim();
};

const getLatestDecisionReason = (record: WorkerRecord): string => {
    const approvalComment = String((record.approvalHistory || []).slice(-1)[0]?.comment || '').trim();
    const directReason = String(record.approvalReason || record.reviewReason || record.adminComment || '').trim();
    return directReason || approvalComment;
};

const hasWeakDecisionReason = (record: WorkerRecord): boolean => {
    const reason = getLatestDecisionReason(record);
    if (!reason) return false;
    if (reason.length < 6) return true;
    return /승인|반영|확인|검토|ok|완료/i.test(reason) && reason.length < 12;
};

const hasWeakCorrectionReason = (record: WorkerRecord): boolean => {
    const latest = Array.isArray(record.correctionHistory)
        ? record.correctionHistory[record.correctionHistory.length - 1]
        : null;

    const reason = String(latest?.reason || '').trim();
    if (!reason) return false;

    if (reason.length < 6) return true;
    return /수정|보정|변경|확인|검토|업데이트|ok|확인함/i.test(reason) && reason.length < 12;
};

const getLatestCorrectionTimestamp = (record: WorkerRecord): number => {
    const latest = Array.isArray(record.correctionHistory)
        ? record.correctionHistory[record.correctionHistory.length - 1]
        : null;

    if (!latest?.timestamp) return 0;

    const parsed = new Date(latest.timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const getLatestCorrectionTimestampLabel = (record: WorkerRecord): string | null => {
    const timestamp = getLatestCorrectionTimestamp(record);
    if (!timestamp) return null;

    return new Date(timestamp).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};

const formatCompactDateTime = (value?: string | number | null): string | null => {
    if (!value) return null;

    const parsed = new Date(value).getTime();
    if (!Number.isFinite(parsed)) return null;

    return new Date(parsed).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};

const getWorkerGroupDateValue = (record: WorkerRecord): number => {
    const parsed = new Date(record.date || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatWorkerGroupMonth = (record: WorkerRecord): string => {
    const parsed = getWorkerGroupDateValue(record);
    if (!parsed) return String(record.date || '날짜 없음').slice(0, 10);

    return new Date(parsed).toLocaleDateString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
    });
};

const getWorkerAccumulationKey = (record: WorkerRecord): string => {
    return getWorkerTrackingCandidateIdentityKey(record);
};

const getWorkerDateBucket = (record: WorkerRecord): string => {
    const parsed = getWorkerGroupDateValue(record);
    if (parsed) return new Date(parsed).toISOString().slice(0, 10);
    return String(record.date || '').slice(0, 10) || 'unknown-date';
};

const getMaxDuplicateDateCount = (records: WorkerRecord[]): number => {
    const dateCounts = new Map<string, number>();
    records.forEach((record) => {
        const dateBucket = getWorkerDateBucket(record);
        dateCounts.set(dateBucket, (dateCounts.get(dateBucket) || 0) + 1);
    });
    return Math.max(0, ...Array.from(dateCounts.values()));
};

const buildTrackingReviewReason = (
    trackingMode: WorkerAccumulationGroup['trackingMode'],
    sameDateDuplicateCount: number,
    jobFieldCount: number,
    teamLeaderCount: number,
): string => {
    const reasons: string[] = [];
    if (trackingMode === 'candidate') reasons.push('이름+국적 후보');
    if (sameDateDuplicateCount > 1) reasons.push('같은 날짜 중복');
    if (jobFieldCount > 1) reasons.push('공종 변경');
    if (teamLeaderCount > 1) reasons.push('반장/팀 변경');
    return reasons.join(' · ') || '자동 확정';
};

const formatComparisonValue = (value: unknown): string => {
    if (Array.isArray(value)) {
        const items = value.map((item) => String(item || '').trim()).filter(Boolean);
        return items.length > 0 ? items.slice(0, 3).join(' / ') : '없음';
    }

    if (value && typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '변경 데이터';
        }
    }

    const text = String(value || '').trim();
    return text || '없음';
};

const formatLongComparisonText = (value: unknown, maxLength = 220): string => {
    const text = formatComparisonValue(value);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}…`;
};

const parseReassessmentAuditNote = (note?: string) => {
    const text = String(note || '');
    const scoreMatch = text.match(/점수\s*(\d+)→(\d+)/);
    const levelMatch = text.match(/등급\s*([^|]+?)→([^|]+?)(?:\s*\||$)/);

    if (!scoreMatch) return null;

    const previousScore = Number(scoreMatch[1]);
    const nextScore = Number(scoreMatch[2]);

    return {
        previousScore,
        nextScore,
        delta: nextScore - previousScore,
        previousLevel: String(levelMatch?.[1] || '').trim(),
        nextLevel: String(levelMatch?.[2] || '').trim(),
    };
};

const isRecentlyCorrected = (record: WorkerRecord): boolean => {
    const timestamp = getLatestCorrectionTimestamp(record);
    if (!timestamp) return false;
    return Date.now() - timestamp <= 24 * 60 * 60 * 1000;
};

const parseTimestampToMs = (value?: string | null): number => {
    if (!value) return 0;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const getLatestRecordActivityTimestamp = (record: WorkerRecord): number => {
    const timestamps: number[] = [];
    const pushTimestamp = (value?: string | null) => {
        const parsed = parseTimestampToMs(value);
        if (parsed > 0) timestamps.push(parsed);
    };

    (record.auditTrail || []).forEach((entry) => pushTimestamp(entry.timestamp));
    (record.correctionHistory || []).forEach((entry) => pushTimestamp(entry.timestamp));
    (record.actionHistory || []).forEach((entry) => pushTimestamp(entry.timestamp));
    (record.approvalHistory || []).forEach((entry) => pushTimestamp(entry.timestamp));
    pushTimestamp(record.approvedAt);

    if (timestamps.length === 0) return 0;
    return Math.max(...timestamps);
};

type RecordSortMode = 'recent-correction' | 'score-desc' | 'failed-first' | 'error-type';

type WorkerAccumulationGroup = {
    key: string;
    latestRecord: WorkerRecord;
    records: WorkerRecord[];
    averageScore: number;
    latestScore: number;
    previousScore: number | null;
    deltaScore: number | null;
    monthCount: number;
    dateRangeLabel: string;
    failedCount: number;
    finalizedCount: number;
    jobFields: string[];
    teamLeaders: string[];
    trackingMode: 'exact' | 'candidate';
    trackingReviewRequired: boolean;
    trackingReviewReason: string;
    exactIdentityCount: number;
    sameDateDuplicateCount: number;
};

const getRecordSortModeLabel = (mode: RecordSortMode): string => {
    switch (mode) {
        case 'score-desc':
            return '응답품질 높은순';
        case 'failed-first':
            return `우선 ${BRAND_STATUS_LABELS.attention}순`;
        case 'error-type':
            return `${BRAND_STATUS_LABELS.attention} 유형순`;
        default:
            return '최근 수정순';
    }
};

const getSafetyLevelDisplayLabel = (level: WorkerRecord['safetyLevel']): string => {
    switch (level) {
        case '고급':
            return '고급 · 안정적';
        case '중급':
            return '중급 · 관찰 필요';
        case '초급':
            return '초급 · 집중 케어';
        default:
            return level;
    }
};

const getOcrErrorTypePriority = (errorType: OcrErrorType): number => {
    switch (errorType) {
        case 'LAYOUT':
            return 0;
        case 'QUALITY':
            return 1;
        case 'RESOLUTION':
            return 2;
        case 'HANDWRITING':
            return 3;
        default:
            return 4;
    }
};

const getSecondPassEligibility = (record: WorkerRecord, editedOnly = false): { eligible: boolean; reason?: string } => {
    if (isFailedRecord(record)) {
        return { eligible: false, reason: `OCR ${BRAND_STATUS_LABELS.attentionHold} 기록` };
    }

    if (editedOnly && !hasManagerCorrections(record)) {
        return { eligible: false, reason: '관리자 수정이력 없음' };
    }

    const hasSourceText =
        String(record.fullText || '').trim().length > 0 ||
        String(record.koreanTranslation || '').trim().length > 0 ||
        (record.handwrittenAnswers || []).some(answer => String(answer?.answerText || '').trim().length > 0);

    if (!hasSourceText) {
        return { eligible: false, reason: '원문 텍스트 없음' };
    }

    if (!String(record.name || '').trim()) {
        return { eligible: false, reason: '근로자명 없음' };
    }

    return { eligible: true };
};

const isHardRetryTarget = (r: WorkerRecord): boolean => {
    if (r.ocrErrorType) return true;

    const insight = String(r.aiInsights || '').toLowerCase();
    return (
        insight.includes('429') ||
        insight.includes('resource_exhausted') ||
        insight.includes('api 키') ||
        insight.includes('설정 화면') ||
        insight.includes('할당량') ||
        insight.includes('분석 실패') ||
        insight.includes('재시도 필요') ||
        insight.includes('원본 이미지 데이터 소실')
    );
};

// 우선순위 점수: 낮을수록 먼저 처리 (0=최고우선)
const getRetryPriorityScore = (r: WorkerRecord): number => {
    if (r.ocrErrorType) return 0; // OCR 오류
    const insight = String(r.aiInsights || '').toLowerCase();
    if (insight.includes('할당량') || insight.includes('분석 실패') || insight.includes('재시도 필요')) return 1;
    if (typeof r.ocrConfidence === 'number' && r.ocrConfidence < 0.5) return 2; // 신뢰도 극저
    return 3; // 저신뢰
};

const getFlag = (nationality: string) => {
    const n = (nationality || '').toLowerCase();
    if (n.includes('베트남') || n.includes('vietnam')) return '🇻🇳';
    if (n.includes('중국') || n.includes('china')) return '🇨🇳';
    if (n.includes('태국') || n.includes('thailand')) return '🇹🇭';
    if (n.includes('우즈벡') || n.includes('uzbekistan')) return '🇺🇿';
    if (n.includes('캄보디아') || n.includes('cambodia')) return '🇰🇭';
    if (n.includes('몽골') || n.includes('mongolia')) return '🇲🇳';
    if (n.includes('필리핀')) return '🇵🇭';
    if (n.includes('인도네시아')) return '🇮🇩';
    if (n.includes('카자흐스탄')) return '🇰🇿';
    if (n.includes('네팔')) return '🇳🇵';
    if (n.includes('미얀마')) return '🇲🇲';
    if (n.includes('한국') || n.includes('korea') || n.includes('대한민국')) return '🇰🇷';
    return ''; 
};

const getLeaderIcon = (record: WorkerRecord) => {
    const badges = [];
    if (record.role === 'leader' || (record.name === record.teamLeader)) {
        badges.push(<span key="leader" className="text-yellow-500 text-sm" title="팀장">👑</span>);
    } else if (record.role === 'sub_leader') {
        badges.push(<span key="sub" className="text-slate-400 text-sm font-bold" title="부팀장">🛡️</span>);
    }
    if (record.isTranslator) {
        const flag = getFlag(record.nationality);
        badges.push(<span key="trans" className="text-sm" title="통역 담당">{flag}🗣️</span>);
    }
    if (record.isSignalman) {
        badges.push(<span key="signal" className="text-sm" title="신호수 (장비 유도)">🚦</span>);
    }
    if (badges.length === 0) return null;
    return <span className="flex items-center gap-1">{badges}</span>;
};

interface OcrAnalysisProps {
    onAnalysisComplete: (records: WorkerRecord[]) => void;
    existingRecords: WorkerRecord[];
    onDeleteAll: () => void;
    onImport: (records: WorkerRecord[]) => void | WorkerRecord[] | Promise<void | WorkerRecord[]>;
    onViewDetails: (record: WorkerRecord) => void;
    onOpenReport: (record: WorkerRecord) => void;
    onDeleteRecord: (recordId: string) => void;
    onUpdateRecord: (record: WorkerRecord) => void;
    onNavigateToPredictive?: () => void;
    isStartChecklistIncomplete?: boolean;
}

type RetryDiagnostics = {
    total: number;
    success: number;
    fail: number;
    serverSuccess: number;
    clientFallbackSuccess: number;
    preflightFail: number;
    processingFail: number;
    serverRouteFail: number;
    lastUpdatedAt: string;
};

const OcrAnalysis: React.FC<OcrAnalysisProps> = ({ 
    onAnalysisComplete, 
    existingRecords, 
    onDeleteAll, 
    onImport, 
    onViewDetails, 
    onOpenReport,
    onDeleteRecord, 
    onUpdateRecord,
    onNavigateToPredictive,
    isStartChecklistIncomplete = false,
}) => {
    const { isDevMode } = useDevMode();
    const { mode: operationalMode } = useOperationalMode();
    const isImmediateOperationalMode = operationalMode === 'immediate';
    const storedViewState = getStoredOcrViewState();
    const [files, setFiles] = useState<File[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState('');
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [cooldownTime, setCooldownTime] = useState(0); // For UI countdown
    const [searchTerm, setSearchTerm] = useState(() => storedViewState.searchTerm || '');
    const [filterLevel, setFilterLevel] = useState<string>(() => storedViewState.filterLevel || 'all');
    const [filterField, setFilterField] = useState<string>(() => storedViewState.filterField || 'all');
    const [filterLeader, setFilterLeader] = useState<string>(() => storedViewState.filterLeader || 'all');
    const [filterTrust, setFilterTrust] = useState<'all' | 'pending' | 'finalized'>(() => storedViewState.filterTrust || 'all');
    const [filterReason, setFilterReason] = useState<'all' | 'has-reason' | 'missing-reason' | 'weak-reason'>(() => storedViewState.filterReason || 'all');
    const [secondPassStatusFilter, setSecondPassStatusFilter] = useState<'all' | 'done' | 'not-done'>(() => storedViewState.secondPassStatusFilter || 'all');
    const [secondPassEditedOnly, setSecondPassEditedOnly] = useState(() => storedViewState.secondPassEditedOnly ?? true);
    const [secondPassExcludedOnly, setSecondPassExcludedOnly] = useState(() => storedViewState.secondPassExcludedOnly ?? false);
    const [secondPassReasonFilter, setSecondPassReasonFilter] = useState<string>(() => storedViewState.secondPassReasonFilter || 'all');
    const [recordSortMode, setRecordSortMode] = useState<RecordSortMode>(() => storedViewState.recordSortMode || 'recent-correction');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchJobField, setBatchJobField] = useState('');
    const [batchTeamLeader, setBatchTeamLeader] = useState('');
    const [failedOnlyDefault, setFailedOnlyDefault] = useState<boolean>(() => getFailedOnlyDefaultOption());
    const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'failed'>(() => storedViewState.filterStatus || (getFailedOnlyDefaultOption() ? 'failed' : 'all'));
    const [dailyCounter, setDailyCounter] = useState<DailyCounterState>(() => getApiCallState());
    const [importValidationSummary, setImportValidationSummary] = useState<string>('');
    const [importValidationDetails, setImportValidationDetails] = useState<string>('');
    const [masterTemplates, setMasterTemplates] = useState<MasterTemplate[]>([]);
    const [selectedMasterTemplateId, setSelectedMasterTemplateId] = useState('');
    const [masterGroups, setMasterGroups] = useState<MasterGroup[]>([]);
    const [masterAssignments, setMasterAssignments] = useState<MasterAssignmentItem[]>([]);
    const [isMasterDataLoading, setIsMasterDataLoading] = useState(false);
    const [hasMasterDataFetched, setHasMasterDataFetched] = useState(false);
    const [masterDataLoadedAt, setMasterDataLoadedAt] = useState('');
    const [openMasterSection, setOpenMasterSection] = useState<'templates' | 'assignments' | null>(null);
    const [retryDiagnostics, setRetryDiagnostics] = useState<RetryDiagnostics | null>(null);
    const [showAdvancedOcrControls, setShowAdvancedOcrControls] = useState(false);
    const [showAdminActivityPanel, setShowAdminActivityPanel] = useState(false);
    const [showReasonQaDetailPanel, setShowReasonQaDetailPanel] = useState(false);
    const [showRetryDetailPanel, setShowRetryDetailPanel] = useState(false);
    const [showFailedQuickActions, setShowFailedQuickActions] = useState(false);
    const [autoScrollFailedQuickActions, setAutoScrollFailedQuickActions] = useState(false);
    const [showQuickUtilityActions, setShowQuickUtilityActions] = useState(false);
    const [showExtendedOverviewMetrics, setShowExtendedOverviewMetrics] = useState(false);
    const [showDashboardIntroDetail, setShowDashboardIntroDetail] = useState(false);
    const [isNewOcrSectionCollapsed, setIsNewOcrSectionCollapsed] = useState(false);
    const [showWorkerSignalDetails, setShowWorkerSignalDetails] = useState(false);
    const [showWorkerExtraActions, setShowWorkerExtraActions] = useState(false);
    const [showAllFailureCodeCards, setShowAllFailureCodeCards] = useState(false);
    const [showMobileUtilityPanel, setShowMobileUtilityPanel] = useState(false);
    const [showPostAnalysisCta, setShowPostAnalysisCta] = useState(false);
    const [showAllWorkerAccumulations, setShowAllWorkerAccumulations] = useState(false);
    const [showRecordControlPanel, setShowRecordControlPanel] = useState(false);
    const [showWorkerTrackingPanel, setShowWorkerTrackingPanel] = useState(false);
    const [showRecordListPanel, setShowRecordListPanel] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 640 : true));
    const [focusedWorkerGroupKey, setFocusedWorkerGroupKey] = useState<string | null>(null);
    const [mobileMode, setMobileMode] = useState<'quick' | 'detailed'>('quick');
    const [recordScopeFilter, setRecordScopeFilter] = useState<OcrRecordScopeFilter>(() => storedViewState.recordScopeFilter || 'ocr-only');
    const [recordMonthFilter, setRecordMonthFilter] = useState<string>(() => storedViewState.recordMonthFilter || 'all');
    const [recordRenderLimit, setRecordRenderLimit] = useState(INITIAL_RECORD_RENDER_LIMIT);
    const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
    const [isPaidApiMode, setIsPaidApiMode] = useState<boolean>(() => getIsPaidApiMode());
    const [exportFeedback, setExportFeedback] = useState<ExportFeedback>(null);
    const masterDataLoadingRef = useRef(false);
    
    // JSON 품질 데이터 로드
    const { data: qualityData, loading: qualityLoading } = useJudgmentTaggingQuality();

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const syncApiMode = () => setIsPaidApiMode(getIsPaidApiMode());
        syncApiMode();
        window.addEventListener(API_MODE_CHANGED_EVENT, syncApiMode);
        window.addEventListener('storage', syncApiMode);
        return () => {
            window.removeEventListener(API_MODE_CHANGED_EVENT, syncApiMode);
            window.removeEventListener('storage', syncApiMode);
        };
    }, []);

    const ocrExecutionKeyStatus = useMemo(() => resolveOcrExecutionKeyStatus({
        isPaidApiMode,
    }), [isPaidApiMode]);
    const [ocrEngine, setOcrEngine] = useState<OcrEngineMode>(() => getAiEngineSettings().ocrEngine);

    useEffect(() => {
        const syncEngine = () => setOcrEngine(getAiEngineSettings().ocrEngine);
        window.addEventListener(AI_ENGINE_SETTINGS_CHANGED_EVENT, syncEngine);
        return () => window.removeEventListener(AI_ENGINE_SETTINGS_CHANGED_EVENT, syncEngine);
    }, []);

    const handleOcrEngineChange = (nextEngine: OcrEngineMode) => {
        if (nextEngine === 'openai-precise') {
            alert('ChatGPT Plus 구독과 프로그램 분석 연결 권한은 서로 다릅니다. 현재 OpenAI 분석 연결키가 없어 이 방식을 선택할 수 없습니다.');
            return;
        }
        setOcrEngine(nextEngine);
        setAiEngineSettings({ ...getAiEngineSettings(), ocrEngine: nextEngine });
    };

    const syncHarnessAnalyzeResult = useCallback(async (record: WorkerRecord, fileNameOverride?: string) => {
        const fallbackPatch: Partial<WorkerRecord> = {
            secondPassStatus: isFailedRecord(record) ? 'NEEDED' : 'DONE',
            workflowState: isFailedRecord(record) ? 'manual_review_required' : 'completed',
            riskDecision: isFailedRecord(record) ? 'IMMEDIATE_ATTENTION' : 'SAFE_TO_PROCEED',
            approvalState: isFailedRecord(record) ? 'PENDING' : 'APPROVED',
        };

        try {
            const harness = await analyzeHarnessRecord(buildHarnessPayloadFromRecord(record, fileNameOverride));
            return withHarnessState(record, {
                workflowRunId: harness.workflowRunId || record.workflowRunId,
                workflowState: harness.decision.workflowState,
                riskDecision: harness.decision.riskDecision,
                approvalState: harness.decision.approvalState,
                secondPassStatus: harness.decision.secondPassStatus,
                harnessPersistenceWarning: harness.persistence?.warning || undefined,
                auditTrail: harness.persistence?.warning
                    ? [
                        ...(record.auditTrail || []),
                        {
                            stage: 'validation',
                            timestamp: new Date().toISOString(),
                            actor: 'psi-harness',
                            note: `Harness 분석 저장 보완: ${harness.persistence.warning}`,
                        },
                    ]
                    : record.auditTrail,
            });
        } catch (error) {
            return withHarnessState(record, {
                ...fallbackPatch,
                harnessPersistenceWarning: extractMessage(error),
                auditTrail: [
                    ...(record.auditTrail || []),
                    {
                        stage: 'validation',
                        timestamp: new Date().toISOString(),
                        actor: 'psi-harness',
                        note: `Harness 분석 동기화 실패: ${extractMessage(error)}`,
                    },
                ],
            });
        }
    }, []);

    const syncHarnessReanalyzeResult = useCallback(async (record: WorkerRecord, sourceRecord: WorkerRecord) => {
        const fallbackPatch: Partial<WorkerRecord> = {
            secondPassStatus: isFailedRecord(record) ? 'NEEDED' : 'DONE',
            workflowState: isFailedRecord(record) ? 'manual_review_required' : 'completed',
            riskDecision: isFailedRecord(record) ? 'IMMEDIATE_ATTENTION' : 'SAFE_TO_PROCEED',
            approvalState: isFailedRecord(record) ? 'PENDING' : 'APPROVED',
        };

        try {
            const harness = await reanalyzeHarnessRecord({
                ...buildHarnessPayloadFromRecord(record),
                workflowRunId: sourceRecord.workflowRunId || sourceRecord.id,
                revisedBy: 'manager',
            });

            return withHarnessState(record, {
                workflowRunId: harness.workflowRunId || sourceRecord.workflowRunId || sourceRecord.id,
                workflowState: harness.decision.workflowState,
                riskDecision: harness.decision.riskDecision,
                approvalState: harness.decision.approvalState,
                secondPassStatus: harness.decision.secondPassStatus,
                harnessPersistenceWarning: harness.persistence?.warning || undefined,
                auditTrail: harness.persistence?.warning
                    ? [
                        ...(record.auditTrail || []),
                        {
                            stage: 'reassessment',
                            timestamp: new Date().toISOString(),
                            actor: 'psi-harness',
                            note: `Harness 재분석 저장 보완: ${harness.persistence.warning}`,
                        },
                    ]
                    : record.auditTrail,
            });
        } catch (error) {
            return withHarnessState(record, {
                ...fallbackPatch,
                harnessPersistenceWarning: extractMessage(error),
                auditTrail: [
                    ...(record.auditTrail || []),
                    {
                        stage: 'reassessment',
                        timestamp: new Date().toISOString(),
                        actor: 'psi-harness',
                        note: `Harness 재분석 동기화 실패: ${extractMessage(error)}`,
                    },
                ],
            });
        }
    }, []);

    const fetchMasterGroups = useCallback(async () => {
        return supabase
            .from('record_master_groups')
            .select('id, name')
            .order('updated_at', { ascending: false });
    }, []);

    const fetchMasterAssignments = useCallback(async () => {
        const assignmentViewResult = await supabase
            .from('record_master_assignment_groups')
            .select('id, group_id, template_id, status, effective_date')
            .order('updated_at', { ascending: false });

        if (!assignmentViewResult.error) {
            return assignmentViewResult;
        }

        const groupColumnResult = await supabase
            .from('record_master_assignments')
            .select('id, group_id, template_id, status, effective_date')
            .order('updated_at', { ascending: false });

        if (!groupColumnResult.error) {
            return groupColumnResult;
        }

        return groupColumnResult;
    }, []);

    const insertMasterGroup = useCallback(async (name: string) => {
        return supabase
            .from('record_master_groups')
            .insert({ name })
            .select('id, name')
            .single();
    }, []);

    const deleteMasterGroup = useCallback(async (groupId: string) => {
        return supabase
            .from('record_master_groups')
            .delete()
            .eq('id', groupId);
    }, []);

    const loadMasterData = useCallback(async () => {
        if (masterDataLoadingRef.current) {
            return;
        }

        masterDataLoadingRef.current = true;
        setIsMasterDataLoading(true);

        try {
            const [templateResult, groupResult, assignmentResult] = await Promise.all([
                supabase
                    .from('record_master_templates')
                    .select('id, name, version, field_schema, updated_at')
                    .order('updated_at', { ascending: false }),
                fetchMasterGroups(),
                fetchMasterAssignments(),
            ]);

            if (templateResult.error || groupResult.error || assignmentResult.error) {
                const firstError = templateResult.error || groupResult.error || assignmentResult.error;
                if (!handleSupabasePermissionError(firstError)) {
                    alert(buildMasterDataLoadErrorMessage(firstError?.message));
                }
                return;
            }

            const mappedTemplates: MasterTemplate[] = (templateResult.data || []).map((row: any) => ({
                id: String(row.id),
                name: String(row.name || ''),
                version: String(row.version || ''),
                fieldSchema: String(row.field_schema || ''),
                updatedAt: String(row.updated_at || '').replace('T', ' ').slice(0, 16),
            }));

            const mappedGroups: MasterGroup[] = (groupResult.data || []).map((row: any) => ({
                id: String(row.id),
                name: String(row.name || ''),
            }));

            const mappedAssignments: MasterAssignmentItem[] = (assignmentResult.data || []).map((row: any) => ({
                id: String(row.id),
                groupId: String(row.group_id || ''),
                templateId: String(row.template_id),
                status: row.status === 'inactive' ? 'inactive' : 'active',
                effectiveDate: String(row.effective_date || ''),
            }));

            setMasterTemplates(mappedTemplates);
            setMasterGroups(mappedGroups);
            setMasterAssignments(mappedAssignments);
            setSelectedMasterTemplateId((prev) => prev || mappedTemplates[0]?.id || '');
            setHasMasterDataFetched(true);
            setMasterDataLoadedAt(new Date().toLocaleString('ko-KR', {
                hour12: false,
            }));
        } finally {
            masterDataLoadingRef.current = false;
            setIsMasterDataLoading(false);
        }
    }, [fetchMasterAssignments, fetchMasterGroups]);

    useEffect(() => {
        try {
            localStorage.setItem(OCR_FAILED_ONLY_DEFAULT_KEY, failedOnlyDefault ? '1' : '0');
        } catch {
            // ignore storage errors
        }
    }, [failedOnlyDefault]);

    useEffect(() => {
        try {
            const nextState: OcrViewState = {
                savedAt: Date.now(),
                searchTerm,
                filterLevel,
                filterField,
                filterLeader,
                filterTrust,
                filterReason,
                filterStatus,
                secondPassStatusFilter,
                secondPassEditedOnly,
                secondPassExcludedOnly,
                secondPassReasonFilter,
                recordSortMode,
                recordScopeFilter,
                recordMonthFilter,
            };
            localStorage.setItem(OCR_VIEW_STATE_KEY, JSON.stringify(nextState));
        } catch {
            // ignore storage errors
        }
    }, [searchTerm, filterLevel, filterField, filterLeader, filterTrust, filterReason, filterStatus, secondPassStatusFilter, secondPassEditedOnly, secondPassExcludedOnly, secondPassReasonFilter, recordSortMode, recordScopeFilter, recordMonthFilter]);

    const handleCreateMasterTemplate = async (payload: { name: string; version: string; fieldSchema: string }) => {
        const result = await supabase
            .from('record_master_templates')
            .insert({
                name: payload.name,
                version: payload.version,
                field_schema: payload.fieldSchema,
            })
            .select('id, name, version, field_schema, updated_at')
            .single();

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`템플릿 생성 실패: ${result.error.message}`);
            }
            return;
        }

        const next: MasterTemplate = {
            id: String(result.data.id),
            name: String(result.data.name || ''),
            version: String(result.data.version || ''),
            fieldSchema: String(result.data.field_schema || ''),
            updatedAt: String(result.data.updated_at || '').replace('T', ' ').slice(0, 16),
        };

        setMasterTemplates((prev) => [next, ...prev]);
        setSelectedMasterTemplateId(next.id);
    };

    const handleDeleteMasterTemplate = async (templateId: string) => {
        if (!confirm('해당 템플릿을 삭제하시겠습니까?')) return;

        const result = await supabase
            .from('record_master_templates')
            .delete()
            .eq('id', templateId);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`템플릿 삭제 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterTemplates((prev) => prev.filter((item) => item.id !== templateId));
        setMasterAssignments((prev) => prev.filter((item) => item.templateId !== templateId));
        setSelectedMasterTemplateId((prev) => (prev === templateId ? '' : prev));
    };

    const handleAddMasterGroup = async (groupName: string) => {
        const normalized = groupName.trim();
        if (!normalized) return;

        const result = await insertMasterGroup(normalized);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`공종/팀 그룹 추가 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterGroups((prev) => [{ id: String(result.data.id), name: String(result.data.name || '') }, ...prev]);
    };

    const handleDeleteMasterGroup = async (groupId: string) => {
        const result = await deleteMasterGroup(groupId);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`공종/팀 그룹 삭제 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterGroups((prev) => prev.filter((group) => group.id !== groupId));
        setMasterAssignments((prev) => prev.filter((item) => item.groupId !== groupId));
    };

    const handleCreateMasterAssignment = async (payload: { groupId: string; templateId: string; effectiveDate: string }) => {
        const primaryResult = await supabase
            .from('record_master_assignments')
            .upsert(
                {
                    group_id: payload.groupId,
                    template_id: payload.templateId,
                    status: 'active',
                    effective_date: payload.effectiveDate,
                },
                { onConflict: 'group_id,template_id' }
            )
            .select('id, group_id, template_id, status, effective_date')
            .single();

        const result = primaryResult;

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`배정 저장 확인 필요: ${result.error.message}`);
            }
            return;
        }

        const next: MasterAssignmentItem = {
            id: String(result.data.id),
            groupId: String((result.data as any).group_id || ''),
            templateId: String(result.data.template_id),
            status: result.data.status === 'inactive' ? 'inactive' : 'active',
            effectiveDate: String(result.data.effective_date || ''),
        };

        setMasterAssignments((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === next.id);
            if (existingIndex >= 0) {
                return prev.map((item, index) => (index === existingIndex ? next : item));
            }
            return [next, ...prev.filter((item) => !(item.groupId === next.groupId && item.templateId === next.templateId))];
        });
    };

    const handleDeleteMasterAssignment = async (assignmentId: string) => {
        const result = await supabase
            .from('record_master_assignments')
            .delete()
            .eq('id', assignmentId);

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`배정 삭제 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
    };

    const handleSetMasterAssignmentStatus = async (assignmentId: string, status: 'active' | 'inactive') => {
        const result = await supabase
            .from('record_master_assignments')
            .update({ status })
            .eq('id', assignmentId)
            .select('id')
            .single();

        if (result.error) {
            if (!handleSupabasePermissionError(result.error)) {
                alert(`상태 변경 실패: ${result.error.message}`);
            }
            return;
        }

        setMasterAssignments((prev) => prev.map((item) => (
            item.id === assignmentId ? { ...item, status } : item
        )));
    };

    const getExpectedSafetyLevel = useCallback((record: WorkerRecord): WorkerRecord['safetyLevel'] => {
        const score = typeof record.safetyScore === 'number' ? record.safetyScore : 0;
        return getSafetyLevelFromScore(score);
    }, []);

    const isGradeFinalizedByReview = useCallback((record: WorkerRecord): boolean => {
        if (record.reviewStatus === 'APPROVED') return true;
        if (record.approvalStatus === 'APPROVED' || record.approvalStatus === 'OVERRIDDEN') return true;

        const approvalHistory = record.approvalHistory || [];
        if (approvalHistory.length === 0) return false;
        const latest = approvalHistory[approvalHistory.length - 1];
        return latest?.status === 'approved';
    }, []);

    const needsGradeRevalidation = useCallback((record: WorkerRecord): boolean => {
        if (isGradeFinalizedByReview(record)) return false;
        return record.safetyLevel !== getExpectedSafetyLevel(record);
    }, [getExpectedSafetyLevel, isGradeFinalizedByReview]);

    const getReviewTrustState = useCallback((record: WorkerRecord): 'FINALIZED' | 'PENDING' | 'NONE' => {
        if (isGradeFinalizedByReview(record)) return 'FINALIZED';

        const hasReviewTrail = (record.approvalHistory || []).length > 0;
        const isPending = record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING';

        if (isPending || hasReviewTrail) return 'PENDING';
        return 'NONE';
    }, [isGradeFinalizedByReview]);
    
    // Strict stop control
    const stopRef = useRef<boolean>(false);
    const importInputRef = useRef<HTMLInputElement>(null);
    const failedQuickActionsRef = useRef<HTMLDivElement>(null);
    const newOcrCaptureSectionRef = useRef<HTMLDivElement>(null);
    const evidenceReadinessSectionRef = useRef<HTMLDivElement>(null);
    const workerTrackingSectionRef = useRef<HTMLDivElement>(null);

    const { guideMessage: mobileBackGuideMessage } = useMobileBackGuard({
        hasActiveWork: isAnalyzing || files.length > 0,
        guardStateKey: '__ocrBackGuard',
        confirmExitMessage: '분석 또는 입력이 진행 중입니다.\n저장된 범위까지만 유지하고 이전 화면으로 이동하시겠습니까?',
        stayMessage: '현재 화면에서 계속 작업합니다.',
        idleBackMessage: '한 번 더 누르면 이전 화면으로 이동합니다.',
        exitMessage: '이전 화면으로 이동합니다.',
    });

    // Prevent accidental close during analysis
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isAnalyzing) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isAnalyzing]);

    const deferredSearchTerm = useDeferredValue(searchTerm);
    const normalizedDeferredSearchTerm = useMemo(() => deferredSearchTerm.trim().toLowerCase(), [deferredSearchTerm]);
    const isSearchDeferred = deferredSearchTerm !== searchTerm;

    const recordMonthIndexes = useMemo(() => {
        const ocrRecords: WorkerRecord[] = [];
        existingRecords.forEach((record) => {
            if (isOcrAnalyzedRecord(record)) ocrRecords.push(record);
        });

        return {
            all: buildOcrRecordMonthIndex(existingRecords),
            ocr: buildOcrRecordMonthIndex(ocrRecords),
        };
    }, [existingRecords]);

    const allRecordMonthIndex = recordMonthIndexes.all;
    const ocrRecordMonthIndex = recordMonthIndexes.ocr;
    const ocrAnalyzedRecords = ocrRecordMonthIndex.records;

    const sourceRecordMonthIndex = useMemo(() => {
        return recordScopeFilter === 'ocr-only' ? ocrRecordMonthIndex : allRecordMonthIndex;
    }, [allRecordMonthIndex, ocrRecordMonthIndex, recordScopeFilter]);

    const recordMonthOptions = useMemo(() => {
        return [
            {
                key: 'all',
                label: '전체 월',
                count: sourceRecordMonthIndex.total,
                failedCount: sourceRecordMonthIndex.totalFailedCount,
                averageScore: sourceRecordMonthIndex.averageScore,
                latestDateLabel: sourceRecordMonthIndex.buckets[0]?.latestDateLabel || '날짜 미확인',
            },
            ...sourceRecordMonthIndex.buckets.map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                count: bucket.count,
                failedCount: bucket.failedCount,
                averageScore: bucket.averageScore,
                latestDateLabel: bucket.latestDateLabel,
            })),
        ];
    }, [sourceRecordMonthIndex]);

    const autoMonthFirstAppliedRef = useRef('');

    useEffect(() => {
        const latestMonthKey = sourceRecordMonthIndex.latestMonthKey;
        const autoKey = `${recordScopeFilter}:${sourceRecordMonthIndex.total}:${latestMonthKey}`;
        if (!sourceRecordMonthIndex.largeDataset) return;
        if (recordMonthFilter !== 'all') return;
        if (!latestMonthKey || latestMonthKey === 'all') return;
        if (autoMonthFirstAppliedRef.current === autoKey) return;

        autoMonthFirstAppliedRef.current = autoKey;
        setRecordMonthFilter(latestMonthKey);
        setRecordRenderLimit(INITIAL_RECORD_RENDER_LIMIT);
        setFocusedWorkerGroupKey(null);
        setSelectedIds([]);
    }, [recordMonthFilter, recordScopeFilter, sourceRecordMonthIndex.largeDataset, sourceRecordMonthIndex.latestMonthKey, sourceRecordMonthIndex.total]);

    useEffect(() => {
        if (recordMonthFilter === 'all') return;
        if (recordMonthOptions.some((option) => option.key === recordMonthFilter)) return;
        setRecordMonthFilter('all');
    }, [recordMonthFilter, recordMonthOptions]);

    const monthScopedRecords = useMemo(() => {
        if (recordMonthFilter === 'all') return sourceRecordMonthIndex.records;
        return sourceRecordMonthIndex.bucketByKey.get(recordMonthFilter)?.records || [];
    }, [recordMonthFilter, sourceRecordMonthIndex]);

    const selectedMonthLabel = useMemo(() => {
        return recordMonthOptions.find((option) => option.key === recordMonthFilter)?.label || '전체 월';
    }, [recordMonthFilter, recordMonthOptions]);

    const selectedMonthBucket = useMemo(() => {
        if (recordMonthFilter === 'all') return null;
        return sourceRecordMonthIndex.bucketByKey.get(recordMonthFilter) || null;
    }, [recordMonthFilter, sourceRecordMonthIndex]);

    const activeMonthStats = useMemo(() => {
        if (selectedMonthBucket) {
            return {
                count: selectedMonthBucket.count,
                failedCount: selectedMonthBucket.failedCount,
                averageScore: selectedMonthBucket.averageScore,
                imageReadyCount: selectedMonthBucket.imageReadyCount,
                latestDateLabel: selectedMonthBucket.latestDateLabel,
            };
        }

        return {
            count: sourceRecordMonthIndex.total,
            failedCount: sourceRecordMonthIndex.totalFailedCount,
            averageScore: sourceRecordMonthIndex.averageScore,
            imageReadyCount: sourceRecordMonthIndex.totalImageReadyCount,
            latestDateLabel: sourceRecordMonthIndex.buckets[0]?.latestDateLabel || '날짜 미확인',
        };
    }, [selectedMonthBucket, sourceRecordMonthIndex]);

    const monthlyWorkingSetLabel = sourceRecordMonthIndex.largeDataset
        ? recordMonthFilter === 'all'
            ? '전체 월 수동 보기'
            : '월 단위 작업세트'
        : '표준 보기';

    const teamLeaders = useMemo(() => {
        const leaders = new Set(monthScopedRecords.map(r => r.teamLeader || '미지정'));
        return Array.from(leaders).sort();
    }, [monthScopedRecords]);

    const jobFields = useMemo(() => {
        const fields = new Set(monthScopedRecords.map(r => r.jobField).filter(Boolean));
        return Array.from(fields).sort();
    }, [monthScopedRecords]);

    const baseFilteredRecords = useMemo(() => {
        return monthScopedRecords.filter(r => {
            const searchStr = `${r.name || ''} ${r.jobField || ''} ${r.nationality || ''} ${r.teamLeader || ''}`.toLowerCase();
            const matchesSearch = !normalizedDeferredSearchTerm || searchStr.includes(normalizedDeferredSearchTerm);
            const matchesLevel = filterLevel === 'all' || r.safetyLevel === filterLevel;
            const matchesField = filterField === 'all' || r.jobField === filterField;
            const matchesLeader = filterLeader === 'all' || (r.teamLeader || '미지정') === filterLeader;
            const trustState = getReviewTrustState(r);
            const matchesTrust =
                filterTrust === 'all' ||
                (filterTrust === 'pending' && trustState === 'PENDING') ||
                (filterTrust === 'finalized' && trustState === 'FINALIZED');

            const decisionReason = getLatestDecisionReason(r);
            const matchesReason =
                filterReason === 'all' ||
                (filterReason === 'has-reason' && decisionReason.length > 0) ||
                (filterReason === 'missing-reason' && decisionReason.length === 0) ||
                (filterReason === 'weak-reason' && hasWeakDecisionReason(r));

            const recordFailed = isFailedRecord(r);
            const matchesStatus = 
                filterStatus === 'all' ||
                (filterStatus === 'success' && !recordFailed) ||
                (filterStatus === 'failed' && recordFailed);
            const matchesSecondPassStatus =
                secondPassStatusFilter === 'all' ||
                (secondPassStatusFilter === 'done' && r.secondPassStatus === 'DONE') ||
                (secondPassStatusFilter === 'not-done' && r.secondPassStatus !== 'DONE');
            return matchesSearch && matchesLevel && matchesField && matchesLeader && matchesTrust && matchesReason && matchesStatus && matchesSecondPassStatus;
        });
    }, [monthScopedRecords, normalizedDeferredSearchTerm, filterLevel, filterField, filterLeader, filterTrust, filterReason, filterStatus, secondPassStatusFilter, getReviewTrustState]);

    const secondPassSkippedCounts = useMemo(() => {
        return baseFilteredRecords.reduce<Record<string, number>>((acc, record) => {
            const eligibility = getSecondPassEligibility(record, secondPassEditedOnly);
            if (!eligibility.eligible && eligibility.reason) {
                acc[eligibility.reason] = (acc[eligibility.reason] || 0) + 1;
            }
            return acc;
        }, {});
    }, [baseFilteredRecords, secondPassEditedOnly]);

    const filteredRecords = useMemo(() => {
        const filteredBySecondPass = baseFilteredRecords.filter(record => {
            const secondPassEligibility = getSecondPassEligibility(record, secondPassEditedOnly);
            const matchesExcludedOnly = !secondPassExcludedOnly || !secondPassEligibility.eligible;
            const matchesReason =
                secondPassReasonFilter === 'all' ||
                (!secondPassEligibility.eligible && secondPassEligibility.reason === secondPassReasonFilter);

            return matchesExcludedOnly && matchesReason;
        });

        return [...filteredBySecondPass].sort((a, b) => {
            if (recordSortMode === 'error-type') {
                const aFailed = isFailedRecord(a);
                const bFailed = isFailedRecord(b);
                const failedDiff = Number(bFailed) - Number(aFailed);
                if (failedDiff !== 0) return failedDiff;

                if (aFailed && bFailed) {
                    const typeDiff = getOcrErrorTypePriority(getOcrErrorTypeFromRecord(a)) - getOcrErrorTypePriority(getOcrErrorTypeFromRecord(b));
                    if (typeDiff !== 0) return typeDiff;
                }
            }

            if (recordSortMode === 'failed-first') {
                const failedDiff = Number(isFailedRecord(b)) - Number(isFailedRecord(a));
                if (failedDiff !== 0) return failedDiff;
            }

            if (recordSortMode === 'score-desc') {
                const scoreDiff = (b.safetyScore || 0) - (a.safetyScore || 0);
                if (scoreDiff !== 0) return scoreDiff;
            }

            const aHasCorrection = hasManagerCorrections(a) ? 1 : 0;
            const bHasCorrection = hasManagerCorrections(b) ? 1 : 0;
            if (aHasCorrection !== bHasCorrection) return bHasCorrection - aHasCorrection;

            const correctionTimeDiff = getLatestCorrectionTimestamp(b) - getLatestCorrectionTimestamp(a);
            if (correctionTimeDiff !== 0) return correctionTimeDiff;

            return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
        });
    }, [baseFilteredRecords, secondPassEditedOnly, secondPassExcludedOnly, secondPassReasonFilter, recordSortMode]);

    const resetWorkerSearchFiltersForImport = useCallback(() => {
        setSearchTerm('');
        setFilterLevel('all');
        setFilterField('all');
        setFilterLeader('all');
        setFilterTrust('all');
        setFilterReason('all');
        setFilterStatus('all');
        setSecondPassStatusFilter('all');
        setSecondPassExcludedOnly(false);
        setSecondPassReasonFilter('all');
        setRecordSortMode('recent-correction');
        setRecordScopeFilter('ocr-only');
        setRecordMonthFilter('all');
        setRecordRenderLimit(INITIAL_RECORD_RENDER_LIMIT);
        setFailedOnlyDefault(false);
        setSelectedIds([]);
    }, []);

    const hasActiveRecordFilters = useMemo(() => {
        return Boolean(
            searchTerm.trim() ||
            filterLevel !== 'all' ||
            filterField !== 'all' ||
            filterLeader !== 'all' ||
            filterTrust !== 'all' ||
            filterReason !== 'all' ||
            filterStatus !== 'all' ||
            secondPassStatusFilter !== 'all' ||
            secondPassExcludedOnly ||
            secondPassReasonFilter !== 'all' ||
            recordMonthFilter !== 'all' ||
            recordScopeFilter !== 'ocr-only'
        );
    }, [filterField, filterLeader, filterLevel, filterReason, filterStatus, filterTrust, recordMonthFilter, recordScopeFilter, searchTerm, secondPassExcludedOnly, secondPassReasonFilter, secondPassStatusFilter]);

    const autoResetEmptyFilterRef = useRef(false);

    useEffect(() => {
        if (existingRecords.length === 0 || filteredRecords.length > 0) {
            autoResetEmptyFilterRef.current = false;
            return;
        }

        if (!hasActiveRecordFilters || autoResetEmptyFilterRef.current) return;

        autoResetEmptyFilterRef.current = true;
        resetWorkerSearchFiltersForImport();
        setImportValidationSummary('기존 근로자 기록이 필터에 가려져 전체 보기로 자동 전환했습니다.');
    }, [existingRecords.length, filteredRecords.length, hasActiveRecordFilters, resetWorkerSearchFiltersForImport]);

    const workerAccumulationGroups = useMemo<WorkerAccumulationGroup[]>(() => {
        const groupMap = new Map<string, WorkerRecord[]>();

        filteredRecords.forEach((record) => {
            const key = getWorkerAccumulationKey(record);
            const current = groupMap.get(key) || [];
            current.push(record);
            groupMap.set(key, current);
        });

        return Array.from(groupMap.entries()).map(([key, records]) => {
            const sortedDesc = [...records].sort((a, b) => getWorkerGroupDateValue(b) - getWorkerGroupDateValue(a));
            const sortedAsc = [...records].sort((a, b) => getWorkerGroupDateValue(a) - getWorkerGroupDateValue(b));
            const latestRecord = sortedDesc[0];
            const validScores = records
                .map((record) => Number(record.safetyScore))
                .filter((score) => Number.isFinite(score));
            const averageScore = validScores.length > 0
                ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
                : 0;
            const latestScore = Number.isFinite(Number(latestRecord.safetyScore)) ? Number(latestRecord.safetyScore) : 0;
            const previousRecord = sortedAsc.length > 1 ? sortedAsc[sortedAsc.length - 2] : null;
            const previousScore = previousRecord && Number.isFinite(Number(previousRecord.safetyScore))
                ? Number(previousRecord.safetyScore)
                : null;
            const deltaScore = previousScore === null ? null : latestScore - previousScore;
            const monthKeys = new Set(records.map(formatWorkerGroupMonth));
            const firstRecord = sortedAsc[0] || latestRecord;
            const dateRangeLabel = records.length > 1
                ? `${String(firstRecord.date || '').slice(0, 10)} ~ ${String(latestRecord.date || '').slice(0, 10)}`
                : String(latestRecord.date || '').slice(0, 10);
            const exactIdentityCount = new Set(records.map(getWorkerIdentityKey)).size;
            const sameDateDuplicateCount = getMaxDuplicateDateCount(records);
            const jobFields = Array.from(new Set(records.map((record) => record.jobField).filter(Boolean))).sort();
            const teamLeaders = Array.from(new Set(records.map((record) => record.teamLeader || '미지정').filter(Boolean))).sort();
            const trackingMode = records.length > 1 && exactIdentityCount > 1 ? 'candidate' : 'exact';
            const trackingReviewRequired =
                trackingMode === 'candidate' ||
                sameDateDuplicateCount > 1 ||
                jobFields.length > 1 ||
                teamLeaders.length > 1;

            return {
                key,
                latestRecord,
                records: sortedDesc,
                averageScore,
                latestScore,
                previousScore,
                deltaScore,
                monthCount: monthKeys.size,
                dateRangeLabel,
                failedCount: records.filter((record) => isFailedRecord(record)).length,
                finalizedCount: records.filter((record) => getReviewTrustState(record) === 'FINALIZED').length,
                jobFields,
                teamLeaders,
                trackingMode,
                trackingReviewRequired,
                trackingReviewReason: buildTrackingReviewReason(trackingMode, sameDateDuplicateCount, jobFields.length, teamLeaders.length),
                exactIdentityCount,
                sameDateDuplicateCount,
            };
        }).sort((a, b) => {
            const latestDateDiff = getWorkerGroupDateValue(b.latestRecord) - getWorkerGroupDateValue(a.latestRecord);
            if (latestDateDiff !== 0) return latestDateDiff;
            return String(a.latestRecord.name || '').localeCompare(String(b.latestRecord.name || ''), 'ko-KR');
        });
    }, [filteredRecords, getReviewTrustState]);

    const workerTrackingReviewSummary = useMemo(() => {
        const candidateGroups = workerAccumulationGroups.filter((group) => group.trackingMode === 'candidate' && group.records.length > 1);
        const reviewRequiredGroups = workerAccumulationGroups.filter((group) => group.trackingReviewRequired);
        const sameDateDuplicateGroups = workerAccumulationGroups.filter((group) => group.sameDateDuplicateCount > 1);
        return {
            exactGroups: workerAccumulationGroups.filter((group) => !group.trackingReviewRequired).length,
            candidateGroups: candidateGroups.length,
            reviewRequiredGroups: reviewRequiredGroups.length,
            sameDateDuplicateGroups: sameDateDuplicateGroups.length,
        };
    }, [workerAccumulationGroups]);

    const visibleWorkerAccumulationGroups = useMemo(() => {
        return showAllWorkerAccumulations ? workerAccumulationGroups : workerAccumulationGroups.slice(0, 18);
    }, [showAllWorkerAccumulations, workerAccumulationGroups]);

    const focusedWorkerGroup = useMemo(() => {
        if (!focusedWorkerGroupKey) return null;
        return workerAccumulationGroups.find((group) => group.key === focusedWorkerGroupKey) || null;
    }, [focusedWorkerGroupKey, workerAccumulationGroups]);

    useEffect(() => {
        if (focusedWorkerGroupKey && !focusedWorkerGroup) {
            setFocusedWorkerGroupKey(null);
        }
    }, [focusedWorkerGroupKey, focusedWorkerGroup]);

    const recordListRecords = useMemo(() => {
        return focusedWorkerGroup ? focusedWorkerGroup.records : filteredRecords;
    }, [focusedWorkerGroup, filteredRecords]);

    useEffect(() => {
        setRecordRenderLimit(INITIAL_RECORD_RENDER_LIMIT);
    }, [
        recordScopeFilter,
        recordMonthFilter,
        searchTerm,
        filterLevel,
        filterField,
        filterLeader,
        filterTrust,
        filterReason,
        filterStatus,
        secondPassStatusFilter,
        secondPassExcludedOnly,
        secondPassReasonFilter,
        recordSortMode,
        focusedWorkerGroupKey,
    ]);

    const visibleRecordListRecords = useMemo(() => {
        return recordListRecords.slice(0, recordRenderLimit);
    }, [recordListRecords, recordRenderLimit]);

    const hiddenRecordListCount = Math.max(0, recordListRecords.length - visibleRecordListRecords.length);

    const evidenceReadinessSummary = useMemo(() => {
        return analyzeWorkerEvidenceReadiness(existingRecords, new Date(), getWorkerTrackingCandidateIdentityKey);
    }, [existingRecords]);

    const recordsWithImages = useMemo(() => {
        return existingRecords.filter(r => hasRetryableOriginalImage(r.originalImage) || hasRetryableOriginalImage(r.profileImage));
    }, [existingRecords]);

    const selectedRecords = useMemo(() => {
        if (selectedIds.length === 0) return [];
        const selectedIdSet = new Set(selectedIds);
        return existingRecords.filter((record) => selectedIdSet.has(record.id));
    }, [existingRecords, selectedIds]);

    const selectedReanalyzeTargets = useMemo(() => {
        return selectedRecords
            .filter((record) => hasRetryableOriginalImage(record.originalImage) || hasRetryableOriginalImage(record.profileImage))
            .filter((record) => record.secondPassStatus !== 'DONE');
    }, [selectedRecords]);

    const recordsWithImagesBatchTargets = useMemo(() => {
        return recordsWithImages.filter((record) => record.secondPassStatus !== 'DONE');
    }, [recordsWithImages]);

    const failedRecords = useMemo(() => {
        return existingRecords.filter(r => isFailedRecord(r));
    }, [existingRecords]);

    const secondPassTargets = useMemo(() => {
        return baseFilteredRecords.filter(record => getSecondPassEligibility(record, secondPassEditedOnly).eligible);
    }, [baseFilteredRecords, secondPassEditedOnly]);

    const secondPassPreviewRecords = useMemo(() => {
        return secondPassTargets.slice(0, 5);
    }, [secondPassTargets]);

    useEffect(() => {
        setSelectedIds((prev) => {
            if (prev.length === 0) return prev;
            const validIdSet = new Set(existingRecords.map((record) => record.id));
            const next = prev.filter((id) => validIdSet.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [existingRecords]);

    const secondPassSkippedSummary = useMemo(() => {
        return (Object.entries(secondPassSkippedCounts) as Array<[string, number]>)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => `${reason} ${count}건`)
            .join(', ');
            }, [secondPassSkippedCounts]);

    const secondPassSkippedBreakdown = useMemo(() => {
        const entries = (Object.entries(secondPassSkippedCounts) as Array<[string, number]>).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
        return {
            total,
            items: entries.slice(0, 4).map(([reason, count]) => ({
                reason,
                count,
                share: total > 0 ? Math.round((count / total) * 100) : 0,
            })),
        };
    }, [secondPassSkippedCounts]);

    const filteredFailedCount = useMemo(() => filteredRecords.filter((record) => isFailedRecord(record)).length, [filteredRecords]);

    const activeFilterSummaryItems = useMemo(() => {
        const items: string[] = [];
        const normalizedSearch = String(searchTerm || '').trim();
        if (recordScopeFilter === 'all') items.push(`보기: 전체 기록 (${existingRecords.length}건)`);
        if (recordMonthFilter !== 'all') items.push(`월별: ${selectedMonthLabel}`);
        if (normalizedSearch) items.push(`검색: ${normalizedSearch}`);
        if (filterField !== 'all') items.push(`공종: ${filterField}`);
        if (filterLeader !== 'all') items.push(`팀장: ${filterLeader}`);
        if (filterTrust !== 'all') items.push(`신뢰: ${filterTrust === 'pending' ? '재검토 대기' : '최종확정'}`);
        if (filterLevel !== 'all') items.push(`등급: ${filterLevel}`);
        if (filterStatus !== 'all') items.push(`OCR 결과: ${filterStatus === 'failed' ? BRAND_STATUS_LABELS.attentionPending : '성공'}`);
        if (secondPassStatusFilter !== 'all') items.push(`2차 상태: ${secondPassStatusFilter === 'done' ? '완료(DONE)만' : '미완료만'}`);
        if (filterReason !== 'all') {
            items.push(`사유 필터: ${
                filterReason === 'missing-reason'
                    ? '사유 없음'
                    : filterReason === 'weak-reason'
                        ? '사유 보강 필요'
                        : '사유 있음'
            }`);
        }
        if (secondPassExcludedOnly) items.push('2차 재평가 제외 건만 보기');
        if (secondPassReasonFilter !== 'all') items.push(`2차 제외 사유: ${secondPassReasonFilter}`);
        if (recordSortMode !== 'recent-correction') items.push(`정렬: ${getRecordSortModeLabel(recordSortMode)}`);
        return items;
    }, [existingRecords.length, filterField, filterLeader, filterLevel, filterReason, filterStatus, recordMonthFilter, recordScopeFilter, secondPassStatusFilter, filterTrust, recordSortMode, searchTerm, secondPassExcludedOnly, secondPassReasonFilter, selectedMonthLabel]);

    const retrySuccessRate = useMemo(() => {
        if (!retryDiagnostics || retryDiagnostics.total === 0) return 0;
        return Math.round((retryDiagnostics.success / retryDiagnostics.total) * 100);
    }, [retryDiagnostics]);

    const retryLastUpdatedLabel = useMemo(() => {
        return formatCompactDateTime(retryDiagnostics?.lastUpdatedAt);
    }, [retryDiagnostics]);

    const fallbackRecoveryRate = useMemo(() => {
        if (!retryDiagnostics) return 0;
        const fallbackOpportunity = retryDiagnostics.clientFallbackSuccess + retryDiagnostics.serverRouteFail;
        if (fallbackOpportunity <= 0) return 0;
        return Math.round((retryDiagnostics.clientFallbackSuccess / fallbackOpportunity) * 100);
    }, [retryDiagnostics]);

    const fallbackRecoveryMeta = useMemo(() => {
        if (!retryDiagnostics) {
            return {
                tone: 'border border-slate-200 bg-white/80',
                labelClassName: 'text-[11px] font-bold text-slate-600',
                valueClassName: 'mt-0.5 text-sm font-black text-slate-900',
                helperClassName: 'mt-0.5 text-[10px] font-bold text-slate-400',
                helperText: '서버 실패 대비 · 집계 대기',
            };
        }

        const fallbackOpportunity = retryDiagnostics.clientFallbackSuccess + retryDiagnostics.serverRouteFail;
        if (fallbackOpportunity <= 0) {
            return {
                tone: 'border border-slate-200 bg-white/80',
                labelClassName: 'text-[11px] font-bold text-slate-600',
                valueClassName: 'mt-0.5 text-sm font-black text-slate-900',
                helperClassName: 'mt-0.5 text-[10px] font-bold text-slate-400',
                helperText: '서버 실패 대비 · 해당 케이스 없음',
            };
        }

        if (fallbackRecoveryRate < 30) {
            return {
                tone: 'border border-rose-200 bg-rose-50/80',
                labelClassName: 'text-[11px] font-bold text-rose-700',
                valueClassName: 'mt-0.5 text-sm font-black text-rose-700',
                helperClassName: 'mt-0.5 text-[10px] font-bold text-rose-500',
                helperText: '서버 실패 대비 · 위험',
            };
        }

        if (fallbackRecoveryRate < 70) {
            return {
                tone: 'border border-amber-200 bg-amber-50/80',
                labelClassName: 'text-[11px] font-bold text-amber-700',
                valueClassName: 'mt-0.5 text-sm font-black text-amber-700',
                helperClassName: 'mt-0.5 text-[10px] font-bold text-amber-500',
                helperText: '서버 실패 대비 · 주의',
            };
        }

        return {
            tone: 'border border-emerald-200 bg-emerald-50/80',
            labelClassName: 'text-[11px] font-bold text-emerald-700',
            valueClassName: 'mt-0.5 text-sm font-black text-emerald-700',
            helperClassName: 'mt-0.5 text-[10px] font-bold text-emerald-500',
            helperText: '서버 실패 대비 · 안정',
        };
    }, [retryDiagnostics, fallbackRecoveryRate]);

    const fallbackRecoveryBadge = useMemo(() => {
        const fallbackOpportunity = retryDiagnostics
            ? retryDiagnostics.clientFallbackSuccess + retryDiagnostics.serverRouteFail
            : 0;

        if (fallbackOpportunity <= 0) {
            return {
                className: 'bg-slate-100 text-slate-700 border border-slate-200',
                text: '대체 분석 상태: 집계 대기',
            };
        }

        if (fallbackRecoveryRate < 30) {
            return {
                className: 'bg-rose-100 text-rose-700 border border-rose-200',
                text: '대체 분석 상태: 위험',
            };
        }

        if (fallbackRecoveryRate < 70) {
            return {
                className: 'bg-amber-100 text-amber-700 border border-amber-200',
                text: '대체 분석 상태: 주의',
            };
        }

        return {
            className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
            text: '대체 분석 상태: 안정',
        };
    }, [retryDiagnostics, fallbackRecoveryRate]);

    const retryActionButtonClass = useMemo(() => {
        const fallbackOpportunity = retryDiagnostics
            ? retryDiagnostics.clientFallbackSuccess + retryDiagnostics.serverRouteFail
            : 0;

        if (fallbackOpportunity <= 0) {
            return 'border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200';
        }

        if (fallbackRecoveryRate < 30) {
            return 'border-rose-300 bg-rose-600 text-white hover:bg-rose-700 shadow-sm';
        }

        if (fallbackRecoveryRate < 70) {
            return 'border-amber-300 bg-amber-200 text-amber-900 hover:bg-amber-300';
        }

        return 'border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200';
    }, [retryDiagnostics, fallbackRecoveryRate]);

    const retryActionGuides = useMemo(() => {
        if (!retryDiagnostics) return [] as Array<{ key: string; label: string; count: number; tone: string; action: string }>;

        return [
            {
                key: 'preflight',
                label: '사전 검증 실패',
                count: retryDiagnostics.preflightFail,
                tone: 'amber',
                action: '원문 텍스트, 이름, 관리자 수정 이력 존재 여부를 먼저 확인하세요.',
            },
            {
                key: 'processing',
                label: 'OCR 처리 실패',
                count: retryDiagnostics.processingFail,
                tone: 'rose',
                action: '이미지 품질·해상도·문서 구도를 재점검한 뒤 다시 확인하세요.',
            },
            {
                key: 'route',
                label: '서버 라우트 실패',
                count: retryDiagnostics.serverRouteFail,
                tone: 'violet',
                action: 'API 라우트 배포 상태와 네트워크 연결, 권한 설정을 확인하세요.',
            },
        ].filter(item => item.count > 0);
    }, [retryDiagnostics]);

    const recentReassessmentImpact = useMemo(() => {
        return existingRecords
            .map((record) => {
                const latestReassessment = [...(record.auditTrail || [])]
                    .filter(entry => entry.stage === 'reassessment')
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

                if (!latestReassessment) return null;

                const parsed = parseReassessmentAuditNote(latestReassessment.note);
                if (!parsed) return null;

                return {
                    id: record.id,
                    name: record.name || '이름 없음',
                    jobField: record.jobField || '공종 미지정',
                    timestamp: latestReassessment.timestamp,
                    timestampLabel: formatCompactDateTime(latestReassessment.timestamp),
                    note: String(latestReassessment.note || '').trim(),
                    ...parsed,
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date((b as any).timestamp).getTime() - new Date((a as any).timestamp).getTime())
            .slice(0, 5) as Array<{
                id: string;
                name: string;
                jobField: string;
                timestamp: string;
                timestampLabel: string | null;
                note: string;
                previousScore: number;
                nextScore: number;
                delta: number;
                previousLevel: string;
                nextLevel: string;
            }>;
    }, [existingRecords]);

    const recentReassessmentDeltaSummary = useMemo(() => {
        return recentReassessmentImpact.reduce(
            (acc, item) => {
                if (item.delta > 0) acc.up += 1;
                else if (item.delta < 0) acc.down += 1;
                else acc.same += 1;
                return acc;
            },
            { up: 0, down: 0, same: 0 }
        );
    }, [recentReassessmentImpact]);

    const recentInsightComparisons = useMemo(() => {
        return existingRecords
            .map((record) => {
                const latestCorrection = [...(record.correctionHistory || [])]
                    .filter((entry) => Array.isArray(entry.changedFields) && entry.changedFields.includes('aiInsights'))
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

                if (!latestCorrection) return null;

                const beforeInsight = String(latestCorrection.previousValues?.aiInsights || '').trim();
                const afterInsight = String(latestCorrection.nextValues?.aiInsights || '').trim();

                if (!beforeInsight && !afterInsight) return null;

                return {
                    id: record.id,
                    name: record.name || '이름 없음',
                    jobField: record.jobField || '공종 미지정',
                    timestamp: latestCorrection.timestamp,
                    timestampLabel: formatCompactDateTime(latestCorrection.timestamp),
                    reason: String(latestCorrection.reason || '').trim(),
                    beforeInsight,
                    afterInsight,
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date((b as any).timestamp).getTime() - new Date((a as any).timestamp).getTime())
            .slice(0, 3) as Array<{
                id: string;
                name: string;
                jobField: string;
                timestamp: string;
                timestampLabel: string | null;
                reason: string;
                beforeInsight: string;
                afterInsight: string;
            }>;
    }, [existingRecords]);

    const recentContentComparisons = useMemo(() => {
        const targetFields = ['strengths', 'weakAreas', 'scoreReasoning', 'improvement', 'suggestions', 'actionable_coaching'];

        return existingRecords
            .map((record) => {
                const latestContentCorrection = [...(record.correctionHistory || [])]
                    .filter((entry) => Array.isArray(entry.changedFields) && entry.changedFields.some((field) => targetFields.includes(field)))
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

                if (!latestContentCorrection) return null;

                const changedTargetFields = (latestContentCorrection.changedFields || []).filter((field) => targetFields.includes(field));
                if (changedTargetFields.length === 0) return null;

                return {
                    id: record.id,
                    name: record.name || '이름 없음',
                    jobField: record.jobField || '공종 미지정',
                    timestamp: latestContentCorrection.timestamp,
                    timestampLabel: formatCompactDateTime(latestContentCorrection.timestamp),
                    reason: String(latestContentCorrection.reason || '').trim(),
                    changes: changedTargetFields.slice(0, 2).map((field) => ({
                        field,
                        label: CORRECTION_FIELD_LABELS[field] || field,
                        before: formatComparisonValue(latestContentCorrection.previousValues?.[field]),
                        after: formatComparisonValue(latestContentCorrection.nextValues?.[field]),
                    })),
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date((b as any).timestamp).getTime() - new Date((a as any).timestamp).getTime())
            .slice(0, 3) as Array<{
                id: string;
                name: string;
                jobField: string;
                timestamp: string;
                timestampLabel: string | null;
                reason: string;
                changes: Array<{
                    field: string;
                    label: string;
                    before: string;
                    after: string;
                }>;
            }>;
    }, [existingRecords]);

    const recentTextComparisons = useMemo(() => {
        const targetFields = ['fullText', 'koreanTranslation'];

        return existingRecords
            .map((record) => {
                const latestTextCorrection = [...(record.correctionHistory || [])]
                    .filter((entry) => Array.isArray(entry.changedFields) && entry.changedFields.some((field) => targetFields.includes(field)))
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

                if (!latestTextCorrection) return null;

                const changedTextFields = (latestTextCorrection.changedFields || []).filter((field) => targetFields.includes(field));
                if (changedTextFields.length === 0) return null;

                return {
                    id: record.id,
                    name: record.name || '이름 없음',
                    jobField: record.jobField || '공종 미지정',
                    timestamp: latestTextCorrection.timestamp,
                    timestampLabel: formatCompactDateTime(latestTextCorrection.timestamp),
                    reason: String(latestTextCorrection.reason || '').trim(),
                    changes: changedTextFields.map((field) => ({
                        field,
                        label: CORRECTION_FIELD_LABELS[field] || field,
                        before: formatLongComparisonText(latestTextCorrection.previousValues?.[field]),
                        after: formatLongComparisonText(latestTextCorrection.nextValues?.[field]),
                    })),
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date((b as any).timestamp).getTime() - new Date((a as any).timestamp).getTime())
            .slice(0, 3) as Array<{
                id: string;
                name: string;
                jobField: string;
                timestamp: string;
                timestampLabel: string | null;
                reason: string;
                changes: Array<{
                    field: string;
                    label: string;
                    before: string;
                    after: string;
                }>;
            }>;
    }, [existingRecords]);

    const recentAdminActivities = useMemo(() => {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

        const items = existingRecords.flatMap((record) => {
            const corrections = (record.correctionHistory || []).map((entry) => ({
                key: `correction-${record.id}-${entry.timestamp}`,
                type: '수정',
                name: record.name || '이름 없음',
                jobField: record.jobField || '공종 미지정',
                timestamp: entry.timestamp,
                timestampLabel: formatCompactDateTime(entry.timestamp),
                summary: entry.reason || '수정 사유 없음',
                isRecent: new Date(entry.timestamp).getTime() >= dayAgo,
            }));

            const approvals = (record.approvalHistory || []).map((entry) => ({
                key: `approval-${record.id}-${entry.timestamp}`,
                type: entry.status === 'approved' ? '승인' : entry.status === 'rejected' ? '반려' : '검토',
                name: record.name || '이름 없음',
                jobField: record.jobField || '공종 미지정',
                timestamp: entry.timestamp,
                timestampLabel: formatCompactDateTime(entry.timestamp),
                summary: entry.comment || `상태 변경: ${entry.status}`,
                isRecent: new Date(entry.timestamp).getTime() >= dayAgo,
            }));

            const reassessments = (record.auditTrail || [])
                .filter((entry) => entry.stage === 'reassessment')
                .map((entry) => ({
                    key: `reassessment-${record.id}-${entry.timestamp}`,
                    type: '재분석',
                    name: record.name || '이름 없음',
                    jobField: record.jobField || '공종 미지정',
                    timestamp: entry.timestamp,
                    timestampLabel: formatCompactDateTime(entry.timestamp),
                    summary: entry.note || '2차 재분석 실행',
                    isRecent: new Date(entry.timestamp).getTime() >= dayAgo,
                }));

            return [...corrections, ...approvals, ...reassessments];
        });

        return items
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 6);
    }, [existingRecords]);

    const recentAdminActivitySummary = useMemo(() => {
        return recentAdminActivities.reduce(
            (acc, item) => {
                if (!item.isRecent) return acc;
                if (item.type === '수정') acc.corrections += 1;
                else if (item.type === '재분석') acc.reassessments += 1;
                else acc.approvals += 1;
                return acc;
            },
            { corrections: 0, approvals: 0, reassessments: 0 }
        );
    }, [recentAdminActivities]);

    const reasonQaPreviewRecords = useMemo(() => {
        return existingRecords
            .map((record) => {
                const decisionReason = getLatestDecisionReason(record);
                const needsDecisionReason = getReviewTrustState(record) !== 'NONE' || (record.approvalHistory || []).length > 0;
                const weakDecisionReason = hasWeakDecisionReason(record);
                const weakCorrection = hasWeakCorrectionReason(record);
                const missingDecisionReason = needsDecisionReason && decisionReason.length === 0;

                if (!missingDecisionReason && !weakDecisionReason && !weakCorrection) return null;

                return {
                    id: record.id,
                    name: record.name || '이름 없음',
                    jobField: record.jobField || '공종 미지정',
                    decisionReason,
                    correctionReason: getLatestCorrectionReason(record),
                    missingDecisionReason,
                    weakDecisionReason,
                    weakCorrection,
                    latestTimestamp: Math.max(
                        getLatestCorrectionTimestamp(record),
                        new Date((record.approvalHistory || []).slice(-1)[0]?.timestamp || 0).getTime() || 0
                    ),
                };
            })
            .filter(Boolean)
            .sort((a, b) => ((b as any).latestTimestamp || 0) - ((a as any).latestTimestamp || 0))
            .slice(0, 5) as Array<{
                id: string;
                name: string;
                jobField: string;
                decisionReason: string;
                correctionReason: string;
                missingDecisionReason: boolean;
                weakDecisionReason: boolean;
                weakCorrection: boolean;
                latestTimestamp: number;
            }>;
    }, [existingRecords, getReviewTrustState]);

    const reasonQaSummary = useMemo(() => {
        return reasonQaPreviewRecords.reduce(
            (acc, record) => {
                if (record.missingDecisionReason) acc.missingDecision += 1;
                if (record.weakDecisionReason) acc.weakDecision += 1;
                if (record.weakCorrection) acc.weakCorrection += 1;
                return acc;
            },
            { missingDecision: 0, weakDecision: 0, weakCorrection: 0 }
        );
    }, [reasonQaPreviewRecords]);

    const reasonInputPrompt = useMemo(() => {
        const target = reasonQaPreviewRecords[0];
        if (!target) return null;

        const focus = target.missingDecisionReason
            ? '승인/검토 사유를 반드시 입력해야 합니다.'
            : target.weakDecisionReason
                ? '승인/검토 사유를 더 구체적으로 보강해야 합니다.'
                : '수정 사유를 더 구체적으로 남겨야 합니다.';

        const sample = target.missingDecisionReason || target.weakDecisionReason
            ? `${target.jobField} 기록 검토 결과, OCR 원문 및 번역 내용을 대조 확인 후 승인합니다.`
            : `${target.jobField} 기록의 강점/약점 및 점수 근거를 현장 검토에 맞게 보정했습니다.`;

        return {
            id: target.id,
            name: target.name,
            focus,
            sample,
        };
    }, [reasonQaPreviewRecords]);

    const adminActivityInsightCards = useMemo(() => {
        const latestActivity = recentAdminActivities[0];

        return [
            {
                key: 'state',
                eyebrow: '지금 상태',
                title: latestActivity
                    ? `${latestActivity.type} 흐름이 최근에도 이어졌습니다`
                    : '최근 운영 조치 흐름이 비어 있습니다',
                description: latestActivity
                    ? `${latestActivity.name} · ${latestActivity.jobField} 기록 기준으로 최근 운영 판단이 남아 있습니다.`
                    : '최근 24시간 내 기록된 수정·검토·재분석 이력이 없습니다.',
                tone: BRAND_TONE.slateWhite,
            },
            {
                key: 'evidence',
                eyebrow: '판단 근거',
                title: `수정 ${recentAdminActivitySummary.corrections} · 승인 ${recentAdminActivitySummary.approvals} · 재분석 ${recentAdminActivitySummary.reassessments}`,
                description: '운영 이력은 현장 판단이 어디에 집중됐는지 보여주는 근거입니다. 한쪽만 과도하면 병목을 의심해야 합니다.',
                tone: BRAND_TONE.indigo,
            },
            {
                key: 'action',
                eyebrow: '다음 행동',
                title: '최근 조치와 QA 보완 대상을 함께 보세요',
                description: '운영 조치 요약은 단순 기록보다, 어떤 기록을 먼저 다시 열어야 하는지 정하는 출발점으로 쓰는 편이 좋습니다.',
                tone: BRAND_TONE.emerald,
            },
        ];
    }, [recentAdminActivities, recentAdminActivitySummary]);

    const reasonQaInsightCards = useMemo(() => {
        const totalAttention = reasonQaSummary.missingDecision + reasonQaSummary.weakDecision + reasonQaSummary.weakCorrection;

        return [
            {
                key: 'state',
                eyebrow: '지금 상태',
                title: totalAttention > 0
                    ? `사유 QA 보완 ${totalAttention}건이 남아 있습니다`
                    : '사유 품질은 비교적 안정적입니다',
                description: totalAttention > 0
                    ? '승인/검토/수정 사유가 짧거나 비어 있으면 추적성과 보호 판단 신뢰도가 함께 떨어집니다.'
                    : '사유 누락과 약한 문구가 적어 QA 흐름이 안정적으로 유지되고 있습니다.',
                tone: totalAttention > 0 ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50',
            },
            {
                key: 'evidence',
                eyebrow: '판단 근거',
                title: `사유 없음 ${reasonQaSummary.missingDecision} · 승인 보강 ${reasonQaSummary.weakDecision} · 수정 보강 ${reasonQaSummary.weakCorrection}`,
                description: '사유 품질은 단순 문장 길이가 아니라 검토 근거, 확인 범위, 반영 내용이 남았는지로 판단합니다.',
                tone: BRAND_TONE.amber,
            },
            {
                key: 'action',
                eyebrow: '다음 행동',
                title: reasonInputPrompt
                    ? `${reasonInputPrompt.name} 기록부터 보강하세요`
                    : '보강 대상부터 순서대로 확인하세요',
                description: reasonInputPrompt
                    ? `${reasonInputPrompt.focus} 권장 입력 예시를 바로 참고해 현장 맥락이 남는 문장으로 바꾸면 됩니다.`
                    : '누락 사유를 먼저 채우고, 그다음 약한 승인/수정 사유를 보강하는 순서가 효율적입니다.',
                tone: BRAND_TONE.indigo,
            },
        ];
    }, [reasonInputPrompt, reasonQaSummary]);

    const lowConfidenceCount = useMemo(() => {
        return existingRecords.filter(r => typeof r.ocrConfidence === 'number' && r.ocrConfidence < 0.7).length;
    }, [existingRecords]);

    const primaryFailedRecord = useMemo(() => failedRecords[0] || null, [failedRecords]);

    const failedPreviewRecords = useMemo(() => {
        return failedRecords.slice(0, 5);
    }, [failedRecords]);

    const failedTypeSummary = useMemo(() => {
        const counts = failedRecords.reduce<Record<string, number>>((acc, record) => {
            const errorType = getOcrErrorTypeFromRecord(record);
            const label = getOcrErrorTypeKoreanLabel(errorType);
            acc[label] = (acc[label] || 0) + 1;
            return acc;
        }, {});

        return (Object.entries(counts) as Array<[string, number]>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
    }, [failedRecords]);

    const failedFailureCodeSummary = useMemo(() => {
        const counts: Record<OcrFailureCode, number> = {
            QUOTA: 0,
            KEY: 0,
            FORMAT: 0,
            PARSE: 0,
            PAYLOAD: 0,
            NETWORK: 0,
            UNKNOWN: 0,
        };
        // P0: UNKNOWN 2차 분류 집계
        const unknownSubCounts: Record<string, number> = {
            'network-like': 0,
            'parse-like': 0,
            'policy-like': 0,
            'uncategorized': 0,
        };

        failedRecords.forEach((record) => {
            const code = resolveFailureCodeFromRecord(record);
            counts[code] = (counts[code] || 0) + 1;
            if (code === 'UNKNOWN') {
                const sub = record.ocrUnknownSubCategory || classifyUnknownSubCategory(record);
                unknownSubCounts[sub] = (unknownSubCounts[sub] || 0) + 1;
            }
        });

        const summary = (Object.entries(counts) as Array<[OcrFailureCode, number]>)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => ({
                code,
                label: FAILURE_CODE_LABELS[code],
                count,
                action: getFailureCodeAction(code),
                unknownSubCounts: code === 'UNKNOWN' ? unknownSubCounts : undefined,
            }));
        return summary;
    }, [failedRecords]);

    const failedFailureCodeRecentSummary = useMemo(() => {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentFailedRecords = failedRecords.filter((record) => getLatestRecordActivityTimestamp(record) >= dayAgo);

        const counts: Record<OcrFailureCode, number> = {
            QUOTA: 0,
            KEY: 0,
            FORMAT: 0,
            PARSE: 0,
            PAYLOAD: 0,
            NETWORK: 0,
            UNKNOWN: 0,
        };

        recentFailedRecords.forEach((record) => {
            const code = resolveFailureCodeFromRecord(record);
            counts[code] = (counts[code] || 0) + 1;
        });

        const recentCodes = (Object.entries(counts) as Array<[OcrFailureCode, number]>)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => ({
                code,
                label: FAILURE_CODE_LABELS[code],
                count,
                action: getFailureCodeAction(code),
            }));

        const totalRecent = recentFailedRecords.length;
        const totalFailed = failedRecords.length;
        const recentShare = totalFailed > 0 ? Math.round((totalRecent / totalFailed) * 100) : 0;

        return {
            totalRecent,
            recentShare,
            topRecent: recentCodes[0] || null,
            recentCodes,
        };
    }, [failedRecords]);

    const failureSurgeSignal = useMemo(() => {
        const recentCodes = failedFailureCodeRecentSummary.recentCodes;
        const keyCount = recentCodes.find((item) => item.code === 'KEY')?.count || 0;
        const networkCount = recentCodes.find((item) => item.code === 'NETWORK')?.count || 0;
        const quotaCount = recentCodes.find((item) => item.code === 'QUOTA')?.count || 0;
        const totalRecent = failedFailureCodeRecentSummary.totalRecent;

        if (totalRecent === 0) return null;

        const keyNetworkCount = keyCount + networkCount;
        const keyNetworkShare = Math.round((keyNetworkCount / totalRecent) * 100);

        if (keyNetworkCount >= 3 || keyNetworkShare >= 45) {
            return {
                toneClassName: 'border-rose-300 bg-rose-50 text-rose-900',
                title: '경보: 키/네트워크 원인 급증',
                description: `최근 24시간 실패 ${totalRecent}건 중 KEY/NETWORK가 ${keyNetworkCount}건(${keyNetworkShare}%)입니다. OCR_TIMEOUT 포함 서버 지연·권한 설정을 우선 점검하세요.`,
            };
        }

        if (quotaCount >= 3) {
            return {
                toneClassName: 'border-amber-300 bg-amber-50 text-amber-900',
                title: '주의: 할당량 원인 집중',
                description: `최근 24시간 QUOTA ${quotaCount}건입니다. 호출량 분산과 냉각 후 재분석 순서를 우선 적용하세요.`,
            };
        }

        return null;
    }, [failedFailureCodeRecentSummary]);

    // P0: 24h/7d 전/후 비교
    const failureTrendComparison = useMemo(() => {
        const now = Date.now();
        const ms24h = 24 * 60 * 60 * 1000;
        const ms7d = 7 * ms24h;
        const recent24 = existingRecords.filter(r => (now - getLatestRecordActivityTimestamp(r)) <= ms24h);
        const recent7d = existingRecords.filter(r => (now - getLatestRecordActivityTimestamp(r)) <= ms7d);
        const failRate = (arr: typeof existingRecords) => arr.length === 0 ? 0 : Math.round((arr.filter(r => isFailedRecord(r)).length / arr.length) * 100);
        const unknownRate = (arr: typeof existingRecords) => arr.length === 0 ? 0 : Math.round((arr.filter(r => resolveFailureCodeFromRecord(r) === 'UNKNOWN').length / arr.length) * 100);
        const serverSuccessRate = (arr: typeof existingRecords) => arr.length === 0
            ? 0
            : Math.round((arr.filter(r => r.ocrTrace?.providerUsed === 'server_gemini' && !isFailedRecord(r)).length / arr.length) * 100);
        const failRate24 = failRate(recent24);
        const failRate7d = failRate(recent7d);
        const delta = failRate24 - failRate7d;
        return {
            recent24Total: recent24.length,
            recent7dTotal: recent7d.length,
            serverSuccessRate24: serverSuccessRate(recent24),
            serverSuccessRate7d: serverSuccessRate(recent7d),
            failRate24,
            failRate7d,
            unknownRate24: unknownRate(recent24),
            unknownRate7d: unknownRate(recent7d),
            delta,
            trend: (delta > 5 ? 'up' : delta < -5 ? 'down' : 'stable') as 'up' | 'down' | 'stable',
        };
    }, [existingRecords]);

    // P2: 월간 리스크 인텔리전스
    const riskIntelligence = useMemo(() => {
        const now = Date.now();
        const ms30d = 30 * 24 * 60 * 60 * 1000;
        const recent30d = existingRecords.filter(r => {
            const ts = r.lastUpdated || (r as any).createdAt || '';
            return ts && (now - new Date(ts).getTime()) <= ms30d;
        });
        const prev30d = existingRecords.filter(r => {
            const ts = r.lastUpdated || (r as any).createdAt || '';
            if (!ts) return false;
            const age = now - new Date(ts).getTime();
            return age > ms30d && age <= ms30d * 2;
        });
        const toFailRate = (arr: typeof existingRecords) =>
            arr.length === 0 ? 0 : Math.round((arr.filter(r => isFailedRecord(r)).length / arr.length) * 100);
        const currentFailRate = toFailRate(recent30d);
        const prevFailRate = toFailRate(prev30d);
        const failDelta = currentFailRate - prevFailRate;
        const unknownCount30d = recent30d.filter(r => resolveFailureCodeFromRecord(r) === 'UNKNOWN').length;
        const reanalysisCount30d = recent30d.filter(r =>
            Array.isArray(r.auditTrail) && r.auditTrail.some(a => a.note?.includes('재분석'))
        ).length;
        const approvalWeakCount = recent30d.filter(r => {
            const reason = String(r.approvalReason || '').trim();
            return reason.length > 0 && reason.length < 20;
        }).length;
        // 공종별 실패율 (P2.2)
        const jobFieldMap: Record<string, { total: number; failed: number }> = {};
        recent30d.forEach(r => {
            const jf = r.jobField || '미기재';
            if (!jobFieldMap[jf]) jobFieldMap[jf] = { total: 0, failed: 0 };
            jobFieldMap[jf].total += 1;
            if (isFailedRecord(r)) jobFieldMap[jf].failed += 1;
        });
        const jobFieldRiskRanking = Object.entries(jobFieldMap)
            .map(([jobField, { total, failed }]) => ({ jobField, total, failed, failRate: total > 0 ? Math.round((failed / total) * 100) : 0 }))
            .filter(e => e.total >= 3)
            .sort((a, b) => b.failRate - a.failRate)
            .slice(0, 3);
        // 교육-행동 연동 신호 (P2.3): 낮은 응답품질 + 약점 존재 + 코칭 이력 없음
        const coachingGapCount = recent30d.filter(r =>
            r.safetyScore < 60 &&
            Array.isArray(r.weakAreas) && r.weakAreas.length > 0 &&
            (!Array.isArray(r.actionHistory) || r.actionHistory.length === 0)
        ).length;
        const topCode = (['QUOTA','KEY','NETWORK','FORMAT','PARSE','PAYLOAD','UNKNOWN'] as const)
            .map(code => ({ code, count: recent30d.filter(r => resolveFailureCodeFromRecord(r) === code).length }))
            .sort((a, b) => b.count - a.count)[0];
        return {
            total30d: recent30d.length,
            currentFailRate,
            prevFailRate,
            failDelta,
            trend: (failDelta > 5 ? 'up' : failDelta < -5 ? 'down' : 'stable') as 'up' | 'down' | 'stable',
            unknownCount30d,
            reanalysisCount30d,
            approvalWeakCount,
            jobFieldRiskRanking,
            coachingGapCount,
            topCode: topCode?.count > 0 ? topCode : null,
        };
    }, [existingRecords]);

    const failedHarnessSummary = useMemo(() => {
        return failedRecords.reduce((acc, record) => {
            const workflowState = inferHarnessWorkflowState(record);
            const approvalState = inferHarnessApprovalState(record, workflowState);
            const riskDecision = inferHarnessRiskDecision(record);
            const persistenceState = getHarnessPersistenceState(record);

            if (approvalState === 'PENDING') acc.pendingApprovalCount += 1;
            if (workflowState === 'manual_review_required') acc.manualReviewCount += 1;
            if (riskDecision === 'IMMEDIATE_ATTENTION' || riskDecision === 'CRITICAL_STOP') acc.immediateAttentionCount += 1;
            if (persistenceState === 'connected') acc.connectedCount += 1;
            if (persistenceState === 'fallback') acc.fallbackCount += 1;
            if (persistenceState === 'pending') acc.pendingPersistenceCount += 1;

            return acc;
        }, {
            pendingApprovalCount: 0,
            manualReviewCount: 0,
            immediateAttentionCount: 0,
            connectedCount: 0,
            fallbackCount: 0,
            pendingPersistenceCount: 0,
        });
    }, [failedRecords]);

    const heroInterpretationCards = useMemo(() => {
        const topFailedType = failedTypeSummary[0];
        const topRetryGuide = retryActionGuides[0];
        const reviewAttentionCount = reasonQaSummary.missingDecision + reasonQaSummary.weakDecision + reasonQaSummary.weakCorrection;

        return [
            failedRecords.length > 0
                ? {
                    key: 'current-state',
                    eyebrow: '현재 상태',
                    title: `${BRAND_STATUS_LABELS.attentionPending} ${failedRecords.length}건이 우선입니다`,
                    description: topFailedType
                        ? `${topFailedType[0]} 유형이 가장 많이 확인되어 우선 점검 흐름을 먼저 여는 것이 좋습니다.`
                        : `재분석이 멈춘 기록을 먼저 정리해 관리자 판단 부담을 줄이는 단계입니다.`,
                    tone: BRAND_TONE.darkRoseText,
                }
                : {
                    key: 'current-state',
                    eyebrow: '현재 상태',
                    title: '급한 OCR 보완 건은 안정적입니다',
                    description: lowConfidenceCount > 0
                        ? `다만 저신뢰 기록 ${lowConfidenceCount}건은 현장 설명을 조금 더 보강하면 정확도가 올라갑니다.`
                        : `즉시 다시 볼 OCR 보완 건은 많지 않아 유지 점검 중심으로 운영할 수 있습니다.`,
                    tone: BRAND_TONE.darkEmeraldText,
                },
            reviewAttentionCount > 0
                ? {
                    key: 'evidence',
                    eyebrow: '판단 근거',
                    title: `검토 사유 보강 ${reviewAttentionCount}건이 남아 있습니다`,
                    description: `승인/검토 사유 없음 ${reasonQaSummary.missingDecision}건, 승인 사유 보강 ${reasonQaSummary.weakDecision}건, 수정 사유 보강 ${reasonQaSummary.weakCorrection}건을 함께 정리해야 추적성이 유지됩니다.`,
                    tone: BRAND_TONE.darkAmberText,
                }
                : {
                    key: 'evidence',
                    eyebrow: '판단 근거',
                    title: topRetryGuide
                        ? `${topRetryGuide.label} 원인이 가장 많이 남아 있습니다`
                        : '현재 근거 정합성은 안정적으로 유지되고 있습니다',
                    description: topRetryGuide
                        ? topRetryGuide.action
                        : '승인/검토 사유 보강 대상이 적어 관리자 확인 흐름이 비교적 매끄럽습니다.',
                    tone: BRAND_TONE.darkIndigoText,
                },
            {
                key: 'next-action',
                eyebrow: '다음 행동',
                title: failedRecords.length > 0
                    ? `${BRAND_ACTION_LABELS.smartReanalyze} → 관리자 정상분류 순으로 진행하세요`
                    : secondPassTargets.length > 0
                        ? `수정 반영 재평가 ${secondPassTargets.length}건을 이어서 확인하세요`
                        : '현재는 유지 점검과 백업 정리 단계입니다',
                description: failedRecords.length > 0
                    ? `${BRAND_STATUS_LABELS.attentionPending} 건은 자동 재분석으로 먼저 줄이고, 남는 건만 관리자 기준으로 정상분류하면 운영 피로가 낮아집니다.`
                    : secondPassTargets.length > 0
                        ? `OCR 성공 기록 중 관리자 수정 이력이 반영된 대상을 다시 계산해 해석 품질을 끌어올릴 수 있습니다.`
                        : '새 업로드, 요약 내보내기, 백업 정리를 중심으로 안정 운영을 유지하면 됩니다.',
                tone: BRAND_TONE.darkCyanText,
            },
        ];
    }, [failedRecords.length, failedTypeSummary, lowConfidenceCount, reasonQaSummary, retryActionGuides, secondPassTargets.length]);

    const failedTypeGroups = useMemo(() => {
        const grouped = failedRecords.reduce<Record<OcrErrorType, WorkerRecord[]>>((acc, record) => {
            const errorType = getOcrErrorTypeFromRecord(record);
            acc[errorType] = [...(acc[errorType] || []), record];
            return acc;
        }, {
            QUALITY: [],
            RESOLUTION: [],
            HANDWRITING: [],
            LAYOUT: [],
            UNKNOWN: [],
        });

        return (Object.entries(grouped) as Array<[OcrErrorType, WorkerRecord[]]>)
            .filter(([, records]) => records.length > 0)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 4)
            .map(([type, records]) => ({
                type,
                label: getOcrErrorTypeKoreanLabel(type),
                count: records.length,
                records,
            }));
    }, [failedRecords]);

    const failedQuickDecisionCards = useMemo(() => {
        const topGroup = failedTypeGroups[0];
        const topRetryGuide = retryActionGuides[0];
        const primaryErrorType = primaryFailedRecord ? getOcrErrorTypeFromRecord(primaryFailedRecord) : null;

        return [
            {
                key: 'state',
                eyebrow: '지금 상태',
                title: primaryFailedRecord
                    ? `${primaryFailedRecord.name || '미상'} 기록부터 확인하면 흐름이 풀립니다`
                    : `${BRAND_STATUS_LABELS.attentionPending} 기록을 먼저 줄여야 합니다`,
                description: primaryErrorType
                    ? getOcrErrorGuideMessage(primaryErrorType)
                    : '대표 기록이 없으면 유형별 묶음부터 순서대로 확인하는 편이 안정적입니다.',
                tone: BRAND_TONE.rose,
            },
            {
                key: 'evidence',
                eyebrow: '판단 근거',
                title: topGroup
                    ? `${topGroup.label} 유형이 ${topGroup.count}건으로 가장 많습니다`
                    : '실패 유형이 아직 정리되지 않았습니다',
                description: topRetryGuide
                    ? topRetryGuide.action
                    : '유형별 체크리스트와 사전검증 사유를 함께 보면 관리자 판단 속도가 빨라집니다.',
                tone: BRAND_TONE.amber,
            },
            {
                key: 'action',
                eyebrow: '다음 행동',
                title: `${BRAND_ACTION_LABELS.smartReanalyze} 후 관리자 판단으로 넘기세요`,
                description: '자동으로 다시 읽을 수 있는 건 먼저 줄이고, 끝까지 남는 기록만 상세 검증으로 보내면 운영 피로가 낮아집니다.',
                tone: BRAND_TONE.emerald,
            },
        ];
    }, [failedTypeGroups, primaryFailedRecord, retryActionGuides]);

    const filteredInterpretationCards = useMemo(() => {
        const filteredFailedCount = filteredRecords.filter((record) => isFailedRecord(record)).length;
        const filteredFinalizedCount = filteredRecords.filter((record) => getReviewTrustState(record) === 'FINALIZED').length;
        const filteredPendingCount = filteredRecords.filter((record) => getReviewTrustState(record) === 'PENDING').length;

        return [
            {
                key: 'state',
                eyebrow: '지금 상태',
                title: `현재 화면에 ${filteredRecords.length}건이 정리되어 있습니다`,
                description: filteredFailedCount > 0
                    ? `${BRAND_STATUS_LABELS.attentionPending} ${filteredFailedCount}건이 함께 보여 우선 확인 대상을 바로 가를 수 있습니다.`
                    : '즉시 보완이 필요한 OCR 기록은 많지 않아 검토와 후속 정리에 집중할 수 있습니다.',
                tone: filteredFailedCount > 0 ? BRAND_TONE.rose : BRAND_TONE.slateWhite,
            },
            {
                key: 'evidence',
                eyebrow: '판단 근거',
                title: `재검토 대기 ${filteredPendingCount} · 최종확정 ${filteredFinalizedCount}`,
                description: `현재 정렬은 ${getRecordSortModeLabel(recordSortMode)} 기준입니다. 필터와 정렬 조합이 곧 운영 우선순위를 결정합니다.`,
                tone: BRAND_TONE.indigo,
            },
            {
                key: 'action',
                eyebrow: '다음 행동',
                title: secondPassTargets.length > 0
                    ? `2차 재평가 ${secondPassTargets.length}건을 이어서 볼 수 있습니다`
                    : '현재 화면 기준으로는 유지 점검이 우선입니다',
                description: secondPassTargets.length > 0
                    ? '필터된 결과 안에서 관리자 수정 이력이 있는 대상을 다시 계산해 해석 품질을 끌어올릴 수 있습니다.'
                    : '조건에 맞는 재평가 대상이 적다면 검색·정렬을 바꿔 다른 보호 신호를 먼저 드러내는 편이 좋습니다.',
                tone: BRAND_TONE.emerald,
            },
        ];
    }, [filteredRecords, recordSortMode, secondPassTargets.length, getReviewTrustState]);

    const failureProcessingStats = useMemo(() => {
        const resolvedCounts = existingRecords.reduce((acc: Record<string, number>, record) => {
            (record.auditTrail || []).forEach((entry) => {
                const note = String(entry.note || '');
                const normalizedMatch = note.match(/관리자 수동 정상분류 처리 \((.+?)\)/);
                const retryMatch = note.match(/OCR 재분석 성공 \((.+?)\)/);
                const label = normalizedMatch?.[1] || retryMatch?.[1];
                if (label) {
                    acc[label] = (acc[label] || 0) + 1;
                }
            });
            return acc;
        }, {});

        return ['문서 구도', '촬영 품질', '해상도', '악필/필기', '기타 오류']
            .map((label) => {
                const openCount = failedTypeGroups.find((group) => group.label === label)?.count || 0;
                const resolvedCount = resolvedCounts[label] || 0;
                const total = openCount + resolvedCount;
                const rate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
                return {
                    label,
                    openCount,
                    resolvedCount,
                    total,
                    rate,
                };
            })
            .filter((item) => item.total > 0);
    }, [existingRecords, failedTypeGroups]);

    const reanalysisSummaryText = useMemo(() => {
        const lines = [
            'PSI OCR 운영 요약',
            `생성시각: ${new Date().toLocaleString('ko-KR')}`,
            '',
            '[기본 현황]',
            `- 전체 기록: ${existingRecords.length}건`,
            `- 현재 조회 결과: ${filteredRecords.length}건`,
            `- 2차 재분석 가능: ${secondPassTargets.length}건`,
            `- ${BRAND_STATUS_LABELS.attentionPending}: ${failedRecords.length}건`,
            `- 사유 QA 대상: ${reasonQaPreviewRecords.length}건`,
            '',
            '[실패코드 집계]',
            ...(failedFailureCodeSummary.length > 0
                ? failedFailureCodeSummary.map((item) => `- ${item.code} (${item.label}): ${item.count}건`)
                : ['- 집계 대상 없음']),
            '',
            '[실패코드 최근 24시간]',
            `- 최근 갱신 실패: ${failedFailureCodeRecentSummary.totalRecent}건 (${failedFailureCodeRecentSummary.recentShare}%)`,
            ...(failedFailureCodeRecentSummary.recentCodes.length > 0
                ? failedFailureCodeRecentSummary.recentCodes.flatMap((item) => [
                    `- ${item.code} (${item.label}): ${item.count}건`,
                    `  · 권장 조치: ${item.action}`,
                ])
                : ['- 최근 24시간 집계 대상 없음']),
            ...(failureSurgeSignal
                ? [
                    '',
                    '[최근 원인 경보]',
                    `- ${failureSurgeSignal.title}`,
                    `- ${failureSurgeSignal.description}`,
                ]
                : []),
            '',
            '[최근 재분석 집계]',
            `- 성공률: ${retrySuccessRate}%`,
            `- 총 대상: ${retryDiagnostics?.total || 0}건`,
            `- 성공: ${retryDiagnostics?.success || 0}건`,
            `- ${BRAND_STATUS_LABELS.attentionPending}: ${retryDiagnostics?.fail || 0}건`,
            `- 사전 확인 필요: ${retryDiagnostics?.preflightFail || 0}건`,
            `- 처리 확인 필요: ${retryDiagnostics?.processingFail || 0}건`,
            `- 라우트 확인 필요: ${retryDiagnostics?.serverRouteFail || 0}건`,
            '',
            '[재분석 점수 변화]',
            `- 상승: ${recentReassessmentDeltaSummary.up}건`,
            `- 하락: ${recentReassessmentDeltaSummary.down}건`,
            `- 유지: ${recentReassessmentDeltaSummary.same}건`,
            ...(recentReassessmentImpact.length > 0
                ? [
                    '',
                    '[최근 점수 변화 상세]',
                    ...recentReassessmentImpact.map((item) => `- ${item.name} (${item.jobField}) : ${item.previousScore}→${item.nextScore}, ${item.previousLevel || '-'}→${item.nextLevel || '-'}${item.note ? ` | ${item.note}` : ''}`),
                ]
                : []),
            '',
            `[${BRAND_STATUS_LABELS.attention} 유형별 처리 완료율]`,
            ...(failureProcessingStats.length > 0
                ? failureProcessingStats.map((item) => `- ${item.label}: 완료율 ${item.rate}% (잔여 ${item.openCount} / 처리 ${item.resolvedCount} / 총계 ${item.total})`)
                : ['- 집계 대상 없음']),
            ...(failedTypeGroups.length > 0
                ? [
                    '',
                    `[${BRAND_STATUS_LABELS.attention} 유형별 체크리스트]`,
                    ...failedTypeGroups.map((group) => `- ${group.label}: ${getFailureChecklistSummary(group.type)}`),
                ]
                : []),
            ...(recentInsightComparisons.length > 0
                ? [
                    '',
                    '[최근 AI 인사이트 변경]',
                    ...recentInsightComparisons.map((item) => `- ${item.name}: ${item.reason || '사유 없음'}\n  · 변경 전: ${formatLongComparisonText(item.beforeInsight, 140)}\n  · 변경 후: ${formatLongComparisonText(item.afterInsight, 140)}`),
                ]
                : []),
            '',
            '[사유 품질 QA]',
            `- 승인/검토 사유 없음: ${reasonQaSummary.missingDecision}건`,
            `- 승인/검토 사유 보강 필요: ${reasonQaSummary.weakDecision}건`,
            `- 수정 사유 보강 필요: ${reasonQaSummary.weakCorrection}건`,
            ...(reasonQaPreviewRecords.length > 0
                ? [
                    '',
                    '[우선 점검 대상]',
                    ...reasonQaPreviewRecords.slice(0, 3).map((record) => `- ${record.name} (${record.jobField}) : 승인사유="${formatLongComparisonText(record.decisionReason, 80)}" / 수정사유="${formatLongComparisonText(record.correctionReason, 80)}"`),
                ]
                : []),
        ];

        return lines.join('\n');
    }, [
        existingRecords.length,
        filteredRecords.length,
        secondPassTargets.length,
        failedRecords.length,
        reasonQaPreviewRecords.length,
        failedFailureCodeSummary,
        failedFailureCodeRecentSummary,
        failureSurgeSignal,
        retrySuccessRate,
        retryDiagnostics,
        recentReassessmentDeltaSummary,
        recentReassessmentImpact,
        failureProcessingStats,
        failedTypeGroups,
        recentInsightComparisons,
        reasonQaSummary,
        reasonQaPreviewRecords,
    ]);

    const primaryFailedErrorType = useMemo<OcrErrorType | null>(() => {
        if (!primaryFailedRecord) return null;
        return getOcrErrorTypeFromRecord(primaryFailedRecord);
    }, [primaryFailedRecord]);

    const primaryFailedPreflightReason = useMemo(() => {
        if (!primaryFailedRecord) return null;
        return getPreflightFailureReason(primaryFailedRecord);
    }, [primaryFailedRecord]);

    const handleRetryCapture = useCallback(() => {
        const target = document.getElementById('new-ocr-capture-section');
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        alert('신규 기록 분석 영역에서 다시 촬영/업로드를 진행해 주세요.');
    }, []);

    // 분석 중단 요청
    const stopAnalysis = useCallback(() => {
        stopRef.current = true;
        setProgress('중단 요청 중...');
    }, []);

    const handleToggleFailedQuickActions = useCallback(() => {
        setShowFailedQuickActions((prev) => {
            const next = !prev;
            if (next && autoScrollFailedQuickActions) {
                setTimeout(() => {
                    failedQuickActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 40);
            }
            return next;
        });
    }, [autoScrollFailedQuickActions]);

    // [SMART DELAY] UI countdown included
    const waitWithCountdown = async (seconds: number, messagePrefix: string) => {
        for (let i = seconds; i > 0; i--) {
            if (stopRef.current) throw new Error("STOPPED");
            setCooldownTime(i);
            setProgress(`${messagePrefix} (${i}초 대기 중...)`);
            await new Promise(r => setTimeout(r, 1000));
        }
        setCooldownTime(0);
    };

    const getBestRetryImageSource = useCallback((record: WorkerRecord): string => {
        const candidates = [record.originalImage, record.profileImage]
            .map((item) => String(item || '').trim())
            .filter((item) => item.length > 0);

        if (candidates.length === 0) return '';

        const retryable = candidates.find((item) => hasRetryableOriginalImage(item));
        return retryable || candidates[0];
    }, []);

    const requestServerRetryAnalysis = useCallback(async (record: WorkerRecord): Promise<WorkerRecord> => {
        const bestImageSource = getBestRetryImageSource(record);
        const response = await fetch('/api/gateway?action=ocr.retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recordId: record.id,
                imageSource: bestImageSource,
                filenameHint: record.filename || record.name,
                ocrEngine,
                isPaidApiMode,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.record) {
            const errorCode = String(data?.code || '').trim();
            const fallbackHttpCode = Number(response.status) >= 400 ? `HTTP_${response.status}` : '';
            const normalizedCode = errorCode || fallbackHttpCode;
            const errorMessage = String(data?.message || response.statusText || '서버 OCR 재분석 실패').trim();
            throw new Error(normalizedCode ? `[${normalizedCode}] ${errorMessage}` : errorMessage);
        }

        const nextHandwrittenAnswers = Array.isArray(data.record.handwrittenAnswers)
            && data.record.handwrittenAnswers.some((answer: any) =>
                String(answer?.answerText || '').trim().length > 0
                || String(answer?.koreanTranslation || '').trim().length > 0
                || String(answer?.nativeTranslation || '').trim().length > 0
            )
            ? data.record.handwrittenAnswers
            : record.handwrittenAnswers;
        const nextAiInsightsNative = String(data.record.aiInsights_native || '').trim() || record.aiInsights_native;

        return {
            ...record,
            ...data.record,
            id: record.id,
            originalImage: record.originalImage || bestImageSource,
            profileImage: record.profileImage,
            filename: record.filename,
            role: record.role !== 'worker' ? record.role : data.record.role,
            isTranslator: record.isTranslator || data.record.isTranslator,
            isSignalman: record.isSignalman || data.record.isSignalman,
            handwrittenAnswers: nextHandwrittenAnswers,
            aiInsights_native: nextAiInsightsNative,
            ocrErrorType: undefined,
            ocrErrorMessage: undefined,
            ocrFailureCode: undefined,
            ocrUnknownSubCategory: undefined,
            // P0: Trace 표준화 — 서버가 반환한 trace 저장
            ocrTrace: data.trace
                ? {
                    providerUsed: data.trace.providerUsed ?? 'server_gemini',
                    latencyMs: Number(data.trace.latencyMs) || 0,
                    attempts: Number(data.trace.attempts) || 1,
                    fallbackDepth: Number(data.trace.fallbackDepth) || 0,
                    finalCode: normalizeFailureCode(data.trace.finalCode),
                    recordedAt: data.trace.recordedAt ?? new Date().toISOString(),
                }
                : undefined,
        } as WorkerRecord;
    }, [getBestRetryImageSource, isPaidApiMode, ocrEngine]);

    const extractGatewayErrorCode = useCallback((message: string): string | undefined => {
        const matched = String(message || '').trim().match(/^\[([A-Z0-9_]+)\]/);
        return matched?.[1] ? matched[1] : undefined;
    }, []);

    const mapGatewayCodeToFailureCode = useCallback((gatewayCode?: string): OcrFailureCode | undefined => {
        const normalizedCode = String(gatewayCode || '').trim().toUpperCase();
        switch (normalizedCode) {
            case 'OCR_PARSE_FAILURE':
                return 'PARSE';
            case 'OCR_UPSTREAM_AUTH':
            case 'MISSING_SERVER_GEMINI_KEY':
                return 'KEY';
            case 'OCR_QUOTA':
                return 'QUOTA';
            case 'OCR_TIMEOUT':
            case 'OCR_UPSTREAM_NETWORK':
            case 'OCR_UPSTREAM_FAILURE':
                return 'NETWORK';
            case 'OCR_INVALID_ARGUMENT':
            case 'IMAGE_DATA_TOO_SHORT':
            case 'IMAGE_TOO_LARGE':
            case 'INVALID_BASE64':
                return 'PAYLOAD';
            case 'UNSUPPORTED_IMAGE_FORMAT':
                return 'FORMAT';
            default:
                if (/^HTTP_5\d\d$/.test(normalizedCode)) return 'NETWORK';
                if (normalizedCode === 'HTTP_413') return 'PAYLOAD';
                if (normalizedCode === 'HTTP_415') return 'FORMAT';
                if (/^HTTP_4\d\d$/.test(normalizedCode)) return 'PAYLOAD';
                return undefined;
        }
    }, []);

    const getBatchSplitSize = (): number => {
        try {
            const raw = localStorage.getItem('psi_app_settings');
            if (!raw) return 50;
            const parsed = JSON.parse(raw) as AppSettings;
            const size = parsed.batchSplitSize;
            if (typeof size === 'number' && size >= 10 && size <= 500) return size;
        } catch { /* ignore */ }
        return 50;
    };

    const runBatchAnalysis = async (targetRecords: WorkerRecord[], title: string, forceReanalyze: boolean = false) => {
        const total = targetRecords.length;
        if (total === 0) return alert('재분석할 대상이 없습니다.');

        // 서버 재분석이 1차 경로이므로 브라우저 quota 상태만으로 전체 재분석을 선차단하지 않는다.
        const quotaState = getQuotaState();
        const quotaRecoveryTime = quotaState.isExhausted
            ? Math.ceil((quotaState.nextRetryTime - Date.now()) / 1000)
            : 0;
        
        if (forceReanalyze) {
            console.log(`[강제 재분석] 사전 점검 생략, 직접 분석 요청 모드`);
        }
        
        const storedCheckpoint = getStoredBatchCheckpoint();
        const canResumeFromCheckpoint = Boolean(
            storedCheckpoint
            && storedCheckpoint.title === title
            && storedCheckpoint.forceReanalyze === forceReanalyze
            && storedCheckpoint.total === total
            && storedCheckpoint.nextIndex > 0
            && storedCheckpoint.nextIndex < total
        );

        setIsAnalyzing(true);
        setProgress(
            canResumeFromCheckpoint
                ? `[${title}] 이전 중단 지점(${storedCheckpoint?.nextIndex}/${total})부터 자동 재개 중...`
                : `[${title}] 재분석 준비 중...`
        );
        setBatchProgress({ current: canResumeFromCheckpoint ? (storedCheckpoint?.nextIndex || 0) : 0, total });
        stopRef.current = false;
        setRetryDiagnostics({
            total,
            success: 0,
            fail: 0,
            serverSuccess: 0,
            clientFallbackSuccess: 0,
            preflightFail: 0,
            processingFail: 0,
            serverRouteFail: 0,
            lastUpdatedAt: new Date().toISOString(),
        });
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
        
        let successCount = canResumeFromCheckpoint ? (storedCheckpoint?.successCount || 0) : 0;
        let failCount = canResumeFromCheckpoint ? (storedCheckpoint?.failCount || 0) : 0;
        let stopped = false;
        let serverSuccessCount = canResumeFromCheckpoint ? (storedCheckpoint?.serverSuccessCount || 0) : 0;
        let clientFallbackSuccessCount = canResumeFromCheckpoint ? (storedCheckpoint?.clientFallbackSuccessCount || 0) : 0;
        let preflightFailCount = canResumeFromCheckpoint ? (storedCheckpoint?.preflightFailCount || 0) : 0;
        let processingFailCount = canResumeFromCheckpoint ? (storedCheckpoint?.processingFailCount || 0) : 0;
        let serverRouteFailCount = canResumeFromCheckpoint ? (storedCheckpoint?.serverRouteFailCount || 0) : 0;
        let keyFailureCount = canResumeFromCheckpoint ? (storedCheckpoint?.keyFailureCount || 0) : 0;
        let quotaFailureCount = 0;
        let consecutiveKeyFailureCount = 0;
        const KEY_FAILURE_ABORT_THRESHOLD = 3;
        let keyFailureAbortTriggered = false;
        let lastUnhandledBatchErrorMessage = '';
        let lastUnhandledBatchErrorCode: string | undefined;
        let lastObservedServerRouteErrorCode: string | undefined;
        
        // [Adaptive Throttling State]
        // Start with a 4s buffer. If we hit limits, increase this dynamically.
        let dynamicDelayBuffer = quotaRecoveryTime > 0 ? 8 : 5;

        // [Priority Queue] 고위험→실패→저신뢰 순으로 정렬
        const processQueue = [...targetRecords].sort((a, b) => getRetryPriorityScore(a) - getRetryPriorityScore(b));

        try {
            const startIndex = canResumeFromCheckpoint ? Math.max(0, storedCheckpoint?.nextIndex || 0) : 0;
            for (let i = startIndex; i < processQueue.length; i++) {
                if (stopRef.current) { stopped = true; break; }
                const record = processQueue[i];
                setBatchProgress(p => ({ ...p, current: i + 1 }));
                setProgress(`[${title}] ${record.name || '미상'} 처리 중...`);
                try {
                    // 2차 재가공 시작: 상태 IN_PROGRESS
                    onUpdateRecord(withHarnessState(record, {
                        secondPassStatus: 'IN_PROGRESS',
                        workflowState: 'second_pass_analyzing',
                        riskDecision: 'SUPPLEMENTARY_REVIEW',
                        approvalState: 'PENDING',
                    }));

                    const retryImageSource = getBestRetryImageSource(record);

                    if (!retryImageSource) {
                        const failureCode: OcrFailureCode = 'PAYLOAD';
                        const failureMessage = withFailureCodePrefix(failureCode, '원본/대체 이미지 데이터 없음');
                        const errorRecord: WorkerRecord = withHarnessState(record, {
                            ...record,
                            aiInsights: withFailureCodePrefix(failureCode, '❌ 원본/대체 이미지 데이터가 없어 재분석할 수 없습니다.'),
                            ocrErrorType: 'LAYOUT',
                            ocrFailureCode: failureCode,
                            ocrErrorMessage: failureMessage,
                            safetyScore: 0,
                            secondPassStatus: 'NEEDED',
                            workflowState: 'manual_review_required',
                            riskDecision: 'IMMEDIATE_ATTENTION',
                            approvalState: 'PENDING',
                        });
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue;
                    }

                    // 1. Data Integrity Check
                    if (!forceReanalyze && !hasRetryableOriginalImage(retryImageSource)) {
                        console.warn(`Skipping ${record.id}: Image loss.`);
                        const failureCode: OcrFailureCode = 'PAYLOAD';
                        const failureMessage = withFailureCodePrefix(failureCode, '원본 이미지 데이터 소실');
                        const errorRecord: WorkerRecord = withHarnessState(record, {
                            ...record,
                            aiInsights: withFailureCodePrefix(failureCode, "❌ 원본 이미지 데이터 소실 (분석 불가)"),
                            ocrErrorType: 'LAYOUT',
                            ocrFailureCode: failureCode,
                            ocrErrorMessage: failureMessage,
                            safetyScore: 0,
                            secondPassStatus: 'NEEDED',
                            workflowState: 'manual_review_required',
                            riskDecision: 'IMMEDIATE_ATTENTION',
                            approvalState: 'PENDING',
                        });
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue; 
                    }
                    
                    // [강제 재분석 모드] 이미지 없어도 계속 진행 (API 호출 통해 재분석)
                    if (forceReanalyze && !hasRetryableOriginalImage(retryImageSource)) {
                        console.log(`[강제 재분석] ${record.id}: 이미지 데이터 없음 감지. API 호출로 재분석 시도...`);
                    }

                    // [Step 3] Image Format Validation
                    const cleanImage = normalizeRetryImageData(retryImageSource);
                    const formatValidation = validateImageFormat(cleanImage);
                    
                    if (!forceReanalyze && !formatValidation.isValid) {
                        console.warn(`Image format error for ${record.id}: ${formatValidation.error}`);
                        const failureCode: OcrFailureCode = 'FORMAT';
                        const failureMessage = withFailureCodePrefix(failureCode, String(formatValidation.error || '이미지 형식 오류'));
                        const errorRecord: WorkerRecord = withHarnessState(record, {
                            ...record,
                            aiInsights: withFailureCodePrefix(failureCode, `❌ 이미지 형식 오류: ${formatValidation.error} (감지: ${formatValidation.detectedFormat})`),
                            ocrErrorType: classifyLegacyOcrErrorType(String(formatValidation.error || '')),
                            ocrFailureCode: failureCode,
                            ocrErrorMessage: failureMessage,
                            safetyScore: 0,
                            secondPassStatus: 'NEEDED',
                            workflowState: 'manual_review_required',
                            riskDecision: 'IMMEDIATE_ATTENTION',
                            approvalState: 'PENDING',
                        });
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue;
                    }
                    
                    if (!forceReanalyze && !formatValidation.supportedFormat) {
                        console.warn(`Unsupported format for ${record.id}: ${formatValidation.detectedFormat}`);
                        const failureCode: OcrFailureCode = 'FORMAT';
                        const failureMessage = withFailureCodePrefix(failureCode, `지원하지 않는 이미지 형식: ${formatValidation.detectedFormat}`);
                        const errorRecord: WorkerRecord = withHarnessState(record, {
                            ...record,
                            aiInsights: withFailureCodePrefix(failureCode, `⚠️ 지원하지 않는 이미지 형식: ${formatValidation.detectedFormat}`),
                            ocrErrorType: 'QUALITY',
                            ocrFailureCode: failureCode,
                            ocrErrorMessage: failureMessage,
                            safetyScore: 0,
                            secondPassStatus: 'NEEDED',
                            workflowState: 'manual_review_required',
                            riskDecision: 'SUPPLEMENTARY_REVIEW',
                            approvalState: 'PENDING',
                        });
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue;
                    }
                    
                    if (!forceReanalyze && !isFormatCompatibleWithAI(formatValidation.detectedFormat)) {
                        console.warn(`Format not AI-compatible for ${record.id}: ${formatValidation.detectedFormat}`);
                        const failureCode: OcrFailureCode = 'FORMAT';
                        const failureMessage = withFailureCodePrefix(failureCode, `AI 분석 미지원 형식: ${formatValidation.detectedFormat}`);
                        const errorRecord: WorkerRecord = withHarnessState(record, {
                            ...record,
                            aiInsights: withFailureCodePrefix(failureCode, `⚠️ AI 분석 미지원 형식: ${formatValidation.detectedFormat}. JPEG, PNG, GIF, WebP, HEIC 형식만 지원됩니다.`),
                            ocrErrorType: 'QUALITY',
                            ocrFailureCode: failureCode,
                            ocrErrorMessage: failureMessage,
                            safetyScore: 0,
                            secondPassStatus: 'NEEDED',
                            workflowState: 'manual_review_required',
                            riskDecision: 'SUPPLEMENTARY_REVIEW',
                            approvalState: 'PENDING',
                        });
                        onUpdateRecord(errorRecord);
                        failCount++;
                        preflightFailCount++;
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        continue;
                    }

                    // 2. Call API with Retry Logic for Rate Limits
                    let apiResult = null;
                    let retryCount = 0;
                    let lastRetryErrorMessage = '';
                    let lastServerRouteErrorCode: string | undefined;
                    let lastServerRouteErrorMessage = '';
                    let serverRouteFailedForCurrentRecord = false;
                    let serverRouteFailureCountedForCurrentRecord = false;
                    const MAX_RETRIES = OCR_POLICY.RETRY_POLICY.maxRetries; // P1.3: policy-driven
                    let usedClientFallback = false;

                    while (retryCount < MAX_RETRIES) {
                        try {
                            const modeLabel = forceReanalyze ? '[강제 모드]' : '';
                            const quotaHint = quotaRecoveryTime > 0
                                ? ` (브라우저 대체 분석 대기 ${quotaRecoveryTime}초)`
                                : '';
                            setProgress(`${modeLabel} [${title}] ${record.name || '미상'} 서버 OCR 재분석 요청 중...${quotaHint}`);

                            try {
                                apiResult = await requestServerRetryAnalysis(record);
                                usedClientFallback = false;
                                lastServerRouteErrorCode = undefined;
                                lastServerRouteErrorMessage = '';
                            } catch (serverError: any) {
                                const serverMessage = extractMessage(serverError);
                                lastServerRouteErrorMessage = serverMessage;
                                lastServerRouteErrorCode = extractGatewayErrorCode(serverMessage);
                                serverRouteFailedForCurrentRecord = true;
                                if (lastServerRouteErrorCode) {
                                    lastObservedServerRouteErrorCode = lastServerRouteErrorCode;
                                }
                                const normalizedServerMessage = serverMessage.toLowerCase();
                                const normalizedServerCode = String(lastServerRouteErrorCode || '').toUpperCase();
                                const isServerCredentialOrQuotaCode = [
                                    'MISSING_SERVER_GEMINI_KEY',
                                    'OCR_UPSTREAM_AUTH',
                                    'OCR_QUOTA',
                                    'HTTP_401',
                                    'HTTP_403',
                                    'HTTP_429',
                                ].includes(normalizedServerCode);
                                const isServerCredentialCode = [
                                    'MISSING_SERVER_GEMINI_KEY',
                                    'OCR_UPSTREAM_AUTH',
                                    'HTTP_401',
                                    'HTTP_403',
                                ].includes(normalizedServerCode);
                                const shouldBypassClientFallback = [
                                    'OCR_INVALID_ARGUMENT',
                                    'UNSUPPORTED_IMAGE_FORMAT',
                                    'INVALID_BASE64',
                                    'IMAGE_TOO_LARGE',
                                    'IMAGE_DATA_TOO_SHORT',
                                    'HTTP_400',
                                    'HTTP_413',
                                    'HTTP_415',
                                ].includes(normalizedServerCode);
                                const shouldFallbackToClient =
                                    !shouldBypassClientFallback && (
                                    isServerCredentialOrQuotaCode ||
                                    normalizedServerMessage.includes('failed to fetch') ||
                                    normalizedServerMessage.includes('network') ||
                                    normalizedServerMessage.includes('timeout') ||
                                    normalizedServerMessage.includes('gateway') ||
                                    normalizedServerMessage.includes('bad gateway') ||
                                    normalizedServerMessage.includes('service unavailable') ||
                                    normalizedServerMessage.includes('internal server error') ||
                                    normalizedServerMessage.includes('ocr_parse_failure') ||
                                    normalizedServerMessage.includes('ocr_upstream_auth') ||
                                    normalizedServerMessage.includes('missing_server_gemini_key') ||
                                    normalizedServerMessage.includes('ocr_quota') ||
                                    normalizedServerMessage.includes('json 파싱') ||
                                    normalizedServerMessage.includes('json') ||
                                    normalizedServerMessage.includes('parse') ||
                                    normalizedServerMessage.includes('서버 gemini api 키가 설정되지 않았습니다') ||
                                    normalizedServerMessage.includes('gemini_api_key') ||
                                    serverMessage.includes('404') ||
                                    serverMessage.includes('500') ||
                                    serverMessage.includes('502') ||
                                    serverMessage.includes('503') ||
                                    serverMessage.includes('504') ||
                                    serverMessage.includes('Method Not Allowed') ||
                                    normalizedServerCode.startsWith('HTTP_5')
                                    );

                                if (!shouldFallbackToClient) {
                                    serverRouteFailCount++;
                                    throw serverError;
                                }

                                const modeLabel = forceReanalyze ? '[강제 모드]' : '';
                                setProgress(`${modeLabel} [${title}] ${record.name || '미상'} 브라우저 OCR 대체 분석 실행 중...`);
                                const fallbackQuotaState = getQuotaState();
                                const fallbackRecoverySeconds = fallbackQuotaState.isExhausted
                                    ? Math.ceil((fallbackQuotaState.nextRetryTime - Date.now()) / 1000)
                                    : 0;
                                // 서버 키/권한 실패 경로에서는 브라우저 쿼터 잠금 상태를 우회해 실제 대체 분석 가능 여부를 확인한다.
                                if (isServerCredentialCode) {
                                    clearQuotaState();
                                }
                                if (fallbackRecoverySeconds > 0 && !isServerCredentialCode) {
                                    throw new Error(`[OCR_QUOTA] 브라우저 OCR 할당량 회복 대기 중입니다. 약 ${fallbackRecoverySeconds}초 후 재시도해주세요.`);
                                }
                                const fallbackImageSource = retryImageSource || cleanImage;
                                if (!fallbackImageSource) {
                                    throw new Error('재분석 가능한 이미지 데이터가 없습니다.');
                                }
                                const results = await analyzeWorkerRiskAssessment(fallbackImageSource, '', record.filename || record.name);
                                if (results && results.length > 0) {
                                    apiResult = results[0];
                                    usedClientFallback = true;
                                } else {
                                    throw new Error('Empty result from AI');
                                }
                            }

                            if (apiResult) {
                                const insightText = String(apiResult.aiInsights || '');
                                const hasApiSourceText =
                                    String(apiResult.fullText || '').trim().length > 0 ||
                                    String(apiResult.koreanTranslation || '').trim().length > 0 ||
                                    (apiResult.handwrittenAnswers || []).some((answer) => String(answer?.answerText || '').trim().length > 0);
                                const verificationAudit = evaluateOcrVerificationCompleteness(apiResult);
                                const shouldTreatAsFailure =
                                    Boolean(apiResult.ocrErrorType) ||
                                    hasOperationalFailureSignal(apiResult) ||
                                    !hasApiSourceText ||
                                    !verificationAudit.isComplete;
                                if (shouldTreatAsFailure) {
                                    const gatewayLikeCode = !hasApiSourceText ? 'OCR_PARSE_FAILURE' : undefined;
                                    const fallbackMsg = !hasApiSourceText
                                        ? '서버 OCR 결과에 유효 텍스트가 없습니다.'
                                        : !verificationAudit.isComplete
                                            ? `OCR 구조 검증 실패: ${verificationAudit.issues.join(', ')}`
                                        : String(apiResult.ocrErrorMessage || insightText || '분석 실패');
                                    throw new Error(gatewayLikeCode ? `[${gatewayLikeCode}] ${fallbackMsg}` : fallbackMsg);
                                }
                                break; // Success!
                            }
                        } catch (err: any) {
                            const errMsg = err.message || JSON.stringify(err);
                            lastRetryErrorMessage = String(errMsg || '');
                            const parsedGatewayCode = extractGatewayErrorCode(lastRetryErrorMessage);
                            if (parsedGatewayCode) {
                                lastServerRouteErrorCode = parsedGatewayCode;
                                lastObservedServerRouteErrorCode = parsedGatewayCode;
                            }
                            const normalizedErr = String(errMsg || '').toLowerCase();
                            const isTransientRetryableError =
                                normalizedErr.includes('failed to fetch') ||
                                normalizedErr.includes('network') ||
                                normalizedErr.includes('timeout') ||
                                normalizedErr.includes('gateway') ||
                                normalizedErr.includes('service unavailable') ||
                                normalizedErr.includes('internal server error') ||
                                normalizedErr.includes('ocr_timeout') ||
                                normalizedErr.includes('ocr_upstream_network') ||
                                normalizedErr.includes('ocr_upstream_failure') ||
                                normalizedErr.includes('502') ||
                                normalizedErr.includes('503') ||
                                normalizedErr.includes('504');
                            
                            // [CRITICAL] Detect Rate Limit (429 or Resource Exhausted) using utility function
                            if (isRateLimitError(errMsg)) {
                                console.warn(`Rate limit hit for ${record.name}. Cooling down...`);
                                
                                // Mark quota as exhausted and trigger recovery timer
                                setQuotaExhausted(15); // 15분 복구 대기
                                
                                // Permanently increase delay buffer for future requests
                                dynamicDelayBuffer = Math.min(10, dynamicDelayBuffer + 2);
                                
                                // Wait 30 seconds then retry loop
                                await waitWithCountdown(30, "⚠️ API 할당량 초과! 냉각 중");
                                retryCount++;
                            } else if (isTransientRetryableError && retryCount < MAX_RETRIES - 1) {
                                retryCount++;
                                const backoffSeconds = Math.min(8, 2 + retryCount);
                                await waitWithCountdown(backoffSeconds, '⚠️ 일시적 서버 오류 복구 대기');
                            } else {
                                // Other errors (format, parsing) -> fail immediately
                                throw err; 
                            }
                        }
                    }

                    if (stopRef.current) { stopped = true; break; }

                    if (apiResult) {
                        const previousErrorLabel = isFailedRecord(record) ? getRecordFailureDisplayLabel(record) : '기타 오류';
                        // P0: UNKNOWN 2차 분류 — 실패 시 sub-category 결정
                        const resolvedFailureCode = resolveFailureCodeFromRecord(apiResult);
                        const unknownSubCategory =
                            resolvedFailureCode === 'UNKNOWN' ? classifyUnknownSubCategory(apiResult) : undefined;
                        // P0: Trace 표준화 — 클라이언트 폴백 trace 보완
                        const traceFromResult: import('../types').OcrTraceInfo | undefined =
                            apiResult.ocrTrace
                                ? apiResult.ocrTrace
                                : usedClientFallback
                                    ? {
                                        providerUsed: 'client_fallback',
                                        latencyMs: 0,
                                        attempts: retryCount + 1,
                                        fallbackDepth: 1,
                                        recordedAt: new Date().toISOString(),
                                    }
                                    : undefined;
                        const serverFailureHint = usedClientFallback && lastServerRouteErrorCode
                            ? ` | 서버실패:${lastServerRouteErrorCode}`
                            : usedClientFallback && lastServerRouteErrorMessage
                                ? ` | 서버실패:${lastServerRouteErrorMessage.slice(0, 80)}`
                                : '';
                        const apiResultFailed = Boolean(apiResult.ocrErrorType) || hasOperationalFailureSignal(apiResult);
                        const updatedRecord: WorkerRecord = withHarnessState(record, {
                            ...apiResult,
                            id: record.id, 
                            originalImage: record.originalImage || retryImageSource,
                            profileImage: record.profileImage, 
                            filename: record.filename,
                            role: record.role !== 'worker' ? record.role : apiResult.role,
                            isTranslator: record.isTranslator || apiResult.isTranslator,
                            isSignalman: record.isSignalman || apiResult.isSignalman,
                            ocrTrace: traceFromResult,
                            ocrUnknownSubCategory: apiResultFailed ? unknownSubCategory : undefined,
                            ocrErrorType: apiResultFailed ? apiResult.ocrErrorType : undefined,
                            ocrErrorMessage: apiResultFailed ? apiResult.ocrErrorMessage : undefined,
                            ocrFailureCode: apiResultFailed ? resolveFailureCodeFromRecord(apiResult) : undefined,
                            auditTrail: [
                                ...(record.auditTrail || []),
                                {
                                    stage: 'reassessment',
                                    timestamp: new Date().toISOString(),
                                    actor: 'manager',
                                    note: `OCR 재분석 성공 (${previousErrorLabel}) | ${usedClientFallback ? '브라우저 대체 분석' : '서버 성공'}${unknownSubCategory ? ` | UNKNOWN[${unknownSubCategory}]` : ''}${serverFailureHint}`,
                                },
                            ],
                            secondPassStatus: apiResultFailed ? 'NEEDED' : 'DONE',
                            workflowState: apiResultFailed ? 'manual_review_required' : 'completed',
                            riskDecision: apiResultFailed ? 'IMMEDIATE_ATTENTION' : 'SAFE_TO_PROCEED',
                            approvalState: apiResultFailed ? 'PENDING' : 'APPROVED',
                        });
                        const harnessSyncedRecord = await syncHarnessReanalyzeResult(updatedRecord, record);
                        onUpdateRecord(harnessSyncedRecord);

                        if (isFailedRecord(harnessSyncedRecord)) {
                            failCount++;
                            processingFailCount++;
                            const failedCode = resolveFailureCodeFromRecord(harnessSyncedRecord);
                            if (failedCode === 'QUOTA') {
                                quotaFailureCount++;
                            }
                            if (failedCode === 'KEY') {
                                keyFailureCount++;
                                consecutiveKeyFailureCount++;
                            } else {
                                consecutiveKeyFailureCount = 0;
                            }
                            if (serverRouteFailedForCurrentRecord && !serverRouteFailureCountedForCurrentRecord) {
                                serverRouteFailCount++;
                                serverRouteFailureCountedForCurrentRecord = true;
                            }
                            const next = incrementApiCallCount('fail');
                            setDailyCounter(next);
                        } else {
                            successCount++;
                            consecutiveKeyFailureCount = 0;
                            if (usedClientFallback) {
                                clientFallbackSuccessCount++;
                            } else {
                                serverSuccessCount++;
                            }
                            if (serverRouteFailedForCurrentRecord && !serverRouteFailureCountedForCurrentRecord) {
                                serverRouteFailCount++;
                                serverRouteFailureCountedForCurrentRecord = true;
                            }
                            const next = incrementApiCallCount('success');
                            setDailyCounter(next);
                        }

                        if (!forceReanalyze && quotaFailureCount >= 2) {
                            stopped = true;
                            stopRef.current = true;
                            alert('할당량(QUOTA) 실패가 반복되어 무료 플랜 보호를 위해 일괄 재분석을 자동 중단했습니다. 잠시 후 재개하세요.');
                            break;
                        }

                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });

                        if (!keyFailureAbortTriggered && successCount === 0 && consecutiveKeyFailureCount >= KEY_FAILURE_ABORT_THRESHOLD) {
                            keyFailureAbortTriggered = true;
                            stopped = true;
                            stopRef.current = true;
                            alert(
                                `KEY/권한 실패가 연속 ${consecutiveKeyFailureCount}건 발생하여 일괄 재분석을 중단했습니다.\n\n` +
                                `현재 모드의 실행 키와 권한/할당량 상태를 먼저 확인한 뒤 다시 실행해 주세요.\n` +
                                `설정 화면의 문서 분석 연결 정보가 실제 운영 설정과 일치하는지 점검이 필요합니다.`
                            );
                            break;
                        }

                        // Adaptive Rate Limit Buffer
                        if (i < processQueue.length - 1) {
                            await waitWithCountdown(dynamicDelayBuffer, "다음 분석 대기 (Throttle)");
                        }

                    } else {
                        // Final Failure after retries
                        const mappedFailureCode = mapGatewayCodeToFailureCode(lastServerRouteErrorCode);
                        const retryMessageCode = extractGatewayErrorCode(lastRetryErrorMessage);
                        const retryMessageFailureCode = mapGatewayCodeToFailureCode(retryMessageCode);
                        const failureCode = mappedFailureCode || retryMessageFailureCode || inferOcrFailureCode(lastRetryErrorMessage || '반복적인 API 오류');
                        const unknownSubCategory =
                            failureCode === 'UNKNOWN'
                                ? classifyUnknownSubCategory({ ocrErrorMessage: `${lastServerRouteErrorCode || ''} ${lastRetryErrorMessage || ''}` })
                                : undefined;
                        const errorRecord: WorkerRecord = withHarnessState(record, {
                            ...record,
                            aiInsights: withFailureCodePrefix(failureCode, `⛔ 반복적인 API 오류로 ${BRAND_STATUS_LABELS.attention} 안내가 필요합니다. 다시 확인해 주세요.`),
                            ocrErrorType: 'UNKNOWN',
                            ocrFailureCode: failureCode,
                            ocrErrorMessage: withFailureCodePrefix(failureCode, lastRetryErrorMessage || '반복적인 API 오류'),
                            ocrUnknownSubCategory: unknownSubCategory,
                            ocrTrace: {
                                providerUsed: usedClientFallback ? 'client_fallback' : 'server_gemini',
                                latencyMs: 0,
                                attempts: Math.max(1, retryCount + 1),
                                fallbackDepth: usedClientFallback ? 1 : 0,
                                finalCode: failureCode,
                                recordedAt: new Date().toISOString(),
                            },
                            secondPassStatus: 'NEEDED',
                            workflowState: 'awaiting_manager_approval',
                            riskDecision: 'IMMEDIATE_ATTENTION',
                            approvalState: 'PENDING',
                        });
                        onUpdateRecord(await syncHarnessReanalyzeResult(errorRecord, record));
                        failCount++;
                        processingFailCount++;
                        if (failureCode === 'QUOTA') {
                            quotaFailureCount++;
                        }
                        if (failureCode === 'KEY') {
                            keyFailureCount++;
                            consecutiveKeyFailureCount++;
                        } else {
                            consecutiveKeyFailureCount = 0;
                        }
                        if (serverRouteFailedForCurrentRecord && !serverRouteFailureCountedForCurrentRecord) {
                            serverRouteFailCount++;
                            serverRouteFailureCountedForCurrentRecord = true;
                        }
                        setRetryDiagnostics({
                            total,
                            success: successCount,
                            fail: failCount,
                            serverSuccess: serverSuccessCount,
                            clientFallbackSuccess: clientFallbackSuccessCount,
                            preflightFail: preflightFailCount,
                            processingFail: processingFailCount,
                            serverRouteFail: serverRouteFailCount,
                            lastUpdatedAt: new Date().toISOString(),
                        });
                        if (!keyFailureAbortTriggered && successCount === 0 && consecutiveKeyFailureCount >= KEY_FAILURE_ABORT_THRESHOLD) {
                            keyFailureAbortTriggered = true;
                            stopped = true;
                            stopRef.current = true;
                            alert(
                                `KEY/권한 실패가 연속 ${consecutiveKeyFailureCount}건 발생하여 일괄 재분석을 중단했습니다.\n\n` +
                                `현재 모드의 실행 키와 권한/할당량 상태를 먼저 확인한 뒤 다시 실행해 주세요.\n` +
                                `설정 화면의 문서 분석 연결 정보가 실제 운영 설정과 일치하는지 점검이 필요합니다.`
                            );
                            break;
                        }
                        if (!forceReanalyze && quotaFailureCount >= 2) {
                            stopped = true;
                            stopRef.current = true;
                            alert('할당량(QUOTA) 실패가 반복되어 무료 플랜 보호를 위해 일괄 재분석을 자동 중단했습니다. 잠시 후 재개하세요.');
                            break;
                        }
                        // Safety cooldown even on fail
                        await waitWithCountdown(2, "오류 복구 중");
                    }

                } catch (err: unknown) {
                    const errMsg = extractMessage(err);
                    if (errMsg === "STOPPED") { stopped = true; break; }
                    console.error("Batch Error:", err);
                    const catchGatewayCode = extractGatewayErrorCode(errMsg);
                    const catchMappedFailureCode = mapGatewayCodeToFailureCode(catchGatewayCode);
                    const lastServerMappedFailureCode = mapGatewayCodeToFailureCode(lastObservedServerRouteErrorCode);
                    const failureCode = catchMappedFailureCode || lastServerMappedFailureCode || inferOcrFailureCode(errMsg);
                    const errorRecord: WorkerRecord = withHarnessState(record, {
                        ...record,
                        aiInsights: withFailureCodePrefix(failureCode, `⛔ 시스템 오류: ${errMsg}`),
                        ocrErrorType: classifyLegacyOcrErrorType(errMsg),
                        ocrFailureCode: failureCode,
                        ocrErrorMessage: withFailureCodePrefix(failureCode, errMsg),
                        ocrTrace: {
                            providerUsed: 'unknown',
                            latencyMs: 0,
                            attempts: 1,
                            fallbackDepth: 0,
                            finalCode: failureCode,
                            recordedAt: new Date().toISOString(),
                        },
                        secondPassStatus: 'NEEDED',
                        workflowState: 'manual_review_required',
                        riskDecision: 'IMMEDIATE_ATTENTION',
                        approvalState: 'PENDING',
                    });
                    onUpdateRecord(await syncHarnessReanalyzeResult(errorRecord, record));
                    failCount++;
                    processingFailCount++;
                    if (failureCode === 'QUOTA') {
                        quotaFailureCount++;
                    }
                    if (failureCode === 'KEY') {
                        keyFailureCount++;
                        consecutiveKeyFailureCount++;
                    } else {
                        consecutiveKeyFailureCount = 0;
                    }
                    setRetryDiagnostics({
                        total,
                        success: successCount,
                        fail: failCount,
                        serverSuccess: serverSuccessCount,
                        clientFallbackSuccess: clientFallbackSuccessCount,
                        preflightFail: preflightFailCount,
                        processingFail: processingFailCount,
                        serverRouteFail: serverRouteFailCount,
                        lastUpdatedAt: new Date().toISOString(),
                    });
                    if (!keyFailureAbortTriggered && successCount === 0 && consecutiveKeyFailureCount >= KEY_FAILURE_ABORT_THRESHOLD) {
                        keyFailureAbortTriggered = true;
                        stopped = true;
                        stopRef.current = true;
                        alert(
                            `KEY/권한 실패가 연속 ${consecutiveKeyFailureCount}건 발생하여 일괄 재분석을 중단했습니다.\n\n` +
                            `현재 모드의 실행 키와 권한/할당량 상태를 먼저 확인한 뒤 다시 실행해 주세요.\n` +
                            `설정 화면의 문서 분석 연결 정보가 실제 운영 설정과 일치하는지 점검이 필요합니다.`
                        );
                        break;
                    }
                    if (!forceReanalyze && quotaFailureCount >= 2) {
                        stopped = true;
                        stopRef.current = true;
                        alert('할당량(QUOTA) 실패가 반복되어 무료 플랜 보호를 위해 일괄 재분석을 자동 중단했습니다. 잠시 후 재개하세요.');
                        break;
                    }
                } finally {
                    saveBatchCheckpoint({
                        savedAt: Date.now(),
                        title,
                        forceReanalyze,
                        total,
                        nextIndex: Math.min(i + 1, processQueue.length),
                        successCount,
                        failCount,
                        serverSuccessCount,
                        clientFallbackSuccessCount,
                        preflightFailCount,
                        processingFailCount,
                        serverRouteFailCount,
                        keyFailureCount,
                        lastRecordName: record.name,
                    });
                }
            }
        } catch (globalErr: unknown) {
            const gMsg = extractMessage(globalErr);
            const gCode = extractGatewayErrorCode(gMsg) || lastObservedServerRouteErrorCode;
            lastUnhandledBatchErrorMessage = gMsg;
            lastUnhandledBatchErrorCode = gCode;
            console.error("Global Batch Error:", gMsg);
            alert(
                `일괄 처리 중 예상치 못한 오류가 발생하여 중단되었습니다.\n\n` +
                `- 오류 코드: ${gCode || 'UNKNOWN'}\n` +
                `- 오류 메시지: ${gMsg || '알 수 없는 오류'}\n\n` +
                `오류 코드를 관리자에게 전달해 원인 확인을 진행해 주세요.`
            );
        } finally {
            setIsAnalyzing(false);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            if (!stopped && !lastUnhandledBatchErrorMessage) {
                clearBatchCheckpoint();
            }
            
            const modeLabel = forceReanalyze ? `[${BRAND_ACTION_LABELS.directReanalyze}]` : '';
            const fallbackOpportunity = clientFallbackSuccessCount + serverRouteFailCount;
            const fallbackRecoveryRateText = fallbackOpportunity > 0
                ? `${Math.round((clientFallbackSuccessCount / fallbackOpportunity) * 100)}%`
                : '집계 대기';
            const fallbackRecoveryState = fallbackOpportunity <= 0
                ? '집계 대기'
                : (Number(fallbackRecoveryRateText.replace('%', '')) < 30 ? '위험' : Number(fallbackRecoveryRateText.replace('%', '')) < 70 ? '주의' : '안정');
            const reasonsReport = `\n[원인 집계]\n- 서버 성공: ${serverSuccessCount}\n- 브라우저 대체 분석 성공: ${clientFallbackSuccessCount}\n- 사전 검증 실패: ${preflightFailCount}\n- OCR 처리 실패: ${processingFailCount}\n- 서버 라우트 실패: ${serverRouteFailCount}\n- KEY/권한 실패: ${keyFailureCount}\n- 대체 분석 회복률: ${fallbackRecoveryRateText} (${fallbackRecoveryState})${keyFailureAbortTriggered ? `\n- 자동중단: KEY 연속 실패 ${consecutiveKeyFailureCount}건` : ''}${lastUnhandledBatchErrorMessage ? `\n- 전역중단코드: ${lastUnhandledBatchErrorCode || 'UNKNOWN'}\n- 전역중단메시지: ${lastUnhandledBatchErrorMessage.slice(0, 140)}` : ''}`;
            
            if (stopped) {
                alert(`${modeLabel} 분석이 중단되었습니다.\n(완료: ${successCount}, ${BRAND_STATUS_LABELS.attentionPending}: ${failCount})${reasonsReport}`);
            } else {
                if (forceReanalyze) {
                    alert(`${modeLabel} ${title} 완료.\n\n✅ 완료: ${successCount}\n⚠ ${BRAND_STATUS_LABELS.attentionPending}: ${failCount}${reasonsReport}\n\n※ 사전 점검을 생략하는 방식으로 실행되었습니다.\n※ ${BRAND_STATUS_LABELS.attentionPending} 건은 '${BRAND_ACTION_LABELS.directReanalyze}' 또는 '${BRAND_ACTION_LABELS.smartReanalyze}' 버튼으로 ${BRAND_ACTION_LABELS.recheck}할 수 있습니다.`);
                } else {
                    alert(`${title} 완료.\n완료: ${successCount}\n${BRAND_STATUS_LABELS.attentionPending}: ${failCount}${reasonsReport}\n\n* ${BRAND_STATUS_LABELS.attentionPending} 건은 '${BRAND_STATUS_LABELS.attentionHold} 건 재분석' 버튼으로 ${BRAND_ACTION_LABELS.recheck}할 수 있습니다.`);
                }
            }
        }
    };

    // [IMPROVED] AI 갱신 함수명 명확화 + 재시도 로직 추가
    const handleBatchTextAnalysis = async () => {
        const targets = secondPassTargets;
        const total = targets.length;
        const skippedCount = baseFilteredRecords.length - total;
        const previewSummary = secondPassPreviewRecords.length > 0
            ? secondPassPreviewRecords
                .map((record, index) => `${index + 1}) ${record.name || '이름 없음'} · ${record.jobField} · ${record.safetyScore}점`)
                .join('\n')
            : '미리보기 대상 없음';
        if (total === 0) {
            alert(
                `2차 AI 재분석 가능 대상이 없습니다.\n\n` +
                `- 현재 필터 결과: ${baseFilteredRecords.length}건\n` +
                `- 제외 사유: ${secondPassSkippedSummary || '재분석 가능한 기록 없음'}\n\n` +
                `※ OCR ${BRAND_STATUS_LABELS.attentionPending} 건은 '${BRAND_ACTION_LABELS.smartReanalyze}' 또는 '${BRAND_ACTION_LABELS.directReanalyze}'을 사용해 주세요.`
            );
            return;
        }
        if (!confirm(
            `${total}명에 대해 관리자 수정사항을 반영한 2차 AI 재분석을 실행합니다.\n\n` +
            `- 현재 필터 결과 ${baseFilteredRecords.length}건 중 ${total}건 적용\n` +
            `- 제외 ${skippedCount}건${secondPassSkippedSummary ? ` (${secondPassSkippedSummary})` : ''}\n` +
            `- 관리자 수정 이력 필터 ${secondPassEditedOnly ? '사용' : '미사용'}\n` +
            `- 정렬 기준 ${getRecordSortModeLabel(recordSortMode)}\n\n` +
            `[상위 대상 미리보기]\n${previewSummary}\n\n` +
            `- 1차 OCR 원문 재추출이 아닌 수정 반영 재평가\n` +
            `- 응답품질, 확인단계, 강점/약점, AI 인사이트 갱신`
        )) return;

        setIsAnalyzing(true);
        setBatchProgress({ current: 0, total });
        stopRef.current = false;

        let successCount = 0;
        let failCount = 0;
        let stopped = false;
        let dynamicDelayBuffer = 2; // 초기 지연

        try {
            for (let i = 0; i < total; i++) {
                if (stopRef.current) { stopped = true; break; }
                const record = targets[i];
                setBatchProgress(p => ({ ...p, current: i + 1 }));
                setProgress(`2차 AI 재분석 중: ${record.name}`);

                // [FIXED] Add retry counter to prevent infinite loops (Bug #2)
                let retryCount = 0;
                const MAX_TEXT_RETRIES = 2;
                let shouldExitRetry = false;

                while (retryCount < MAX_TEXT_RETRIES && !shouldExitRetry) {
                    try {
                        const updatedAnalysis = await updateAnalysisBasedOnEdits(record);
                        if (stopRef.current) { stopped = true; break; }

                        if (updatedAnalysis) {
                            const mergedCandidate = { ...record, ...updatedAnalysis };
                            const mergedCandidateFailed = isFailedRecord(mergedCandidate);
                            const mergedBase: WorkerRecord = withHarnessState(record, {
                                ...record,
                                ...updatedAnalysis,
                                ocrErrorType: mergedCandidateFailed ? mergedCandidate.ocrErrorType : undefined,
                                ocrErrorMessage: mergedCandidateFailed ? mergedCandidate.ocrErrorMessage : undefined,
                                ocrFailureCode: mergedCandidateFailed ? resolveFailureCodeFromRecord(mergedCandidate) : undefined,
                                ocrUnknownSubCategory: mergedCandidateFailed ? mergedCandidate.ocrUnknownSubCategory : undefined,
                                auditTrail: [
                                    ...(record.auditTrail || []),
                                    {
                                        stage: 'reassessment',
                                        timestamp: new Date().toISOString(),
                                        actor: 'manager',
                                        note: buildReassessmentAuditNote(record, updatedAnalysis),
                                    }
                                ],
                                secondPassStatus: mergedCandidateFailed ? 'NEEDED' : 'DONE',
                                workflowState: mergedCandidateFailed ? 'awaiting_manager_approval' : 'completed',
                                riskDecision: mergedCandidateFailed ? 'SUPPLEMENTARY_REVIEW' : 'SAFE_TO_PROCEED',
                                approvalState: mergedCandidateFailed ? 'PENDING' : 'APPROVED',
                            });
                            const mergedRecord: WorkerRecord = isFailedRecord(mergedBase)
                                ? mergedBase
                                : {
                                    ...mergedBase,
                                    ocrErrorType: undefined,
                                    ocrErrorMessage: undefined,
                                    ocrFailureCode: undefined,
                                    ocrUnknownSubCategory: undefined,
                                };
                            onUpdateRecord(mergedRecord);
                            successCount++;
                        } else {
                            onUpdateRecord(withHarnessState(record, {
                                secondPassStatus: 'NEEDED',
                                workflowState: 'awaiting_manager_approval',
                                riskDecision: 'SUPPLEMENTARY_REVIEW',
                                approvalState: 'PENDING',
                            }));
                            failCount++;
                        }
                        shouldExitRetry = true; // Successfully completed (success or intentional null)
                    } catch (e: any) {
                        const eMsg = extractMessage(e);
                        if (eMsg === "STOPPED") { stopped = true; break; }
                        
                        // [IMPROVED] 429 에러 감지 및 처리 with retry limit
                        if (isRateLimitError(eMsg)) {
                            retryCount++;
                            console.warn(`Rate limit hit for ${record.name} (attempt ${retryCount}/${MAX_TEXT_RETRIES})`);
                            setQuotaExhausted(15);
                            dynamicDelayBuffer = Math.min(10, dynamicDelayBuffer + 2); // throttle 증가
                            
                            if (retryCount < MAX_TEXT_RETRIES) {
                                // 30초 대기 후 재시도
                                await waitWithCountdown(30, "⚠️ API 할당량 초과! 냉각 중");
                            } else {
                                // Max retries reached
                                failCount++;
                                console.error(`Max retries reached for ${record.name}`);
                                shouldExitRetry = true;
                            }
                        } else {
                            failCount++;
                            console.error(`Batch update error for ${record.name}:`, e);
                            shouldExitRetry = true; // Exit retry loop for non-rate-limit errors
                        }
                    }
                }

                if (stopRef.current) { stopped = true; break; }
                
                // 동적 지연 (429 회피)
                if (i < total - 1 && !stopRef.current) {
                    await waitWithCountdown(dynamicDelayBuffer, "다음 2차 재분석 대기");
                }
            }
        } finally {
            setIsAnalyzing(false);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            if (stopped) {
                alert(`중단됨: 성공 ${successCount}, 실패 ${failCount}`);
            } else {
                alert(`완료: 성공 ${successCount}, 실패 ${failCount}`);
            }
        }
    };

    const resetFilters = useCallback(() => {
        setSearchTerm('');
        setFilterLeader('all');
        setFilterTrust('all');
        setFilterReason('all');
        setFilterLevel('all');
        setFilterField('all');
        setSecondPassStatusFilter('all');
        setSecondPassExcludedOnly(false);
        setSecondPassReasonFilter('all');
        setRecordSortMode('recent-correction');
        setRecordMonthFilter('all');
        setRecordRenderLimit(INITIAL_RECORD_RENDER_LIMIT);
        setFilterStatus(failedOnlyDefault ? 'failed' : 'all');
    }, [failedOnlyDefault]);

    const ensureOcrExecutionPreflight = useCallback(async (): Promise<boolean> => {
        const verified = await verifyActiveOcrApiKey();
        if (verified.ok) return true;

        const prefix = verified.failureCode === 'QUOTA'
            ? '문서 분석 연결은 확인되었지만 현재 사용량 제한 상태입니다.'
            : verified.failureCode === 'KEY'
                ? '문서 분석 연결 정보가 유효하지 않거나 사용 권한이 없습니다.'
                : '문서 분석 전 사전 점검에 실패했습니다.';

        alert(
            `${prefix}\n현재 모드: ${verified.modeLabel}\n키 출처: ${verified.sourceLabel}\n실패 코드: ${verified.failureCode || 'UNKNOWN'}\n\n${verified.message}`
        );
        return false;
    }, []);

    const handleBatchReanalyze = async () => {
        if (!ocrExecutionKeyStatus.ready) {
            alert(`문서 분석 연결 정보가 설정되지 않았습니다.\n현재 방식: ${ocrExecutionKeyStatus.modeApiLabel}\n연결 정보 위치: ${ocrExecutionKeyStatus.sourceLabel}\n\n설정 화면에서 분석 서비스 연결키를 먼저 등록해 주세요.`);
            return;
        }

        if (!(await ensureOcrExecutionPreflight())) return;

        const splitSize = getBatchSplitSize();
        const total = recordsWithImagesBatchTargets.length;
        const excludedDoneCount = recordsWithImages.length - recordsWithImagesBatchTargets.length;
        if (total === 0) {
            if (excludedDoneCount > 0) {
                alert(`재분석 대상이 없습니다.\n\n전체 이미지 보유 ${recordsWithImages.length}건은 이미 2차 재분석 완료(DONE) 상태여서 일괄 재분석에서 자동 제외됩니다.`);
            } else {
                alert('재분석 가능한 이미지 대상이 없습니다.');
            }
            return;
        }
        const splitWarning = total > splitSize
            ? `\n\n⚠️ 현재 분할 단위: ${splitSize}건 (설정에서 변경 가능)\n${total}건 중 ${splitSize}건씩 우선순위 순으로 처리됩니다.`
            : '';
        const doneExcludeHint = excludedDoneCount > 0
            ? `\n\n※ 2차 재분석 완료(DONE) ${excludedDoneCount}건은 자동 제외됩니다.`
            : '';
        if (confirm(`전체 ${total}건 재분석 하시겠습니까?\n[주의] 무료 티어 한도는 시점/계정 상태에 따라 변동됩니다.${splitWarning}${doneExcludeHint}\n\n계속하시겠습니까?`)) {
            // 분할 단위가 total보다 작으면 우선순위 상위 splitSize건만 처리
            const sortedByPriority = [...recordsWithImagesBatchTargets].sort((a, b) => getRetryPriorityScore(a) - getRetryPriorityScore(b));
            const batch = total > splitSize ? sortedByPriority.slice(0, splitSize) : sortedByPriority;
            runBatchAnalysis(batch, total > splitSize ? `전체 재분석 (${batch.length}/${total}건 우선 처리)` : "전체 재분석");
        }
    };

    const handleSelectedReanalyze = async () => {
        if (selectedRecords.length === 0) {
            alert('재분석할 근로자를 먼저 선택해 주세요.');
            return;
        }

        if (!ocrExecutionKeyStatus.ready) {
            alert(`문서 분석 연결 정보가 설정되지 않았습니다.\n현재 방식: ${ocrExecutionKeyStatus.modeApiLabel}\n연결 정보 위치: ${ocrExecutionKeyStatus.sourceLabel}\n\n설정 화면에서 분석 서비스 연결키를 먼저 등록해 주세요.`);
            return;
        }

        if (!(await ensureOcrExecutionPreflight())) return;

        const totalSelected = selectedRecords.length;
        const eligibleCount = selectedReanalyzeTargets.length;
        const excludedCount = totalSelected - eligibleCount;

        if (eligibleCount === 0) {
            alert(`선택된 ${totalSelected}건 중 재분석 가능한 대상이 없습니다.\n\n이미지 미보유 또는 2차 재분석 완료(DONE) 상태는 자동 제외됩니다.`);
            return;
        }

        const excludedHint = excludedCount > 0
            ? `\n\n※ 선택 ${totalSelected}건 중 ${excludedCount}건은 자동 제외됩니다.`
            : '';

        if (confirm(`선택 근로자 ${eligibleCount}건만 재분석하시겠습니까?${excludedHint}`)) {
            runBatchAnalysis(selectedReanalyzeTargets, `선택 근로자 재분석 (${eligibleCount}건)`);
        }
    };

    const handleDeleteSelectedRecords = () => {
        if (selectedRecords.length === 0) {
            alert('삭제할 근로자를 먼저 선택해 주세요.');
            return;
        }

        const selectedCount = selectedRecords.length;
        if (!confirm(`선택된 근로자 ${selectedCount}명을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) {
            return;
        }

        selectedRecords.forEach((record) => {
            onDeleteRecord(record.id);
        });
        setSelectedIds([]);
    };

    const handleDeleteSingleRecord = useCallback((record: WorkerRecord) => {
        const label = `${record.name || '이름 미확인'} / ${String(record.date || '').slice(0, 10) || '날짜 미확인'}`;
        if (!confirm(`${label} 기록 1건을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) {
            return;
        }

        onDeleteRecord(record.id);
        setSelectedIds((ids) => ids.filter((id) => id !== record.id));
    }, [onDeleteRecord]);

    const handleDeleteWorkerRecords = useCallback((records: WorkerRecord[], label: string) => {
        const uniqueRecords = Array.from(new Map(records.map((record) => [record.id, record])).values());
        if (uniqueRecords.length === 0) return;

        if (!confirm(`${label} 기록 ${uniqueRecords.length}건을 모두 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) {
            return;
        }

        const deletedIds = new Set(uniqueRecords.map((record) => record.id));
        uniqueRecords.forEach((record) => onDeleteRecord(record.id));
        setSelectedIds((ids) => ids.filter((id) => !deletedIds.has(id)));
        setFocusedWorkerGroupKey(null);
    }, [onDeleteRecord]);

    const handleRetryFailed = async () => {
        if (!ocrExecutionKeyStatus.ready) {
            alert(`문서 분석 연결 정보가 설정되지 않았습니다.\n현재 방식: ${ocrExecutionKeyStatus.modeApiLabel}\n연결 정보 위치: ${ocrExecutionKeyStatus.sourceLabel}\n\n설정 화면에서 분석 서비스 연결키를 먼저 등록해 주세요.`);
            return;
        }

        if (!(await ensureOcrExecutionPreflight())) return;

        const hardTargets = failedRecords.filter(isHardRetryTarget);
        if (hardTargets.length === 0) {
            alert('다시 확인할 우선 점검 건이 없습니다.\n(점수 미달/저신뢰 건은 개별 검토를 권장합니다.)');
            return;
        }

        if (confirm(`우선 점검 대상 ${hardTargets.length}건만 먼저 다시 확인하시겠습니까?\n(할당량 절약을 위해 저신뢰 경고 건은 제외)`)) {
            runBatchAnalysis(hardTargets, "우선 점검 재분석");
        }
    };

    const handleForceReanalyze = async () => {
        if (!ocrExecutionKeyStatus.ready) {
            alert(`문서 분석 연결 정보가 설정되지 않았습니다.\n현재 방식: ${ocrExecutionKeyStatus.modeApiLabel}\n연결 정보 위치: ${ocrExecutionKeyStatus.sourceLabel}\n\n설정 화면에서 분석 서비스 연결키를 먼저 등록해 주세요.`);
            return;
        }

        if (!(await ensureOcrExecutionPreflight())) return;

        if (failedRecords.length === 0) {
            alert(`재분석할 ${BRAND_STATUS_LABELS.attentionPending} 건이 없습니다.`);
            return;
        }

        const confirm_msg = confirm(
            `⚠️ ${BRAND_ACTION_LABELS.directReanalyze} 모드\n\n${BRAND_STATUS_LABELS.attentionPending} ${failedRecords.length}건을 사전 점검 없이\n` +
            `직접 유료 분석으로 다시 처리하시겠습니까?\n\n` +
            `※ 유료 분석 서비스를 사용하므로 결과가 나올 때까지 비용이 발생합니다.`
        );
        
        if (confirm_msg) {
            runBatchAnalysis(failedRecords, `${BRAND_ACTION_LABELS.directReanalyze} (사전 점검 생략)`, true);
        }
    };

    const buildAdminNormalizedRecord = (record: WorkerRecord): WorkerRecord => {
        const normalizedScore = Number.isFinite(record.safetyScore) && record.safetyScore > 0
            ? Math.max(1, Math.min(100, Math.round(record.safetyScore)))
            : 60;

        const fallbackInsights = '관리자 수동 검토 완료: 현장 확인 후 정상 기록으로 분류되었습니다.';
        const insightsRaw = String(record.aiInsights || '').trim();
        const shouldReplaceInsights =
            !insightsRaw ||
            /오류|실패|429|RESOURCE_EXHAUSTED|할당량|재시도 필요|이미지 데이터|소실/i.test(insightsRaw);

        return withHarnessState(record, {
            ...record,
            safetyScore: normalizedScore,
            safetyLevel: getSafetyLevelFromScore(normalizedScore),
            aiInsights: shouldReplaceInsights ? fallbackInsights : insightsRaw,
            ocrErrorType: undefined,
            ocrErrorMessage: undefined,
            harnessPersistenceWarning: undefined,
            secondPassStatus: 'DONE',
            workflowState: 'completed',
            riskDecision: 'SAFE_TO_PROCEED',
            approvalState: 'APPROVED',
            auditTrail: [
                ...(record.auditTrail || []),
                {
                    stage: 'validation',
                    timestamp: new Date().toISOString(),
                    actor: 'manager',
                    note: `관리자 수동 정상분류 처리 (${getOcrErrorTypeKoreanLabel(getOcrErrorTypeFromRecord(record))})`,
                },
            ],
        });
    };

    const handleAdminNormalizeFailedBatch = () => {
        if (failedRecords.length === 0) {
            alert(`정상분류할 ${BRAND_STATUS_LABELS.attentionPending} 건이 없습니다.`);
            return;
        }

        const proceed = confirm(
            `${BRAND_STATUS_LABELS.attentionPending} ${failedRecords.length}건을 관리자 권한으로 일괄 정상분류하시겠습니까?\n\n` +
            `- OCR ${BRAND_STATUS_LABELS.attention} 플래그 제거\n` +
            `- 점수/등급 최소 보정\n` +
            `- 감사이력 기록`
        );
        if (!proceed) return;

        failedRecords.forEach((record) => {
            onUpdateRecord(buildAdminNormalizedRecord(record));
        });

        alert(`관리자 일괄 정상분류 완료: ${failedRecords.length}건`);
    };

    const handleAdminNormalizeFailedGroup = (records: WorkerRecord[], label: string) => {
        if (records.length === 0) {
            alert(`${label} 정상분류 대상이 없습니다.`);
            return;
        }

        const proceed = confirm(
            `${label} ${records.length}건을 관리자 권한으로 정상분류하시겠습니까?\n\n` +
            `- OCR 실패 플래그 제거\n` +
            `- 점수/등급 최소 보정\n` +
            `- 감사이력 기록`
        );
        if (!proceed) return;

        records.forEach((record) => {
            onUpdateRecord(buildAdminNormalizedRecord(record));
        });

        alert(`${label} 정상분류 완료: ${records.length}건`);
    };

    const handleAdminNormalizeFailedRecord = (record: WorkerRecord) => {
        const proceed = confirm(
            `관리자 수동 정상분류를 진행하시겠습니까?\n\n` +
            `- OCR 실패 플래그를 제거하고\n` +
            `- 최소 응답품질/확인단계를 보정하여\n` +
            `- 정상 기록으로 분류합니다.`
        );
        if (!proceed) return;

        onUpdateRecord(buildAdminNormalizedRecord(record));
        alert('관리자 수동 정상분류가 적용되었습니다.');
    };

    const handleViewRecordById = useCallback((recordId: string) => {
        const target = existingRecords.find((item) => item.id === recordId);
        if (!target) {
            alert('대상 기록을 찾을 수 없습니다. 목록을 새로 확인해 주세요.');
            return;
        }
        onViewDetails(target);
    }, [existingRecords, onViewDetails]);

    // File Upload Handler (Simple Version)
    const handleAnalyze = async () => {
        // Redirect to file processing which uses same logic if needed, 
        // but typically file upload relies on user adding files first.
        // For mass file upload, we should also implement throttling if > 10 files.
        if (files.length === 0) return;
        
        setIsAnalyzing(true);
        setBatchProgress({ current: 0, total: files.length });
        stopRef.current = false;
        
        const results: WorkerRecord[] = [];
        let stopped = false;
        
        try {
            for (let i = 0; i < files.length; i++) {
                if (stopRef.current) { stopped = true; break; }
                setBatchProgress(p => ({ ...p, current: i + 1 }));
                setProgress(`분석 중: ${files[i].name}`);
                
                // [IMPROVED] 재시도 로직 추가 (무한 루프 방지)
                let retryCount = 0;
                const MAX_FILE_RETRIES = 2;
                let analyzed = false;
                
                while (retryCount < MAX_FILE_RETRIES && !analyzed && !stopRef.current) {
                    try {
                        const base64 = await fileToBase64(files[i]);
                        const res = await analyzeWorkerRiskAssessment(base64, files[i].type, files[i].name);
                        
                        if (stopRef.current) { stopped = true; break; }

                        if (res && res.length > 0) {
                            const syncedRecord = await syncHarnessAnalyzeResult(res[0], files[i].name);
                            results.push(syncedRecord);
                            analyzed = true; // 성공 시 루프 종료
                        } else {
                            throw new Error("Empty result from AI");
                        }
                    } catch (e: any) {
                        const eMsg = e.message || JSON.stringify(e);
                        retryCount++;
                        
                        // 429 에러는 우아한 실패 (다음 파일로)
                        if (isRateLimitError(eMsg)) {
                            console.warn(`Rate limit hit on file ${files[i].name}`);
                            setQuotaExhausted(60);
                            const failMessage = `⛔ API 할당량이 가득 차 ${BRAND_STATUS_LABELS.attention} 안내가 필요합니다. 잠시 후 다시 확인해 주세요.`;
                            results.push(createFileAnalysisErrorRecord(files[i], failMessage, 'UNKNOWN'));
                            const next = incrementApiCallCount('fail');
                            setDailyCounter(next);
                            analyzed = true;
                            break; // 이 파일 건너뛰기
                        }
                        
                        // 다른 에러는 재시도
                        if (retryCount < MAX_FILE_RETRIES) {
                            await waitWithCountdown(30, `다시 확인 중 (${retryCount}/${MAX_FILE_RETRIES})`);
                        } else {
                            console.error(`Failed after ${MAX_FILE_RETRIES} retries:`, e);
                            const failMessage = `⛔ 파일 분석 실패: ${extractMessage(e) || '알 수 없는 오류'}`;
                            results.push(createFileAnalysisErrorRecord(files[i], failMessage, 'UNKNOWN'));
                            const next = incrementApiCallCount('fail');
                            setDailyCounter(next);
                            analyzed = true;
                            alert(`파일 분석 실패: ${files[i].name}`);
                        }
                    }
                }
                
                // 파일 분석 간 지연
                if (i < files.length - 1 && !stopRef.current && analyzed) {
                    await waitWithCountdown(4, "다음 파일 대기");
                }
            }
            
            if (results.length > 0) {
                onAnalysisComplete(results);
                if (onNavigateToPredictive) setShowPostAnalysisCta(true);
            }
        } finally {
            setIsAnalyzing(false);
            setFiles([]);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            if(stopped) alert("중단됨");
        }
    };

    const triggerBrowserDownload = (blob: Blob, fileName: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    };

    const handleExport = async () => {
        if (existingRecords.length === 0) {
            setExportFeedback({
                tone: 'warning',
                message: '내보낼 분석 기록이 없습니다.',
                detail: 'OCR 분석을 먼저 진행하거나 전체 백업 파일을 불러온 뒤 다시 실행하세요.',
            });
            return;
        }

        const confirmed = confirm("경고: 이미지 데이터가 포함된 백업 파일은 용량이 매우 클 수 있습니다.\n계속하시겠습니까?");
        if (!confirmed) {
            setExportFeedback({
                tone: 'warning',
                message: '전체 백업 내보내기를 취소했습니다.',
                detail: '비식별 요약은 별도로 저장할 수 있지만, 정밀 검증에는 전체 백업 JSON이 필요합니다.',
            });
            return;
        }

        const fileName = `PSI_Backup_${new Date().toISOString().slice(0,10)}.json`;
        setExportFeedback({
            tone: 'info',
            message: '전체 백업 파일을 준비 중입니다.',
            detail: `기록 ${existingRecords.length}건과 원본 이미지 데이터를 JSON으로 묶고 있습니다. 큰 파일은 잠시 멈춘 것처럼 보일 수 있습니다.`,
            fileName,
        });

        try {
            const saveFilePicker = (window as BackupSaveFilePickerWindow).showSaveFilePicker;
            if (saveFilePicker) {
                let writable: BackupWritableTarget | null = null;

                try {
                    const fileHandle = await saveFilePicker({
                        suggestedName: fileName,
                        types: [
                            {
                                description: 'NEW-PSI 전체 백업 JSON',
                                accept: { 'application/json': ['.json'] },
                            },
                        ],
                    });
                    writable = await fileHandle.createWritable();
                    setExportFeedback({
                        tone: 'info',
                        message: '전체 백업 파일을 저장 중입니다.',
                        detail: `대용량 안전 저장 방식으로 ${existingRecords.length}건을 순차 기록하고 있습니다. 저장이 끝날 때까지 창을 닫지 마세요.`,
                        fileName,
                    });

                    await writeBackupJsonChunks(
                        existingRecords,
                        (chunk) => writable!.write(chunk),
                        (writtenRecords, totalRecords) => {
                            setExportFeedback({
                                tone: 'info',
                                message: '전체 백업 파일을 저장 중입니다.',
                                detail: `${writtenRecords}/${totalRecords}건 기록 중입니다. 원본 이미지가 많은 백업은 시간이 걸릴 수 있습니다.`,
                                fileName,
                            });
                        },
                    );
                    await writable.close();

                    setExportFeedback({
                        tone: 'success',
                        message: '전체 백업 저장이 완료되었습니다.',
                        detail: `${fileName} 파일을 선택한 위치에 저장했습니다. 이 파일은 원본 이미지와 전체 수기문장을 포함한 정밀 검증용 백업입니다.`,
                        fileName,
                    });
                    alert(`전체 백업 저장이 완료되었습니다.\n\n파일명: ${fileName}\n\n이 파일은 원본 이미지와 전체 수기문장을 포함한 정밀 검증용 백업입니다.`);
                    return;
                } catch (pickerError) {
                    if (writable?.abort) {
                        await writable.abort().catch(() => undefined);
                    }

                    const pickerErrorName = pickerError instanceof DOMException
                        ? pickerError.name
                        : String((pickerError as { name?: unknown })?.name || '');

                    if (pickerErrorName === 'AbortError') {
                        setExportFeedback({
                            tone: 'warning',
                            message: '전체 백업 저장을 취소했습니다.',
                            detail: '저장 위치 선택이 취소되어 파일을 만들지 않았습니다.',
                            fileName,
                        });
                        return;
                    }

                    console.warn('File picker backup export failed. Falling back to browser download.', pickerError);
                }
            }

            setExportFeedback({
                tone: 'info',
                message: '전체 백업 다운로드 파일을 조립 중입니다.',
                detail: `브라우저 다운로드 방식으로 ${existingRecords.length}건을 레코드별로 묶고 있습니다.`,
                fileName,
            });
            await yieldToBrowser();

            const parts: BlobPart[] = [];
            await writeBackupJsonChunks(
                existingRecords,
                async (chunk) => {
                    parts.push(chunk);
                },
                (writtenRecords, totalRecords) => {
                    setExportFeedback({
                        tone: 'info',
                        message: '전체 백업 다운로드 파일을 조립 중입니다.',
                        detail: `${writtenRecords}/${totalRecords}건 처리 중입니다. 완료 후 다운로드 폴더에 저장됩니다.`,
                        fileName,
                    });
                },
            );

            const blob = new Blob(parts, { type: 'application/json;charset=utf-8' });
            triggerBrowserDownload(blob, fileName);
            setExportFeedback({
                tone: 'success',
                message: '전체 백업 저장 요청이 완료되었습니다.',
                detail: `다운로드 폴더에서 ${fileName} 파일을 확인하세요. 예상 용량: ${formatExportFileSize(blob.size)}.`,
                fileName,
            });
            alert(`전체 백업 저장 요청이 완료되었습니다.\n\n파일명: ${fileName}\n예상 용량: ${formatExportFileSize(blob.size)}\n\n브라우저 다운로드 폴더에서 파일을 확인하세요.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '알 수 없는 오류');
            setExportFeedback({
                tone: 'error',
                message: '전체 백업 내보내기에 실패했습니다.',
                detail: message,
                fileName,
            });
            alert(`전체 백업 내보내기에 실패했습니다.\n\n${message}`);
        }
    };

    const handleExportEvidenceSnapshot = () => {
        const maskWorkerName = (name?: string) => {
            const text = String(name || '').trim();
            if (!text) return '미상';
            if (text.length <= 1) return `${text}*`;
            return `${text.slice(0, 1)}${'*'.repeat(Math.min(2, text.length - 1))}`;
        };

        const payload = {
            snapshotType: 'NEW-PSI public evidence summary',
            generatedAt: new Date().toISOString(),
            privacyNotice: '원본 이미지, 서명, 전체 수기문장, 전화번호, 관리자 식별번호는 제외한 비식별 요약입니다.',
            identityBasis: '추적 후보 기준은 이름+국적입니다. 정확 식별 기준은 UUID/사번/QR을 우선합니다.',
            viewScope: focusedWorkerGroup ? '선택 근로자 월별 보기' : '현재 필터 전체 보기',
            activeFilters: {
                searchApplied: searchTerm.trim().length > 0,
                safetyLevel: filterLevel,
                workType: filterField,
                teamLeader: filterLeader,
                trustState: filterTrust,
                reason: filterReason,
                ocrStatus: filterStatus,
                secondPassStatus: secondPassStatusFilter,
                secondPassEditedOnly,
                secondPassExcludedOnly,
                secondPassReason: secondPassReasonFilter,
            },
            counts: {
                totalSavedRecords: existingRecords.length,
                filteredRecords: filteredRecords.length,
                visibleMonthlyRecords: recordListRecords.length,
                workerGroups: workerAccumulationGroups.length,
                trackingAutoConfirmedGroups: workerTrackingReviewSummary.exactGroups,
                trackingCandidateGroups: workerTrackingReviewSummary.candidateGroups,
                trackingReviewRequiredGroups: workerTrackingReviewSummary.reviewRequiredGroups,
                sameDateDuplicateGroups: workerTrackingReviewSummary.sameDateDuplicateGroups,
            },
            evidenceReadinessSummary,
            focusedWorker: focusedWorkerGroup
                ? {
                    workerLabel: maskWorkerName(focusedWorkerGroup.latestRecord.name),
                    nationality: focusedWorkerGroup.latestRecord.nationality || '미확인',
                    jobField: focusedWorkerGroup.latestRecord.jobField || '미확인',
                    recordCount: focusedWorkerGroup.records.length,
                    monthCount: focusedWorkerGroup.monthCount,
                    dateRange: focusedWorkerGroup.dateRangeLabel,
                }
                : null,
            workerGroups: workerAccumulationGroups.map((group, index) => ({
                workerNo: `관리단위-${String(index + 1).padStart(3, '0')}`,
                workerLabel: maskWorkerName(group.latestRecord.name),
                nationality: group.latestRecord.nationality || '미확인',
                jobFields: group.jobFields,
                teamLeaderCount: group.teamLeaders.length,
                recordCount: group.records.length,
                monthCount: group.monthCount,
                dateRange: group.dateRangeLabel,
                averageScore: group.averageScore,
                latestScore: group.latestScore,
                previousScore: group.previousScore,
                deltaScore: group.deltaScore,
                failedCount: group.failedCount,
                finalizedCount: group.finalizedCount,
                trackingMode: group.trackingMode,
                trackingReviewRequired: group.trackingReviewRequired,
                trackingReviewReason: group.trackingReviewReason,
                exactIdentityCount: group.exactIdentityCount,
                sameDateDuplicateCount: group.sameDateDuplicateCount,
                monthlyScores: [...group.records].reverse().map((record) => ({
                    month: formatWorkerGroupMonth(record),
                    date: String(record.date || '').slice(0, 10) || '날짜 없음',
                    score: Number.isFinite(Number(record.safetyScore)) ? Number(record.safetyScore) : null,
                    level: record.safetyLevel || '미확인',
                    reviewState: getReviewTrustState(record),
                    status: isFailedRecord(record) ? '확인 필요' : '분석 완료',
                })),
            })),
        };

        const fileName = `NEW-PSI_검증용_비식별_요약_${new Date().toISOString().slice(0, 10)}.json`;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        triggerBrowserDownload(blob, fileName);
        setExportFeedback({
            tone: 'success',
            message: '검증용 비식별 요약 저장 요청이 완료되었습니다.',
            detail: `${fileName} 파일은 공개 설명·제안·실증 요약용입니다. 원본 이미지와 전체 수기문장은 포함하지 않아 정밀 재검증용 전체 백업을 대체하지 않습니다.`,
            fileName,
        });
        alert('검증용 비식별 요약 JSON을 저장했습니다. 이 파일은 원본 이미지와 전체 수기문장을 포함하지 않습니다.');
    };

    const handleExportOcrVerificationPackage = () => {
        const targetRecords = recordListRecords.length > 0 ? recordListRecords : ocrAnalyzedRecords;

        if (targetRecords.length === 0) {
            setExportFeedback({
                tone: 'warning',
                message: 'OCR 검증 패키지로 저장할 기록이 없습니다.',
                detail: 'OCR 분석 결과가 있는 월 또는 필터를 먼저 선택한 뒤 다시 실행하세요.',
            });
            return;
        }

        const maskWorkerName = (name?: string) => {
            const text = String(name || '').trim();
            if (!text) return '미상';
            if (text.length <= 1) return `${text}*`;
            return `${text.slice(0, 1)}${'*'.repeat(Math.min(2, text.length - 1))}`;
        };

        const truncateText = (value: unknown, maxLength = 160) => {
            const text = String(value || '').replace(/\s+/g, ' ').trim();
            if (text.length <= maxLength) return text;
            return `${text.slice(0, maxLength)}...`;
        };

        const resolveOcrResultBucket = (record: WorkerRecord): string => {
            if (!isFailedRecord(record)) {
                return typeof record.ocrConfidence === 'number' && record.ocrConfidence < 0.7
                    ? '정상 분석(저신뢰)'
                    : '정상 분석';
            }

            const code = resolveFailureCodeFromRecord(record);
            if (code === 'QUOTA') return 'API 한도';
            if (code === 'PARSE') return '양식 판독';
            if (code === 'KEY') return '키/권한';
            if (code === 'NETWORK') return '네트워크/서버';
            if (code === 'FORMAT' || code === 'PAYLOAD') return '파일/이미지';
            return '기타 확인';
        };

        const getQuestionCoverage = (record: WorkerRecord) => {
            const answers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];
            const searchableText = [
                record.filename,
                record.fullText,
                record.koreanTranslation,
                ...answers.flatMap((answer) => [answer.questionNumber, answer.answerText, answer.koreanTranslation, answer.nativeTranslation]),
            ].filter(Boolean).join(' ').toLowerCase();

            const looksLikeChangedPsiForm =
                searchableText.includes('new-psi') ||
                searchableText.includes('psi-ra-01') ||
                /\bq[1-5]\b/i.test(searchableText) ||
                answers.length >= 3;
            const present = new Set<number>();
            answers.forEach((answer, index) => {
                const questionNumberText = String(answer.questionNumber || '').match(/\d+/)?.[0];
                const questionNumber = Number(questionNumberText || (index < 5 ? index + 1 : NaN));
                const answerText = [answer.answerText, answer.koreanTranslation, answer.nativeTranslation].filter(Boolean).join(' ').trim();
                if (Number.isInteger(questionNumber) && questionNumber >= 1 && questionNumber <= 5 && answerText.length >= 2) {
                    present.add(questionNumber);
                }
            });

            const presentQuestions = [1, 2, 3, 4, 5].filter((questionNumber) => present.has(questionNumber));
            const missingQuestions = [1, 2, 3, 4, 5].filter((questionNumber) => !present.has(questionNumber));

            return {
                looksLikeChangedPsiForm,
                presentQuestions,
                missingQuestions,
                presentCount: presentQuestions.length,
                status: !looksLikeChangedPsiForm
                    ? '기존/미확정 양식'
                    : missingQuestions.length === 0
                        ? 'Q1~Q5 추출 완료'
                        : presentQuestions.length >= 4
                            ? '일부 문항 확인 필요'
                            : '양식 판독 재확인 필요',
            };
        };

        const records = targetRecords.map((record, index) => {
            const failureCode = isFailedRecord(record) ? resolveFailureCodeFromRecord(record) : undefined;
            const coverage = getQuestionCoverage(record);
            const trace = record.ocrTrace;

            return {
                no: index + 1,
                recordId: record.id,
                workerLabel: maskWorkerName(record.name),
                filename: record.filename || '',
                date: record.date || '',
                nationality: record.nationality || '',
                jobField: record.jobField || '',
                teamLeader: record.teamLeader || '',
                resultBucket: resolveOcrResultBucket(record),
                failed: isFailedRecord(record),
                failureCode: failureCode || null,
                failureLabel: failureCode ? getRecordFailureDisplayLabel(record) : null,
                failureHeadline: isFailedRecord(record) ? getRecordFailureHeadline(record) : null,
                ocrErrorType: isFailedRecord(record) ? getOcrErrorTypeFromRecord(record) : null,
                ocrUnknownSubCategory: record.ocrUnknownSubCategory || null,
                ocrErrorMessage: truncateText(record.ocrErrorMessage, 240),
                ocrConfidence: typeof record.ocrConfidence === 'number' ? Number(record.ocrConfidence.toFixed(3)) : null,
                safetyScore: Number.isFinite(Number(record.safetyScore)) ? Number(record.safetyScore) : null,
                safetyLevel: record.safetyLevel || '',
                questionCoverage: coverage,
                handwrittenAnswerCount: Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers.length : 0,
                handwrittenAnswersPreview: (record.handwrittenAnswers || []).slice(0, 5).map((answer) => ({
                    questionNumber: answer.questionNumber,
                    answerTextPreview: truncateText(answer.answerText, 100),
                    koreanTranslationPreview: truncateText(answer.koreanTranslation, 100),
                    nativeTranslationPreview: truncateText(answer.nativeTranslation, 100),
                })),
                textEvidence: {
                    hasFullText: String(record.fullText || '').trim().length > 0,
                    hasKoreanTranslation: String(record.koreanTranslation || '').trim().length > 0,
                    fullTextPreview: truncateText(record.fullText, 220),
                    koreanTranslationPreview: truncateText(record.koreanTranslation, 220),
                    aiInsightsPreview: truncateText(record.aiInsights, 220),
                    nativeGuidancePreview: truncateText(record.aiInsights_native || record.improvement_native, 180),
                },
                imageEvidence: {
                    hasOriginalImage: hasRetryableOriginalImage(record.originalImage),
                    hasProfileImage: hasRetryableOriginalImage(record.profileImage),
                    originalImageLength: typeof record.originalImage === 'string' ? record.originalImage.length : 0,
                    profileImageLength: typeof record.profileImage === 'string' ? record.profileImage.length : 0,
                },
                trace: trace
                    ? {
                        providerUsed: trace.providerUsed,
                        attempts: trace.attempts,
                        fallbackDepth: trace.fallbackDepth,
                        finalCode: trace.finalCode || null,
                        latencyMs: trace.latencyMs,
                        recordedAt: trace.recordedAt,
                    }
                    : null,
                reviewState: getReviewTrustState(record),
                secondPassStatus: record.secondPassStatus || null,
                latestAuditNotes: (record.auditTrail || []).slice(-3).map((entry) => ({
                    stage: entry.stage,
                    timestamp: entry.timestamp,
                    actor: entry.actor,
                    note: truncateText(entry.note, 180),
                })),
            };
        });

        const countBy = (items: typeof records, key: keyof typeof records[number]) => (
            items.reduce<Record<string, number>>((acc, item) => {
                const raw = item[key];
                const label = String(raw || '없음');
                acc[label] = (acc[label] || 0) + 1;
                return acc;
            }, {})
        );
        const changedFormRecords = records.filter((record) => record.questionCoverage.looksLikeChangedPsiForm);
        const questionCoverageCounts = changedFormRecords.reduce<Record<string, number>>((acc, record) => {
            acc[record.questionCoverage.status] = (acc[record.questionCoverage.status] || 0) + 1;
            return acc;
        }, {});
        const lowConfidenceRecords = records.filter((record) => typeof record.ocrConfidence === 'number' && record.ocrConfidence < 0.7);

        const payload = {
            snapshotType: 'NEW-PSI OCR verification package',
            generatedAt: new Date().toISOString(),
            privacyNotice: '원본 이미지, 서명 원본, 전체 수기 원문은 제외했습니다. 근로자 이름은 마스킹했고 문항별 짧은 미리보기만 포함합니다.',
            purpose: 'OCR 1차 결과를 정상 분석, API 한도, 양식 판독, 키/권한, 네트워크/서버, 파일/이미지 문제로 분류해 Codex 검증과 상품화 발표 근거로 사용합니다.',
            appContext: {
                ocrEngine,
                ocrEngineLabel: getOcrEngineLabel(ocrEngine),
                apiMode: ocrExecutionKeyStatus.modeApiLabel,
                keyReady: ocrExecutionKeyStatus.ready,
                keySource: ocrExecutionKeyStatus.source,
                keySourceLabel: ocrExecutionKeyStatus.sourceLabel,
                operationalMode,
            },
            exportScope: {
                basis: recordListRecords.length > 0 ? '현재 화면 상세 기록 목록' : 'OCR 분석 기록 전체',
                currentScopeFilter: recordScopeFilter,
                selectedMonth: selectedMonthLabel,
                recordMonthFilter,
                searchApplied: searchTerm.trim().length > 0,
                filters: {
                    safetyLevel: filterLevel,
                    workType: filterField,
                    teamLeader: filterLeader,
                    trustState: filterTrust,
                    reason: filterReason,
                    ocrStatus: filterStatus,
                    secondPassStatus: secondPassStatusFilter,
                    secondPassEditedOnly,
                    secondPassExcludedOnly,
                    secondPassReason: secondPassReasonFilter,
                    focusedWorker: Boolean(focusedWorkerGroup),
                },
                totalSavedRecords: existingRecords.length,
                totalOcrAnalyzedRecords: ocrAnalyzedRecords.length,
                filteredRecords: filteredRecords.length,
                exportedRecords: records.length,
            },
            summary: {
                exportedRecords: records.length,
                normalCount: records.filter((record) => record.resultBucket.startsWith('정상 분석')).length,
                failedCount: records.filter((record) => record.failed).length,
                lowConfidenceCount: lowConfidenceRecords.length,
                resultBuckets: countBy(records, 'resultBucket'),
                failureCodes: countBy(records.filter((record) => record.failed), 'failureCode'),
                changedFormRecords: changedFormRecords.length,
                questionCoverage: questionCoverageCounts,
                recordsWithOriginalImage: records.filter((record) => record.imageEvidence.hasOriginalImage).length,
                serverGeminiSuccessCount: records.filter((record) => record.trace?.providerUsed === 'server_gemini' && !record.failed).length,
            },
            recommendedReadingOrder: [
                'summary.resultBuckets에서 정상/API 한도/양식 판독 비율을 먼저 확인',
                'summary.questionCoverage에서 변경 양식 Q1~Q5 추출 상태 확인',
                'records[].failureHeadline과 records[].ocrErrorMessage로 실제 반려 사유 확인',
                'records[].trace로 서버 재분석/폴백/최종코드 확인',
                '필요 시 전체 백업 JSON으로 원본 이미지 포함 정밀 재검증',
            ],
            records,
        };

        const fileName = `NEW-PSI_OCR_검증패키지_${new Date().toISOString().slice(0, 10)}_${records.length}건.json`;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        triggerBrowserDownload(blob, fileName);
        setExportFeedback({
            tone: 'success',
            message: 'OCR 검증 패키지 저장 요청이 완료되었습니다.',
            detail: `${records.length}건 기준으로 정상/API 한도/양식 판독 분류와 Q1~Q5 추출 상태를 저장했습니다. 원본 이미지는 포함하지 않았습니다.`,
            fileName,
        });
        alert(`OCR 검증 패키지를 저장했습니다.\n\n파일명: ${fileName}\n대상: ${records.length}건\n\n이 파일을 reports 폴더에 넣어주면 제가 71건 결과를 같이 검증할 수 있습니다.`);
    };

    const handleExportReanalysisSummary = () => {
        const blob = new Blob([reanalysisSummaryText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PSI_OCR_Reanalysis_Summary_${new Date().toISOString().slice(0,10)}.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleCopyReanalysisSummary = async () => {
        try {
            await navigator.clipboard.writeText(reanalysisSummaryText);
            alert('재분석 운영 요약이 클립보드에 복사되었습니다.');
        } catch {
            alert('클립보드 복사에 실패했습니다. 요약 내보내기를 사용해 주세요.');
        }
    };

    const handleFailureImmediateAction = useCallback(async (record: WorkerRecord, actionType: FailureImmediateActionType) => {
        const failureCode = resolveFailureCodeFromRecord(record);
        const trace = record.ocrTrace;
        const traceLine = `trace(provider=${trace?.providerUsed || 'unknown'}, attempts=${trace?.attempts ?? '-'}, fallbackDepth=${trace?.fallbackDepth ?? '-'}, finalCode=${trace?.finalCode || failureCode})`;
        const baseHeader = `[${failureCode}] ${record.name || '미상'} / ${record.jobField || '미분류'}`;

        let checklist = '';
        if (actionType === 'key-check') {
            checklist = [
                `${baseHeader}`,
                traceLine,
                '- 1) 서버 환경변수 GEMINI_API_KEY 존재 여부 확인',
                '- 2) 키 권한(401/403) 및 프로젝트 제한(IP/도메인) 확인',
                '- 3) 배포 환경과 로컬 환경 키가 동일한지 확인',
                '- 4) 수정 후 동일 레코드 1건 재분석으로 복구 확인',
            ].join('\n');
        } else if (actionType === 'quota-wait') {
            setQuotaExhausted(5);
            checklist = [
                `${baseHeader}`,
                traceLine,
                '- 1) 최근 24h QUOTA 급증 여부 확인',
                '- 2) 5분 냉각 후 단건 재시도로 정상 복구 확인',
                '- 3) 대량 재분석은 배치 간격을 늘려 분산 실행',
                '- 4) 필요 시 브라우저 대체 분석/서버 체인 전략 점검',
            ].join('\n');
        } else {
            checklist = [
                `${baseHeader}`,
                traceLine,
                '- 1) 게이트웨이/업스트림 5xx 비율 확인',
                '- 2) timeout 및 응답 지연(latencyMs) 이상 여부 확인',
                '- 3) 네트워크 복구 후 단건 재시도로 회복 확인',
                '- 4) 반복 시 운영 로그에 코드/시각/attempts 기록',
            ].join('\n');
        }

        try {
            await navigator.clipboard.writeText(checklist);
            setProgress(`[즉시조치] ${record.name}: ${actionType === 'key-check' ? '키 점검' : actionType === 'quota-wait' ? '쿼터 대기' : '네트워크 점검'} 체크리스트 복사 완료`);
            alert('즉시 조치 체크리스트를 클립보드에 복사했습니다. 운영 채널에 그대로 공유해도 됩니다.');
        } catch {
            alert(`즉시 조치 체크리스트 복사에 실패했습니다.\n\n${checklist}`);
        }
    }, []);

    const handleImportFile = (file: File) => {
        if (file.size >= BACKUP_HARD_FILE_LIMIT_BYTES) {
            alert(`백업 파일이 ${(file.size / (1024 * 1024)).toFixed(1)}MB로 브라우저 안전 한도 500MB를 초과했습니다.\n대용량 원본은 월별로 분리하거나 전용 마이그레이션 절차로 복원해 주세요.`);
            if (importInputRef.current) importInputRef.current.value = '';
            return;
        }
        if (
            file.size >= BACKUP_LARGE_FILE_WARNING_BYTES
            && !confirm(`대용량 백업 ${(file.size / (1024 * 1024)).toFixed(1)}MB입니다.\n복원 중 브라우저 메모리를 많이 사용할 수 있습니다. 계속하시겠습니까?`)
        ) {
            if (importInputRef.current) importInputRef.current.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (re) => {
            try {
                const data = JSON.parse(re.target?.result as string);
                const resolved = resolveBackupPayload(data);
                if (resolved.records.length === 0) {
                    alert('복구 가능한 근로자 기록을 찾지 못했습니다. (배열 또는 records/workerRecords 키 필요)');
                    return;
                }

                const validation = analyzeBackupImport(resolved.records, existingRecords, {
                    fileName: file.name,
                    fileSize: file.size,
                    schemaVersion: resolved.schemaVersion,
                });
                setImportValidationSummary(validation.summary);
                setImportValidationDetails(validation.details);

                if (validation.blocked) {
                    alert(`백업을 안전하게 복원할 수 없습니다.\n\n${validation.warnings.join('\n') || '검증 통과 기록이 없습니다.'}\n\n화면의 사전검증 결과를 확인해 주세요.`);
                    return;
                }
                if (!confirm(validation.confirmationText)) return;

                const importedRecords = await Promise.resolve(onImport(validation.validRecords));
                const reviewRecord = Array.isArray(importedRecords) && importedRecords.length > 0
                    ? importedRecords[0]
                    : validation.validRecords[0];
                resetWorkerSearchFiltersForImport();
                alert(`백업 복구 완료\n- 원본: ${validation.rawRecordCount}건\n- 검증 통과: ${validation.validRecords.length}건\n- 제외: ${validation.problematicRecordCount + validation.invalidObjectCount}건\n- 신규 ID: ${validation.newRecordCount}건\n- 같은 ID 갱신: ${validation.existingIdCollisionCount}건\n- 예상 총계: ${validation.projectedTotalRecords}건\n\n근로자 정보검색 필터를 전체 보기로 전환했습니다. 불러온 근로자는 아래 '근로자별 누적 보기'와 기록 목록에서 확인할 수 있습니다.\n\n첫 번째 복구 기록을 상세 판단 화면으로 열어 확인·수정할 수 있게 했습니다. 나머지는 OCR 분석 목록의 '상세 판단'에서 이어서 확인하세요.`);
                if (reviewRecord) {
                    onViewDetails(reviewRecord);
                }
            } catch (err) {
                const message = extractMessage(err);
                alert(`백업 파일 불러오기 중 확인이 필요합니다.\n${message || '파일 형식 또는 저장 연결 상태를 확인해 주세요.'}`);
            } finally {
                if (importInputRef.current) importInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const mobilePriorityReportRecord = useMemo(() => {
        const scoreValue = (record: WorkerRecord): number => {
            const value = Number(record.safetyScore);
            return Number.isFinite(value) ? value : 101;
        };

        const mobilePriority = (record: WorkerRecord): number => {
            if (isFailedRecord(record)) return 0;
            if (scoreValue(record) < 60) return 1;
            if (typeof record.ocrConfidence === 'number' && record.ocrConfidence < 0.7) return 2;
            return 3;
        };

        return [...filteredRecords].sort((a, b) => {
            const priorityDiff = mobilePriority(a) - mobilePriority(b);
            if (priorityDiff !== 0) return priorityDiff;

            const scoreDiff = scoreValue(a) - scoreValue(b);
            if (scoreDiff !== 0) return scoreDiff;

            return getWorkerGroupDateValue(b) - getWorkerGroupDateValue(a);
        })[0] || null;
    }, [filteredRecords]);

    const mobileProofSnapshot = useMemo(() => {
        const totalRecords = evidenceReadinessSummary.totalRecords;
        const trackedWorkers = evidenceReadinessSummary.multiMonthWorkerGroups;
        const workerGroups = evidenceReadinessSummary.workerGroups;
        const reviewRequired = workerTrackingReviewSummary.reviewRequiredGroups;
        const candidateGroups = workerTrackingReviewSummary.candidateGroups;
        const lowScoreRecords = evidenceReadinessSummary.lowScoreRecords;
        const attentionRecords = failedRecords.length + lowConfidenceCount + lowScoreRecords;
        const evidenceReady =
            totalRecords > 0
            && evidenceReadinessSummary.handwrittenCoverageRate >= 80
            && evidenceReadinessSummary.nativeGuidanceCoverageRate >= 70;
        const statusLabel = totalRecords === 0
            ? '데이터 대기'
            : evidenceReady
                ? '발표 증빙 가능'
                : '보강 확인';
        const proofLine = totalRecords > 0
            ? `OCR ${totalRecords}건이 근로자 ${workerGroups}명, 다월 추적 ${trackedWorkers}명, 확인 후보 ${reviewRequired}명으로 연결됩니다.`
            : '촬영 또는 백업 불러오기 후 근로자 진단, 리포트, 추적평가가 한 흐름으로 열립니다.';

        return {
            totalRecords,
            trackedWorkers,
            workerGroups,
            reviewRequired,
            candidateGroups,
            lowScoreRecords,
            attentionRecords,
            evidenceReady,
            statusLabel,
            proofLine,
        };
    }, [evidenceReadinessSummary, failedRecords.length, lowConfidenceCount, workerTrackingReviewSummary]);

    const handleOpenMobileCapture = useCallback(() => {
        setIsNewOcrSectionCollapsed(false);
        setMobileMode('quick');
        window.setTimeout(() => {
            newOcrCaptureSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
    }, []);

    const handleOpenMobilePriorityReport = useCallback(() => {
        if (mobilePriorityReportRecord) {
            onOpenReport(mobilePriorityReportRecord);
            return;
        }
        handleOpenMobileCapture();
    }, [handleOpenMobileCapture, mobilePriorityReportRecord, onOpenReport]);

    const handleOpenMobileTrackingReview = useCallback(() => {
        setShowAllWorkerAccumulations(true);
        setMobileMode('quick');
        window.setTimeout(() => {
            const target = workerTrackingSectionRef.current || evidenceReadinessSectionRef.current || newOcrCaptureSectionRef.current;
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
    }, []);

    const isCompactMobile = viewportWidth < 640;

    return (
        <div className="space-y-6 sm:space-y-8 animate-fade-in-up">
            <input
                type="file"
                ref={importInputRef}
                className="hidden"
                accept=".json"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportFile(file);
                }}
            />
            {isStartChecklistIncomplete && (
                <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
                    <p className="text-sm font-black">업무 시작 점검이 아직 완료되지 않았습니다.</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-amber-800">분석 화면과 파일 업로드는 사용할 수 있습니다. 실제 자동 분석 전 분석 연결키, 현장 정보, 저장 연결 상태를 확인해 주세요.</p>
                </div>
            )}
            <section
                data-mobile-proof="field-mode"
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
                aria-label="모바일 현장 원터치 모드"
            >
                <div className="bg-slate-950 px-4 py-5 text-white sm:px-6 sm:py-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-3 py-1 text-[11px] font-black ${mobileProofSnapshot.evidenceReady ? 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/20' : 'bg-amber-400/15 text-amber-200 border border-amber-300/20'}`}>
                                    {mobileProofSnapshot.statusLabel}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black text-slate-200">
                                    모바일 현장 모드
                                </span>
                            </div>
                            <h3 className="mt-3 text-xl font-black leading-tight text-white sm:text-2xl">
                                촬영한 위험성평가 기록지를 진단·리포트·추적평가로 즉시 연결
                            </h3>
                            <p data-mobile-proof="proof-line" className="mt-2 max-w-3xl text-xs font-bold leading-relaxed text-slate-300 sm:text-sm">
                                {mobileProofSnapshot.proofLine}
                            </p>
                        </div>
                        <div className="grid min-w-0 grid-cols-2 gap-2 text-center text-[11px] font-black sm:min-w-[320px]">
                            <div data-mobile-proof="metric-total-records" className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
                                <p className="text-slate-400">OCR 기록</p>
                                <p className="mt-1 text-xl text-indigo-200">{mobileProofSnapshot.totalRecords}건</p>
                            </div>
                            <div data-mobile-proof="metric-tracked-workers" className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
                                <p className="text-slate-400">다월 추적</p>
                                <p className="mt-1 text-xl text-emerald-200">{mobileProofSnapshot.trackedWorkers}명</p>
                            </div>
                            <div data-mobile-proof="metric-review-required" className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
                                <p className="text-slate-400">확인 후보</p>
                                <p className="mt-1 text-xl text-amber-200">{mobileProofSnapshot.reviewRequired}명</p>
                            </div>
                            <div data-mobile-proof="metric-protection" className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
                                <p className="text-slate-400">보호 우선</p>
                                <p className="mt-1 text-xl text-rose-200">{mobileProofSnapshot.lowScoreRecords}건</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:p-4">
                    <button
                        type="button"
                        data-mobile-proof="action-scan"
                        onClick={handleOpenMobileCapture}
                        className="flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-3 py-3 text-xs font-black text-white shadow-md transition-colors hover:bg-indigo-700 active:scale-[0.99]"
                    >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 7h2l1.5-2h7L17 7h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                            <circle cx="12" cy="13" r="3.5" />
                        </svg>
                        촬영/스캔
                    </button>
                    <button
                        type="button"
                        data-mobile-proof="action-report"
                        onClick={handleOpenMobilePriorityReport}
                        className="flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-3 text-xs font-black text-white shadow-md transition-colors hover:bg-black active:scale-[0.99]"
                    >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 3v4a2 2 0 0 0 2 2h4" />
                            <path d="M6 3h8l6 6v12H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
                            <path d="M8 13h8M8 17h5" />
                        </svg>
                        리포트 열기
                    </button>
                    <button
                        type="button"
                        data-mobile-proof="action-tracking"
                        onClick={handleOpenMobileTrackingReview}
                        className="flex min-h-[54px] items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-black text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-[0.99]"
                    >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 19V5" />
                            <path d="M4 19h16" />
                            <path d="m7 15 4-4 3 3 5-7" />
                        </svg>
                        추적평가
                    </button>
                    <button
                        type="button"
                        data-mobile-proof="action-evidence-export"
                        onClick={handleExportEvidenceSnapshot}
                        disabled={existingRecords.length === 0}
                        className="flex min-h-[54px] items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-xs font-black text-cyan-800 transition-colors hover:bg-cyan-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3v12" />
                            <path d="m7 10 5 5 5-5" />
                            <path d="M5 21h14" />
                        </svg>
                        증빙 저장
                    </button>
                </div>
            </section>
            {/* Control Panel */}
            <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1.15fr)_360px] gap-6 xl:gap-8 items-start">
                    <div className="min-w-0">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 sm:gap-4">
                            <div>
                                <h3 className="text-xl sm:text-2xl font-black mb-1.5 sm:mb-2 flex items-center gap-2 sm:gap-3">
                                    위험성평가 문서 분석 현황
                                    <span className="text-xs bg-indigo-600 px-2 py-1 rounded-md font-bold tracking-widest">운영</span>
                                </h3>
                                <p className="text-slate-300 font-medium max-w-3xl leading-relaxed">
                                    PC 화면은 <span className="text-indigo-300 font-bold">핵심 현황 → 긴급 조치</span> 순서로 바로 판단할 수 있도록 요약해 제공합니다.
                                    {showDashboardIntroDetail && (
                                        <>
                                            {' '}현재 {BRAND_STATUS_LABELS.attentionPending} 건, 저신뢰 기록, 재분석 가능 건을 먼저 보고 필요한 조치만 우측에서 실행하도록 구성되어 있습니다.
                                        </>
                                    )}
                                </p>
                                {!isCompactMobile && (
                                    <>
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-bold text-slate-200">
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">✓ 다국어 문서 글자 인식(OCR) 지원</div>
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">✓ 손글씨·저해상도 이미지 보정 분석</div>
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">✓ 오류 코드 기반 즉시 재시도 동선 제공</div>
                                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">✓ 분석 후 위험 매핑/관리자 검토 연계</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowDashboardIntroDetail((prev) => !prev)}
                                            className="mt-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[11px] font-black text-slate-200 hover:bg-white/20"
                                        >
                                            {showDashboardIntroDetail ? '설명 접기' : '설명 자세히'}
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-slate-100">재분석 가능 {secondPassTargets.length}건</span>
                                <span className="px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-400/20 text-rose-200">{BRAND_STATUS_LABELS.attentionPending} {failedRecords.length}건</span>
                                <span className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/20 text-amber-200">저신뢰 {lowConfidenceCount}건</span>
                            </div>
                        </div>

                        <InterpretationCardGrid
                            items={heroInterpretationCards}
                            className="mt-3 sm:mt-6 grid grid-cols-1 xl:grid-cols-3 gap-2 sm:gap-3"
                            cardClassName="rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-4"
                            eyebrowClassName="text-[10px] font-black uppercase tracking-[0.18em] opacity-80"
                            titleClassName="mt-2 text-base font-black text-white"
                            descriptionClassName="mt-2 text-[12px] font-semibold leading-relaxed text-white/80"
                        />

                        <SummaryMetricGrid
                            className="mt-3 sm:mt-6 grid grid-cols-2 gap-2 sm:gap-3"
                            cardClassName="rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-4"
                            items={[
                                {
                                    key: 'overview-total-records',
                                    label: '총 기록수',
                                    value: existingRecords.length,
                                    helper: '현재 OCR 운영 대상',
                                    tone: BRAND_TONE.glassSoft,
                                    labelClassName: 'text-[10px] font-black uppercase tracking-widest text-slate-500',
                                    valueClassName: 'mt-2 text-2xl font-black text-indigo-300',
                                    helperClassName: 'mt-1 text-[11px] font-bold text-slate-400',
                                },
                                {
                                    key: 'overview-attention-pending',
                                    label: BRAND_STATUS_LABELS.attentionPending,
                                    value: failedRecords.length,
                                    helper: '우선 확인 권장',
                                    tone: BRAND_TONE.darkRose,
                                    labelClassName: 'text-[10px] font-black uppercase tracking-widest text-rose-300',
                                    valueClassName: `mt-2 text-2xl font-black ${failedRecords.length > 0 ? 'text-rose-300' : 'text-slate-400'}`,
                                    helperClassName: 'mt-1 text-[11px] font-bold text-rose-200/80',
                                },
                            ]}
                        />

                        {isCompactMobile && (
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMobileMode('quick')}
                                    className={`flex-1 px-3 py-1.5 rounded-lg font-black text-[11px] transition-all ${mobileMode === 'quick' ? 'bg-indigo-600 text-white border border-indigo-500' : 'bg-white/10 border border-white/10 text-slate-200 hover:bg-white/20'}`}
                                >
                                    ⚡ 빠른분석
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMobileMode('detailed')}
                                    className={`flex-1 px-3 py-1.5 rounded-lg font-black text-[11px] transition-all ${mobileMode === 'detailed' ? 'bg-indigo-600 text-white border border-indigo-500' : 'bg-white/10 border border-white/10 text-slate-200 hover:bg-white/20'}`}
                                >
                                    📋 상세검수
                                </button>
                            </div>
                        )}

                        {(!isImmediateOperationalMode && (!isCompactMobile || isDevMode || mobileMode === 'detailed')) && (
                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={() => setShowExtendedOverviewMetrics((prev) => !prev)}
                                className="rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-[11px] font-black text-slate-200 hover:bg-white/20"
                            >
                                {showExtendedOverviewMetrics ? '보조 KPI 접기' : '보조 KPI 더 보기'}
                            </button>
                        </div>
                        )}

                        {(!isImmediateOperationalMode && (!isCompactMobile || isDevMode || mobileMode === 'detailed')) && showExtendedOverviewMetrics && (
                            <SummaryMetricGrid
                                className="mt-2 sm:mt-3 grid grid-cols-2 gap-2 sm:gap-3"
                                cardClassName="rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-4"
                                items={[
                                    {
                                        key: 'overview-low-confidence',
                                        label: '신뢰도 미달',
                                        value: lowConfidenceCount,
                                        helper: '70% 미만 재검토',
                                        tone: BRAND_TONE.darkAmber,
                                        labelClassName: 'text-[10px] font-black uppercase tracking-widest text-amber-300',
                                        valueClassName: `mt-2 text-2xl font-black ${lowConfidenceCount > 0 ? 'text-amber-300' : 'text-slate-400'}`,
                                        helperClassName: 'mt-1 text-[11px] font-bold text-amber-200/80',
                                    },
                                    {
                                        key: 'overview-api-count',
                                        label: '오늘 분석 요청',
                                        value: dailyCounter.count,
                                        helper: (
                                            <div className="flex items-center justify-between gap-2">
                                                <span>✓{dailyCounter.successCount} · ✗{dailyCounter.failCount}</span>
                                                <button onClick={() => { resetApiCallCount(); setDailyCounter(getApiCallState()); }} className="text-[10px] text-slate-300 underline hover:text-white" title="오늘 카운터 초기화">초기화</button>
                                            </div>
                                        ),
                                        tone: BRAND_TONE.darkEmerald,
                                        labelClassName: 'text-[10px] font-black uppercase tracking-widest text-emerald-300',
                                        valueClassName: `mt-2 text-2xl font-black ${dailyCounter.count > 800 ? 'text-rose-300' : dailyCounter.count > 400 ? 'text-amber-300' : 'text-emerald-300'}`,
                                        helperClassName: 'mt-1 text-[11px] font-bold text-slate-300',
                                    },
                                ]}
                            />
                        )}

                        {(!isImmediateOperationalMode && (!isCompactMobile || isDevMode || mobileMode === 'detailed')) && failedFailureCodeSummary.length > 0 && (
                            <>
                                <SummaryMetricGrid
                                    className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5"
                                    cardClassName="rounded-2xl border px-4 py-3"
                                    items={failedFailureCodeSummary.slice(0, showAllFailureCodeCards ? 5 : 3).map((item) => ({
                                        key: `overview-failure-code-${item.code}`,
                                        label: `실패코드 ${item.code}`,
                                        value: item.count,
                                        helper: item.action,
                                        tone: getFailureCodeTone(item.code),
                                        labelClassName: 'text-[10px] font-black uppercase tracking-widest text-slate-300',
                                        valueClassName: 'mt-1 text-xl font-black text-white',
                                        helperClassName: 'mt-1 text-[11px] font-bold text-slate-300/90 line-clamp-3',
                                    }))}
                                />
                                {failedFailureCodeSummary.length > 3 && (
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowAllFailureCodeCards((prev) => !prev)}
                                            className="rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-[11px] font-black text-slate-200 hover:bg-white/20"
                                        >
                                            {showAllFailureCodeCards ? '실패코드 카드 접기' : '실패코드 카드 전체 보기'}
                                        </button>
                                    </div>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black text-slate-200">
                                    <span className="rounded-full bg-slate-800/70 border border-slate-600/70 px-3 py-1">최근 24h 갱신 실패 {failedFailureCodeRecentSummary.totalRecent}건 ({failedFailureCodeRecentSummary.recentShare}%)</span>
                                    {failedFailureCodeRecentSummary.topRecent && (
                                        <span className="rounded-full bg-violet-500/20 border border-violet-300/30 px-3 py-1 text-violet-100">
                                            집중 코드 {failedFailureCodeRecentSummary.topRecent.code} · {failedFailureCodeRecentSummary.topRecent.count}건
                                        </span>
                                    )}
                                    {failedFailureCodeRecentSummary.topRecent?.action && (
                                        <span className="rounded-full bg-slate-800/70 border border-slate-600/70 px-3 py-1 text-slate-100">
                                            우선 조치 {failedFailureCodeRecentSummary.topRecent.action}
                                        </span>
                                    )}
                                </div>
                                {/* P0: UNKNOWN 서브카테고리 표시 */}
                                {failedFailureCodeSummary.find(i => i.code === 'UNKNOWN' && (i.unknownSubCounts)) && (() => {
                                    const unknownItem = failedFailureCodeSummary.find(i => i.code === 'UNKNOWN')!;
                                    const sub = unknownItem.unknownSubCounts!;
                                    const total = unknownItem.count;
                                    if (total === 0) return null;
                                    return (
                                        <div className="mt-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/50">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">UNKNOWN 2차 분류</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {sub['network-like'] > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-900/40 border border-rose-700/40 text-rose-200 text-[10px] font-bold">네트워크 의심 {sub['network-like']}건</span>}
                                                {sub['parse-like'] > 0 && <span className="px-2 py-0.5 rounded-full bg-violet-900/40 border border-violet-700/40 text-violet-200 text-[10px] font-bold">파싱 의심 {sub['parse-like']}건</span>}
                                                {sub['policy-like'] > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/40 text-amber-200 text-[10px] font-bold">정책/권한 의심 {sub['policy-like']}건</span>}
                                                {sub['uncategorized'] > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-700/60 border border-slate-600/40 text-slate-300 text-[10px] font-bold">미분류 {sub['uncategorized']}건</span>}
                                            </div>
                                        </div>
                                    );
                                })()}
                                {/* P0: 24h/7d 비교 패널 */}
                                {failureTrendComparison.recent7dTotal > 0 && (
                                    <div className={`mt-2 p-2.5 rounded-xl border ${failureTrendComparison.trend === 'up' ? 'bg-rose-950/40 border-rose-700/40' : failureTrendComparison.trend === 'down' ? 'bg-emerald-950/40 border-emerald-700/40' : 'bg-slate-900/50 border-slate-700/40'}`}>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">전/후 비교 (24h vs 7d)</p>
                                        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                                            <span className="px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-600/40 text-slate-200">
                                                서버성공 24h {failureTrendComparison.serverSuccessRate24}% · 7d {failureTrendComparison.serverSuccessRate7d}%
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-600/40 text-slate-200">
                                                처리실패 24h {failureTrendComparison.failRate24}% · 7d {failureTrendComparison.failRate7d}%
                                                {failureTrendComparison.trend === 'up' && <span className="ml-1 text-rose-300">▲ 악화</span>}
                                                {failureTrendComparison.trend === 'down' && <span className="ml-1 text-emerald-300">▼ 개선</span>}
                                                {failureTrendComparison.trend === 'stable' && <span className="ml-1 text-slate-400">─ 안정</span>}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-600/40 text-slate-200">
                                                UNKNOWN 비중 24h {failureTrendComparison.unknownRate24}% · 7d {failureTrendComparison.unknownRate7d}%
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {(!isCompactMobile || mobileMode === 'detailed') ? (
                    <SectionPanelCard
                        variant="glassDark"
                        eyebrow="빠른 실행"
                        title="긴급 조치와 백업을 우측에 분리"
                        description="PC에서는 버튼이 가로로 흩어지기보다 목적별로 묶여야 판단이 빠릅니다."
                        eyebrowClassName="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400"
                        titleClassName="mt-2 text-lg font-black text-white"
                        descriptionClassName="mt-1 text-[12px] font-semibold text-slate-400"
                        bodyClassName="mt-4 space-y-3"
                    >
                            <SectionPanelCard
                                variant="roseDarkSoft"
                                title={`${BRAND_STATUS_LABELS.attention} 대응`}
                                titleClassName="text-[10px] font-black uppercase tracking-widest text-rose-300"
                                bodyClassName="mt-3 grid grid-cols-1 gap-2.5"
                            >
                        {/* Retry Button */}
                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleRetryFailed}
                                disabled={!ocrExecutionKeyStatus.ready}
                                className={`w-full px-5 py-3 rounded-2xl font-black text-sm shadow-xl transition-all border flex items-center justify-center gap-2 group ${ocrExecutionKeyStatus.ready ? 'bg-rose-600 hover:bg-rose-700 border-rose-500' : 'bg-slate-700 border-slate-600 text-slate-300 cursor-not-allowed'}`}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                {BRAND_STATUS_LABELS.attentionPending} 건 {BRAND_ACTION_LABELS.smartReanalyze} ({failedRecords.length})
                            </button>
                        )}
                        
{/* Force Reanalyze Button */}
                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleForceReanalyze}
                                disabled={!ocrExecutionKeyStatus.ready}
                                className={`w-full px-5 py-3 rounded-2xl font-black text-sm shadow-xl transition-all border flex items-center justify-center gap-2 group ${ocrExecutionKeyStatus.ready ? 'bg-red-700 hover:bg-red-800 border-red-600' : 'bg-slate-700 border-slate-600 text-slate-300 cursor-not-allowed'}`}
                                title={`사전 점검 없이 모든 ${BRAND_STATUS_LABELS.attentionPending} 건을 직접 다시 분석합니다`}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                {BRAND_ACTION_LABELS.directReanalyze} (검증 스킵)
                            </button>
                        )}

                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button
                                onClick={handleAdminNormalizeFailedBatch}
                                className="w-full px-5 py-3 bg-amber-600 hover:bg-amber-700 rounded-2xl font-black text-sm shadow-xl transition-all border border-amber-500 flex items-center justify-center gap-2 group"
                                title={`${BRAND_ACTION_LABELS.recheck}이 어려운 ${BRAND_STATUS_LABELS.attentionPending} 건을 관리자 검토 기준으로 일괄 정상분류합니다`}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                관리자 일괄 정상분류 ({failedRecords.length})
                            </button>
                        )}
                            </SectionPanelCard>

                            {isCompactMobile && (
                                <button
                                    type="button"
                                    onClick={() => setShowMobileUtilityPanel((prev) => !prev)}
                                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-[11px] font-black text-slate-100 hover:bg-white/20"
                                >
                                    {showMobileUtilityPanel ? '운영 · 백업 도구 접기' : '운영 · 백업 도구 펼치기'}
                                </button>
                            )}

                            {(!isCompactMobile || showMobileUtilityPanel) && (
                            <SectionPanelCard
                                variant="emeraldDarkSoft"
                                title="운영 · 백업"
                                titleClassName="text-[10px] font-black uppercase tracking-widest text-emerald-300"
                                bodyClassName="mt-3 grid grid-cols-1 gap-2.5"
                            >
                        <div className={`w-full px-3 py-2 rounded-xl border text-[11px] font-bold ${ocrExecutionKeyStatus.ready ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-200' : 'bg-rose-900/30 border-rose-500/30 text-rose-200'}`}>
                            문서 분석 연결: {ocrExecutionKeyStatus.sourceLabel} · {ocrExecutionKeyStatus.modeApiLabel}
                        </div>
                        
                        {recordsWithImages.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleBatchReanalyze}
                                title={recordsWithImagesBatchTargets.length < recordsWithImages.length ? `2차 완료 ${recordsWithImages.length - recordsWithImagesBatchTargets.length}건 자동 제외` : '이미지 보유 대상 전체 재분석'}
                                disabled={!ocrExecutionKeyStatus.ready}
                                className={`w-full px-5 py-3 rounded-2xl font-black text-sm shadow-xl transition-all border flex items-center justify-center gap-2 group ${ocrExecutionKeyStatus.ready ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-500' : 'bg-slate-700 border-slate-600 text-slate-300 cursor-not-allowed'}`}
                            >
                                <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2.5}/></svg>
                                전체 일괄 재분석 (OCR) {recordsWithImagesBatchTargets.length > 0 ? `${recordsWithImagesBatchTargets.length}건` : ''}
                            </button>
                        )}

                        {recordsWithImages.length > recordsWithImagesBatchTargets.length && !isAnalyzing && (
                            <p className="mt-1 text-[11px] font-bold text-emerald-200">
                                2차 재분석 완료(DONE) {recordsWithImages.length - recordsWithImagesBatchTargets.length}건은 자동 제외됩니다.
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowQuickUtilityActions((prev) => !prev)}
                            className="w-full px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl font-black text-xs transition-all"
                        >
                            {showQuickUtilityActions ? '보조 작업 접기' : '보조 작업 펼치기'}
                        </button>

                        {showQuickUtilityActions && (
                            <>
                                <button onClick={() => importInputRef.current?.click()} className="w-full px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl font-black text-sm transition-all">백업 파일 불러오기(JSON)</button>
                                <button onClick={() => { void handleCopyReanalysisSummary(); }} className="w-full px-5 py-3 bg-slate-700 hover:bg-slate-800 rounded-2xl font-black text-sm shadow-xl transition-all">재분석 요약 복사</button>
                                <button onClick={handleExportReanalysisSummary} className="w-full px-5 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-2xl font-black text-sm shadow-xl transition-all">재분석 요약 내보내기</button>
                                <button onClick={handleExportOcrVerificationPackage} className="w-full px-5 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-black text-sm shadow-xl transition-all">OCR 검증 패키지 저장</button>
                                <button onClick={() => { void handleExport(); }} className="w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-black text-sm shadow-xl transition-all">전체 백업 내보내기</button>
                                {exportFeedback && (
                                    <div className={`rounded-2xl border px-3 py-2 text-[11px] font-bold leading-relaxed ${getExportFeedbackClassName(exportFeedback.tone)}`}>
                                        <p className="font-black">{exportFeedback.message}</p>
                                        {exportFeedback.fileName && <p className="mt-1">파일명: {exportFeedback.fileName}</p>}
                                        {exportFeedback.detail && <p className="mt-1">{exportFeedback.detail}</p>}
                                    </div>
                                )}
                                <button onClick={onDeleteAll} className="w-full px-5 py-3 bg-rose-600 hover:bg-rose-700 rounded-2xl font-black text-sm shadow-xl transition-all">전체 삭제</button>
                            </>
                        )}
                            </SectionPanelCard>
                            )}
                    </SectionPanelCard>
                    ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">빠른분석 모드</p>
                        <h4 className="mt-2 text-sm font-black text-white">긴급 조치 패널은 상세검수에서만 펼칩니다.</h4>
                        <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-300">
                            모바일에서는 핵심 현황만 먼저 보여주고, 재분석·백업·관리자 일괄 처리 버튼은 상세검수에서 이어서 확인하도록 분리했습니다.
                        </p>
                        <button
                            type="button"
                            onClick={() => setMobileMode('detailed')}
                            className="mt-3 w-full rounded-2xl border border-indigo-400/40 bg-indigo-500/20 px-4 py-2.5 text-xs font-black text-indigo-100 hover:bg-indigo-500/30"
                        >
                            상세검수로 전환
                        </button>
                    </div>
                    )}
                </div>

                {/* Progress Bar with Cooldown Indicator */}
                {isAnalyzing && (
                    <div className="mt-8 pt-6 border-t border-white/10 animate-fade-in">
                        <div className="flex justify-between items-end mb-2">
                            <span className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${cooldownTime > 0 ? 'text-yellow-400' : 'text-indigo-400'}`}>
                                <span className={`w-2 h-2 rounded-full animate-pulse ${cooldownTime > 0 ? 'bg-yellow-400' : 'bg-indigo-400'}`}></span>
                                {progress}
                            </span>
                            <span className="text-sm font-black">{batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-white/10 h-4 rounded-full overflow-hidden mb-4 relative">
                            <div 
                                className={`h-full transition-all duration-300 ease-out ${cooldownTime > 0 ? 'bg-yellow-500' : 'bg-gradient-to-r from-indigo-500 to-emerald-400'}`}
                                style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                            ></div>
                            {cooldownTime > 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-black/50 uppercase tracking-widest">
                                    분석 요청 대기 중... {cooldownTime}초
                                </div>
                            )}
                        </div>
                        <div className="flex justify-center">
                            <button 
                                onClick={stopAnalysis} 
                                className="px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-sm shadow-xl transition-all flex items-center gap-2 animate-pulse"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                분석 즉시 중단 (STOP)
                            </button>
                        </div>
                        <p className="text-center text-xs text-slate-400 mt-2 font-medium">대량 분석 중입니다. 창을 닫지 마세요.</p>
                    </div>
                )}

                {isDevMode && retryDiagnostics && (
                    <div className="mt-6 pt-5 border-t border-white/10 animate-fade-in">
                        <SummaryMetricGrid
                            className="grid grid-cols-2 gap-3 lg:grid-cols-5"
                            cardClassName="rounded-2xl border p-3"
                            items={[
                                {
                                    key: 'retry-server-success',
                                    label: '서버 성공',
                                    value: retryDiagnostics.serverSuccess,
                                    tone: BRAND_TONE.darkEmeraldStrong,
                                    labelClassName: 'text-[10px] font-black uppercase tracking-widest text-emerald-300',
                                    valueClassName: 'mt-1 text-2xl font-black text-emerald-200',
                                },
                                {
                                    key: 'retry-fallback-success',
                                    label: '대체 성공',
                                    value: retryDiagnostics.clientFallbackSuccess,
                                    tone: BRAND_TONE.darkCyan,
                                    labelClassName: 'text-[10px] font-black uppercase tracking-widest text-cyan-300',
                                    valueClassName: 'mt-1 text-2xl font-black text-cyan-200',
                                },
                                {
                                    key: 'retry-preflight-fail',
                                    label: '사전 검증 실패',
                                    value: retryDiagnostics.preflightFail,
                                    tone: BRAND_TONE.darkAmberStrong,
                                    labelClassName: 'text-[10px] font-black uppercase tracking-widest text-amber-300',
                                    valueClassName: 'mt-1 text-2xl font-black text-amber-200',
                                },
                                {
                                    key: 'retry-processing-fail',
                                    label: 'OCR 처리 실패',
                                    value: retryDiagnostics.processingFail,
                                    tone: BRAND_TONE.darkRoseStrong,
                                    labelClassName: 'text-[10px] font-black uppercase tracking-widest text-rose-300',
                                    valueClassName: 'mt-1 text-2xl font-black text-rose-200',
                                },
                                {
                                    key: 'retry-server-route-fail',
                                    label: '서버 라우트 실패',
                                    value: retryDiagnostics.serverRouteFail,
                                    tone: BRAND_TONE.darkVioletStrong,
                                    labelClassName: 'text-[10px] font-black uppercase tracking-widest text-violet-300',
                                    valueClassName: 'mt-1 text-2xl font-black text-violet-200',
                                },
                            ]}
                        />
                        <p className="mt-3 text-[11px] font-bold text-slate-400">
                            마지막 재분석 집계 · 총 {retryDiagnostics.total}건 / 성공 {retryDiagnostics.success}건 / 실패 {retryDiagnostics.fail}건
                        </p>
                    </div>
                )}

                {importValidationSummary && (
                    <div className="mt-6 pt-5 border-t border-white/10 animate-fade-in">
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <h4 className="text-sm sm:text-base font-black text-indigo-300">백업 사전검증 및 합산 범위</h4>
                                <button
                                    onClick={() => {
                                        setImportValidationSummary('');
                                        setImportValidationDetails('');
                                    }}
                                    className="text-[11px] text-slate-300 hover:text-white font-bold"
                                >
                                    닫기
                                </button>
                            </div>
                            <p className="text-xs sm:text-sm text-emerald-300 font-bold mb-3">{importValidationSummary}</p>
                            <pre className="text-[11px] sm:text-xs leading-relaxed text-slate-200 bg-black/30 rounded-xl p-3 overflow-x-auto max-h-56 whitespace-pre-wrap">{importValidationDetails}</pre>
                        </div>
                    </div>
                )}
            </div>

            <div
                id="new-ocr-capture-section"
                ref={newOcrCaptureSectionRef}
                className="bg-white p-5 sm:p-10 rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative"
            >
                <div className="flex items-center justify-between gap-3 mb-6">
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900">신규 기록 분석</h3>
                    <button
                        type="button"
                        onClick={() => setIsNewOcrSectionCollapsed(prev => !prev)}
                        className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-black text-xs transition-all flex items-center gap-1.5"
                    >
                        {isNewOcrSectionCollapsed ? (
                            <>
                                펼치기
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                            </>
                        ) : (
                            <>
                                접기
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>
                            </>
                        )}
                    </button>
                </div>
                
                {!isNewOcrSectionCollapsed && (
                    <>
                <section className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-black text-indigo-950">문서 분석 방식</p>
                            <p className="mt-1 text-xs font-bold leading-5 text-indigo-700">현재 선택: {getOcrEngineLabel(ocrEngine)} · 신규 분석과 서버 재분석에 함께 적용됩니다.</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-indigo-700 shadow-sm">상황별 전환</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {([
                            ['auto', '자동 추천', '일반 문서는 빠르게, 복잡한 경우 정밀 모델로 자동 전환'],
                            ['gemini-fast', 'Gemini 빠른 분석', '선명한 사진과 대량 처리에 적합'],
                            ['gemini-precise', 'Gemini 정밀 분석', '흐린 글씨, 복잡한 표, 외국어 혼합 문서에 적합'],
                            ['openai-precise', 'OpenAI 정밀 분석', 'ChatGPT Plus와 별도인 개발자용 분석 연결 필요'],
                        ] as Array<[OcrEngineMode, string, string]>).map(([value, label, description]) => {
                            const unavailable = value === 'openai-precise';
                            const selected = ocrEngine === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => handleOcrEngineChange(value)}
                                    aria-pressed={selected}
                                    className={`min-h-24 rounded-xl border p-3 text-left transition-colors ${
                                        selected
                                            ? 'border-indigo-600 bg-indigo-600 text-white'
                                            : unavailable
                                                ? 'border-slate-200 bg-slate-100 text-slate-500'
                                                : 'border-indigo-100 bg-white text-slate-800 hover:border-indigo-400'
                                    }`}
                                >
                                    <span className="block text-sm font-black">{label}</span>
                                    <span className={`mt-1 block text-[11px] font-bold leading-5 ${selected ? 'text-indigo-100' : 'text-slate-500'}`}>{description}</span>
                                    {unavailable && <span className="mt-2 inline-block rounded bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-600">현재 연결 안 됨</span>}
                                </button>
                            );
                        })}
                    </div>
                </section>
                <FileUpload onFilesChange={setFiles} onAnalyze={() => {}} isAnalyzing={isAnalyzing} fileCount={files.length} />
                {files.length > 0 && !isAnalyzing && (
                    <div className="mt-8 flex justify-center">
                        <button onClick={handleAnalyze} className="w-full max-w-md py-4 sm:py-5 bg-indigo-600 text-white text-xl sm:text-2xl font-black rounded-2xl shadow-2xl hover:bg-indigo-700 transition-all animate-pulse-gold">신규 분석 시작</button>
                    </div>
                )}
                    </>
                )}
            </div>

            {!isImmediateOperationalMode && (
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 sm:p-6">
                <CollapsibleSection
                    title="기록 양식·공종/팀 배정 관리"
                    summary={<span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-black text-slate-700 dark:text-slate-200">양식 {masterTemplates.length} · 그룹 {masterGroups.length} · 배정 {masterAssignments.length}</span>}
                >
                    <div className="space-y-5">
                        <div className="flex flex-col gap-1">
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-300">기록 양식을 만들고, 공종/팀별로 사용할 양식을 쉽게 지정할 수 있습니다.</p>
                        </div>

                        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-black text-slate-900 dark:text-white">양식 정보 확인</p>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-300">
                                    {hasMasterDataFetched
                                        ? `최근 불러온 시각 ${masterDataLoadedAt}`
                                        : '현재 양식 정보를 아직 불러오지 않았습니다. 필요 시 새로고침을 눌러 확인해 주세요.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { void loadMasterData(); }}
                                disabled={isMasterDataLoading}
                                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:bg-slate-600 dark:disabled:text-slate-200"
                            >
                                {isMasterDataLoading ? '불러오는 중…' : '마스터 데이터 새로고침'}
                            </button>
                        </div>

                        <CollapsibleSection
                            title="기록 양식 관리"
                            isOpen={openMasterSection === 'templates'}
                            onToggle={() => setOpenMasterSection((prev) => prev === 'templates' ? null : 'templates')}
                            summary={<span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-700">총 {masterTemplates.length}개</span>}
                        >
                            <MasterTemplateList
                                templates={masterTemplates}
                                selectedTemplateId={selectedMasterTemplateId}
                                onSelectTemplate={setSelectedMasterTemplateId}
                                onCreateTemplate={handleCreateMasterTemplate}
                                onDeleteTemplate={handleDeleteMasterTemplate}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title="공종·팀별 기록 양식 배정"
                            isOpen={openMasterSection === 'assignments'}
                            onToggle={() => setOpenMasterSection((prev) => prev === 'assignments' ? null : 'assignments')}
                            summary={<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">그룹 {masterGroups.length} · 배정 {masterAssignments.length}</span>}
                        >
                            <MasterAssignment
                                groups={masterGroups}
                                templates={masterTemplates}
                                assignments={masterAssignments}
                                onAddGroup={handleAddMasterGroup}
                                onDeleteGroup={handleDeleteMasterGroup}
                                onCreateAssignment={handleCreateMasterAssignment}
                                onDeleteAssignment={handleDeleteMasterAssignment}
                                onSetAssignmentStatus={handleSetMasterAssignmentStatus}
                            />
                        </CollapsibleSection>
                    </div>
                </CollapsibleSection>
            </div>
            )}

            {primaryFailedRecord && primaryFailedErrorType && (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 sm:p-6 shadow-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <p className="text-xs font-black text-rose-600 tracking-widest">문서 판독 오류 자동 분류</p>
                            <h4 className="text-lg sm:text-xl font-black text-rose-800 mt-1">{primaryFailedRecord.name || '미상'} · {getOcrErrorTypeKoreanLabel(primaryFailedErrorType)}</h4>
                            <p className="text-sm font-bold text-rose-700 mt-2">{getOcrErrorGuideMessage(primaryFailedErrorType)}</p>
                            {primaryFailedPreflightReason && (
                                <p className="text-xs font-black text-rose-900 mt-2">사전검증 실패 사유: {primaryFailedPreflightReason}</p>
                            )}
                        </div>
                        <button
                            onClick={handleRetryCapture}
                            className="w-full sm:w-auto px-6 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-base shadow-xl transition-all"
                        >
                            🔄 다시 촬영하기
                        </button>
                    </div>
                </div>
            )}

            {failedRecords.length > 0 && (
                <div className="bg-white dark:bg-slate-800 border border-rose-100 dark:border-rose-900/40 rounded-3xl shadow-lg no-print">
                    <CollapsibleSection
                        title="⚠️ 우선 조치 대상 (OCR 분석 실패 및 저품질 신호)"
                        defaultOpen={false}
                        summary={<span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-black text-rose-700">{BRAND_STATUS_LABELS.attentionPending} {failedRecords.length}건</span>}
                    >
                        <div className="space-y-4 pt-2">
                            
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                            <p className="text-xs font-black text-rose-600 uppercase tracking-widest">{BRAND_STATUS_LABELS.attention} 레코드 해석 뷰</p>
                            <h4 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-1">우선 보호 조치가 필요한 OCR 신호</h4>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-300 mt-2">상위 {failedPreviewRecords.length}건을 상태·근거·다음 행동 순서로 정리해, 무엇부터 다시 읽고 무엇을 관리자 판단으로 넘길지 바로 결정할 수 있게 했습니다.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {failedTypeSummary.map(([label, count]) => (
                                <span key={label} className="px-3 py-2 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] sm:text-xs font-black">
                                    {label} {count}건
                                </span>
                            ))}
                        </div>
                    </div>

                    <InterpretationCardGrid items={failedQuickDecisionCards} className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3" />

                    <StatusEvidenceActionPanel
                        className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3"
                        cardClassName="rounded-2xl border px-4 py-4"
                        items={[
                            {
                                key: 'failed-harness-status',
                                eyebrow: isDevMode ? '이행 검증 상태' : 'OCR 처리 상태',
                                title: `${failedHarnessSummary.pendingApprovalCount}건이 관리자 판단 또는 승인 대기입니다`,
                                description: isDevMode
                                    ? `실패 건 중 ${failedHarnessSummary.manualReviewCount}건은 수동 검토 흐름으로 묶여 있으며, ${failedHarnessSummary.immediateAttentionCount}건은 즉시 확인 우선 대상입니다. 저장 연결 ${failedHarnessSummary.connectedCount}건 · 저장 보완 ${failedHarnessSummary.fallbackCount}건 · 대기 ${failedHarnessSummary.pendingPersistenceCount}건입니다.`
                                    : `실패 건 중 ${failedHarnessSummary.manualReviewCount}건은 수동 확인이 필요하며, ${failedHarnessSummary.immediateAttentionCount}건은 즉시 조치가 우선입니다.`,
                                tone: BRAND_TONE.slateWhite,
                            },
                            {
                                key: 'failed-harness-evidence',
                                eyebrow: '판단 근거',
                                title: 'OCR 실패와 저품질 입력은 자동 확정이 아니라 상태 잠금 대상으로 읽어야 합니다',
                                description: '이행 검증 상태는 단순 오류 표식이 아니라, 어떤 건을 다시 읽고 어떤 건을 현장 소장 승인 대기로 넘길지 운영 순서를 알려주는 통제 신호입니다.',
                                tone: BRAND_TONE.amberSoft,
                            },
                            {
                                key: 'failed-harness-action',
                                eyebrow: '다음 행동',
                                title: '자동 재분석 → 수동 정상분류 → 승인/반려 기록 순으로 이어서 정리하세요',
                                description: '남은 실패 건을 줄인 뒤에도 보완이 필요한 레코드는 승인 사유와 감사 이력을 남겨야 현장 책임 흐름이 끊기지 않습니다.',
                                tone: BRAND_TONE.emeraldSoft,
                            },
                        ]}
                    />

                    {failedTypeGroups.length > 0 && !isAnalyzing && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {failedTypeGroups.map((group) => (
                                <div key={group.type} className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => runBatchAnalysis(group.records, `${group.label} 일괄 재분석`)}
                                        className="px-3 py-2.5 min-h-[42px] rounded-xl bg-rose-100 text-rose-700 text-[12px] sm:text-xs font-black hover:bg-rose-200 border border-rose-200"
                                    >
                                        {group.label} 재분석 {group.count}건
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAdminNormalizeFailedGroup(group.records, group.label)}
                                        className="px-3 py-2.5 min-h-[42px] rounded-xl bg-amber-100 text-amber-700 text-[12px] sm:text-xs font-black hover:bg-amber-200 border border-amber-200"
                                    >
                                        {group.label} 정상분류 {group.count}건
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div ref={failedQuickActionsRef} className="space-y-2">
                        <div className="flex justify-end">
                            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={autoScrollFailedQuickActions}
                                    onChange={(e) => setAutoScrollFailedQuickActions(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                상세 조치 열 때 해당 섹션으로 이동
                            </label>
                        </div>
                        <CollapsibleSection
                            title={`${BRAND_STATUS_LABELS.attention} 상세 조치`}
                            isOpen={showFailedQuickActions}
                            onToggle={handleToggleFailedQuickActions}
                            summary={<span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700">{BRAND_STATUS_LABELS.attention} {failedRecords.length}건 · 유형 {failedTypeGroups.length}개</span>}
                        >
                    {failureProcessingStats.length > 0 && (
                        <SectionPanelCard
                            className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3"
                            title={`${BRAND_STATUS_LABELS.attention} 유형별 처리 완료율`}
                            description="현재 잔여 + 처리 이력 기준"
                            titleClassName="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                            descriptionClassName="text-[10px] font-bold text-slate-500 dark:text-slate-400"
                            headerClassName="flex items-center justify-between gap-2"
                            bodyClassName="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2"
                        >
                                {failureProcessingStats.map((item) => (
                                    <div key={item.label} className="rounded-xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-black text-slate-900 dark:text-slate-100">{item.label}</p>
                                            <span className="text-[10px] font-black text-slate-600 dark:text-slate-300">완료율 {item.rate}%</span>
                                        </div>
                                        <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-emerald-400 to-indigo-500" style={{ width: `${item.rate}%` }}></div>
                                        </div>
                                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2 text-center">잔여<br/><span className="text-slate-900 dark:text-slate-100">{item.openCount}</span></div>
                                            <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">처리<br/><span className="text-emerald-700">{item.resolvedCount}</span></div>
                                            <div className="rounded-lg bg-indigo-50 px-2 py-2 text-center">총계<br/><span className="text-indigo-700">{item.total}</span></div>
                                        </div>
                                    </div>
                                ))}
                        </SectionPanelCard>
                    )}

                    {failedTypeGroups.length > 0 && (
                        <SectionPanelCard
                            className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                            title={`${BRAND_STATUS_LABELS.attention} 유형별 담당자 체크리스트`}
                            description="유형별 우선 점검 순서"
                            titleClassName="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                            descriptionClassName="text-[10px] font-bold text-slate-500 dark:text-slate-400"
                            headerClassName="flex items-center justify-between gap-2"
                            bodyClassName="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2"
                        >
                                {failedTypeGroups.map((group) => (
                                    <OperationalPreviewCard
                                        key={group.type}
                                        variant="slateSoft"
                                        title={group.label}
                                        badge={<span className="text-[10px] font-black text-slate-600">{group.count}건 잔여</span>}
                                        body={(
                                            <ul className="space-y-1.5 text-[11px] font-semibold text-slate-600">
                                                {getFailureChecklist(group.type).map((item, index) => (
                                                    <li key={`${group.type}-${index}`} className="flex items-start gap-2">
                                                        <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white">{index + 1}</span>
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        actions={(
                                            <>
                                                <ActionButton
                                                    variant="slate"
                                                    onClick={() => setRecordSortMode('error-type')}
                                                >
                                                    유형순 정렬
                                                </ActionButton>
                                                <ActionButton
                                                    variant="roseSoft"
                                                    onClick={() => runBatchAnalysis(group.records, `${group.label} 일괄 재분석`)}
                                                    className="border-0"
                                                >
                                                    재분석 실행
                                                </ActionButton>
                                            </>
                                        )}
                                        titleClassName="text-sm font-black text-slate-900"
                                        bodyClassName="mt-2"
                                        actionsClassName="mt-3 flex flex-wrap gap-2"
                                    />
                                ))}
                        </SectionPanelCard>
                    )}

                    {isDevMode && failedFailureCodeSummary.length > 0 && (
                        <SectionPanelCard
                            className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                            title="실패코드별 우선 조치"
                            description="최근 잔여 건 기준 상위 코드부터 대응"
                            titleClassName="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                            descriptionClassName="text-[10px] font-bold text-slate-500 dark:text-slate-400"
                            headerClassName="flex items-center justify-between gap-2"
                            bodyClassName="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2"
                        >
                            {failedFailureCodeSummary.slice(0, 4).map((item) => (
                                <OperationalPreviewCard
                                    key={`failure-code-action-${item.code}`}
                                    variant="slateSoft"
                                    title={`${item.code} · ${item.label}`}
                                    badge={<span className="text-[10px] font-black text-slate-600">{item.count}건 잔여</span>}
                                    body={(
                                        <p className="text-[11px] font-semibold leading-5 text-slate-600">
                                            {item.action}
                                        </p>
                                    )}
                                />
                            ))}
                        </SectionPanelCard>
                    )}

                    <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {failedPreviewRecords.map((record) => {
                            const errorType = getOcrErrorTypeFromRecord(record);
                            const guideMessage = getOcrErrorGuideMessage(errorType);
                            const preflightReason = getPreflightFailureReason(record);
                            const hasImage = hasRetryableOriginalImage(record.originalImage) || hasRetryableOriginalImage(record.profileImage);
                            const actionGuide = preflightReason
                                ? '사전확인 항목을 먼저 보완한 뒤 다시 읽기를 실행하세요.'
                                : hasImage
                                    ? '원문 다시 읽기를 먼저 시도하고, 남으면 상세 검증으로 넘기세요.'
                                    : '이미지 근거가 부족해 관리자 판단 또는 재촬영 안내가 우선입니다.';
                            const workflowState = inferHarnessWorkflowState(record);
                            const approvalState = inferHarnessApprovalState(record, workflowState);
                            const riskDecision = inferHarnessRiskDecision(record);
                            const persistenceState = getHarnessPersistenceState(record);

                            return (
                                <OperationalPreviewCard
                                    key={record.id}
                                    variant="roseSoft"
                                    title={record.name || '이름 없음'}
                                    subtitle={`${record.jobField || '공종 미지정'} · 팀장 ${record.teamLeader || '미지정'}`}
                                    badge={(
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <StatusBadge variant="rose" className="shrink-0 px-2 py-1">{getOcrErrorTypeKoreanLabel(errorType)}</StatusBadge>
                                            {isDevMode && <StatusBadge variant={getHarnessWorkflowBadgeVariant(workflowState)} className="shrink-0 px-2 py-1">{getHarnessWorkflowStateLabel(workflowState)}</StatusBadge>}
                                            <StatusBadge variant={getHarnessRiskBadgeVariant(riskDecision)} className="shrink-0 px-2 py-1">{getHarnessRiskDecisionLabel(riskDecision)}</StatusBadge>
                                            {isDevMode && <StatusBadge variant={getHarnessApprovalBadgeVariant(approvalState)} className="shrink-0 px-2 py-1">{getHarnessApprovalStateLabel(approvalState)}</StatusBadge>}
                                            {isDevMode && <StatusBadge variant={getHarnessPersistenceBadgeVariant(persistenceState)} className="shrink-0 px-2 py-1">{getHarnessPersistenceLabel(persistenceState)}</StatusBadge>}
                                        </div>
                                    )}
                                    body={(
                                        <StatusEvidenceActionPanel
                                            className="grid grid-cols-1 gap-2"
                                            cardClassName="rounded-xl border px-3 py-3"
                                            titleClassName="mt-1 text-[12px] font-black text-slate-900"
                                            descriptionClassName="mt-1 text-[11px] font-semibold leading-snug text-slate-600"
                                            items={[
                                                {
                                                    key: `${record.id}-status`,
                                                    eyebrow: '지금 상태',
                                                    title: `${getOcrErrorTypeKoreanLabel(errorType)} 신호가 남아 있습니다`,
                                                    description: guideMessage,
                                                    tone: BRAND_TONE.white,
                                                    eyebrowClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                                                },
                                                {
                                                    key: `${record.id}-evidence`,
                                                    eyebrow: '판단 근거',
                                                    title: preflightReason ? `사전검증: ${preflightReason}` : '사전검증 경고는 없지만 원문/배치/필기 품질을 다시 확인할 필요가 있습니다.',
                                                    tone: BRAND_TONE.amberSoft,
                                                    eyebrowClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-600',
                                                    description: isDevMode
                                                        ? `${getHarnessWorkflowStateLabel(workflowState)} · ${getHarnessApprovalStateLabel(approvalState)} · ${getHarnessPersistenceLabel(persistenceState)}`
                                                        : '관리자 확인이 필요한 상태로 분류되어 있습니다.',
                                                    content: isDevMode ? (
                                                        <div className="mt-2 space-y-2">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                <StatusBadge variant={getHarnessWorkflowBadgeVariant(workflowState)}>{getHarnessWorkflowStateLabel(workflowState)}</StatusBadge>
                                                                <StatusBadge variant={getHarnessApprovalBadgeVariant(approvalState)}>{getHarnessApprovalStateLabel(approvalState)}</StatusBadge>
                                                                <StatusBadge variant={getHarnessPersistenceBadgeVariant(persistenceState)}>{getHarnessPersistenceLabel(persistenceState)}</StatusBadge>
                                                            </div>
                                                            {record.harnessPersistenceWarning && (
                                                                <p className="text-[11px] font-semibold leading-snug text-amber-700">
                                                                    저장 경고: {record.harnessPersistenceWarning}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : undefined,
                                                },
                                                {
                                                    key: `${record.id}-action`,
                                                    eyebrow: '다음 행동',
                                                    title: actionGuide,
                                                    tone: BRAND_TONE.emeraldSoft,
                                                    eyebrowClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600',
                                                    description: `${getHarnessRiskDecisionLabel(riskDecision)} 기준으로 재분석 또는 관리자 정상분류를 선택하세요.`,
                                                },
                                            ]}
                                        />
                                    )}
                                    actions={(
                                        <>
                                            <ActionButton
                                                variant="slate"
                                                onClick={() => onViewDetails(record)}
                                                className="text-indigo-600 hover:bg-indigo-50"
                                            >
                                                상세 판단 열기
                                            </ActionButton>
                                            {hasImage && !isAnalyzing && (
                                                <ActionButton
                                                    variant="roseSoft"
                                                    onClick={() => runBatchAnalysis([record], '개별 재분석')}
                                                    className={`border ${retryActionButtonClass}`}
                                                >
                                                    원문 다시 읽기
                                                </ActionButton>
                                            )}
                                            {!isAnalyzing && (
                                                <ActionButton
                                                    variant="amberSoft"
                                                    onClick={() => handleAdminNormalizeFailedRecord(record)}
                                                    className="border-0"
                                                >
                                                    관리자 판단으로 유지
                                                </ActionButton>
                                            )}
                                        </>
                                    )}
                                    titleClassName="text-sm font-black text-slate-900 truncate"
                                    subtitleClassName="mt-1 text-[11px] font-bold text-slate-500 truncate"
                                    bodyClassName="mt-3"
                                    actionsClassName="mt-3 flex flex-wrap gap-2"
                                />
                            );
                        })}
                    </div>
                        </CollapsibleSection>
                    </div>
                
                        </div>
                    </CollapsibleSection>
                </div>
            )}

            {existingRecords.length >= 0 && (
                <div id="psi-evidence-readiness-summary" ref={evidenceReadinessSectionRef}>
                <SectionPanelCard
                    variant="indigoGradientSoft"
                    className="mb-4"
                    eyebrow="공개용 실증 증빙"
                    title="실증 증빙 준비도"
                    description="현재 브라우저에 누적된 기록이 기술자료·공모전 증빙으로 전환될 수 있는 상태인지 비식별 집계로 확인합니다."
                    headerClassName="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                    titleClassName="mt-1 text-lg font-black text-slate-900"
                    descriptionClassName="mt-1 text-xs font-bold leading-relaxed text-slate-600"
                    headerAction={(
                        <div className="flex flex-wrap gap-2 text-[11px] font-black">
                            <span className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-indigo-700">
                                동일인 기준: 공종+한글이름+국적
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
                                개인명·서명·원본은 공개 제외
                            </span>
                            {existingRecords.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleExportEvidenceSnapshot}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-100"
                                >
                                    검증용 비식별 요약 저장
                                </button>
                            )}
                            {ocrAnalyzedRecords.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleExportOcrVerificationPackage}
                                    className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700 hover:bg-cyan-100"
                                >
                                    OCR 검증 패키지 저장
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => importInputRef.current?.click()}
                                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1"
                            >
                                📤 전체 백업 불러오기 (JSON)
                            </button>
                        </div>
                    )}
                >
                    {exportFeedback && (
                        <div className={`mb-4 rounded-2xl border px-4 py-3 text-xs font-bold leading-relaxed ${getExportFeedbackClassName(exportFeedback.tone)}`}>
                            <p className="font-black">{exportFeedback.message}</p>
                            {exportFeedback.fileName && (
                                <p className="mt-1">파일명: {exportFeedback.fileName}</p>
                            )}
                            {exportFeedback.detail && (
                                <p className="mt-1">{exportFeedback.detail}</p>
                            )}
                        </div>
                    )}
                    {existingRecords.length === 0 ? (
                        <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 text-center">
                            <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <h3 className="mt-2 text-sm font-black text-slate-900">현장 데이터가 비어 있습니다</h3>
                            <p className="mt-1 text-xs font-bold text-slate-500">전체 백업(JSON)을 불러오거나 OCR 분석을 진행하면 실증 증빙 준비도가 활성화됩니다. 검증용 비식별 요약은 공개 설명용이며 복원용 전체 백업을 대체하지 않습니다.</p>
                            <button
                                type="button"
                                onClick={() => importInputRef.current?.click()}
                                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-black text-white shadow-md transition-all"
                            >
                                📤 전체 백업 불러오기 (JSON)
                            </button>
                        </div>
                    ) : (
                        <>
                            <SummaryMetricGrid
                                className="grid grid-cols-2 gap-2 lg:grid-cols-4"
                                cardClassName="rounded-2xl border px-3 py-3"
                                items={[
                                    {
                                        key: 'evidence-total',
                                        label: '전체 분석 기록',
                                        value: `${evidenceReadinessSummary.totalRecords}건`,
                                        helper: `근로자 관리 단위 ${evidenceReadinessSummary.workerGroups}명`,
                                        tone: BRAND_TONE.white,
                                        valueClassName: 'mt-1 text-xl font-black text-slate-900',
                                    },
                                    {
                                        key: 'evidence-repeat',
                                        label: '다월 추적 가능',
                                        value: `${evidenceReadinessSummary.multiMonthWorkerGroups}명`,
                                        helper: `반복 기록 ${evidenceReadinessSummary.repeatedWorkerGroups}명 · 최대 ${evidenceReadinessSummary.maxMonthsPerWorker}개월`,
                                        tone: BRAND_TONE.emeraldSoft,
                                        valueClassName: 'mt-1 text-xl font-black text-emerald-700',
                                    },
                                    {
                                        key: 'evidence-trend',
                                        label: '변화 추적',
                                        value: `개선 ${evidenceReadinessSummary.improvingWorkerGroups}명`,
                                        helper: `하락 ${evidenceReadinessSummary.decliningWorkerGroups}명 · 안정 ${evidenceReadinessSummary.stableWorkerGroups}명`,
                                        tone: BRAND_TONE.skySoft,
                                        valueClassName: 'mt-1 text-xl font-black text-sky-700',
                                    },
                                    {
                                        key: 'evidence-low-score',
                                        label: '보호 우선 대상',
                                        value: `${evidenceReadinessSummary.lowScoreRecords}건`,
                                        helper: '60점 미만 기록 기준',
                                        tone: evidenceReadinessSummary.lowScoreRecords > 0 ? BRAND_TONE.amberSoft : BRAND_TONE.slate,
                                        valueClassName: `mt-1 text-xl font-black ${evidenceReadinessSummary.lowScoreRecords > 0 ? 'text-amber-700' : 'text-slate-700'}`,
                                    },
                                ]}
                            />
                            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                                {[
                                    ['원본 대조', evidenceReadinessSummary.imageCoverageRate],
                                    ['수기답변 구조화', evidenceReadinessSummary.handwrittenCoverageRate],
                                    ['AI 해석', evidenceReadinessSummary.aiInsightCoverageRate],
                                    ['모국어 환류', evidenceReadinessSummary.nativeGuidanceCoverageRate],
                                ].map(([label, value]) => (
                                    <div key={String(label)} className="rounded-2xl border border-white dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-3 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
                                            <p className="text-sm font-black text-indigo-700 dark:text-indigo-400">{value}%</p>
                                        </div>
                                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div
                                                className="h-full rounded-full bg-indigo-500"
                                                style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {(evidenceReadinessSummary.futureDateRecords > 0 || evidenceReadinessSummary.invalidDateRecords > 0) && (
                                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
                                    날짜 보정 필요: 미래일자 {evidenceReadinessSummary.futureDateRecords}건 · 날짜 해석 실패 {evidenceReadinessSummary.invalidDateRecords}건.
                                    공모전 제출 전에는 월별 집계에서 제외하거나 관리자 확인 후 수정하는 것이 안전합니다.
                                </div>
                            )}
                        </>
                    )}
                </SectionPanelCard>
                </div>
            )}

            <section
                data-ocr-record-view="scope-month-filter"
                className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5"
                aria-label="OCR 기록 보기 범위와 월별 분류"
            >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">OCR 기록 보기</p>
                        <h3 className="mt-1 text-lg font-black text-slate-900">분석 기록만 따로 보고, 월별로 끊어 봅니다.</h3>
                        <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                            현재 {recordScopeFilter === 'ocr-only' ? `OCR 분석 기록 ${ocrAnalyzedRecords.length}건` : `전체 기록 ${existingRecords.length}건`} 중 {selectedMonthLabel} 기준 {filteredRecords.length}건을 표시합니다.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-black sm:min-w-[520px] sm:grid-cols-4">
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2">
                            <p className="text-indigo-500">OCR 기록</p>
                            <p className="mt-1 text-lg text-indigo-800">{ocrAnalyzedRecords.length}건</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-slate-500">전체 기록</p>
                            <p className="mt-1 text-lg text-slate-900">{existingRecords.length}건</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                            <p className="text-emerald-600">화면 표시</p>
                            <p className="mt-1 text-lg text-emerald-800">{visibleRecordListRecords.length}/{recordListRecords.length}</p>
                        </div>
                        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2" data-ocr-record-view="month-index">
                            <p className="text-violet-600">{monthlyWorkingSetLabel}</p>
                            <p className="mt-1 text-lg text-violet-800">{sourceRecordMonthIndex.buckets.length}개월</p>
                        </div>
                    </div>
                </div>

                <div
                    className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-black text-slate-600 sm:grid-cols-4"
                    data-ocr-record-view="monthly-working-set"
                >
                    <div>
                        <p className="text-slate-400">현재 작업세트</p>
                        <p className="mt-1 text-sm text-slate-900">{activeMonthStats.count}건</p>
                    </div>
                    <div>
                        <p className="text-slate-400">확인 필요</p>
                        <p className={`mt-1 text-sm ${activeMonthStats.failedCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{activeMonthStats.failedCount}건</p>
                    </div>
                    <div>
                        <p className="text-slate-400">평균 점수</p>
                        <p className="mt-1 text-sm text-slate-900">{activeMonthStats.averageScore === null ? '-' : `${activeMonthStats.averageScore}점`}</p>
                    </div>
                    <div>
                        <p className="text-slate-400">이미지 보유</p>
                        <p className="mt-1 text-sm text-slate-900">{activeMonthStats.imageReadyCount}건</p>
                    </div>
                    {sourceRecordMonthIndex.largeDataset && (
                        <div className="col-span-2 flex flex-col gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-indigo-700 sm:col-span-4 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                대량 기록 모드입니다. 최신 월부터 작업세트로 열어 스크롤과 렌더링 부담을 줄입니다.
                                {isSearchDeferred ? ' 검색 결과를 가볍게 반영 중입니다.' : ''}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setRecordMonthFilter(recordMonthFilter === 'all' ? sourceRecordMonthIndex.latestMonthKey : 'all');
                                    setFocusedWorkerGroupKey(null);
                                    setSelectedIds([]);
                                    setShowAllWorkerAccumulations(false);
                                }}
                                className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700 hover:bg-indigo-100"
                            >
                                {recordMonthFilter === 'all' ? '최신월 작업세트로' : '전체 월 수동 보기'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="grid grid-cols-2 gap-2">
                        {([
                            ['ocr-only', 'OCR 분석만', `${ocrAnalyzedRecords.length}건`],
                            ['all', '전체 기록', `${existingRecords.length}건`],
                        ] as Array<[OcrRecordScopeFilter, string, string]>).map(([value, label, count]) => (
                            <button
                                key={value}
                                type="button"
                                data-ocr-record-view={`scope-${value}`}
                                onClick={() => {
                                    setRecordScopeFilter(value);
                                    setRecordMonthFilter('all');
                                    setFocusedWorkerGroupKey(null);
                                    setSelectedIds([]);
                                    setShowAllWorkerAccumulations(false);
                                }}
                                aria-pressed={recordScopeFilter === value}
                                className={`min-h-[54px] rounded-2xl border px-3 py-3 text-left transition-colors ${
                                    recordScopeFilter === value
                                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
                                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                <span className="block text-sm font-black">{label}</span>
                                <span className={`mt-1 block text-[11px] font-black ${recordScopeFilter === value ? 'text-indigo-100' : 'text-slate-500'}`}>{count}</span>
                            </button>
                        ))}
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-black text-slate-500">월별 분류</p>
                            {recordMonthFilter !== 'all' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRecordMonthFilter('all');
                                        setFocusedWorkerGroupKey(null);
                                    }}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                                >
                                    전체 월로 보기
                                </button>
                            )}
                        </div>
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 custom-scrollbar" data-ocr-record-view="month-tabs">
                            {recordMonthOptions.map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    data-ocr-record-view={`month-${option.key}`}
                                    onClick={() => {
                                        setRecordMonthFilter(option.key);
                                        setFocusedWorkerGroupKey(null);
                                        setSelectedIds([]);
                                        setShowAllWorkerAccumulations(false);
                                    }}
                                    aria-pressed={recordMonthFilter === option.key}
                                    className={`shrink-0 rounded-2xl border px-3 py-2 text-left transition-colors ${
                                        recordMonthFilter === option.key
                                            ? 'border-slate-900 bg-slate-900 text-white'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="block text-[12px] font-black">{option.label}</span>
                                    <span className={`mt-0.5 block text-[10px] font-black ${recordMonthFilter === option.key ? 'text-slate-300' : 'text-slate-400'}`}>
                                        {option.count}건 · 확인 {option.failedCount}건
                                    </span>
                                    {option.averageScore !== null && (
                                        <span className={`mt-0.5 block text-[10px] font-black ${recordMonthFilter === option.key ? 'text-slate-300' : 'text-slate-400'}`}>
                                            평균 {option.averageScore}점 · 최근 {option.latestDateLabel}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {recordScopeFilter === 'ocr-only' && ocrAnalyzedRecords.length === 0 && existingRecords.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
                        OCR 흔적이 있는 기록을 찾지 못했습니다. 기존 수기 등록 기록까지 확인하려면 전체 기록 보기를 선택하세요.
                    </div>
                )}
            </section>

            {/* 공종/팀장 일괄 수정 UI */}
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden mb-4" data-ocr-collapse-delete="record-hub">
                <div className="border-b border-slate-100 bg-slate-950 px-4 py-4 text-white sm:px-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-200">기록 관리 접힘 보기</p>
                            <h3 className="mt-1 text-lg font-black">필요한 묶음만 펼쳐서 확인합니다</h3>
                            <p className="mt-1 text-xs font-bold leading-relaxed text-slate-300">
                                현재 조건 {recordListRecords.length}건 · 선택 {selectedRecords.length}건 · 근로자 묶음 {workerAccumulationGroups.length}명
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-[11px] font-black sm:grid-cols-3">
                            <button
                                type="button"
                                data-ocr-collapse-delete="toggle-controls"
                                onClick={() => setShowRecordControlPanel((prev) => !prev)}
                                className={`rounded-2xl border px-3 py-2 text-left transition-colors ${showRecordControlPanel ? 'border-indigo-300 bg-indigo-500 text-white' : 'border-white/10 bg-white/10 text-slate-100 hover:bg-white/15'}`}
                            >
                                <span className="block">검색·일괄관리</span>
                                <span className="mt-0.5 block text-[10px] opacity-80">{showRecordControlPanel ? '접기' : '펼치기'}</span>
                            </button>
                            <button
                                type="button"
                                data-ocr-collapse-delete="toggle-tracking"
                                onClick={() => setShowWorkerTrackingPanel((prev) => !prev)}
                                className={`rounded-2xl border px-3 py-2 text-left transition-colors ${showWorkerTrackingPanel ? 'border-emerald-300 bg-emerald-500 text-white' : 'border-white/10 bg-white/10 text-slate-100 hover:bg-white/15'}`}
                            >
                                <span className="block">근로자별 누적</span>
                                <span className="mt-0.5 block text-[10px] opacity-80">{workerAccumulationGroups.length}명 · {showWorkerTrackingPanel ? '접기' : '펼치기'}</span>
                            </button>
                            <button
                                type="button"
                                data-ocr-collapse-delete="toggle-record-list"
                                onClick={() => setShowRecordListPanel((prev) => !prev)}
                                className={`rounded-2xl border px-3 py-2 text-left transition-colors ${showRecordListPanel ? 'border-cyan-300 bg-cyan-500 text-white' : 'border-white/10 bg-white/10 text-slate-100 hover:bg-white/15'}`}
                            >
                                <span className="block">상세 기록 목록</span>
                                <span className="mt-0.5 block text-[10px] opacity-80">{visibleRecordListRecords.length}/{recordListRecords.length}건 · {showRecordListPanel ? '접기' : '펼치기'}</span>
                            </button>
                        </div>
                    </div>
                </div>
                {showRecordControlPanel && (
                <>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-stretch sm:items-center p-4 border-b border-slate-100">
                    <span className="font-bold text-slate-700 text-xs mr-2">근로자 일괄 선택</span>
                    <button
                        className="px-3 py-1 text-xs rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold hover:bg-indigo-100"
                        onClick={() => setSelectedIds(recordListRecords.map(r => r.id))}
                    >전체 선택</button>
                    <button
                        className="px-3 py-1 text-xs rounded bg-slate-50 text-slate-500 border border-slate-200 font-bold hover:bg-slate-100"
                        onClick={() => setSelectedIds([])}
                    >전체 해제</button>
                    <span className="px-2 py-1 text-[11px] rounded bg-slate-100 text-slate-700 font-black">선택 {selectedRecords.length}건</span>
                    <button
                        className="px-3 py-1 text-xs rounded bg-violet-50 text-violet-700 border border-violet-200 font-bold hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => { void handleSelectedReanalyze(); }}
                        disabled={isAnalyzing || selectedRecords.length === 0}
                        title={selectedRecords.length === 0 ? '선택된 근로자가 없습니다.' : '선택된 근로자만 재분석'}
                    >선택만 재분석</button>
                    <button
                        className="px-3 py-1 text-xs rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleDeleteSelectedRecords}
                        disabled={selectedRecords.length === 0}
                        title={selectedRecords.length === 0 ? '선택된 근로자가 없습니다.' : '선택된 근로자 삭제'}
                    >선택 삭제</button>
                    <span className="mx-3 text-slate-400 text-xs">|</span>
                    <label className="text-xs font-bold text-slate-600 mr-1">공종 일괄 변경</label>
                    <select
                        className="w-full sm:w-auto text-xs border border-slate-200 rounded px-2 py-1 mr-0 sm:mr-2"
                        value={batchJobField}
                        onChange={e => setBatchJobField(e.target.value)}
                    >
                        <option value="">선택</option>
                        {[...new Set(filteredRecords.map(r => r.jobField).filter(Boolean))].map(f => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                    <label className="text-xs font-bold text-slate-600 mr-1">팀장 일괄 지정</label>
                    <input
                        className="w-full sm:w-auto text-xs border border-slate-200 rounded px-2 py-1 mr-0 sm:mr-2"
                        value={batchTeamLeader}
                        onChange={e => setBatchTeamLeader(e.target.value)}
                        placeholder="팀장명 입력"
                    />
                    <button
                        className="w-full sm:w-auto px-4 py-2 text-xs rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                        onClick={() => {
                            if (selectedIds.length === 0) return alert('수정할 근로자를 선택하세요.');
                            if (!batchJobField && !batchTeamLeader) return alert('공종 또는 팀장 중 하나 이상 입력하세요.');
                            recordListRecords.forEach(r => {
                                if (selectedIds.includes(r.id)) {
                                    onUpdateRecord({
                                        ...r,
                                        ...(batchJobField ? { jobField: batchJobField } : {}),
                                        ...(batchTeamLeader ? { teamLeader: batchTeamLeader } : {}),
                                    });
                                }
                            });
                            alert('일괄 수정이 적용되었습니다.');
                        }}
                    >선택 근로자 일괄 적용</button>
                </div>
                <div className="px-4 sm:px-6 pt-4 pb-2 border-b border-slate-100 bg-white">
                    <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">근로자 정보 검색</p>
                        <div className="relative w-full max-w-2xl">
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                            <input type="text" placeholder="근로자명 · 공종 · 국적 · 팀장으로 검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-slate-900 dark:text-slate-100" />
                        </div>
                        <label className="mt-1 inline-flex items-center gap-2 text-[11px] font-bold text-slate-600">
                            <input
                                type="checkbox"
                                checked={showWorkerSignalDetails}
                                onChange={(e) => setShowWorkerSignalDetails(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            행별 신호 상세(상태·근거·다음 행동) 보기
                        </label>
                        <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-600">
                            <input
                                type="checkbox"
                                checked={showWorkerExtraActions}
                                onChange={(e) => setShowWorkerExtraActions(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            행별 보조 액션(관리자 유지/삭제/즉시조치) 보기
                        </label>
                    </div>
                </div>
                </>
                )}
                {workerAccumulationGroups.length > 0 && !showWorkerTrackingPanel && (
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-6" data-ocr-collapse-delete="tracking-summary-collapsed">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[12px] font-bold text-slate-600">
                                근로자별 누적 {workerAccumulationGroups.length}명은 접혀 있습니다. 확인 필요 {workerTrackingReviewSummary.reviewRequiredGroups}명, 후보 연결 {workerTrackingReviewSummary.candidateGroups}명입니다.
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowWorkerTrackingPanel(true)}
                                className="rounded-xl bg-emerald-600 px-4 py-2 text-[11px] font-black text-white hover:bg-emerald-700"
                            >
                                근로자별 누적 펼치기
                            </button>
                        </div>
                    </div>
                )}
                {workerAccumulationGroups.length > 0 && showWorkerTrackingPanel && (
                    <div
                        id="psi-worker-tracking-summary"
                        ref={workerTrackingSectionRef}
                        data-mobile-proof="tracking-summary"
                        className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70"
                    >
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-indigo-600">근로자별 누적 보기</p>
                                <h4 className="mt-1 text-lg font-black text-slate-900">
                                    현재 조건의 {filteredRecords.length}건을 {workerAccumulationGroups.length}명 기준으로 묶었습니다.
                                </h4>
                                <p className="mt-1 text-xs font-bold text-slate-500 leading-relaxed">
                                    같은 근로자의 여러 달 기록은 한 카드에 누적됩니다. 이름을 누르면 최신 기록을 열고, 월별 칩을 누르면 해당 월 기록을 바로 확인합니다.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] font-black text-slate-600">
                                <span className="rounded-full bg-white border border-slate-200 px-3 py-1">전체 기록 {filteredRecords.length}건</span>
                                <span className="rounded-full bg-white border border-slate-200 px-3 py-1">누적 근로자 {workerAccumulationGroups.length}명</span>
                                <span className="rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-emerald-700">자동 확정 {workerTrackingReviewSummary.exactGroups}명</span>
                                <span className="rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-amber-700">확인 후보 {workerTrackingReviewSummary.candidateGroups}명</span>
                                {workerTrackingReviewSummary.reviewRequiredGroups > 0 && (
                                    <span className="rounded-full bg-rose-50 border border-rose-100 px-3 py-1 text-rose-700">관리자 확인 {workerTrackingReviewSummary.reviewRequiredGroups}명</span>
                                )}
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] font-bold text-slate-500">
                                {showAllWorkerAccumulations
                                    ? '누적 근로자 전체를 표시합니다. 카드 영역 안에서 스크롤해 찾을 수 있습니다.'
                                    : '최근 기준 18명만 간략 표시 중입니다.'}
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowWorkerTrackingPanel(false)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                            >
                                근로자별 누적 접기
                            </button>
                            {workerAccumulationGroups.length > 18 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllWorkerAccumulations((prev) => !prev)}
                                    className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-black text-indigo-700 hover:bg-indigo-50"
                                >
                                    {showAllWorkerAccumulations ? '핵심 18명만 보기' : `전체 ${workerAccumulationGroups.length}명 보기`}
                                </button>
                            )}
                        </div>
                        <div className="mt-4 grid max-h-[720px] grid-cols-1 gap-3 overflow-y-auto pr-1 custom-scrollbar md:grid-cols-2 2xl:grid-cols-3">
                            {visibleWorkerAccumulationGroups.map((group) => {
                                const deltaTone = group.deltaScore === null
                                    ? 'text-slate-400'
                                    : group.deltaScore > 0
                                        ? 'text-emerald-600'
                                        : group.deltaScore < 0
                                            ? 'text-rose-600'
                                            : 'text-slate-500';
                                const deltaLabel = group.deltaScore === null
                                    ? '추적 시작'
                                    : `${group.deltaScore > 0 ? '+' : ''}${group.deltaScore}점`;
                                const latest = group.latestRecord;

                                return (
                                    <div key={group.key} className={`rounded-2xl border bg-white p-4 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md ${focusedWorkerGroupKey === group.key ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => onViewDetails(latest)}
                                                className="min-w-0 text-left"
                                            >
                                                <p className="truncate text-base font-black text-slate-900">{latest.name || '이름 미확인'}</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">
                                                    {latest.nationality || '국적 미확인'} · {group.dateRangeLabel}
                                                </p>
                                            </button>
                                            <div className="shrink-0 flex flex-col items-end gap-1">
                                                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">
                                                    {group.records.length}건
                                                </span>
                                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${group.trackingReviewRequired ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                    {group.trackingReviewRequired ? '확인 후보' : '자동 확정'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                                            <div className="rounded-xl bg-slate-50 px-2 py-2">
                                                <p className="text-[10px] font-black text-slate-400">월수</p>
                                                <p className="mt-0.5 text-sm font-black text-slate-900">{group.monthCount}</p>
                                            </div>
                                            <div className="rounded-xl bg-blue-50 px-2 py-2">
                                                <p className="text-[10px] font-black text-blue-500">평균</p>
                                                <p className="mt-0.5 text-sm font-black text-blue-700">{group.averageScore}</p>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 px-2 py-2">
                                                <p className="text-[10px] font-black text-slate-400">최신</p>
                                                <p className="mt-0.5 text-sm font-black text-slate-900">{group.latestScore}</p>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 px-2 py-2">
                                                <p className="text-[10px] font-black text-slate-400">변화</p>
                                                <p className={`mt-0.5 text-sm font-black ${deltaTone}`}>{deltaLabel}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black">
                                            {group.jobFields.slice(0, 2).map((field) => (
                                                <span key={`${group.key}-${field}`} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{field}</span>
                                            ))}
                                            {group.teamLeaders.slice(0, 2).map((leader) => (
                                                <span key={`${group.key}-${leader}`} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{leader}</span>
                                            ))}
                                            {group.trackingReviewRequired && (
                                                <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{group.trackingReviewReason}</span>
                                            )}
                                            {group.sameDateDuplicateCount > 1 && (
                                                <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">같은 날 {group.sameDateDuplicateCount}건</span>
                                            )}
                                            {group.failedCount > 0 && (
                                                <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">확인 필요 {group.failedCount}건</span>
                                            )}
                                            {group.finalizedCount > 0 && (
                                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">확정 {group.finalizedCount}건</span>
                                            )}
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {group.records.slice(0, 6).map((record) => (
                                                <button
                                                    key={record.id}
                                                    type="button"
                                                    onClick={() => onViewDetails(record)}
                                                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                                                    title={`${record.name || '근로자'} · ${record.date || '날짜 없음'} · ${record.safetyScore}점`}
                                                >
                                                    {formatWorkerGroupMonth(record)} · {record.safetyScore}점
                                                </button>
                                            ))}
                                            {group.records.length > 6 && (
                                                <span className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-500">
                                                    +{group.records.length - 6}건
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFocusedWorkerGroupKey(group.key);
                                                    setShowRecordListPanel(true);
                                                }}
                                                className="rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-black text-white hover:bg-indigo-700"
                                                title="아래 월별 기록 목록을 이 근로자 기록만 보이도록 좁힙니다."
                                            >
                                                이 근로자 월별 보기
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedIds(group.records.map((record) => record.id))}
                                                className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-black text-white hover:bg-black"
                                                title="이 근로자의 누적 기록 전체를 선택해 일괄 수정, 삭제, 재분석에 사용합니다."
                                            >
                                                기록 일괄 선택
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onOpenReport(latest)}
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                                                title="이 근로자의 가장 최근 기록으로 관리자 분석 리포트를 엽니다."
                                            >
                                                최신 관리자 리포트
                                            </button>
                                            <button
                                                type="button"
                                                data-ocr-collapse-delete="delete-worker-records"
                                                onClick={() => handleDeleteWorkerRecords(group.records, `${latest.name || '이름 미확인'} 근로자`)}
                                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 hover:bg-rose-100"
                                                title="이 근로자로 묶인 현재 기록 전체를 삭제합니다."
                                            >
                                                이 근로자 기록 삭제
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {focusedWorkerGroup && (
                    <div className="border-b border-indigo-100 bg-indigo-50/70 px-4 py-4 sm:px-6">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-indigo-600">선택 근로자 월별 보기</p>
                                <h4 className="mt-1 text-base font-black text-slate-900">
                                    {focusedWorkerGroup.latestRecord.name || '이름 미확인'} · {focusedWorkerGroup.latestRecord.jobField || '공종 미확인'} · {focusedWorkerGroup.latestRecord.nationality || '국적 미확인'}
                                </h4>
                                <p className="mt-1 text-xs font-bold text-slate-600">
                                    아래 목록은 이 근로자의 {recordListRecords.length}건만 표시합니다. 월별 흐름을 확인한 뒤 상세 판단으로 바로 들어가세요.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedIds(recordListRecords.map((record) => record.id))}
                                    className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-black text-white hover:bg-black"
                                    title="현재 보이는 이 근로자 월별 기록을 모두 선택합니다."
                                >
                                    현재 근로자 기록 일괄 선택
                                </button>
                                <button
                                    type="button"
                                    data-ocr-collapse-delete="delete-focused-worker"
                                    onClick={() => handleDeleteWorkerRecords(recordListRecords, `${focusedWorkerGroup.latestRecord.name || '이름 미확인'} 근로자`)}
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 hover:bg-rose-100"
                                >
                                    이 근로자 기록 삭제
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFocusedWorkerGroupKey(null)}
                                    className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 hover:bg-indigo-50"
                                >
                                    전체 근로자 목록으로 돌아가기
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {recordListRecords.map((record) => (
                                <button
                                    key={record.id}
                                    type="button"
                                    onClick={() => onViewDetails(record)}
                                    className="rounded-full border border-white bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700"
                                >
                                    {String(record.date || '').slice(0, 10) || '날짜 없음'} · {record.safetyScore}점
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {!focusedWorkerGroup && filteredRecords.length > 0 && (
                    <div className="border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
                        <p className="text-[12px] font-bold text-slate-500">
                            아래 월별 기록 목록은 전체 {filteredRecords.length}건을 표시합니다. 누적 카드에서 <span className="font-black text-indigo-700">이 근로자 월별 보기</span>를 누르면 한 근로자의 기록만 좁혀볼 수 있습니다.
                        </p>
                    </div>
                )}
                {!showRecordListPanel && (
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 text-center sm:px-6" data-ocr-collapse-delete="record-list-collapsed">
                        <p className="text-[12px] font-bold text-slate-600">
                            상세 기록 목록 {recordListRecords.length}건이 접혀 있습니다. 현재 화면 표시 대상은 {visibleRecordListRecords.length}건입니다.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowRecordListPanel(true)}
                            className="mt-3 rounded-2xl bg-cyan-600 px-5 py-2.5 text-xs font-black text-white hover:bg-cyan-700"
                        >
                            상세 기록 목록 펼치기
                        </button>
                    </div>
                )}
                {showRecordListPanel && (
                <>
                <div className="sm:hidden p-3 space-y-3">
                    {visibleRecordListRecords.map((r: WorkerRecord) => {
                        const checked = selectedIds.includes(r.id);
                        const failed = isFailedRecord(r);
                        const failureCode = failed ? resolveFailureCodeFromRecord(r) : 'UNKNOWN';
                        const immediateActions = failed ? getFailureImmediateActions(failureCode) : [];
                        const secondPassEligibility = getSecondPassEligibility(r, secondPassEditedOnly);
                        const latestCorrectionPreview = getLatestCorrectionPreview(r);
                        const latestCorrectionTimestampLabel = getLatestCorrectionTimestampLabel(r);
                        const recentlyCorrected = isRecentlyCorrected(r);
                        const weakCorrectionReason = hasWeakCorrectionReason(r);
                        const latestCorrectionReason = getLatestCorrectionReason(r);
                        const hasImage = hasRetryableOriginalImage(r.originalImage) || hasRetryableOriginalImage(r.profileImage);
                        const rowErrorType = failed ? getOcrErrorTypeFromRecord(r) : null;
                        const rowGuideMessage = rowErrorType ? getOcrErrorGuideMessage(rowErrorType) : '';
                        const rowGuideMobile = rowErrorType ? getOcrErrorMobileLabel(rowErrorType) : '';
                        const preflightReason = failed ? getPreflightFailureReason(r) : null;
                        const reviewTrustState = getReviewTrustState(r);
                        const rowStatusSummary = failed
                            ? getRecordFailureHeadline(r)
                            : reviewTrustState === 'PENDING'
                                ? '관리자 재검토가 남아 있는 상태입니다.'
                                : reviewTrustState === 'FINALIZED'
                                    ? '보호 판단이 확정된 상태입니다.'
                                    : '현재 기록은 기본 흐름 안에서 유지되고 있습니다.';
                        const rowEvidenceSummary = preflightReason
                            || latestCorrectionReason
                            || (typeof r.ocrConfidence === 'number' ? `OCR 신뢰도 ${(r.ocrConfidence * 100).toFixed(0)}% 기준으로 확인 중입니다.` : '최근 수정 및 OCR 근거를 함께 확인할 수 있습니다.');
                        const rowNextAction = failed
                            ? hasImage
                                ? '원문 다시 읽기를 먼저 시도하고, 남으면 상세 판단으로 넘기세요.'
                                : '이미지 근거가 부족해 재촬영 안내 또는 관리자 판단으로 유지가 우선입니다.'
                            : secondPassEligibility.eligible
                                ? '필요 시 2차 재평가로 해석 품질을 더 끌어올릴 수 있습니다.'
                                : '현재 조건에서는 유지 점검과 리포트 확인이 우선입니다.';

                        return (
                            <div key={r.id} className={`rounded-2xl border p-3 bg-white ${failed ? 'border-rose-200 bg-rose-50/40' : recentlyCorrected ? 'border-violet-200 bg-violet-50/30' : 'border-slate-200'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onViewDetails(r)}
                                        className="text-left flex-1"
                                    >
                                        <p className={`text-sm font-black ${failed ? 'text-rose-700' : 'text-slate-800'} flex items-center gap-1`}>
                                            {r.name}
                                            {getLeaderIcon(r)}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-slate-500 font-bold">{r.nationality} · {r.date}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-500 font-bold">{r.jobField} · 팀장 {r.teamLeader || '미지정'}</p>
                                        {latestCorrectionPreview && (
                                            <p className="mt-1 text-[10px] text-violet-700 font-black leading-snug" title={latestCorrectionReason || latestCorrectionPreview}>최근 수정: {latestCorrectionPreview}</p>
                                        )}
                                        {latestCorrectionReason && (
                                            <p className="mt-1 text-[10px] text-slate-600 font-semibold leading-snug whitespace-pre-wrap break-words">사유 전문: {latestCorrectionReason}</p>
                                        )}
                                        {latestCorrectionTimestampLabel && (
                                            <p className="mt-0.5 text-[10px] text-violet-500 font-bold">수정 시각: {latestCorrectionTimestampLabel}</p>
                                        )}
                                    </button>
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={e => {
                                            if (e.target.checked) setSelectedIds(ids => [...ids, r.id]);
                                            else setSelectedIds(ids => ids.filter(id => id !== r.id));
                                        }}
                                        className="w-4 h-4 mt-1 accent-indigo-600"
                                    />
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                    <span className={`px-2.5 py-1 rounded-full font-black ${getSafetyLevelClass(r.safetyLevel)}`}>{r.safetyScore}점 {getSafetyLevelDisplayLabel(r.safetyLevel)}</span>
                                    <span className={`px-2 py-1 rounded font-black ${hasImage ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{hasImage ? '이미지 OK' : '이미지 누락'}</span>
                                    {recentlyCorrected && <span className="px-2 py-1 rounded bg-violet-600 text-white font-black">최근 24h 수정</span>}
                                    {weakCorrectionReason && <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 font-black" title={latestCorrectionReason || '수정 사유가 비어 있거나 너무 짧습니다.'}>수정사유 보강 필요</span>}
                                    {getReviewTrustState(r) === 'PENDING' && <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 font-black">재검토 대기</span>}
                                    {getReviewTrustState(r) === 'FINALIZED' && <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-black">최종확정</span>}
                                    {!secondPassEligibility.eligible && !failed && secondPassEligibility.reason && (
                                        <span className="px-2 py-1 rounded bg-violet-100 text-violet-700 font-black">2차 제외 · {secondPassEligibility.reason}</span>
                                    )}
                                </div>

                                {failed && rowErrorType && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-[11px] font-black text-rose-700">⚠️ {getRecordFailureDisplayLabel(r)}</p>
                                        {rowGuideMessage && <p className="text-[11px] font-bold text-rose-600">{rowGuideMobile}</p>}
                                        {preflightReason && <p className="text-[11px] font-bold text-amber-700">사전검증: {preflightReason}</p>}
                                    </div>
                                )}

                                {showWorkerSignalDetails && (
                                    <StatusEvidenceActionPanel
                                        className="mt-3 grid grid-cols-1 gap-2 text-[11px]"
                                        cardClassName="rounded-xl border px-3 py-2"
                                        titleClassName="mt-1 font-semibold leading-snug text-slate-700"
                                        descriptionClassName="mt-1 font-semibold leading-snug whitespace-pre-wrap break-words text-slate-700"
                                        items={[
                                            {
                                                key: `${r.id}-row-status`,
                                                eyebrow: '지금 상태',
                                                title: rowStatusSummary,
                                                tone: BRAND_TONE.slate,
                                                eyebrowClassName: 'font-black text-slate-400 uppercase tracking-[0.18em]',
                                                description: undefined,
                                            },
                                            {
                                                key: `${r.id}-row-evidence`,
                                                eyebrow: '판단 근거',
                                                title: rowEvidenceSummary,
                                                tone: BRAND_TONE.amberSoft,
                                                eyebrowClassName: 'font-black text-amber-600 uppercase tracking-[0.18em]',
                                                description: undefined,
                                            },
                                            {
                                                key: `${r.id}-row-action`,
                                                eyebrow: '다음 행동',
                                                title: rowNextAction,
                                                tone: BRAND_TONE.emeraldSoft,
                                                eyebrowClassName: 'font-black text-emerald-600 uppercase tracking-[0.18em]',
                                                description: undefined,
                                            },
                                        ]}
                                    />
                                )}

                                <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">상세 판단 바로보기</p>
                                            <p className="mt-1 text-[12px] font-black leading-snug text-slate-900">{rowStatusSummary}</p>
                                            <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">{rowNextAction}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onViewDetails(r); }}
                                            className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-black text-white hover:bg-indigo-700"
                                        >
                                            열기
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); onViewDetails(r); }} className="px-3 py-2 bg-white border border-slate-200 text-indigo-600 font-black text-xs rounded-xl">상세 판단</button>
                                    <button onClick={(e) => { e.stopPropagation(); onOpenReport(r); }} className="px-3 py-2 bg-slate-900 text-white font-black text-xs rounded-xl">보호 리포트</button>
                                    <button
                                        type="button"
                                        data-ocr-collapse-delete="delete-single-record"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteSingleRecord(r); }}
                                        className="col-span-2 px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 font-black text-xs rounded-xl"
                                    >
                                        이 기록 삭제
                                    </button>
                                    {failed && !isAnalyzing && hasImage && (
                                        <button onClick={(e) => { e.stopPropagation(); runBatchAnalysis([r], '개별 재분석'); }} className={`col-span-2 px-3 py-2 font-bold text-xs rounded-xl border transition-all ${retryActionButtonClass}`}>원문 다시 읽기</button>
                                    )}
                                    {showWorkerExtraActions && (
                                        <>
                                            {failed && preflightReason && (
                                                <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">
                                                    재분석 사전진단: {preflightReason}
                                                </div>
                                            )}
                                            {failed && !isAnalyzing && (
                                                <button onClick={(e) => { e.stopPropagation(); handleAdminNormalizeFailedRecord(r); }} className="col-span-2 px-3 py-2 bg-amber-100 text-amber-700 font-bold text-xs rounded-xl" title={`${BRAND_STATUS_LABELS.attention} 안내가 필요한 건을 관리자 검토 후 정상 흐름으로 전환`}>관리자 판단으로 유지</button>
                                            )}
                                            {failed && immediateActions.length > 0 && (
                                                <div className="col-span-2 grid grid-cols-1 gap-2">
                                                    {immediateActions.map((action) => (
                                                        <button
                                                            key={`${r.id}-${action.type}`}
                                                            onClick={(e) => { e.stopPropagation(); void handleFailureImmediateAction(r, action.type); }}
                                                            className={`px-3 py-2 font-bold text-xs rounded-xl transition-all ${action.className}`}
                                                            title={action.title}
                                                        >
                                                            {action.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteSingleRecord(r); }} className="col-span-2 px-3 py-2 bg-slate-100 text-slate-500 font-bold text-xs rounded-xl">삭제</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="hidden sm:block overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="px-2 py-4 text-center w-12">선택</th>
                                <th className="px-4 sm:px-8 py-4">근로자 정보</th>
                                <th className="px-4 sm:px-8 py-4">공종/직군</th>
                                <th className="px-4 sm:px-8 py-4">팀장 (Leader)</th>
                                <th className="px-4 sm:px-8 py-4 text-center">응답품질</th>
                                <th className="px-4 sm:px-8 py-4 text-center">이미지 상태</th>
                                <th className="px-4 sm:px-8 py-4 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-medium">
                            {/* 선택 체크박스 컬럼 추가 */}
                            {visibleRecordListRecords.map((r: WorkerRecord) => {
                                const checked = selectedIds.includes(r.id);
                                const isManager = isManagementRole(r.jobField);
                                const hasImage = hasRetryableOriginalImage(r.originalImage) || hasRetryableOriginalImage(r.profileImage);
                                const failed = isFailedRecord(r);
                                const failureCode = failed ? resolveFailureCodeFromRecord(r) : 'UNKNOWN';
                                const immediateActions = failed ? getFailureImmediateActions(failureCode) : [];
                                const preflightReason = failed ? getPreflightFailureReason(r) : null;
                                const secondPassEligibility = getSecondPassEligibility(r, secondPassEditedOnly);
                                const latestCorrectionPreview = getLatestCorrectionPreview(r);
                                const latestCorrectionTimestampLabel = getLatestCorrectionTimestampLabel(r);
                                const recentlyCorrected = isRecentlyCorrected(r);
                                const weakCorrectionReason = hasWeakCorrectionReason(r);
                                const latestCorrectionReason = getLatestCorrectionReason(r);
                                const rowErrorType = failed ? getOcrErrorTypeFromRecord(r) : null;
                                const rowGuideMessage = rowErrorType ? getOcrErrorGuideMessage(rowErrorType) : '';
                                const rowGuideSummary = rowErrorType ? getOcrErrorGuideSummary(rowErrorType) : '';
                                const rowGuideMobile = rowErrorType ? getOcrErrorMobileLabel(rowErrorType) : '';
                                const reviewTrustState = getReviewTrustState(r);
                                const rowStatusSummary = failed
                                    ? getRecordFailureHeadline(r)
                                    : reviewTrustState === 'PENDING'
                                        ? '관리자 재검토가 남아 있는 상태입니다.'
                                        : reviewTrustState === 'FINALIZED'
                                            ? '보호 판단이 확정된 상태입니다.'
                                            : '현재 기록은 기본 흐름 안에서 유지되고 있습니다.';
                                const rowEvidenceSummary = preflightReason
                                    || latestCorrectionReason
                                    || (typeof r.ocrConfidence === 'number' ? `OCR 신뢰도 ${(r.ocrConfidence * 100).toFixed(0)}% 기준으로 확인 중입니다.` : '최근 수정 및 OCR 근거를 함께 확인할 수 있습니다.');
                                const rowNextAction = failed
                                    ? hasImage
                                        ? '원문 다시 읽기 후 남는 건을 상세 판단으로 넘기세요.'
                                        : '재촬영 안내 또는 관리자 판단으로 유지가 우선입니다.'
                                    : secondPassEligibility.eligible
                                        ? '필요 시 2차 재평가로 해석 품질을 더 끌어올릴 수 있습니다.'
                                        : '현재 조건에서는 유지 점검과 리포트 확인이 우선입니다.';
                                
                                return (
                                    <tr key={r.id} className={`hover:bg-indigo-50/30 transition-colors group ${isManager ? 'bg-slate-50/50 opacity-80' : ''} ${failed ? 'bg-rose-50/50' : recentlyCorrected ? 'bg-violet-50/40' : ''}`}>
                                        <td className="px-2 text-center align-middle">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={e => {
                                                    if (e.target.checked) setSelectedIds(ids => [...ids, r.id]);
                                                    else setSelectedIds(ids => ids.filter(id => id !== r.id));
                                                }}
                                                className="w-4 h-4 accent-indigo-600"
                                            />
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 font-black text-slate-800 cursor-pointer" onClick={() => onViewDetails(r)}>
                                            <div className="flex flex-col">
                                                <span className={`flex items-center gap-1 ${failed ? 'text-rose-600' : ''}`}>
                                                    {r.name}
                                                    {getLeaderIcon(r)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold tracking-wider">{r.nationality} | {r.date}</span>
                                                {typeof r.ocrConfidence === 'number' && (
                                                    <span className="text-[9px] text-slate-500 font-bold">OCR 신뢰도: {(r.ocrConfidence * 100).toFixed(0)}%</span>
                                                )}
                                                {latestCorrectionPreview && (
                                                    <span className="text-[10px] text-violet-700 font-black mt-1 leading-snug" title={latestCorrectionReason || latestCorrectionPreview}>
                                                        최근 수정: {latestCorrectionPreview}
                                                    </span>
                                                )}
                                                {latestCorrectionReason && (
                                                    <span className="text-[10px] text-slate-600 font-semibold mt-1 leading-snug whitespace-pre-wrap break-words">
                                                        사유 전문: {latestCorrectionReason}
                                                    </span>
                                                )}
                                                {latestCorrectionTimestampLabel && (
                                                    <span className="text-[10px] text-violet-500 font-bold mt-0.5 leading-snug">
                                                        수정 시각: {latestCorrectionTimestampLabel}
                                                    </span>
                                                )}
                                                {recentlyCorrected && (
                                                    <span className="mt-1 inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[9px] font-black bg-violet-600 text-white border border-violet-600">
                                                        최근 24h 수정
                                                    </span>
                                                )}
                                                {weakCorrectionReason && (
                                                    <span className="mt-1 inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200" title={latestCorrectionReason || '수정 사유가 비어 있거나 너무 짧습니다.'}>
                                                        수정사유 보강 필요
                                                    </span>
                                                )}
                                                {failed && <span className="text-[9px] text-rose-500 font-bold">⚠️ 추가 확인 안내</span>}
                                                {failed && rowErrorType && (
                                                    <span className="mt-1 inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                                                        {getRecordFailureDisplayLabel(r)}
                                                    </span>
                                                )}
                                                {failed && rowGuideMessage && (
                                                    <>
                                                        <span className="sm:hidden text-[10px] text-rose-700 font-black mt-1 leading-snug" title={rowGuideMessage}>
                                                            {rowGuideMobile}
                                                        </span>
                                                        <span className="hidden sm:block text-[10px] text-rose-700 font-bold mt-1 leading-snug" title={rowGuideMessage}>
                                                            {rowGuideSummary}
                                                        </span>
                                                    </>
                                                )}
                                                {!secondPassEligibility.eligible && !failed && secondPassEligibility.reason && (
                                                    <span className="mt-1 inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[9px] font-black bg-violet-100 text-violet-700 border border-violet-200">
                                                        2차 제외 · {secondPassEligibility.reason}
                                                    </span>
                                                )}
                                                {failed && preflightReason && (
                                                    <span className="text-[10px] text-amber-700 font-black mt-1 leading-snug">
                                                        사전검증: {preflightReason}
                                                    </span>
                                                )}
                                                {showWorkerSignalDetails && (
                                                    <StatusEvidenceActionPanel
                                                        className="mt-2 grid grid-cols-1 gap-1.5 text-[10px] font-semibold"
                                                        cardClassName="rounded-lg border px-2 py-2"
                                                        titleClassName="mt-0.5 block text-[10px] font-semibold leading-snug"
                                                        items={[
                                                            {
                                                                key: `${r.id}-row-status`,
                                                                eyebrow: '지금 상태',
                                                                title: rowStatusSummary,
                                                                tone: BRAND_TONE.slateText,
                                                                eyebrowClassName: 'text-[9px] font-black uppercase tracking-[0.16em] text-slate-400',
                                                            },
                                                            {
                                                                key: `${r.id}-row-evidence`,
                                                                eyebrow: '판단 근거',
                                                                title: <span className="whitespace-pre-wrap break-words">{rowEvidenceSummary}</span>,
                                                                tone: BRAND_TONE.amberSoftTextStrong,
                                                                eyebrowClassName: 'text-[9px] font-black uppercase tracking-[0.16em] text-amber-600',
                                                            },
                                                            {
                                                                key: `${r.id}-row-action`,
                                                                eyebrow: '다음 행동',
                                                                title: rowNextAction,
                                                                tone: BRAND_TONE.emeraldSoftTextStrong,
                                                                eyebrowClassName: 'text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600',
                                                            },
                                                        ]}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-slate-500 font-bold">{r.jobField}</td>
                                        <td className="px-4 sm:px-8 py-5 text-slate-600 font-bold text-sm">
                                            {r.teamLeader && r.teamLeader !== '미지정' ? (
                                                <span className={`bg-slate-100 px-2 py-1 rounded border border-slate-200 ${getLeaderIcon(r) ? 'text-indigo-600 font-black border-indigo-200 bg-indigo-50' : 'text-slate-600'}`}>
                                                    {r.teamLeader}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 text-xs">미지정</span>
                                            )}
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`px-3 py-1 rounded-full text-xs font-black shadow-sm ${getSafetyLevelClass(r.safetyLevel)}`}>{r.safetyScore}</span>
                                                <span className="text-[10px] font-black text-slate-500">{r.safetyLevel}</span>
                                                {needsGradeRevalidation(r) && (
                                                    <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded">등급 재검증 필요</span>
                                                )}
                                                {getReviewTrustState(r) === 'PENDING' && (
                                                    <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded">재검토 대기</span>
                                                )}
                                                {getReviewTrustState(r) === 'FINALIZED' && (
                                                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">최종확정</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-center">
                                            {hasImage ? (
                                                <span className="text-emerald-500 font-black text-[9px] uppercase">OK</span>
                                            ) : (
                                                <span className="text-rose-400 font-black text-[9px] uppercase bg-rose-100 px-2 py-1 rounded">IMG LOSS</span>
                                            )}
                                        </td>
                                        <td className="px-4 sm:px-8 py-5 text-right">
                                            <div className="ml-auto flex min-w-[280px] max-w-sm flex-col items-stretch gap-2">
                                                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-left">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">상세 판단 바로보기</p>
                                                    <p className="mt-1 text-[11px] font-black leading-snug text-slate-900">{rowStatusSummary}</p>
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); onViewDetails(r); }} className="px-4 py-2 bg-indigo-600 border border-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition-all shadow-sm">상세 판단 바로보기</button>
                                                <button onClick={(e) => { e.stopPropagation(); onOpenReport(r); }} className="px-4 py-2 bg-slate-900 text-white font-black text-xs rounded-xl hover:bg-black transition-all shadow-sm">보호 리포트 바로가기</button>
                                                <button
                                                    type="button"
                                                    data-ocr-collapse-delete="delete-single-record"
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSingleRecord(r); }}
                                                    className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 font-black text-xs rounded-xl hover:bg-rose-100 transition-all shadow-sm"
                                                >
                                                    이 기록 삭제
                                                </button>
                                                {failed && !isAnalyzing && hasImage && (
                                                    <button onClick={(e) => { e.stopPropagation(); runBatchAnalysis([r], '개별 재분석'); }} className={`px-3 py-2 font-bold text-xs rounded-xl border transition-all ${retryActionButtonClass}`} title={preflightReason || '사전진단 통과'}>
                                                        원문 다시 읽기
                                                    </button>
                                                )}
                                                {showWorkerExtraActions && (
                                                    <>
                                                        {failed && !isAnalyzing && (
                                                            <button onClick={(e) => { e.stopPropagation(); handleAdminNormalizeFailedRecord(r); }} className="px-3 py-2 bg-amber-100 text-amber-700 font-bold text-xs rounded-xl hover:bg-amber-200 transition-all" title="다시 확인이 어려운 건을 관리자 확인 후 정상 분류">
                                                                관리자 판단으로 유지
                                                            </button>
                                                        )}
                                                        {failed && immediateActions.map((action) => (
                                                            <button
                                                                key={`${r.id}-${action.type}`}
                                                                onClick={(e) => { e.stopPropagation(); void handleFailureImmediateAction(r, action.type); }}
                                                                className={`px-3 py-2 font-bold text-xs rounded-xl transition-all ${action.className}`}
                                                                title={action.title}
                                                            >
                                                                {action.label}
                                                            </button>
                                                        ))}
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSingleRecord(r); }} className="p-2 bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all" title="삭제">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {hiddenRecordListCount > 0 && (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4 text-center">
                        <p className="text-[11px] font-bold text-slate-500">
                            화면 성능을 위해 {visibleRecordListRecords.length}건만 먼저 표시 중입니다. 남은 기록 {hiddenRecordListCount}건
                        </p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                            <button
                                type="button"
                                data-ocr-record-view="load-more"
                                onClick={() => setRecordRenderLimit((prev) => prev + RECORD_RENDER_INCREMENT)}
                                className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black text-white hover:bg-black"
                            >
                                다음 {Math.min(RECORD_RENDER_INCREMENT, hiddenRecordListCount)}건 더 보기
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecordRenderLimit(recordListRecords.length)}
                                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                            >
                                현재 조건 전체 표시
                            </button>
                        </div>
                    </div>
                )}
                <div className="border-t border-slate-100 bg-white px-4 py-3 text-center">
                    <button
                        type="button"
                        onClick={() => setShowRecordListPanel(false)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-100"
                    >
                        상세 기록 목록 접기
                    </button>
                </div>
                </>
                )}
            </div>

            <CollapsibleSection
                title="🔍 운영 탐색 및 우선순위 정리 (검색·필터 및 통계 분석)"
                defaultOpen={false}
                summary={<span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-[11px] font-black text-slate-700 dark:text-slate-200">대체 분석 회복률 {fallbackRecoveryRate}% · 재분석 {secondPassTargets.length}건</span>}
            >
                <div className="pt-4">
                    <div className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 flex flex-col gap-5 no-print">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] gap-4 xl:items-start">
                    <div className="min-w-0">
                        <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">운영 탐색 및 우선순위 정리</h4>
                        <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-300">검색·필터·정렬을 통해 지금 봐야 할 보호 신호와 재평가 대상을 한 번에 정리합니다.</p>
                        {isDevMode && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black ${fallbackRecoveryBadge.className}`}>
                                {fallbackRecoveryBadge.text}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                                대체 분석 회복률 {fallbackRecoveryRate}%
                            </span>
                        </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-2 sm:gap-3 w-full">
                        <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">조회 결과</p>
                            <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{filteredRecords.length}</p>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">재분석 가능</p>
                            <p className="mt-1 text-lg font-black text-emerald-700">{secondPassTargets.length}</p>
                        </div>
                        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-3 py-2">
                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">{BRAND_STATUS_LABELS.attentionPending}</p>
                            <p className="mt-1 text-lg font-black text-rose-700">{filteredFailedCount}</p>
                        </div>
                        <div className="rounded-2xl bg-violet-50 border border-violet-200 px-3 py-2">
                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">제외 사유</p>
                            <div className="mt-1 space-y-1">
                                {secondPassSkippedBreakdown.items.length > 0 ? secondPassSkippedBreakdown.items.slice(0, 2).map((item) => (
                                    <p key={item.reason} className="text-[11px] font-black text-violet-700 leading-snug">
                                        {item.reason} · {item.count}건
                                    </p>
                                )) : (
                                    <p className="text-[11px] font-black text-violet-700 leading-snug">없음</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {!isCompactMobile && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">PC 운영 배치 바로가기</p>
                                <p className="mt-1 text-[12px] font-semibold text-slate-600">실패 큐, 재분석, 관리자 점검 패널을 즉시 열어 대량 처리 흐름을 유지합니다.</p>
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-5">
                            <button type="button" onClick={() => setRecordSortMode('failed-first')} className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-100">
                                실패 우선 정렬
                            </button>
                            <button type="button" onClick={() => setShowRetryDetailPanel(true)} className="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-black text-emerald-700 hover:bg-emerald-100">
                                재분석 상세 열기
                            </button>
                            <button type="button" onClick={() => setShowFailedQuickActions((prev) => !prev)} className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs font-black text-rose-700 hover:bg-rose-100">
                                실패 큐 빠른조치
                            </button>
                            <button type="button" onClick={() => setShowReasonQaDetailPanel(true)} className="min-h-[44px] rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs font-black text-violet-700 hover:bg-violet-100">
                                사유 QA 패널
                            </button>
                            <button type="button" onClick={() => setShowAdminActivityPanel(true)} className="min-h-[44px] rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs font-black text-sky-700 hover:bg-sky-100">
                                관리자 활동 패널
                            </button>
                        </div>
                    </div>
                )}

                <InterpretationCardGrid items={filteredInterpretationCards} />

                <SectionPanelCard
                    variant="whiteSoft"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    eyebrow="운영 포커스"
                    title={activeFilterSummaryItems.length > 0 ? '현재 필터가 적용된 상태입니다.' : '현재 기본 필터 상태입니다.'}
                    description={activeFilterSummaryItems.length > 0
                        ? `${activeFilterSummaryItems.length}개 조건으로 결과를 압축해 보고 있습니다. 필요할 때 초기화 후 전체 흐름으로 복귀하세요.`
                        : '검색/필터를 적용하면 우선 확인 대상과 제외 사유를 더 빠르게 좁힐 수 있습니다.'}
                    eyebrowClassName="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"
                    titleClassName="mt-1 text-sm font-black text-slate-900"
                    descriptionClassName="mt-1 text-[12px] font-semibold text-slate-600"
                    bodyClassName="mt-3"
                >
                    {activeFilterSummaryItems.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {activeFilterSummaryItems.map((item) => (
                                <span key={item} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700">
                                    {item}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[12px] font-semibold text-slate-500">적용된 추가 필터가 없습니다.</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-700">조회 결과 {filteredRecords.length}건</span>
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700">{BRAND_STATUS_LABELS.attentionPending} {filteredFailedCount}건</span>
                        {activeFilterSummaryItems.length > 0 && (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                            >
                                필터 전체 해제
                            </button>
                        )}
                    </div>
                </SectionPanelCard>

                {recentAdminActivities.length > 0 && (
                    <CollapsibleSection
                        title="최근 24시간 운영 조치 요약"
                        isOpen={showAdminActivityPanel}
                        onToggle={() => setShowAdminActivityPanel((prev) => !prev)}
                        summary={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">수정 {recentAdminActivitySummary.corrections} · 승인 {recentAdminActivitySummary.approvals} · 재분석 {recentAdminActivitySummary.reassessments}</span>}
                    >
                    <SectionPanelCard
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                        eyebrow="관리자 조치 이력"
                        title="최근 24시간 운영 조치 요약"
                        description="수정, 승인/반려, 2차 재분석 이력을 한 번에 확인할 수 있습니다."
                        headerAction={(
                            <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-700">수정 {recentAdminActivitySummary.corrections}</span>
                                <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700">검토/승인 {recentAdminActivitySummary.approvals}</span>
                                <span className="rounded-full bg-indigo-100 px-3 py-1.5 text-indigo-700">재분석 {recentAdminActivitySummary.reassessments}</span>
                            </div>
                        )}
                        headerClassName="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
                        eyebrowClassName="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500"
                        titleClassName="mt-2 text-base font-black text-slate-900"
                        descriptionClassName="mt-1 text-[12px] font-semibold text-slate-500"
                        bodyClassName="mt-4"
                    >
                        <InterpretationCardGrid items={adminActivityInsightCards} className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-3" />
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                            {recentAdminActivities.map((activity) => (
                                <OperationalPreviewCard
                                    key={activity.key}
                                    variant="whiteElevated"
                                    title={activity.name}
                                    subtitle={`${activity.jobField} · ${activity.timestampLabel || '시각 없음'}`}
                                    badge={<span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${activity.type === '수정' ? 'bg-violet-100 text-violet-700' : activity.type === '재분석' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{activity.type}</span>}
                                    body={(
                                        <StatusEvidenceActionPanel
                                            className="grid grid-cols-1 gap-2"
                                            cardClassName="rounded-xl border px-3 py-3"
                                            titleClassName="mt-1 text-[11px] font-semibold leading-snug text-slate-600 whitespace-pre-wrap break-words"
                                            items={[
                                                {
                                                    key: `${activity.key}-summary`,
                                                    eyebrow: '판단 근거',
                                                    title: activity.summary,
                                                    tone: BRAND_TONE.slateSoft,
                                                    eyebrowClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                                                },
                                            ]}
                                        />
                                    )}
                                    titleClassName="truncate text-sm font-black text-slate-900"
                                    subtitleClassName="mt-0.5 truncate text-[11px] font-bold text-slate-500"
                                    bodyClassName="mt-2"
                                />
                            ))}
                        </div>
                    </SectionPanelCard>
                    </CollapsibleSection>
                )}

                {/* P2: 월간 리스크 인텔리전스 자동화 패널 */}
                {riskIntelligence.total30d > 0 && (
                    <CollapsibleSection
                        title="📊 월간 리스크 인텔리전스 패턴 분석"
                        defaultOpen={false}
                        summary={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">30일 처리 {riskIntelligence.total30d}건</span>}
                    >
                        <div className="pt-2">
                            <SectionPanelCard
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                        eyebrow="월간 리스크 인텔리전스"
                        title={`최근 30일 처리 ${riskIntelligence.total30d}건 · 실패율 ${riskIntelligence.currentFailRate}%${riskIntelligence.trend === 'up' ? ' ▲ 악화' : riskIntelligence.trend === 'down' ? ' ▼ 개선' : ' ─ 안정'}`}
                        description="30일 패턴 분석 — 반복 실패 코드·재분석 회수·승인 사유 품질을 한눈에 확인합니다."
                        eyebrowClassName="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500"
                        titleClassName="mt-2 text-base font-black text-slate-900"
                        descriptionClassName="mt-1 text-[12px] font-semibold text-slate-500"
                        bodyClassName="mt-4"
                    >
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className={`rounded-xl p-3 border ${riskIntelligence.trend === 'up' ? 'bg-rose-50 border-rose-200' : riskIntelligence.trend === 'down' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">실패율 추세</p>
                                <p className={`mt-1 text-xl font-black ${riskIntelligence.trend === 'up' ? 'text-rose-600' : riskIntelligence.trend === 'down' ? 'text-emerald-600' : 'text-slate-700'}`}>{riskIntelligence.currentFailRate}%</p>
                                <p className="text-[10px] font-bold text-slate-400">전월 {riskIntelligence.prevFailRate > 0 ? `${riskIntelligence.prevFailRate}%` : '데이터 없음'}</p>
                            </div>
                            <div className="rounded-xl p-3 border bg-violet-50 border-violet-200">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">UNKNOWN</p>
                                <p className="mt-1 text-xl font-black text-violet-700">{riskIntelligence.unknownCount30d}<span className="text-sm ml-0.5">건</span></p>
                                <p className="text-[10px] font-bold text-slate-400">미분류 실패 30일</p>
                            </div>
                            <div className="rounded-xl p-3 border bg-indigo-50 border-indigo-200">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">재분석 회수</p>
                                <p className="mt-1 text-xl font-black text-indigo-700">{riskIntelligence.reanalysisCount30d}<span className="text-sm ml-0.5">건</span></p>
                                <p className="text-[10px] font-bold text-slate-400">감사 이력 보유</p>
                            </div>
                            <div className={`rounded-xl p-3 border ${riskIntelligence.approvalWeakCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">승인사유 미흡</p>
                                <p className={`mt-1 text-xl font-black ${riskIntelligence.approvalWeakCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>{riskIntelligence.approvalWeakCount}<span className="text-sm ml-0.5">건</span></p>
                                <p className="text-[10px] font-bold text-slate-400">보강 권장</p>
                            </div>
                        </div>
                        {riskIntelligence.topCode && (
                            <div className="mt-3 rounded-xl p-3 bg-slate-50 border border-slate-200">
                                <p className="text-[11px] font-black text-slate-600">집중 실패 코드 <span className="text-violet-700">{riskIntelligence.topCode.code}</span> — 30일간 {riskIntelligence.topCode.count}건 발생. 해당 코드에 대한 운영 조치를 점검하세요.</p>
                            </div>
                        )}
                        {riskIntelligence.jobFieldRiskRanking.length > 0 && (
                            <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1.5">공종별 위험도 순위 / {riskIntelligence.coachingGapCount > 0 ? `교육갭 ${riskIntelligence.coachingGapCount}명` : '양호'}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {riskIntelligence.jobFieldRiskRanking.map((item, idx) => (
                                        <span key={idx} className="px-2 py-1 rounded-full bg-slate-700 text-slate-100 text-[9px] font-bold">
                                            {item.jobField} {item.failRate}% ({item.failed}/{item.total})
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {riskIntelligence.coachingGapCount > 0 && (
                            <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-1.5">⚠ 교육-행동 갭 감지</p>
                                <p className="text-[10px] font-bold text-amber-700">
                                    응답품질 신호가 낮고 코칭 이력이 없는 근로자 <span className="font-black text-amber-900">{riskIntelligence.coachingGapCount}명</span> — 현장 교육 실행 후 갱신하세요.
                                </p>
                            </div>
                        )}
                    </SectionPanelCard>
                        </div>
                    </CollapsibleSection>
                )}
                {reasonQaPreviewRecords.length > 0 && (
                    <CollapsibleSection
                        title="🔍 승인 및 검토 사유 품질 점검"
                        defaultOpen={false}
                        summary={<span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700">미흡 {reasonQaSummary.missingDecision + reasonQaSummary.weakDecision + reasonQaSummary.weakCorrection}건</span>}
                    >
                        <div className="pt-2">
                            <SectionPanelCard
                        variant="roseGradient"
                        eyebrow="운영 보완 필요"
                        title="승인/검토 사유가 미흡한 기록이 남아 있습니다."
                        description={`사유 없음 ${reasonQaSummary.missingDecision}건, 승인사유 보강 필요 ${reasonQaSummary.weakDecision}건, 수정사유 보강 필요 ${reasonQaSummary.weakCorrection}건을 우선 점검해 주세요.`}
                        headerAction={(
                            <div className="flex flex-wrap gap-2">
                                {reasonQaPreviewRecords.find((record) => record.missingDecisionReason) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFilterReason('missing-reason');
                                            handleViewRecordById(reasonQaPreviewRecords.find((record) => record.missingDecisionReason)?.id || '');
                                        }}
                                        className="rounded-xl bg-rose-600 px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-white hover:bg-rose-700"
                                    >
                                        사유 없음 바로 확인
                                    </button>
                                )}
                                {reasonQaPreviewRecords.find((record) => record.weakDecisionReason) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFilterReason('weak-reason');
                                            handleViewRecordById(reasonQaPreviewRecords.find((record) => record.weakDecisionReason)?.id || '');
                                        }}
                                        className="rounded-xl bg-amber-500 px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-white hover:bg-amber-600"
                                    >
                                        승인사유 보강 이동
                                    </button>
                                )}
                                {reasonQaPreviewRecords.find((record) => record.weakCorrection) && (
                                    <button
                                        type="button"
                                        onClick={() => handleViewRecordById(reasonQaPreviewRecords.find((record) => record.weakCorrection)?.id || '')}
                                        className="rounded-xl bg-violet-600 px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-white hover:bg-violet-700"
                                    >
                                        수정사유 보강 이동
                                    </button>
                                )}
                            </div>
                        )}
                        headerClassName="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
                        eyebrowClassName="text-[11px] font-black uppercase tracking-[0.2em] text-rose-600"
                        titleClassName="mt-2 text-base font-black text-slate-900"
                        descriptionClassName="mt-1 text-[12px] font-semibold leading-relaxed text-slate-600"
                        bodyClassName="mt-4"
                    >
                        <InterpretationCardGrid items={reasonQaInsightCards} className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-3" />
                        {reasonInputPrompt && (
                            <SectionPanelCard
                                variant="whiteSoft"
                                eyebrow="사유 입력 가이드"
                                title={`${reasonInputPrompt.name} · ${reasonInputPrompt.focus}`}
                                description="짧은 문구 대신 검토 근거, 확인 범위, 반영 내용을 포함해 남기면 추적성과 QA 품질이 좋아집니다."
                                headerAction={(
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleViewRecordById(reasonInputPrompt.id)}
                                            className="rounded-xl bg-slate-900 px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-white hover:bg-black"
                                        >
                                            해당 기록 바로 열기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFilterReason(reasonQaSummary.missingDecision > 0 ? 'missing-reason' : 'weak-reason')}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-slate-700 hover:bg-slate-50"
                                        >
                                            관련 항목만 보기
                                        </button>
                                    </div>
                                )}
                                headerClassName="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                                eyebrowClassName="text-[11px] font-black uppercase tracking-wider text-rose-600"
                                titleClassName="mt-1 text-sm font-black text-slate-900"
                                descriptionClassName="mt-2 text-[12px] font-semibold leading-relaxed text-slate-600"
                                bodyClassName="mt-3"
                            >
                                <div className="rounded-xl bg-slate-50 px-3 py-3">
                                    <p className="text-[11px] font-black text-slate-500">권장 입력 예시</p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-[12px] font-semibold leading-relaxed text-slate-700">{reasonInputPrompt.sample}</p>
                                </div>
                            </SectionPanelCard>
                        )}
                    </SectionPanelCard>
                        </div>
                    </CollapsibleSection>
                )}

                {reasonQaPreviewRecords.length > 0 && (
                    <CollapsibleSection
                        title="사유 품질 QA 상세"
                        isOpen={showReasonQaDetailPanel}
                        onToggle={() => setShowReasonQaDetailPanel((prev) => !prev)}
                        summary={<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">사유 없음 {reasonQaSummary.missingDecision} · 보강 필요 {reasonQaSummary.weakDecision + reasonQaSummary.weakCorrection}</span>}
                    >
                    <SectionPanelCard
                        variant="amber"
                        title={(
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-600">사유 품질 QA</p>
                                    <h5 className="mt-2 text-base font-black text-slate-900">보강이 필요한 승인/수정 사유</h5>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                    <button type="button" onClick={() => setFilterReason('missing-reason')} className="rounded-full border border-amber-200 bg-white px-3 py-2 text-amber-700 hover:bg-amber-100">사유 없음 {reasonQaSummary.missingDecision}</button>
                                    <button type="button" onClick={() => setFilterReason('weak-reason')} className="rounded-full border border-amber-200 bg-white px-3 py-2 text-amber-700 hover:bg-amber-100">사유 보강 필요 {reasonQaSummary.weakDecision}</button>
                                    <span className="rounded-full border border-amber-200 bg-white px-3 py-2 text-amber-700">수정 사유 보강 {reasonQaSummary.weakCorrection}</span>
                                </div>
                            </div>
                        )}
                        description="사유 누락, 너무 짧은 승인/검토 문구, 약한 수정 사유를 한 번에 점검합니다."
                        titleClassName="text-inherit"
                        descriptionClassName="mt-1 text-[12px] font-semibold text-slate-600"
                        bodyClassName="mt-4"
                    >
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                            {reasonQaPreviewRecords.map((record) => (
                                <OperationalPreviewCard
                                    key={record.id}
                                    variant="whiteElevated"
                                    title={record.name}
                                    subtitle={record.jobField}
                                    badge={(
                                        <div className="flex flex-wrap justify-end gap-1">
                                            {record.missingDecisionReason && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-700">사유 없음</span>}
                                            {record.weakDecisionReason && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">승인사유 약함</span>}
                                            {record.weakCorrection && <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">수정사유 약함</span>}
                                        </div>
                                    )}
                                    body={(
                                        <>
                                            <StatusEvidenceActionPanel
                                                className="space-y-2 text-[11px]"
                                                cardClassName="rounded-lg px-3 py-2"
                                                titleClassName="mt-1 font-semibold leading-snug whitespace-pre-wrap break-words text-slate-700"
                                                descriptionClassName="mt-1 font-semibold leading-snug whitespace-pre-wrap break-words text-slate-700"
                                                items={[
                                            {
                                                key: `${record.id}-qa-status`,
                                                eyebrow: '지금 상태',
                                                title: record.missingDecisionReason
                                                    ? '승인/검토 사유가 비어 있습니다.'
                                                    : record.weakDecisionReason
                                                        ? '승인/검토 사유가 너무 짧거나 일반적입니다.'
                                                        : '수정 사유가 충분히 남지 않았습니다.',
                                                tone: 'border border-rose-100 bg-rose-50',
                                                eyebrowClassName: 'font-black text-rose-600 uppercase tracking-[0.18em]',
                                                description: undefined,
                                            },
                                            {
                                                key: `${record.id}-qa-decision`,
                                                eyebrow: '판단 근거 · 승인/검토 사유',
                                                title: record.decisionReason || '사유 없음',
                                                tone: 'bg-slate-50',
                                                eyebrowClassName: 'font-black text-slate-500',
                                                description: undefined,
                                            },
                                            {
                                                key: `${record.id}-qa-correction`,
                                                eyebrow: '판단 근거 · 최근 수정 사유',
                                                title: record.correctionReason || '수정 사유 없음',
                                                tone: 'bg-slate-50',
                                                eyebrowClassName: 'font-black text-slate-500',
                                                description: undefined,
                                            },
                                            {
                                                key: `${record.id}-qa-action`,
                                                eyebrow: '다음 행동',
                                                title: '상세 화면에서 검토 근거, 확인 범위, 반영 내용을 한 문장 이상으로 남겨 QA 잔여를 줄이세요.',
                                                tone: 'border border-emerald-100 bg-emerald-50',
                                                eyebrowClassName: 'font-black text-emerald-600 uppercase tracking-[0.18em]',
                                                description: undefined,
                                            },
                                        ]}
                                            />
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewRecordById(record.id)}
                                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-indigo-600 hover:bg-indigo-50"
                                                >
                                                    상세 판단 이동
                                                </button>
                                                {record.missingDecisionReason && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setFilterReason('missing-reason')}
                                                        className="rounded-xl bg-rose-100 px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-rose-700 hover:bg-rose-200"
                                                    >
                                                        사유 없음만 보기
                                                    </button>
                                                )}
                                                {record.weakDecisionReason && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setFilterReason('weak-reason')}
                                                        className="rounded-xl bg-amber-100 px-3 py-2.5 min-h-[42px] text-[12px] sm:text-xs font-black text-amber-700 hover:bg-amber-200"
                                                    >
                                                        사유 보강 필요만 보기
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                    titleClassName="truncate text-sm font-black text-slate-900"
                                    subtitleClassName="mt-0.5 truncate text-[11px] font-bold text-slate-500"
                                    bodyClassName="mt-2"
                                />
                            ))}
                        </div>
                    </SectionPanelCard>
                    </CollapsibleSection>
                )}

                <CollapsibleSection
                    title="고급 필터 · 정렬 · 2차 재분석 설정"
                    isOpen={showAdvancedOcrControls}
                    onToggle={() => setShowAdvancedOcrControls((prev) => !prev)}
                    summary={<span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700">필터 {filterField !== 'all' || filterLeader !== 'all' || filterTrust !== 'all' || filterLevel !== 'all' || filterStatus !== 'all' || filterReason !== 'all' || secondPassStatusFilter !== 'all' ? '적용 중' : '기본값'} · 재분석 {secondPassTargets.length}건</span>}
                >
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            <ControlPanelCard label="공종">
                                <select value={filterField} onChange={(e) => setFilterField(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    {jobFields.map(field => (
                                        <option key={field} value={field}>{field}</option>
                                    ))}
                                </select>
                            </ControlPanelCard>
                            <ControlPanelCard label="팀장">
                                <select value={filterLeader} onChange={(e) => setFilterLeader(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    {teamLeaders.map(leader => (
                                        <option key={leader} value={leader}>{leader}</option>
                                    ))}
                                </select>
                            </ControlPanelCard>
                            <ControlPanelCard label="신뢰 상태">
                                <select value={filterTrust} onChange={(e) => setFilterTrust(e.target.value as 'all' | 'pending' | 'finalized')} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="pending">재검토 대기</option>
                                    <option value="finalized">최종확정</option>
                                </select>
                            </ControlPanelCard>
                            <ControlPanelCard label="등급">
                                <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="고급">고급</option>
                                    <option value="중급">중급</option>
                                    <option value="초급">초급</option>
                                </select>
                            </ControlPanelCard>
                            <ControlPanelCard label="OCR 결과">
                                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | 'success' | 'failed')} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="success">성공</option>
                                    <option value="failed">{BRAND_STATUS_LABELS.attentionPending}</option>
                                </select>
                            </ControlPanelCard>
                            <ControlPanelCard label="2차 상태">
                                <select value={secondPassStatusFilter} onChange={(e) => setSecondPassStatusFilter(e.target.value as 'all' | 'done' | 'not-done')} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="done">완료(DONE)만</option>
                                    <option value="not-done">미완료만</option>
                                </select>
                            </ControlPanelCard>
                            <ControlPanelCard label="승인/검토 사유">
                                <select value={filterReason} onChange={(e) => setFilterReason(e.target.value as 'all' | 'has-reason' | 'missing-reason' | 'weak-reason')} className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="has-reason">사유 있음</option>
                                    <option value="missing-reason">사유 없음</option>
                                    <option value="weak-reason">사유 보강 필요</option>
                                </select>
                            </ControlPanelCard>
                            <ControlPanelCard className="rounded-2xl border border-slate-200 bg-white px-3 py-3" contentClassName="flex h-full flex-col justify-between">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={failedOnlyDefault}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setFailedOnlyDefault(checked);
                                            setFilterStatus(checked ? 'failed' : 'all');
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                    />
                                    {BRAND_STATUS_LABELS.attentionPending}만 보기 기본값
                                </label>
                                <button onClick={resetFilters} className="mt-3 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-black text-sm hover:bg-slate-50 transition-all">
                                    필터 초기화
                                </button>
                            </ControlPanelCard>
                        </div>
                        <ControlPanelCard label="정렬" className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full sm:w-auto">
                                    <button type="button" onClick={() => setRecordSortMode('recent-correction')} className={`px-3 py-2.5 min-h-[42px] rounded-xl text-[12px] sm:text-xs font-black border transition-all ${recordSortMode === 'recent-correction' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>최근 수정순</button>
                                    <button type="button" onClick={() => setRecordSortMode('score-desc')} className={`px-3 py-2.5 min-h-[42px] rounded-xl text-[12px] sm:text-xs font-black border transition-all ${recordSortMode === 'score-desc' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>응답품질 높은순</button>
                                    <button type="button" onClick={() => setRecordSortMode('failed-first')} className={`px-3 py-2.5 min-h-[42px] rounded-xl text-[12px] sm:text-xs font-black border transition-all ${recordSortMode === 'failed-first' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>우선 {BRAND_STATUS_LABELS.attention}</button>
                                    <button type="button" onClick={() => setRecordSortMode('error-type')} className={`px-3 py-2.5 min-h-[42px] rounded-xl text-[12px] sm:text-xs font-black border transition-all ${recordSortMode === 'error-type' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{BRAND_STATUS_LABELS.attention} 유형순</button>
                                </div>
                            </div>
                            <p className="mt-2 text-[11px] font-bold text-slate-500">현재 정렬: {getRecordSortModeLabel(recordSortMode)}</p>
                        </ControlPanelCard>
                    </div>

                    <SectionPanelCard
                        className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 shadow-sm sm:p-5"
                        eyebrow="2차 AI 재분석"
                        title="관리자 수정본 기준 재평가"
                        description="현재 필터 기준으로 OCR 성공 기록만 선별해 응답품질, 확인단계, 강점/약점, AI 인사이트를 다시 계산합니다."
                        eyebrowClassName="text-[11px] font-black uppercase tracking-[0.2em] text-violet-500"
                        titleClassName="mt-2 text-lg font-black text-slate-900"
                        descriptionClassName="mt-2 text-sm font-semibold leading-relaxed text-slate-600"
                        bodyClassName="mt-4"
                    >
                        <ul className="space-y-2 text-[12px] font-bold text-slate-600">
                            <li>• 적용 대상: {secondPassTargets.length}건</li>
                            <li>• 자동 제외: OCR {BRAND_STATUS_LABELS.attentionPending}, 원문 텍스트 없음{secondPassEditedOnly ? ', 관리자 수정이력 없음' : ''}</li>
                            <li>• {BRAND_STATUS_LABELS.attention} 건 재처리: {BRAND_ACTION_LABELS.smartReanalyze} / {BRAND_ACTION_LABELS.directReanalyze} 사용</li>
                        </ul>
                        <label className="mt-4 flex items-center gap-2 text-xs font-black text-violet-700">
                            <input
                                type="checkbox"
                                checked={secondPassEditedOnly}
                                onChange={(e) => {
                                    setSecondPassEditedOnly(e.target.checked);
                                    setSecondPassExcludedOnly(false);
                                    setSecondPassReasonFilter('all');
                                }}
                                className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                            />
                            관리자 수정 이력 있는 건만 재분석
                        </label>
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSecondPassExcludedOnly(false);
                                    setSecondPassReasonFilter('all');
                                }}
                                className={`px-3 py-2.5 min-h-[42px] rounded-xl text-[12px] sm:text-xs font-black border transition-all ${!secondPassExcludedOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                            >
                                전체 보기
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSecondPassExcludedOnly(true);
                                    setSecondPassReasonFilter('all');
                                }}
                                className={`px-3 py-2.5 min-h-[42px] rounded-xl text-[12px] sm:text-xs font-black border transition-all ${secondPassExcludedOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                            >
                                제외 건만 보기
                            </button>
                        </div>
                        {Object.keys(secondPassSkippedCounts).length > 0 && (
                            <SectionPanelCard
                                variant="whiteSoft"
                                className="mt-4 rounded-2xl border border-violet-200 bg-white/90 p-3"
                                title="제외 사유 분해"
                                description={`총 ${secondPassSkippedBreakdown.total}건`}
                                titleClassName="text-[11px] font-black text-violet-700 uppercase tracking-wider"
                                descriptionClassName="text-[11px] font-bold text-slate-500"
                                bodyClassName="mt-3"
                            >
                                <div className="grid grid-cols-1 gap-2">
                                    {secondPassSkippedBreakdown.items.map((item) => (
                                        <button
                                            key={item.reason}
                                            type="button"
                                            onClick={() => {
                                                setSecondPassExcludedOnly(true);
                                                setSecondPassReasonFilter((current) => current === item.reason ? 'all' : item.reason);
                                            }}
                                            className={`rounded-xl border px-3 py-2 text-left transition-all ${secondPassReasonFilter === item.reason ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-violet-200 hover:bg-violet-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`text-[12px] font-black ${secondPassReasonFilter === item.reason ? 'text-white' : 'text-violet-700'}`}>{item.reason}</p>
                                                <span className={`text-[10px] font-black ${secondPassReasonFilter === item.reason ? 'text-violet-100' : 'text-slate-500'}`}>{item.count}건 · {item.share}%</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {secondPassReasonFilter !== 'all' && (
                                    <button
                                        type="button"
                                        onClick={() => setSecondPassReasonFilter('all')}
                                        className="mt-2 w-full rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-200 transition-all"
                                    >
                                        사유 필터 해제
                                    </button>
                                )}
                            </SectionPanelCard>
                        )}
                        <SectionPanelCard
                            className="mt-4 rounded-2xl border border-violet-200 bg-white/80 p-3"
                            title="대상 미리보기"
                            description={`상위 ${secondPassPreviewRecords.length}건`}
                            titleClassName="text-[11px] font-black text-violet-600 uppercase tracking-wider"
                            descriptionClassName="text-[11px] font-bold text-slate-500"
                            headerClassName="flex items-center justify-between gap-2"
                            bodyClassName="mt-3 space-y-2"
                        >
                            {secondPassPreviewRecords.length > 0 ? secondPassPreviewRecords.map((record) => (
                                <OperationalPreviewCard
                                    key={record.id}
                                    variant="whiteCompact"
                                    title={<p className="truncate">{record.name || '이름 없음'}</p>}
                                    subtitle={<p className="truncate">{record.jobField} · 팀장 {record.teamLeader || '미지정'}</p>}
                                    titleClassName="text-sm font-black text-slate-900"
                                    subtitleClassName="mt-1 text-[11px] font-bold text-slate-500"
                                    badge={<span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${getSafetyLevelClass(record.safetyLevel)}`}>{record.safetyScore}점</span>}
                                    body={getLatestCorrectionPreview(record) ? (
                                        <p className="text-[10px] font-black text-violet-700 leading-snug truncate">최근 수정: {getLatestCorrectionPreview(record)}</p>
                                    ) : null}
                                    footer={getLatestCorrectionReason(record) ? <span className="whitespace-pre-wrap break-words">사유 전문: {getLatestCorrectionReason(record)}</span> : null}
                                    footerClassName="mt-1 text-[10px] font-semibold text-slate-600 leading-snug"
                                    bodyClassName="mt-1"
                                />
                            )) : (
                                <EmptyStatePanel
                                    variant="slate"
                                    className="rounded-xl px-3 py-6"
                                    title={OCR_STATUS_COPY.secondPassEmpty.title}
                                    description={OCR_STATUS_COPY.secondPassEmpty.description}
                                    titleClassName="text-[11px] font-bold text-slate-500"
                                    descriptionClassName="mt-2 text-[11px] font-semibold leading-relaxed text-slate-400"
                                />
                            )}
                        </SectionPanelCard>
                        {isDevMode && retryDiagnostics && (
                            <SectionPanelCard
                                variant="emerald"
                                className="mt-4"
                                title="최근 재분석 결과"
                                description={`성공률 ${retrySuccessRate}%`}
                                headerAction={(
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black ${fallbackRecoveryBadge.className}`}>
                                        {fallbackRecoveryBadge.text}
                                    </span>
                                )}
                                titleClassName="text-[11px] font-black text-emerald-700 uppercase tracking-wider"
                                descriptionClassName="text-[11px] font-black text-emerald-700"
                                headerClassName="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                bodyClassName="mt-0"
                            >
                                {retryLastUpdatedLabel && (
                                    <p className="mt-1 text-[11px] font-bold text-emerald-800/80">마지막 집계: {retryLastUpdatedLabel}</p>
                                )}
                                <SummaryMetricGrid
                                    className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4"
                                    cardClassName="rounded-xl bg-white px-2 py-2"
                                    items={[
                                        {
                                            key: 'retry-total',
                                            label: '총 대상',
                                            value: retryDiagnostics.total,
                                            tone: 'border border-emerald-100',
                                            valueClassName: 'mt-1 text-lg font-black text-slate-900',
                                        },
                                        {
                                            key: 'retry-success',
                                            label: '성공',
                                            value: retryDiagnostics.success,
                                            tone: 'border border-emerald-100',
                                            labelClassName: 'text-[10px] font-black text-emerald-500 uppercase',
                                            valueClassName: 'mt-1 text-lg font-black text-emerald-700',
                                        },
                                        {
                                            key: 'retry-fail',
                                            label: BRAND_STATUS_LABELS.attention,
                                            value: retryDiagnostics.fail,
                                            tone: 'border border-rose-100',
                                            labelClassName: 'text-[10px] font-black text-rose-400 uppercase',
                                            valueClassName: 'mt-1 text-lg font-black text-rose-700',
                                        },
                                        {
                                            key: 'retry-preflight-fail',
                                            label: '사전 확인 필요',
                                            value: retryDiagnostics.preflightFail,
                                            tone: 'border border-amber-100',
                                            labelClassName: 'text-[10px] font-black text-amber-500 uppercase',
                                            valueClassName: 'mt-1 text-lg font-black text-amber-700',
                                        },
                                    ]}
                                />
                                <SummaryMetricGrid
                                    className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"
                                    cardClassName="rounded-xl bg-white/80 border border-slate-200 px-3 py-2"
                                    items={[
                                        {
                                            key: 'retry-server-success',
                                            label: '서버 성공',
                                            value: retryDiagnostics.serverSuccess,
                                            tone: '',
                                            labelClassName: 'text-[11px] font-bold text-slate-600',
                                            valueClassName: 'mt-0.5 text-sm font-black text-slate-900',
                                        },
                                        {
                                            key: 'retry-browser-fallback',
                                            label: '브라우저 대체 분석',
                                            value: retryDiagnostics.clientFallbackSuccess,
                                            tone: '',
                                            labelClassName: 'text-[11px] font-bold text-slate-600',
                                            valueClassName: 'mt-0.5 text-sm font-black text-slate-900',
                                        },
                                        {
                                            key: 'retry-processing-fail',
                                            label: '처리 확인 필요',
                                            value: retryDiagnostics.processingFail,
                                            tone: '',
                                            labelClassName: 'text-[11px] font-bold text-slate-600',
                                            valueClassName: 'mt-0.5 text-sm font-black text-slate-900',
                                        },
                                        {
                                            key: 'retry-route-fail',
                                            label: '라우트 확인 필요',
                                            value: retryDiagnostics.serverRouteFail,
                                            tone: '',
                                            labelClassName: 'text-[11px] font-bold text-slate-600',
                                            valueClassName: 'mt-0.5 text-sm font-black text-slate-900',
                                        },
                                        {
                                            key: 'retry-fallback-recovery-rate',
                                            label: '대체 분석 회복률',
                                            value: `${fallbackRecoveryRate}%`,
                                            tone: fallbackRecoveryMeta.tone,
                                            labelClassName: fallbackRecoveryMeta.labelClassName,
                                            valueClassName: fallbackRecoveryMeta.valueClassName,
                                            helper: fallbackRecoveryMeta.helperText,
                                            helperClassName: fallbackRecoveryMeta.helperClassName,
                                        },
                                    ]}
                                />
                                <CollapsibleSection
                                    title="재분석 상세 비교"
                                    isOpen={showRetryDetailPanel}
                                    onToggle={() => setShowRetryDetailPanel((prev) => !prev)}
                                    summary={<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">점수변화 {recentReassessmentImpact.length} · 인사이트 {recentInsightComparisons.length} · 텍스트 {recentTextComparisons.length}</span>}
                                >
                                    <SectionPanelCard
                                        variant="whiteSoft"
                                        className="mt-3 border-white/70 bg-white/70 p-3"
                                        title={`${BRAND_STATUS_LABELS.attention} 대응 가이드`}
                                        description={`${BRAND_STATUS_LABELS.attention} 유형 기준`}
                                        titleClassName="text-[11px] font-black text-slate-700 uppercase tracking-wider"
                                        descriptionClassName="text-[10px] font-bold text-slate-500"
                                        headerClassName="flex items-center justify-between gap-2"
                                        bodyClassName="mt-2 space-y-2"
                                    >
                                        {retryActionGuides.length > 0 ? retryActionGuides.map((guide) => (
                                            <div
                                                key={guide.key}
                                                className={`rounded-xl border px-3 py-2 ${guide.tone === 'amber' ? 'border-amber-200 bg-amber-50/80' : guide.tone === 'rose' ? 'border-rose-200 bg-rose-50/80' : 'border-violet-200 bg-violet-50/80'}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[11px] font-black text-slate-800">{guide.label}</p>
                                                    <span className="text-[10px] font-black text-slate-600">{guide.count}건</span>
                                                </div>
                                                <p className="mt-1 text-[11px] font-semibold text-slate-600 leading-snug">{guide.action}</p>
                                            </div>
                                        )) : (
                                            <EmptyStatePanel
                                                variant="emerald"
                                                className="rounded-xl px-3 py-6"
                                                title={OCR_STATUS_COPY.retryGuideClear.title}
                                                description={OCR_STATUS_COPY.retryGuideClear.description}
                                                descriptionClassName="mt-2 text-[11px] font-semibold leading-relaxed text-emerald-600"
                                            />
                                        )}
                                    </SectionPanelCard>
                                    {recentReassessmentImpact.length > 0 && (
                                        <SectionPanelCard
                                            variant="indigoSoft"
                                            className="mt-3"
                                            title="재분석 점수 변화"
                                            description={`최근 ${recentReassessmentImpact.length}건`}
                                            titleClassName="text-[11px] font-black text-indigo-700 uppercase tracking-wider"
                                            descriptionClassName="text-[10px] font-black text-indigo-700"
                                            headerClassName="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                            bodyClassName="mt-3 space-y-2"
                                        >
                                            {recentReassessmentImpact.map((item) => (
                                                <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-900 truncate">{item.name}</p>
                                                            <p className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{item.jobField} · {item.timestampLabel || '시각 없음'}</p>
                                                        </div>
                                                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black ${item.delta > 0 ? 'bg-emerald-100 text-emerald-700' : item.delta < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {item.delta > 0 ? `+${item.delta}` : item.delta}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 text-[11px] font-semibold">
                                                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">점수: <span className="text-slate-900">{item.previousScore} → {item.nextScore}</span></div>
                                                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">등급: <span className="text-slate-900">{item.previousLevel || '-'} → {item.nextLevel || '-'}</span></div>
                                                    </div>
                                                    {item.note && (
                                                        <div className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-700 leading-snug whitespace-pre-wrap break-words">
                                                            근거 요약: {item.note}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </SectionPanelCard>
                                    )}
                                {recentInsightComparisons.length > 0 && (
                                    <SectionPanelCard
                                        variant="cyanSoft"
                                        className="mt-3"
                                        title="AI 인사이트 전후 비교"
                                        description={`최근 ${recentInsightComparisons.length}건`}
                                        titleClassName="text-[11px] font-black text-cyan-700 uppercase tracking-wider"
                                        descriptionClassName="text-[10px] font-black text-cyan-700"
                                        headerClassName="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                        bodyClassName="mt-3 space-y-2"
                                    >
                                            {recentInsightComparisons.map((item) => (
                                                <OperationalPreviewCard
                                                    key={item.id}
                                                    variant="whiteCompact"
                                                    title={item.name}
                                                    subtitle={`${item.jobField} · ${item.timestampLabel || '시각 없음'}`}
                                                    titleClassName="text-sm font-black text-slate-900"
                                                    subtitleClassName="mt-0.5 truncate text-[11px] font-bold text-slate-500"
                                                    actions={(
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewRecordById(item.id)}
                                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                                        >
                                                            상세검증 이동
                                                        </button>
                                                    )}
                                                    body={(
                                                        <div className="grid grid-cols-1 gap-2 text-[11px] lg:grid-cols-2">
                                                            <div className="rounded-lg bg-rose-50 px-3 py-2">
                                                                <p className="font-black text-rose-700">변경 전</p>
                                                                <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{item.beforeInsight || '기존 인사이트 없음'}</p>
                                                            </div>
                                                            <div className="rounded-lg bg-emerald-50 px-3 py-2">
                                                                <p className="font-black text-emerald-700">변경 후</p>
                                                                <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{item.afterInsight || '변경 후 인사이트 없음'}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    footer={item.reason ? <span className="whitespace-pre-wrap break-words">변경 사유: {item.reason}</span> : null}
                                                    footerClassName="mt-2 rounded-lg bg-cyan-50 px-3 py-2 text-[11px] font-semibold text-cyan-800 leading-snug"
                                                />
                                            ))}
                                    </SectionPanelCard>
                                )}
                                {recentContentComparisons.length > 0 && (
                                    <SectionPanelCard
                                        variant="fuchsiaSoft"
                                        className="mt-3"
                                        title="강점/약점·근거 비교"
                                        description={`최근 ${recentContentComparisons.length}건`}
                                        titleClassName="text-[11px] font-black text-fuchsia-700 uppercase tracking-wider"
                                        descriptionClassName="text-[10px] font-black text-fuchsia-700"
                                        headerClassName="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                        bodyClassName="mt-3 space-y-2"
                                    >
                                            {recentContentComparisons.map((item) => (
                                                <OperationalPreviewCard
                                                    key={item.id}
                                                    variant="whiteCompact"
                                                    title={item.name}
                                                    subtitle={`${item.jobField} · ${item.timestampLabel || '시각 없음'}`}
                                                    titleClassName="text-sm font-black text-slate-900"
                                                    subtitleClassName="mt-0.5 truncate text-[11px] font-bold text-slate-500"
                                                    actions={(
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewRecordById(item.id)}
                                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                                        >
                                                            상세검증 이동
                                                        </button>
                                                    )}
                                                    body={(
                                                        <div className="space-y-2">
                                                            {item.changes.map((change) => (
                                                                <div key={change.field} className="rounded-lg bg-fuchsia-50/60 px-3 py-2 text-[11px]">
                                                                    <p className="font-black text-fuchsia-700">{change.label}</p>
                                                                    <div className="mt-1 grid grid-cols-1 gap-2 lg:grid-cols-2">
                                                                        <div className="rounded-lg bg-white px-3 py-2">
                                                                            <p className="font-black text-rose-700">변경 전</p>
                                                                            <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{change.before}</p>
                                                                        </div>
                                                                        <div className="rounded-lg bg-white px-3 py-2">
                                                                            <p className="font-black text-emerald-700">변경 후</p>
                                                                            <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{change.after}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    footer={item.reason ? <span className="whitespace-pre-wrap break-words">변경 사유: {item.reason}</span> : null}
                                                    footerClassName="mt-2 rounded-lg bg-fuchsia-50 px-3 py-2 text-[11px] font-semibold text-fuchsia-800 leading-snug"
                                                />
                                            ))}
                                    </SectionPanelCard>
                                )}
                                {recentTextComparisons.length > 0 && (
                                    <SectionPanelCard
                                        variant="skySoft"
                                        className="mt-3"
                                        title="OCR 원문/번역 비교"
                                        description={`최근 ${recentTextComparisons.length}건`}
                                        titleClassName="text-[11px] font-black text-sky-700 uppercase tracking-wider"
                                        descriptionClassName="text-[10px] font-black text-sky-700"
                                        headerClassName="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                        bodyClassName="mt-3 space-y-2"
                                    >
                                            {recentTextComparisons.map((item) => (
                                                <OperationalPreviewCard
                                                    key={item.id}
                                                    variant="whiteCompact"
                                                    title={item.name}
                                                    subtitle={`${item.jobField} · ${item.timestampLabel || '시각 없음'}`}
                                                    titleClassName="text-sm font-black text-slate-900"
                                                    subtitleClassName="mt-0.5 truncate text-[11px] font-bold text-slate-500"
                                                    actions={(
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewRecordById(item.id)}
                                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                                        >
                                                            상세검증 이동
                                                        </button>
                                                    )}
                                                    body={(
                                                        <div className="space-y-2">
                                                            {item.changes.map((change) => (
                                                                <div key={change.field} className="rounded-lg bg-sky-50/60 px-3 py-2 text-[11px]">
                                                                    <p className="font-black text-sky-700">{change.label}</p>
                                                                    <div className="mt-1 grid grid-cols-1 gap-2 lg:grid-cols-2">
                                                                        <div className="rounded-lg bg-white px-3 py-2">
                                                                            <p className="font-black text-rose-700">변경 전</p>
                                                                            <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{change.before}</p>
                                                                        </div>
                                                                        <div className="rounded-lg bg-white px-3 py-2">
                                                                            <p className="font-black text-emerald-700">변경 후</p>
                                                                            <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{change.after}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    footer={item.reason ? <span className="whitespace-pre-wrap break-words">변경 사유: {item.reason}</span> : null}
                                                    footerClassName="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-800 leading-snug"
                                                />
                                            ))}
                                    </SectionPanelCard>
                                )}
                                </CollapsibleSection>
                            </SectionPanelCard>
                        )}
                        <button onClick={handleBatchTextAnalysis} 
                            disabled={isAnalyzing || secondPassTargets.length === 0}
                            className="mt-5 w-full px-5 py-3.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            관리자 수정 반영 2차 AI 재분석
                        </button>
                    </SectionPanelCard>
                </div>
                </CollapsibleSection>
            </div>
                </div>
            </CollapsibleSection>

            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 sm:p-6">
                <CollapsibleSection
                    title="개발자 및 QA 기술 검증 패널 (태깅/오류/조치 지표)"
                    defaultOpen={false}
                    summary={<span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-black text-slate-700 dark:text-slate-200">개발자 모드 전용</span>}
                >
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700">10) 태깅 검증 진행</p>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="rounded-xl border border-white bg-white px-3 py-2">
                                    <p className="text-[10px] font-black text-slate-500">검증 대상</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{existingRecords.length}건</p>
                                </div>
                                <div className="rounded-xl border border-white bg-white px-3 py-2">
                                    <p className="text-[10px] font-black text-slate-500">{BRAND_STATUS_LABELS.attentionPending}</p>
                                    <p className={`mt-1 text-lg font-black ${failedRecords.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{failedRecords.length}건</p>
                                </div>
                                <div className="rounded-xl border border-white bg-white px-3 py-2">
                                    <p className="text-[10px] font-black text-slate-500">2차 재분석 가능</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{secondPassTargets.length}건</p>
                                </div>
                            </div>
                            <p className="mt-2 text-[11px] font-bold text-indigo-700">저신뢰 {lowConfidenceCount}건 · 즉시 조치 카드에서 우선순위 상위 항목을 먼저 처리하세요.</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-700">오류 TOP5 (검증 최우선)</p>
                                <div className="mt-2 space-y-2">
                                    {qualityLoading ? (
                                        <div className="rounded-xl border border-white bg-white px-3 py-2">
                                            <p className="text-[10px] font-bold text-slate-500">데이터 로드 중...</p>
                                        </div>
                                    ) : qualityData?.errorTop && qualityData.errorTop.length > 0 ? (
                                        qualityData.errorTop.slice(0, 5).map((error, idx) => (
                                            <div key={idx} className="rounded-xl border border-white bg-white px-3 py-2">
                                                <p className="text-[10px] font-black text-rose-600">{idx + 1}순위</p>
                                                <p className="mt-0.5 text-xs font-bold text-slate-700">{error.message}</p>
                                                {error.count > 0 && <p className="mt-1 text-[9px] text-slate-600">{error.field} (발생 {error.count}건)</p>}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-xl border border-white bg-white px-3 py-2">
                                            <p className="text-[10px] font-bold text-emerald-700">✓ 오류 없음 - 품질 검증 PASS</p>
                                        </div>
                                    )}
                                </div>
                                <p className="mt-2 text-[10px] font-bold text-rose-700">→ npm run check:judgment-tagging:full 실행 시 자동 갱신됩니다.</p>
                            </div>

                            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">조치 TOP5 (실행순서)</p>
                                <div className="mt-2 space-y-2">
                                    {qualityLoading ? (
                                        <div className="rounded-xl border border-white bg-white px-3 py-2">
                                            <p className="text-[10px] font-bold text-slate-500">데이터 로드 중...</p>
                                        </div>
                                    ) : qualityData?.actionItems && qualityData.actionItems.length > 0 ? (
                                        qualityData.actionItems.slice(0, 5).map((action, idx) => (
                                            <div key={idx} className="rounded-xl border border-white bg-white px-3 py-2">
                                                <p className="text-[10px] font-black text-violet-600">P{action.priority}</p>
                                                <p className="mt-0.5 text-xs font-bold text-slate-700">{action.title}</p>
                                                <p className="mt-1 text-[9px] text-slate-600">{action.action}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-xl border border-white bg-white px-3 py-2">
                                            <p className="text-[10px] font-bold text-slate-700">필수값 누락 우선 보정 후 재검증</p>
                                        </div>
                                    )}
                                </div>
                                <p className="mt-2 text-[10px] font-bold text-violet-700">
                                    → npm run check:judgment-tagging:full 실행 시 자동 갱신됩니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </CollapsibleSection>
            </div>

            {!isAnalyzing && files.length === 0 && !showPostAnalysisCta && !mobileBackGuideMessage && (
                <div
                    data-mobile-proof="sticky-actions"
                    className="fixed left-3 right-3 z-[90] grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur sm:hidden"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}
                    aria-label="모바일 현장 빠른 실행"
                >
                    <button
                        type="button"
                        data-mobile-proof="sticky-scan"
                        onClick={handleOpenMobileCapture}
                        className="min-h-[44px] rounded-xl bg-indigo-600 px-2 py-2 text-[11px] font-black text-white"
                    >
                        촬영
                    </button>
                    <button
                        type="button"
                        data-mobile-proof="sticky-report"
                        onClick={handleOpenMobilePriorityReport}
                        className="min-h-[44px] rounded-xl bg-slate-900 px-2 py-2 text-[11px] font-black text-white"
                    >
                        리포트
                    </button>
                    <button
                        type="button"
                        data-mobile-proof="sticky-tracking"
                        onClick={handleOpenMobileTrackingReview}
                        className="min-h-[44px] rounded-xl bg-emerald-600 px-2 py-2 text-[11px] font-black text-white"
                    >
                        추적
                    </button>
                </div>
            )}

            {mobileBackGuideMessage && (
                <div className="fixed bottom-4 left-1/2 z-[120] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 rounded-2xl border border-slate-200 bg-slate-900/95 px-4 py-3 text-center text-[12px] font-bold text-white shadow-2xl sm:hidden">
                    {mobileBackGuideMessage}
                </div>
            )}

            {files.length > 0 && !isAnalyzing && (
                <div className="fixed bottom-4 left-4 right-4 z-[130] sm:hidden">
                    <button
                        type="button"
                        onClick={handleAnalyze}
                        className="w-full min-h-[48px] rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-2xl transition-colors hover:bg-indigo-500 active:scale-[0.99]"
                    >
                        분석 시작
                    </button>
                </div>
            )}

            {showPostAnalysisCta && onNavigateToPredictive && !isAnalyzing && files.length === 0 && (
                <div className="fixed bottom-4 left-4 right-4 z-[130] sm:hidden flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={onNavigateToPredictive}
                        className="w-full min-h-[48px] rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-2xl transition-colors hover:bg-emerald-500 active:scale-[0.99]"
                    >
                        AI 리스크 분석 결과 보기 →
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowPostAnalysisCta(false)}
                        className="w-full min-h-[44px] rounded-2xl bg-slate-700/80 px-4 py-2 text-xs font-semibold text-slate-200 shadow hover:bg-slate-600"
                    >
                        닫기
                    </button>
                </div>
            )}
        </div>
    );
};
export default OcrAnalysis;
