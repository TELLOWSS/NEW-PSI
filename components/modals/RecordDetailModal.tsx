
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type {
    WorkerRecord,
    AppSettings,
    ScoreAdjustmentReasonCode,
    ScoreAdjustmentEntry,
    HarnessApprovalState,
    HarnessRiskDecision,
    HarnessWorkflowState,
} from '../../types';
import { BRAND_STATUS_LABELS } from '../../utils/brandLabels';
import { BRAND_TONE } from '../../utils/brandToneTokens';
import { ActionButton } from '../shared/ActionButton';
import { CircularProgress } from '../shared/CircularProgress';
import { HarnessVersionChangeSummaryPanel } from '../shared/HarnessVersionChangeSummaryPanel';
import { HarnessRuleImpactSummaryPanel } from '../shared/HarnessRuleImpactSummaryPanel';
import { InterpretationCardGrid } from '../shared/InterpretationCardGrid';
import { HarnessVersionDetailsPanel } from '../shared/HarnessVersionDetailsPanel';
import { NextActionChecklist } from '../shared/NextActionChecklist';
import { NoticeCallout } from '../shared/NoticeCallout';
import { OperationalPreviewCard } from '../shared/OperationalPreviewCard';
import { SectionPanelCard } from '../shared/SectionPanelCard';
import { StatusBadge } from '../shared/StatusBadge';
import { SummaryMetricGrid } from '../shared/SummaryMetricGrid';
import { WhyThisResultPanel } from '../shared/WhyThisResultPanel';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { updateAnalysisBasedOnEdits } from '../../services/geminiService';
import {
    approveHarnessRecord,
    type HarnessWorkflowAnalyzerSummary,
    fetchHarnessWorkflowStatus,
    type HarnessWorkflowApproval,
    type HarnessWorkflowApprovalDiff,
    type HarnessWorkflowContextSnapshot,
    type HarnessWorkflowDiagnostics,
    type HarnessWorkflowEvaluatorSummary,
    type HarnessWorkflowOverride,
    type HarnessWorkflowPolicyVersion,
    type HarnessWorkflowPromptVersion,
    type HarnessWorkflowTransitionAction,
    type HarnessWorkflowRuleImpactSummary,
    type HarnessWorkflowVersionDetails,
    type HarnessWorkflowVersionChangeSummary,
} from '../../services/harnessService';
import { buildHarnessRuleImpactSummary } from '../../utils/harnessRuleImpactSummary';
import { exportEvidencePackageCsv, exportEvidencePackagePdf } from '../../utils/evidenceReportUtils';
import { buildFallbackNativeGuidanceText, evaluateOcrVerificationCompleteness, evaluateOcrVerificationQuality, getNativeLanguageLabel, getNativeWritingGuide, isKoreanNationality, sanitizeOperationalNote } from '../../utils/ocrVerificationLanguageUtils';
import {
    getHarnessAuditItemLabel,
    getHarnessAuditSectionLabel,
} from '../../utils/auditExportLabels';
import { buildPsiExportFileName } from '../../utils/exportFileNaming';
import { buildExportTimestampMeta } from '../../utils/exportTimestamp';
import {
    buildHarnessTransitionExecutionGuide,
    buildHarnessTransitionNarrative,
    formatHarnessTransitionStatusText,
    getHarnessTransitionActionLabel,
    normalizeHarnessTransitionReason,
} from '../../utils/harnessTransitionNarratives';
import { getHarnessVersionDescriptors } from '../../utils/harnessVersionCatalog';
import { deriveCompetencyProfile, getApprovalBlockers } from '../../utils/evidenceUtils';
import { getSafetyLevelDisplayLabel, getSafetyLevelThresholds, getSafetyLevelFromScore, SAFETY_SIGNAL_COPY } from '../../utils/safetyLevelUtils';
import {
    getManagerReviewApprovalBlockers,
    getManagerReviewApprovalReadiness,
    synchronizeManagerReviewedRecord,
} from '../../utils/managerReviewSync';

const QUESTION_LABELS: Record<string, { title: string; subtitle: string }> = {
    '1': { title: '1. 실제 위험작업(Q1)', subtitle: '근로자가 자기 공종 안에서 이번 작업 중 가장 위험하다고 쓴 세부작업입니다. 하단 공종을 대체하지 않습니다.' },
    'Q1': { title: '1. 실제 위험작업(Q1)', subtitle: '근로자가 자기 공종 안에서 이번 작업 중 가장 위험하다고 쓴 세부작업입니다. 하단 공종을 대체하지 않습니다.' },
    '2': { title: '2. 위험 발생 상황 및 원인', subtitle: '사고가 발생할 수 있는 구체적인 원인과 예측 상황을 기재합니다.' },
    'Q2': { title: '2. 위험 발생 상황 및 원인', subtitle: '사고가 발생할 수 있는 구체적인 원인과 예측 상황을 기재합니다.' },
    '3': { title: '3. 위험도 등급 평가', subtitle: '근로자가 작업 전 주관적으로 진단한 자가 위험성 수준(상/중/하)입니다.' },
    'Q3': { title: '3. 위험도 등급 평가', subtitle: '근로자가 작업 전 주관적으로 진단한 자가 위험성 수준(상/중/하)입니다.' },
    '4': { title: '4. 현장 안전대책', subtitle: '해당 위험 요소를 실질적으로 통제하기 위한 예방 조치와 대책을 수립합니다.' },
    'Q4': { title: '4. 현장 안전대책', subtitle: '해당 위험 요소를 실질적으로 통제하기 위한 예방 조치와 대책을 수립합니다.' },
    '5': { title: '5. 작업 전 다짐 및 점검', subtitle: '작업 시작 전 안전대책의 완벽한 이행을 약속하며 안전 준수를 다짐합니다.' },
    'Q5': { title: '5. 작업 전 다짐 및 점검', subtitle: '작업 시작 전 안전대책의 완벽한 이행을 약속하며 안전 준수를 다짐합니다.' },
};

const getNationalityFlag = (nationality: string): string => {
    const nat = (nationality || '').trim();
    if (nat.includes('한국') || nat.includes('대한민국') || nat.includes('Korea')) return '🇰🇷';
    if (nat.includes('베트남') || nat.includes('Vietnam')) return '🇻🇳';
    if (nat.includes('중국') || nat.includes('China')) return '🇨🇳';
    if (nat.includes('태국') || nat.includes('Thailand')) return '🇹🇭';
    if (nat.includes('인도네시아') || nat.includes('Indonesia')) return '🇮🇩';
    if (nat.includes('우즈베키스탄') || nat.includes('Uzbek')) return '🇺🇿';
    if (nat.includes('몽골') || nat.includes('Mongolia')) return '🇲🇳';
    if (nat.includes('캄보디아') || nat.includes('Cambodia')) return '🇰🇭';
    if (nat.includes('네팔') || nat.includes('Nepal')) return '🇳🇵';
    if (nat.includes('러시아') || nat.includes('Russia')) return '🇷🇺';
    if (nat.includes('미얀마') || nat.includes('Myanmar')) return '🇲🇲';
    if (nat.includes('필리핀') || nat.includes('Philippines')) return '🇵🇭';
    if (nat.includes('인도') || nat.includes('India')) return '🇮🇳';
    if (nat.includes('방글라데시') || nat.includes('Bangladesh')) return '🇧🇩';
    if (nat.includes('파키스탄') || nat.includes('Pakistan')) return '🇵🇰';
    if (nat.includes('스리랑카') || nat.includes('Sri Lanka')) return '🇱🇰';
    if (nat.includes('카자흐스탄') || nat.includes('Kazakhstan')) return '🇰🇿';
    return '🏳️';
};

type MetricTone = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';

interface CompetencyMetricCardProps {
    label: string;
    score: number;
    maxScore?: number;
    subtitle: string;
    tone?: MetricTone;
    penalty?: boolean;
}

const normalizeScore = (value: number, maxScore: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(maxScore, Math.round(value)));
};

