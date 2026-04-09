
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FileUpload } from '../components/FileUpload';
import { Spinner } from '../components/Spinner';
import { analyzeWorkerRiskAssessment, updateAnalysisBasedOnEdits, getQuotaState, setQuotaExhausted, clearQuotaState, isRateLimitError, validateImageFormat, isFormatCompatibleWithAI } from '../services/geminiService';
import { extractMessage } from '../utils/errorUtils';
import type { WorkerRecord, OcrErrorType, AppSettings } from '../types';
import { fileToBase64 } from '../utils/fileUtils';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import { getApiCallState, incrementApiCallCount, resetApiCallCount, type DailyCounterState } from '../utils/apiCounterUtils';
import { BRAND_ACTION_LABELS, BRAND_STATUS_LABELS } from '../utils/brandLabels';
import { MasterTemplateList, type MasterTemplate } from '../components/shared/MasterTemplateList';
import { MasterAssignment, type MasterAssignmentItem, type MasterGroup } from '../components/shared/MasterAssignment';
import { CollapsibleSection } from '../components/shared/CollapsibleSection';
import { InterpretationCardGrid } from '../components/shared/InterpretationCardGrid';
import { StatusEvidenceActionPanel } from '../components/shared/StatusEvidenceActionPanel';
import { handleSupabasePermissionError, supabase } from '../lib/supabaseClient';

const buildMasterDataLoadErrorMessage = (rawMessage?: string) => {
    const message = String(rawMessage || '알 수 없는 오류');
    return `기록 양식/배정 데이터 조회 실패: ${message}\n\n현재 group 전용 모드입니다. Supabase에 group 뷰/컬럼이 적용되었는지 확인해 주세요.`;
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

const OCR_FAILED_ONLY_DEFAULT_KEY = 'psi_ocr_failed_only_default';
const OCR_VIEW_STATE_KEY = 'psi_ocr_view_state_v1';

type OcrViewState = {
    savedAt: number;
    searchTerm: string;
    filterLevel: string;
    filterField: string;
    filterLeader: string;
    filterTrust: 'all' | 'pending' | 'finalized';
    filterReason: 'all' | 'has-reason' | 'missing-reason' | 'weak-reason';
    filterStatus: 'all' | 'success' | 'failed';
    secondPassEditedOnly: boolean;
    secondPassExcludedOnly: boolean;
    secondPassReasonFilter: string;
    recordSortMode: RecordSortMode;
};

const OCR_VIEW_STATE_TTL_MS = 1000 * 60 * 60 * 24 * 3;

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
        return `AI 미지원 형식입니다. JPG/PNG/WebP/HEIC로 변환 후 다시 등록하세요. (현재: ${formatValidation.detectedFormat})`;
    }

    return null;
};

// [강화된 실패 판단 로직 - 안전성 강화]
const isFailedRecord = (r: WorkerRecord): boolean => {
    if (r.ocrErrorType) return true;

    // 안전 점수가 0일 경우 실패
    if (r.safetyScore === 0) return true;
    
    // AI 분석 결과가 없거나 비어있을 경우 실패
    if (!r.aiInsights || r.aiInsights.trim() === "") return true;
    
    // 이름에서 실패 패턴 확인
    const name = String(r.name || '');
    if (name.includes('할당량 초과') || name.includes('분석 실패') || name.includes('이미지 데이터')) {
        return true;
    }
    
    // AI 분석 결과에서 오류 패턴 확인
    const insight = String(r.aiInsights || '');
    if (insight.includes('API 요청량') || 
        insight.includes('오류 상세') || 
        insight.includes('Resource has been exhausted') || 
        insight.includes('429') ||
        insight.includes('분석 실패') ||
        insight.includes('재시도 필요')) {
        return true;
    }
    
    return false;
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
    safetyScore: '안전 점수',
    safetyLevel: '안전 등급',
    scoreReasoning: '점수 근거',
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

type RecordSortMode = 'recent-correction' | 'score-desc' | 'failed-first' | 'error-type';

const getRecordSortModeLabel = (mode: RecordSortMode): string => {
    switch (mode) {
        case 'score-desc':
            return '점수 높은순';
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
    if (r.safetyScore === 0) return true;

    const insight = String(r.aiInsights || '').toLowerCase();
    return (
        insight.includes('429') ||
        insight.includes('resource_exhausted') ||
        insight.includes('할당량') ||
        insight.includes('분석 실패') ||
        insight.includes('재시도 필요') ||
        insight.includes('원본 이미지 데이터 소실')
    );
};

// 우선순위 점수: 낮을수록 먼저 처리 (0=최고우선)
const getRetryPriorityScore = (r: WorkerRecord): number => {
    if (r.safetyScore === 0 && r.ocrErrorType) return 0; // 완전 실패
    if (r.safetyScore === 0) return 1;                    // 점수 없음
    if (r.ocrErrorType) return 2;                         // OCR 오류
    const insight = String(r.aiInsights || '').toLowerCase();
    if (insight.includes('할당량') || insight.includes('분석 실패') || insight.includes('재시도 필요')) return 3;
    if (typeof r.ocrConfidence === 'number' && r.ocrConfidence < 0.5) return 4; // 신뢰도 극저
    return 5; // 저신뢰
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
    onImport: (records: WorkerRecord[]) => void;
    onViewDetails: (record: WorkerRecord) => void;
    onOpenReport: (record: WorkerRecord) => void;
    onDeleteRecord: (recordId: string) => void;
    onUpdateRecord: (record: WorkerRecord) => void;
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
    onUpdateRecord 
}) => {
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
    const [openMasterSection, setOpenMasterSection] = useState<'templates' | 'assignments' | null>(null);
    const [retryDiagnostics, setRetryDiagnostics] = useState<RetryDiagnostics | null>(null);
    const [showAdvancedOcrControls, setShowAdvancedOcrControls] = useState(false);
    const [showAdminActivityPanel, setShowAdminActivityPanel] = useState(false);
    const [showReasonQaDetailPanel, setShowReasonQaDetailPanel] = useState(false);
    const [showRetryDetailPanel, setShowRetryDetailPanel] = useState(false);
    const [showFailedQuickActions, setShowFailedQuickActions] = useState(false);

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
    }, [fetchMasterAssignments, fetchMasterGroups]);

    useEffect(() => {
        void loadMasterData();
    }, [loadMasterData]);

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
                secondPassEditedOnly,
                secondPassExcludedOnly,
                secondPassReasonFilter,
                recordSortMode,
            };
            localStorage.setItem(OCR_VIEW_STATE_KEY, JSON.stringify(nextState));
        } catch {
            // ignore storage errors
        }
    }, [searchTerm, filterLevel, filterField, filterLeader, filterTrust, filterReason, filterStatus, secondPassEditedOnly, secondPassExcludedOnly, secondPassReasonFilter, recordSortMode]);

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
                alert(`배정 저장 실패: ${result.error.message}`);
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

    const teamLeaders = useMemo(() => {
        const leaders = new Set(existingRecords.map(r => r.teamLeader || '미지정'));
        return Array.from(leaders).sort();
    }, [existingRecords]);

    const jobFields = useMemo(() => {
        const fields = new Set(existingRecords.map(r => r.jobField).filter(Boolean));
        return Array.from(fields).sort();
    }, [existingRecords]);

    const baseFilteredRecords = useMemo(() => {
        return existingRecords.filter(r => {
            const searchStr = `${r.name || ''} ${r.jobField || ''} ${r.nationality || ''} ${r.teamLeader || ''}`.toLowerCase();
            const matchesSearch = searchStr.includes(searchTerm.toLowerCase());
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
            return matchesSearch && matchesLevel && matchesField && matchesLeader && matchesTrust && matchesReason && matchesStatus;
        });
    }, [existingRecords, searchTerm, filterLevel, filterField, filterLeader, filterTrust, filterReason, filterStatus, getReviewTrustState]);

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

    const recordsWithImages = useMemo(() => {
        return existingRecords.filter(r => hasRetryableOriginalImage(r.originalImage) || hasRetryableOriginalImage(r.profileImage));
    }, [existingRecords]);

    const failedRecords = useMemo(() => {
        return existingRecords.filter(r => isFailedRecord(r));
    }, [existingRecords]);

    const secondPassTargets = useMemo(() => {
        return baseFilteredRecords.filter(record => getSecondPassEligibility(record, secondPassEditedOnly).eligible);
    }, [baseFilteredRecords, secondPassEditedOnly]);

    const secondPassPreviewRecords = useMemo(() => {
        return secondPassTargets.slice(0, 5);
    }, [secondPassTargets]);

    const secondPassSkippedSummary = useMemo(() => {
        return Object.entries(secondPassSkippedCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => `${reason} ${count}건`)
            .join(', ');
            }, [secondPassSkippedCounts]);

    const retrySuccessRate = useMemo(() => {
        if (!retryDiagnostics || retryDiagnostics.total === 0) return 0;
        return Math.round((retryDiagnostics.success / retryDiagnostics.total) * 100);
    }, [retryDiagnostics]);

    const retryLastUpdatedLabel = useMemo(() => {
        return formatCompactDateTime(retryDiagnostics?.lastUpdatedAt);
    }, [retryDiagnostics]);

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
                tone: 'border-slate-200 bg-white',
            },
            {
                key: 'evidence',
                eyebrow: '판단 근거',
                title: `수정 ${recentAdminActivitySummary.corrections} · 승인 ${recentAdminActivitySummary.approvals} · 재분석 ${recentAdminActivitySummary.reassessments}`,
                description: '운영 이력은 현장 판단이 어디에 집중됐는지 보여주는 근거입니다. 한쪽만 과도하면 병목을 의심해야 합니다.',
                tone: 'border-indigo-200 bg-indigo-50',
            },
            {
                key: 'action',
                eyebrow: '다음 행동',
                title: '최근 조치와 QA 보완 대상을 함께 보세요',
                description: '운영 조치 요약은 단순 기록보다, 어떤 기록을 먼저 다시 열어야 하는지 정하는 출발점으로 쓰는 편이 좋습니다.',
                tone: 'border-emerald-200 bg-emerald-50',
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
                tone: 'border-amber-200 bg-amber-50',
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
                tone: 'border-indigo-200 bg-indigo-50',
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

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
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
                    tone: 'border-rose-400/20 bg-rose-500/10 text-rose-100',
                }
                : {
                    key: 'current-state',
                    eyebrow: '현재 상태',
                    title: '급한 OCR 보완 건은 안정적입니다',
                    description: lowConfidenceCount > 0
                        ? `다만 저신뢰 기록 ${lowConfidenceCount}건은 현장 설명을 조금 더 보강하면 정확도가 올라갑니다.`
                        : `즉시 다시 볼 OCR 보완 건은 많지 않아 유지 점검 중심으로 운영할 수 있습니다.`,
                    tone: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
                },
            reviewAttentionCount > 0
                ? {
                    key: 'evidence',
                    eyebrow: '판단 근거',
                    title: `검토 사유 보강 ${reviewAttentionCount}건이 남아 있습니다`,
                    description: `승인/검토 사유 없음 ${reasonQaSummary.missingDecision}건, 승인 사유 보강 ${reasonQaSummary.weakDecision}건, 수정 사유 보강 ${reasonQaSummary.weakCorrection}건을 함께 정리해야 추적성이 유지됩니다.`,
                    tone: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
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
                    tone: 'border-indigo-400/20 bg-indigo-500/10 text-indigo-100',
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
                tone: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100',
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
                tone: 'border-rose-200 bg-rose-50',
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
                tone: 'border-amber-200 bg-amber-50',
            },
            {
                key: 'action',
                eyebrow: '다음 행동',
                title: `${BRAND_ACTION_LABELS.smartReanalyze} 후 관리자 판단으로 넘기세요`,
                description: '자동으로 다시 읽을 수 있는 건 먼저 줄이고, 끝까지 남는 기록만 상세 검증으로 보내면 운영 피로가 낮아집니다.',
                tone: 'border-emerald-200 bg-emerald-50',
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
                tone: filteredFailedCount > 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white',
            },
            {
                key: 'evidence',
                eyebrow: '판단 근거',
                title: `재검토 대기 ${filteredPendingCount} · 최종확정 ${filteredFinalizedCount}`,
                description: `현재 정렬은 ${getRecordSortModeLabel(recordSortMode)} 기준입니다. 필터와 정렬 조합이 곧 운영 우선순위를 결정합니다.`,
                tone: 'border-indigo-200 bg-indigo-50',
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
                tone: 'border-emerald-200 bg-emerald-50',
            },
        ];
    }, [filteredRecords, recordSortMode, secondPassTargets.length, getReviewTrustState]);

    const failureProcessingStats = useMemo(() => {
        const resolvedCounts = existingRecords.reduce<Record<string, number>>((acc, record) => {
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
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok || !data?.record) {
            throw new Error(data?.message || '서버 OCR 재분석 실패');
        }

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
            ocrErrorType: undefined,
            ocrErrorMessage: undefined,
        } as WorkerRecord;
    }, [getBestRetryImageSource]);

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
        
        // [Quota State Check] Verify API quota status before batch processing
        const quotaState = getQuotaState();
        if (quotaState.isExhausted) {
            const recoveryTime = Math.ceil((quotaState.nextRetryTime - Date.now()) / 1000);
            if (recoveryTime > 0) {
                const forceRetry = confirm(`⚠️ API 할당량 대기 상태입니다.\n예상 복구: 약 ${recoveryTime}초 후\n\n지금 즉시 다시 확인(대기상태 해제) 하시겠습니까?\n※ 즉시 다시 확인 시 429가 다시 발생할 수 있습니다.`);
                if (!forceRetry) {
                    alert(`복구 대기 중입니다.\n${new Date(quotaState.nextRetryTime).toLocaleTimeString()} 이후 다시 확인을 권장합니다.`);
                    return;
                }
                clearQuotaState();
            }
        }
        
        if (forceReanalyze) {
            console.log(`[강제 재분석] Preflight 검증 스킵, 직접 API 호출 모드`);
        }
        
        setIsAnalyzing(true);
        setProgress(`[${title}] 재분석 준비 중...`);
        setBatchProgress({ current: 0, total });
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
        
        let successCount = 0;
        let failCount = 0;
        let stopped = false;
        let serverSuccessCount = 0;
        let clientFallbackSuccessCount = 0;
        let preflightFailCount = 0;
        let processingFailCount = 0;
        let serverRouteFailCount = 0;
        
        // [Adaptive Throttling State]
        // Start with a 4s buffer. If we hit limits, increase this dynamically.
        let dynamicDelayBuffer = 4;

        // [Priority Queue] 고위험→실패→저신뢰 순으로 정렬
        const processQueue = [...targetRecords].sort((a, b) => getRetryPriorityScore(a) - getRetryPriorityScore(b));

        try {
            for (let i = 0; i < processQueue.length; i++) {
                if (stopRef.current) { stopped = true; break; }
                const record = processQueue[i];
                setBatchProgress(p => ({ ...p, current: i + 1 }));
                setProgress(`[${title}] ${record.name || '미상'} 처리 중...`);
                // 2차 재가공 시작: 상태 IN_PROGRESS
                onUpdateRecord({ ...record, secondPassStatus: 'IN_PROGRESS' });
                try {
                    const retryImageSource = getBestRetryImageSource(record);

                    if (!retryImageSource) {
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: '❌ 원본/대체 이미지 데이터가 없어 재분석할 수 없습니다.',
                            ocrErrorType: 'LAYOUT',
                            ocrErrorMessage: '원본/대체 이미지 데이터 없음',
                            safetyScore: 0,
                            secondPassStatus: 'NEEDED',
                        };
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
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: "❌ 원본 이미지 데이터 소실 (분석 불가)",
                            ocrErrorType: 'LAYOUT',
                            ocrErrorMessage: '원본 이미지 데이터 소실',
                            safetyScore: 0,
                        };
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
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: `❌ 이미지 형식 오류: ${formatValidation.error} (감지: ${formatValidation.detectedFormat})`,
                            ocrErrorType: classifyLegacyOcrErrorType(String(formatValidation.error || '')),
                            ocrErrorMessage: String(formatValidation.error || '이미지 형식 오류'),
                            safetyScore: 0,
                        };
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
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: `⚠️ 지원하지 않는 이미지 형식: ${formatValidation.detectedFormat}`,
                            ocrErrorType: 'QUALITY',
                            ocrErrorMessage: `지원하지 않는 이미지 형식: ${formatValidation.detectedFormat}`,
                            safetyScore: 0,
                        };
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
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: `⚠️ AI 분석 미지원 형식: ${formatValidation.detectedFormat}. JPEG, PNG, GIF, WebP, HEIC 형식만 지원됩니다.`,
                            ocrErrorType: 'QUALITY',
                            ocrErrorMessage: `AI 분석 미지원 형식: ${formatValidation.detectedFormat}`,
                            safetyScore: 0,
                        };
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
                    const MAX_RETRIES = 3; 
                    let usedClientFallback = false;

                    while (retryCount < MAX_RETRIES) {
                        try {
                            const modeLabel = forceReanalyze ? '[강제 모드]' : '';
                            setProgress(`${modeLabel} [${title}] ${record.name || '미상'} 서버 OCR 재분석 요청 중...`);

                            try {
                                apiResult = await requestServerRetryAnalysis(record);
                                usedClientFallback = false;
                            } catch (serverError: any) {
                                const serverMessage = extractMessage(serverError);
                                const shouldFallbackToClient =
                                    serverMessage.toLowerCase().includes('failed to fetch') ||
                                    serverMessage.includes('404') ||
                                    serverMessage.includes('Method Not Allowed');

                                if (!shouldFallbackToClient) {
                                    serverRouteFailCount++;
                                    throw serverError;
                                }

                                const modeLabel = forceReanalyze ? '[강제 모드]' : '';
                                setProgress(`${modeLabel} [${title}] ${record.name || '미상'} 브라우저 OCR 폴백 실행 중...`);
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
                                if ((apiResult.safetyScore === 0 && (insightText.includes('오류') || insightText.includes('실패'))) || insightText.includes('429') || insightText.includes('RESOURCE_EXHAUSTED')) {
                                    throw new Error(insightText || '분석 실패');
                                }
                                break; // Success!
                            }
                        } catch (err: any) {
                            const errMsg = err.message || JSON.stringify(err);
                            
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
                            } else {
                                // Other errors (format, parsing) -> fail immediately
                                throw err; 
                            }
                        }
                    }

                    if (stopRef.current) { stopped = true; break; }

                    if (apiResult) {
                        const previousErrorLabel = isFailedRecord(record) ? getOcrErrorTypeKoreanLabel(getOcrErrorTypeFromRecord(record)) : '기타 오류';
                        const updatedRecord: WorkerRecord = {
                            ...apiResult,
                            id: record.id, 
                            originalImage: record.originalImage || retryImageSource,
                            profileImage: record.profileImage, 
                            filename: record.filename,
                            role: record.role !== 'worker' ? record.role : apiResult.role,
                            isTranslator: record.isTranslator || apiResult.isTranslator,
                            isSignalman: record.isSignalman || apiResult.isSignalman,
                            auditTrail: [
                                ...(record.auditTrail || []),
                                {
                                    stage: 'reassessment',
                                    timestamp: new Date().toISOString(),
                                    actor: 'manager',
                                    note: `OCR 재분석 성공 (${previousErrorLabel}) | ${usedClientFallback ? '브라우저 폴백' : '서버 성공'}`,
                                },
                            ],
                            secondPassStatus: isFailedRecord(apiResult) ? 'NEEDED' : 'DONE',
                        };
                        onUpdateRecord(updatedRecord);

                        if (isFailedRecord(updatedRecord)) {
                            failCount++;
                            processingFailCount++;
                            const next = incrementApiCallCount('fail');
                            setDailyCounter(next);
                        } else {
                            successCount++;
                            if (usedClientFallback) {
                                clientFallbackSuccessCount++;
                            } else {
                                serverSuccessCount++;
                            }
                            const next = incrementApiCallCount('success');
                            setDailyCounter(next);
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

                        // Adaptive Rate Limit Buffer
                        if (i < processQueue.length - 1) {
                            await waitWithCountdown(dynamicDelayBuffer, "다음 분석 대기 (Throttle)");
                        }

                    } else {
                        // Final Failure after retries
                        const errorRecord: WorkerRecord = {
                            ...record,
                            aiInsights: `⛔ 반복적인 API 오류로 ${BRAND_STATUS_LABELS.attention} 안내가 필요합니다. 다시 확인해 주세요.`,
                            ocrErrorType: 'UNKNOWN',
                            ocrErrorMessage: '반복적인 API 오류',
                            secondPassStatus: 'NEEDED',
                        };
                        onUpdateRecord(errorRecord);
                        failCount++;
                        processingFailCount++;
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
                        // Safety cooldown even on fail
                        await waitWithCountdown(2, "오류 복구 중");
                    }

                } catch (err: unknown) {
                    const errMsg = extractMessage(err);
                    if (errMsg === "STOPPED") { stopped = true; break; }
                    console.error("Batch Error:", err);
                    const errorRecord: WorkerRecord = {
                        ...record,
                        aiInsights: `⛔ 시스템 오류: ${errMsg}`,
                        ocrErrorType: classifyLegacyOcrErrorType(errMsg),
                        ocrErrorMessage: errMsg,
                    };
                    onUpdateRecord(errorRecord);
                    failCount++;
                    processingFailCount++;
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
                }
            }
        } catch (globalErr: unknown) {
            const gMsg = extractMessage(globalErr);
            console.error("Global Batch Error:", gMsg);
            alert("일괄 처리 중 예상치 못한 오류가 발생하여 중단되었습니다.");
        } finally {
            setIsAnalyzing(false);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            
            const modeLabel = forceReanalyze ? `[${BRAND_ACTION_LABELS.directReanalyze}]` : '';
            const reasonsReport = `\n[원인 집계]\n- 서버 성공: ${serverSuccessCount}\n- 브라우저 폴백 성공: ${clientFallbackSuccessCount}\n- 사전 검증 실패: ${preflightFailCount}\n- OCR 처리 실패: ${processingFailCount}\n- 서버 라우트 실패: ${serverRouteFailCount}`;
            
            if (stopped) {
                alert(`${modeLabel} 분석이 중단되었습니다.\n(완료: ${successCount}, ${BRAND_STATUS_LABELS.attentionPending}: ${failCount})${reasonsReport}`);
            } else {
                if (forceReanalyze) {
                    alert(`${modeLabel} ${title} 완료.\n\n✅ 완료: ${successCount}\n⚠ ${BRAND_STATUS_LABELS.attentionPending}: ${failCount}${reasonsReport}\n\n※ Preflight 검증 스킵 모드로 실행되었습니다.\n※ ${BRAND_STATUS_LABELS.attentionPending} 건은 '${BRAND_ACTION_LABELS.directReanalyze}' 또는 '${BRAND_ACTION_LABELS.smartReanalyze}' 버튼으로 ${BRAND_ACTION_LABELS.recheck}할 수 있습니다.`);
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
            `- 점수, 등급, 강점/약점, AI 인사이트 갱신`
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
                            const mergedBase: WorkerRecord = {
                                ...record,
                                ...updatedAnalysis,
                                auditTrail: [
                                    ...(record.auditTrail || []),
                                    {
                                        stage: 'reassessment',
                                        timestamp: new Date().toISOString(),
                                        actor: 'manager',
                                        note: buildReassessmentAuditNote(record, updatedAnalysis),
                                    }
                                ],
                                secondPassStatus: isFailedRecord({ ...record, ...updatedAnalysis }) ? 'NEEDED' : 'DONE',
                            };
                            const mergedRecord: WorkerRecord = isFailedRecord(mergedBase)
                                ? mergedBase
                                : {
                                    ...mergedBase,
                                    ocrErrorType: undefined,
                                    ocrErrorMessage: undefined,
                                };
                            onUpdateRecord(mergedRecord);
                            successCount++;
                        } else {
                            onUpdateRecord({ ...record, secondPassStatus: 'NEEDED' });
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
        setSecondPassExcludedOnly(false);
        setSecondPassReasonFilter('all');
        setRecordSortMode('recent-correction');
        setFilterStatus(failedOnlyDefault ? 'failed' : 'all');
    }, [failedOnlyDefault]);

    const handleBatchReanalyze = () => {
        const splitSize = getBatchSplitSize();
        const total = recordsWithImages.length;
        const splitWarning = total > splitSize
            ? `\n\n⚠️ 현재 분할 단위: ${splitSize}건 (설정에서 변경 가능)\n${total}건 중 ${splitSize}건씩 우선순위 순으로 처리됩니다.`
            : '';
        if (confirm(`전체 ${total}건 재분석 하시겠습니까?\n[주의] 무료 티어 한도는 시점/계정 상태에 따라 변동됩니다.${splitWarning}\n\n계속하시겠습니까?`)) {
            // 분할 단위가 total보다 작으면 우선순위 상위 splitSize건만 처리
            const sortedByPriority = [...recordsWithImages].sort((a, b) => getRetryPriorityScore(a) - getRetryPriorityScore(b));
            const batch = total > splitSize ? sortedByPriority.slice(0, splitSize) : sortedByPriority;
            runBatchAnalysis(batch, total > splitSize ? `전체 재분석 (${batch.length}/${total}건 우선 처리)` : "전체 재분석");
        }
    };

    const handleRetryFailed = () => {
        const hardTargets = failedRecords.filter(isHardRetryTarget);
        if (hardTargets.length === 0) {
            alert('다시 확인할 우선 점검 건이 없습니다.\n(점수 미달/저신뢰 건은 개별 검토를 권장합니다.)');
            return;
        }

        if (confirm(`우선 점검 대상 ${hardTargets.length}건만 먼저 다시 확인하시겠습니까?\n(할당량 절약을 위해 저신뢰 경고 건은 제외)`)) {
            runBatchAnalysis(hardTargets, "우선 점검 재분석");
        }
    };

    const handleForceReanalyze = () => {
        if (failedRecords.length === 0) {
            alert(`재분석할 ${BRAND_STATUS_LABELS.attentionPending} 건이 없습니다.`);
            return;
        }

        const confirm_msg = confirm(
            `⚠️ ${BRAND_ACTION_LABELS.directReanalyze} 모드\n\n${BRAND_STATUS_LABELS.attentionPending} 건 ${failedRecords.length}건을 Preflight 검증을 우회하여\n` +
            `직접 Gemini API로 재분석하시겠습니까?\n\n` +
            `※ 유료 API를 사용하므로 재분석 결과가 나올 때까지 비용이 발생합니다.`
        );
        
        if (confirm_msg) {
            runBatchAnalysis(failedRecords, `${BRAND_ACTION_LABELS.directReanalyze} (Preflight 스킵)`, true);
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

        return {
            ...record,
            safetyScore: normalizedScore,
            safetyLevel: getSafetyLevelFromScore(normalizedScore),
            aiInsights: shouldReplaceInsights ? fallbackInsights : insightsRaw,
            ocrErrorType: undefined,
            ocrErrorMessage: undefined,
            auditTrail: [
                ...(record.auditTrail || []),
                {
                    stage: 'validation',
                    timestamp: new Date().toISOString(),
                    actor: 'manager',
                    note: `관리자 수동 정상분류 처리 (${getOcrErrorTypeKoreanLabel(getOcrErrorTypeFromRecord(record))})`,
                },
            ],
        };
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
            `- 최소 안전점수/등급을 보정하여\n` +
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
                            results.push(res[0]);
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
            
            if (results.length > 0) onAnalysisComplete(results);
        } finally {
            setIsAnalyzing(false);
            setFiles([]);
            setProgress('');
            setCooldownTime(0);
            setBatchProgress({ current: 0, total: 0 });
            if(stopped) alert("중단됨");
        }
    };

    const handleExport = () => {
        if(!confirm("경고: 이미지 데이터가 포함된 백업 파일은 용량이 매우 클 수 있습니다.\n계속하시겠습니까?")) return;
        const dataStr = JSON.stringify(existingRecords, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PSI_Backup_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
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

    const extractImportRecords = (payload: unknown): unknown[] => {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];

        const obj = payload as Record<string, unknown>;
        const candidates = [obj.records, obj.workerRecords, obj.data, obj.items];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
        }
        return [];
    };

    const analyzeImportSchema = (records: unknown[]) => {
        const requiredStringFields = ['id', 'name', 'jobField', 'date', 'nationality', 'safetyLevel'];
        const requiredArrayFields = ['strengths', 'weakAreas', 'suggestions'];
        const requiredNumberFields = ['safetyScore'];

        const missingFieldCounts: Record<string, number> = {};
        const typeIssueCounts: Record<string, number> = {};
        const sampleIssues: string[] = [];

        const objectItems = records.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
        let itemsWithIssues = 0;
        let validLikeItems = 0;

        const addCount = (bucket: Record<string, number>, key: string) => {
            bucket[key] = (bucket[key] || 0) + 1;
        };

        objectItems.forEach((item, idx) => {
            const missingFields: string[] = [];
            const typeFields: string[] = [];

            for (const field of requiredStringFields) {
                const val = item[field];
                const valid = typeof val === 'string' && val.trim().length > 0;
                if (!valid) {
                    missingFields.push(field);
                    addCount(missingFieldCounts, field);
                }
            }

            for (const field of requiredArrayFields) {
                const val = item[field];
                if (!Array.isArray(val)) {
                    typeFields.push(`${field}(array)`);
                    addCount(typeIssueCounts, `${field}(array)`);
                }
            }

            for (const field of requiredNumberFields) {
                const val = item[field];
                const validNumber = typeof val === 'number' && Number.isFinite(val);
                if (!validNumber) {
                    typeFields.push(`${field}(number)`);
                    addCount(typeIssueCounts, `${field}(number)`);
                }
            }

            if (missingFields.length > 0 || typeFields.length > 0) {
                itemsWithIssues++;
                if (sampleIssues.length < 8) {
                    sampleIssues.push(`- #${idx + 1}: 누락[${missingFields.join(', ') || '-'}], 타입[${typeFields.join(', ') || '-'}]`);
                }
            } else {
                validLikeItems++;
            }
        });

        const invalidItems = records.length - objectItems.length;
        const problematicItems = invalidItems + itemsWithIssues;

        const sortedMissing = Object.entries(missingFieldCounts).sort((a, b) => b[1] - a[1]);
        const sortedTypes = Object.entries(typeIssueCounts).sort((a, b) => b[1] - a[1]);

        const summary = `검증 완료: 전체 ${records.length}건 / 객체형 ${objectItems.length}건 / 문제 항목 ${problematicItems}건`;
        const details = [
            `총 레코드: ${records.length}`,
            `객체형 레코드: ${objectItems.length}`,
            `구조 자체 오류(객체 아님): ${invalidItems}`,
            `필드 오류 포함 레코드: ${itemsWithIssues}`,
            `기준 필드 충족 레코드: ${validLikeItems}`,
            '',
            '[누락 필드 TOP]',
            ...(sortedMissing.length > 0 ? sortedMissing.map(([k, v]) => `- ${k}: ${v}`) : ['- 없음']),
            '',
            '[타입 불일치 TOP]',
            ...(sortedTypes.length > 0 ? sortedTypes.map(([k, v]) => `- ${k}: ${v}`) : ['- 없음']),
            '',
            '[샘플 오류]',
            ...(sampleIssues.length > 0 ? sampleIssues : ['- 없음'])
        ].join('\n');

        return {
            objectItems,
            problematicItems,
            summary,
            details,
        };
    };

    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (re) => {
            try {
                const data = JSON.parse(re.target?.result as string);
                const records = extractImportRecords(data);
                if (!Array.isArray(records) || records.length === 0) {
                    alert('복구 가능한 근로자 기록을 찾지 못했습니다. (배열 또는 records/workerRecords 키 필요)');
                    return;
                }

                const validation = analyzeImportSchema(records);
                setImportValidationSummary(validation.summary);
                setImportValidationDetails(validation.details);

                if (validation.objectItems.length === 0) {
                    alert('복구 가능한 객체형 근로자 기록이 없습니다. JSON 구조를 확인해주세요.');
                    return;
                }

                onImport(validation.objectItems as WorkerRecord[]);
                alert(`백업 복구 요청 완료\n- 원본: ${records.length}건\n- 복구 대상: ${validation.objectItems.length}건\n- 문제 항목: ${validation.problematicItems}건\n\n상세는 화면의 '복구 파일 스키마 검증 결과'를 확인하세요.`);
            } catch (err) {
                alert('파일 형식이 잘못되었습니다.');
            } finally {
                if (importInputRef.current) importInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Control Panel */}
            <div className="bg-slate-900 rounded-3xl p-5 sm:p-8 shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_380px] gap-6 xl:gap-8 items-start">
                    <div className="min-w-0">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div>
                                <h3 className="text-xl sm:text-2xl font-black mb-2 flex items-center gap-3">
                                    OCR 분석 운영 대시보드
                                    <span className="text-xs bg-indigo-600 px-2 py-1 rounded-md font-bold uppercase tracking-widest">PRO</span>
                                </h3>
                                <p className="text-slate-300 font-medium max-w-3xl leading-relaxed">
                                    PC 화면에서는 <span className="text-indigo-300 font-bold">핵심 현황 → 긴급 조치 → 상세 운영</span> 순으로 바로 판단할 수 있어야 합니다.
                                    {BRAND_STATUS_LABELS.attentionPending} 건, 저신뢰 기록, 재분석 가능 건을 먼저 보고 필요한 조치만 우측에서 바로 실행하도록 구조를 정리했습니다.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-slate-100">재분석 가능 {secondPassTargets.length}건</span>
                                <span className="px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-400/20 text-rose-200">{BRAND_STATUS_LABELS.attentionPending} {failedRecords.length}건</span>
                                <span className="px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/20 text-amber-200">저신뢰 {lowConfidenceCount}건</span>
                            </div>
                        </div>

                        <InterpretationCardGrid
                            items={heroInterpretationCards}
                            className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-3"
                            cardClassName="rounded-2xl border px-4 py-4"
                            eyebrowClassName="text-[10px] font-black uppercase tracking-[0.18em] opacity-80"
                            titleClassName="mt-2 text-base font-black text-white"
                            descriptionClassName="mt-2 text-[12px] font-semibold leading-relaxed text-white/80"
                        />

                        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">총 기록수</p>
                                <p className="mt-2 text-2xl font-black text-indigo-300">{existingRecords.length}</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-400">현재 OCR 운영 대상</p>
                            </div>
                            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-4">
                                <p className="text-[10px] text-rose-300 font-black uppercase tracking-widest">{BRAND_STATUS_LABELS.attentionPending}</p>
                                <p className={`mt-2 text-2xl font-black ${failedRecords.length > 0 ? 'text-rose-300' : 'text-slate-400'}`}>{failedRecords.length}</p>
                                <p className="mt-1 text-[11px] font-bold text-rose-200/80">우선 확인 권장</p>
                            </div>
                            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4">
                                <p className="text-[10px] text-amber-300 font-black uppercase tracking-widest">신뢰도 미달</p>
                                <p className={`mt-2 text-2xl font-black ${lowConfidenceCount > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{lowConfidenceCount}</p>
                                <p className="mt-1 text-[11px] font-bold text-amber-200/80">70% 미만 재검토</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-[10px] text-emerald-300 font-black uppercase tracking-widest">오늘 API 호출</p>
                                        <p className={`mt-2 text-2xl font-black ${dailyCounter.count > 800 ? 'text-rose-300' : dailyCounter.count > 400 ? 'text-amber-300' : 'text-emerald-300'}`}>{dailyCounter.count}</p>
                                    </div>
                                    <button onClick={() => { resetApiCallCount(); setDailyCounter(getApiCallState()); }} className="text-[10px] text-slate-300 hover:text-white underline" title="오늘 카운터 초기화">초기화</button>
                                </div>
                                <p className="mt-1 text-[11px] font-bold text-slate-300">✓{dailyCounter.successCount} · ✗{dailyCounter.failCount}</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 backdrop-blur-sm">
                        <div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">빠른 실행</p>
                            <h4 className="mt-2 text-lg font-black text-white">긴급 조치와 백업을 우측에 분리</h4>
                            <p className="mt-1 text-[12px] font-semibold text-slate-400">PC에서는 버튼이 가로로 흩어지기보다 목적별로 묶여야 판단이 빠릅니다.</p>
                        </div>

                        <div className="mt-4 space-y-3">
                            <div className="rounded-2xl border border-rose-400/15 bg-black/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">{BRAND_STATUS_LABELS.attention} 대응</p>
                                <div className="mt-3 grid grid-cols-1 gap-2.5">
                        {/* Retry Button */}
                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleRetryFailed}
                                className="w-full px-5 py-3 bg-rose-600 hover:bg-rose-700 rounded-2xl font-black text-sm shadow-xl transition-all border border-rose-500 flex items-center justify-center gap-2 group"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                {BRAND_STATUS_LABELS.attentionPending} 건 {BRAND_ACTION_LABELS.smartReanalyze} ({failedRecords.length})
                            </button>
                        )}
                        
                        {/* Force Reanalyze Button */}
                        {failedRecords.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleForceReanalyze}
                                className="w-full px-5 py-3 bg-red-700 hover:bg-red-800 rounded-2xl font-black text-sm shadow-xl transition-all border border-red-600 flex items-center justify-center gap-2 group"
                                title={`Preflight 검증을 우회하고 모든 ${BRAND_STATUS_LABELS.attentionPending} 건을 직접 API로 재분석합니다`}
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
                                </div>
                            </div>

                            <div className="rounded-2xl border border-emerald-400/15 bg-black/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">운영 · 백업</p>
                                <div className="mt-3 grid grid-cols-1 gap-2.5">
                        
                        {recordsWithImages.length > 0 && !isAnalyzing && (
                            <button 
                                onClick={handleBatchReanalyze}
                                className="w-full px-5 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-black text-sm shadow-xl transition-all border border-emerald-500 flex items-center justify-center gap-2 group"
                            >
                                <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2.5}/></svg>
                                전체 일괄 재분석 (OCR)
                            </button>
                        )}
                        
                        <button onClick={() => importInputRef.current?.click()} className="w-full px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl font-black text-sm transition-all">JSON 불러오기</button>
                        <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={(e) => {
                             const file = e.target.files?.[0];
                             if (file) handleImportFile(file);
                        }} />
                        <button onClick={() => { void handleCopyReanalysisSummary(); }} className="w-full px-5 py-3 bg-slate-700 hover:bg-slate-800 rounded-2xl font-black text-sm shadow-xl transition-all">재분석 요약 복사</button>
                        <button onClick={handleExportReanalysisSummary} className="w-full px-5 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-2xl font-black text-sm shadow-xl transition-all">재분석 요약 내보내기</button>
                        <button onClick={handleExport} className="w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-black text-sm shadow-xl transition-all">백업 내보내기</button>
                        <button onClick={onDeleteAll} className="w-full px-5 py-3 bg-rose-600 hover:bg-rose-700 rounded-2xl font-black text-sm shadow-xl transition-all">전체 삭제</button>
                                </div>
                            </div>
                        </div>
                    </div>
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
                                    API Cooling Down... {cooldownTime}s
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

                {retryDiagnostics && (
                    <div className="mt-6 pt-5 border-t border-white/10 animate-fade-in">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">서버 성공</p>
                                <p className="mt-1 text-2xl font-black text-emerald-200">{retryDiagnostics.serverSuccess}</p>
                            </div>
                            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">폴백 성공</p>
                                <p className="mt-1 text-2xl font-black text-cyan-200">{retryDiagnostics.clientFallbackSuccess}</p>
                            </div>
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">사전 검증 실패</p>
                                <p className="mt-1 text-2xl font-black text-amber-200">{retryDiagnostics.preflightFail}</p>
                            </div>
                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">OCR 처리 실패</p>
                                <p className="mt-1 text-2xl font-black text-rose-200">{retryDiagnostics.processingFail}</p>
                            </div>
                            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">서버 라우트 실패</p>
                                <p className="mt-1 text-2xl font-black text-violet-200">{retryDiagnostics.serverRouteFail}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] font-bold text-slate-400">
                            마지막 재분석 집계 · 총 {retryDiagnostics.total}건 / 성공 {retryDiagnostics.success}건 / 실패 {retryDiagnostics.fail}건
                        </p>
                    </div>
                )}

                {importValidationSummary && (
                    <div className="mt-6 pt-5 border-t border-white/10 animate-fade-in">
                        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <h4 className="text-sm sm:text-base font-black text-indigo-300">복구 파일 스키마 검증 결과</h4>
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

            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-6">
                <CollapsibleSection
                    title="기록 양식·공종/팀 배정 관리"
                    summary={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">양식 {masterTemplates.length} · 그룹 {masterGroups.length} · 배정 {masterAssignments.length}</span>}
                >
                    <div className="space-y-5">
                        <div className="flex flex-col gap-1">
                            <p className="text-sm font-bold text-slate-500">기록 양식을 만들고, 공종/팀별로 사용할 양식을 쉽게 지정할 수 있습니다.</p>
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

            {primaryFailedRecord && primaryFailedErrorType && (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 sm:p-6 shadow-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <p className="text-xs font-black text-rose-600 uppercase tracking-widest">OCR 오류 자동 분류</p>
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

            {failedRecords.length > 0 && (
                <div className="bg-white border border-rose-100 rounded-3xl p-5 sm:p-6 shadow-lg">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                            <p className="text-xs font-black text-rose-600 uppercase tracking-widest">{BRAND_STATUS_LABELS.attention} 레코드 해석 뷰</p>
                            <h4 className="text-lg sm:text-xl font-black text-slate-900 mt-1">우선 보호 조치가 필요한 OCR 신호</h4>
                            <p className="text-sm font-bold text-slate-500 mt-2">상위 {failedPreviewRecords.length}건을 상태·근거·다음 행동 순서로 정리해, 무엇부터 다시 읽고 무엇을 관리자 판단으로 넘길지 바로 결정할 수 있게 했습니다.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {failedTypeSummary.map(([label, count]) => (
                                <span key={label} className="px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black">
                                    {label} {count}건
                                </span>
                            ))}
                        </div>
                    </div>

                    <InterpretationCardGrid items={failedQuickDecisionCards} className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3" />

                    {failedTypeGroups.length > 0 && !isAnalyzing && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {failedTypeGroups.map((group) => (
                                <div key={group.type} className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => runBatchAnalysis(group.records, `${group.label} 일괄 재분석`)}
                                        className="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-xs font-black hover:bg-rose-200 border border-rose-200"
                                    >
                                        {group.label} 재분석 {group.count}건
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAdminNormalizeFailedGroup(group.records, group.label)}
                                        className="px-3 py-2 rounded-xl bg-amber-100 text-amber-700 text-xs font-black hover:bg-amber-200 border border-amber-200"
                                    >
                                        {group.label} 정상분류 {group.count}건
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <CollapsibleSection
                        title={`${BRAND_STATUS_LABELS.attention} 상세 조치`}
                        isOpen={showFailedQuickActions}
                        onToggle={() => setShowFailedQuickActions((prev) => !prev)}
                        summary={<span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700">{BRAND_STATUS_LABELS.attention} {failedRecords.length}건 · 유형 {failedTypeGroups.length}개</span>}
                    >
                    {failureProcessingStats.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{BRAND_STATUS_LABELS.attention} 유형별 처리 완료율</p>
                                <span className="text-[10px] font-bold text-slate-500">현재 잔여 + 처리 이력 기준</span>
                            </div>
                            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                                {failureProcessingStats.map((item) => (
                                    <div key={item.label} className="rounded-xl border border-white bg-white px-3 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-black text-slate-900">{item.label}</p>
                                            <span className="text-[10px] font-black text-slate-600">완료율 {item.rate}%</span>
                                        </div>
                                        <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-emerald-400 to-indigo-500" style={{ width: `${item.rate}%` }}></div>
                                        </div>
                                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-bold text-slate-600">
                                            <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">잔여<br/><span className="text-slate-900">{item.openCount}</span></div>
                                            <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">처리<br/><span className="text-emerald-700">{item.resolvedCount}</span></div>
                                            <div className="rounded-lg bg-indigo-50 px-2 py-2 text-center">총계<br/><span className="text-indigo-700">{item.total}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {failedTypeGroups.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{BRAND_STATUS_LABELS.attention} 유형별 담당자 체크리스트</p>
                                <span className="text-[10px] font-bold text-slate-500">유형별 우선 점검 순서</span>
                            </div>
                            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                                {failedTypeGroups.map((group) => (
                                    <div key={group.type} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-black text-slate-900">{group.label}</p>
                                            <span className="text-[10px] font-black text-slate-600">{group.count}건 잔여</span>
                                        </div>
                                        <ul className="mt-2 space-y-1.5 text-[11px] font-semibold text-slate-600">
                                            {getFailureChecklist(group.type).map((item, index) => (
                                                <li key={`${group.type}-${index}`} className="flex items-start gap-2">
                                                    <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white">{index + 1}</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRecordSortMode('error-type')}
                                                className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:bg-slate-100"
                                            >
                                                유형순 정렬
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => runBatchAnalysis(group.records, `${group.label} 일괄 재분석`)}
                                                className="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-xs font-black hover:bg-rose-200"
                                            >
                                                재분석 실행
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
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

                            return (
                                <div key={record.id} className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-slate-900 truncate">{record.name || '이름 없음'}</p>
                                            <p className="mt-1 text-[11px] font-bold text-slate-500 truncate">{record.jobField || '공종 미지정'} · 팀장 {record.teamLeader || '미지정'}</p>
                                        </div>
                                        <span className="shrink-0 px-2 py-1 rounded-full bg-white border border-rose-200 text-[10px] font-black text-rose-700">
                                            {getOcrErrorTypeKoreanLabel(errorType)}
                                        </span>
                                    </div>
                                    <StatusEvidenceActionPanel
                                        className="mt-3 grid grid-cols-1 gap-2"
                                        cardClassName="rounded-xl border px-3 py-3"
                                        titleClassName="mt-1 text-[12px] font-black text-slate-900"
                                        descriptionClassName="mt-1 text-[11px] font-semibold leading-snug text-slate-600"
                                        items={[
                                            {
                                                key: `${record.id}-status`,
                                                eyebrow: '지금 상태',
                                                title: `${getOcrErrorTypeKoreanLabel(errorType)} 신호가 남아 있습니다`,
                                                description: guideMessage,
                                                tone: 'border-white bg-white',
                                                eyebrowClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                                            },
                                            {
                                                key: `${record.id}-evidence`,
                                                eyebrow: '판단 근거',
                                                title: preflightReason ? `사전검증: ${preflightReason}` : '사전검증 경고는 없지만 원문/배치/필기 품질을 다시 확인할 필요가 있습니다.',
                                                tone: 'border-amber-100 bg-amber-50',
                                                eyebrowClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-600',
                                                description: undefined,
                                            },
                                            {
                                                key: `${record.id}-action`,
                                                eyebrow: '다음 행동',
                                                title: actionGuide,
                                                tone: 'border-emerald-100 bg-emerald-50',
                                                eyebrowClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600',
                                                description: undefined,
                                            },
                                        ]}
                                    />
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onViewDetails(record)}
                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                        >
                                            상세 판단 열기
                                        </button>
                                        {hasImage && !isAnalyzing && (
                                            <button
                                                type="button"
                                                onClick={() => runBatchAnalysis([record], '개별 재분석')}
                                                className="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-xs font-black hover:bg-rose-200"
                                            >
                                                원문 다시 읽기
                                            </button>
                                        )}
                                        {!isAnalyzing && (
                                            <button
                                                type="button"
                                                onClick={() => handleAdminNormalizeFailedRecord(record)}
                                                className="px-3 py-2 rounded-xl bg-amber-100 text-amber-700 text-xs font-black hover:bg-amber-200"
                                            >
                                                관리자 판단으로 유지
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </CollapsibleSection>
                </div>
            )}
                            🔄 다시 촬영하기
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col gap-5 no-print">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <h4 className="text-base sm:text-lg font-black text-slate-900">운영 탐색 및 우선순위 정리</h4>
                        <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-500">검색·필터·정렬을 통해 지금 봐야 할 보호 신호와 재평가 대상을 한 번에 정리합니다.</p>
                        <div className="relative w-full mt-4 max-w-2xl">
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth={2}/></svg>
                            <input type="text" placeholder="근로자명 · 공종 · 국적 · 팀장으로 검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full lg:w-auto">
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">조회 결과</p>
                            <p className="mt-1 text-lg font-black text-slate-900">{filteredRecords.length}</p>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">재분석 가능</p>
                            <p className="mt-1 text-lg font-black text-emerald-700">{secondPassTargets.length}</p>
                        </div>
                        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-3 py-2">
                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">{BRAND_STATUS_LABELS.attentionPending}</p>
                            <p className="mt-1 text-lg font-black text-rose-700">{filteredRecords.filter(r => isFailedRecord(r)).length}</p>
                        </div>
                        <div className="rounded-2xl bg-violet-50 border border-violet-200 px-3 py-2">
                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">제외 사유</p>
                            <p className="mt-1 text-[11px] font-black text-violet-700 leading-snug">{secondPassSkippedSummary || '없음'}</p>
                        </div>
                    </div>
                </div>

                <InterpretationCardGrid items={filteredInterpretationCards} />

                {recentAdminActivities.length > 0 && (
                    <CollapsibleSection
                        title="최근 24시간 운영 조치 요약"
                        isOpen={showAdminActivityPanel}
                        onToggle={() => setShowAdminActivityPanel((prev) => !prev)}
                        summary={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">수정 {recentAdminActivitySummary.corrections} · 승인 {recentAdminActivitySummary.approvals} · 재분석 {recentAdminActivitySummary.reassessments}</span>}
                    >
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <InterpretationCardGrid items={adminActivityInsightCards} className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-4" />
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">관리자 조치 이력</p>
                                <h5 className="mt-2 text-base font-black text-slate-900">최근 24시간 운영 조치 요약</h5>
                                <p className="mt-1 text-[12px] font-semibold text-slate-500">수정, 승인/반려, 2차 재분석 이력을 한 번에 확인할 수 있습니다.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                <span className="px-3 py-1.5 rounded-full bg-violet-100 text-violet-700">수정 {recentAdminActivitySummary.corrections}</span>
                                <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">검토/승인 {recentAdminActivitySummary.approvals}</span>
                                <span className="px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-700">재분석 {recentAdminActivitySummary.reassessments}</span>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {recentAdminActivities.map((activity) => (
                                <div key={activity.key} className="rounded-xl border border-white bg-white px-3 py-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-slate-900 truncate">{activity.name}</p>
                                            <p className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{activity.jobField} · {activity.timestampLabel || '시각 없음'}</p>
                                        </div>
                                        <span className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-black ${activity.type === '수정' ? 'bg-violet-100 text-violet-700' : activity.type === '재분석' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {activity.type}
                                        </span>
                                    </div>
                                    <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">판단 근거</p>
                                        <p className="mt-1 text-[11px] font-semibold text-slate-600 leading-snug whitespace-pre-wrap break-words">{activity.summary}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    </CollapsibleSection>
                )}

                {reasonQaPreviewRecords.length > 0 && (
                    <div className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50 to-white px-4 py-4 shadow-sm">
                        <InterpretationCardGrid items={reasonQaInsightCards} className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-4" />
                        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-black text-rose-600 uppercase tracking-[0.2em]">운영 보완 필요</p>
                                <h5 className="mt-2 text-base font-black text-slate-900">승인/검토 사유가 미흡한 기록이 남아 있습니다.</h5>
                                <p className="mt-1 text-[12px] font-semibold text-slate-600 leading-relaxed">
                                    사유 없음 {reasonQaSummary.missingDecision}건, 승인사유 보강 필요 {reasonQaSummary.weakDecision}건, 수정사유 보강 필요 {reasonQaSummary.weakCorrection}건을 우선 점검해 주세요.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {reasonQaPreviewRecords.find((record) => record.missingDecisionReason) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFilterReason('missing-reason');
                                            handleViewRecordById(reasonQaPreviewRecords.find((record) => record.missingDecisionReason)?.id || '');
                                        }}
                                        className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700"
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
                                        className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-black hover:bg-amber-600"
                                    >
                                        승인사유 보강 이동
                                    </button>
                                )}
                                {reasonQaPreviewRecords.find((record) => record.weakCorrection) && (
                                    <button
                                        type="button"
                                        onClick={() => handleViewRecordById(reasonQaPreviewRecords.find((record) => record.weakCorrection)?.id || '')}
                                        className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-black hover:bg-violet-700"
                                    >
                                        수정사유 보강 이동
                                    </button>
                                )}
                            </div>
                        </div>
                        {reasonInputPrompt && (
                            <div className="mt-4 rounded-2xl border border-white bg-white/80 px-4 py-3">
                                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-black text-rose-600 uppercase tracking-wider">사유 입력 가이드</p>
                                        <p className="mt-1 text-sm font-black text-slate-900">{reasonInputPrompt.name} · {reasonInputPrompt.focus}</p>
                                        <p className="mt-2 text-[12px] font-semibold text-slate-600 leading-relaxed">
                                            짧은 문구 대신 검토 근거, 확인 범위, 반영 내용을 포함해 남기면 추적성과 QA 품질이 좋아집니다.
                                        </p>
                                        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
                                            <p className="text-[11px] font-black text-slate-500">권장 입력 예시</p>
                                            <p className="mt-1 text-[12px] font-semibold text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{reasonInputPrompt.sample}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleViewRecordById(reasonInputPrompt.id)}
                                            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black"
                                        >
                                            해당 기록 바로 열기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFilterReason(reasonQaSummary.missingDecision > 0 ? 'missing-reason' : 'weak-reason')}
                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:bg-slate-50"
                                        >
                                            관련 항목만 보기
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {reasonQaPreviewRecords.length > 0 && (
                    <CollapsibleSection
                        title="사유 품질 QA 상세"
                        isOpen={showReasonQaDetailPanel}
                        onToggle={() => setShowReasonQaDetailPanel((prev) => !prev)}
                        summary={<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">사유 없음 {reasonQaSummary.missingDecision} · 보강 필요 {reasonQaSummary.weakDecision + reasonQaSummary.weakCorrection}</span>}
                    >
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-black text-amber-600 uppercase tracking-[0.2em]">사유 품질 QA</p>
                                <h5 className="mt-2 text-base font-black text-slate-900">보강이 필요한 승인/수정 사유</h5>
                                <p className="mt-1 text-[12px] font-semibold text-slate-600">사유 누락, 너무 짧은 승인/검토 문구, 약한 수정 사유를 한 번에 점검합니다.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                <button type="button" onClick={() => setFilterReason('missing-reason')} className="px-3 py-1.5 rounded-full bg-white border border-amber-200 text-amber-700 hover:bg-amber-100">사유 없음 {reasonQaSummary.missingDecision}</button>
                                <button type="button" onClick={() => setFilterReason('weak-reason')} className="px-3 py-1.5 rounded-full bg-white border border-amber-200 text-amber-700 hover:bg-amber-100">사유 보강 필요 {reasonQaSummary.weakDecision}</button>
                                <span className="px-3 py-1.5 rounded-full bg-white border border-amber-200 text-amber-700">수정 사유 보강 {reasonQaSummary.weakCorrection}</span>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {reasonQaPreviewRecords.map((record) => (
                                <div key={record.id} className="rounded-xl border border-white bg-white px-3 py-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-slate-900 truncate">{record.name}</p>
                                            <p className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{record.jobField}</p>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-1">
                                            {record.missingDecisionReason && <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black">사유 없음</span>}
                                            {record.weakDecisionReason && <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">승인사유 약함</span>}
                                            {record.weakCorrection && <span className="px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black">수정사유 약함</span>}
                                        </div>
                                    </div>
                                    <StatusEvidenceActionPanel
                                        className="mt-2 space-y-2 text-[11px]"
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
                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                        >
                                            상세 판단 이동
                                        </button>
                                        {record.missingDecisionReason && (
                                            <button
                                                type="button"
                                                onClick={() => setFilterReason('missing-reason')}
                                                className="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-xs font-black hover:bg-rose-200"
                                            >
                                                사유 없음만 보기
                                            </button>
                                        )}
                                        {record.weakDecisionReason && (
                                            <button
                                                type="button"
                                                onClick={() => setFilterReason('weak-reason')}
                                                className="px-3 py-2 rounded-xl bg-amber-100 text-amber-700 text-xs font-black hover:bg-amber-200"
                                            >
                                                사유 보강 필요만 보기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    </CollapsibleSection>
                )}

                <CollapsibleSection
                    title="고급 필터 · 정렬 · 2차 재분석 설정"
                    isOpen={showAdvancedOcrControls}
                    onToggle={() => setShowAdvancedOcrControls((prev) => !prev)}
                    summary={<span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700">필터 {filterField !== 'all' || filterLeader !== 'all' || filterTrust !== 'all' || filterLevel !== 'all' || filterStatus !== 'all' || filterReason !== 'all' ? '적용 중' : '기본값'} · 재분석 {secondPassTargets.length}건</span>}
                >
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">공종</label>
                                <select value={filterField} onChange={(e) => setFilterField(e.target.value)} className="mt-2 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    {jobFields.map(field => (
                                        <option key={field} value={field}>{field}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">팀장</label>
                                <select value={filterLeader} onChange={(e) => setFilterLeader(e.target.value)} className="mt-2 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    {teamLeaders.map(leader => (
                                        <option key={leader} value={leader}>{leader}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">신뢰 상태</label>
                                <select value={filterTrust} onChange={(e) => setFilterTrust(e.target.value as 'all' | 'pending' | 'finalized')} className="mt-2 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="pending">재검토 대기</option>
                                    <option value="finalized">최종확정</option>
                                </select>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">등급</label>
                                <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="mt-2 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="고급">고급</option>
                                    <option value="중급">중급</option>
                                    <option value="초급">초급</option>
                                </select>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">OCR 결과</label>
                                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | 'success' | 'failed')} className="mt-2 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="success">성공</option>
                                    <option value="failed">{BRAND_STATUS_LABELS.attentionPending}</option>
                                </select>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">승인/검토 사유</label>
                                <select value={filterReason} onChange={(e) => setFilterReason(e.target.value as 'all' | 'has-reason' | 'missing-reason' | 'weak-reason')} className="mt-2 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold">
                                    <option value="all">전체</option>
                                    <option value="has-reason">사유 있음</option>
                                    <option value="missing-reason">사유 없음</option>
                                    <option value="weak-reason">사유 보강 필요</option>
                                </select>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 flex flex-col justify-between">
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
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">정렬</label>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full sm:w-auto">
                                    <button type="button" onClick={() => setRecordSortMode('recent-correction')} className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${recordSortMode === 'recent-correction' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>최근 수정순</button>
                                    <button type="button" onClick={() => setRecordSortMode('score-desc')} className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${recordSortMode === 'score-desc' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>점수 높은순</button>
                                    <button type="button" onClick={() => setRecordSortMode('failed-first')} className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${recordSortMode === 'failed-first' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>우선 {BRAND_STATUS_LABELS.attention}</button>
                                    <button type="button" onClick={() => setRecordSortMode('error-type')} className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${recordSortMode === 'error-type' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{BRAND_STATUS_LABELS.attention} 유형순</button>
                                </div>
                            </div>
                            <p className="mt-2 text-[11px] font-bold text-slate-500">현재 정렬: {getRecordSortModeLabel(recordSortMode)}</p>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 sm:p-5 shadow-sm">
                        <p className="text-[11px] font-black text-violet-500 uppercase tracking-[0.2em]">2차 AI 재분석</p>
                        <h5 className="mt-2 text-lg font-black text-slate-900">관리자 수정본 기준 재평가</h5>
                        <p className="mt-2 text-sm font-semibold text-slate-600 leading-relaxed">
                            현재 필터 기준으로 OCR 성공 기록만 선별해 점수, 등급, 강점/약점, AI 인사이트를 다시 계산합니다.
                        </p>
                        <ul className="mt-4 space-y-2 text-[12px] font-bold text-slate-600">
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
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSecondPassExcludedOnly(false);
                                    setSecondPassReasonFilter('all');
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${!secondPassExcludedOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                            >
                                전체 보기
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSecondPassExcludedOnly(true);
                                    setSecondPassReasonFilter('all');
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${secondPassExcludedOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                            >
                                제외 건만 보기
                            </button>
                        </div>
                        {Object.keys(secondPassSkippedCounts).length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {Object.entries(secondPassSkippedCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([reason, count]) => (
                                        <button
                                            key={reason}
                                            type="button"
                                            onClick={() => {
                                                setSecondPassExcludedOnly(true);
                                                setSecondPassReasonFilter(current => current === reason ? 'all' : reason);
                                            }}
                                            className={`px-2.5 py-1 rounded-full border text-[11px] font-black transition-all ${secondPassReasonFilter === reason ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-violet-200 text-violet-700 hover:bg-violet-50'}`}
                                        >
                                            {reason} · {count}건
                                        </button>
                                    ))}
                                {secondPassReasonFilter !== 'all' && (
                                    <button
                                        type="button"
                                        onClick={() => setSecondPassReasonFilter('all')}
                                        className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-black hover:bg-slate-200 transition-all"
                                    >
                                        사유 필터 해제
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="mt-4 rounded-2xl border border-violet-200 bg-white/80 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-black text-violet-600 uppercase tracking-wider">대상 미리보기</p>
                                <span className="text-[11px] font-bold text-slate-500">상위 {secondPassPreviewRecords.length}건</span>
                            </div>
                            <div className="mt-3 space-y-2">
                                {secondPassPreviewRecords.length > 0 ? secondPassPreviewRecords.map((record) => (
                                    <div key={record.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-black text-slate-900 truncate">{record.name || '이름 없음'}</p>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${getSafetyLevelClass(record.safetyLevel)}`}>{record.safetyScore}점</span>
                                        </div>
                                        <p className="mt-1 text-[11px] font-bold text-slate-500 truncate">{record.jobField} · 팀장 {record.teamLeader || '미지정'}</p>
                                        {getLatestCorrectionPreview(record) && (
                                            <p className="mt-1 text-[10px] font-black text-violet-700 leading-snug truncate">최근 수정: {getLatestCorrectionPreview(record)}</p>
                                        )}
                                        {getLatestCorrectionReason(record) && (
                                            <p className="mt-1 text-[10px] font-semibold text-slate-600 leading-snug whitespace-pre-wrap break-words">사유 전문: {getLatestCorrectionReason(record)}</p>
                                        )}
                                    </div>
                                )) : (
                                    <p className="text-[11px] font-bold text-slate-500">조건에 맞는 2차 재분석 대상이 없습니다.</p>
                                )}
                            </div>
                        </div>
                        {retryDiagnostics && (
                            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">최근 재분석 결과</p>
                                    <span className="text-[11px] font-black text-emerald-700">성공률 {retrySuccessRate}%</span>
                                </div>
                                {retryLastUpdatedLabel && (
                                    <p className="mt-1 text-[11px] font-bold text-emerald-800/80">마지막 집계: {retryLastUpdatedLabel}</p>
                                )}
                                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                    <div className="rounded-xl bg-white border border-emerald-100 px-2 py-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase">총 대상</p>
                                        <p className="mt-1 text-lg font-black text-slate-900">{retryDiagnostics.total}</p>
                                    </div>
                                    <div className="rounded-xl bg-white border border-emerald-100 px-2 py-2">
                                        <p className="text-[10px] font-black text-emerald-500 uppercase">성공</p>
                                        <p className="mt-1 text-lg font-black text-emerald-700">{retryDiagnostics.success}</p>
                                    </div>
                                    <div className="rounded-xl bg-white border border-rose-100 px-2 py-2">
                                        <p className="text-[10px] font-black text-rose-400 uppercase">{BRAND_STATUS_LABELS.attention}</p>
                                        <p className="mt-1 text-lg font-black text-rose-700">{retryDiagnostics.fail}</p>
                                    </div>
                                    <div className="rounded-xl bg-white border border-amber-100 px-2 py-2">
                                        <p className="text-[10px] font-black text-amber-500 uppercase">사전 확인 필요</p>
                                        <p className="mt-1 text-lg font-black text-amber-700">{retryDiagnostics.preflightFail}</p>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-bold text-slate-600">
                                    <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2">서버 성공: <span className="text-slate-900">{retryDiagnostics.serverSuccess}</span></div>
                                    <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2">브라우저 폴백: <span className="text-slate-900">{retryDiagnostics.clientFallbackSuccess}</span></div>
                                    <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2">처리 확인 필요: <span className="text-slate-900">{retryDiagnostics.processingFail}</span></div>
                                    <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2">라우트 확인 필요: <span className="text-slate-900">{retryDiagnostics.serverRouteFail}</span></div>
                                </div>
                                <CollapsibleSection
                                    title="재분석 상세 비교"
                                    isOpen={showRetryDetailPanel}
                                    onToggle={() => setShowRetryDetailPanel((prev) => !prev)}
                                    summary={<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">점수변화 {recentReassessmentImpact.length} · 인사이트 {recentInsightComparisons.length} · 텍스트 {recentTextComparisons.length}</span>}
                                >
                                <div className="mt-3 rounded-2xl border border-white/70 bg-white/70 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{BRAND_STATUS_LABELS.attention} 대응 가이드</p>
                                        <span className="text-[10px] font-bold text-slate-500">{BRAND_STATUS_LABELS.attention} 유형 기준</span>
                                    </div>
                                    <div className="mt-2 space-y-2">
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
                                            <p className="text-[11px] font-bold text-emerald-700">현재 집계 기준으로 별도 {BRAND_STATUS_LABELS.attention} 대응이 필요한 항목이 없습니다.</p>
                                        )}
                                    </div>
                                </div>
                                {recentReassessmentImpact.length > 0 && (
                                    <div className="mt-3 rounded-2xl border border-indigo-100 bg-white/80 p-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div>
                                                <p className="text-[11px] font-black text-indigo-700 uppercase tracking-wider">재분석 점수 변화</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">최근 재분석된 기록의 점수/등급 변화를 빠르게 확인합니다.</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-[10px] font-black">
                                                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">상승 {recentReassessmentDeltaSummary.up}</span>
                                                <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700">하락 {recentReassessmentDeltaSummary.down}</span>
                                                <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">유지 {recentReassessmentDeltaSummary.same}</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            {recentReassessmentImpact.map((item) => (
                                                <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-900 truncate">{item.name}</p>
                                                            <p className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{item.jobField} · {item.timestampLabel || '시각 없음'}</p>
                                                        </div>
                                                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black ${item.delta > 0 ? 'bg-emerald-100 text-emerald-700' : item.delta < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {item.delta > 0 ? `+${item.delta}` : item.delta}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-bold">
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
                                        </div>
                                    </div>
                                )}
                                {recentInsightComparisons.length > 0 && (
                                    <div className="mt-3 rounded-2xl border border-cyan-100 bg-white/80 p-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div>
                                                <p className="text-[11px] font-black text-cyan-700 uppercase tracking-wider">AI 인사이트 전후 비교</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">최근 수정/재분석에서 바뀐 인사이트 문구를 전후로 비교합니다.</p>
                                            </div>
                                            <span className="text-[10px] font-black text-cyan-700">최근 {recentInsightComparisons.length}건</span>
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            {recentInsightComparisons.map((item) => (
                                                <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-900 truncate">{item.name}</p>
                                                            <p className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{item.jobField} · {item.timestampLabel || '시각 없음'}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewRecordById(item.id)}
                                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                                        >
                                                            상세검증 이동
                                                        </button>
                                                    </div>
                                                    <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-2 text-[11px]">
                                                        <div className="rounded-lg bg-rose-50 px-3 py-2">
                                                            <p className="font-black text-rose-700">변경 전</p>
                                                            <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{item.beforeInsight || '기존 인사이트 없음'}</p>
                                                        </div>
                                                        <div className="rounded-lg bg-emerald-50 px-3 py-2">
                                                            <p className="font-black text-emerald-700">변경 후</p>
                                                            <p className="mt-1 font-semibold text-slate-700 leading-snug whitespace-pre-wrap break-words">{item.afterInsight || '변경 후 인사이트 없음'}</p>
                                                        </div>
                                                    </div>
                                                    {item.reason && (
                                                        <div className="mt-2 rounded-lg bg-cyan-50 px-3 py-2 text-[11px] font-semibold text-cyan-800 leading-snug whitespace-pre-wrap break-words">
                                                            변경 사유: {item.reason}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {recentContentComparisons.length > 0 && (
                                    <div className="mt-3 rounded-2xl border border-fuchsia-100 bg-white/80 p-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div>
                                                <p className="text-[11px] font-black text-fuchsia-700 uppercase tracking-wider">강점/약점·근거 비교</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">최근 수정/재분석에서 바뀐 핵심 평가 내용을 전후로 비교합니다.</p>
                                            </div>
                                            <span className="text-[10px] font-black text-fuchsia-700">최근 {recentContentComparisons.length}건</span>
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            {recentContentComparisons.map((item) => (
                                                <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-900 truncate">{item.name}</p>
                                                            <p className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{item.jobField} · {item.timestampLabel || '시각 없음'}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewRecordById(item.id)}
                                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                                        >
                                                            상세검증 이동
                                                        </button>
                                                    </div>
                                                    <div className="mt-2 space-y-2">
                                                        {item.changes.map((change) => (
                                                            <div key={change.field} className="rounded-lg bg-fuchsia-50/60 px-3 py-2 text-[11px]">
                                                                <p className="font-black text-fuchsia-700">{change.label}</p>
                                                                <div className="mt-1 grid grid-cols-1 lg:grid-cols-2 gap-2">
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
                                                    {item.reason && (
                                                        <div className="mt-2 rounded-lg bg-fuchsia-50 px-3 py-2 text-[11px] font-semibold text-fuchsia-800 leading-snug whitespace-pre-wrap break-words">
                                                            변경 사유: {item.reason}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {recentTextComparisons.length > 0 && (
                                    <div className="mt-3 rounded-2xl border border-sky-100 bg-white/80 p-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div>
                                                <p className="text-[11px] font-black text-sky-700 uppercase tracking-wider">OCR 원문/번역 비교</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-500">최근 수정으로 달라진 OCR 원문과 한글 번역을 전후 비교합니다.</p>
                                            </div>
                                            <span className="text-[10px] font-black text-sky-700">최근 {recentTextComparisons.length}건</span>
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            {recentTextComparisons.map((item) => (
                                                <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-900 truncate">{item.name}</p>
                                                            <p className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{item.jobField} · {item.timestampLabel || '시각 없음'}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewRecordById(item.id)}
                                                            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 text-xs font-black hover:bg-indigo-50"
                                                        >
                                                            상세검증 이동
                                                        </button>
                                                    </div>
                                                    <div className="mt-2 space-y-2">
                                                        {item.changes.map((change) => (
                                                            <div key={change.field} className="rounded-lg bg-sky-50/60 px-3 py-2 text-[11px]">
                                                                <p className="font-black text-sky-700">{change.label}</p>
                                                                <div className="mt-1 grid grid-cols-1 lg:grid-cols-2 gap-2">
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
                                                    {item.reason && (
                                                        <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-800 leading-snug whitespace-pre-wrap break-words">
                                                            변경 사유: {item.reason}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                </CollapsibleSection>
                            </div>
                        )}
                        <button onClick={handleBatchTextAnalysis} 
                            disabled={isAnalyzing || secondPassTargets.length === 0}
                            className="mt-5 w-full px-5 py-3.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            관리자 수정 반영 2차 AI 재분석
                        </button>
                    </div>
                </div>
                </CollapsibleSection>
            </div>

            {/* 공종/팀장 일괄 수정 UI */}
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden mb-4">
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-stretch sm:items-center p-4 border-b border-slate-100">
                    <span className="font-bold text-slate-700 text-xs mr-2">근로자 일괄 선택</span>
                    <button
                        className="px-3 py-1 text-xs rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold hover:bg-indigo-100"
                        onClick={() => setSelectedIds(filteredRecords.map(r => r.id))}
                    >전체 선택</button>
                    <button
                        className="px-3 py-1 text-xs rounded bg-slate-50 text-slate-500 border border-slate-200 font-bold hover:bg-slate-100"
                        onClick={() => setSelectedIds([])}
                    >전체 해제</button>
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
                            filteredRecords.forEach(r => {
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
                <div className="sm:hidden p-3 space-y-3">
                    {filteredRecords.map((r: WorkerRecord) => {
                        const checked = selectedIds.includes(r.id);
                        const failed = isFailedRecord(r);
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
                            ? `${getOcrErrorTypeKoreanLabel(rowErrorType || 'UNKNOWN')} 신호가 남아 있습니다.`
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
                                        <p className="text-[11px] font-black text-rose-700">⚠️ {getOcrErrorTypeKoreanLabel(rowErrorType)}</p>
                                        {rowGuideMessage && <p className="text-[11px] font-bold text-rose-600">{rowGuideMobile}</p>}
                                        {preflightReason && <p className="text-[11px] font-bold text-amber-700">사전검증: {preflightReason}</p>}
                                    </div>
                                )}

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
                                            tone: 'border-slate-200 bg-slate-50',
                                            eyebrowClassName: 'font-black text-slate-400 uppercase tracking-[0.18em]',
                                            description: undefined,
                                        },
                                        {
                                            key: `${r.id}-row-evidence`,
                                            eyebrow: '판단 근거',
                                            title: rowEvidenceSummary,
                                            tone: 'border-amber-100 bg-amber-50',
                                            eyebrowClassName: 'font-black text-amber-600 uppercase tracking-[0.18em]',
                                            description: undefined,
                                        },
                                        {
                                            key: `${r.id}-row-action`,
                                            eyebrow: '다음 행동',
                                            title: rowNextAction,
                                            tone: 'border-emerald-100 bg-emerald-50',
                                            eyebrowClassName: 'font-black text-emerald-600 uppercase tracking-[0.18em]',
                                            description: undefined,
                                        },
                                    ]}
                                />

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); onViewDetails(r); }} className="px-3 py-2 bg-white border border-slate-200 text-indigo-600 font-black text-xs rounded-xl">상세 판단</button>
                                    <button onClick={(e) => { e.stopPropagation(); onOpenReport(r); }} className="px-3 py-2 bg-slate-900 text-white font-black text-xs rounded-xl">보호 리포트</button>
                                    {failed && !isAnalyzing && hasImage && (
                                        <button onClick={(e) => { e.stopPropagation(); runBatchAnalysis([r], '개별 재분석'); }} className="col-span-2 px-3 py-2 bg-rose-100 text-rose-600 font-bold text-xs rounded-xl">원문 다시 읽기</button>
                                    )}
                                    {failed && !isAnalyzing && (
                                        <button onClick={(e) => { e.stopPropagation(); handleAdminNormalizeFailedRecord(r); }} className="col-span-2 px-3 py-2 bg-amber-100 text-amber-700 font-bold text-xs rounded-xl" title={`${BRAND_STATUS_LABELS.attention} 안내가 필요한 건을 관리자 검토 후 정상 흐름으로 전환`}>관리자 판단으로 유지</button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); onDeleteRecord(r.id); }} className="col-span-2 px-3 py-2 bg-slate-100 text-slate-500 font-bold text-xs rounded-xl">삭제</button>
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
                                <th className="px-4 sm:px-8 py-4 text-center">안전 점수</th>
                                <th className="px-4 sm:px-8 py-4 text-center">이미지 상태</th>
                                <th className="px-4 sm:px-8 py-4 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-medium">
                            {/* 선택 체크박스 컬럼 추가 */}
                            {filteredRecords.map((r: WorkerRecord) => {
                                const checked = selectedIds.includes(r.id);
                                const isManager = isManagementRole(r.jobField);
                                const hasImage = hasRetryableOriginalImage(r.originalImage) || hasRetryableOriginalImage(r.profileImage);
                                const failed = isFailedRecord(r);
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
                                const preflightReason = failed ? getPreflightFailureReason(r) : null;
                                const reviewTrustState = getReviewTrustState(r);
                                const rowStatusSummary = failed
                                    ? `${getOcrErrorTypeKoreanLabel(rowErrorType || 'UNKNOWN')} 신호가 남아 있습니다.`
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
                                                        {getOcrErrorTypeKoreanLabel(rowErrorType)}
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
                                                <div className="mt-2 grid grid-cols-1 gap-1.5 text-[10px] font-semibold">
                                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700">
                                                        <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">지금 상태</span>
                                                        <span className="mt-0.5 block leading-snug">{rowStatusSummary}</span>
                                                    </div>
                                                    <div className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-2 text-amber-800">
                                                        <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-amber-600">판단 근거</span>
                                                        <span className="mt-0.5 block leading-snug whitespace-pre-wrap break-words">{rowEvidenceSummary}</span>
                                                    </div>
                                                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-2 text-emerald-800">
                                                        <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600">다음 행동</span>
                                                        <span className="mt-0.5 block leading-snug">{rowNextAction}</span>
                                                    </div>
                                                </div>
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
                                            <div className="flex justify-end gap-2">
                                                {failed && !isAnalyzing && hasImage && (
                                                    <button onClick={(e) => { e.stopPropagation(); runBatchAnalysis([r], '개별 재분석'); }} className="px-3 py-2 bg-rose-100 text-rose-600 font-bold text-xs rounded-xl hover:bg-rose-200 transition-all">
                                                        원문 다시 읽기
                                                    </button>
                                                )}
                                                {failed && !isAnalyzing && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleAdminNormalizeFailedRecord(r); }} className="px-3 py-2 bg-amber-100 text-amber-700 font-bold text-xs rounded-xl hover:bg-amber-200 transition-all" title="다시 확인이 어려운 건을 관리자 확인 후 정상 분류">
                                                        관리자 판단으로 유지
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); onViewDetails(r); }} className="px-4 py-2 bg-white border border-slate-200 text-indigo-600 font-black text-xs rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm">상세 판단 바로가기</button>
                                                <button onClick={(e) => { e.stopPropagation(); onOpenReport(r); }} className="px-4 py-2 bg-slate-900 text-white font-black text-xs rounded-xl hover:bg-black transition-all shadow-sm">보호 리포트 바로가기</button>
                                                <button onClick={(e) => { e.stopPropagation(); onDeleteRecord(r.id); }} className="p-2 bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all" title="삭제">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="new-ocr-capture-section" className="bg-white p-5 sm:p-10 rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">신규 기록 분석</h3>
                <FileUpload onFilesChange={setFiles} onAnalyze={() => {}} isAnalyzing={isAnalyzing} fileCount={files.length} />
                {files.length > 0 && !isAnalyzing && (
                    <div className="mt-8 flex justify-center">
                        <button onClick={handleAnalyze} className="w-full max-w-md py-4 sm:py-5 bg-indigo-600 text-white text-xl sm:text-2xl font-black rounded-2xl shadow-2xl hover:bg-indigo-700 transition-all animate-pulse-gold">신규 분석 시작</button>
                    </div>
                )}
            </div>
        </div>
    );
};
export default OcrAnalysis;