const truncateText = (value?: string, maxLength = 120) => {
    const normalized = (value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}…` : normalized;
};

const escapeCsvCell = (value: unknown) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const downloadTextFile = (fileName: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const metricToneClass: Record<MetricTone, { badge: string; bar: string; panel: string; text: string; track: string }> = {
    slate: { badge: 'bg-slate-100 text-slate-700', bar: 'bg-slate-700', panel: 'bg-slate-50 border-slate-200', text: 'text-slate-700', track: 'bg-slate-200' },
    indigo: { badge: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-600', panel: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', track: 'bg-indigo-100' },
    emerald: { badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-600', panel: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', track: 'bg-emerald-100' },
    amber: { badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500', panel: 'bg-amber-50 border-amber-200', text: 'text-amber-700', track: 'bg-amber-100' },
    rose: { badge: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500', panel: 'bg-rose-50 border-rose-200', text: 'text-rose-700', track: 'bg-rose-100' },
};

const metricToneBadgeVariant: Record<MetricTone, React.ComponentProps<typeof StatusBadge>['variant']> = {
    slate: 'slateSoft',
    indigo: 'violetSoft',
    emerald: 'emeraldSoft',
    amber: 'amberSoft',
    rose: 'roseSoft',
};

const ocrErrorGuide: Record<NonNullable<WorkerRecord['ocrErrorType']>, string> = {
    QUALITY: '이미지 품질 흔들림이 있어 원본 대조가 먼저 필요합니다.',
    RESOLUTION: '해상도 저하 가능성이 있어 문서 재확인이 우선입니다.',
    HANDWRITING: '필기 해석 난도가 높아 원문-번역 대조가 중요합니다.',
    LAYOUT: '서식 배치 영향으로 항목 매칭을 다시 봐야 합니다.',
    UNKNOWN: '자동 분류가 어려워 관리자 판단 근거가 더 중요합니다.',
};

const CompetencyMetricCard: React.FC<CompetencyMetricCardProps> = ({
    label,
    score,
    maxScore = 100,
    subtitle,
    tone = 'slate',
    penalty = false,
}) => {
    const safeScore = normalizeScore(score, maxScore);
    const progress = maxScore > 0 ? Math.max(0, Math.min(100, (safeScore / maxScore) * 100)) : 0;
    const toneClass = metricToneClass[tone];

    return (
        <div className={`rounded-2xl border p-4 ${toneClass.panel}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black text-slate-800">{label}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500 leading-relaxed">{subtitle}</p>
                </div>
                <StatusBadge variant={metricToneBadgeVariant[tone]} className={`shrink-0 border-0 px-2.5 py-1 text-xs ${toneClass.badge}`}>
                    {penalty ? `-${safeScore}` : `${safeScore}점`}
                </StatusBadge>
            </div>
            <div className={`mt-3 h-2.5 overflow-hidden rounded-full ${toneClass.track}`}>
                <div className={`h-full rounded-full ${toneClass.bar}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>{penalty ? '보완 반영' : '달성 수준'}</span>
                <span className={toneClass.text}>{safeScore}/{maxScore}</span>
            </div>
        </div>
    );
};

const buildReassessmentAuditNote = (before: WorkerRecord, updated: Partial<WorkerRecord>): string => {
    const beforeScore = typeof before.safetyScore === 'number' ? before.safetyScore : 0;
    const afterScore = typeof updated.safetyScore === 'number' ? updated.safetyScore : beforeScore;
    const beforeLevel = before.safetyLevel;
    const afterLevel = (updated.safetyLevel as WorkerRecord['safetyLevel']) || beforeLevel;

    const beforeReasons = Array.isArray(before.scoreReasoning) ? before.scoreReasoning : [];
    const afterReasons = Array.isArray(updated.scoreReasoning) ? updated.scoreReasoning : beforeReasons;
    const addedReasons = afterReasons.filter(reason => !beforeReasons.includes(reason)).slice(0, 2);

    const parts = [`${SAFETY_SIGNAL_COPY.scoreCompact} ${beforeScore}→${afterScore}`, `${SAFETY_SIGNAL_COPY.level} ${getSafetyLevelDisplayLabel(beforeLevel)}→${getSafetyLevelDisplayLabel(afterLevel)}`];

    if (addedReasons.length > 0) {
        parts.push(`근거추가: ${addedReasons.join(' / ')}`);
    } else if (afterReasons.length > 0) {
        parts.push(`근거유지: ${afterReasons.slice(0, 2).join(' / ')}`);
    }

    return `수정 반영 재분석 (${parts.join(' | ')})`;
};

const inferHarnessWorkflowState = (record: Partial<WorkerRecord>): HarnessWorkflowState => {
    // harness 실 저장값 우선 사용
    if (record.workflowState) return record.workflowState;
    if (record.secondPassStatus === 'IN_PROGRESS') return 'second_pass_analyzing';
    if (record.reviewStatus === 'REJECTED') return 'manager_revised';
    if (record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING') return 'awaiting_manager_approval';
    if (record.ocrErrorType || record.secondPassStatus === 'NEEDED') return 'manual_review_required';
    if (record.secondPassStatus === 'DONE' || record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'completed';
    return 'uploaded';
};

const inferHarnessRiskDecision = (record: Partial<WorkerRecord>): HarnessRiskDecision => {
    if (record.riskDecision) return record.riskDecision;
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

const getHarnessWorkflowStateLabel = (state: HarnessWorkflowState): string => {
    switch (state) {
        case 'uploaded': return '자료 접수';
        case 'ocr_validating': return '원문 확인 중';
        case 'manual_review_required': return '관리자 확인 필요';
        case 'context_ready': return '현장 정보 반영';
        case 'first_pass_analyzing': return '1차 판단 중';
        case 'evaluator_review': return '판단 근거 확인 중';
        case 'awaiting_manager_approval': return '관리자 최종 확인 대기';
        case 'manager_revised': return '관리자 수정 완료';
        case 'second_pass_analyzing': return '수정 반영 분석 중';
        case 'completed': return '확정';
        default: return '확인 필요';
    }
};

const getHarnessRiskDecisionLabel = (decision: HarnessRiskDecision): string => {
    switch (decision) {
        case 'SAFE_TO_PROCEED': return '진행 가능';
        case 'SUPPLEMENTARY_REVIEW': return '보완 확인';
        case 'IMMEDIATE_ATTENTION': return '즉시 확인 필요';
        case 'CRITICAL_STOP': return '작업 중지 확인';
        default: return '확인 필요';
    }
};

const getHarnessApprovalStateLabel = (state: HarnessApprovalState): string => {
    switch (state) {
        case 'NOT_REQUIRED': return '최종 확인 제외';
        case 'REQUIRED': return '최종 확인 필요';
        case 'PENDING': return '최종 확인 대기';
        case 'APPROVED': return '최종 확인 완료';
        case 'REJECTED': return '보완 요청';
        default: return '확인 필요';
    }
};

const getHarnessWorkflowBadgeVariant = (state: HarnessWorkflowState): React.ComponentProps<typeof StatusBadge>['variant'] => {
    switch (state) {
        case 'completed': return 'emeraldSoft';
        case 'awaiting_manager_approval':
        case 'second_pass_analyzing': return 'violetSoft';
        case 'manual_review_required': return 'roseSoft';
        default: return 'slateSoft';
    }
};

const getHarnessRiskBadgeVariant = (decision: HarnessRiskDecision): React.ComponentProps<typeof StatusBadge>['variant'] => {
    switch (decision) {
        case 'SAFE_TO_PROCEED': return 'emeraldSoft';
        case 'SUPPLEMENTARY_REVIEW': return 'amberSoft';
        case 'IMMEDIATE_ATTENTION':
        case 'CRITICAL_STOP': return 'roseSoft';
        default: return 'slateSoft';
    }
};

const getHarnessApprovalBadgeVariant = (state: HarnessApprovalState): React.ComponentProps<typeof StatusBadge>['variant'] => {
    switch (state) {
        case 'APPROVED': return 'emeraldSoft';
        case 'REJECTED': return 'roseSoft';
        case 'PENDING':
        case 'REQUIRED': return 'amberSoft';
        default: return 'slateSoft';
    }
};

const buildHarnessTransitionGuidance = (options: {
    message?: string;
    workflowState?: HarnessWorkflowState;
    approvalState?: HarnessApprovalState;
}) => {
    const message = String(options.message || '').trim();
    const workflowState = options.workflowState || 'uploaded';
    const approvalState = options.approvalState || 'NOT_REQUIRED';

    if (message.includes('이미 승인 완료된 워크플로우')) {
        return {
            variant: 'emerald' as const,
            title: '이미 최종 확인된 건입니다.',
            description: '현재 기록은 완료 상태이므로 바로 다시 확정할 수 없습니다. 수정 후 재검토 상태로 전환한 뒤 최종 확인을 진행해 주십시오.',
        };
    }

    if (message.includes('재분석') || workflowState === 'second_pass_analyzing') {
        return {
            variant: 'amber' as const,
            title: '수정 반영 분석 또는 재검토 상태 확인이 필요합니다.',
            description: '수정 반영 분석 중이거나 완료 확정 후 상태이므로, 먼저 분석 완료 여부와 재검토 전환 필요성을 확인해 주십시오.',
        };
    }

    if (workflowState === 'manual_review_required') {
        return {
            variant: 'rose' as const,
            title: '관리자 확인이 필요한 상태입니다.',
            description: '원문·번역·증빙을 먼저 보완하고 최종 확인 대기 상태로 전환한 뒤 확정해 주십시오.',
        };
    }

    if (workflowState === 'awaiting_manager_approval' || approvalState === 'PENDING') {
        return {
            variant: 'indigo' as const,
            title: '현재는 관리자 최종 확인이 필요한 상태입니다.',
            description: '코멘트와 증빙 체크리스트를 확인하신 뒤 최종 확인 또는 보완 요청 중 하나를 선택해 주십시오.',
        };
    }

    return {
        variant: 'slate' as const,
        title: '현재 판단 흐름의 다음 단계 조건을 먼저 확인해 주십시오.',
        description: message || '판단 흐름, 최종 확인 상태, 수정 반영 분석 상태가 현재 조치와 맞는지 먼저 확인이 필요합니다.',
    };
};

const SCORE_REASON_OPTIONS: Array<{ code: ScoreAdjustmentReasonCode; label: string; impact: string }> = [
    { code: 'BEHAVIOR_NON_COMPLIANCE', label: '현장 지적(행동 위반)', impact: '개선이행도·숙련도 중심 보완 반영' },
    { code: 'UNDERSTANDING_GAP', label: '수기 위험성평가 이해도 부족', impact: '위험성평가 이해도·업무이해도 중심 보완 반영' },
    { code: 'DOCUMENT_INCONSISTENCY', label: '문서 내용 불일치', impact: '무결성·이해도 교차 보완 반영' },
    { code: 'EVIDENCE_INSUFFICIENT', label: '증빙 부족/확인 불가', impact: '무결성 중심 보완 반영' },
    { code: 'OTHER', label: '기타(관리자 수기 판단)', impact: '관리자 근거 기반 보완 반영' },
];

type ReviewViewMode = 'simple' | 'detail' | 'pro';

const REVIEW_VIEW_MODE_OPTIONS: Array<{ mode: ReviewViewMode; label: string; helper: string }> = [
    { mode: 'simple', label: '보호 판단', helper: '현장 기본' },
    { mode: 'detail', label: '원문 대조', helper: '관리자 확인' },
    { mode: 'pro', label: '개발자 검증', helper: '감사 근거' },
];

interface RecordDetailModalProps {
    record: WorkerRecord;
    onClose: () => void;
    onBack: () => void;
    onUpdateRecord: (record: WorkerRecord) => Promise<void> | void;
    onOpenReport: (record: WorkerRecord) => void;
    onReanalyze: (record: WorkerRecord) => Promise<WorkerRecord | null>;
    isReanalyzing: boolean;
    queueContext?: {
        currentIndex: number;
        total: number;
        nextRecordName?: string | null;
    };
    onOpenNextRecord?: () => void;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ record: initialRecord, onClose, onBack, onUpdateRecord, onOpenReport, onReanalyze, isReanalyzing, queueContext, onOpenNextRecord }) => {
    const [record, setRecord] = useState<WorkerRecord>(initialRecord);
    const [activeTab, setActiveTab] = useState<'info' | 'analysis' | 'qna'>('info');
    const [hasChanges, setHasChanges] = useState(false);
    const [isUpdatingAnalysis, setIsUpdatingAnalysis] = useState(false);
    const [actionType, setActionType] = useState('재교육');
    const [actionDetail, setActionDetail] = useState('');
    const [approvalComment, setApprovalComment] = useState('');
    const [pendingApprovalAction, setPendingApprovalAction] = useState<'approved' | 'rejected' | null>(null);
    const [approverRole, setApproverRole] = useState<'safety-manager' | 'site-manager'>('safety-manager');
    const [strictRoleGate, setStrictRoleGate] = useState(false);
    const [scoreReasonCode, setScoreReasonCode] = useState<ScoreAdjustmentReasonCode | ''>('');
    const [scoreReasonDetail, setScoreReasonDetail] = useState('');
    const [scoreEvidenceSummary, setScoreEvidenceSummary] = useState('');
    const [isPhotoAutoSaving, setIsPhotoAutoSaving] = useState(false);
    const [photoQueueNotice, setPhotoQueueNotice] = useState<string | null>(null);
    const [isHarnessStatusLoading, setIsHarnessStatusLoading] = useState(false);
    const [harnessStatusWarning, setHarnessStatusWarning] = useState<string | null>(null);
    const [harnessTimeline, setHarnessTimeline] = useState<Array<{ stage: string; timestamp: string; note: string; actor?: string }>>([]);
    const [isHarnessPersisted, setIsHarnessPersisted] = useState<boolean | null>(null);
    const [harnessDiagnostics, setHarnessDiagnostics] = useState<HarnessWorkflowDiagnostics | null>(null);
    const [harnessOverrides, setHarnessOverrides] = useState<HarnessWorkflowOverride[]>([]);
    const [harnessApprovals, setHarnessApprovals] = useState<HarnessWorkflowApproval[]>([]);
    const [harnessContextSnapshot, setHarnessContextSnapshot] = useState<HarnessWorkflowContextSnapshot | null>(null);
    const [harnessPromptVersion, setHarnessPromptVersion] = useState<HarnessWorkflowPromptVersion | null>(null);
    const [harnessPolicyVersion, setHarnessPolicyVersion] = useState<HarnessWorkflowPolicyVersion | null>(null);
    const [harnessVersionDetails, setHarnessVersionDetails] = useState<HarnessWorkflowVersionDetails>({ prompt: [], policy: [], rule: [] });
    const [harnessVersionChangeSummary, setHarnessVersionChangeSummary] = useState<HarnessWorkflowVersionChangeSummary>({ prompt: [], policy: [], rule: [] });
    const [harnessRuleImpactSummary, setHarnessRuleImpactSummary] = useState<HarnessWorkflowRuleImpactSummary>({ items: [], narrative: '현재 저장된 예외 규칙 기록은 없습니다.', totalCount: 0, criticalCount: 0 });
    const [harnessAnalyzerSummary, setHarnessAnalyzerSummary] = useState<HarnessWorkflowAnalyzerSummary>({ summary: null, confidence: null });
    const [harnessEvaluatorSummary, setHarnessEvaluatorSummary] = useState<HarnessWorkflowEvaluatorSummary>({ evidenceSufficiency: null, requiresHumanApproval: null, flags: [] });
    const [harnessLatestApprovalDiff, setHarnessLatestApprovalDiff] = useState<HarnessWorkflowApprovalDiff | null>(null);
    const [harnessTransitionActions, setHarnessTransitionActions] = useState<HarnessWorkflowTransitionAction[]>([]);
    const [showHarnessTechnicalDetails, setShowHarnessTechnicalDetails] = useState(false);
    const [reviewViewMode, setReviewViewMode] = useState<ReviewViewMode>('simple');
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [isMobileDetailExpanded, setIsMobileDetailExpanded] = useState(false);
    const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mobileDetailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    const docInputRef = useRef<HTMLInputElement>(null); // For Document Image
    const profileInputRef = useRef<HTMLInputElement>(null); // For Profile Photo

    const getConsistentRecord = (baseRecord: WorkerRecord): WorkerRecord => {
        return synchronizeManagerReviewedRecord(baseRecord).record;
    };

    useEffect(() => { 
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
        }
        setRecord(getConsistentRecord(initialRecord)); 
        setHasChanges(false); 
        setScoreReasonCode('');
        setScoreReasonDetail('');
        setScoreEvidenceSummary('');
        setIsPhotoAutoSaving(false);
        setPhotoQueueNotice(null);
        setReviewViewMode('simple');
        setIsMobileDetailExpanded(false);
    }, [initialRecord]);

    useEffect(() => {
        return () => {
            if (autoAdvanceTimerRef.current) {
                clearTimeout(autoAdvanceTimerRef.current);
                autoAdvanceTimerRef.current = null;
            }
            if (mobileDetailTimerRef.current) {
                clearTimeout(mobileDetailTimerRef.current);
                mobileDetailTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const updateViewport = () => {
            if (typeof window === 'undefined') return;
            const isMobile = window.innerWidth < 640;
            setIsMobileViewport(isMobile);
            if (!isMobile) {
                setIsMobileDetailExpanded(false);
            }
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, []);

    useEffect(() => {
        if (!isMobileViewport || !isMobileDetailExpanded) return;

        if (mobileDetailTimerRef.current) {
            clearTimeout(mobileDetailTimerRef.current);
        }

        mobileDetailTimerRef.current = setTimeout(() => {
            setIsMobileDetailExpanded(false);
            mobileDetailTimerRef.current = null;
        }, 45000);

        return () => {
            if (mobileDetailTimerRef.current) {
                clearTimeout(mobileDetailTimerRef.current);
                mobileDetailTimerRef.current = null;
            }
        };
    }, [isMobileDetailExpanded, isMobileViewport]);

    const activeReviewViewMode: ReviewViewMode = isMobileViewport && !isMobileDetailExpanded ? 'simple' : reviewViewMode;
    const isCompactViewActive = activeReviewViewMode === 'simple';
    const isProfessionalReviewView = activeReviewViewMode === 'pro';

    const handleReviewViewModeChange = useCallback((mode: ReviewViewMode) => {
        setReviewViewMode(mode);
        if (isMobileViewport) {
            setIsMobileDetailExpanded(mode !== 'simple');
        }
        if (mode === 'pro') {
            setActiveTab('info');
            setShowHarnessTechnicalDetails(true);
        }
    }, [isMobileViewport]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem('psi_app_settings');
            if (!raw) return;
            const parsed = JSON.parse(raw) as AppSettings;
            setStrictRoleGate(Boolean(parsed.approvalPolicy?.strictRoleGate));
        } catch {
            setStrictRoleGate(false);
        }
    }, []);

    const refreshHarnessStatus = useCallback(async (workflowRunId?: string) => {
        const lookupId = String(workflowRunId || '').trim();
        if (!lookupId) {
            setHarnessTimeline([]);
            setHarnessStatusWarning(null);
            setIsHarnessPersisted(null);
            setHarnessDiagnostics(null);
            setHarnessOverrides([]);
            setHarnessApprovals([]);
            setHarnessContextSnapshot(null);
            setHarnessPromptVersion(null);
            setHarnessPolicyVersion(null);
            setHarnessVersionDetails({ prompt: [], policy: [], rule: [] });
            setHarnessVersionChangeSummary({ prompt: [], policy: [], rule: [] });
            setHarnessRuleImpactSummary({ items: [], narrative: '현재 저장된 예외 규칙 기록은 없습니다.', totalCount: 0, criticalCount: 0 });
            setHarnessAnalyzerSummary({ summary: null, confidence: null });
            setHarnessEvaluatorSummary({ evidenceSufficiency: null, requiresHumanApproval: null, flags: [] });
            setHarnessLatestApprovalDiff(null);
            setHarnessTransitionActions([]);
            return;
        }

        setIsHarnessStatusLoading(true);
        try {
            const response = await fetchHarnessWorkflowStatus(lookupId);
            setHarnessTimeline((response.timeline || []).map((entry) => ({
                stage: entry.stage,
                timestamp: entry.timestamp,
                note: entry.note,
                actor: entry.actor,
            })));
            setHarnessStatusWarning(response.persistence?.warning || null);
            setIsHarnessPersisted(typeof response.persistence?.persisted === 'boolean' ? response.persistence.persisted : null);
            setHarnessDiagnostics(response.diagnostics || null);
            setHarnessOverrides(response.overrides || []);
            setHarnessApprovals(response.approvals || []);
            setHarnessContextSnapshot(response.contextSnapshot || null);
            setHarnessPromptVersion(response.promptVersion || null);
            setHarnessPolicyVersion(response.policyVersion || null);
            setHarnessVersionDetails(response.versionDetails || { prompt: [], policy: [], rule: [] });
            setHarnessVersionChangeSummary(response.versionChangeSummary || { prompt: [], policy: [], rule: [] });
            setHarnessRuleImpactSummary(response.ruleImpactSummary || buildHarnessRuleImpactSummary(response.overrides || []));
            setHarnessAnalyzerSummary(response.analyzerSummary || { summary: null, confidence: null });
            setHarnessEvaluatorSummary(response.evaluatorSummary || { evidenceSufficiency: null, requiresHumanApproval: null, flags: [] });
            setHarnessLatestApprovalDiff(response.latestApprovalDiff || null);
            setHarnessTransitionActions(response.transitionActions || []);
            setRecord((prev) => getConsistentRecord(withHarnessState(prev, {
                workflowRunId: response.workflowRunId,
                workflowState: response.workflowState,
                riskDecision: response.riskDecision,
                approvalState: response.approvalState,
                secondPassStatus: response.secondPassStatus,
                harnessPersistenceWarning: response.persistence?.warning || undefined,
            })));
        } catch (error) {
            setHarnessStatusWarning(error instanceof Error ? error.message : '판단 흐름 조회에 추가 확인이 필요합니다.');
            setIsHarnessPersisted(false);
            setHarnessDiagnostics(null);
            setHarnessOverrides([]);
            setHarnessApprovals([]);
            setHarnessContextSnapshot(null);
            setHarnessPromptVersion(null);
            setHarnessPolicyVersion(null);
            setHarnessVersionDetails({ prompt: [], policy: [], rule: [] });
            setHarnessVersionChangeSummary({ prompt: [], policy: [], rule: [] });
            setHarnessRuleImpactSummary({ items: [], narrative: '현재 저장된 예외 규칙 기록은 없습니다.', totalCount: 0, criticalCount: 0 });
            setHarnessAnalyzerSummary({ summary: null, confidence: null });
            setHarnessEvaluatorSummary({ evidenceSufficiency: null, requiresHumanApproval: null, flags: [] });
            setHarnessLatestApprovalDiff(null);
            setHarnessTransitionActions([]);
        } finally {
            setIsHarnessStatusLoading(false);
        }
    }, []);

    const harnessLookupSummary = useMemo(() => {
        if (!harnessDiagnostics) return null;

        const resolvedByLabel = harnessDiagnostics.resolvedBy === 'workflow_run_id'
            ? '처리 번호 직접 조회'
            : harnessDiagnostics.resolvedBy === 'source_record_id'
                ? '원본 레코드 기준 조회'
                : '저장 기록 미발견';

        return `${resolvedByLabel} · 검증 기록 ${harnessDiagnostics.eventCount}건 · 승인 ${harnessDiagnostics.approvalCount}건 · 예외 규칙 ${harnessDiagnostics.overrideCount}건 · 단계 기록 ${harnessDiagnostics.timelineCount}건`;
    }, [harnessDiagnostics]);

    const harnessTransitionGuidance = useMemo(() => buildHarnessTransitionGuidance({
        workflowState: record.workflowState || inferHarnessWorkflowState(record),
        approvalState: record.approvalState || inferHarnessApprovalState(record, record.workflowState || inferHarnessWorkflowState(record)),
    }), [record]);

    const harnessTransitionActionSummary = useMemo(() => {
        const allowed = harnessTransitionActions.filter((item) => item.allowed);
        const blocked = harnessTransitionActions.filter((item) => !item.allowed);

        return {
            allowed,
            blocked,
            recommended: allowed[0] || null,
        };
    }, [harnessTransitionActions]);

    const harnessTransitionNarrative = useMemo(() => {
        return buildHarnessTransitionNarrative(harnessTransitionActions, getHarnessWorkflowStateLabel);
    }, [harnessTransitionActions]);

    const harnessTransitionExecutionGuide = useMemo(() => {
        return buildHarnessTransitionExecutionGuide(harnessTransitionActions, getHarnessWorkflowStateLabel);
    }, [harnessTransitionActions]);

    const harnessSnapshotMetrics = useMemo(() => {
        const weather = harnessContextSnapshot?.weather || {};
        const schedule = harnessContextSnapshot?.schedule || {};
        const sensorEvents = Array.isArray(harnessContextSnapshot?.sensorEvents) ? harnessContextSnapshot?.sensorEvents : [];
        const weatherLabel = [weather.condition, typeof weather.windSpeedMps === 'number' ? `${weather.windSpeedMps}m/s` : null, typeof weather.rainfallMm === 'number' ? `${weather.rainfallMm}mm` : null]
            .filter(Boolean)
            .join(' · ') || '기상 정보 없음';
        const scheduleLabel = [schedule.taskName, Array.isArray(schedule.concurrentHighRiskTasks) && schedule.concurrentHighRiskTasks.length > 0 ? `${schedule.concurrentHighRiskTasks.length}개 동시작업` : null]
            .filter(Boolean)
            .join(' · ') || '작업 계획 정보 없음';

        return [
            {
                key: 'prompt-version',
                label: '분석 기준 버전',
                value: harnessPromptVersion?.version || '미연결',
                tone: harnessPromptVersion ? BRAND_TONE.indigo : BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400',
                valueClassName: 'mt-1 text-xs font-black text-indigo-700',
            },
            {
                key: 'policy-version',
                label: '정책 기준 버전',
                value: harnessPolicyVersion?.version || '미연결',
                tone: harnessPolicyVersion ? BRAND_TONE.violet : BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-violet-400',
                valueClassName: 'mt-1 text-xs font-black text-violet-700',
            },
            {
                key: 'override-count',
                label: '예외 규칙',
                value: `${harnessOverrides.length}건`,
                tone: harnessOverrides.length > 0 ? BRAND_TONE.amber : BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-500',
                valueClassName: 'mt-1 text-xs font-black text-amber-700',
            },
            {
                key: 'approval-count',
                label: '승인 이력',
                value: `${harnessApprovals.length}건`,
                tone: harnessApprovals.length > 0 ? BRAND_TONE.emerald : BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400',
                valueClassName: 'mt-1 text-xs font-black text-emerald-700',
            },
            {
                key: 'weather',
                label: '기상·현장 맥락',
                value: weatherLabel,
                tone: BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                valueClassName: 'mt-1 text-xs font-black text-slate-700',
            },
            {
                key: 'schedule',
                label: '작업 계획',
                value: scheduleLabel,
                tone: BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                valueClassName: 'mt-1 text-xs font-black text-slate-700',
            },
            {
                key: 'sensor-events',
                label: '센서 이벤트',
                value: `${sensorEvents.length}건`,
                tone: sensorEvents.length > 0 ? BRAND_TONE.rose : BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-rose-400',
                valueClassName: 'mt-1 text-xs font-black text-rose-700',
            },
            {
                key: 'ocr-quality',
                label: '원문 인식/사진 품질',
                value: `${typeof harnessContextSnapshot?.ocrConfidenceScore === 'number' ? `${Math.round(harnessContextSnapshot.ocrConfidenceScore * 100)}%` : '미기록'} · ${typeof harnessContextSnapshot?.imageQualityScore === 'number' ? `${Math.round(harnessContextSnapshot.imageQualityScore * 100)}%` : '미기록'}`,
                tone: BRAND_TONE.slate,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                valueClassName: 'mt-1 text-xs font-black text-slate-700',
            },
        ];
    }, [harnessApprovals.length, harnessContextSnapshot, harnessOverrides.length, harnessPolicyVersion, harnessPromptVersion]);

    const harnessVersionDescriptors = useMemo(() => {
        if (harnessVersionDetails.prompt.length > 0 || harnessVersionDetails.policy.length > 0 || harnessVersionDetails.rule.length > 0) {
            return harnessVersionDetails;
        }

        const ruleVersions = Array.from(
            new Set(
                harnessOverrides
                    .map((override) => String(override.ruleVersion || '').trim())
                    .filter((value): value is string => value.length > 0),
            ),
        );
        return {
            prompt: getHarnessVersionDescriptors([harnessPromptVersion?.version]),
            policy: getHarnessVersionDescriptors([harnessPolicyVersion?.version]),
            rule: getHarnessVersionDescriptors(ruleVersions as string[]),
        };
    }, [harnessOverrides, harnessPolicyVersion?.version, harnessPromptVersion?.version, harnessVersionDetails]);

    const harnessVersionDescriptorRows = useMemo(() => {
        return [
            ...harnessVersionDescriptors.prompt,
            ...harnessVersionDescriptors.policy,
            ...harnessVersionDescriptors.rule,
        ];
    }, [harnessVersionDescriptors]);

    const harnessEvidenceChecklistItems = useMemo(() => {
        return [
            {
                key: 'workflow-run',
                content: record.workflowRunId
                    ? `처리 번호가 연결되어 있습니다. (${record.workflowRunId})`
                    : '처리 번호가 아직 연결되지 않았습니다.',
            },
            {
                key: 'evidence-hash',
                content: record.evidenceHash
                    ? '증빙 고유값이 있어 보고서와 검증 패키지를 서로 맞춰볼 수 있습니다.'
                    : '증빙 고유값이 없어 검증 패키지 일관성 확인이 필요합니다.',
            },
            {
                key: 'approval-comment',
                content: approvalComment.trim().length > 0 || String(record.reviewReason || record.adminComment || '').trim().length > 0
                    ? '승인 또는 검토 코멘트가 기록되어 있습니다.'
                    : '승인 또는 검토 코멘트가 비어 있어 판단 근거 보강이 필요합니다.',
            },
            {
                key: 'context-snapshot',
                content: harnessContextSnapshot
                    ? '현장 맥락 기록이 저장되어 당시 기상, 작업계획, 센서 상황을 다시 확인할 수 있습니다.'
                    : '현장 맥락 기록이 없어 당시 상황 확인이 제한될 수 있습니다.',
            },
            {
                key: 'override-review',
                content: harnessOverrides.length > 0
                    ? `예외 규칙 적용 기록 ${harnessOverrides.length}건이 있어 승인 전에 반드시 확인하셔야 합니다.`
                    : '현재 저장된 예외 규칙 기록은 없습니다.',
            },
        ];
    }, [approvalComment, harnessContextSnapshot, harnessOverrides.length, record.adminComment, record.evidenceHash, record.reviewReason, record.workflowRunId]);

    useEffect(() => {
        void refreshHarnessStatus(record.workflowRunId);
    }, [record.workflowRunId, refreshHarnessStatus]);

    const handleChange = <K extends keyof WorkerRecord>(field: K, value: WorkerRecord[K]) => {
        setRecord(prev => getConsistentRecord({ ...prev, [field]: value } as WorkerRecord));
        setHasChanges(true);
    };

    const scoreDropAmount = useMemo(() => {
        const before = typeof initialRecord.safetyScore === 'number' ? initialRecord.safetyScore : 0;
        const after = typeof record.safetyScore === 'number' ? record.safetyScore : 0;
        return Math.max(0, before - after);
    }, [initialRecord.safetyScore, record.safetyScore]);

    const hasWeakSaveReason = useMemo(() => {
        const comment = approvalComment.trim();
        if (!hasChanges) return false;
        if (comment.length === 0) return true;
        if (comment.length < 6) return true;
        return /수정|보정|변경|확인|검토|업데이트|ok|확인함/i.test(comment) && comment.length < 12;
    }, [approvalComment, hasChanges]);

    const hasWeakApprovalReason = useMemo(() => {
        const comment = approvalComment.trim();
        if (comment.length === 0) return true;
        if (comment.length < 8) return true;
        return /승인|반려|확인|검토|ok|완료|이상없음/i.test(comment) && comment.length < 16;
    }, [approvalComment]);

    const hasCriticalReviewEdits = useMemo(() => {
        const watchFields: (keyof WorkerRecord)[] = [
            'safetyScore',
            'safetyLevel',
            'fullText',
            'koreanTranslation',
            'aiInsights',
            'aiInsights_native',
            'strengths',
            'weakAreas',
            'suggestions',
            'handwrittenAnswers',
        ];

        return watchFields.some((field) => JSON.stringify(initialRecord[field]) !== JSON.stringify(record[field]));
    }, [initialRecord, record]);

    const managerReviewApprovalReadiness = useMemo(() => getManagerReviewApprovalReadiness(record), [record]);

    const managerReviewBadgeVariant = useMemo(() => {
        if (managerReviewApprovalReadiness.badgeTone === 'blocked') return 'roseSoft';
        if (managerReviewApprovalReadiness.badgeTone === 'warning') return 'amberSoft';
        return 'emeraldSoft';
    }, [managerReviewApprovalReadiness.badgeTone]);

    const managerReviewCalloutVariant = useMemo(() => {
        if (managerReviewApprovalReadiness.badgeTone === 'blocked') return 'rose';
        if (managerReviewApprovalReadiness.badgeTone === 'warning') return 'amber';
        return 'emerald';
    }, [managerReviewApprovalReadiness.badgeTone]);

    const managerReviewIssueItems = useMemo(() => {
        const messages = [
            ...managerReviewApprovalReadiness.blockers.map((message) => `승인 전 보강: ${message}`),
            ...managerReviewApprovalReadiness.warnings.map((message) => `확인 권장: ${message}`),
        ];
        if (messages.length === 0) {
            messages.push(`${managerReviewApprovalReadiness.nativeLanguageLabel} 안내와 개인 안전역량 지표가 동기화되어 있습니다.`);
        }
        return messages.slice(0, 4).map((content, index) => ({
            key: `manager-review-sync-${index}`,
            content,
        }));
    }, [managerReviewApprovalReadiness]);

    const approvalActionDisabled = useMemo(() => (
        isUpdatingAnalysis ||
        !managerReviewApprovalReadiness.canApprove ||
        (hasCriticalReviewEdits && approvalComment.trim().length === 0)
    ), [approvalComment, hasCriticalReviewEdits, isUpdatingAnalysis, managerReviewApprovalReadiness.canApprove]);

    const approvalReasonGuide = useMemo(() => {
        if (hasCriticalReviewEdits) {
            return `예: 원문과 번역, ${SAFETY_SIGNAL_COPY.score} 근거를 대조 검토한 뒤 수정 내용을 반영하여 승인합니다.`;
        }
        return '예: 현장 확인 결과 기록 내용과 증빙이 일치하여 승인합니다. 반려 시에는 재촬영/재작성 필요 사유를 구체적으로 남겨주세요.';
    }, [hasCriticalReviewEdits]);

    const approvalReviewChecklistItems = useMemo(() => {
        const workflowState = record.workflowState || inferHarnessWorkflowState(record);
        const approvalState = record.approvalState || inferHarnessApprovalState(record, workflowState);
        const riskDecision = record.riskDecision || inferHarnessRiskDecision(record);

        return [
            `현재 상태는 ${getHarnessWorkflowStateLabel(workflowState)} / ${getHarnessApprovalStateLabel(approvalState)} / ${getHarnessRiskDecisionLabel(riskDecision)} 조합인지 먼저 확인합니다.`,
            harnessLatestApprovalDiff
                ? `직전 확인 결과는 ${harnessLatestApprovalDiff.action === 'approved' ? '최종 확인' : harnessLatestApprovalDiff.action === 'rejected' ? '보완 요청' : '확인 처리'}이며 위험 판단이 ${harnessLatestApprovalDiff.decisionBefore || '미기록'} → ${harnessLatestApprovalDiff.decisionAfter || '미기록'}로 바뀌었습니다.`
                : '직전 확인 변화 기록이 없으면 이번 판단 코멘트에 변경 이유를 더 명확히 남겨야 합니다.',
            harnessOverrides.length > 0
                ? `예외 규칙 적용 기록 ${harnessOverrides.length}건이 있으므로 규칙 변경 사유와 현장 증빙 일치 여부를 반드시 다시 봅니다.`
                : `현재 예외 규칙 기록이 없으므로 원문, ${SAFETY_SIGNAL_COPY.score}, 증빙 정합성 중심으로 확인하시면 됩니다.`,
            managerReviewApprovalReadiness.canApprove
                ? `${managerReviewApprovalReadiness.nativeLanguageLabel} 안내와 개인 안전역량 지표가 같은 수정 기준으로 동기화되어 있습니다.`
                : `${managerReviewApprovalReadiness.nativeLanguageLabel} 안내 보강이 남아 있어 최종 승인 전에 먼저 보완해야 합니다.`,
            hasCriticalReviewEdits
                ? '핵심 수정이 있었으므로 승인 전 코멘트에 수정 범위와 반영 이유를 반드시 함께 남깁니다.'
                : '핵심 수정이 없다면 승인 또는 보완 요청의 판단 사유를 짧고 명확하게 남기면 됩니다.',
        ].map((content, index) => ({
            key: `approval-review-${index}`,
            content,
        }));
    }, [harnessLatestApprovalDiff, harnessOverrides.length, hasCriticalReviewEdits, managerReviewApprovalReadiness, record]);

    const approvalDiffInterpretation = useMemo(() => {
        if (!harnessLatestApprovalDiff) {
            return {
                title: '직전 확인 변화 정보가 아직 없습니다.',
                description: '이번 확인에서는 무엇이 바뀌었는지, 왜 최종 확인 또는 보완 요청을 했는지를 코멘트에 직접 남겨 주셔야 합니다.',
            };
        }

        const actionLabel = harnessLatestApprovalDiff.action === 'approved' ? '최종 승인' : harnessLatestApprovalDiff.action === 'rejected' ? '보완 요청' : harnessLatestApprovalDiff.action;
        const decisionChanged = harnessLatestApprovalDiff.decisionBefore !== harnessLatestApprovalDiff.decisionAfter;

        if (decisionChanged || harnessLatestApprovalDiff.requiresManagerApprovalAfter || harnessLatestApprovalDiff.secondPassStatusAfter !== 'DONE') {
            return {
                title: `직전 판단은 ${actionLabel} 처리되며 상태 변화가 실제로 발생했습니다.`,
                description: `위험 판단, 최종 확인 상태, 수정 반영 분석 상태 중 바뀐 항목을 이번 기록과 비교해 현재 판단이 연속선상에 있는지 확인해 주십시오.`,
            };
        }

        return {
            title: `직전 판단은 ${actionLabel} 처리됐지만 핵심 상태 변화는 제한적이었습니다.`,
            description: '이번에는 코멘트와 증빙 체크리스트를 더 구체적으로 남겨 QA 재확인 비용을 줄이는 편이 좋습니다.',
        };
    }, [harnessLatestApprovalDiff]);

    const harnessTimelineStageGuide = useMemo(() => {
        return [
            { stage: 'validation', meaning: `원문, 인식 결과, ${SAFETY_SIGNAL_COPY.score}, 증빙 정합성을 다시 맞춘 단계입니다.` },
            { stage: 'approval', meaning: '관리자 최종 확인 또는 보완 요청 판단이 기록된 단계입니다.' },
            { stage: 'reassessment', meaning: '수정 후 재분석 또는 재검토 흐름으로 되돌린 단계입니다.' },
        ];
    }, []);

    const safetyLevelThresholds = useMemo(() => getSafetyLevelThresholds(), []);
    const gradeExampleFor69 = useMemo(() => getSafetyLevelFromScore(69), []);
    const supportStageLabel = useMemo(() => getSafetyLevelDisplayLabel(record.safetyLevel), [record.safetyLevel]);

    const competencyMetrics = useMemo(() => {
        const profile = deriveCompetencyProfile(record);

        return [
        {
            label: '심리 지표',
            score: profile.psychologicalScore,
            subtitle: '작성 태도와 집중도 기반 안정성',
            tone: 'indigo' as const,
        },
        {
            label: '업무 이해도',
            score: profile.jobUnderstandingScore,
            subtitle: '공종·절차·역할 이해 수준',
            tone: 'emerald' as const,
        },
        {
            label: '위험성평가 이해도',
            score: profile.riskAssessmentUnderstandingScore,
            subtitle: '위험요인과 보호조치 연결 수준',
            tone: 'amber' as const,
        },
        {
            label: '숙련도',
            score: profile.proficiencyScore,
            subtitle: '0~5 일반론, 6~15 단일조치, 16~23 단계별 실무조치, 24~30 수치·통제 범위 명시',
            tone: 'slate' as const,
        },
        {
            label: '개선이행도',
            score: profile.improvementExecutionScore,
            subtitle: '0~5 실행계획 모호, 6~13 조치 2개+, 14~17 3개+ 흐름 명확, 18~20 담당·시점·확인방법 명시',
            tone: 'indigo' as const,
        },
        {
            label: '반복지적 보완',
            score: profile.repeatViolationPenalty,
            maxScore: 20,
            subtitle: '반복 표현 증빙 또는 명시 사유가 있을 때만 보완 지표에 반영',
            tone: 'rose' as const,
            penalty: true,
        },
    ];
    }, [record]);

    const scoreDropNeedsIntegrityReason = scoreDropAmount > 0;

    const buildScoreAdjustmentEntry = (): ScoreAdjustmentEntry | null => {
        if (!scoreDropNeedsIntegrityReason) return null;

        const previousScore = typeof initialRecord.safetyScore === 'number' ? initialRecord.safetyScore : 0;
        const nextScore = typeof record.safetyScore === 'number' ? record.safetyScore : 0;

        if (!scoreReasonCode) {
            alert(`${SAFETY_SIGNAL_COPY.score} 하향 사유 코드를 선택해주세요.`);
            return null;
        }
        if (scoreReasonDetail.trim().length < 3) {
            alert(`${SAFETY_SIGNAL_COPY.score} 하향 상세 사유를 3자 이상 입력해주세요.`);
            return null;
        }
        if (scoreEvidenceSummary.trim().length < 3) {
            alert('증빙 요약(현장 지적/기록 근거)을 3자 이상 입력해주세요.');
            return null;
        }

        return {
            timestamp: new Date().toISOString(),
            actor: 'manager',
            previousScore,
            nextScore,
            reasonCode: scoreReasonCode,
            reasonDetail: scoreReasonDetail.trim(),
            evidenceSummary: scoreEvidenceSummary.trim(),
        };
    };

    const persistRecordSilently = async (nextRecord: WorkerRecord) => {
        const consistentRecord = getConsistentRecord(nextRecord);
        await onUpdateRecord(consistentRecord);
        setRecord(consistentRecord);
        setHasChanges(false);
        return consistentRecord;
    };

    const handleSave = async (): Promise<boolean> => {
        const trimmedComment = approvalComment.trim();
        const approvalWasFinalized =
            record.reviewStatus === 'APPROVED' ||
            record.approvalStatus === 'APPROVED' ||
            record.approvalStatus === 'OVERRIDDEN';

        const shouldResetApproval = approvalWasFinalized && hasCriticalReviewEdits;

        const scoreAdjustmentEntry = buildScoreAdjustmentEntry();
        if (scoreDropNeedsIntegrityReason && !scoreAdjustmentEntry) return false;

        if (hasCriticalReviewEdits && hasWeakSaveReason) {
            const proceed = confirm(
                '핵심 수정사항이 있는데 저장 사유 코멘트가 비어 있거나 너무 짧습니다.\n\n' +
                '- 하단 승인영역 코멘트에 왜 수정했는지 남기면 추적성이 좋아집니다.\n' +
                '- 그대로 저장하면 분석 화면에서 "수정사유 보강 필요"로 표시됩니다.\n\n' +
                '그래도 1차 저장을 진행하시겠습니까?'
            );
            if (!proceed) return false;
        }

        const nextRecordBase: WorkerRecord = shouldResetApproval
            ? {
                ...record,
                adminComment: trimmedComment || record.adminComment,
                reviewReason: trimmedComment || record.reviewReason,
                reviewStatus: 'PENDING',
                approvalStatus: 'PENDING',
                approvalState: 'PENDING',
                workflowState: 'awaiting_manager_approval',
                secondPassStatus: 'NEEDED',
                approvedBy: undefined,
                approvedAt: undefined,
                auditTrail: [
                    ...(record.auditTrail || []),
                    {
                        stage: 'validation',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: '핵심 항목 수정으로 최종 확인 상태를 재검토 대기로 전환',
                    }
                ],
            }
            : {
                ...record,
                adminComment: trimmedComment || record.adminComment,
                reviewReason: trimmedComment || record.reviewReason,
            };

        const nextRecord: WorkerRecord = scoreAdjustmentEntry
            ? {
                ...nextRecordBase,
                scoreAdjustmentHistory: [
                    ...(nextRecordBase.scoreAdjustmentHistory || []),
                    scoreAdjustmentEntry,
                ],
                auditTrail: [
                    ...(nextRecordBase.auditTrail || []),
                    {
                        stage: 'validation',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: `${SAFETY_SIGNAL_COPY.score} 하향 무결성 검증: ${scoreAdjustmentEntry.reasonCode} | ${scoreAdjustmentEntry.reasonDetail} | 증빙: ${scoreAdjustmentEntry.evidenceSummary}`,
                    }
                ],
            }
            : nextRecordBase;

        await persistRecordSilently(withHarnessState(record, nextRecord));
        setScoreReasonCode('');
        setScoreReasonDetail('');
        setScoreEvidenceSummary('');
        setPhotoQueueNotice(null);
        alert(shouldResetApproval ? '저장되었습니다. 핵심 변경으로 최종 확인 상태가 재검토 대기로 변경되었습니다.' : '저장되었습니다.');
        return true;
    };

    const handleSaveAndOpenNext = async () => {
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
        }
        const saved = await handleSave();
        if (saved && onOpenNextRecord) {
            onOpenNextRecord();
        }
    };

    const isFinalizedRecord = useMemo(() => {
        return record.reviewStatus === 'APPROVED'
            || record.approvalStatus === 'APPROVED'
            || record.approvalStatus === 'OVERRIDDEN';
    }, [record.approvalStatus, record.reviewStatus]);

    const runSecondaryProcessing = async (baseRecord: WorkerRecord): Promise<WorkerRecord> => {
        setIsUpdatingAnalysis(true);
        try {
            const updatedAnalysis = await updateAnalysisBasedOnEdits(baseRecord);
            if (updatedAnalysis) {
                const reassessedRecord: WorkerRecord = {
                    ...baseRecord,
                    ...updatedAnalysis,
                    auditTrail: [
                        ...(baseRecord.auditTrail || []),
                        {
                            stage: 'reassessment',
                            timestamp: new Date().toISOString(),
                            actor: 'manager',
                            note: buildReassessmentAuditNote(baseRecord, updatedAnalysis),
                        }
                    ]
                };
                return synchronizeManagerReviewedRecord(reassessedRecord, {
                    appendAuditTrail: true,
                    actor: 'manager',
                }).record;
            }

            return {
                ...baseRecord,
                auditTrail: [
                    ...(baseRecord.auditTrail || []),
                    {
                        stage: 'reassessment',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: `수정 반영 분석 ${BRAND_STATUS_LABELS.attention}: AI가 갱신 결과를 반환하지 않음`,
                    }
                ]
            };
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'unknown error';
            return {
                ...baseRecord,
                auditTrail: [
                    ...(baseRecord.auditTrail || []),
                    {
                        stage: 'reassessment',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: `수정 반영 분석 ${BRAND_STATUS_LABELS.attention}: ${errorMessage}`,
                    }
                ]
            };
        } finally {
            setIsUpdatingAnalysis(false);
        }
    };

    const showReviewCommentField = true;

    const handleOpenReportClick = () => {
        if (hasChanges) {
            const shouldSaveFirst = confirm('저장되지 않은 변경사항이 있습니다.\n1차 저장 후 안전 리포트로 이동하시겠습니까?');
            if (shouldSaveFirst) {
                onUpdateRecord(record);
                setHasChanges(false);
            }
        }
        onOpenReport(record);
    };

    const handleAddAction = () => {
        if (!actionDetail.trim()) {
            alert('조치 내용을 입력해주세요.');
            return;
        }
        const nextRecord: WorkerRecord = getConsistentRecord({
            ...record,
            actionHistory: [
                ...(record.actionHistory || []),
                {
                    timestamp: new Date().toISOString(),
                    actor: 'manager',
                    actionType,
                    detail: actionDetail.trim(),
                }
            ],
            auditTrail: [
                ...(record.auditTrail || []),
                {
                    stage: 'action',
                    timestamp: new Date().toISOString(),
                    actor: 'manager',
                    note: `${actionType}: ${actionDetail.trim()}`,
                }
            ]
        });
        setRecord(nextRecord);
        onUpdateRecord(nextRecord);
        setActionDetail('');
        setHasChanges(false);
        alert('조치 이력이 등록되었습니다.');
    };

    const handleApprove = async (status: 'approved' | 'rejected') => {
        setPendingApprovalAction(status);
        const effectiveApprover = strictRoleGate ? 'safety-manager' : approverRole;

        if (status === 'approved') {
            const blockers = [
                ...getApprovalBlockers(record, effectiveApprover),
                ...getManagerReviewApprovalBlockers(record),
            ];
            if (blockers.length > 0) {
                const nextRecord: WorkerRecord = {
                    ...record,
                    auditTrail: [
                        ...(record.auditTrail || []),
                        {
                            stage: 'validation',
                            timestamp: new Date().toISOString(),
                            actor: effectiveApprover,
                            note: `승인 차단: ${blockers.join(' | ')}`,
                        }
                    ]
                };
                setRecord(nextRecord);
                await onUpdateRecord(nextRecord);
                setPendingApprovalAction(null);
                alert(`승인을 진행할 수 없습니다.\n(검증 기준: ${effectiveApprover === 'safety-manager' ? '안전관리자(엄격)' : '현장소장(기본)'})\n\n${blockers.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`);
                return;
            }
        }

        const trimmedComment = approvalComment.trim();
        const commentRequired = status === 'rejected' || hasCriticalReviewEdits;
        if (commentRequired && trimmedComment.length === 0) {
            setPendingApprovalAction(null);
            alert(status === 'rejected'
                ? '반려 사유(Comment)는 필수입니다.'
                : '수정 사항이 있으므로 승인 사유(Comment)는 필수입니다.');
            return;
        }

        if ((status === 'rejected' || trimmedComment.length > 0 || hasCriticalReviewEdits) && hasWeakApprovalReason) {
            const proceed = confirm(
                '승인/반려 사유가 비어 있거나 너무 짧습니다.\n\n' +
                '- 검토 근거, 확인 범위, 반영 내용을 포함하면 추적성이 좋아집니다.\n' +
                '- 현재 상태로 진행하면 분석 화면에서 사유 보강 대상으로 보일 수 있습니다.\n\n' +
                '그래도 계속 진행하시겠습니까?'
            );
            if (!proceed) {
                setPendingApprovalAction(null);
                return;
            }
        }

        const scoreAdjustmentEntry = buildScoreAdjustmentEntry();
        if (scoreDropNeedsIntegrityReason && !scoreAdjustmentEntry) {
            setPendingApprovalAction(null);
            return;
        }

        let harnessDecision: Awaited<ReturnType<typeof approveHarnessRecord>>;
        try {
            harnessDecision = await approveHarnessRecord({
                workflowRunId: record.workflowRunId || record.id,
                recordId: record.id,
                approver: effectiveApprover,
                action: status === 'approved' ? 'approve' : 'reject',
                comment: trimmedComment || undefined,
                currentDecision: inferHarnessRiskDecision(record),
            });
        } catch (error) {
            const guidance = buildHarnessTransitionGuidance({
                message: error instanceof Error ? error.message : '',
                workflowState: record.workflowState || inferHarnessWorkflowState(record),
                approvalState: record.approvalState || inferHarnessApprovalState(record, record.workflowState || inferHarnessWorkflowState(record)),
            });
            const nextRecord: WorkerRecord = {
                ...record,
                auditTrail: [
                    ...(record.auditTrail || []),
                    {
                        stage: 'approval',
                        timestamp: new Date().toISOString(),
                        actor: effectiveApprover,
                        note: `판단 흐름 전환 거부: ${error instanceof Error ? error.message : '상태 전환 조건 불일치'}`,
                    },
                ],
            };
            setRecord(nextRecord);
            await onUpdateRecord(nextRecord);
            setPendingApprovalAction(null);
            alert(`${guidance.title}\n\n${guidance.description}`);
            return;
        }

        const nextRecordBase: WorkerRecord = {
            ...record,
            workflowRunId: harnessDecision.workflowRunId,
            workflowState: harnessDecision.workflowState,
            riskDecision: harnessDecision.riskDecision,
            approvalState: harnessDecision.approvalState,
            secondPassStatus: harnessDecision.secondPassStatus,
            harnessPersistenceWarning: harnessDecision.persistence?.warning || undefined,
            reviewStatus: status === 'approved' ? 'APPROVED' : 'REJECTED',
            adminComment: trimmedComment || undefined,
            reviewReason: trimmedComment || undefined,
            approvalStatus: status === 'approved' ? 'APPROVED' : 'PENDING',
            approvedBy: status === 'approved' ? effectiveApprover : record.approvedBy,
            approvedAt: status === 'approved' ? new Date().toISOString() : record.approvedAt,
            approvalReason: trimmedComment || record.approvalReason,
            approvalHistory: [
                ...(record.approvalHistory || []),
                {
                    timestamp: new Date().toISOString(),
                    actor: effectiveApprover,
                    status,
                    comment: trimmedComment || undefined,
                }
            ],
            auditTrail: [
                ...(record.auditTrail || []),
                {
                    stage: 'approval',
                    timestamp: new Date().toISOString(),
                    actor: effectiveApprover,
                    note: status === 'approved'
                        ? `최종 승인${trimmedComment ? ` (${trimmedComment})` : ''}`
                        : `반려${trimmedComment ? ` (${trimmedComment})` : ''}`,
                },
                {
                    stage: 'approval',
                    timestamp: new Date().toISOString(),
                    actor: effectiveApprover,
                    note: `검증 승인 기준 동기화: ${harnessDecision.workflowState} · ${harnessDecision.approvalState} · ${harnessDecision.riskDecision}`,
                }
            ]
        };

        const nextRecord: WorkerRecord = getConsistentRecord(withHarnessState(record, scoreAdjustmentEntry
            ? {
                ...nextRecordBase,
                scoreAdjustmentHistory: [
                    ...(nextRecordBase.scoreAdjustmentHistory || []),
                    scoreAdjustmentEntry,
                ],
                auditTrail: [
                    ...(nextRecordBase.auditTrail || []),
                    {
                        stage: 'validation',
                        timestamp: new Date().toISOString(),
                        actor: 'manager',
                        note: `${SAFETY_SIGNAL_COPY.score} 하향 무결성 검증: ${scoreAdjustmentEntry.reasonCode} | ${scoreAdjustmentEntry.reasonDetail} | 증빙: ${scoreAdjustmentEntry.evidenceSummary}`,
                    }
                ],
            }
            : nextRecordBase));

        if (status === 'rejected') {
            setRecord(nextRecord);
            await onUpdateRecord(nextRecord);
            void refreshHarnessStatus(nextRecord.workflowRunId);
            setScoreReasonCode('');
            setScoreReasonDetail('');
            setScoreEvidenceSummary('');
            setApprovalComment('');
            setPendingApprovalAction(null);
            setHasChanges(false);
            alert('반려가 기록되었습니다.');
            return;
        }

        const finalApprovedRecord = await runSecondaryProcessing(nextRecord);
        const consistentFinalRecord = getConsistentRecord(finalApprovedRecord);
        setRecord(consistentFinalRecord);
        await onUpdateRecord(consistentFinalRecord);
        void refreshHarnessStatus(consistentFinalRecord.workflowRunId);
        setScoreReasonCode('');
        setScoreReasonDetail('');
        setScoreEvidenceSummary('');
        setApprovalComment('');
        setPendingApprovalAction(null);
        setHasChanges(false);
        alert('최종 승인이 기록되었습니다. 코멘트 기반 확정 데이터로 2차 가공이 실행되었습니다.');
    };

    const handleAnswerChange = (index: number, field: 'answerText' | 'koreanTranslation' | 'nativeTranslation', value: string) => {
        const updated = [...(record.handwrittenAnswers || [])];
        if (!updated[index]) return;
        updated[index] = {
            ...updated[index],
            [field]: value,
        };
        handleChange('handwrittenAnswers', updated);
    };

    const handleExportEvidencePdf = async () => {
        await exportEvidencePackagePdf(record);
    };

    const handleExportEvidenceCsv = () => {
        exportEvidencePackageCsv(record);
    };

    const handleExportHarnessAuditJson = () => {
        const exportTimestamp = buildExportTimestampMeta();
        const exportMeta = {
            source: 'harness_audit_export',
            version: 'v1',
            scope: `record:${record.id}`,
        };

        const normalizedTransitionActions = harnessTransitionActions.map((item) => ({
            action: item.action,
            actionLabel: getHarnessTransitionActionLabel(item.action),
            allowed: item.allowed,
            nextWorkflowState: item.nextWorkflowState,
            nextWorkflowStateLabel: item.nextWorkflowState ? getHarnessWorkflowStateLabel(item.nextWorkflowState) : '유지',
            reason: item.reason,
            normalizedReason: item.allowed
                ? null
                : normalizeHarnessTransitionReason(item.reason, getHarnessWorkflowStateLabel),
        }));

        const payload = {
            exportedAt: exportTimestamp.iso,
            exportedAtKst: exportTimestamp.kst,
            exportMeta,
            fieldLabels: {
                section: '섹션 코드',
                item: '항목 코드',
                value: '값',
                detail: '세부 설명',
                sectionLabelHint: 'CSV 내보내기의 sectionLabel을 참고하세요.',
                itemLabelHint: 'CSV 내보내기의 itemLabel을 참고하세요.',
            },
            recordId: record.id,
            workerName: record.name,
            workflowRunId: record.workflowRunId || '',
            workflowState: record.workflowState || inferHarnessWorkflowState(record),
            riskDecision: record.riskDecision || inferHarnessRiskDecision(record),
            approvalState: record.approvalState || inferHarnessApprovalState(record, record.workflowState || inferHarnessWorkflowState(record)),
            secondPassStatus: record.secondPassStatus || 'NONE',
            persistence: {
                persisted: isHarnessPersisted,
                warning: harnessStatusWarning,
                diagnostics: harnessDiagnostics,
            },
            summaries: {
                analyzer: harnessAnalyzerSummary,
                evaluator: harnessEvaluatorSummary,
                latestApprovalDiff: harnessLatestApprovalDiff,
                transitionActions: normalizedTransitionActions,
            },
            versions: {
                prompt: harnessPromptVersion,
                policy: harnessPolicyVersion,
                details: harnessVersionDetails,
                changeSummary: harnessVersionChangeSummary,
            },
            counts: {
                overrides: harnessOverrides.length,
                approvals: harnessApprovals.length,
                timeline: harnessTimeline.length,
                sensorEvents: Array.isArray(harnessContextSnapshot?.sensorEvents) ? harnessContextSnapshot.sensorEvents.length : 0,
            },
            contextSnapshot: harnessContextSnapshot,
            overrides: harnessOverrides,
            approvals: harnessApprovals,
            timeline: harnessTimeline,
            evidenceChecklist: harnessEvidenceChecklistItems,
        };

        downloadTextFile(
            buildPsiExportFileName({ tokens: ['Harness', 'Audit', record.id], extension: 'json' }),
            JSON.stringify(payload, null, 2),
            'application/json;charset=utf-8;'
        );
    };

    const handleExportHarnessAuditCsv = () => {
        const exportTimestamp = buildExportTimestampMeta();
        const rows: string[][] = [
            ['section', 'sectionLabel', 'item', 'itemLabel', 'value', 'detail'],
            ['record', 'recordId', record.id, ''],
            ['record', 'workerName', record.name, ''],
            ['record', 'workflowRunId', record.workflowRunId || '', ''],
            ['record', 'workflowState', record.workflowState || inferHarnessWorkflowState(record), ''],
            ['record', 'riskDecision', record.riskDecision || inferHarnessRiskDecision(record), ''],
            ['record', 'approvalState', record.approvalState || inferHarnessApprovalState(record, record.workflowState || inferHarnessWorkflowState(record)), ''],
            ['record', 'secondPassStatus', record.secondPassStatus || 'NONE', ''],
            ['summary', 'exportedAt', exportTimestamp.iso, exportTimestamp.kst],
            ['summary', 'exportSource', 'harness_audit_export', ''],
            ['summary', 'exportVersion', 'v1', ''],
            ['summary', 'exportScope', `record:${record.id}`, ''],
            ['persistence', 'persisted', typeof isHarnessPersisted === 'boolean' ? (isHarnessPersisted ? 'YES' : 'NO') : 'UNKNOWN', harnessStatusWarning || ''],
            ['summary', 'overrideCount', String(harnessOverrides.length), ''],
            ['summary', 'approvalCount', String(harnessApprovals.length), ''],
            ['summary', 'timelineCount', String(harnessTimeline.length), ''],
            ['summary', 'analyzerSummary', harnessAnalyzerSummary.summary || '', typeof harnessAnalyzerSummary.confidence === 'number' ? `${Math.round(harnessAnalyzerSummary.confidence * 100)}%` : ''],
            ['summary', 'evaluatorFlags', String(harnessEvaluatorSummary.flags.length), harnessEvaluatorSummary.flags.join(' | ')],
            ['summary', 'evaluatorEvidenceSufficiency', String(harnessEvaluatorSummary.evidenceSufficiency ?? ''), `humanApproval=${typeof harnessEvaluatorSummary.requiresHumanApproval === 'boolean' ? (harnessEvaluatorSummary.requiresHumanApproval ? 'YES' : 'NO') : 'UNKNOWN'}`],
            ['summary', 'allowedTransitionActions', String(harnessTransitionActionSummary.allowed.length), harnessTransitionActionSummary.allowed.map((item) => `${getHarnessTransitionActionLabel(item.action)}:${formatHarnessTransitionStatusText(item, getHarnessWorkflowStateLabel)}`).join(' | ')],
            ['summary', 'blockedTransitionActions', String(harnessTransitionActionSummary.blocked.length), harnessTransitionActionSummary.blocked.map((item) => `${getHarnessTransitionActionLabel(item.action)}:${formatHarnessTransitionStatusText(item, getHarnessWorkflowStateLabel)}`).join(' | ')],
            ['version', 'promptVersion', harnessPromptVersion?.version || '', harnessPromptVersion?.checksum || ''],
            ['version', 'policyVersion', harnessPolicyVersion?.version || '', harnessPolicyVersion?.checksum || ''],
            ['version', 'promptChangeSummary', harnessVersionChangeSummary.prompt.join(' | '), ''],
            ['version', 'policyChangeSummary', harnessVersionChangeSummary.policy.join(' | '), ''],
            ['version', 'ruleChangeSummary', harnessVersionChangeSummary.rule.join(' | '), ''],
        ];

        harnessOverrides.forEach((override, index) => {
            rows.push([
                'override',
                `${index + 1}:${override.ruleCode}`,
                `${override.originalDecision || 'N/A'} => ${override.overriddenDecision || 'N/A'}`,
                `${override.severity} | ${override.ruleVersion || '미지정'} | ${override.message}`,
            ]);
        });

        harnessApprovals.forEach((approval, index) => {
            rows.push([
                'approval',
                `${index + 1}:${approval.approver}`,
                approval.action,
                `${approval.workflowStateAfter} | ${approval.approvalStateAfter} | ${approval.comment || ''}`,
            ]);
        });

        harnessTimeline.forEach((entry, index) => {
            rows.push([
                'timeline',
                `${index + 1}:${entry.stage}`,
                entry.timestamp,
                `${entry.actor || 'system'} | ${entry.note}`,
            ]);
        });

        harnessEvidenceChecklistItems.forEach((item, index) => {
            rows.push([
                'checklist',
                String(index + 1),
                item.key,
                item.content,
            ]);
        });

        const localizedRows = rows.map((row, index) => {
            if (index === 0) return row;
            const [section, item, value, detail] = row;
            return [
                section,
                getHarnessAuditSectionLabel(section),
                item,
                getHarnessAuditItemLabel(item),
                value,
                detail,
            ];
        });

        const csv = localizedRows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
        downloadTextFile(
            buildPsiExportFileName({ tokens: ['Harness', 'Audit', record.id], extension: 'csv' }),
            '\uFEFF' + csv,
            'text/csv;charset=utf-8;'
        );
    };

    const handleReanalyzeClick = async () => {
        if(confirm("이미지를 다시 읽어 분석하시겠습니까? (현재 수정사항은 사라질 수 있습니다)")) {
            try {
                const updatedRecord = await onReanalyze(record);
                if (updatedRecord) {
                    setRecord(getConsistentRecord(updatedRecord));
                    alert('이미지 재분석이 완료되었습니다.');
                }
            } catch (error) {
                const guidance = buildHarnessTransitionGuidance({
                    message: error instanceof Error ? error.message : '',
                    workflowState: record.workflowState || inferHarnessWorkflowState(record),
                    approvalState: record.approvalState || inferHarnessApprovalState(record, record.workflowState || inferHarnessWorkflowState(record)),
                });
                alert(`${guidance.title}\n\n${guidance.description}`);
            }
        }
    };

    const handleReflectChanges = async () => {
        if (isFinalizedRecord) {
            alert('최종확정 건은 본 버튼에서 갱신할 수 없습니다. 수정 후 [1차 저장] 시 재검토 대기로 전환됩니다.');
            return;
        }

        if (!hasChanges) {
            alert('반영할 수정사항이 없습니다.');
            return;
        }

        handleSave();
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'original' | 'profile') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const result = event.target?.result as string;
                if (result) {
                    if (type === 'original') {
                        setRecord(prev => ({ ...prev, originalImage: result, filename: file.name }));
                        setPhotoQueueNotice(null);
                    } else {
                        const nextRecord = { ...record, profileImage: result };
                        setRecord(nextRecord);
                        if (isPhotoQueueMode) {
                            try {
                                setIsPhotoAutoSaving(true);
                                setPhotoQueueNotice('사진 업로드 후 자동 저장 중입니다...');
                                await persistRecordSilently(nextRecord);
                                if (queueContext?.nextRecordName && onOpenNextRecord) {
                                    setPhotoQueueNotice(`사진 저장 완료. ${queueContext.nextRecordName}(으)로 자동 이동합니다...`);
                                    if (autoAdvanceTimerRef.current) {
                                        clearTimeout(autoAdvanceTimerRef.current);
                                    }
                                    autoAdvanceTimerRef.current = setTimeout(() => {
                                        autoAdvanceTimerRef.current = null;
                                        onOpenNextRecord();
                                    }, 900);
                                } else {
                                    setPhotoQueueNotice('사진 저장 완료. 마지막 대상입니다. 근로자관리 화면으로 돌아갑니다...');
                                    if (autoAdvanceTimerRef.current) {
                                        clearTimeout(autoAdvanceTimerRef.current);
                                    }
                                    autoAdvanceTimerRef.current = setTimeout(() => {
                                        autoAdvanceTimerRef.current = null;
                                        onClose();
                                    }, 1100);
                                }
                            } catch (error) {
                                console.error('프로필 사진 자동 저장 실패:', error);
                                setHasChanges(true);
                                setPhotoQueueNotice('자동 저장에 추가 확인 안내가 필요합니다. 상단 1차 저장 버튼으로 저장해 주세요.');
                            } finally {
                                setIsPhotoAutoSaving(false);
                            }
                        }
                    }
                    if (type === 'original' || !isPhotoQueueMode) {
                        setHasChanges(true);
                    }
                }
                e.target.value = '';
            };
            reader.readAsDataURL(file);
        }
    };

    const hasOriginalImage = !!record.originalImage && record.originalImage.length > 50;
    const hasProfileImage = !!record.profileImage && record.profileImage.length > 50;
    const isPhotoQueueMode = Boolean(queueContext);
    const competencyProfile = useMemo(() => deriveCompetencyProfile(record), [record]);
    const isKorean = isKoreanNationality(record.nationality);
    const timelineLocale = isKorean ? 'ko-KR' : 'en-US';
    const timelineDateTimeOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    };
    const reassessmentTitle = '재평가 전용 타임라인';
    const reassessmentEmpty = '재평가 이력이 없습니다.';
    const reassessmentTag = '[재평가]';
    const reassessmentTrail = (record.auditTrail || []).filter(entry => entry.stage === 'reassessment').slice(-10).reverse();
    const latestApprovalEntry = (record.approvalHistory || []).slice(-1)[0];
    const latestScoreAdjustment = (record.scoreAdjustmentHistory || []).slice(-1)[0];
    const approvalSnapshot = approvalComment.trim() || record.reviewReason || record.adminComment || '';
    const sourcePreviewPanels = useMemo(() => {
        const previewLength = isCompactViewActive ? 40 : 180;
        const originalPreview = truncateText(record.fullText, previewLength) || '인식된 원문이 아직 정리되지 않았습니다.';
        const translatedPreview = truncateText(record.koreanTranslation || record.aiInsights, previewLength) || 'AI 해석이 아직 정리되지 않았습니다.';
        const managerPreview = truncateText(approvalSnapshot, previewLength)
            || (hasCriticalReviewEdits
                ? '수정된 항목이 있어 검토 근거를 남겨야 합니다.'
                : '아직 관리자 판단 메모가 없습니다. 승인 전 근거를 남겨주세요.');

        return [
            {
                key: 'original',
                eyebrow: '원문 신호',
                title: '인식 원문',
                body: originalPreview,
                tone: BRAND_TONE.slateText,
            },
            {
                key: 'translation',
                eyebrow: 'AI 해석',
                title: '한국어 판단 초안',
                body: translatedPreview,
                tone: BRAND_TONE.indigoText,
            },
            {
                key: 'manager',
                eyebrow: '관리자 판단',
                title: '검토 메모',
                body: managerPreview,
                tone: hasCriticalReviewEdits || pendingApprovalAction === 'rejected'
                    ? BRAND_TONE.amberText
                    : BRAND_TONE.emeraldText,
            },
        ];
    }, [approvalSnapshot, hasCriticalReviewEdits, isCompactViewActive, pendingApprovalAction, record.aiInsights, record.fullText, record.koreanTranslation]);
    const reviewDecisionCards = useMemo(() => {
        const confidenceLabel = typeof record.ocrConfidence === 'number' ? `${(record.ocrConfidence * 100).toFixed(0)}%` : '확인 필요';
        const integrityLabel = typeof record.integrityScore === 'number' ? `${record.integrityScore}점` : '확인 필요';
        const changedFieldCount = hasCriticalReviewEdits
            ? ['safetyScore', 'fullText', 'koreanTranslation', 'aiInsights', 'handwrittenAnswers'].filter((field) => JSON.stringify(initialRecord[field as keyof WorkerRecord]) !== JSON.stringify(record[field as keyof WorkerRecord])).length
            : 0;

        let stateTitle = '최종 판단 전 확인 단계';
        let stateDescription = '원문, AI 해석, 관리자 메모를 맞춰보며 승인 여부를 결정할 시점입니다.';
        let stateTone = 'border-slate-200 bg-white';

        if (record.reviewStatus === 'REJECTED') {
            stateTitle = '보완 요청이 열린 상태';
            stateDescription = truncateText(record.reviewReason, 100) || '재촬영 또는 재작성 안내가 기록되어 있습니다.';
            stateTone = 'border-rose-200 bg-rose-50';
        } else if (isFinalizedRecord) {
            stateTitle = '보호 판단이 확정된 상태';
            stateDescription = truncateText(record.approvalReason, 100) || '검토와 2차 가공이 반영된 확정 기록입니다.';
            stateTone = 'border-emerald-200 bg-emerald-50';
        } else if (hasChanges) {
            stateTitle = '수정 반영 대기 상태';
            stateDescription = `${changedFieldCount || 1}개 핵심 항목이 조정되어 1차 저장 또는 승인 근거 입력이 필요합니다.`;
            stateTone = 'border-amber-200 bg-amber-50';
        }

        const evidenceParts = [
            `원문 인식 상태 ${confidenceLabel}`,
            `무결성 ${integrityLabel}`,
            record.ocrErrorType ? ocrErrorGuide[record.ocrErrorType] : '자동 판독 경고는 없지만 원문-번역 일치를 확인해야 합니다.',
        ];
        if (latestScoreAdjustment) {
            evidenceParts.push(`최근 ${SAFETY_SIGNAL_COPY.score} 조정: ${latestScoreAdjustment.previousScore}→${latestScoreAdjustment.nextScore}`);
        }

        let nextActionTitle = '승인 준비 진행';
        let nextActionDescription = showReviewCommentField
            ? '검토 근거를 남기고 최종 승인을 진행하면 2차 가공이 이어집니다.'
            : 'AI 해석과 수기 답변을 빠르게 대조한 뒤 승인 또는 보완 요청을 선택하세요.';
        let nextActionTone = 'border-indigo-200 bg-indigo-50';

        if (pendingApprovalAction === 'rejected' || record.reviewStatus === 'REJECTED') {
            nextActionTitle = '보완 요청 구체화';
            nextActionDescription = '어떤 부분을 다시 촬영·재작성해야 하는지 코멘트에 남겨 현장이 바로 움직일 수 있게 해주세요.';
            nextActionTone = 'border-rose-200 bg-rose-50';
        } else if (isFinalizedRecord) {
            nextActionTitle = '후속 공유 단계';
            nextActionDescription = '확정된 내용을 리포트와 증빙 패키지로 연결해 현장 보호 조치를 이어가면 됩니다.';
            nextActionTone = 'border-emerald-200 bg-emerald-50';
        } else if (hasCriticalReviewEdits && approvalComment.trim().length === 0) {
            nextActionTitle = '검토 근거 입력 우선';
            nextActionDescription = '수정된 항목이 있으므로 왜 바꿨는지 먼저 남겨야 승인 흐름이 매끄럽습니다.';
            nextActionTone = 'border-amber-200 bg-amber-50';
        }

        return [
            {
                key: 'state',
                eyebrow: '지금 상태',
                title: stateTitle,
                description: stateDescription,
                tone: stateTone,
            },
            {
                key: 'evidence',
                eyebrow: '판단 근거',
                title: '무엇을 보고 판단할지',
                description: evidenceParts.join(' · '),
                tone: BRAND_TONE.slate,
            },
            {
                key: 'next-action',
                eyebrow: '다음 행동',
                title: nextActionTitle,
                description: nextActionDescription,
                tone: nextActionTone,
            },
        ];
    }, [approvalComment, hasChanges, hasCriticalReviewEdits, initialRecord, isFinalizedRecord, latestScoreAdjustment, pendingApprovalAction, record, showReviewCommentField]);
    const reviewMetaChips = useMemo(() => {
        const workflowState = record.workflowState || inferHarnessWorkflowState(record);
        const riskDecision = record.riskDecision || inferHarnessRiskDecision(record);
        const reviewStatusLabel = record.reviewStatus === 'APPROVED'
            ? '최종 확인 완료'
            : record.reviewStatus === 'REJECTED'
                ? '보완 요청'
                : '검토 대기';

        return [
            { key: 'review', label: '검토 상태', value: reviewStatusLabel },
            { key: 'approval', label: '최종 확인', value: getHarnessApprovalStateLabel(record.approvalState || inferHarnessApprovalState(record, workflowState)) },
            { key: 'workflow', label: '판단 흐름', value: getHarnessWorkflowStateLabel(workflowState) },
            { key: 'risk', label: '보호 판단', value: getHarnessRiskDecisionLabel(riskDecision) },
            { key: 'history', label: '최근 확인', value: latestApprovalEntry ? `${latestApprovalEntry.status} · ${new Date(latestApprovalEntry.timestamp).toLocaleDateString('ko-KR')}` : '이력 없음' },
        ];
    }, [latestApprovalEntry, record]);
    const compactReviewMetaChips = useMemo(() => reviewMetaChips.filter((chip) => chip.key === 'approval'), [reviewMetaChips]);
    const compactSourcePreviewPanels = useMemo(() => sourcePreviewPanels.filter((panel) => panel.key === 'manager'), [sourcePreviewPanels]);
    const secondaryMetaText = useMemo(() => {
        const workflowChip = reviewMetaChips.find((chip) => chip.key === 'workflow');
        const historyChip = reviewMetaChips.find((chip) => chip.key === 'history');
        return `${workflowChip?.label}: ${workflowChip?.value || '-'} · ${historyChip?.label}: ${historyChip?.value || '-'}`;
    }, [reviewMetaChips]);
    const answerComparisonSummary = useMemo(() => {
        const total = record.handwrittenAnswers.length;
        const translated = record.handwrittenAnswers.filter((answer) => answer.koreanTranslation.trim().length > 0).length;
        const originalReady = record.handwrittenAnswers.filter((answer) => answer.answerText.trim().length > 0).length;
        return {
            total,
            translated,
            originalReady,
        };
    }, [record.handwrittenAnswers]);
    const verificationAudit = useMemo(() => evaluateOcrVerificationCompleteness(record), [record]);
    const qualityAudit = useMemo(() => evaluateOcrVerificationQuality(record), [record]);
    const nativeWritingGuide = useMemo(() => getNativeWritingGuide(record.nationality), [record.nationality]);
    const nativeLanguageLabel = useMemo(() => getNativeLanguageLabel(record.nationality), [record.nationality]);
    const finalAuditVerdict = useMemo(() => {
        if (!verificationAudit.isComplete) {
            return {
                label: '반려 권고',
                reason: verificationAudit.issues.join(' / '),
                tone: BRAND_TONE.rose,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-rose-500',
                valueClassName: 'mt-1 text-xs font-black text-rose-700',
            };
        }

        if (!qualityAudit.isHealthy) {
            return {
                label: '보정 필요',
                reason: qualityAudit.issues.join(' / '),
                tone: BRAND_TONE.amber,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-500',
                valueClassName: 'mt-1 text-xs font-black text-amber-700',
            };
        }

        return {
            label: '합격',
            reason: `검증 상태/영어 혼입/모국어 문항 번역/${SAFETY_SIGNAL_COPY.score} 과대 의심 모두 정상`,
            tone: BRAND_TONE.emerald,
            labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500',
            valueClassName: 'mt-1 text-xs font-black text-emerald-700',
        };
    }, [qualityAudit, verificationAudit]);
    const auditTemplateLine = useMemo(() => {
        return [
            `국가=${record.nationality}`,
            `검증=${verificationAudit.isComplete ? '정상' : '미달'}`,
            `영어혼입=${qualityAudit.hasEnglishInKorean || qualityAudit.hasEnglishInNative ? '있음' : '없음'}`,
            `문항모국어누락=${qualityAudit.missingNativeAnswerTranslationCount}건`,
            `${SAFETY_SIGNAL_COPY.scoreCompact}과대의심=${qualityAudit.scoreOverestimateRisk ? '예' : '아니오'}`,
            `최종판정=${finalAuditVerdict.label}`,
        ].join(' | ');
    }, [finalAuditVerdict.label, qualityAudit, record.nationality, verificationAudit.isComplete]);
    const auditOnePageSummary = useMemo(() => {
        const issueText = [
            ...verificationAudit.issues,
            ...qualityAudit.issues,
        ].filter((value, index, array) => array.indexOf(value) === index);

        return [
            `[원문 재확인 검증 요약]`,
            `- 근로자: ${record.name || '미상'}`,
            `- 국가/언어: ${record.nationality} / ${nativeLanguageLabel}`,
            `- 공종: ${record.jobField || '미상'}`,
            `- ${SAFETY_SIGNAL_COPY.score}: ${Number(record.safetyScore || 0).toFixed(1)}`,
            `- 최종 판정: ${finalAuditVerdict.label}`,
            `- 구조 검증: ${verificationAudit.isComplete ? '정상' : verificationAudit.issues.join(', ')}`,
            `- 품질 점검: ${qualityAudit.isHealthy ? '정상' : qualityAudit.issues.join(', ')}`,
            `- 문항 원문/한국어/모국어: ${answerComparisonSummary.originalReady} / ${answerComparisonSummary.translated} / ${verificationAudit.nativeTranslatedAnswerCount ?? 0}`,
            `- 조치 의견: ${issueText.length === 0 ? '추가 보정 없이 운영 가능' : issueText.join(' / ')}`,
        ].join('\n');
    }, [answerComparisonSummary.originalReady, answerComparisonSummary.translated, finalAuditVerdict.label, nativeLanguageLabel, qualityAudit, record.jobField, record.name, record.nationality, record.safetyScore, verificationAudit]);
    const nativeGuidancePreview = useMemo(
        () => String(record.aiInsights_native || '').trim() || buildFallbackNativeGuidanceText(record),
        [record],
    );
    const decisionBoardTone = useMemo(() => {
        if (record.reviewStatus === 'REJECTED') {
            return {
                container: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-white',
                eyebrow: 'text-rose-500',
                badge: 'roseSoft' as const,
                accent: 'bg-rose-500',
            };
        }
        if (isFinalizedRecord) {
            return {
                container: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white',
                eyebrow: 'text-emerald-600',
                badge: 'emeraldSoft' as const,
                accent: 'bg-emerald-500',
            };
        }
        if (hasChanges) {
            return {
                container: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white',
                eyebrow: 'text-amber-600',
                badge: 'amberSoft' as const,
                accent: 'bg-amber-500',
            };
        }
        return {
            container: 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white',
            eyebrow: 'text-indigo-600',
            badge: 'violetSoft' as const,
            accent: 'bg-indigo-500',
        };
    }, [hasChanges, isFinalizedRecord, record.reviewStatus]);
    const decisionQuickMetrics = useMemo(() => {
        const confidenceValue = typeof record.ocrConfidence === 'number' ? record.ocrConfidence : null;
        const confidenceLabel = confidenceValue !== null ? `${(confidenceValue * 100).toFixed(0)}%` : '확인 필요';
        const confidenceTone = !hasOriginalImage
            ? 'border-rose-200 bg-rose-50'
            : confidenceValue === null
                ? 'border-slate-200 bg-slate-50'
                : confidenceValue >= 0.8
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50';

        return [
            {
                key: 'score',
                label: SAFETY_SIGNAL_COPY.score,
                value: `${Number(record.safetyScore || 0).toFixed(0)}`,
                helper: `${SAFETY_SIGNAL_COPY.level} ${supportStageLabel}`,
                tone: 'border-slate-200 bg-white',
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                valueClassName: 'mt-1 text-2xl font-black text-slate-900',
            },
            {
                key: 'confidence',
                label: '원문 인식',
                value: confidenceLabel,
                helper: hasOriginalImage ? '원본 이미지 있음' : '원본 이미지 없음',
                tone: confidenceTone,
                labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${confidenceValue !== null && confidenceValue >= 0.8 ? 'text-emerald-600' : !hasOriginalImage ? 'text-rose-600' : 'text-amber-600'}`,
                valueClassName: 'mt-1 text-2xl font-black text-slate-900',
            },
            {
                key: 'audit',
                label: '검증 판정',
                value: finalAuditVerdict.label,
                helper: finalAuditVerdict.reason,
                tone: finalAuditVerdict.tone,
                labelClassName: finalAuditVerdict.labelClassName,
                valueClassName: finalAuditVerdict.valueClassName,
                helperClassName: 'mt-1 line-clamp-2 text-[11px] font-bold leading-relaxed text-slate-600',
            },
            {
                key: 'answers',
                label: '문항 대조',
                value: `${answerComparisonSummary.originalReady}/${answerComparisonSummary.translated}/${verificationAudit.nativeTranslatedAnswerCount ?? 0}`,
                helper: '원문 / 한국어 / 모국어',
                tone: verificationAudit.isComplete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
                labelClassName: verificationAudit.isComplete
                    ? 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600'
                    : 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-600',
                valueClassName: 'mt-1 text-2xl font-black text-slate-900',
            },
        ];
    }, [answerComparisonSummary.originalReady, answerComparisonSummary.translated, finalAuditVerdict, hasOriginalImage, record.ocrConfidence, record.safetyScore, supportStageLabel, verificationAudit.isComplete, verificationAudit.nativeTranslatedAnswerCount]);
    const activeReviewModeCopy = useMemo(() => {
        if (isProfessionalReviewView) {
            return {
                eyebrow: '개발자 검증 보기',
                title: '판독 품질과 변경 이력을 끝까지 확인합니다.',
                description: '현장 판단 뒤에 남는 OCR 품질, 증빙 고유값, 정책 버전, 변경 이력을 한 번에 점검하는 내부 검증 화면입니다.',
                comparisonTitle: '원문, AI 해석, 관리자 판단과 개발자 검증 근거를 함께 비교합니다.',
            };
        }
        if (!isCompactViewActive) {
            return {
                eyebrow: '관리자 원문 대조',
                title: '원본과 해석을 나란히 확인합니다.',
                description: '근로자가 쓴 원문, AI 해석, 관리자 수정, 보완 조치를 함께 보며 보호 판단을 확정합니다.',
                comparisonTitle: '원문, AI 해석, 관리자 판단을 나란히 비교합니다.',
            };
        }
        return {
            eyebrow: '근로자 보호 판단',
            title: '이 근로자에게 지금 필요한 교육과 조치를 먼저 봅니다.',
            description: '근로자가 적은 위험, 관리자 확인 여부, 오늘 전달할 교육 문장과 다음 행동만 남겨 현장에서 빠르게 처리합니다.',
            comparisonTitle: '관리자 판단 메모와 교육 안내를 우선 확인합니다.',
        };
    }, [isCompactViewActive, isProfessionalReviewView]);
    const visibleReviewDecisionCards = useMemo(() => {
        return isCompactViewActive
            ? reviewDecisionCards.filter((card) => card.key !== 'evidence')
            : reviewDecisionCards;
    }, [isCompactViewActive, reviewDecisionCards]);
    const visibleDecisionQuickMetrics = useMemo(() => {
        return isCompactViewActive
            ? decisionQuickMetrics.filter((metric) => ['score', 'audit'].includes(metric.key))
            : decisionQuickMetrics;
    }, [decisionQuickMetrics, isCompactViewActive]);
    
    // Icon Display
    const isLeader = (record.role === 'leader') || (record.name === record.teamLeader);
    const isSubLeader = record.role === 'sub_leader';

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex justify-center items-end sm:items-center p-0 sm:p-4 backdrop-blur-md" onClick={onClose}>
            <div className="bg-white rounded-t-2xl sm:rounded-3xl shadow-2xl w-full max-w-7xl h-[100vh] sm:h-[95vh] flex flex-col overflow-hidden animate-fade-in-up" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-white z-20 shrink-0 gap-2">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                        <div className="min-w-0">
                            <h2 className="text-base sm:text-xl font-black text-slate-800 truncate">{record.name || '기록 확인'} 근로자 보호 판단</h2>
                            <p className="hidden sm:block text-[10px] text-indigo-500 font-bold tracking-widest uppercase">
                                {record.jobField || '공종 미확인'} · {record.nationality || '국적 미확인'} · 현장 판단 검증
                            </p>
                            {queueContext && (
                                <p className="hidden sm:block text-[11px] font-black text-emerald-600 mt-1">사진 등록 작업 {queueContext.currentIndex} / {queueContext.total}{queueContext.nextRecordName ? ` · 다음 ${queueContext.nextRecordName}` : ' · 마지막 대상'}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {queueContext && onOpenNextRecord && hasProfileImage && (
                            <button disabled={isPhotoAutoSaving} onClick={hasChanges ? () => { void handleSaveAndOpenNext(); } : onOpenNextRecord} className={`px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-sm font-black shadow-lg whitespace-nowrap ${isPhotoAutoSaving ? 'bg-slate-200 text-slate-500 shadow-none cursor-not-allowed' : 'bg-emerald-600 text-white shadow-emerald-200 hover:bg-emerald-500'}`}>
                                {isPhotoAutoSaving ? '자동 저장 중...' : hasChanges ? '저장 후 다음' : '지금 다음 열기'}
                            </button>
                        )}
                        {hasChanges && (
                            <button onClick={() => { void handleSave(); }} className="px-3 sm:px-6 py-2 bg-indigo-600 text-white rounded-xl text-[11px] sm:text-sm font-black shadow-lg shadow-indigo-200 animate-pulse whitespace-nowrap">1차 저장</button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                </header>

                <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
                    {/* LEFT: DOCUMENT IMAGE AREA */}
                    <div className="w-full lg:w-[50%] bg-slate-900 overflow-y-auto custom-scrollbar relative border-r border-slate-800 p-4 sm:p-8 flex flex-col items-center">
                        <div className="sticky top-0 left-0 z-10 mb-4 sm:mb-6 w-full flex justify-between items-center gap-2 sm:gap-4">
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <StatusBadge variant="glassDark" className="mb-1 px-3 sm:px-4 py-1.5 uppercase tracking-widest">
                                    위험성 평가표 원본
                                </StatusBadge>
                                {record.filename && (
                                    <StatusBadge variant="slateDarkSoft" className="max-w-full rounded px-3 py-1.5 text-xs" title={record.filename}>
                                        📄 {record.filename}
                                    </StatusBadge>
                                )}
                            </div>
                            <ActionButton
                                onClick={() => docInputRef.current?.click()}
                                variant="glassDark"
                                className="shrink-0 px-3 py-1.5 text-[10px] font-bold"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                {hasOriginalImage ? '문서 교체' : '문서 등록'}
                            </ActionButton>
                            <input type="file" ref={docInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'original')} />
                        </div>

                        <div className="mb-4 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/10 p-3 text-white shadow-xl backdrop-blur">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">원본 대조 기준</p>
                                    <p className="mt-1 text-sm font-black text-white">{record.name || '근로자 미상'} · {record.jobField || '공종 미확인'}</p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-900">{Number(record.safetyScore || 0).toFixed(0)}점</span>
                                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black text-white">{finalAuditVerdict.label}</span>
                                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black text-white">
                                        {isCompactViewActive
                                            ? (hasOriginalImage ? '원본 있음' : '원본 확인 필요')
                                            : `원문 인식 ${typeof record.ocrConfidence === 'number' ? `${(record.ocrConfidence * 100).toFixed(0)}%` : '확인 필요'}`}
                                    </span>
                                </div>
                            </div>
                            <p className="mt-2 text-[11px] font-semibold leading-relaxed text-white/70">
                                원본의 이름, 공종, 수기 답변이 오른쪽 판단 보드와 맞는지 먼저 대조하세요.
                            </p>
                        </div>
                        
                        {hasOriginalImage ? (
                            <div className="w-full max-w-2xl bg-white shadow-2xl p-1 animate-fade-in group relative">
                                <img 
                                    src={record.originalImage} 
                                    className="w-full h-auto block" 
                                    alt="Scanned Document"
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                <svg className="w-20 h-20 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <p className="font-black text-lg opacity-30 tracking-tight">원본 이미지가 없습니다.</p>
                                <ActionButton
                                    onClick={() => docInputRef.current?.click()}
                                    variant="indigoSolid"
                                    className="mt-6 px-6 py-3 font-bold shadow-lg"
                                >
                                    문서 이미지 업로드
                                </ActionButton>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: PROFILE & INFO EDIT AREA */}
                    <div className="w-full lg:w-[50%] flex flex-col bg-slate-50 overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-5 sm:space-y-8 custom-scrollbar">
                            
                            <div className={`overflow-hidden rounded-[28px] border shadow-sm ${decisionBoardTone.container}`}>
                                <div className="relative p-5 sm:p-6">
                                    <div className={`absolute inset-y-0 left-0 w-1.5 ${decisionBoardTone.accent}`} />
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="min-w-0">
                                            <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${decisionBoardTone.eyebrow}`}>{activeReviewModeCopy.eyebrow}</p>
                                            <h3 className="mt-2 text-xl font-black text-slate-950">
                                                {record.name || '근로자 미상'} · {record.jobField || '공종 미확인'}
                                            </h3>
                                            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
                                                {activeReviewModeCopy.description}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <StatusBadge variant={decisionBoardTone.badge} className="px-3 py-1 text-[11px]">
                                                    {isProfessionalReviewView ? '개발자 검증 모드' : isCompactViewActive ? '현장 보호 판단 모드' : '관리자 원문 대조 모드'}
                                                </StatusBadge>
                                                <StatusBadge variant="slateSoft" className="px-3 py-1 text-[11px]">
                                                    {record.nationality || '국적 미확인'}
                                                </StatusBadge>
                                                <StatusBadge variant="slateSoft" className="px-3 py-1 text-[11px]">
                                                    {record.date || '일자 미확인'}
                                                </StatusBadge>
                                                {record.teamLeader && (
                                                    <StatusBadge variant="slateSoft" className="px-3 py-1 text-[11px]">
                                                        팀장 {record.teamLeader}
                                                    </StatusBadge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid w-full shrink-0 grid-cols-3 gap-2 xl:w-auto">
                                            {REVIEW_VIEW_MODE_OPTIONS.map((option) => {
                                                const selected = activeReviewViewMode === option.mode;
                                                return (
                                                    <button
                                                        key={option.mode}
                                                        type="button"
                                                        onClick={() => handleReviewViewModeChange(option.mode)}
                                                        className={`rounded-2xl border px-3 py-2 text-left transition-all ${selected ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'}`}
                                                    >
                                                        <span className="block text-[11px] font-black">{option.label}</span>
                                                        <span className={`mt-0.5 block text-[9px] font-bold ${selected ? 'text-indigo-100' : 'text-slate-400'}`}>{option.helper}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
                                        {visibleReviewDecisionCards.map((card) => (
                                            <div key={card.key} className={`rounded-2xl border px-4 py-4 ${card.tone}`}>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{card.eyebrow}</p>
                                                <h4 className="mt-2 text-sm font-black text-slate-950">{card.title}</h4>
                                                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{card.description}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <SummaryMetricGrid
                                        className={`mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 ${isCompactViewActive ? '' : 'xl:grid-cols-4'}`}
                                        cardClassName="rounded-2xl border px-3 py-3"
                                        items={visibleDecisionQuickMetrics}
                                    />

                                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                        <ActionButton
                                            variant="slateSoft"
                                            onClick={() => {
                                                handleReviewViewModeChange('detail');
                                                setActiveTab('qna');
                                            }}
                                            className="justify-center px-4 py-2 text-xs border-0"
                                        >
                                            원문 비교 먼저 보기
                                        </ActionButton>
                                        <ActionButton
                                            variant="indigoSolid"
                                            onClick={() => {
                                                handleReviewViewModeChange('detail');
                                                setActiveTab('analysis');
                                            }}
                                            className="justify-center px-4 py-2 text-xs border-0"
                                        >
                                            분석 상세 확인
                                        </ActionButton>
                                        <ActionButton
                                            variant={hasChanges ? 'indigoSolid' : approvalActionDisabled ? 'slateSoft' : 'emeraldSoft'}
                                            onClick={hasChanges ? () => { void handleSave(); } : () => { void handleApprove('approved'); }}
                                            disabled={!hasChanges && approvalActionDisabled}
                                            className="justify-center px-4 py-2 text-xs border-0"
                                        >
                                            {hasChanges ? '수정 먼저 저장' : '보호 판단 확정'}
                                        </ActionButton>
                                    </div>

                                    {!isCompactViewActive && (
                                        <p className="mt-3 text-xs font-semibold text-slate-500">{secondaryMetaText}</p>
                                    )}
                                </div>

                                <div className="border-t border-slate-200/80 bg-white/75 p-4 sm:p-5">
                                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">판단 근거 비교</p>
                                            <h4 className="mt-1 text-sm font-black text-slate-900">
                                                {activeReviewModeCopy.comparisonTitle}
                                            </h4>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-500">필요하면 아래 탭에서 전체 원문과 문항별 답변을 확인하세요.</p>
                                    </div>
                                    <div className={`grid ${isCompactViewActive ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-3'} gap-3`}>
                                        {(isCompactViewActive ? compactSourcePreviewPanels : sourcePreviewPanels).map((panel) => (
                                            <div key={panel.key} className={`h-full ${isCompactViewActive ? 'min-h-[120px]' : 'min-h-[240px]'} rounded-2xl border ${isCompactViewActive ? 'p-3' : 'p-4'} ${panel.tone}`}>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">{panel.eyebrow}</p>
                                                <h4 className="mt-2 text-sm font-black">{panel.title}</h4>
                                                <p className={`mt-2 ${isCompactViewActive ? 'text-xs max-h-[120px]' : 'text-sm max-h-[200px]'} font-semibold leading-relaxed whitespace-pre-wrap overflow-y-auto custom-scrollbar pr-1`}>{panel.body}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            

                            {hasChanges && hasWeakSaveReason && (
                                <NoticeCallout
                                    variant="amber"
                                    eyebrow="수정 사유 보강 권장"
                                    title="1차 저장 전에 하단 승인영역 코멘트에 수정 이유를 6자 이상 남겨주세요."
                                    description={<><span>저장은 가능하지만, 사유가 짧으면 분석 화면에서 </span><span className="underline">수정사유 보강 필요</span><span> 배지로 표시됩니다.</span></>}
                                    className="w-full rounded-3xl border px-5 py-4 shadow-sm"
                                    bodyClassName="block"
                                    eyebrowClassName="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700"
                                    titleClassName="mt-2 text-sm font-black text-amber-800"
                                    descriptionClassName="mt-2 text-xs font-bold leading-relaxed text-amber-700"
                                />
                            )}

                            {isCompactViewActive && (
                                <SectionPanelCard
                                    variant="whiteSoft"
                                    eyebrow="실무자 빠른 처리"
                                    title="간단보기에서는 메모와 최종 행동만 남깁니다."
                                    description="원본과 상단 판단 보드를 확인한 뒤, 필요한 경우 짧은 근거를 남기고 저장·보완요청·확정을 진행하세요."
                                    className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                                    eyebrowClassName="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500"
                                    titleClassName="mt-1 text-sm font-black text-slate-900"
                                    descriptionClassName="mt-2 text-xs font-bold leading-relaxed text-slate-500"
                                    bodyClassName="mt-4"
                                >
                                    <textarea
                                        value={approvalComment}
                                        onChange={(e) => setApprovalComment(e.target.value)}
                                        placeholder="예: 원문과 해석이 일치하여 보호 판단 확정 / 이름 확인 필요하여 보완 요청"
                                        className={`w-full rounded-2xl border bg-slate-50 p-3 text-sm font-semibold leading-relaxed text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${hasWeakApprovalReason ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}
                                        rows={3}
                                    />
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                                        <ActionButton
                                            variant="slateSoft"
                                            onClick={() => handleReviewViewModeChange('detail')}
                                            className="justify-center px-3 py-2 text-xs border-0"
                                        >
                                            상세 근거 열기
                                        </ActionButton>
                                        <ActionButton
                                            variant={hasChanges ? 'indigoSolid' : 'slateSoft'}
                                            onClick={() => { void handleSave(); }}
                                            disabled={!hasChanges}
                                            className="justify-center px-3 py-2 text-xs border-0"
                                        >
                                            수정 저장
                                        </ActionButton>
                                        <ActionButton
                                            variant="roseSoft"
                                            onClick={() => { void handleApprove('rejected'); }}
                                            disabled={isUpdatingAnalysis}
                                            className="justify-center px-3 py-2 text-xs border-0"
                                        >
                                            보완 요청
                                        </ActionButton>
                                        <ActionButton
                                            variant={approvalActionDisabled ? 'slateSoft' : 'emeraldSoft'}
                                            onClick={() => { void handleApprove('approved'); }}
                                            disabled={approvalActionDisabled}
                                            className="justify-center px-3 py-2 text-xs border-0"
                                        >
                                            보호 판단 확정
                                        </ActionButton>
                                    </div>
                                    {managerReviewApprovalReadiness.badgeTone !== 'ready' && (
                                        <NoticeCallout
                                            variant={managerReviewCalloutVariant}
                                            eyebrow="모국어 안내 동기화"
                                            title={managerReviewApprovalReadiness.headline}
                                            description={managerReviewApprovalReadiness.description}
                                            className="mt-3 w-full rounded-2xl border px-3 py-3"
                                            bodyClassName="block"
                                            eyebrowClassName="text-[11px] font-black"
                                            titleClassName="mt-1 text-xs font-black leading-relaxed"
                                            descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                                        />
                                    )}
                                </SectionPanelCard>
                            )}

                            <div className={`${isCompactViewActive ? 'hidden' : 'grid'} lg:hidden bg-white border border-slate-200 rounded-2xl p-2 grid-cols-3 gap-2 sticky top-0 z-10 shadow-sm`}>
                                <ActionButton
                                    variant={hasChanges ? 'indigoSolid' : 'slateSoft'}
                                    onClick={handleSave}
                                    disabled={!hasChanges}
                                    className="px-2 py-2 text-[11px] border-0"
                                >
                                    1차 저장
                                </ActionButton>
                                <ActionButton
                                    variant={approvalActionDisabled ? 'slateSoft' : 'emeraldSoft'}
                                    onClick={() => { void handleApprove('approved'); }}
                                    disabled={approvalActionDisabled}
                                    className="px-2 py-2 text-[11px] border-0"
                                >
                                    보호 판단 확정
                                </ActionButton>
                                <ActionButton
                                    variant="slateSolid"
                                    onClick={handleOpenReportClick}
                                    className="px-2 py-2 text-[11px] border-0"
                                >
                                    교육 리포트
                                </ActionButton>
                            </div>

                            <div className={`${isCompactViewActive ? 'hidden' : 'flex'} gap-2 p-1.5 bg-slate-200 rounded-2xl shrink-0`}>
                                {['info', 'analysis', 'qna'].map(t => (
                                    <button key={t} onClick={() => setActiveTab(t as 'info' | 'analysis' | 'qna')} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                        {t === 'info' ? '판단 조정' : t === 'analysis' ? '분석 근거' : '원문 비교'}
                                    </button>
                                ))}
                            </div>

                            <div className={`${isCompactViewActive ? 'hidden' : ''} min-h-[300px]`}>
                                {activeTab === 'info' && (
                                    <div className="space-y-4">
                                        <CollapsibleSection title="안전 검수 사전 확인 포인트 (클릭 시 확인)" defaultOpen={false}>
                                            <div className="pt-2">
                                                <WhyThisResultPanel
                                            title="승인 전에 꼭 맞춰볼 세 가지"
                                            badge={
                                                <StatusBadge variant="slateSoft" className="px-3 py-1.5 text-[11px] font-black">
                                                    {latestScoreAdjustment
                                                        ? `최근 ${SAFETY_SIGNAL_COPY.score} 조정 ${latestScoreAdjustment.previousScore} → ${latestScoreAdjustment.nextScore}`
                                                        : `최근 ${SAFETY_SIGNAL_COPY.score} 조정 이력 없음`}
                                                </StatusBadge>
                                            }
                                            entries={[
                                                {
                                                    key: 'source',
                                                    content: (
                                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">원문 확인</p>
                                                            <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">질문별 수기 답변과 인식 원문이 실제 현장 문맥과 맞는지 먼저 확인합니다.</p>
                                                        </div>
                                                    ),
                                                },
                                                {
                                                    key: 'interpretation',
                                                    content: (
                                                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">해석 확인</p>
                                                            <p className="mt-2 text-sm font-semibold text-indigo-700 leading-relaxed">AI 해석과 {SAFETY_SIGNAL_COPY.score} 근거가 과도하게 단정적이지 않은지, 보완 방향이 충분히 설명되는지 봅니다.</p>
                                                        </div>
                                                    ),
                                                },
                                                {
                                                    key: 'action',
                                                    content: (
                                                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">행동 결정</p>
                                                            <p className="mt-2 text-sm font-semibold text-emerald-700 leading-relaxed">수정 저장, 승인, 보완 요청 중 무엇이 현장 보호에 가장 빠른지 결정합니다.</p>
                                                        </div>
                                                    ),
                                                },
                                            ]}
                                            className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm"
                                            headerClassName="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                                            titleClassName="text-sm font-black text-slate-900"
                                            listClassName="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3"
                                        />
                                            </div>
                                        </CollapsibleSection>

                                        <SectionPanelCard
                                            variant="whiteSoft"
                                            eyebrow="현재 판단 수준"
                                            title="현재 보호 판단 수준을 확인합니다."
                                            description={isProfessionalReviewView ? '개발자 검증 모드에서는 원문 인식 상태, 무결성, 증빙 고유값까지 함께 확인합니다.' : `${SAFETY_SIGNAL_COPY.score}, ${SAFETY_SIGNAL_COPY.level}, 보완 여부를 중심으로 확인합니다.`}
                                            className="rounded-3xl border border-slate-200 bg-white px-10 py-10 shadow-sm"
                                            titleClassName="mt-1 text-sm font-black text-slate-900"
                                            descriptionClassName="mt-2 text-xs font-bold text-slate-500"
                                            bodyClassName="mt-4"
                                        >
                                        <div className="flex items-center justify-between group">
                                            <div>
                                                <input 
                                                    type="number" 
                                                    value={record.safetyScore} 
                                                    onChange={(e) => handleChange('safetyScore', parseInt(e.target.value) || 0)}
                                                    className="text-8xl font-black text-slate-900 w-48 focus:outline-none bg-transparent"
                                                />
                                                <p className="text-sm text-slate-700 font-black mt-2">{SAFETY_SIGNAL_COPY.level}: {supportStageLabel}</p>
                                                {isProfessionalReviewView ? (
                                                    <>
                                                        <p className="text-xs text-slate-500 font-bold mt-2">
                                                            원문 인식 상태: {typeof record.ocrConfidence === 'number' ? `${(record.ocrConfidence * 100).toFixed(0)}%` : '미기록'}
                                                        </p>
                                                        <p className="text-xs text-slate-500 font-bold mt-1">
                                                            무결성 점수: {typeof record.integrityScore === 'number' ? `${record.integrityScore}점` : '미기록'}
                                                        </p>
                                                        <p className="text-xs text-slate-500 font-bold mt-1 break-all">
                                                            증빙 고유값: {record.evidenceHash || '미기록'}
                                                        </p>
                                                        <p className="text-xs text-indigo-600 font-bold mt-2">
                                                            종합역량 점수(P): {competencyProfile.weightedScore}점 ({competencyProfile.weightVersion})
                                                        </p>
                                                        <p className="text-xs text-emerald-700 font-bold mt-2">
                                                            내부 기준: 고급 ≥ {safetyLevelThresholds.advancedMin}, 중급 ≥ {safetyLevelThresholds.intermediateMin}, 초급 &lt; {safetyLevelThresholds.intermediateMin} (예: 69점 = {gradeExampleFor69})
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-slate-500 font-bold mt-2">
                                                        관리자 확인 후 근로자 안내와 개인 안전교육 리포트에 반영됩니다.
                                                    </p>
                                                )}
                                            </div>
                                            <CircularProgress score={record.safetyScore} level={record.safetyLevel} />
                                        </div>
                                        </SectionPanelCard>

                                        <CollapsibleSection title="개인 안전역량 세부지표 및 루브릭 (클릭 시 확인)" defaultOpen={false}>
                                            <div className="pt-2">
                                                <SectionPanelCard
                                            variant="whiteSoft"
                                            eyebrow="역량 세부지표"
                                            title="개인 안전역량 세부지표"
                                            description={(
                                                <span>품질 판단 기준 안내: 숙련도(④)는 검증 가능한 실무 행동의 구체성, 개선이행도(⑤)는 실행 계획의 명확성(담당·시점·확인방법) 중심으로 평가됩니다.</span>
                                            )}
                                            className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6"
                                            titleClassName="mt-1 text-sm font-black text-slate-800"
                                            descriptionClassName="mt-2 text-[11px] font-bold text-slate-500"
                                            bodyClassName="mt-4"
                                        >
                                            <p className="hidden text-[11px] font-bold text-slate-500 mb-4">
                                                품질 판단 기준 안내: 숙련도(④)는 검증 가능한 실무 행동의 구체성, 개선이행도(⑤)는 실행 계획의 명확성(담당·시점·확인방법) 중심으로 평가됩니다.
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                {competencyMetrics.map((metric) => (
                                                    <CompetencyMetricCard
                                                        key={metric.label}
                                                        label={metric.label}
                                                        score={metric.score}
                                                        maxScore={metric.maxScore}
                                                        subtitle={metric.subtitle}
                                                        tone={metric.tone}
                                                        penalty={metric.penalty}
                                                    />
                                                ))}
                                            </div>
                                        </SectionPanelCard>
                                            </div>
                                        </CollapsibleSection>

                                        {scoreDropNeedsIntegrityReason && (
                                            <SectionPanelCard
                                                variant="whiteSoft"
                                                eyebrow="무결성 검증"
                                                title={`${SAFETY_SIGNAL_COPY.score} 하향 무결성 검증 (필수)`}
                                                description={`${SAFETY_SIGNAL_COPY.score} 하향: ${initialRecord.safetyScore} → ${record.safetyScore} (총 ${scoreDropAmount} 하향)`}
                                                className="rounded-3xl border border-rose-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6"
                                                eyebrowClassName="text-[10px] font-black uppercase tracking-[0.18em] text-rose-500"
                                                titleClassName="mt-1 text-sm font-black text-rose-700"
                                                descriptionClassName="mt-2 text-xs font-bold text-slate-600"
                                                bodyClassName="mt-3"
                                            >
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <select
                                                        value={scoreReasonCode}
                                                        onChange={(e) => setScoreReasonCode(e.target.value as ScoreAdjustmentReasonCode)}
                                                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                                                    >
                                                        <option value="">사유 코드 선택</option>
                                                        {SCORE_REASON_OPTIONS.map((item) => (
                                                            <option key={item.code} value={item.code}>{item.label}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        value={scoreEvidenceSummary}
                                                        onChange={(e) => setScoreEvidenceSummary(e.target.value)}
                                                        placeholder="증빙 요약 (예: 현장 지적 2건, 작업 전 안전공유 미이행)"
                                                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                                                    />
                                                </div>
                                                <textarea
                                                    value={scoreReasonDetail}
                                                    onChange={(e) => setScoreReasonDetail(e.target.value)}
                                                    placeholder="상세 사유 (행동 위반/이해도 부족/문서불일치 등 분리 기재)"
                                                    className="mt-3 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium min-h-[72px]"
                                                />
                                                <div className="mt-2 text-[11px] text-slate-500 font-bold">
                                                    {scoreReasonCode
                                                        ? `영향 지표: ${SCORE_REASON_OPTIONS.find((item) => item.code === scoreReasonCode)?.impact || '-'}`
                                                        : '영향 지표: 사유 코드를 선택하면 표시됩니다.'}
                                                </div>
                                            </SectionPanelCard>
                                        )}

                                        <CollapsibleSection title="신규 현장 조치 이력 등록 (클릭 시 확인)" defaultOpen={false}>
                                            <div className="pt-2">
                                                <SectionPanelCard
                                            variant="whiteSoft"
                                            eyebrow="조치 로그"
                                            title="조치 이력 등록 (S165/S166)"
                                            description={`누적 조치 이력 ${(record.actionHistory || []).length}건`}
                                            className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6"
                                            titleClassName="mt-1 text-sm font-black text-slate-800"
                                            descriptionClassName="mt-2 text-xs font-bold text-slate-500"
                                            bodyClassName="mt-4"
                                        >
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm">
                                                    <option value="재교육">재교육</option>
                                                    <option value="현장코칭">현장코칭</option>
                                                    <option value="작업중지">작업중지</option>
                                                    <option value="보호구개선">보호구개선</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    value={actionDetail}
                                                    onChange={(e) => setActionDetail(e.target.value)}
                                                    placeholder="조치 상세 내용"
                                                    className="md:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                                                />
                                            </div>
                                            <div className="mt-3 flex justify-end">
                                                <ActionButton onClick={handleAddAction} variant="indigoSolid" fullWidth className="sm:w-auto px-4 py-2 text-sm font-black">
                                                    조치 이력 추가
                                                </ActionButton>
                                            </div>
                                        </SectionPanelCard>
                                            </div>
                                        </CollapsibleSection>

                                        <SectionPanelCard
                                            variant="whiteSoft"
                                            eyebrow="보호 조치 결정"
                                            title="관리자 판단 및 보호 조치 결정"
                                            description="승인권자 기준과 판단 근거를 남기고 최종 보호 판단을 확정합니다."
                                            className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6"
                                            titleClassName="mt-1 text-sm font-black text-slate-800"
                                            descriptionClassName="mt-2 text-xs font-bold text-slate-500"
                                            bodyClassName="mt-4"
                                        >
                                            {!strictRoleGate && (
                                                <div className="mb-3">
                                                    <label className="block text-[11px] font-black text-slate-500 mb-1">승인권자 기준</label>
                                                    <select
                                                        value={approverRole}
                                                        onChange={(e) => setApproverRole(e.target.value as 'safety-manager' | 'site-manager')}
                                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                                                    >
                                                        <option value="safety-manager">안전관리자(엄격 검증)</option>
                                                        <option value="site-manager">현장소장(기본 검증)</option>
                                                    </select>
                                                </div>
                                            )}
                                            {strictRoleGate && (
                                                <NoticeCallout
                                                    variant="indigo"
                                                    title="시스템 정책상 안전관리자 엄격 승인 기준이 강제 적용됩니다."
                                                    className="mb-3 w-full rounded-lg border px-3 py-2.5"
                                                    bodyClassName="block"
                                                    titleClassName="text-xs font-bold text-indigo-600"
                                                />
                                            )}
                                            <NoticeCallout
                                                variant={harnessTransitionGuidance.variant}
                                                eyebrow="상태 전이 안내"
                                                title={harnessTransitionGuidance.title}
                                                description={harnessTransitionGuidance.description}
                                                className="mb-3 w-full rounded-xl border px-3 py-2.5"
                                                bodyClassName="block"
                                                eyebrowClassName="text-[11px] font-black"
                                                titleClassName="mt-1 text-xs font-bold"
                                                descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                                            />
                                            <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                                                <NoticeCallout
                                                    variant={managerReviewCalloutVariant}
                                                    eyebrow="모국어 안내 동기화"
                                                    title={managerReviewApprovalReadiness.headline}
                                                    description={managerReviewApprovalReadiness.description}
                                                    action={<StatusBadge variant={managerReviewBadgeVariant}>{managerReviewApprovalReadiness.badgeLabel}</StatusBadge>}
                                                    className="rounded-2xl border px-4 py-4"
                                                    bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                                                    eyebrowClassName="text-[11px] font-black"
                                                    titleClassName="mt-1 text-xs font-black leading-relaxed"
                                                    descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                                                />
                                                <NextActionChecklist
                                                    title="모국어 안내 확인"
                                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                                                    titleClassName="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"
                                                    listClassName="space-y-2 text-[11px] font-bold leading-relaxed text-slate-700"
                                                    itemClassName="flex items-start gap-2"
                                                    bulletClassName={managerReviewApprovalReadiness.canApprove ? 'mt-[2px] text-emerald-500' : 'mt-[2px] text-rose-500'}
                                                    items={managerReviewIssueItems}
                                                />
                                            </div>
                                            <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                                                <NextActionChecklist
                                                    title="최종 확인 전 점검 포인트"
                                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                                                    titleClassName="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"
                                                    listClassName="space-y-2 text-[11px] font-bold leading-relaxed text-slate-700"
                                                    itemClassName="flex items-start gap-2"
                                                    bulletClassName="mt-[2px] text-indigo-500"
                                                    items={approvalReviewChecklistItems}
                                                />
                                                <NoticeCallout
                                                    variant={harnessLatestApprovalDiff ? 'emerald' : 'slate'}
                                                    eyebrow="직전 확인 변화 해석"
                                                    title={approvalDiffInterpretation.title}
                                                    description={approvalDiffInterpretation.description}
                                                    className="rounded-2xl border px-4 py-4"
                                                    bodyClassName="block"
                                                    eyebrowClassName="text-[11px] font-black"
                                                    titleClassName="mt-1 text-xs font-bold"
                                                    descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                                                />
                                            </div>
                                            <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <div>
                                                        <p className="text-[11px] font-black text-slate-500">판단 확인 기준</p>
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            <StatusBadge variant={getHarnessWorkflowBadgeVariant(record.workflowState || inferHarnessWorkflowState(record))}>{getHarnessWorkflowStateLabel(record.workflowState || inferHarnessWorkflowState(record))}</StatusBadge>
                                                            <StatusBadge variant={getHarnessRiskBadgeVariant(record.riskDecision || inferHarnessRiskDecision(record))}>{getHarnessRiskDecisionLabel(record.riskDecision || inferHarnessRiskDecision(record))}</StatusBadge>
                                                            <StatusBadge variant={getHarnessApprovalBadgeVariant(record.approvalState || inferHarnessApprovalState(record, record.workflowState || inferHarnessWorkflowState(record)))}>{getHarnessApprovalStateLabel(record.approvalState || inferHarnessApprovalState(record, record.workflowState || inferHarnessWorkflowState(record)))}</StatusBadge>
                                                            <StatusBadge variant={managerReviewBadgeVariant}>{managerReviewApprovalReadiness.badgeLabel}</StatusBadge>
                                                            {record.workflowRunId ? <StatusBadge variant="slateSoft">처리 번호 연결됨</StatusBadge> : <StatusBadge variant="amberSoft">처리 번호 대기</StatusBadge>}
                                                            {isHarnessPersisted === true && <StatusBadge variant="emeraldSoft">저장 확인</StatusBadge>}
                                                            {isHarnessPersisted === false && <StatusBadge variant="amberSoft">저장 연결 보완</StatusBadge>}
                                                            {harnessDiagnostics?.found === false && isHarnessPersisted === true && <StatusBadge variant="amberSoft">저장 기록 미발견</StatusBadge>}
                                                            {harnessDiagnostics?.resolvedBy === 'source_record_id' && <StatusBadge variant="violetSoft">원본 레코드 기준 조회</StatusBadge>}
                                                        </div>
                                                        {record.workflowRunId && (
                                                            <p className="mt-2 text-[11px] font-semibold text-slate-500">처리 번호: {record.workflowRunId}</p>
                                                        )}
                                                        {harnessLookupSummary && (
                                                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{harnessLookupSummary}</p>
                                                        )}
                                                        {harnessDiagnostics?.sourceRecordId && harnessDiagnostics.sourceRecordId !== record.workflowRunId && (
                                                            <p className="mt-1 text-[11px] font-semibold text-slate-400">원본 기록번호: {harnessDiagnostics.sourceRecordId}</p>
                                                        )}
                                                    </div>
                                                    {record.workflowRunId && (
                                                        <ActionButton
                                                            variant="slateSoft"
                                                            onClick={() => { void refreshHarnessStatus(record.workflowRunId); }}
                                                            disabled={isHarnessStatusLoading}
                                                            className="w-full sm:w-auto border-0 px-4 py-2 text-sm"
                                                        >
                                                            {isHarnessStatusLoading ? '판단 흐름 확인 중…' : '판단 흐름 새로고침'}
                                                        </ActionButton>
                                                    )}
                                                </div>
                                                {harnessTransitionActions.length > 0 ? (
                                                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                                        <NoticeCallout
                                                            variant={harnessTransitionExecutionGuide.variant}
                                                            title={harnessTransitionNarrative.title}
                                                            description={`${harnessTransitionNarrative.description} ${harnessTransitionNarrative.action}`.trim()}
                                                            className="mb-3 rounded-2xl border px-4 py-3"
                                                            bodyClassName="block"
                                                            titleClassName="text-xs font-black"
                                                            descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                                                        />
                                                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                                            <NoticeCallout
                                                                variant={harnessTransitionExecutionGuide.variant}
                                                                eyebrow="권장 실행 가이드"
                                                                title={harnessTransitionExecutionGuide.title}
                                                                description={harnessTransitionExecutionGuide.description}
                                                                className="rounded-2xl border px-4 py-4"
                                                                bodyClassName="block"
                                                                eyebrowClassName="text-[11px] font-black"
                                                                titleClassName="mt-1 text-xs font-bold"
                                                                descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                                                            />
                                                            <NextActionChecklist
                                                                title="조치 실행 전 체크"
                                                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                                                                titleClassName="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"
                                                                listClassName="space-y-2 text-[11px] font-bold leading-relaxed text-slate-700"
                                                                itemClassName="flex items-start gap-2"
                                                                bulletClassName="mt-[2px] text-indigo-500"
                                                                items={harnessTransitionExecutionGuide.checklistItems}
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                                            <p className="text-[11px] font-black text-slate-500">현재 가능한 조치</p>
                                                            {harnessTransitionActionSummary.recommended ? (
                                                                <StatusBadge variant="violetSoft">
                                                                    권장: {getHarnessTransitionActionLabel(harnessTransitionActionSummary.recommended.action)}
                                                                </StatusBadge>
                                                            ) : null}
                                                        </div>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {harnessTransitionActions.map((item) => (
                                                                <div key={item.action} className={`rounded-xl border px-3 py-2 text-[11px] font-bold ${item.allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                                                    <p className="font-black">{getHarnessTransitionActionLabel(item.action)}</p>
                                                                    <p className="mt-1">{formatHarnessTransitionStatusText(item, getHarnessWorkflowStateLabel)}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {harnessTransitionActionSummary.blocked.length > 0 ? (
                                                            <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-500">
                                                                {harnessTransitionNarrative.action}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                                {harnessStatusWarning && (
                                                    <NoticeCallout
                                                        variant="amber"
                                                        title={harnessStatusWarning}
                                                        description={harnessDiagnostics?.found === false && isHarnessPersisted === true
                                                            ? '중앙 저장소는 연결되어 있지만 현재 처리 번호 또는 원본 기록으로 조회된 저장 이벤트가 없습니다.'
                                                            : harnessDiagnostics?.resolvedBy === 'source_record_id'
                                                                ? '현재 응답은 처리 번호 대신 원본 기록 기준의 최신 저장 기록으로 보정되었습니다.'
                                                                : undefined}
                                                        className="mt-3 w-full rounded-xl border px-3 py-2"
                                                        bodyClassName="block"
                                                        titleClassName="text-[11px] font-semibold leading-relaxed text-amber-700"
                                                        descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed text-amber-700"
                                                    />
                                                )}
                                            </div>
                                            <textarea
                                                value={approvalComment}
                                                onChange={(e) => setApprovalComment(e.target.value)}
                                                placeholder="관리자 판단 근거를 입력하세요 (최종승인·보완요청 모두 필수) · 비워두면 '사유없음' 배지가 표시됩니다"
                                                className={`w-full p-3 bg-slate-50 border rounded-xl font-medium min-h-[80px] ${hasWeakApprovalReason ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
                                            />
                                            <NoticeCallout
                                                variant="slate"
                                                eyebrow="권장 입력 예시"
                                                title={approvalReasonGuide}
                                                className="mt-2 w-full rounded-xl border px-3 py-2"
                                                bodyClassName="block"
                                                eyebrowClassName="text-[11px] font-black text-slate-500"
                                                titleClassName="mt-1 text-[11px] font-semibold leading-relaxed text-slate-700"
                                            />
                                            {(hasCriticalReviewEdits || pendingApprovalAction === 'rejected') && (
                                                <p className="mt-2 text-[11px] font-black text-rose-600">
                                                    수정 또는 보완 요청 처리 시 판단 근거 입력은 필수입니다.
                                                </p>
                                            )}
                                            {showReviewCommentField && hasWeakApprovalReason && (
                                                <NoticeCallout
                                                    variant="rose"
                                                    eyebrow="강한 경고"
                                                    title="판단 근거가 짧거나 일반적입니다."
                                                    description="검토 근거, 확인 범위, 반영 내용을 포함하지 않으면 QA 점검 대상으로 남습니다."
                                                    className="mt-2 w-full rounded-xl border px-3 py-2"
                                                    bodyClassName="block"
                                                    eyebrowClassName="text-[11px] font-black text-rose-700"
                                                    titleClassName="mt-1 text-[11px] font-semibold leading-relaxed text-rose-700"
                                                    descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed text-rose-700"
                                                />
                                            )}
                                            <div className="mt-3 flex flex-col sm:flex-row gap-2 justify-end">
                                                <ActionButton
                                                    variant={isUpdatingAnalysis ? 'slateSoft' : 'roseSoft'}
                                                    onClick={() => { void handleApprove('rejected'); }}
                                                    disabled={isUpdatingAnalysis}
                                                    className="w-full sm:w-auto px-4 py-2 text-sm border-0"
                                                >
                                                    보완 요청(재촬영/재작성 안내)
                                                </ActionButton>
                                                <ActionButton
                                                    variant={approvalActionDisabled ? 'slateSoft' : 'emeraldSolid'}
                                                    onClick={() => { void handleApprove('approved'); }}
                                                    disabled={approvalActionDisabled}
                                                    className="w-full sm:w-auto px-4 py-2 text-sm border-0"
                                                >
                                                    최종 승인(보호 판단 확정)
                                                </ActionButton>
                                            </div>
                                            <div className="mt-3 text-xs text-slate-500 font-bold">누적 승인 이력: {(record.approvalHistory || []).length}건</div>
                                        </SectionPanelCard>

                                        <div className={`${isProfessionalReviewView ? 'grid' : 'hidden'} grid-cols-1 gap-4 xl:grid-cols-3`}>
                                            <WhyThisResultPanel
                                                title="최근 감사 이력"
                                                badge={<StatusBadge variant="slateSoft" className="px-3 py-1.5 text-[11px] font-black">최근 5건</StatusBadge>}
                                                entries={(record.auditTrail || []).slice(-5).reverse().map((entry, idx) => ({
                                                    key: `${entry.timestamp}-${idx}`,
                                                    content: (
                                                        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2">
                                                            <div className="font-black text-slate-700">[{entry.stage}] {entry.actor}</div>
                                                            <div className="text-slate-500">{new Date(entry.timestamp).toLocaleString()}</div>
                                                            {entry.note ? <div className="mt-1 text-slate-600">{sanitizeOperationalNote(entry.note, record.nationality)}</div> : null}
                                                        </div>
                                                    ),
                                                }))}
                                                emptyState="감사 이력이 없습니다."
                                                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm min-h-0"
                                                titleClassName="text-sm font-black text-slate-800"
                                                listClassName="mt-3 space-y-2 max-h-40 overflow-y-auto custom-scrollbar"
                                                emptyStateClassName="text-xs font-bold text-slate-400"
                                            />

                                            <WhyThisResultPanel
                                                title={reassessmentTitle}
                                                badge={<StatusBadge variant="violetSoft" className="px-3 py-1.5 text-[11px] font-black">{reassessmentTrail.length}건</StatusBadge>}
                                                entries={reassessmentTrail.map((entry, idx) => ({
                                                    key: `re-${entry.timestamp}-${idx}`,
                                                    content: (
                                                        <div className="text-xs bg-violet-50 border border-violet-200 rounded-lg p-2">
                                                            <div className="font-black text-violet-800">{reassessmentTag} {entry.actor}</div>
                                                            <div className="text-violet-500">{new Date(entry.timestamp).toLocaleString(timelineLocale, timelineDateTimeOptions)}</div>
                                                            {entry.note ? <div className="mt-1 text-violet-700">{sanitizeOperationalNote(entry.note, record.nationality)}</div> : null}
                                                        </div>
                                                    ),
                                                }))}
                                                emptyState={reassessmentEmpty}
                                                className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm min-h-0"
                                                titleClassName="text-sm font-black text-violet-700"
                                                listClassName="mt-3 space-y-2 max-h-44 overflow-y-auto custom-scrollbar"
                                                emptyStateClassName="text-xs font-bold text-slate-400"
                                            />

                                            <WhyThisResultPanel
                                                title="판단 흐름 기록"
                                                badge={
                                                    <StatusBadge variant={getHarnessWorkflowBadgeVariant(record.workflowState || inferHarnessWorkflowState(record))} className="px-3 py-1.5 text-[11px] font-black">
                                                        {getHarnessWorkflowStateLabel(record.workflowState || inferHarnessWorkflowState(record))}
                                                    </StatusBadge>
                                                }
                                                entries={harnessTimeline.map((entry, idx) => ({
                                                    key: `harness-${entry.stage}-${entry.timestamp}-${idx}`,
                                                    content: (
                                                        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="font-black text-amber-800">[{entry.stage}]</div>
                                                                {entry.actor ? <StatusBadge variant="amberSoft">{entry.actor}</StatusBadge> : null}
                                                            </div>
                                                            <div className="text-amber-600">{new Date(entry.timestamp).toLocaleString(timelineLocale, timelineDateTimeOptions)}</div>
                                                            <div className="mt-1 text-amber-700">{sanitizeOperationalNote(entry.note, record.nationality)}</div>
                                                        </div>
                                                    ),
                                                }))}
                                                emptyState={record.workflowRunId
                                                    ? (isHarnessStatusLoading ? '판단 흐름 기록을 불러오는 중입니다.' : '저장된 판단 흐름 기록이 아직 없습니다.')
                                                    : '처리 번호가 아직 연결되지 않았습니다.'}
                                                className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm min-h-0"
                                                titleClassName="text-sm font-black text-amber-700"
                                                listClassName="mt-3 space-y-2 max-h-44 overflow-y-auto custom-scrollbar"
                                                emptyStateClassName="text-xs font-bold text-slate-400"
                                            />
                                        </div>

                                        <SectionPanelCard
                                            variant="whiteSoft"
                                            eyebrow="PRO 검증 단계"
                                            title="검증 단계 의미를 먼저 맞추고 승인 판단을 이어갑니다."
                                            description="검증 / 승인 / 재평가 단계가 무엇을 의미하는지 짧게 확인할 수 있습니다."
                                            className={`${isProfessionalReviewView ? '' : 'hidden'} rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6`}
                                            titleClassName="mt-1 text-sm font-black text-slate-800"
                                            descriptionClassName="mt-2 text-xs font-bold text-slate-500"
                                            bodyClassName="mt-4"
                                        >
                                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                                {harnessTimelineStageGuide.map((item) => (
                                                    <div key={item.stage} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">{item.stage}</p>
                                                        <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-800">{item.meaning}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </SectionPanelCard>

                                        <SectionPanelCard
                                            variant="whiteSoft"
                                            eyebrow="PRO 검증 기록"
                                            title="규칙 영향, 승인 이력, 현장 맥락, 버전 기록을 함께 확인합니다."
                                            description="관리자 승인 전 어떤 규칙이 개입했고 당시 어떤 현장 맥락과 정책 기준이 적용됐는지 빠르게 읽을 수 있습니다."
                                            className={`${isProfessionalReviewView ? '' : 'hidden'} rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6`}
                                            titleClassName="mt-1 text-sm font-black text-slate-800"
                                            descriptionClassName="mt-2 text-xs font-bold text-slate-500"
                                            bodyClassName="mt-4"
                                        >
                                            <SummaryMetricGrid
                                                className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
                                                cardClassName="rounded-2xl border px-3 py-2"
                                                items={harnessSnapshotMetrics}
                                            />

                                            <NextActionChecklist
                                                title="승인 전 증빙 체크리스트"
                                                className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                                                titleClassName="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500"
                                                listClassName="space-y-2 text-xs font-bold leading-relaxed text-slate-700"
                                                itemClassName="flex items-start gap-2"
                                                bulletClassName="mt-[2px] text-indigo-500"
                                                items={harnessEvidenceChecklistItems}
                                            />

                                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                                                <div>
                                                    <p className="text-[11px] font-black text-violet-700">관리자 상세 기록</p>
                                                    <p className="mt-1 text-[11px] font-semibold text-violet-600">실무자는 요약만 보고, 필요할 때만 판단 흐름과 기준 변경 내용을 펼쳐 확인합니다.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowHarnessTechnicalDetails((prev) => !prev)}
                                                    className="rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100 transition-all"
                                                >
                                                    {showHarnessTechnicalDetails ? '세부 근거 숨기기' : '세부 근거 보기'}
                                                </button>
                                            </div>

                                            {showHarnessTechnicalDetails ? (
                                            <>

                                            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                                                <WhyThisResultPanel
                                                    title="분석 요약 / 검증 요약"
                                                    badge={<StatusBadge variant={harnessAnalyzerSummary.summary || harnessEvaluatorSummary.flags.length > 0 ? 'violetSoft' : 'slateSoft'} className="px-3 py-1.5 text-[11px] font-black">요약</StatusBadge>}
                                                    entries={[
                                                        {
                                                            key: 'analyzer-summary',
                                                            content: (
                                                                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs">
                                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">분석 요약</p>
                                                                    <p className="mt-1 font-semibold text-indigo-700">{harnessAnalyzerSummary.summary || '저장된 분석 요약이 없습니다.'}</p>
                                                                    <p className="mt-1 text-indigo-500">신뢰도: {typeof harnessAnalyzerSummary.confidence === 'number' ? `${Math.round(harnessAnalyzerSummary.confidence * 100)}%` : '미기록'}</p>
                                                                </div>
                                                            ),
                                                        },
                                                        {
                                                            key: 'evaluator-summary',
                                                            content: (
                                                                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs">
                                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">검증 요약</p>
                                                                    <p className="mt-1 font-semibold text-violet-700">증거 충분도: {typeof harnessEvaluatorSummary.evidenceSufficiency === 'number' ? `${harnessEvaluatorSummary.evidenceSufficiency}` : '미기록'}</p>
                                                                    <p className="mt-1 text-violet-600">관리자 확인 필요: {typeof harnessEvaluatorSummary.requiresHumanApproval === 'boolean' ? (harnessEvaluatorSummary.requiresHumanApproval ? '예' : '아니오') : '미기록'}</p>
                                                                    <p className="mt-1 text-violet-600">플래그: {harnessEvaluatorSummary.flags.length > 0 ? harnessEvaluatorSummary.flags.join(' · ') : '없음'}</p>
                                                                </div>
                                                            ),
                                                        },
                                                    ]}
                                                    className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm min-h-0"
                                                    titleClassName="text-sm font-black text-violet-700"
                                                    listClassName="mt-3 space-y-2"
                                                    emptyStateClassName="text-xs font-bold text-slate-400"
                                                />

                                                <WhyThisResultPanel
                                                    title="최신 확인 변화"
                                                    badge={<StatusBadge variant={harnessLatestApprovalDiff ? 'emeraldSoft' : 'slateSoft'} className="px-3 py-1.5 text-[11px] font-black">{harnessLatestApprovalDiff ? (harnessLatestApprovalDiff.action === 'approved' ? '최종 확인' : harnessLatestApprovalDiff.action === 'rejected' ? '보완 요청' : '확인 처리') : '미기록'}</StatusBadge>}
                                                    entries={harnessLatestApprovalDiff ? [
                                                        {
                                                            key: 'approval-diff',
                                                            content: (
                                                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">확인 변화</p>
                                                                    <p className="mt-1 font-semibold text-emerald-700">위험 판단: {harnessLatestApprovalDiff.decisionBefore ? getHarnessRiskDecisionLabel(harnessLatestApprovalDiff.decisionBefore as HarnessRiskDecision) : '미기록'} → {harnessLatestApprovalDiff.decisionAfter ? getHarnessRiskDecisionLabel(harnessLatestApprovalDiff.decisionAfter as HarnessRiskDecision) : '미기록'}</p>
                                                                    <p className="mt-1 text-emerald-600">판단 흐름: {getHarnessWorkflowStateLabel(harnessLatestApprovalDiff.workflowStateAfter)}</p>
                                                                    <p className="mt-1 text-emerald-600">최종 확인: {getHarnessApprovalStateLabel(harnessLatestApprovalDiff.approvalStateAfter)} · 수정 반영 분석: {harnessLatestApprovalDiff.secondPassStatusAfter === 'DONE' ? '완료' : harnessLatestApprovalDiff.secondPassStatusAfter === 'IN_PROGRESS' ? '진행 중' : harnessLatestApprovalDiff.secondPassStatusAfter === 'NEEDED' ? '필요' : '미기록'}</p>
                                                                    <p className="mt-1 text-emerald-600">관리자 확인 필요: {harnessLatestApprovalDiff.requiresManagerApprovalAfter ? '예' : '아니오'}</p>
                                                                    <p className="mt-1 font-semibold text-emerald-700">코멘트: {harnessLatestApprovalDiff.comment || '없음'}</p>
                                                                    <p className="mt-1 text-emerald-500">{new Date(harnessLatestApprovalDiff.updatedAt).toLocaleString(timelineLocale, timelineDateTimeOptions)}</p>
                                                                </div>
                                                            ),
                                                        },
                                                    ] : []}
                                                    emptyState="저장된 확인 변화 기록이 없습니다."
                                                    className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm min-h-0"
                                                    titleClassName="text-sm font-black text-emerald-700"
                                                    listClassName="mt-3 space-y-2"
                                                    emptyStateClassName="text-xs font-bold text-slate-400"
                                                />
                                            </div>

                                            <div className="mt-4">
                                                <HarnessRuleImpactSummaryPanel
                                                    title="규칙 영향 요약"
                                                    summary={harnessRuleImpactSummary}
                                                    className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm"
                                                    maxVisible={2}
                                                />
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                                                <WhyThisResultPanel
                                                    title="예외 규칙 적용 기록"
                                                    badge={<StatusBadge variant={harnessOverrides.length > 0 ? 'amberSoft' : 'slateSoft'} className="px-3 py-1.5 text-[11px] font-black">{harnessOverrides.length}건</StatusBadge>}
                                                    entries={harnessOverrides.map((override, idx) => ({
                                                        key: `${override.ruleCode}-${override.createdAt}-${idx}`,
                                                        content: (
                                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="font-black text-amber-800">{override.ruleCode}</p>
                                                                    <StatusBadge variant="amberSoft">{override.severity}</StatusBadge>
                                                                </div>
                                                                <p className="mt-1 text-amber-600">규칙 기준 버전: {override.ruleVersion || '미지정'}</p>
                                                                <p className="mt-1 font-semibold text-amber-700">{override.message}</p>
                                                                <p className="mt-1 text-amber-600">{override.originalDecision ? getHarnessRiskDecisionLabel(override.originalDecision as HarnessRiskDecision) : '미기록'} → {override.overriddenDecision ? getHarnessRiskDecisionLabel(override.overriddenDecision as HarnessRiskDecision) : '미기록'}</p>
                                                                <p className="mt-1 text-amber-500">{new Date(override.createdAt).toLocaleString(timelineLocale, timelineDateTimeOptions)}</p>
                                                            </div>
                                                        ),
                                                    }))}
                                                    emptyState="저장된 예외 규칙 기록이 없습니다."
                                                    className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm min-h-0"
                                                    titleClassName="text-sm font-black text-amber-700"
                                                    listClassName="mt-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar"
                                                    emptyStateClassName="text-xs font-bold text-slate-400"
                                                />

                                                <WhyThisResultPanel
                                                    title="관리자 승인 이력"
                                                    badge={<StatusBadge variant={harnessApprovals.length > 0 ? 'emeraldSoft' : 'slateSoft'} className="px-3 py-1.5 text-[11px] font-black">{harnessApprovals.length}건</StatusBadge>}
                                                    entries={harnessApprovals.map((approval, idx) => ({
                                                        key: `${approval.action}-${approval.createdAt}-${idx}`,
                                                        content: (
                                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="font-black text-emerald-800">{approval.approverRole || approval.approverName || 'manager'}</p>
                                                                    <StatusBadge variant="emeraldSoft">{approval.action}</StatusBadge>
                                                                </div>
                                                                <p className="mt-1 font-semibold text-emerald-700">{approval.comment || '코멘트 없음'}</p>
                                                                <p className="mt-1 text-emerald-600">{approval.decisionBefore ? getHarnessRiskDecisionLabel(approval.decisionBefore as HarnessRiskDecision) : '미기록'} → {approval.decisionAfter ? getHarnessRiskDecisionLabel(approval.decisionAfter as HarnessRiskDecision) : '미기록'}</p>
                                                                <p className="mt-1 text-emerald-500">{new Date(approval.createdAt).toLocaleString(timelineLocale, timelineDateTimeOptions)}</p>
                                                            </div>
                                                        ),
                                                    }))}
                                                    emptyState="저장된 승인 이력이 없습니다."
                                                    className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm min-h-0"
                                                    titleClassName="text-sm font-black text-emerald-700"
                                                    listClassName="mt-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar"
                                                    emptyStateClassName="text-xs font-bold text-slate-400"
                                                />

                                                <WhyThisResultPanel
                                                    title="현장 맥락과 기준 버전"
                                                    badge={<StatusBadge variant={harnessPromptVersion || harnessPolicyVersion ? 'violetSoft' : 'slateSoft'} className="px-3 py-1.5 text-[11px] font-black">{harnessContextSnapshot ? '연결됨' : '없음'}</StatusBadge>}
                                                    entries={[
                                                        {
                                                            key: 'prompt-version',
                                                            content: <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs font-semibold text-violet-700">분석 기준 버전: {harnessPromptVersion?.version || '미연결'}</div>,
                                                        },
                                                        {
                                                            key: 'policy-version',
                                                            content: <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs font-semibold text-violet-700">정책 기준 버전: {harnessPolicyVersion?.version || '미연결'}</div>,
                                                        },
                                                        {
                                                            key: 'context-meta',
                                                            content: <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">현장 맥락 기록 시각: {harnessContextSnapshot ? new Date(harnessContextSnapshot.createdAt).toLocaleString(timelineLocale, timelineDateTimeOptions) : '없음'}</div>,
                                                        },
                                                    ]}
                                                    emptyState="저장된 현장 맥락 기록이 없습니다."
                                                    className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm min-h-0"
                                                    titleClassName="text-sm font-black text-violet-700"
                                                    listClassName="mt-3 space-y-2"
                                                    emptyStateClassName="text-xs font-bold text-slate-400"
                                                />
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                                                <HarnessVersionDetailsPanel
                                                    title="분석 기준 버전 설명"
                                                    tone="prompt"
                                                    descriptors={harnessVersionDescriptors.prompt}
                                                    emptyMessage="현재 연결된 분석 기준 설명이 없습니다."
                                                />
                                                <HarnessVersionDetailsPanel
                                                    title="정책 기준 버전 설명"
                                                    tone="policy"
                                                    descriptors={harnessVersionDescriptors.policy}
                                                    emptyMessage="현재 연결된 정책 버전 설명이 없습니다."
                                                />
                                                <HarnessVersionDetailsPanel
                                                    title="규칙 기준 버전 설명"
                                                    tone="rule"
                                                    descriptors={harnessVersionDescriptors.rule}
                                                    emptyMessage="현재 연결된 규칙 기준 설명이 없습니다."
                                                />
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                                                <HarnessVersionChangeSummaryPanel
                                                    title="분석 기준 변경 요약"
                                                    tone="prompt"
                                                    lines={harnessVersionChangeSummary.prompt}
                                                    emptyMessage="저장된 분석 기준 변경 요약이 없습니다."
                                                />
                                                <HarnessVersionChangeSummaryPanel
                                                    title="정책 기준 변경 요약"
                                                    tone="policy"
                                                    lines={harnessVersionChangeSummary.policy}
                                                    emptyMessage="저장된 정책 변경 요약이 없습니다."
                                                />
                                                <HarnessVersionChangeSummaryPanel
                                                    title="규칙 기준 변경 요약"
                                                    tone="rule"
                                                    lines={harnessVersionChangeSummary.rule}
                                                    emptyMessage="저장된 룰 변경 요약이 없습니다."
                                                />
                                            </div>

                                            {harnessVersionDescriptorRows.length > 0 ? (
                                                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">버전 변경 포인트 표</p>
                                                    <div className="mt-3 overflow-auto">
                                                        <table className="w-full min-w-[720px] text-left text-[11px]">
                                                            <thead className="text-slate-500">
                                                                <tr>
                                                                    <th className="py-2 pr-3">구분</th>
                                                                    <th className="py-2 pr-3">버전</th>
                                                                    <th className="py-2 pr-3">이전 버전</th>
                                                                    <th className="py-2 pr-3">적용일</th>
                                                                    <th className="py-2 pr-3">요약</th>
                                                                    <th className="py-2 pr-3">변경 포인트</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="align-top text-slate-700">
                                                                {harnessVersionDescriptorRows.map((descriptor) => (
                                                                    <tr key={`${descriptor.category}-${descriptor.version}`} className="border-t border-slate-100">
                                                                        <td className="py-2 pr-3 font-black uppercase">{descriptor.category}</td>
                                                                        <td className="py-2 pr-3 font-black break-all">{descriptor.version}</td>
                                                                        <td className="py-2 pr-3 break-all">{descriptor.previousVersion || '-'}</td>
                                                                        <td className="py-2 pr-3">{descriptor.releasedAt}</td>
                                                                        <td className="py-2 pr-3 leading-relaxed">{descriptor.summary}</td>
                                                                        <td className="py-2 pr-3 leading-relaxed">{descriptor.changesFromPrevious?.join(' / ') || '-'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ) : null}
                                            </>
                                            ) : (
                                                <NoticeCallout
                                                    variant="info"
                                                    title="관리자 상세 기록은 현재 숨김 상태입니다."
                                                    description="승인 이력과 시스템 변경 기록은 필요한 경우에만 상세 보기에서 확인하세요."
                                                    className="mt-4"
                                                />
                                            )}
                                        </SectionPanelCard>
                                    </div>
                                )}

                                {activeTab === 'analysis' && (
                                    <div className="space-y-4 h-full min-h-[300px]">
                                        <WhyThisResultPanel
                                            title="AI가 읽은 의미와 현장에 전달할 설명을 함께 점검합니다."
                                            badge={<StatusBadge variant="violetSoft" className="px-3 py-1.5 text-[11px] font-black">AI 해석 검토</StatusBadge>}
                                            entries={[
                                                {
                                                    key: 'draft',
                                                    content: (
                                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">AI 초안</p>
                                                            <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">AI 해석이 과도하게 평가적이지 않고, 실제 보완 방향을 설명하는지 확인합니다.</p>
                                                        </div>
                                                    ),
                                                },
                                                {
                                                    key: 'delivery',
                                                    content: (
                                                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">현장 전달</p>
                                                            <p className="mt-2 text-sm font-semibold text-indigo-700 leading-relaxed">한국어 해석과 모국어 해석이 같은 보호 메시지를 전달하는지 비교합니다.</p>
                                                        </div>
                                                    ),
                                                },
                                                {
                                                    key: 'manager-review',
                                                    content: (
                                                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">관리자 확인</p>
                                                            <p className="mt-2 text-sm font-semibold text-amber-700 leading-relaxed">국적 변경 후 갱신된 번역이 실제 작업자 안내 문구로 바로 써도 되는지 검수합니다.</p>
                                                        </div>
                                                    ),
                                                },
                                            ]}
                                            className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm"
                                            headerClassName="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                                            titleClassName="text-sm font-black text-slate-900"
                                            listClassName="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3"
                                        />
                                        <SummaryMetricGrid
                                            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                                            cardClassName="rounded-2xl border px-4 py-3"
                                            items={[
                                                {
                                                    key: 'native-language',
                                                    label: '작업자 안내 언어',
                                                    value: nativeLanguageLabel,
                                                    tone: BRAND_TONE.indigo,
                                                    labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400',
                                                    valueClassName: 'mt-1 text-xs font-black text-indigo-700',
                                                },
                                                {
                                                    key: 'native-guidance-status',
                                                    label: '모국어 안내 상태',
                                                    value: String(record.aiInsights_native || '').trim() ? '추출 완료' : '보완 표시 중',
                                                    tone: String(record.aiInsights_native || '').trim() ? BRAND_TONE.emerald : BRAND_TONE.amber,
                                                    labelClassName: String(record.aiInsights_native || '').trim() ? 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500' : 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-500',
                                                    valueClassName: String(record.aiInsights_native || '').trim() ? 'mt-1 text-xs font-black text-emerald-700' : 'mt-1 text-xs font-black text-amber-700',
                                                },
                                                {
                                                    key: 'verification-status',
                                                    label: '검증 상태',
                                                    value: verificationAudit.isComplete ? '정상' : verificationAudit.issues.join(' / '),
                                                    tone: verificationAudit.isComplete ? BRAND_TONE.emerald : BRAND_TONE.rose,
                                                    labelClassName: verificationAudit.isComplete ? 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500' : 'text-[10px] font-black uppercase tracking-[0.18em] text-rose-500',
                                                    valueClassName: verificationAudit.isComplete ? 'mt-1 text-xs font-black text-emerald-700' : 'mt-1 text-xs font-black text-rose-700',
                                                },
                                            ]}
                                        />
                                        <SummaryMetricGrid
                                            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                                            cardClassName="rounded-2xl border px-4 py-3"
                                            items={[
                                                {
                                                    key: 'lang-mix-status',
                                                    label: '영어 혼입 점검',
                                                    value: qualityAudit.hasEnglishInKorean || qualityAudit.hasEnglishInNative ? '혼입 감지' : '정상',
                                                    tone: qualityAudit.hasEnglishInKorean || qualityAudit.hasEnglishInNative ? BRAND_TONE.rose : BRAND_TONE.emerald,
                                                    labelClassName: qualityAudit.hasEnglishInKorean || qualityAudit.hasEnglishInNative ? 'text-[10px] font-black uppercase tracking-[0.18em] text-rose-500' : 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500',
                                                    valueClassName: qualityAudit.hasEnglishInKorean || qualityAudit.hasEnglishInNative ? 'mt-1 text-xs font-black text-rose-700' : 'mt-1 text-xs font-black text-emerald-700',
                                                },
                                                {
                                                    key: 'native-answer-status',
                                                    label: '문항 모국어 번역',
                                                    value: qualityAudit.missingNativeAnswerTranslationCount > 0 ? `누락 ${qualityAudit.missingNativeAnswerTranslationCount}건` : '정상',
                                                    tone: qualityAudit.missingNativeAnswerTranslationCount > 0 ? BRAND_TONE.amber : BRAND_TONE.emerald,
                                                    labelClassName: qualityAudit.missingNativeAnswerTranslationCount > 0 ? 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-500' : 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500',
                                                    valueClassName: qualityAudit.missingNativeAnswerTranslationCount > 0 ? 'mt-1 text-xs font-black text-amber-700' : 'mt-1 text-xs font-black text-emerald-700',
                                                },
                                                {
                                                    key: 'score-overrisk',
                                                    label: `${SAFETY_SIGNAL_COPY.score} 과대 의심`,
                                                    value: qualityAudit.scoreOverestimateRisk ? '의심' : '정상',
                                                    tone: qualityAudit.scoreOverestimateRisk ? BRAND_TONE.amber : BRAND_TONE.emerald,
                                                    labelClassName: qualityAudit.scoreOverestimateRisk ? 'text-[10px] font-black uppercase tracking-[0.18em] text-amber-500' : 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500',
                                                    valueClassName: qualityAudit.scoreOverestimateRisk ? 'mt-1 text-xs font-black text-amber-700' : 'mt-1 text-xs font-black text-emerald-700',
                                                },
                                            ]}
                                        />
                                        <SummaryMetricGrid
                                            className="grid grid-cols-1 gap-3 sm:grid-cols-1"
                                            cardClassName="rounded-2xl border px-4 py-3"
                                            items={[
                                                {
                                                    key: 'final-audit-verdict',
                                                    label: '최종 판정',
                                                    value: `${finalAuditVerdict.label} · ${finalAuditVerdict.reason}`,
                                                    tone: finalAuditVerdict.tone,
                                                    labelClassName: finalAuditVerdict.labelClassName,
                                                    valueClassName: finalAuditVerdict.valueClassName,
                                                },
                                            ]}
                                        />
                                        {!qualityAudit.isHealthy && (
                                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                                <p className="text-[11px] font-black text-amber-700">추가 점검 필요</p>
                                                <p className="mt-1 text-xs font-semibold text-amber-700">{qualityAudit.issues.join(' / ')}</p>
                                            </div>
                                        )}
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <p className="text-[11px] font-black text-slate-700">3건 검증 기록 템플릿</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-600 break-words">{auditTemplateLine}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                            <p className="text-[11px] font-black text-slate-700">보고용 1페이지 요약</p>
                                            <textarea
                                                readOnly
                                                value={auditOnePageSummary}
                                                className="mt-2 w-full min-h-[140px] text-xs text-slate-700 leading-relaxed border border-slate-200 rounded-xl p-3 bg-slate-50 resize-none"
                                            />
                                        </div>
                                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                                            <p className="text-[11px] font-black text-indigo-700">{nativeLanguageLabel} 작성 가이드</p>
                                            <ul className="mt-1 space-y-1 text-xs font-semibold text-indigo-700">
                                                {nativeWritingGuide.map((line, idx) => (
                                                    <li key={`${line}-${idx}`}>• {line}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                            <SectionPanelCard
                                                variant="whiteSoft"
                                                eyebrow="한국어 해석 (KO)"
                                                title="관리자 관점의 한국어 보호 해석"
                                                description="AI가 읽은 의미와 보완 방향을 관리자 검토 문장으로 정리합니다."
                                                className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm h-full"
                                                titleClassName="mt-1 text-sm font-black text-slate-900"
                                                descriptionClassName="mt-2 text-[11px] font-bold text-slate-500"
                                                bodyClassName="mt-4"
                                            >
                                                <textarea 
                                                    value={record.aiInsights} 
                                                    onChange={(e) => handleChange('aiInsights', e.target.value)}
                                                    className="w-full min-h-[220px] text-base text-slate-700 leading-relaxed border-none focus:ring-0 resize-none bg-slate-50 rounded-xl p-4 font-medium"
                                                    placeholder="AI가 읽은 의미와 보완 방향을 관리자 관점에서 정리하세요."
                                                />
                                            </SectionPanelCard>
                                            <SectionPanelCard
                                                variant="indigo"
                                                eyebrow={`모국어 안내 (${nativeLanguageLabel})`}
                                                title="작업자 전달용 모국어 보호 안내"
                                                description="국적 변경 후 AI 분석 갱신을 실행하면 번역 초안이 자동으로 갱신됩니다."
                                                className="rounded-3xl border border-indigo-200 bg-white px-6 py-6 shadow-sm h-full"
                                                eyebrowClassName="text-xs font-bold uppercase tracking-[0.18em] text-indigo-400"
                                                titleClassName="mt-1 text-sm font-black text-slate-900"
                                                descriptionClassName="mt-2 text-[10px] font-normal text-slate-400"
                                                bodyClassName="mt-4"
                                            >
                                                <textarea 
                                                    value={String(record.aiInsights_native || '').trim() ? record.aiInsights_native : nativeGuidancePreview} 
                                                    onChange={(e) => handleChange('aiInsights_native', e.target.value)}
                                                    className="w-full min-h-[220px] text-base text-slate-600 leading-relaxed border-none focus:ring-0 resize-none bg-indigo-50/50 rounded-xl p-4 font-medium"
                                                    placeholder={`작업자에게 바로 전달할 ${nativeLanguageLabel} 보호 안내를 확인하거나 수정하세요.`}
                                                />
                                            </SectionPanelCard>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'qna' && (
                                    <div className="space-y-4 pb-4">
                                        <SectionPanelCard
                                            variant="whiteSoft"
                                            eyebrow="원문 비교 검수"
                                            title="질문별로 원문 신호와 관리자 해석을 나란히 점검합니다."
                                            className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6"
                                            headerClassName="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                                            titleClassName="mt-2 text-sm font-black text-slate-900"
                                            bodyClassName="mt-0"
                                            headerAction={
                                                <SummaryMetricGrid
                                                    className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                                                    cardClassName="rounded-2xl border px-3 py-2"
                                                    items={[
                                                        {
                                                            key: 'total',
                                                            label: '전체 문항',
                                                            value: `${answerComparisonSummary.total}개`,
                                                            tone: BRAND_TONE.slate,
                                                            labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400',
                                                            valueClassName: 'mt-1 text-xs font-black text-slate-700',
                                                        },
                                                        {
                                                            key: 'original-ready',
                                                            label: '원문 확보',
                                                            value: `${answerComparisonSummary.originalReady}개`,
                                                            tone: BRAND_TONE.indigo,
                                                            labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400',
                                                            valueClassName: 'mt-1 text-xs font-black text-indigo-700',
                                                        },
                                                        {
                                                            key: 'translated-ready',
                                                            label: '해석 확보',
                                                            value: `${answerComparisonSummary.translated}개`,
                                                            tone: BRAND_TONE.emerald,
                                                            labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500',
                                                            valueClassName: 'mt-1 text-xs font-black text-emerald-700',
                                                        },
                                                    ]}
                                                />
                                            }
                                        >
                                            <></>
                                        </SectionPanelCard>
                                        {record.handwrittenAnswers.map((ans, idx) => {
                                            const isKorean = isKoreanNationality(record.nationality);
                                            const flag = getNationalityFlag(record.nationality);
                                            const nativeLanguage = getNativeLanguageLabel(record.nationality);
                                            const qInfo = QUESTION_LABELS[ans.questionNumber] || {
                                                title: `문항 ${ans.questionNumber}`,
                                                subtitle: '위험성 평가 수기 답변 항목입니다.'
                                            };

                                            return (
                                                <OperationalPreviewCard
                                                    key={idx}
                                                    variant="whiteElevated"
                                                    eyebrow="위험성평가 원문-해석 비교"
                                                    title={qInfo.title}
                                                    subtitle={qInfo.subtitle}
                                                    badge={
                                                        <StatusBadge variant="violetSoft" className="px-3 py-1 uppercase tracking-widest">
                                                            비교 검수
                                                        </StatusBadge>
                                                    }
                                                    className="rounded-2xl border border-slate-200 p-6 shadow-sm mb-4"
                                                    titleClassName="mt-1 text-sm font-black text-slate-900"
                                                    bodyClassName="mt-4"
                                                    body={
                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                            {/* 왼쪽 컬럼: 자필 원문 */}
                                                            <SectionPanelCard
                                                                variant="slate"
                                                                eyebrow={`원문 신호 (${flag} ${record.nationality})`}
                                                                title={isKorean ? "작업자 자필 원문" : `작업자 자필 원문 (${nativeLanguage})`}
                                                                description={isKorean ? "근로자가 수기로 작성한 원문입니다." : "근로자가 본국 모국어로 직접 작성한 원문입니다."}
                                                                className="rounded-xl px-4 py-4"
                                                                titleClassName="mt-1 text-xs font-black text-slate-700"
                                                                descriptionClassName="mt-1 text-[11px] font-semibold text-slate-500"
                                                                bodyClassName="mt-3"
                                                            >
                                                                <textarea
                                                                    value={ans.answerText}
                                                                    onChange={(e) => handleAnswerChange(idx, 'answerText', e.target.value)}
                                                                    className="w-full min-h-[110px] text-sm text-slate-600 bg-white border border-slate-200 rounded-lg p-3 font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                                    placeholder="인식 원문을 확인하거나 수정하세요."
                                                                />
                                                            </SectionPanelCard>

                                                            {/* 오른쪽 컬럼: 한국어 해석 및 (외국인일 경우) 모국어 피드백 */}
                                                            {isKorean ? (
                                                                <SectionPanelCard
                                                                    variant="indigo"
                                                                    eyebrow="관리자 검토"
                                                                    title="해석 및 교정 내용"
                                                                    description="현장 관리를 위해 표준어로 교정 및 해석된 내용입니다."
                                                                    className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-4"
                                                                    eyebrowClassName="text-xs font-bold uppercase tracking-[0.18em] text-indigo-400"
                                                                    titleClassName="mt-1 text-xs font-black text-indigo-700"
                                                                    descriptionClassName="mt-1 text-[11px] font-semibold text-indigo-500"
                                                                    bodyClassName="mt-3"
                                                                >
                                                                    <textarea
                                                                        value={ans.koreanTranslation}
                                                                        onChange={(e) => handleAnswerChange(idx, 'koreanTranslation', e.target.value)}
                                                                        className="w-full min-h-[110px] text-sm text-slate-700 bg-white border border-indigo-100 rounded-lg p-3 font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                                        placeholder="관리자 검토용 한국어 해석을 확인하거나 수정하세요."
                                                                    />
                                                                </SectionPanelCard>
                                                            ) : (
                                                                <div className="flex flex-col gap-4">
                                                                    <SectionPanelCard
                                                                        variant="indigo"
                                                                        eyebrow="관리자 해석"
                                                                        title="표준 한국어 해석"
                                                                        description="관리를 위해 표준 한국어로 번역 및 교정된 내용입니다."
                                                                        className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-4"
                                                                        eyebrowClassName="text-xs font-bold uppercase tracking-[0.18em] text-indigo-400"
                                                                        titleClassName="mt-1 text-xs font-black text-indigo-700"
                                                                        descriptionClassName="mt-1 text-[11px] font-semibold text-indigo-500"
                                                                        bodyClassName="mt-3"
                                                                    >
                                                                        <textarea
                                                                            value={ans.koreanTranslation}
                                                                            onChange={(e) => handleAnswerChange(idx, 'koreanTranslation', e.target.value)}
                                                                            className="w-full min-h-[110px] text-sm text-slate-700 bg-white border border-indigo-100 rounded-lg p-3 font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                                            placeholder="관리자 검토용 한국어 해석을 확인하거나 수정하세요."
                                                                        />
                                                                    </SectionPanelCard>

                                                                    <SectionPanelCard
                                                                        variant="indigoSoft"
                                                                        eyebrow="작업자 모국어 피드백"
                                                                        title={`모국어 전달 문맥 점검 (${nativeLanguage})`}
                                                                        description="근로자 교육 및 피드백 전달을 위한 모국어 문장입니다."
                                                                        className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-4"
                                                                        eyebrowClassName="text-xs font-bold uppercase tracking-[0.18em] text-violet-400"
                                                                        titleClassName="mt-1 text-xs font-black text-violet-700"
                                                                        descriptionClassName="mt-1 text-[11px] font-semibold text-violet-500"
                                                                        bodyClassName="mt-3"
                                                                    >
                                                                        <textarea
                                                                            value={String((ans as any).nativeTranslation || '')}
                                                                            onChange={(e) => handleAnswerChange(idx, 'nativeTranslation', e.target.value)}
                                                                            className="w-full min-h-[110px] text-sm text-slate-700 bg-white border border-violet-100 rounded-lg p-3 font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                                            placeholder="작업자 모국어 번역을 확인하거나 수정하세요."
                                                                        />
                                                                    </SectionPanelCard>
                                                                </div>
                                                            )}
                                                        </div>
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        

                            {!isCompactViewActive && (
                                <CollapsibleSection title="안전 검수 가이드 및 흐름 판단법 (클릭 시 확인)" defaultOpen={false}>
                                    <div className="space-y-4 pt-2">
                                        {!isCompactViewActive && (
                                <SectionPanelCard
                                    variant="indigo"
                                    eyebrow="모바일 작업 순서 안내"
                                    title="저장 → 판단 근거 → 보호 판단 확정 흐름을 빠르게 이어갑니다."
                                    description="현장 검수자가 가장 적은 클릭으로 보호 판단을 마칠 수 있게 정리했습니다."
                                    className="rounded-3xl px-5 py-5 shadow-sm"
                                    titleClassName="mt-2 text-sm font-black text-indigo-900"
                                    descriptionClassName="mt-2 text-xs font-bold leading-relaxed text-indigo-700"
                                    bodyClassName="mt-4"
                                >
                                    <NextActionChecklist
                                        title="권장 순서"
                                        className="mt-0 border-t-0 pt-0"
                                        titleClassName="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500"
                                        listClassName="space-y-1.5 text-xs font-bold leading-relaxed text-indigo-800"
                                        itemClassName="flex items-start gap-2"
                                        bulletClassName="mt-[2px] text-indigo-500"
                                        items={[
                                            { key: 'step-1', content: '근로자 정보와 원문/해석 내용을 먼저 수정합니다.' },
                                            { key: 'step-2', content: '상단 1차 저장으로 수정본을 고정합니다.' },
                                            { key: 'step-3', content: '하단 승인영역에 검토 근거를 남깁니다.' },
                                            { key: 'step-4', content: '최종 승인으로 2차 가공을 실행합니다.' },
                                            { key: 'step-5', content: '교육 리포트로 연결해 현장 공유를 이어갑니다.' },
                                        ]}
                                    />
                                </SectionPanelCard>
                            )}

                            {hasChanges && hasWeakSaveReason && (
                                <NoticeCallout
                                    variant="amber"
                                    eyebrow="수정 사유 보강 권장"
                                    title="1차 저장 전에 하단 승인영역 코멘트에 수정 이유를 6자 이상 남겨주세요."
                                    description={<><span>저장은 가능하지만, 사유가 짧으면 분석 화면에서 </span><span className="underline">수정사유 보강 필요</span><span> 배지로 표시됩니다.</span></>}
                                    className="w-full rounded-3xl border px-5 py-4 shadow-sm"
                                    bodyClassName="block"
                                    eyebrowClassName="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700"
                                    titleClassName="mt-2 text-sm font-black text-amber-800"
                                    descriptionClassName="mt-2 text-xs font-bold leading-relaxed text-amber-700"
                                />
                            )}
                                    </div>
                                </CollapsibleSection>
                            )}

                            <CollapsibleSection title="인적 정보 및 사진 등록 (클릭 시 확인)" defaultOpen={false}>
                                <div className="space-y-5 pt-2">
                                    {/* 1. Profile Photo Section (NEW) */}
                            <SectionPanelCard
                                variant="whiteSoft"
                                eyebrow="프로필 자산"
                                title="증명사진(프로필) 등록"
                                description={<><span>사원증(ID Card) 및 개인 리포트의 프로필 영역에 사용되며, 문서 이미지와 별도로 관리됩니다.</span></>}
                                className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm"
                                titleClassName="mt-1 text-lg font-black text-slate-900"
                                descriptionClassName="mt-1 text-xs font-medium leading-relaxed text-slate-500"
                                bodyClassName="mt-0"
                            >
                                <div className="flex items-center gap-6">
                                    <div className="relative group shrink-0">
                                        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-inner flex items-center justify-center relative">
                                            {hasProfileImage ? (
                                                <img src={record.profileImage} className="w-full h-full object-cover" alt="Profile" />
                                            ) : (
                                                <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                            )}
                                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </div>
                                            <input type="file" ref={profileInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'profile')} />
                                            <button onClick={() => profileInputRef.current?.click()} className="absolute inset-0 w-full h-full cursor-pointer"></button>
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white p-1.5 rounded-full shadow border-2 border-white pointer-events-none">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        {isPhotoQueueMode && (
                                            <NoticeCallout
                                                variant="emerald"
                                                eyebrow="가장 빠른 등록 방식"
                                                title="사진 업로드 시 자동 저장과 다음 대상 이동을 함께 진행합니다."
                                                description="다음 대상이 있으면 자동으로 이어지고, 마지막 대상이면 목록으로 돌아갑니다. 필요하면 상단에서 바로 다음 대상을 수동으로 열 수도 있습니다."
                                                className="mt-3 w-full rounded-2xl border px-3 py-3"
                                                bodyClassName="block"
                                                eyebrowClassName="text-[11px] font-black text-emerald-800"
                                                titleClassName="mt-1 text-[11px] font-black text-emerald-800"
                                                descriptionClassName="mt-1 text-[11px] font-bold leading-relaxed text-emerald-700"
                                            />
                                        )}
                                        {photoQueueNotice && (
                                            <NoticeCallout
                                                variant={photoQueueNotice.includes(BRAND_STATUS_LABELS.attention) ? 'rose' : 'indigo'}
                                                eyebrow={photoQueueNotice.includes(BRAND_STATUS_LABELS.attention) ? '추가 확인 안내' : '자동 진행 상태'}
                                                title={photoQueueNotice}
                                                className="mt-3 w-full rounded-2xl border px-3 py-3"
                                                bodyClassName="block"
                                                eyebrowClassName={photoQueueNotice.includes(BRAND_STATUS_LABELS.attention)
                                                    ? 'text-[11px] font-black text-rose-700'
                                                    : 'text-[11px] font-black text-indigo-700'}
                                                titleClassName={photoQueueNotice.includes(BRAND_STATUS_LABELS.attention)
                                                    ? 'mt-1 text-[11px] font-black text-rose-700'
                                                    : 'mt-1 text-[11px] font-black text-indigo-700'}
                                            />
                                        )}
                                        {!hasProfileImage && (
                                            <button onClick={() => profileInputRef.current?.click()} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                                                + 사진 업로드하기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </SectionPanelCard>

                            <SectionPanelCard
                                variant="whiteSoft"
                                eyebrow="근로자 정보 편집"
                                title={(
                                    <span className="flex items-center gap-3 text-indigo-600">
                                        <span className="rounded-lg bg-indigo-50 p-1.5">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </span>
                                        근로자 기본 정보 수정
                                    </span>
                                )}
                                description="기본 정보, 역할, 특수 임무를 한 번에 조정하고 필요하면 수정 내용으로 분석을 다시 맞춥니다."
                                headerAction={
                                    <ActionButton
                                        onClick={handleReflectChanges}
                                        disabled={isUpdatingAnalysis || isFinalizedRecord}
                                        variant={isUpdatingAnalysis || isFinalizedRecord ? 'slateSoft' : 'indigo'}
                                        className="px-3 py-1.5 text-[10px] border-0"
                                    >
                                        {isUpdatingAnalysis ? (
                                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        ) : (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        )}
                                        수정 내용으로 분석 갱신
                                    </ActionButton>
                                }
                                className="rounded-3xl border border-slate-200 bg-white px-8 py-8 shadow-sm"
                                titleClassName="mt-0 text-xs font-black uppercase tracking-widest"
                                descriptionClassName="mt-2 text-[11px] font-bold text-slate-500"
                                bodyClassName="mt-6"
                            >
                                <div className="space-y-6">
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">
                                                근로자 성명 
                                                {isLeader && <span className="text-yellow-500 ml-1">👑</span>}
                                                {isSubLeader && <span className="text-slate-400 ml-1">🛡️</span>}
                                                {record.isTranslator && <span className="text-blue-500 ml-1">🗣️</span>}
                                                {record.isSignalman && <span className="text-green-500 ml-1">🚦</span>}
                                            </label>
                                            <input 
                                                type="text" 
                                                value={record.name} 
                                                onChange={(e) => handleChange('name', e.target.value)}
                                                className="w-full text-2xl font-black p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 h-[72px]"
                                                placeholder="성명 확인/수정"
                                            />
                                        </div>
                                        <div className="w-40 shrink-0">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px] text-center">역할 구분</label>
                                            <div className="relative h-[72px]">
                                                <select 
                                                    value={record.role || 'worker'} 
                                                    onChange={(e) => handleChange('role', e.target.value)}
                                                    className={`w-full h-full px-4 rounded-2xl font-black text-xs appearance-none cursor-pointer border-2 transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-opacity-20
                                                        ${record.role === 'leader' 
                                                            ? 'bg-yellow-50 text-yellow-800 border-yellow-300 focus:ring-yellow-400' 
                                                            : record.role === 'sub_leader' 
                                                                ? 'bg-slate-100 text-slate-700 border-slate-300 focus:ring-slate-400' 
                                                                : 'bg-white text-slate-600 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500'}`}
                                                >
                                                    <option value="worker">일반 팀원</option>
                                                    <option value="sub_leader">부팀장/반장</option>
                                                    <option value="leader">팀장/소장</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                                                    <svg className={`w-5 h-5 ${
                                                        record.role === 'leader' ? 'text-yellow-600' :
                                                        'text-slate-400'
                                                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Duties Selection */}
                                    <div className="p-4 bg-slate-100 rounded-xl border border-slate-200">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[2px]">특수 임무 부여 (겸직 가능)</label>
                                        <div className="flex gap-4">
                                            <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${record.isTranslator ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="checkbox" checked={!!record.isTranslator} onChange={(e) => handleChange('isTranslator', e.target.checked)} className="hidden" />
                                                <span className="text-xl mr-2">🗣️</span>
                                                <span className="font-bold text-sm">통역 담당</span>
                                            </label>
                                            <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all ${record.isSignalman ? 'bg-green-50 border-green-400 text-green-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="checkbox" checked={!!record.isSignalman} onChange={(e) => handleChange('isSignalman', e.target.checked)} className="hidden" />
                                                <span className="text-xl mr-2">🚦</span>
                                                <span className="font-bold text-sm">신호수/유도원</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">공종</label>
                                            <input type="text" value={record.jobField} onChange={(e) => handleChange('jobField', e.target.value)} className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">팀장</label>
                                            <input 
                                                type="text" 
                                                value={record.teamLeader || ""} 
                                                onChange={(e) => handleChange('teamLeader', e.target.value)} 
                                                placeholder="예: 홍길동 팀장"
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600" 
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">관리번호 (선택)</label>
                                            <input
                                                type="text"
                                                value={record.employeeId || ''}
                                                onChange={(e) => handleChange('employeeId', e.target.value)}
                                                placeholder="관리자가 쓰는 번호가 있을 때만 입력"
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">현장 식별값 (선택)</label>
                                            <input
                                                type="text"
                                                value={record.qrId || ''}
                                                onChange={(e) => handleChange('qrId', e.target.value)}
                                                placeholder="자동 발급 또는 관리자 확인용"
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">국적 / 안내 언어</label>
                                            <select 
                                                value={record.nationality} 
                                                onChange={(e) => handleChange('nationality', e.target.value)} 
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600 appearance-none"
                                            >
                                                <option value="한국">한국 (Korea)</option>
                                                <option value="중국">중국 (China)</option>
                                                <option value="베트남">베트남 (Vietnam)</option>
                                                <option value="태국">태국 (Thailand)</option>
                                                <option value="캄보디아">캄보디아 (Cambodia)</option>
                                                <option value="인도네시아">인도네시아 (Indonesia)</option>
                                                <option value="우즈베키스탄">우즈베키스탄 (Uzbekistan)</option>
                                                <option value="몽골">몽골 (Mongolia)</option>
                                                <option value="카자흐스탄">카자흐스탄 (Kazakhstan)</option>
                                                <option value="러시아">러시아 (Russia)</option>
                                                <option value="필리핀">필리핀 (Philippines)</option>
                                                <option value="네팔">네팔 (Nepal)</option>
                                                <option value="미얀마">미얀마 (Myanmar)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-[2px]">작성일</label>
                                            <input 
                                                type="date" 
                                                value={record.date} 
                                                onChange={(e) => handleChange('date', e.target.value)}
                                                className="w-full font-bold p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-600"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </SectionPanelCard>

                            
                                </div>
                            </CollapsibleSection>
                        </div>

                        {/* Footer Buttons */}
                        <div className="p-6 bg-white border-t border-slate-200 flex justify-between items-center shadow-inner z-10 shrink-0">
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleReanalyzeClick} 
                                    disabled={isReanalyzing} 
                                    className={`text-xs font-black flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${isReanalyzing ? 'bg-slate-100 text-slate-400' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    <svg className={`w-4 h-4 ${isReanalyzing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2.5}/></svg>
                                    원문 다시 확인
                                </button>
                                <ActionButton variant="slateSoft" onClick={handleExportEvidenceCsv} className="px-4 py-2 border-0">검증자료 저장</ActionButton>
                                <ActionButton variant="indigo" onClick={handleExportEvidencePdf} className="px-4 py-2 border-0 hover:bg-indigo-200">검증 패키지 저장</ActionButton>
                            </div>
                            <button onClick={handleOpenReportClick} className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-sm font-black shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1">관리자 리포트 보기</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
