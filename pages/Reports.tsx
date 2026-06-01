
import React, { Suspense, lazy, useState, useRef, useMemo, useEffect } from 'react';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord, HarnessApprovalState, HarnessRiskDecision, HarnessWorkflowState, Page } from '../types';
import { extractMessage, toVercelFriendlyMessage } from '../utils/errorUtils';
import { postAdminJson } from '../utils/adminApiClient';
import { BRAND_STATUS_LABELS } from '../utils/brandLabels';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { NextActionChecklist } from '../components/shared/NextActionChecklist';
import { NoticeCallout } from '../components/shared/NoticeCallout';
import { HarnessVersionChangeSummaryPanel } from '../components/shared/HarnessVersionChangeSummaryPanel';
import { HarnessVersionDetailsPanel } from '../components/shared/HarnessVersionDetailsPanel';
import { HarnessRuleImpactSummaryPanel } from '../components/shared/HarnessRuleImpactSummaryPanel';
import { ReportGenerationProgress } from '../components/shared/ReportGenerationProgress';
import { StatusBadge } from '../components/shared/StatusBadge';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { createEvidencePackagePdfBlob } from '../utils/evidenceReportUtils';
import {
    buildEvidenceManifest,
    buildEvidencePackageJsonMeta,
    buildEvidencePackageReadme,
    EVIDENCE_PACKAGE_JSON_SCHEMA_VERSION,
    EVIDENCE_PACKAGE_README_FILE_NAME,
    EVIDENCE_PACKAGE_TEMPLATE_VERSION,
} from '../utils/evidencePackageTemplate';
import {
    getVerificationItemLabel,
    getVerificationSectionLabel,
    VERIFICATION_HISTORY_HEADER_LABELS,
} from '../utils/auditExportLabels';
import { buildPsiExportBaseName, buildPsiExportFileName } from '../utils/exportFileNaming';
import { buildExportTimestampMeta, formatIsoKstTimestamp } from '../utils/exportTimestamp';
import { ensureFileSaver, ensureHtml2Canvas, ensureJsPdfConstructor, ensureJsZip } from '../utils/externalScripts';
import { verifyEvidenceManifest, formatEvidenceVerificationSummary } from '../utils/evidenceVerificationUtils';
import type { EvidenceManifest, EvidenceManifestVerificationResult } from '../utils/evidenceVerificationUtils';
import {
    buildHarnessTransitionExecutionGuide,
    buildHarnessTransitionNarrative,
    formatHarnessTransitionStatusText,
    getHarnessTransitionActionLabel,
} from '../utils/harnessTransitionNarratives';
import { getHarnessVersionDescriptor, getHarnessVersionDescriptors, type HarnessVersionDetailsBundle } from '../utils/harnessVersionCatalog';
import { buildHarnessRuleImpactSummary } from '../utils/harnessRuleImpactSummary';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import { buildPdfBlobFromCanvases, canvasToBlob, captureReportCanvases, getCanvasImageData, getCanvasPlacementOnA4, saveCanvasesAsA4Pdf } from '../utils/pdfCapture';
import { fetchHarnessWorkflowStatus } from '../services/harnessService';
import { logOpsAlertClick, verifyOpsAlertClickLogsAccess } from '../services/opsAlertClickLogsService';
import { buildReportsSummaryCards, buildReportsViewCards } from '../utils/roleViewModel';
import { BRAND_TONE } from '../utils/brandToneTokens';
import { useDevMode } from '../contexts/DevModeContext';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { createMetricSessionId, trackUIViewMetric } from '../utils/uiViewModeMetrics';
import { useJudgmentTaggingQuality } from '../hooks/useJudgmentTaggingQuality';
import { EmptyState, SectionCard, MetricCard, StatusPill } from '../components/common';

const ReportTemplate = lazy(() => import('../components/ReportTemplate').then(module => ({ default: module.ReportTemplate })));

const ReportTemplateFallback: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl animate-pulse ${compact ? 'w-[210mm] min-h-[297mm]' : 'w-[210mm] min-h-[297mm]'} p-8`}>
        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
        <div className="h-3 w-72 bg-slate-100 dark:bg-slate-700 rounded mb-8" />
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-700" />
            <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-700" />
        </div>
        <div className="h-48 rounded-xl bg-slate-100 dark:bg-slate-700 mb-6" />
        <div className="h-32 rounded-xl bg-slate-100 dark:bg-slate-700" />
    </div>
);

const inferHarnessWorkflowState = (record: Partial<WorkerRecord>): HarnessWorkflowState => {
    if (record.workflowState) return record.workflowState;
    if (record.secondPassStatus === 'IN_PROGRESS') return 'second_pass_analyzing';
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
    if (record.approvalState) return record.approvalState;
    if (record.reviewStatus === 'REJECTED') return 'REJECTED';
    if (record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'APPROVED';
    if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') return 'PENDING';
    return 'NOT_REQUIRED';
};

type HarnessPersistenceState = 'connected' | 'fallback' | 'pending';

const getHarnessPersistenceState = (record: Partial<WorkerRecord>): HarnessPersistenceState => {
    if (String(record.harnessPersistenceWarning || '').trim()) return 'fallback';
    if (String(record.workflowRunId || '').trim()) return 'connected';
    return 'pending';
};

const getHarnessPersistenceLabel = (state: HarnessPersistenceState): string => {
    switch (state) {
        case 'connected': return '저장 연결됨';
        case 'fallback': return '폴백 동작중';
        default: return '저장 대기';
    }
};

const getHarnessWorkflowStateLabel = (state: HarnessWorkflowState): string => {
    switch (state) {
        case 'uploaded': return '업로드됨';
        case 'ocr_validating': return 'OCR 검증 중';
        case 'manual_review_required': return '수동 검토 필요';
        case 'context_ready': return '컨텍스트 준비';
        case 'first_pass_analyzing': return '1차 분석 중';
        case 'evaluator_review': return '검증 중';
        case 'awaiting_manager_approval': return '관리자 승인 대기';
        case 'manager_revised': return '관리자 수정 완료';
        case 'second_pass_analyzing': return '2차 재분석 중';
        case 'completed': return '완료';
        default: return '확인 필요';
    }
};

const getHarnessRiskDecisionLabel = (decision: HarnessRiskDecision): string => {
    switch (decision) {
        case 'SAFE_TO_PROCEED': return '진행 가능';
        case 'SUPPLEMENTARY_REVIEW': return '보완 검토';
        case 'IMMEDIATE_ATTENTION': return '즉시 확인 필요';
        case 'CRITICAL_STOP': return '작업 중지 검토';
        default: return '확인 필요';
    }
};

const getHarnessApprovalStateLabel = (state: HarnessApprovalState): string => {
    switch (state) {
        case 'NOT_REQUIRED': return '승인 불필요';
        case 'REQUIRED': return '승인 필요';
        case 'PENDING': return '승인 대기';
        case 'APPROVED': return '승인 완료';
        case 'REJECTED': return '반려';
        default: return '확인 필요';
    }
};

const getHarnessWorkflowBadgeVariant = (state: HarnessWorkflowState): React.ComponentProps<typeof StatusBadge>['variant'] => {
    switch (state) {
        case 'completed': return 'emeraldSoft';
        case 'awaiting_manager_approval':
        case 'second_pass_analyzing': return 'violetSoft';
        case 'manager_revised': return 'amberSoft';
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

const getHarnessPersistenceBadgeVariant = (state: HarnessPersistenceState): React.ComponentProps<typeof StatusBadge>['variant'] => {
    switch (state) {
        case 'connected': return 'emeraldSoft';
        case 'fallback': return 'amberSoft';
        default: return 'slateSoft';
    }
};

type ReportType = 'worker-report' | 'team-report';
type GenMode = 'combined-pdf' | 'individual-pdf' | 'individual-img';
type ViewMode = 'list' | 'preview';
type DatePreset = 'all' | 'last30' | 'thisMonth' | 'custom';
type OpsAlertDatePreset = 'all' | 'today' | 'last7' | 'last30' | 'custom';

type InterventionPlanStatus = 'not-started' | 'in-progress' | 'completed';

type InterventionPlanSnapshot = {
    key: string;
    actionTitle: string;
    workerName: string;
    dueLabel: string;
    status: InterventionPlanStatus;
};

type PredictiveInterventionHandoff = {
    generatedAt: string;
    topRiskLabel: string;
    plans: InterventionPlanSnapshot[];
};

type OpsAlertClickLog = {
    id: string;
    clickedAt: string;
    action: 'go-intervention' | 'go-tagging-validation';
    delayAlertActive: boolean;
    taggingErrorCount: number;
    interventionNotStartedCount: number;
};

type IntroQaAlertRunlogEntry = {
    checkedAt: string;
    connected: number;
    dataReady: number;
    total: number;
    warnItems: number;
    hasWarnings: boolean;
    warningPages: Page[];
};

const PREDICTIVE_INTERVENTION_HANDOFF_KEY = 'psi_predictive_intervention_handoff_v1';
const PREDICTIVE_INTERVENTION_HANDOFF_EVENT = 'psi-predictive-intervention-updated';
const REPORTS_DELIVERY_SNAPSHOT_KEY = 'psi_reports_delivery_snapshot_v1';
const REPORTS_DELIVERY_SNAPSHOT_EVENT = 'psi-reports-delivery-snapshot-updated';
const OPS_ALERT_CLICK_LOG_KEY = 'psi_ops_alert_click_log_v1';
const INTRO_QA_ALERT_RUNLOG_KEY = 'psi_intro_mobile_feature_qa_alert_runlog_v1';

type ReportsDeliverySnapshotState = 'idle' | 'running' | 'generated' | 'verified' | 'attention';

type ReportsDeliverySnapshot = {
    updatedAt: string;
    state: ReportsDeliverySnapshotState;
    generationStatus: ReportGenerationUiState['status'];
    generationProgress: number;
    filteredCount: number;
    isPackagingEvidence: boolean;
    verificationChecked: boolean;
    verificationPassed: boolean;
};

type OpsAlertLogApiResponse = {
    ok: boolean;
    data?: {
        rows?: OpsAlertClickLog[];
        schemaReady?: boolean;
    };
};

type OpsAlertSyncState = 'idle' | 'syncing' | 'server' | 'fallback';

interface ReportGenerationUiState {
    status: 'idle' | 'running' | 'success' | 'error';
    progress: number;
    phaseLabel: string;
    errorMessage?: string;
}

interface ReportsProps {
    workerRecords?: WorkerRecord[];
    safetyCheckRecords?: SafetyCheckRecord[];
    briefingData: BriefingData | null;
    setBriefingData: (data: BriefingData | null) => void;
    forecastData: RiskForecastData | null;
    setForecastData: (data: RiskForecastData | null) => void;
    onNavigateToPage?: (page: Page) => void;
}

const Reports: React.FC<ReportsProps> = ({ workerRecords = [], safetyCheckRecords = [], briefingData, setBriefingData, forecastData, setForecastData, onNavigateToPage }) => {
    const { isDevMode } = useDevMode();
    const { mode: operationalMode } = useOperationalMode();
    const isImmediateOperationalMode = operationalMode === 'immediate';
    const [activeTab, setActiveTab] = useState<ReportType>('team-report');
    const [isGenerating, setIsGenerating] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [isPackagingEvidence, setIsPackagingEvidence] = useState(false);
    const [reportGenerationUi, setReportGenerationUi] = useState<ReportGenerationUiState>({
        status: 'idle',
        progress: 0,
        phaseLabel: '대기 중',
    });
    
    // 생성 옵션
    const [selectedTeam, setSelectedTeam] = useState('전체');
    const [filterLevel, setFilterLevel] = useState('전체');
    const [genMode, setGenMode] = useState<GenMode>('individual-pdf'); 
    const { data: taggingQuality, loading: taggingQualityLoading } = useJudgmentTaggingQuality();
    const [interventionHandoff, setInterventionHandoff] = useState<PredictiveInterventionHandoff | null>(null);
    const [opsAlertClickLogs, setOpsAlertClickLogs] = useState<OpsAlertClickLog[]>([]);
    const [introQaAlertRunlog, setIntroQaAlertRunlog] = useState<IntroQaAlertRunlogEntry[]>([]);
    const [opsAlertSyncState, setOpsAlertSyncState] = useState<OpsAlertSyncState>('idle');
    const [opsAlertSyncNote, setOpsAlertSyncNote] = useState('최근 상태를 아직 불러오지 않았습니다. 필요 시 최신 상태 불러오기를 눌러 확인해 주세요.');
    const [hasOpsAlertServerFetched, setHasOpsAlertServerFetched] = useState(false);
    const [isOpsAlertPending, setIsOpsAlertPending] = useState(false);
    const [opsAlertActionFilter, setOpsAlertActionFilter] = useState<'all' | OpsAlertClickLog['action']>('all');
    const [opsAlertDatePreset, setOpsAlertDatePreset] = useState<OpsAlertDatePreset>('all');
    const [opsAlertStartDate, setOpsAlertStartDate] = useState('');
    const [opsAlertEndDate, setOpsAlertEndDate] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    
    // 뷰 모드 및 미리보기 상태
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [previewIndex, setPreviewIndex] = useState(0);
    const previewRef = useRef<HTMLDivElement>(null); // For single capture in preview

    // Bulk Generation State
    const [generatingRecord, setGeneratingRecord] = useState<WorkerRecord | null>(null);
    const [generatingHistory, setGeneratingHistory] = useState<WorkerRecord[]>([]);
    const bulkReportRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<boolean>(false);

    // Evidence Verification State
    const [verificationManifestFile, setVerificationManifestFile] = useState<File | null>(null);
    const [verificationJsonFiles, setVerificationJsonFiles] = useState<File[]>([]);
    const [isVerifyingEvidence, setIsVerifyingEvidence] = useState(false);
    const [verificationResult, setVerificationResult] = useState<EvidenceManifestVerificationResult | null>(null);
    const [verificationSummary, setVerificationSummary] = useState('');
    const [verificationHistory, setVerificationHistory] = useState<Array<{
        id: string;
        verifiedAt: string;
        manifestFileName: string;
        packageName: string;
        isValid: boolean;
        totalEntries: number;
        verifiedEntries: number;
        missingJsonFiles: number;
        invalidJsonFiles: number;
        hashMismatches: number;
        missingHarnessSnapshots: number;
        metadataMismatches: number;
        packageSummaryHashMatched: boolean;
        primaryFailureReason: string;
        templateConformanceStatus: 'CONFORMANT' | 'MISMATCH' | 'UNKNOWN';
        templateConformanceDescription: string;
        summaryText: string;
    }>>([]);
    const [selectedVerificationStatusFilter, setSelectedVerificationStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL');
    const [selectedVerificationFailureFilter, setSelectedVerificationFailureFilter] = useState('ALL');
    const [selectedVerificationPackageFilter, setSelectedVerificationPackageFilter] = useState('ALL');
    const [verificationManifestPreview, setVerificationManifestPreview] = useState<EvidenceManifest | null>(null);
    const [verificationManifestPreviewError, setVerificationManifestPreviewError] = useState<string | null>(null);
    const [previewWorkflowStatus, setPreviewWorkflowStatus] = useState<Awaited<ReturnType<typeof fetchHarnessWorkflowStatus>> | null>(null);
    const [previewWorkflowStatusLoading, setPreviewWorkflowStatusLoading] = useState(false);
    const [previewWorkflowStatusError, setPreviewWorkflowStatusError] = useState<string | null>(null);
    const [hasPreviewStatusFetched, setHasPreviewStatusFetched] = useState(false);
    const [isPreviewStatusPending, setIsPreviewStatusPending] = useState(false);
    const opsAlertServerFetchRef = useRef<(() => void) | null>(null);
    const previewStatusFetchRef = useRef<(() => void) | null>(null);
    const opsAlertLogsRequestInFlightRef = useRef(false);
    const previewStatusRequestInFlightRef = useRef(false);
    const quickActionMetricSessionRef = useRef<string>(createMetricSessionId('reports'));

    useEffect(() => {
        const readInterventionHandoff = () => {
            try {
                const raw = localStorage.getItem(PREDICTIVE_INTERVENTION_HANDOFF_KEY);
                if (!raw) {
                    setInterventionHandoff(null);
                    return;
                }
                const parsed = JSON.parse(raw) as PredictiveInterventionHandoff;
                if (!parsed || !Array.isArray(parsed.plans)) {
                    setInterventionHandoff(null);
                    return;
                }
                setInterventionHandoff(parsed);
            } catch {
                setInterventionHandoff(null);
            }
        };

        readInterventionHandoff();

        const handleStorage = (event: StorageEvent) => {
            if (!event.key || event.key === PREDICTIVE_INTERVENTION_HANDOFF_KEY) {
                readInterventionHandoff();
            }
        };

        const handleInterventionUpdate = () => {
            readInterventionHandoff();
        };

        window.addEventListener('storage', handleStorage);
        window.addEventListener(PREDICTIVE_INTERVENTION_HANDOFF_EVENT, handleInterventionUpdate);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(PREDICTIVE_INTERVENTION_HANDOFF_EVENT, handleInterventionUpdate);
        };
    }, []);

    useEffect(() => {
        const readOpsAlertLogs = () => {
            try {
                const raw = localStorage.getItem(OPS_ALERT_CLICK_LOG_KEY);
                if (!raw) {
                    setOpsAlertClickLogs([]);
                    return;
                }
                const parsed = JSON.parse(raw);
                const safeLogs: OpsAlertClickLog[] = Array.isArray(parsed) ? parsed : [];
                setOpsAlertClickLogs(safeLogs);
            } catch {
                setOpsAlertClickLogs([]);
            }
        };

        const readIntroQaRunlog = () => {
            try {
                const raw = localStorage.getItem(INTRO_QA_ALERT_RUNLOG_KEY);
                if (!raw) {
                    setIntroQaAlertRunlog([]);
                    return;
                }
                const parsed = JSON.parse(raw);
                const safeRunlog: IntroQaAlertRunlogEntry[] = Array.isArray(parsed)
                    ? parsed
                        .filter((entry) => entry && typeof entry === 'object')
                        .map((entry) => ({
                            checkedAt: String(entry.checkedAt || new Date(0).toISOString()),
                            connected: Number(entry.connected || 0),
                            dataReady: Number(entry.dataReady || 0),
                            total: Number(entry.total || 0),
                            warnItems: Number(entry.warnItems || 0),
                            hasWarnings: Boolean(entry.hasWarnings),
                            warningPages: Array.isArray(entry.warningPages)
                                ? entry.warningPages.filter((page): page is Page => typeof page === 'string')
                                : [],
                        }))
                    : [];
                setIntroQaAlertRunlog(safeRunlog);
            } catch {
                setIntroQaAlertRunlog([]);
            }
        };

        const mergeLogs = (primary: OpsAlertClickLog[], secondary: OpsAlertClickLog[]) => {
            const mergedMap = new Map<string, OpsAlertClickLog>();
            [...primary, ...secondary].forEach((log) => {
                if (!log?.id) return;
                mergedMap.set(log.id, log);
            });

            return Array.from(mergedMap.values())
                .sort((a, b) => new Date(b.clickedAt).getTime() - new Date(a.clickedAt).getTime())
                .slice(0, 200);
        };

        const loadOpsAlertLogsFromServer = async () => {
            setOpsAlertSyncState('syncing');
            setOpsAlertSyncNote('서버 동기화 확인 중');
            try {
                const response = await postAdminJson<OpsAlertLogApiResponse>(
                    '/api/admin/safety-management',
                    {
                        action: 'list-ops-alert-click-logs',
                        payload: {
                            limit: 200,
                            offset: 0,
                        },
                    },
                    { fallbackMessage: '경보 CTA 로그 조회 실패' },
                );

                const schemaReady = Boolean(response?.data?.schemaReady);
                if (!schemaReady) {
                    setOpsAlertSyncState('fallback');
                    setOpsAlertSyncNote('서버 스키마 미준비 · 로컬 로그 사용');
                    return;
                }

                const serverRows = Array.isArray(response?.data?.rows) ? response.data.rows : [];
                const raw = localStorage.getItem(OPS_ALERT_CLICK_LOG_KEY);
                const localRows: OpsAlertClickLog[] = raw ? (JSON.parse(raw) as OpsAlertClickLog[]) : [];
                const nextLogs = mergeLogs(serverRows, Array.isArray(localRows) ? localRows : []);

                localStorage.setItem(OPS_ALERT_CLICK_LOG_KEY, JSON.stringify(nextLogs));
                setOpsAlertClickLogs(nextLogs);
                setOpsAlertSyncState('server');
                setOpsAlertSyncNote('서버 동기화 완료');
            } catch (error) {
                console.warn('[Reports] 경보 CTA 로그 서버 조회 실패 (로컬 폴백 유지):', extractMessage(error));
                setOpsAlertSyncState('fallback');
                setOpsAlertSyncNote(toVercelFriendlyMessage(error, '서버 조회 실패 · 로컬 폴백 사용'));
            }
        };

        readOpsAlertLogs();
        readIntroQaRunlog();
        opsAlertServerFetchRef.current = () => {
            if (opsAlertLogsRequestInFlightRef.current) return;
            opsAlertLogsRequestInFlightRef.current = true;
            setIsOpsAlertPending(true);
            setHasOpsAlertServerFetched(true);
            loadOpsAlertLogsFromServer()
                .catch(() => undefined)
                .finally(() => {
                    window.setTimeout(() => {
                        opsAlertLogsRequestInFlightRef.current = false;
                        setIsOpsAlertPending(false);
                    }, 450);
                });
        };

        const handleStorage = (event: StorageEvent) => {
            if (!event.key || event.key === OPS_ALERT_CLICK_LOG_KEY) {
                readOpsAlertLogs();
            }
            if (!event.key || event.key === INTRO_QA_ALERT_RUNLOG_KEY) {
                readIntroQaRunlog();
            }
        };

        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener('storage', handleStorage);
            opsAlertServerFetchRef.current = null;
            opsAlertLogsRequestInFlightRef.current = false;
            setIsOpsAlertPending(false);
        };
    }, []);

    const handleLoadLatestOpsAlertStatus = () => {
        opsAlertServerFetchRef.current?.();
    };

    const latestIntroQaRunlog = introQaAlertRunlog[0] || null;

    const getPageLabel = (page: Page) => {
        switch (page) {
            case 'dashboard': return '1 홈 대시보드';
            case 'site-issue-management': return '2 경보 알림';
            case 'worker-management': return '3 개인인지 프로파일';
            case 'worker-training': return '4 위험인지 진단';
            case 'field-context-input': return '5 현장 컨텍스트';
            case 'safety-behavior-management': return '6 행동 패턴 분석';
            case 'predictive-analysis': return '7 위험 예측';
            case 'intervention-coaching': return '8 개입 추천';
            case 'judgment-tagging-input': return '9 수기 데이터 입력';
            case 'ocr-analysis': return '10 태깅 검증';
            case 'reports': return '11 분석 리포트';
            case 'settings': return '12 메뉴/설정';
            default: return page;
        }
    };

    const trackQuickAction = (actionKey: string, payload?: Record<string, unknown>) => {
        trackUIViewMetric('cta_click', 'reports', quickActionMetricSessionRef.current, {
            actionKey,
            panel: 'pc_quick_actions',
            ...payload,
        });
    };

    const bulkProgressPercent = useMemo(() => {
        if (!bulkProgress.total || bulkProgress.total <= 0) return 0;
        return Math.min(100, Math.round((bulkProgress.current / bulkProgress.total) * 100));
    }, [bulkProgress.current, bulkProgress.total]);

    const scoredRecords = useMemo(
        () => workerRecords.map((record) => ({
            ...record,
            safetyLevel: getSafetyLevelFromScore(Number(record.safetyScore)),
        })),
        [workerRecords],
    );

    // 공종 목록 추출
    const teams = useMemo(() => ['전체', ...Array.from(new Set(scoredRecords.map(r => r.jobField))).sort()], [scoredRecords]);

    const parseRecordDate = (value: string): Date | null => {
        if (!value) return null;
        const normalized = value.replace(/\./g, '-').replace(/\//g, '-').replace(/\s+/g, '').trim();
        const direct = new Date(normalized);
        if (!Number.isNaN(direct.getTime())) return direct;

        const matched = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!matched) return null;

        const [, year, month, day] = matched;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
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

    const getPrimaryVerificationFailureReason = (input: {
        missingJsonFiles: number;
        invalidJsonFiles: number;
        hashMismatches: number;
        missingHarnessSnapshots: number;
        metadataMismatches: number;
        packageSummaryHashMatched: boolean;
    }) => {
        const ranked = [
            { label: '해시 불일치', count: input.hashMismatches },
            { label: '메타 불일치', count: input.metadataMismatches },
            { label: '스냅샷 누락', count: input.missingHarnessSnapshots },
            { label: '파싱 불가 JSON', count: input.invalidJsonFiles },
            { label: '누락 JSON', count: input.missingJsonFiles },
            { label: '요약 해시 불일치', count: input.packageSummaryHashMatched ? 0 : 1 },
        ].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));

        return ranked[0]?.count > 0 ? ranked[0].label : '실패 기록 없음';
    };

    const getVerificationFailureRecommendedAction = (reason: string) => {
        switch (reason) {
            case '해시 불일치':
                return 'manifest와 JSON 원본을 같은 생성 시점 기준으로 다시 묶어 패키지를 재생성하십시오.';
            case '메타 불일치':
                return 'manifest 메타와 JSON 내부 안전 기록 스냅샷을 함께 재동기화한 뒤 다시 검증하십시오.';
            case '스냅샷 누락':
                return '안전 기록 감사 스냅샷 포함 옵션을 확인하고 처리 상태 연동을 먼저 점검하십시오.';
            case '파싱 불가 JSON':
                return '손상된 JSON을 다시 내보내고 업로드 파일 인코딩/절단 여부를 재확인하십시오.';
            case '누락 JSON':
                return 'manifest에 기록된 JSON 파일이 모두 업로드되었는지 먼저 확인하십시오.';
            case '요약 해시 불일치':
                return '패키지 전체 JSON 묶음을 다시 생성해 manifest summary hash를 재계산하십시오.';
            case '실패 기록 없음':
                return '현재 추가 조치는 필요하지 않습니다.';
            default:
                return '해당 실패 원인의 입력 파일, manifest, 안전 기록 스냅샷을 함께 비교 점검하십시오.';
        }
    };

    const VERIFICATION_HISTORY_STORAGE_KEY = 'psi_reports_verification_history_v1';
    const VERIFICATION_STATUS_FILTER_STORAGE_KEY = 'psi_reports_verification_status_filter_v1';
    const VERIFICATION_FAILURE_FILTER_STORAGE_KEY = 'psi_reports_verification_failure_filter_v1';
    const VERIFICATION_PACKAGE_FILTER_STORAGE_KEY = 'psi_reports_verification_package_filter_v1';
    const VERIFICATION_HISTORY_RETENTION_DAYS = 30;
    const VERIFICATION_HISTORY_MAX_ITEMS = 12;
    const VERIFICATION_STATUS_FILTER_OPTIONS: Array<'ALL' | 'SUCCESS' | 'FAILED'> = ['ALL', 'SUCCESS', 'FAILED'];

    const normalizeStoredVerificationHistory = (entries: Array<{
        id?: string;
        verifiedAt?: string;
        manifestFileName?: string;
        packageName?: string;
        isValid?: boolean;
        totalEntries?: number;
        verifiedEntries?: number;
        missingJsonFiles?: number;
        invalidJsonFiles?: number;
        hashMismatches?: number;
        missingHarnessSnapshots?: number;
        metadataMismatches?: number;
        packageSummaryHashMatched?: boolean;
        primaryFailureReason?: string;
        templateConformanceStatus?: 'CONFORMANT' | 'MISMATCH' | 'UNKNOWN' | string;
        templateConformanceDescription?: string;
        summaryText?: string;
    }>) => {
        const retentionThreshold = Date.now() - (VERIFICATION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        return entries
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry, index) => ({
                id: String(entry.id || `stored-${index}`),
                verifiedAt: String(entry.verifiedAt || new Date(0).toISOString()),
                manifestFileName: String(entry.manifestFileName || 'manifest.json'),
                packageName: String(entry.packageName || ''),
                isValid: Boolean(entry.isValid),
                totalEntries: Number(entry.totalEntries || 0),
                verifiedEntries: Number(entry.verifiedEntries || 0),
                missingJsonFiles: Number(entry.missingJsonFiles || 0),
                invalidJsonFiles: Number(entry.invalidJsonFiles || 0),
                hashMismatches: Number(entry.hashMismatches || 0),
                missingHarnessSnapshots: Number(entry.missingHarnessSnapshots || 0),
                metadataMismatches: Number(entry.metadataMismatches || 0),
                packageSummaryHashMatched: Boolean(entry.packageSummaryHashMatched),
                primaryFailureReason: String(entry.primaryFailureReason || '실패 기록 없음'),
                templateConformanceStatus: entry.templateConformanceStatus === 'CONFORMANT' || entry.templateConformanceStatus === 'MISMATCH'
                    ? entry.templateConformanceStatus
                    : 'UNKNOWN',
                templateConformanceDescription: String(entry.templateConformanceDescription || ''),
                summaryText: String(entry.summaryText || ''),
            }))
            .filter((entry) => {
                const verifiedAt = new Date(entry.verifiedAt).getTime();
                return !Number.isNaN(verifiedAt) && verifiedAt >= retentionThreshold;
            })
            .sort((a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime())
            .slice(0, VERIFICATION_HISTORY_MAX_ITEMS);
    };

    const dateFilterLabel = useMemo(() => {
        if (datePreset === 'last30') return '최근30일';
        if (datePreset === 'thisMonth') return '당월';
        if (datePreset === 'custom' && customStartDate && customEndDate) return `${customStartDate}_${customEndDate}`;
        if (datePreset === 'custom') return '사용자지정';
        return '전체기간';
    }, [datePreset, customStartDate, customEndDate]);

    const resolvedDateRange = useMemo(() => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (datePreset === 'last30') {
            endDate = new Date(now);
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
        } else if (datePreset === 'thisMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            endDate = new Date(now);
        } else if (datePreset === 'custom') {
            if (customStartDate) {
                const parsedStart = new Date(customStartDate);
                if (!Number.isNaN(parsedStart.getTime())) {
                    parsedStart.setHours(0, 0, 0, 0);
                    startDate = parsedStart;
                }
            }
            if (customEndDate) {
                const parsedEnd = new Date(customEndDate);
                if (!Number.isNaN(parsedEnd.getTime())) {
                    parsedEnd.setHours(23, 59, 59, 999);
                    endDate = parsedEnd;
                }
            }
        }

        const formatYmd = (date: Date | null) => {
            if (!date) return 'N/A';
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        return {
            startDate,
            endDate,
            startLabel: formatYmd(startDate),
            endLabel: formatYmd(endDate),
        };
    }, [datePreset, customStartDate, customEndDate]);

    const isInvalidCustomDateRange = useMemo(() => {
        if (datePreset !== 'custom') return false;
        if (!customStartDate || !customEndDate) return false;
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
        return start > end;
    }, [datePreset, customStartDate, customEndDate]);

    const isIncompleteCustomDateRange = useMemo(() => {
        if (datePreset !== 'custom') return false;
        return !customStartDate || !customEndDate;
    }, [datePreset, customStartDate, customEndDate]);

    const hasCustomDateRangeError = isInvalidCustomDateRange || isIncompleteCustomDateRange;

    // 필터링 로직
    const filteredRecords = useMemo(() => {
        let result = scoredRecords;
        if (activeTab === 'team-report' && selectedTeam !== '전체') {
            result = result.filter(r => r.jobField === selectedTeam);
        }
        if (filterLevel !== '전체') {
            result = result.filter(r => r.safetyLevel === filterLevel);
        }
        if (datePreset !== 'all') {
            result = result.filter(record => {
                const recordDate = parseRecordDate(record.date);
                if (!recordDate) return false;
                const inStart = !resolvedDateRange.startDate || recordDate >= resolvedDateRange.startDate;
                const inEnd = !resolvedDateRange.endDate || recordDate <= resolvedDateRange.endDate;
                return inStart && inEnd;
            });
        }
        // 최신 데이터 기준 정렬 (이름순)
        return result.sort((a,b) => a.name.localeCompare(b.name));
    }, [scoredRecords, activeTab, selectedTeam, filterLevel, datePreset, resolvedDateRange]);

    // 필터 변경 시 미리보기 인덱스 초기화
    useEffect(() => {
        setPreviewIndex(0);
    }, [selectedTeam, filterLevel, datePreset, customStartDate, customEndDate, activeTab]);

    useEffect(() => {
        if (datePreset !== 'custom') return;
        if (customStartDate || customEndDate) return;

        const formatDateInput = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const today = new Date();
        const end = formatDateInput(today);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
        const start = formatDateInput(startDate);

        setCustomStartDate(start);
        setCustomEndDate(end);
    }, [datePreset, customStartDate, customEndDate]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const state: ReportsDeliverySnapshotState = reportGenerationUi.status === 'error'
            ? 'attention'
            : (isGenerating || isPackagingEvidence || reportGenerationUi.status === 'running')
                ? 'running'
                : verificationResult?.isValid
                    ? 'verified'
                    : reportGenerationUi.status === 'success'
                        ? 'generated'
                        : 'idle';

        const snapshot: ReportsDeliverySnapshot = {
            updatedAt: new Date().toISOString(),
            state,
            generationStatus: reportGenerationUi.status,
            generationProgress: reportGenerationUi.progress,
            filteredCount: filteredRecords.length,
            isPackagingEvidence,
            verificationChecked: Boolean(verificationResult),
            verificationPassed: Boolean(verificationResult?.isValid),
        };

        try {
            window.localStorage.setItem(REPORTS_DELIVERY_SNAPSHOT_KEY, JSON.stringify(snapshot));
            window.dispatchEvent(new Event(REPORTS_DELIVERY_SNAPSHOT_EVENT));
        } catch {
            // ignore localStorage write failures
        }
    }, [filteredRecords.length, isGenerating, isPackagingEvidence, reportGenerationUi.progress, reportGenerationUi.status, verificationResult]);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(VERIFICATION_HISTORY_STORAGE_KEY);
            if (!raw) return;

            const parsed = JSON.parse(raw) as Array<{
                id?: string;
                verifiedAt?: string;
                manifestFileName?: string;
                packageName?: string;
                isValid?: boolean;
                totalEntries?: number;
                verifiedEntries?: number;
                missingJsonFiles?: number;
                invalidJsonFiles?: number;
                hashMismatches?: number;
                missingHarnessSnapshots?: number;
                metadataMismatches?: number;
                packageSummaryHashMatched?: boolean;
                primaryFailureReason?: string;
                summaryText?: string;
            }>;

            if (!Array.isArray(parsed)) return;

            setVerificationHistory(normalizeStoredVerificationHistory(parsed));
        } catch {
            // ignore storage parse failures
        }
    }, []);

    useEffect(() => {
        try {
            const savedFilter = window.localStorage.getItem(VERIFICATION_STATUS_FILTER_STORAGE_KEY);
            if (!savedFilter) return;
            if (savedFilter === 'ALL' || savedFilter === 'SUCCESS' || savedFilter === 'FAILED') {
                setSelectedVerificationStatusFilter(savedFilter);
            }
        } catch {
            // ignore storage read failures
        }
    }, []);

    useEffect(() => {
        try {
            const savedFilter = window.localStorage.getItem(VERIFICATION_FAILURE_FILTER_STORAGE_KEY);
            if (!savedFilter) return;
            setSelectedVerificationFailureFilter(savedFilter);
        } catch {
            // ignore storage read failures
        }
    }, []);

    useEffect(() => {
        try {
            const savedFilter = window.localStorage.getItem(VERIFICATION_PACKAGE_FILTER_STORAGE_KEY);
            if (!savedFilter) return;
            setSelectedVerificationPackageFilter(savedFilter);
        } catch {
            // ignore storage read failures
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(VERIFICATION_HISTORY_STORAGE_KEY, JSON.stringify(normalizeStoredVerificationHistory(verificationHistory)));
        } catch {
            // ignore storage write failures
        }
    }, [verificationHistory]);

    useEffect(() => {
        try {
            window.localStorage.setItem(VERIFICATION_STATUS_FILTER_STORAGE_KEY, selectedVerificationStatusFilter);
        } catch {
            // ignore storage write failures
        }
    }, [selectedVerificationStatusFilter]);

    useEffect(() => {
        try {
            window.localStorage.setItem(VERIFICATION_FAILURE_FILTER_STORAGE_KEY, selectedVerificationFailureFilter);
        } catch {
            // ignore storage write failures
        }
    }, [selectedVerificationFailureFilter]);

    useEffect(() => {
        try {
            window.localStorage.setItem(VERIFICATION_PACKAGE_FILTER_STORAGE_KEY, selectedVerificationPackageFilter);
        } catch {
            // ignore storage write failures
        }
    }, [selectedVerificationPackageFilter]);

    useEffect(() => {
        if (!VERIFICATION_STATUS_FILTER_OPTIONS.includes(selectedVerificationStatusFilter)) {
            setSelectedVerificationStatusFilter('ALL');
        }
    }, [selectedVerificationStatusFilter]);

    useEffect(() => {
        if (selectedVerificationFailureFilter === 'ALL') {
            return;
        }

        const availableFailureReasons = new Set(
            verificationHistory
                .filter((entry) => !entry.isValid && entry.primaryFailureReason !== '실패 기록 없음')
                .map((entry) => entry.primaryFailureReason),
        );

        if (!availableFailureReasons.has(selectedVerificationFailureFilter)) {
            setSelectedVerificationFailureFilter('ALL');
        }
    }, [selectedVerificationFailureFilter, verificationHistory]);

    useEffect(() => {
        if (selectedVerificationPackageFilter === 'ALL') {
            return;
        }

        const availablePackages = new Set(
            verificationHistory
                .map((entry) => entry.packageName)
                .filter((value) => String(value || '').trim().length > 0),
        );

        if (!availablePackages.has(selectedVerificationPackageFilter)) {
            setSelectedVerificationPackageFilter('ALL');
        }
    }, [selectedVerificationPackageFilter, verificationHistory]);

    // 현재 미리보기 대상 데이터
    const currentPreviewRecord = filteredRecords[previewIndex];
    const currentPreviewHistory = useMemo(() => {
        if (!currentPreviewRecord) return [];
        return scoredRecords.filter(r => 
            r.name === currentPreviewRecord.name && 
            (r.teamLeader || '미지정') === (currentPreviewRecord.teamLeader || '미지정')
        );
    }, [currentPreviewRecord, scoredRecords]);

    const harnessSummary = useMemo(() => {
        return filteredRecords.reduce((summary, record) => {
            const workflowState = inferHarnessWorkflowState(record);
            const riskDecision = inferHarnessRiskDecision(record);
            const approvalState = inferHarnessApprovalState(record, workflowState);
            const persistenceState = getHarnessPersistenceState(record);

            summary.total += 1;
            if (record.workflowRunId) summary.runLinked += 1;
            if (persistenceState === 'connected') summary.connected += 1;
            if (persistenceState === 'fallback') summary.fallback += 1;
            if (persistenceState === 'pending') summary.pending += 1;
            if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') {
                summary.reviewNeeded += 1;
            }
            if (approvalState === 'PENDING' || approvalState === 'REQUIRED') summary.approvalPending += 1;
            if (riskDecision === 'IMMEDIATE_ATTENTION' || riskDecision === 'CRITICAL_STOP') summary.highRisk += 1;
            return summary;
        }, {
            total: 0,
            runLinked: 0,
            connected: 0,
            fallback: 0,
            pending: 0,
            reviewNeeded: 0,
            approvalPending: 0,
            highRisk: 0,
        });
    }, [filteredRecords]);

    const harnessSummaryMetrics = useMemo(() => [
        {
            key: 'harness-connected',
            label: '저장 연결',
            value: `${harnessSummary.connected}건`,
            helper: `${harnessSummary.runLinked}건이 리포트 처리 번호와 연결되어 있습니다.`,
            tone: BRAND_TONE.emeraldSoft80,
        },
        {
            key: 'harness-fallback',
            label: '폴백/대기',
            value: `${harnessSummary.fallback + harnessSummary.pending}건`,
            helper: `폴백 ${harnessSummary.fallback}건 · 저장 대기 ${harnessSummary.pending}건`,
            tone: harnessSummary.fallback > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'harness-review',
            label: '재확인 필요',
            value: `${harnessSummary.reviewNeeded}건`,
            helper: `승인 대기 ${harnessSummary.approvalPending}건을 포함합니다.`,
            tone: harnessSummary.reviewNeeded > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'harness-risk',
            label: '즉시 보호 대상',
            value: `${harnessSummary.highRisk}건`,
            helper: '보고서 우선 설명·보완 순서를 정할 때 먼저 읽어야 하는 대상입니다.',
            tone: harnessSummary.highRisk > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-slate-200 bg-slate-50',
        },
    ], [harnessSummary]);

    const harnessReportOperationalCards: InterpretationCardItem[] = useMemo(() => {
        const runCoverageRate = harnessSummary.total > 0
            ? Math.round((harnessSummary.connected / harnessSummary.total) * 100)
            : 0;

        const backlogRate = harnessSummary.total > 0
            ? Math.round((harnessSummary.approvalPending / harnessSummary.total) * 100)
            : 0;

        return [
            {
                key: 'report-harness-coverage',
                eyebrow: '추적 커버리지',
                title: `현재 보고 대상의 리포트 저장 연결률은 ${runCoverageRate}%입니다.`,
                description: harnessSummary.pending > 0 || harnessSummary.fallback > 0
                    ? `저장 대기 ${harnessSummary.pending}건과 폴백 ${harnessSummary.fallback}건은 감사 근거 패키지 생성 전 먼저 확인하셔야 합니다.`
                    : '현재 대상은 대부분 리포트 처리 번호와 연결되어 있어 보고서 근거 추적에 유리한 상태입니다.',
                tone: runCoverageRate < 70 ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
            },
            {
                key: 'report-harness-backlog',
                eyebrow: '승인 백로그',
                title: `현재 보고 대상 중 ${backlogRate}%가 추가 승인 또는 재확인이 필요합니다.`,
                description: harnessSummary.approvalPending > 0
                    ? `승인 대기 ${harnessSummary.approvalPending}건과 재확인 필요 ${harnessSummary.reviewNeeded}건을 함께 읽으시면 보고 설명 순서를 정하시기 쉽습니다.`
                    : '현재 대상은 승인 백로그가 크지 않아 보고서 확정 흐름을 비교적 안정적으로 이어가실 수 있습니다.',
                tone: harnessSummary.approvalPending > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'report-harness-action',
                eyebrow: '권장 보고 순서',
                title: harnessSummary.highRisk > 0
                    ? '즉시 보호 대상 설명을 먼저 배치하시는 편이 안전합니다.'
                    : '현재는 승인·영속 저장 상태 설명을 먼저 붙이시면 충분합니다.',
                description: harnessSummary.highRisk > 0
                    ? `즉시 보호 대상 ${harnessSummary.highRisk}건은 일반 성과 요약보다 앞서 근거·보호 조치와 함께 설명하시는 것이 적절합니다.`
                    : '고위험 배지가 크지 않은 경우에는 저장 연결 상태와 승인 이력을 먼저 설명하셔도 운영 흐름에 무리가 없습니다.',
                tone: harnessSummary.highRisk > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-indigo-200 bg-indigo-50/80',
            },
        ];
    }, [harnessSummary]);

    const currentPreviewHarnessMeta = useMemo(() => {
        if (!currentPreviewRecord) return null;

        const workflowState = inferHarnessWorkflowState(currentPreviewRecord);
        const riskDecision = inferHarnessRiskDecision(currentPreviewRecord);
        const approvalState = inferHarnessApprovalState(currentPreviewRecord, workflowState);
        const persistenceState = getHarnessPersistenceState(currentPreviewRecord);

        return {
            workflowState,
            riskDecision,
            approvalState,
            persistenceState,
        };
    }, [currentPreviewRecord]);

    useEffect(() => {
        let disposed = false;
        setHasPreviewStatusFetched(false);
        setPreviewWorkflowStatus(null);
        setPreviewWorkflowStatusError(null);
        setPreviewWorkflowStatusLoading(false);

        const loadPreviewWorkflowStatus = async () => {
            const lookupValue = String(currentPreviewRecord?.workflowRunId || currentPreviewRecord?.id || '').trim();
            if (!lookupValue) {
                setPreviewWorkflowStatus(null);
                setPreviewWorkflowStatusError(null);
                setPreviewWorkflowStatusLoading(false);
                window.setTimeout(() => {
                    previewStatusRequestInFlightRef.current = false;
                    setIsPreviewStatusPending(false);
                }, 450);
                return;
            }

            setPreviewWorkflowStatusLoading(true);
            setPreviewWorkflowStatusError(null);

            try {
                const response = await fetchHarnessWorkflowStatus(lookupValue);
                if (!disposed) {
                    setPreviewWorkflowStatus(response);
                }
            } catch (error) {
                if (!disposed) {
                    setPreviewWorkflowStatus(null);
                    setPreviewWorkflowStatusError(extractMessage(error) || '안전 기록 버전 정보를 불러오지 못했습니다.');
                }
            } finally {
                if (!disposed) {
                    setPreviewWorkflowStatusLoading(false);
                }
                window.setTimeout(() => {
                    previewStatusRequestInFlightRef.current = false;
                    setIsPreviewStatusPending(false);
                }, 450);
            }
        };

        previewStatusFetchRef.current = () => {
            if (previewStatusRequestInFlightRef.current) return;
            previewStatusRequestInFlightRef.current = true;
            setIsPreviewStatusPending(true);
            setHasPreviewStatusFetched(true);
            loadPreviewWorkflowStatus().catch(() => undefined);
        };

        return () => {
            disposed = true;
            previewStatusFetchRef.current = null;
            previewStatusRequestInFlightRef.current = false;
            setIsPreviewStatusPending(false);
        };
    }, [currentPreviewRecord?.id, currentPreviewRecord?.workflowRunId]);

    const handleLoadPreviewStatus = () => {
        if (!currentPreviewRecord) return;
        if (isPreviewStatusPending) return;
        previewStatusFetchRef.current?.();
    };

    useEffect(() => {
        let disposed = false;

        const loadManifestPreview = async () => {
            if (!verificationManifestFile) {
                setVerificationManifestPreview(null);
                setVerificationManifestPreviewError(null);
                return;
            }

            try {
                const manifestText = await verificationManifestFile.text();
                const manifest = JSON.parse(manifestText) as EvidenceManifest;
                if (!manifest || !Array.isArray(manifest.files)) {
                    throw new Error('manifest.json 형식이 올바르지 않습니다. files 배열이 필요합니다.');
                }

                if (!disposed) {
                    setVerificationManifestPreview(manifest);
                    setVerificationManifestPreviewError(null);
                }
            } catch (error) {
                if (!disposed) {
                    setVerificationManifestPreview(null);
                    setVerificationManifestPreviewError(extractMessage(error) || 'Manifest 미리보기를 불러오지 못했습니다.');
                }
            }
        };

        void loadManifestPreview();

        return () => {
            disposed = true;
        };
    }, [verificationManifestFile]);

    const currentPreviewHarnessVersions = useMemo(() => {
        const ruleVersions = Array.from(new Set((previewWorkflowStatus?.overrides || []).map((override) => override.ruleVersion).filter(Boolean)));

        return {
            promptVersion: previewWorkflowStatus?.promptVersion?.version || '미연결',
            policyVersion: previewWorkflowStatus?.policyVersion?.version || '미연결',
            ruleVersion: ruleVersions.length > 0 ? ruleVersions.join(', ') : '미연결',
        };
    }, [previewWorkflowStatus]);

    const currentPreviewVersionDetails: HarnessVersionDetailsBundle = useMemo(() => {
        if (previewWorkflowStatus?.versionDetails) {
            return previewWorkflowStatus.versionDetails;
        }

        return {
            prompt: currentPreviewHarnessVersions.promptVersion !== '미연결' ? getHarnessVersionDescriptors([currentPreviewHarnessVersions.promptVersion]) : [],
            policy: currentPreviewHarnessVersions.policyVersion !== '미연결' ? getHarnessVersionDescriptors([currentPreviewHarnessVersions.policyVersion]) : [],
            rule: currentPreviewHarnessVersions.ruleVersion !== '미연결' ? getHarnessVersionDescriptors(currentPreviewHarnessVersions.ruleVersion.split(',').map((value) => value.trim())) : [],
        };
    }, [currentPreviewHarnessVersions.policyVersion, currentPreviewHarnessVersions.promptVersion, currentPreviewHarnessVersions.ruleVersion, previewWorkflowStatus?.versionDetails]);

    const currentPreviewVersionChangeSummary = useMemo(() => {
        return previewWorkflowStatus?.versionChangeSummary || {
            prompt: [],
            policy: [],
            rule: [],
        };
    }, [previewWorkflowStatus?.versionChangeSummary]);

    const currentPreviewRuleImpactSummary = useMemo(() => {
        if (previewWorkflowStatus?.ruleImpactSummary) {
            return previewWorkflowStatus.ruleImpactSummary;
        }

        return buildHarnessRuleImpactSummary(previewWorkflowStatus?.overrides || []);
    }, [previewWorkflowStatus]);

    const currentPreviewApprovalNarrative = useMemo(() => {
        const diff = previewWorkflowStatus?.latestApprovalDiff;
        if (!diff) {
            return {
                title: '최신 승인 diff가 아직 저장되지 않았습니다.',
                description: '현재는 승인 이력 건수와 상태 배지만 확인 가능하며, 상세 변경 설명은 이후 승인 액션부터 누적됩니다.',
                tone: BRAND_TONE.slate,
            };
        }

        return {
            title: `${diff.action} 이후 위험 판단은 ${diff.decisionBefore || 'N/A'} → ${diff.decisionAfter || 'N/A'}로 기록됐습니다.`,
            description: `승인 상태는 ${getHarnessApprovalStateLabel(diff.approvalStateAfter)}이며 진행 상태는 ${getHarnessWorkflowStateLabel(diff.workflowStateAfter)}로 정리됐습니다.${diff.comment ? ` 코멘트: ${diff.comment}` : ''}`,
            tone: diff.approvalStateAfter === 'APPROVED' ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80',
        };
    }, [previewWorkflowStatus]);

    const currentPreviewAnalysisNarrative = useMemo(() => {
        const analyzerSummary = previewWorkflowStatus?.analyzerSummary;
        const evaluatorSummary = previewWorkflowStatus?.evaluatorSummary;
        const flags = evaluatorSummary?.flags || [];

        return {
            analyzerTitle: analyzerSummary?.summary || '분석기 요약이 아직 저장되지 않았습니다.',
            analyzerDescription: typeof analyzerSummary?.confidence === 'number'
                ? `분석 신뢰도는 ${Math.round(analyzerSummary.confidence * 100)}%로 기록됐습니다.`
                : '분석 신뢰도 수치가 아직 저장되지 않았습니다.',
            evaluatorTitle: typeof evaluatorSummary?.evidenceSufficiency === 'number'
                ? `평가기 증거 충분도는 ${evaluatorSummary.evidenceSufficiency}입니다.`
                : '평가기 증거 충분도는 아직 저장되지 않았습니다.',
            evaluatorDescription: `${typeof evaluatorSummary?.requiresHumanApproval === 'boolean' ? `인간 승인 필요: ${evaluatorSummary.requiresHumanApproval ? '예' : '아니오'}` : '인간 승인 필요 여부 미기록'}${flags.length > 0 ? ` · 플래그: ${flags.join(' · ')}` : ''}`,
        };
    }, [previewWorkflowStatus]);

    const currentPreviewOverrideNarrative = useMemo(() => {
        return currentPreviewRuleImpactSummary.narrative;
    }, [currentPreviewRuleImpactSummary]);

    const currentPreviewGovernanceNarrative = useMemo(() => {
        const diff = previewWorkflowStatus?.latestApprovalDiff;
        const hasOverrides = (previewWorkflowStatus?.overrides?.length || 0) > 0;
        const versionChanges = [
            ...(previewWorkflowStatus?.versionChangeSummary?.prompt || []),
            ...(previewWorkflowStatus?.versionChangeSummary?.policy || []),
            ...(previewWorkflowStatus?.versionChangeSummary?.rule || []),
        ].filter(Boolean);

        if (diff) {
            const actionLabel = diff.action === 'approved' ? '최종 승인' : diff.action === 'rejected' ? '보완 요청' : diff.action;
            return {
                title: `${actionLabel} 이후 보고 근거가 함께 연결되어 있습니다.`,
                description: `위험 판단 ${diff.decisionBefore || 'N/A'} → ${diff.decisionAfter || 'N/A'} 변화와 승인 코멘트를 보고서 설명 문맥에 그대로 활용할 수 있습니다.`,
                action: hasOverrides
                    ? '오버라이드 사유와 승인 코멘트를 함께 읽어 현장 재설명 비용을 줄이십시오.'
                    : versionChanges.length > 0
                        ? '버전 변경 요약과 승인 코멘트를 함께 읽어 왜 판단이 달라졌는지 설명하십시오.'
                        : '승인 코멘트와 현재 위험 판단을 묶어 보고서 해설 문구로 사용하시면 됩니다.',
                tone: BRAND_TONE.emeraldSoft80,
            };
        }

        if (hasOverrides) {
            return {
                title: '승인 diff는 없지만 룰 개입 이력은 남아 있습니다.',
                description: '오버라이드 메시지와 현재 위험 판단을 함께 읽으면 보고서 설명의 핵심 문장을 빠르게 만들 수 있습니다.',
                action: '규칙 개입 사유를 먼저 설명한 뒤 현장 보완 조치를 이어서 적는 방식이 가장 효율적입니다.',
                tone: BRAND_TONE.amberSoft80,
            };
        }

        return {
            title: '현재 보고서는 기본 판단 처리 흐름 중심으로 설명하면 됩니다.',
            description: versionChanges.length > 0
                ? `저장된 버전 변경 요약 ${versionChanges[0]}를 함께 적으면 문맥 설명력이 높아집니다.`
                : '추가 승인 diff나 오버라이드가 없다면 현재 상태 배지와 증빙 해시 중심으로 설명하시면 됩니다.',
            action: 'workflow, risk, approval 상태와 증빙 해시를 짧게 묶어 보고서 근거 문장으로 정리하십시오.',
            tone: BRAND_TONE.slate,
        };
    }, [previewWorkflowStatus]);

    const currentPreviewTransitionNarrative = useMemo(() => {
        return buildHarnessTransitionNarrative(previewWorkflowStatus?.transitionActions || [], getHarnessWorkflowStateLabel);
    }, [previewWorkflowStatus]);

    const currentPreviewTransitionGuide = useMemo(() => {
        return buildHarnessTransitionExecutionGuide(previewWorkflowStatus?.transitionActions || [], getHarnessWorkflowStateLabel);
    }, [previewWorkflowStatus]);

    const currentPreviewTransitionActionLines = useMemo(() => {
        const actions = previewWorkflowStatus?.transitionActions || [];
        return actions.map((item) => ({
            key: item.action,
            text: `${item.allowed ? '가능' : '차단'} · ${getHarnessTransitionActionLabel(item.action)} · ${formatHarnessTransitionStatusText(item, getHarnessWorkflowStateLabel)}`,
        }));
    }, [previewWorkflowStatus]);

    const verificationHarnessMetaSummary = useMemo(() => {
        const manifest = verificationManifestPreview;
        if (!manifest) {
            return null;
        }

        const promptVersions = Array.from(new Set(manifest.files.map((entry) => entry.promptVersion).filter(Boolean))) as string[];
        const policyVersions = Array.from(new Set(manifest.files.map((entry) => entry.policyVersion).filter(Boolean))) as string[];
        const ruleVersions = Array.from(new Set(manifest.files.flatMap((entry) => entry.ruleVersions || []).filter(Boolean)));
        const overrideCount = manifest.files.reduce((sum, entry) => sum + Number(entry.overrideCount || 0), 0);
        const approvalCount = manifest.files.reduce((sum, entry) => sum + Number(entry.approvalCount || 0), 0);
        const criticalRuleCount = manifest.files.reduce((sum, entry) => sum + Number(entry.ruleImpactSummary?.criticalCount || 0), 0);
        const ruleImpactRuleCodes = Array.from(new Set(manifest.files.flatMap((entry) => entry.ruleImpactSummary?.ruleCodes || []).filter(Boolean)));
        const ruleImpactNarratives = Array.from(new Set(manifest.files.map((entry) => entry.ruleImpactSummary?.narrative).filter(Boolean))) as string[];
        const linkedRunCount = manifest.files.filter((entry) => String(entry.workflowRunId || '').trim().length > 0).length;
        const versionChangeSummary = {
            prompt: Array.from(new Set(manifest.files.flatMap((entry) => entry.versionChangeSummary?.prompt || []).filter(Boolean))),
            policy: Array.from(new Set(manifest.files.flatMap((entry) => entry.versionChangeSummary?.policy || []).filter(Boolean))),
            rule: Array.from(new Set(manifest.files.flatMap((entry) => entry.versionChangeSummary?.rule || []).filter(Boolean))),
        };

        return {
            totalRecords: manifest.summary.totalRecords || manifest.files.length,
            linkedRunCount,
            generatedAt: String(manifest.generatedAt || ''),
            generatedAtKst: String(manifest.generatedAtKst || manifest.summary.generatedAtKst || ''),
            promptVersions,
            policyVersions,
            ruleVersions,
            overrideCount,
            approvalCount,
            criticalRuleCount,
            ruleImpactRuleCodes,
            ruleImpactNarratives,
            harnessAuditSnapshotIncluded: Boolean(manifest.summary.harnessAuditSnapshotIncluded),
            templateVersion: String(manifest.summary.templateVersion || '미기록'),
            jsonSchemaVersion: String(manifest.summary.jsonSchemaVersion || '미기록'),
            readmeFileName: String(manifest.summary.readmeFileName || 'README.txt'),
            versionChangeSummary,
        };
    }, [verificationManifestPreview]);

    const verificationHarnessVersionDetails = useMemo(() => {
        if (!verificationHarnessMetaSummary) {
            return {
                prompt: [],
                policy: [],
                rule: [],
            };
        }

        return {
            prompt: getHarnessVersionDescriptors(verificationHarnessMetaSummary.promptVersions),
            policy: getHarnessVersionDescriptors(verificationHarnessMetaSummary.policyVersions),
            rule: getHarnessVersionDescriptors(verificationHarnessMetaSummary.ruleVersions),
        };
    }, [verificationHarnessMetaSummary]);

    const verificationHarnessVersionRows = useMemo(() => {
        return [
            ...verificationHarnessVersionDetails.prompt,
            ...verificationHarnessVersionDetails.policy,
            ...verificationHarnessVersionDetails.rule,
        ];
    }, [verificationHarnessVersionDetails]);

    const verificationRuleImpactSummary = useMemo(() => {
        if (!verificationHarnessMetaSummary) {
            return buildHarnessRuleImpactSummary([]);
        }

        return {
            items: verificationHarnessMetaSummary.ruleImpactRuleCodes.map((ruleCode) => ({
                ruleCode,
                ruleVersion: null,
                severity: 'warning',
                count: verificationManifestPreview?.files.filter((entry) => (entry.ruleImpactSummary?.ruleCodes || []).includes(ruleCode)).length || 0,
                decisionPath: 'manifest 집계 기준',
                messages: verificationManifestPreview?.files
                    .filter((entry) => (entry.ruleImpactSummary?.ruleCodes || []).includes(ruleCode))
                    .map((entry) => entry.ruleImpactSummary?.narrative || '')
                    .filter(Boolean)
                    .slice(0, 2) || [],
                triggerTypes: [],
                latestCreatedAt: null,
            })),
            narrative: verificationHarnessMetaSummary.ruleImpactNarratives[0] || '저장된 룰 개입 요약이 없습니다.',
            totalCount: verificationHarnessMetaSummary.overrideCount,
            criticalCount: verificationHarnessMetaSummary.criticalRuleCount,
        };
    }, [verificationHarnessMetaSummary, verificationManifestPreview]);

    const verificationTemplateMismatchWarnings = useMemo(() => {
        if (!verificationHarnessMetaSummary) {
            return [] as string[];
        }

        const warnings: string[] = [];
        if (verificationHarnessMetaSummary.templateVersion !== EVIDENCE_PACKAGE_TEMPLATE_VERSION) {
            warnings.push(`템플릿 버전이 현재 기준(${EVIDENCE_PACKAGE_TEMPLATE_VERSION})과 다릅니다: ${verificationHarnessMetaSummary.templateVersion}`);
        }
        if (verificationHarnessMetaSummary.jsonSchemaVersion !== EVIDENCE_PACKAGE_JSON_SCHEMA_VERSION) {
            warnings.push(`JSON 스키마 버전이 현재 기준(${EVIDENCE_PACKAGE_JSON_SCHEMA_VERSION})과 다릅니다: ${verificationHarnessMetaSummary.jsonSchemaVersion}`);
        }
        if (verificationHarnessMetaSummary.readmeFileName !== EVIDENCE_PACKAGE_README_FILE_NAME) {
            warnings.push(`README 파일명이 현재 기준(${EVIDENCE_PACKAGE_README_FILE_NAME})과 다릅니다: ${verificationHarnessMetaSummary.readmeFileName}`);
        }

        return warnings;
    }, [verificationHarnessMetaSummary]);

    const verificationTemplateConformance = useMemo(() => {
        if (!verificationHarnessMetaSummary) {
            return null;
        }

        const isConformant = verificationTemplateMismatchWarnings.length === 0;
        return {
            isConformant,
            label: isConformant ? '표준 템플릿 적합' : '표준 템플릿 불일치',
            variant: isConformant ? 'emeraldSoft' as const : 'amberSoft' as const,
            description: isConformant
                ? `현재 패키지는 템플릿 ${verificationHarnessMetaSummary.templateVersion} / 스키마 ${verificationHarnessMetaSummary.jsonSchemaVersion} 기준에 맞습니다.`
                : verificationTemplateMismatchWarnings.join(' / '),
        };
    }, [verificationHarnessMetaSummary, verificationTemplateMismatchWarnings]);

    const reportSummaryCards: InterpretationCardItem[] = useMemo(() => {
        const cards = buildReportsSummaryCards({
            filteredRecordsLength: filteredRecords.length,
            activeTab,
            selectedTeam,
            dateFilterLabel,
            filterLevel,
            viewMode,
            harnessSummary,
        });
        return isDevMode ? cards : cards.filter((card) => card.key !== 'report-harness');
    }, [activeTab, dateFilterLabel, filterLevel, filteredRecords.length, harnessSummary, selectedTeam, viewMode]);

    const filterInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'filter-status',
            eyebrow: '지금 상태',
            title: hasCustomDateRangeError ? '기간 조건 확인이 필요합니다.' : '보고서 생성 조건이 정리되어 있습니다.',
            description: hasCustomDateRangeError
                ? '사용자 지정 기간이 완성되지 않았거나 시작일과 종료일 순서가 맞지 않아 생성 버튼이 보호 모드로 잠겨 있습니다.'
                : `현재 출력 형태는 ${genMode === 'combined-pdf' ? '통합 PDF 1개' : genMode === 'individual-pdf' ? '개별 PDF ZIP' : '개별 이미지 ZIP'}입니다.`,
            tone: hasCustomDateRangeError ? 'border-rose-200 bg-rose-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'filter-evidence',
            eyebrow: '판단 근거',
            title: '대상 수와 출력 방식이 작업량을 보여줍니다.',
            description: `현재 ${filteredRecords.length}명을 처리 대상으로 보고 있으며, 목록 보기와 상세 미리보기는 같은 필터 집합을 공유합니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'filter-action',
            eyebrow: '다음 행동',
            title: filteredRecords.length > 0 ? '조건이 맞다면 생성 또는 증빙 패키지로 이어가세요.' : '필터를 완화해 대상자를 다시 불러오세요.',
            description: '먼저 대상을 너무 좁게 걸러내지 않았는지 확인한 뒤, 필요 시 목록에서 개별 확인 후 일괄 생성으로 넘어가면 됩니다.',
            tone: filteredRecords.length > 0 ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80',
        },
    ], [filteredRecords.length, genMode, hasCustomDateRangeError]);

    const generationInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'generation-status',
            eyebrow: '지금 상태',
            title: reportGenerationUi.status === 'running' ? '보고서 생성이 진행 중입니다.' : reportGenerationUi.status === 'success' ? '보고서 생성이 완료되었습니다.' : reportGenerationUi.status === 'error' ? '생성 흐름 점검이 필요합니다.' : '아직 생성 전 대기 상태입니다.',
            description: reportGenerationUi.status === 'idle'
                ? '생성 버튼을 누르면 데이터 수집, 렌더링, PDF/ZIP 패키징 순서로 진행됩니다.'
                : `${reportGenerationUi.phaseLabel} 단계이며 진행률은 ${reportGenerationUi.progress}%입니다.`,
            tone: reportGenerationUi.status === 'error' ? 'border-rose-200 bg-rose-50/80' : reportGenerationUi.status === 'success' ? 'border-emerald-200 bg-emerald-50/80' : 'border-indigo-200 bg-indigo-50/70',
        },
        {
            key: 'generation-evidence',
            eyebrow: '판단 근거',
            title: '진행 상태 바와 대상 수가 생성 근거입니다.',
            description: `현재 대상 ${filteredRecords.length}명 기준으로 처리 중이며${bulkProgress.total > 0 ? `, ${bulkProgress.current}/${bulkProgress.total}건이 반영되고 있습니다.` : ' 생성 시작 전에는 대상 수만 먼저 확인할 수 있습니다.'}`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'generation-action',
            eyebrow: '다음 행동',
            title: reportGenerationUi.status === 'error' ? '오류 메시지를 확인한 뒤 다시 시도하세요.' : '진행 중에는 화면을 유지하고 완료 후 결과를 확인하세요.',
            description: '실패한 대상이 있더라도 어떤 근로자에게 추가 확인이 필요한지 결과 메시지로 이어서 읽을 수 있도록 구성되어 있습니다.',
            tone: reportGenerationUi.status === 'error' ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
        },
    ], [bulkProgress.current, bulkProgress.total, filteredRecords.length, reportGenerationUi.phaseLabel, reportGenerationUi.progress, reportGenerationUi.status]);

    const verificationInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'verify-status',
            eyebrow: '지금 상태',
            title: verificationResult ? (verificationResult.isValid ? '증빙 패키지 검증이 완료되었습니다.' : '증빙 패키지에 추가 확인이 필요합니다.') : '증빙 패키지 검증 전 단계입니다.',
            description: verificationResult
                ? 'Manifest와 JSON 묶음의 일관성을 읽어 패키지 무결성을 현장에서 바로 확인할 수 있습니다.'
                : 'manifest.json과 json 폴더 파일을 넣으면 해시와 누락 파일 여부를 한 번에 확인할 수 있습니다.',
            tone: verificationResult ? (verificationResult.isValid ? 'border-emerald-200 bg-emerald-50/80' : 'border-rose-200 bg-rose-50/80') : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'verify-evidence',
            eyebrow: '판단 근거',
            title: 'Manifest, JSON 파일 수, 해시 비교가 기준입니다.',
            description: `현재 Manifest ${verificationManifestFile ? '1개 선택됨' : '미선택'}, JSON ${verificationJsonFiles.length}개가 준비되어 있습니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'verify-action',
            eyebrow: '다음 행동',
            title: verificationResult && !verificationResult.isValid ? '누락 파일과 해시 불일치를 먼저 보완하세요.' : '파일 준비 후 검증 실행으로 넘어가세요.',
            description: '검증 실패 시 패키지 요약 해시와 누락 JSON 목록을 기준으로 어떤 산출물을 다시 생성해야 하는지 바로 판단할 수 있습니다.',
            tone: verificationResult && !verificationResult.isValid ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
        },
    ], [verificationJsonFiles.length, verificationManifestFile, verificationResult]);

    const verificationHistorySummary = useMemo(() => {
        return verificationHistory.reduce((summary, entry) => {
            summary.total += 1;
            if (entry.isValid) summary.success += 1;
            else summary.failed += 1;
            summary.hashMismatches += entry.hashMismatches;
            summary.metadataMismatches += entry.metadataMismatches;
            summary.missingHarnessSnapshots += entry.missingHarnessSnapshots;
            if (entry.templateConformanceStatus === 'CONFORMANT') summary.templateConformant += 1;
            if (entry.templateConformanceStatus === 'MISMATCH') summary.templateMismatch += 1;
            return summary;
        }, {
            total: 0,
            success: 0,
            failed: 0,
            hashMismatches: 0,
            metadataMismatches: 0,
            missingHarnessSnapshots: 0,
            templateConformant: 0,
            templateMismatch: 0,
        });
    }, [verificationHistory]);

    const verificationPackageFailureSummary = useMemo(() => {
        const packageMap = new Map<string, {
            packageName: string;
            attempts: number;
            failed: number;
            hashMismatches: number;
            metadataMismatches: number;
            missingHarnessSnapshots: number;
            invalidJsonFiles: number;
            lastVerifiedAt: string;
            reasonCounts: Record<string, number>;
        }>();

        verificationHistory.forEach((entry) => {
            const key = entry.packageName || entry.manifestFileName || '미분류 패키지';
            if (!packageMap.has(key)) {
                packageMap.set(key, {
                    packageName: key,
                    attempts: 0,
                    failed: 0,
                    hashMismatches: 0,
                    metadataMismatches: 0,
                    missingHarnessSnapshots: 0,
                    invalidJsonFiles: 0,
                    lastVerifiedAt: entry.verifiedAt,
                    reasonCounts: {},
                });
            }

            const item = packageMap.get(key)!;
            item.attempts += 1;
            if (!entry.isValid) item.failed += 1;
            item.hashMismatches += entry.hashMismatches;
            item.metadataMismatches += entry.metadataMismatches;
            item.missingHarnessSnapshots += entry.missingHarnessSnapshots;
            item.invalidJsonFiles += entry.invalidJsonFiles;

            const reasonCandidates = [
                { label: '해시 불일치', count: entry.hashMismatches },
                { label: '메타 불일치', count: entry.metadataMismatches },
                { label: '스냅샷 누락', count: entry.missingHarnessSnapshots },
                { label: '파싱 불가 JSON', count: entry.invalidJsonFiles },
                { label: '요약 해시 불일치', count: entry.packageSummaryHashMatched ? 0 : 1 },
                { label: '누락 JSON', count: entry.missingJsonFiles },
            ].filter((candidate) => candidate.count > 0);

            reasonCandidates.forEach((candidate) => {
                item.reasonCounts[candidate.label] = (item.reasonCounts[candidate.label] || 0) + candidate.count;
            });

            if (new Date(entry.verifiedAt).getTime() > new Date(item.lastVerifiedAt).getTime()) {
                item.lastVerifiedAt = entry.verifiedAt;
            }
        });

        const ranked = Array.from(packageMap.values())
            .map((item) => ({
                ...item,
                totalIssueSignals: item.hashMismatches + item.metadataMismatches + item.missingHarnessSnapshots + item.invalidJsonFiles,
                primaryFailureReason: Object.entries(item.reasonCounts)
                    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0]?.[0] || (item.failed > 0 ? '복합 원인 확인 필요' : '실패 기록 없음'),
            }))
            .sort((a, b) => b.failed - a.failed || b.totalIssueSignals - a.totalIssueSignals || b.attempts - a.attempts || a.packageName.localeCompare(b.packageName, 'ko'));

        return {
            topPackages: ranked.slice(0, 5),
            failedPackages: ranked.filter((item) => item.failed > 0).length,
            repeatedFailurePackages: ranked.filter((item) => item.failed >= 2).length,
            dominantFailureReason: ranked
                .filter((item) => item.failed > 0)
                .map((item) => item.primaryFailureReason)[0] || '실패 패키지 없음',
        };
    }, [verificationHistory]);

    const verificationFailureReasonDistribution = useMemo(() => {
        const reasonMap = new Map<string, { reason: string; count: number; latestAt: string }>();

        verificationHistory
            .filter((entry) => !entry.isValid && entry.primaryFailureReason !== '실패 기록 없음')
            .forEach((entry) => {
                const key = entry.primaryFailureReason || '복합 원인 확인 필요';
                if (!reasonMap.has(key)) {
                    reasonMap.set(key, {
                        reason: key,
                        count: 0,
                        latestAt: entry.verifiedAt,
                    });
                }

                const item = reasonMap.get(key)!;
                item.count += 1;
                if (new Date(entry.verifiedAt).getTime() > new Date(item.latestAt).getTime()) {
                    item.latestAt = entry.verifiedAt;
                }
            });

        const ranked = Array.from(reasonMap.values())
            .sort((a, b) => b.count - a.count || new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime() || a.reason.localeCompare(b.reason, 'ko'));

        return {
            items: ranked,
            topReason: ranked[0]?.reason || '실패 원인 없음',
            topReasonCount: ranked[0]?.count || 0,
        };
    }, [verificationHistory]);

    const verificationFailureFilterOptions = useMemo(() => {
        return ['ALL', ...verificationFailureReasonDistribution.items.map((item) => item.reason)];
    }, [verificationFailureReasonDistribution.items]);

    const verificationPackageFilterOptions = useMemo(() => {
        return ['ALL', ...Array.from(new Set(verificationHistory.map((entry) => entry.packageName).filter((value) => String(value || '').trim().length > 0)))];
    }, [verificationHistory]);

    const filteredVerificationHistory = useMemo(() => {
        return verificationHistory.filter((entry) => {
            const matchesStatus = selectedVerificationStatusFilter === 'ALL'
                ? true
                : selectedVerificationStatusFilter === 'SUCCESS'
                    ? entry.isValid
                    : !entry.isValid;
            const matchesFailure = selectedVerificationFailureFilter === 'ALL'
                ? true
                : (!entry.isValid && entry.primaryFailureReason === selectedVerificationFailureFilter);
            const matchesPackage = selectedVerificationPackageFilter === 'ALL'
                ? true
                : entry.packageName === selectedVerificationPackageFilter;

            return matchesStatus && matchesFailure && matchesPackage;
        });
    }, [selectedVerificationFailureFilter, selectedVerificationPackageFilter, selectedVerificationStatusFilter, verificationHistory]);

    const viewInterpretationCards: InterpretationCardItem[] = useMemo(() => {
        return buildReportsViewCards({
            viewMode,
            currentPreviewName: currentPreviewRecord?.name || '선택된 근로자',
            previewIndex,
            filteredRecordsLength: filteredRecords.length,
        });
    }, [currentPreviewRecord?.name, filteredRecords.length, previewIndex, viewMode]);

    // 렌더링 안정화 대기 함수
    const waitForRender = async (ms: number = 1500) => {
        await new Promise(resolve => setTimeout(resolve, ms)); 
    };

    // [New] 미리보기 네비게이션
    const handlePrev = () => setPreviewIndex(prev => Math.max(0, prev - 1));
    const handleNext = () => setPreviewIndex(prev => Math.min(filteredRecords.length - 1, prev + 1));

    // [Helper] jsPDF Constructor 가져오기
    // [New] 현재 미리보기 보고서 단건 내보내기
    const handleDownloadCurrent = async () => {
        if (isIncompleteCustomDateRange) return alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
        if (isInvalidCustomDateRange) return alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
        if (!currentPreviewRecord) return alert('내보낼 데이터가 없습니다.');
        if (!previewRef.current) return alert('미리보기 화면이 로드되지 않았습니다.');
        
        const html2canvas = await ensureHtml2Canvas().catch(() => null);
        if (!html2canvas) return alert('html2canvas 라이브러리가 로드되지 않았습니다.');

        const JsPDF = await ensureJsPdfConstructor().catch(() => null);
        if (!JsPDF) return alert('jsPDF 라이브러리가 로드되지 않았습니다.');

        if (!confirm(`'${currentPreviewRecord.name}' 근로자의 보고서를 PDF로 내보내시겠습니까?`)) return;

        try {
            const canvases = await captureReportCanvases(previewRef.current, html2canvas, { scale: 3 });
            saveCanvasesAsA4Pdf(
                canvases,
                JsPDF as new (orientation: string, unit: string, format: string) => {
                    addImage: (...args: unknown[]) => void;
                    save: (filename: string) => void;
                },
                buildPsiExportFileName({
                    tokens: ['Report', currentPreviewRecord.name, currentPreviewRecord.jobField],
                    extension: 'pdf',
                }),
                'JPEG',
                0.88
            );
        } catch (e) {
            console.error(e);
            alert('PDF 생성 중 오류가 발생했습니다.');
        }
    };

    const handleGenerate = async () => {
        if (isIncompleteCustomDateRange) return alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
        if (isInvalidCustomDateRange) return alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
        if (filteredRecords.length === 0) return alert('출력할 대상이 없습니다.');

        // 라이브러리 체크
        const [html2canvas, JsPDF, JSZip, saveAs] = await Promise.all([
            ensureHtml2Canvas().catch(() => null),
            ensureJsPdfConstructor().catch(() => null),
            ensureJsZip().catch(() => null),
            ensureFileSaver().catch(() => null),
        ]);

        const missingLibs = [
            !html2canvas ? 'html2canvas' : null,
            !JsPDF ? 'jspdf' : null,
            !JSZip ? 'JSZip' : null,
            !saveAs ? 'FileSaver' : null,
        ].filter(Boolean) as string[];

        if (missingLibs.length > 0) {
            return alert(`필수 라이브러리가 로드되지 않았습니다.\n(누락: ${missingLibs.join(', ')})\n\n인터넷 연결을 확인하거나 페이지를 새로고침(F5) 해주세요.`);
        }
        
        const modeLabels: Record<GenMode, string> = {
            'combined-pdf': '통합 PDF 파일 (1개)',
            'individual-pdf': '개별 PDF 파일 (ZIP 압축)',
            'individual-img': '개별 이미지 파일 (ZIP 압축)'
        };

        if (!confirm(`${selectedTeam === '전체' ? '전체 팀' : selectedTeam + ' 팀'}의 근로자 ${filteredRecords.length}명에 대해\n[${modeLabels[genMode]}] 생성을 시작하시겠습니까?\n\n* 주의: 생성 중에는 화면을 닫지 말고 기다려주세요.`)) return;

        // 초기화
        setIsGenerating(true);
        setReportGenerationUi({
            status: 'running',
            progress: 0,
            phaseLabel: '생성 시작 준비 중',
        });
        abortRef.current = false;
        setBulkProgress({ current: 0, total: filteredRecords.length });

        const zip = new JSZip();
        const folderName = buildPsiExportBaseName({
            tokens: ['Report', selectedTeam],
            includeTime: true,
        });
        const folder = zip.folder(folderName);
        
        // [IMPROVED] Track failed records for user feedback
        const failedRecords: string[] = [];
        
        // Combined PDF용 마스터 인스턴스
        let masterPdf: { addPage?: (...args: any[]) => void; addImage?: (...args: any[]) => void; save?: (...args: any[]) => void; } | null = null;
        if (genMode === 'combined-pdf') {
            try { masterPdf = new (JsPDF as unknown as new (...args: any[]) => any)('p', 'mm', 'a4'); } catch { masterPdf = null; }
        }

        try {
            for (let i = 0; i < filteredRecords.length; i++) {
                if (abortRef.current) break;

                const record = filteredRecords[i];
                const workerHistory = scoredRecords.filter(r => 
                    r.name === record.name && 
                    (r.teamLeader || '미지정') === (record.teamLeader || '미지정')
                );

                // 상태 업데이트 -> 렌더링 트리거
                setGeneratingRecord(record);
                setGeneratingHistory(workerHistory);
                setBulkProgress({ current: i + 1, total: filteredRecords.length });
                const baseProgress = Math.floor((i / filteredRecords.length) * 90);
                setReportGenerationUi(prev => ({
                    ...prev,
                    status: 'running',
                    progress: Math.max(prev.progress, baseProgress),
                    phaseLabel: `${record.name} 데이터 수집 중`,
                }));

                // DOM 렌더링 대기 (차트 애니메이션 등 고려)
                await waitForRender(1200);
                setReportGenerationUi(prev => ({
                    ...prev,
                    status: 'running',
                    progress: Math.max(prev.progress, Math.floor(((i + 0.45) / filteredRecords.length) * 90)),
                    phaseLabel: `${record.name} 보고서 렌더링 중`,
                }));

                if (bulkReportRef.current && !abortRef.current) {
                    try {
                        const canvases = await captureReportCanvases(bulkReportRef.current, html2canvas, { scale: 3 });

                        const fileNameBase = `${record.name}_${record.jobField}`;

                        // --- 모드별 분기 처리 ---
                        if (genMode === 'combined-pdf') {
                            // [FIXED] Add null check for masterPdf
                            if (!masterPdf || !masterPdf.addPage || !masterPdf.addImage) {
                                throw new Error('PDF 생성기 초기화 실패');
                            }
                            canvases.forEach((canvas, pageIndex) => {
                                const placement = getCanvasPlacementOnA4(canvas);
                                const imgData = getCanvasImageData(canvas, 'JPEG', 0.88);
                                if (i > 0 || pageIndex > 0) masterPdf!.addPage!();
                                masterPdf!.addImage!(imgData, 'JPEG', placement.offsetX, placement.offsetY, placement.width, placement.height, undefined, 'FAST');
                            });
                        } 
                        else if (genMode === 'individual-pdf') {
                            const pdfBlob = buildPdfBlobFromCanvases(
                                canvases,
                                JsPDF as new (orientation: string, unit: string, format: string) => {
                                    addImage: (...args: unknown[]) => void;
                                    save: (filename: string) => void;
                                    output?: (type: string) => Blob;
                                    addPage?: () => void;
                                },
                                'JPEG',
                                0.88,
                            );
                            folder.file(`${fileNameBase}.pdf`, pdfBlob);
                        } 
                        else if (genMode === 'individual-img') {
                            const workerFolder = folder.folder(fileNameBase);
                            const blobs = await Promise.all(canvases.map((canvas) => canvasToBlob(canvas, 'image/jpeg', 0.9)));
                            blobs.forEach((blob, pageIndex) => {
                                workerFolder.file(`${fileNameBase}_p${pageIndex + 1}.jpg`, blob);
                            });
                        }

                        setReportGenerationUi(prev => ({
                            ...prev,
                            status: 'running',
                            progress: Math.max(prev.progress, Math.floor(((i + 0.85) / filteredRecords.length) * 90)),
                            phaseLabel: `${record.name} 저장 처리 중`,
                        }));
                    } catch (err) {
                        console.error(`[Error] ${record.name} 처리 중 오류:`, err);
                        // Notify user of individual failure
                        failedRecords.push(record.name);
                    }
                }
                
                // [IMPROVED] 메모리 해제를 위한 충분한 딜레이 (100ms → 500ms)
                await new Promise(r => setTimeout(r, 500));
            }

            if (!abortRef.current) {
                setReportGenerationUi(prev => ({
                    ...prev,
                    status: 'running',
                    progress: 96,
                    phaseLabel: '최종 파일 패키징 중',
                }));
                if (genMode === 'combined-pdf') {
                    // [FIXED] Check masterPdf exists before calling save
                    if (masterPdf && masterPdf.save) {
                        masterPdf.save(`${folderName}.pdf`);
                    } else {
                        throw new Error('PDF 저장 실패: 마스터 PDF 인스턴스가 없습니다.');
                    }
                } else {
                    const content = await zip.generateAsync({ type: "blob" });
                    saveAs(content,(`${folderName}.zip`));
                }

                setReportGenerationUi({
                    status: 'success',
                    progress: 100,
                    phaseLabel: '완료',
                });
                
                // [IMPROVED] Show detailed completion message with failed records
                if (failedRecords.length > 0) {
                    const displayLimit = 10;
                    const displayedFailures = failedRecords.slice(0, displayLimit);
                    const remainingCount = failedRecords.length - displayLimit;
                    const failureList = displayedFailures.join(', ') + (remainingCount > 0 ? `\n... 외 ${remainingCount}건` : '');
                    
                    alert(`생성이 완료되었습니다.\n\n성공: ${filteredRecords.length - failedRecords.length}건\n${BRAND_STATUS_LABELS.attention}: ${failedRecords.length}건\n\n${BRAND_STATUS_LABELS.attention}가 필요한 근로자:\n${failureList}\n\n다운로드 폴더를 확인해주세요.`);
                } else {
                    alert(`생성이 완료되었습니다.\n\n총 ${filteredRecords.length}건 성공\n\n다운로드 폴더를 확인해주세요.`);
                }
            } else {
                setReportGenerationUi({
                    status: 'error',
                    progress: Math.max(1, bulkProgressPercent),
                    phaseLabel: '중단됨',
                    errorMessage: '보고서 생성이 중단되었습니다. 다시 확인해 주세요.',
                });
                alert('작업이 중단되었습니다.');
            }

        } catch (e: unknown) {
            console.error("Critical Error:", e);
            const errMsg = extractMessage(e);
            setReportGenerationUi({
                status: 'error',
                progress: Math.max(1, bulkProgressPercent),
                    phaseLabel: BRAND_STATUS_LABELS.attention,
                    errorMessage: `${BRAND_STATUS_LABELS.attention}가 필요합니다: ${errMsg}`,
            });
            alert(`${BRAND_STATUS_LABELS.attention}가 필요합니다: ${errMsg}\n브라우저 메모리가 부족할 수 있습니다. 페이지를 새로고침 후 다시 확인해주세요.`);
        } finally {
            setIsGenerating(false);
            setGeneratingRecord(null);
            setGeneratingHistory([]);
        }
    };

    const retryReportGeneration = () => {
        if (isGenerating || isPackagingEvidence) return;
        void handleGenerate();
    };

    const cancelGeneration = () => {
        if(confirm("작업을 중단하시겠습니까?")) {
            abortRef.current = true;
        }
    };

    const sha256Hex = async (text: string): Promise<string> => {
        const subtle = window?.crypto?.subtle;
        if (!subtle) return '';
        const encoded = new TextEncoder().encode(text);
        const digest = await subtle.digest('SHA-256', encoded);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    };

    const handleExportEvidenceZip = async () => {
        if (isIncompleteCustomDateRange) {
            alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
            return;
        }
        if (isInvalidCustomDateRange) {
            alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
            return;
        }
        if (filteredRecords.length === 0) {
            alert('내보낼 증빙 대상이 없습니다.');
            return;
        }

        const [JSZip, saveAs] = await Promise.all([
            ensureJsZip().catch(() => null),
            ensureFileSaver().catch(() => null),
        ]);
        if (!JSZip || !saveAs) {
            alert('ZIP 생성 라이브러리(JSZip/FileSaver)가 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.');
            return;
        }

        if (!confirm(`필터된 ${filteredRecords.length}명에 대한 증빙 패키지 ZIP(PDF+JSON+CSV)을 생성하시겠습니까?`)) return;

        setIsPackagingEvidence(true);
        setBulkProgress({ current: 0, total: filteredRecords.length });

        try {
            const zip = new JSZip();
            const folderName = buildPsiExportBaseName({
                tokens: ['Evidence', selectedTeam, dateFilterLabel],
                includeTime: true,
            });
            const root = zip.folder(folderName);
            const pdfFolder = root.folder('pdf');
            const jsonFolder = root.folder('json');
            const manifestEntries: Array<{
                recordId: string;
                name: string;
                date: string;
                pdfFile: string | null;
                jsonFile: string;
                jsonSha256: string;
                evidenceHash: string;
                workflowRunId?: string;
                promptVersion?: string | null;
                policyVersion?: string | null;
                ruleVersions?: string[];
                approvalCount?: number;
                overrideCount?: number;
                ruleImpactSummary?: {
                    totalCount: number;
                    criticalCount: number;
                    narrative: string;
                    ruleCodes: string[];
                };
                versionChangeSummary?: {
                    prompt: string[];
                    policy: string[];
                    rule: string[];
                };
                approvalAction?: string | null;
                approvalNarrative?: string | null;
                overrideNarrative?: string | null;
            }> = [];
            const packageGeneratedTimestamp = buildExportTimestampMeta();
            const packageGeneratedAt = packageGeneratedTimestamp.iso;
            const packageGeneratedAtKst = packageGeneratedTimestamp.kst;

            const csvHeader = [
                'dateFilterPreset','dateRangeStart','dateRangeEnd',
                'recordId','name','employeeId','jobField','teamLeader','date','safetyScore','safetyLevel',
                'ocrConfidence','integrityScore','matchMethod','signatureMatchScore',
                'workflowRunId','workflowState','riskDecision','approvalState','harnessPersistenceState','harnessPersistenceWarning',
                'promptVersion','policyVersion','overrideCount','approvalLogCount',
                'correctionCount','actionCount','approvalCount','evidenceHash'
            ];
            const csvRows: string[] = [csvHeader.join(',')];

            const escapeCsv = (value: unknown) => {
                const str = String(value ?? '');
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            for (let i = 0; i < filteredRecords.length; i++) {
                const record = filteredRecords[i];
                setBulkProgress({ current: i + 1, total: filteredRecords.length });

                const safeName = `${record.name}_${record.date}`.replace(/[\\/:*?"<>|]/g, '_');
                const pdfFileName = `${safeName}.pdf`;
                const jsonFileName = `${safeName}.json`;
                let pdfGenerated = false;
                const workflowLookup = String(record.workflowRunId || record.id || '').trim();
                let harnessAuditSnapshot: Awaited<ReturnType<typeof fetchHarnessWorkflowStatus>> | null = null;

                const pdfBlob = await createEvidencePackagePdfBlob(record);
                if (pdfBlob) {
                    pdfFolder.file(pdfFileName, pdfBlob);
                    pdfGenerated = true;
                }

                if (workflowLookup) {
                    try {
                        harnessAuditSnapshot = await fetchHarnessWorkflowStatus(workflowLookup);
                    } catch {
                        harnessAuditSnapshot = null;
                    }
                }

                const harnessRuleVersions = Array.from(new Set((harnessAuditSnapshot?.overrides || []).map((override) => override.ruleVersion).filter(Boolean)));

                const jsonPayload = {
                    packageMeta: buildEvidencePackageJsonMeta({
                        generatedAt: packageGeneratedAt,
                        generatedAtKst: packageGeneratedAtKst,
                        teamFilter: selectedTeam,
                        levelFilter: filterLevel,
                        dateFilterPreset: dateFilterLabel,
                        dateRangeStart: resolvedDateRange.startLabel,
                        dateRangeEnd: resolvedDateRange.endLabel,
                    }),
                    record,
                    harnessAuditSnapshot: harnessAuditSnapshot
                        ? {
                            workflowRunId: harnessAuditSnapshot.workflowRunId,
                            workflowState: harnessAuditSnapshot.workflowState,
                            riskDecision: harnessAuditSnapshot.riskDecision,
                            approvalState: harnessAuditSnapshot.approvalState,
                            secondPassStatus: harnessAuditSnapshot.secondPassStatus,
                            diagnostics: harnessAuditSnapshot.diagnostics || null,
                            promptVersion: harnessAuditSnapshot.promptVersion,
                            policyVersion: harnessAuditSnapshot.policyVersion,
                            analyzerSummary: harnessAuditSnapshot.analyzerSummary,
                            evaluatorSummary: harnessAuditSnapshot.evaluatorSummary,
                            latestApprovalDiff: harnessAuditSnapshot.latestApprovalDiff,
                            ruleImpactSummary: harnessAuditSnapshot.ruleImpactSummary,
                            versionDetails: harnessAuditSnapshot.versionDetails,
                            versionChangeSummary: harnessAuditSnapshot.versionChangeSummary,
                            overrides: harnessAuditSnapshot.overrides,
                            approvals: harnessAuditSnapshot.approvals,
                            contextSnapshot: harnessAuditSnapshot.contextSnapshot,
                            timeline: harnessAuditSnapshot.timeline,
                        }
                        : null,
                };
                const jsonContent = JSON.stringify(jsonPayload, null, 2);
                const jsonSha256 = await sha256Hex(jsonContent);
                jsonFolder.file(jsonFileName, jsonContent);

                manifestEntries.push({
                    recordId: record.id,
                    name: record.name,
                    date: record.date,
                    pdfFile: pdfGenerated ? `pdf/${pdfFileName}` : null,
                    jsonFile: `json/${jsonFileName}`,
                    jsonSha256,
                    evidenceHash: record.evidenceHash || '',
                    workflowRunId: harnessAuditSnapshot?.workflowRunId || record.workflowRunId || '',
                    promptVersion: harnessAuditSnapshot?.promptVersion?.version || null,
                    policyVersion: harnessAuditSnapshot?.policyVersion?.version || null,
                    ruleVersions: harnessRuleVersions,
                    approvalCount: harnessAuditSnapshot?.approvals?.length || 0,
                    overrideCount: harnessAuditSnapshot?.overrides?.length || 0,
                    ruleImpactSummary: harnessAuditSnapshot?.ruleImpactSummary
                        ? {
                            totalCount: harnessAuditSnapshot.ruleImpactSummary.totalCount,
                            criticalCount: harnessAuditSnapshot.ruleImpactSummary.criticalCount,
                            narrative: harnessAuditSnapshot.ruleImpactSummary.narrative,
                            ruleCodes: harnessAuditSnapshot.ruleImpactSummary.items.map((item) => item.ruleCode),
                        }
                        : undefined,
                    versionChangeSummary: harnessAuditSnapshot?.versionChangeSummary || { prompt: [], policy: [], rule: [] },
                    approvalAction: harnessAuditSnapshot?.latestApprovalDiff?.action || null,
                    approvalNarrative: harnessAuditSnapshot?.latestApprovalDiff
                        ? `${harnessAuditSnapshot.latestApprovalDiff.decisionBefore || 'N/A'} -> ${harnessAuditSnapshot.latestApprovalDiff.decisionAfter || 'N/A'} | ${harnessAuditSnapshot.latestApprovalDiff.comment || '코멘트 없음'}`
                        : null,
                    overrideNarrative: harnessAuditSnapshot?.overrides?.length
                        ? harnessAuditSnapshot.overrides.slice(0, 2).map((override) => `${override.ruleCode}: ${override.message}`).join(' / ')
                        : null,
                });

                const workflowState = inferHarnessWorkflowState(record);
                const riskDecision = inferHarnessRiskDecision(record);
                const approvalState = inferHarnessApprovalState(record, workflowState);
                const persistenceState = getHarnessPersistenceState(record);

                const row = [
                    dateFilterLabel,
                    resolvedDateRange.startLabel,
                    resolvedDateRange.endLabel,
                    record.id,
                    record.name,
                    record.employeeId || '',
                    record.jobField,
                    record.teamLeader || '미지정',
                    record.date,
                    record.safetyScore,
                    getSafetyLevelFromScore(Number(record.safetyScore)),
                    typeof record.ocrConfidence === 'number' ? record.ocrConfidence.toFixed(3) : '',
                    typeof record.integrityScore === 'number' ? record.integrityScore : '',
                    record.matchMethod || '',
                    typeof record.signatureMatchScore === 'number' ? record.signatureMatchScore.toFixed(3) : '',
                    record.workflowRunId || '',
                    workflowState,
                    riskDecision,
                    approvalState,
                    persistenceState,
                    record.harnessPersistenceWarning || '',
                    harnessAuditSnapshot?.promptVersion?.version || '',
                    harnessAuditSnapshot?.policyVersion?.version || '',
                    harnessAuditSnapshot?.overrides?.length || 0,
                    harnessAuditSnapshot?.approvals?.length || 0,
                    (record.correctionHistory || []).length,
                    (record.actionHistory || []).length,
                    (record.approvalHistory || []).length,
                    record.evidenceHash || ''
                ];
                csvRows.push(row.map(escapeCsv).join(','));
            }

            const jsonHashIndexSource = manifestEntries
                .map((entry) => `${entry.jsonFile}:${entry.jsonSha256}`)
                .join('\n');
            const packageJsonIndexSha256 = await sha256Hex(jsonHashIndexSource);
            const promptVersions = Array.from(new Set(manifestEntries.map((entry) => entry.promptVersion).filter(Boolean))) as string[];
            const policyVersions = Array.from(new Set(manifestEntries.map((entry) => entry.policyVersion).filter(Boolean))) as string[];
            const ruleVersions = Array.from(new Set(manifestEntries.flatMap((entry) => entry.ruleVersions || []).filter(Boolean)));
            const describeVersion = (version: string) => {
                const descriptor = getHarnessVersionDescriptor(version);
                return descriptor
                    ? `- ${descriptor.version}: ${descriptor.summary}${descriptor.changesFromPrevious?.length ? ` | 변경: ${descriptor.changesFromPrevious[0]}` : ''}`
                    : `- ${version}`;
            };
            const versionChangeLines = [
                ...Array.from(new Set(manifestEntries.flatMap((entry) => entry.versionChangeSummary?.prompt || []).filter(Boolean))).map((line) => `- Prompt: ${line}`),
                ...Array.from(new Set(manifestEntries.flatMap((entry) => entry.versionChangeSummary?.policy || []).filter(Boolean))).map((line) => `- Policy: ${line}`),
                ...Array.from(new Set(manifestEntries.flatMap((entry) => entry.versionChangeSummary?.rule || []).filter(Boolean))).map((line) => `- Rule: ${line}`),
            ];
            const approvalDiffLines = Array.from(new Set(manifestEntries.map((entry) => entry.approvalNarrative).filter(Boolean))).slice(0, 5).map((line) => `- ${line}`);
            const overrideSummaryLines = Array.from(new Set(manifestEntries.map((entry) => entry.overrideNarrative).filter(Boolean))).slice(0, 5).map((line) => `- ${line}`);

            const csvMetaLines = [
                `# packageName=${folderName}`,
                `# generatedAt=${packageGeneratedAt}`,
                `# generatedAtKst=${packageGeneratedAtKst}`,
                `# teamFilter=${selectedTeam}`,
                `# levelFilter=${filterLevel}`,
                `# dateFilterPreset=${dateFilterLabel}`,
                `# dateRangeStart=${resolvedDateRange.startLabel}`,
                `# dateRangeEnd=${resolvedDateRange.endLabel}`,
                `# packageJsonIndexSha256=${packageJsonIndexSha256}`,
            ];

            root.file('evidence_index.csv', '\uFEFF' + [...csvMetaLines, ...csvRows].join('\n'));
            root.file(EVIDENCE_PACKAGE_README_FILE_NAME, buildEvidencePackageReadme({
                generatedAtIso: packageGeneratedAt,
                generatedAtKst: packageGeneratedAtKst,
                totalRecords: filteredRecords.length,
                dateFilterPreset: dateFilterLabel,
                dateRangeStart: resolvedDateRange.startLabel,
                dateRangeEnd: resolvedDateRange.endLabel,
                packageJsonIndexSha256,
                promptVersions,
                policyVersions,
                ruleVersions,
                versionChangeLines,
                approvalDiffLines,
                overrideSummaryLines,
                describeVersion,
            }));

            const manifest = buildEvidenceManifest({
                packageName: folderName,
                generatedAt: packageGeneratedAt,
                generatedAtKst: packageGeneratedAtKst,
                totalRecords: filteredRecords.length,
                teamFilter: selectedTeam,
                levelFilter: filterLevel,
                dateFilterPreset: dateFilterLabel,
                dateRangeStart: resolvedDateRange.startLabel,
                dateRangeEnd: resolvedDateRange.endLabel,
                packageJsonIndexSha256,
                files: manifestEntries,
            });
            root.file('manifest.json', JSON.stringify(manifest, null, 2));

            const blob = await zip.generateAsync({ type: 'blob' });
            saveAs(blob, `${folderName}.zip`);
            alert(`증빙 패키지 ZIP 생성 완료 (${filteredRecords.length}건)`);
        } catch (e: unknown) {
            const msg = extractMessage(e);
            alert(`증빙 패키지 생성 중 ${BRAND_STATUS_LABELS.attention}가 필요합니다: ${msg}`);
        } finally {
            setIsPackagingEvidence(false);
            setBulkProgress({ current: 0, total: 0 });
        }
    };

    const handleExportCsv = () => {
        if (isIncompleteCustomDateRange) {
            alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
            return;
        }
        if (isInvalidCustomDateRange) {
            alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
            return;
        }
        if (filteredRecords.length === 0) {
            alert('내보낼 데이터가 없습니다.');
            return;
        }

        const header = [
            'recordId',
            'name',
            'employeeId',
            'jobField',
            'teamLeader',
            'date',
            'safetyScore',
            'safetyLevel',
            'ocrConfidence',
            'integrityScore',
            'matchMethod',
            'signatureMatchScore',
            'workflowRunId',
            'workflowState',
            'riskDecision',
            'approvalState',
            'harnessPersistenceState',
            'harnessPersistenceWarning',
            'selfAssessedRiskLevel',
            'weakAreas',
            'correctionCount',
            'actionCount',
            'approvalCount',
            'evidenceHash'
        ];

        const rows = filteredRecords.map((record) => {
            const workflowState = inferHarnessWorkflowState(record);
            const riskDecision = inferHarnessRiskDecision(record);
            const approvalState = inferHarnessApprovalState(record, workflowState);
            const persistenceState = getHarnessPersistenceState(record);

            return [
                record.id,
                record.name,
                record.employeeId || '',
                record.jobField,
                record.teamLeader || '미지정',
                record.date,
                record.safetyScore,
                getSafetyLevelFromScore(Number(record.safetyScore)),
                typeof record.ocrConfidence === 'number' ? record.ocrConfidence.toFixed(3) : '',
                typeof record.integrityScore === 'number' ? record.integrityScore : '',
                record.matchMethod || '',
                typeof record.signatureMatchScore === 'number' ? record.signatureMatchScore.toFixed(3) : '',
                record.workflowRunId || '',
                workflowState,
                riskDecision,
                approvalState,
                persistenceState,
                record.harnessPersistenceWarning || '',
                record.selfAssessedRiskLevel,
                (record.weakAreas || []).join('|'),
                (record.correctionHistory || []).length,
                (record.actionHistory || []).length,
                (record.approvalHistory || []).length,
                record.evidenceHash || '',
            ];
        });

        const csv = [header, ...rows].map((line) => line.map(escapeCsvCell).join(',')).join('\n');
        const bom = '\uFEFF';
        downloadTextFile(
            buildPsiExportFileName({ tokens: ['Evidence', selectedTeam, dateFilterLabel], extension: 'csv' }),
            bom + csv,
            'text/csv;charset=utf-8;'
        );
    };

    const handleExportVerificationJson = () => {
        if (!verificationResult) {
            alert('먼저 증빙 검증을 실행해주세요.');
            return;
        }

        const primaryFailureReason = getPrimaryVerificationFailureReason({
            missingJsonFiles: verificationResult.missingJsonFiles.length,
            invalidJsonFiles: verificationResult.invalidJsonFiles.length,
            hashMismatches: verificationResult.hashMismatches.length,
            missingHarnessSnapshots: verificationResult.missingHarnessSnapshots.length,
            metadataMismatches: verificationResult.metadataMismatches.length,
            packageSummaryHashMatched: verificationResult.packageSummaryHashMatched,
        });
        const recommendedAction = getVerificationFailureRecommendedAction(primaryFailureReason);
        const exportTimestamp = buildExportTimestampMeta();
        const exportMeta = {
            source: 'evidence_verification_export',
            version: 'v1',
            scope: `manifest:${verificationManifestFile?.name || 'manifest.json'}`,
        };

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
            manifestFileName: verificationManifestFile?.name || 'manifest.json',
            summaryText: verificationSummary,
            primaryFailureReason,
            recommendedAction,
            templateConformance: verificationTemplateConformance
                ? {
                    status: verificationTemplateConformance.isConformant ? 'CONFORMANT' : 'MISMATCH',
                    label: verificationTemplateConformance.label,
                    description: verificationTemplateConformance.description,
                }
                : null,
            verificationResult,
            manifestSummary: verificationManifestPreview?.summary || null,
            manifestMetaSummary: verificationHarnessMetaSummary || null,
            manifestRuleImpactSummary: verificationRuleImpactSummary,
            manifestPackageName: verificationManifestPreview?.packageName || null,
            manifestGeneratedAt: verificationManifestPreview?.generatedAt || null,
            manifestGeneratedAtKst: verificationManifestPreview?.generatedAtKst || verificationManifestPreview?.summary?.generatedAtKst || null,
        };

        downloadTextFile(
            buildPsiExportFileName({ tokens: ['Evidence', 'Verification'], extension: 'json' }),
            JSON.stringify(payload, null, 2),
            'application/json;charset=utf-8;'
        );
    };

    const handleExportVerificationCsv = () => {
        if (!verificationResult) {
            alert('먼저 증빙 검증을 실행해주세요.');
            return;
        }

        const primaryFailureReason = getPrimaryVerificationFailureReason({
            missingJsonFiles: verificationResult.missingJsonFiles.length,
            invalidJsonFiles: verificationResult.invalidJsonFiles.length,
            hashMismatches: verificationResult.hashMismatches.length,
            missingHarnessSnapshots: verificationResult.missingHarnessSnapshots.length,
            metadataMismatches: verificationResult.metadataMismatches.length,
            packageSummaryHashMatched: verificationResult.packageSummaryHashMatched,
        });
        const recommendedAction = getVerificationFailureRecommendedAction(primaryFailureReason);
        const exportTimestamp = buildExportTimestampMeta();
        const exportMeta = {
            source: 'evidence_verification_export',
            version: 'v1',
            scope: `manifest:${verificationManifestFile?.name || 'manifest.json'}`,
        };

        const rows: string[][] = [
            ['section', 'sectionLabel', 'item', 'itemLabel', 'value', 'detail'],
            ['summary', 'exportedAt', exportTimestamp.iso, exportTimestamp.kst],
            ['summary', 'exportSource', exportMeta.source, ''],
            ['summary', 'exportVersion', exportMeta.version, ''],
            ['summary', 'exportScope', exportMeta.scope, ''],
            ['summary', 'isValid', verificationResult.isValid ? 'SUCCESS' : 'FAILED', verificationSummary.replace(/\n/g, ' | ')],
            ['summary', 'primaryFailureReason', primaryFailureReason, ''],
            ['summary', 'recommendedAction', recommendedAction, ''],
            ['summary', 'templateConformance', verificationTemplateConformance ? (verificationTemplateConformance.isConformant ? 'CONFORMANT' : 'MISMATCH') : 'UNKNOWN', verificationTemplateConformance?.description || ''],
            ['summary', 'totalEntries', String(verificationResult.totalEntries), ''],
            ['summary', 'verifiedEntries', String(verificationResult.verifiedEntries), ''],
            ['summary', 'missingJsonFiles', String(verificationResult.missingJsonFiles.length), ''],
            ['summary', 'invalidJsonFiles', String(verificationResult.invalidJsonFiles.length), ''],
            ['summary', 'hashMismatches', String(verificationResult.hashMismatches.length), ''],
            ['summary', 'missingHarnessSnapshots', String(verificationResult.missingHarnessSnapshots.length), ''],
            ['summary', 'metadataMismatches', String(verificationResult.metadataMismatches.length), ''],
            ['summary', 'packageSummaryHashMatched', verificationResult.packageSummaryHashMatched ? 'YES' : 'NO', ''],
        ];

        if (verificationHarnessMetaSummary) {
            rows.push(
                ['manifest', 'packageName', verificationManifestPreview?.packageName || '', ''],
                ['manifest', 'generatedAt', verificationHarnessMetaSummary.generatedAt || '', verificationHarnessMetaSummary.generatedAtKst || ''],
                ['manifest', 'templateVersion', verificationHarnessMetaSummary.templateVersion, ''],
                ['manifest', 'jsonSchemaVersion', verificationHarnessMetaSummary.jsonSchemaVersion, ''],
                ['manifest', 'readmeFileName', verificationHarnessMetaSummary.readmeFileName, ''],
                ['manifest', 'totalRecords', String(verificationHarnessMetaSummary.totalRecords), ''],
                ['manifest', 'linkedRunCount', String(verificationHarnessMetaSummary.linkedRunCount), ''],
                ['manifest', 'promptVersions', String(verificationHarnessMetaSummary.promptVersions.length), verificationHarnessMetaSummary.promptVersions.join(' | ')],
                ['manifest', 'policyVersions', String(verificationHarnessMetaSummary.policyVersions.length), verificationHarnessMetaSummary.policyVersions.join(' | ')],
                ['manifest', 'ruleVersions', String(verificationHarnessMetaSummary.ruleVersions.length), verificationHarnessMetaSummary.ruleVersions.join(' | ')],
                ['manifest', 'overrideCount', String(verificationHarnessMetaSummary.overrideCount), ''],
                ['manifest', 'approvalCount', String(verificationHarnessMetaSummary.approvalCount), ''],
                ['manifest', 'criticalRuleCount', String(verificationHarnessMetaSummary.criticalRuleCount), ''],
                ['manifest', 'ruleImpactRuleCodes', String(verificationHarnessMetaSummary.ruleImpactRuleCodes.length), verificationHarnessMetaSummary.ruleImpactRuleCodes.join(' | ')],
                ['manifest', 'ruleImpactNarrative', verificationHarnessMetaSummary.ruleImpactNarratives[0] || '', '']
            );
        }

        verificationResult.missingJsonFiles.forEach((filePath) => {
            rows.push(['missingJson', filePath, 'MISSING', 'manifest entry without uploaded json']);
        });
        verificationResult.invalidJsonFiles.forEach((filePath) => {
            rows.push(['invalidJson', filePath, 'INVALID_JSON', 'json parse failed']);
        });
        verificationResult.missingHarnessSnapshots.forEach((filePath) => {
            rows.push(['missingHarnessSnapshot', filePath, 'MISSING_SNAPSHOT', 'manifest metadata expects harnessAuditSnapshot']);
        });
        verificationResult.hashMismatches.forEach((mismatch) => {
            rows.push(['hashMismatch', mismatch.jsonFile, mismatch.expectedSha256, mismatch.actualSha256]);
        });
        verificationResult.metadataMismatches.forEach((mismatch) => {
            rows.push(['metadataMismatch', mismatch.jsonFile, mismatch.field, `${mismatch.expected} => ${mismatch.actual}`]);
        });

        const localizedRows = rows.map((row, index) => {
            if (index === 0) return row;
            const [section, item, value, detail] = row;
            return [
                section,
                getVerificationSectionLabel(section),
                item,
                getVerificationItemLabel(item),
                value,
                detail,
            ];
        });

        const csv = localizedRows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
        downloadTextFile(
            buildPsiExportFileName({ tokens: ['Evidence', 'Verification'], extension: 'csv' }),
            '\uFEFF' + csv,
            'text/csv;charset=utf-8;'
        );
    };

    const handleExportVerificationHistoryCsv = () => {
        if (verificationHistory.length === 0) {
            alert('저장할 검증 히스토리가 아직 없습니다.');
            return;
        }

        const exportMeta = {
            source: 'evidence_verification_history_export',
            version: 'v1',
            scope: `historyCount:${verificationHistory.length}`,
        };
        const exportTimestamp = buildExportTimestampMeta();

        const rows: string[][] = [
            [
                ...VERIFICATION_HISTORY_HEADER_LABELS.map((header) => `${header.key}(${header.label})`),
                'exportSource(내보내기 소스)',
                'exportVersion(내보내기 버전)',
                'exportScope(내보내기 범위)',
                'exportedAt(ISO)',
                'exportedAtKst(KST)',
            ],
            ...verificationHistory.map((entry) => [
                entry.verifiedAt,
                entry.manifestFileName,
                entry.packageName,
                entry.isValid ? 'SUCCESS' : 'FAILED',
                entry.templateConformanceStatus,
                entry.templateConformanceDescription,
                String(entry.totalEntries),
                String(entry.verifiedEntries),
                String(entry.missingJsonFiles),
                String(entry.invalidJsonFiles),
                String(entry.hashMismatches),
                String(entry.missingHarnessSnapshots),
                String(entry.metadataMismatches),
                entry.packageSummaryHashMatched ? 'YES' : 'NO',
                entry.primaryFailureReason,
                getVerificationFailureRecommendedAction(entry.primaryFailureReason),
                entry.summaryText.replace(/\n/g, ' | '),
                exportMeta.source,
                exportMeta.version,
                exportMeta.scope,
                exportTimestamp.iso,
                exportTimestamp.kst,
            ]),
        ];

        const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
        downloadTextFile(
            buildPsiExportFileName({ tokens: ['Evidence', 'Verification', 'History'], extension: 'csv' }),
            '\uFEFF' + csv,
            'text/csv;charset=utf-8;'
        );
    };

    const handleClearVerificationHistory = () => {
        if (verificationHistory.length === 0) {
            alert('초기화할 검증 히스토리가 없습니다.');
            return;
        }

        const shouldClear = confirm(`최근 검증 히스토리 ${verificationHistory.length}건을 모두 초기화하시겠습니까?`);
        if (!shouldClear) {
            return;
        }

        setVerificationHistory([]);
        try {
            window.localStorage.removeItem(VERIFICATION_HISTORY_STORAGE_KEY);
            window.localStorage.removeItem(VERIFICATION_STATUS_FILTER_STORAGE_KEY);
            window.localStorage.removeItem(VERIFICATION_FAILURE_FILTER_STORAGE_KEY);
            window.localStorage.removeItem(VERIFICATION_PACKAGE_FILTER_STORAGE_KEY);
        } catch {
            // ignore storage remove failures
        }
        setSelectedVerificationStatusFilter('ALL');
        setSelectedVerificationFailureFilter('ALL');
        setSelectedVerificationPackageFilter('ALL');
    };

    const handleVerifyEvidencePackage = async () => {
        if (!verificationManifestFile) {
            alert('manifest.json 파일을 선택해주세요.');
            return;
        }
        if (verificationJsonFiles.length === 0) {
            alert('검증할 JSON 파일을 하나 이상 선택해주세요.');
            return;
        }

        setIsVerifyingEvidence(true);
        setVerificationResult(null);
        setVerificationSummary('');

        try {
            const manifestText = await verificationManifestFile.text();
            const manifest = JSON.parse(manifestText) as EvidenceManifest;

            if (!manifest || !Array.isArray(manifest.files)) {
                throw new Error('manifest.json 형식이 올바르지 않습니다. files 배열이 필요합니다.');
            }

            const jsonContentByPath: Record<string, string> = {};
            for (const jsonFile of verificationJsonFiles) {
                const content = await jsonFile.text();
                jsonContentByPath[`json/${jsonFile.name}`] = content;
                jsonContentByPath[jsonFile.name] = content;
            }

            const result = await verifyEvidenceManifest(manifest, jsonContentByPath);
            const primaryFailureReason = getPrimaryVerificationFailureReason({
                missingJsonFiles: result.missingJsonFiles.length,
                invalidJsonFiles: result.invalidJsonFiles.length,
                hashMismatches: result.hashMismatches.length,
                missingHarnessSnapshots: result.missingHarnessSnapshots.length,
                metadataMismatches: result.metadataMismatches.length,
                packageSummaryHashMatched: result.packageSummaryHashMatched,
            });
            setVerificationResult(result);
            setVerificationSummary(formatEvidenceVerificationSummary(result));
            setVerificationHistory((previous) => [
                {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    verifiedAt: new Date().toISOString(),
                    manifestFileName: verificationManifestFile?.name || 'manifest.json',
                    packageName: manifest.packageName || '',
                    isValid: result.isValid,
                    totalEntries: result.totalEntries,
                    verifiedEntries: result.verifiedEntries,
                    missingJsonFiles: result.missingJsonFiles.length,
                    invalidJsonFiles: result.invalidJsonFiles.length,
                    hashMismatches: result.hashMismatches.length,
                    missingHarnessSnapshots: result.missingHarnessSnapshots.length,
                    metadataMismatches: result.metadataMismatches.length,
                    packageSummaryHashMatched: result.packageSummaryHashMatched,
                    primaryFailureReason,
                    templateConformanceStatus: verificationTemplateConformance
                        ? (verificationTemplateConformance.isConformant ? 'CONFORMANT' : 'MISMATCH')
                        : 'UNKNOWN',
                    templateConformanceDescription: verificationTemplateConformance?.description || '',
                    summaryText: formatEvidenceVerificationSummary(result),
                },
                ...previous,
            ].slice(0, VERIFICATION_HISTORY_MAX_ITEMS));
        } catch (error: unknown) {
            const message = extractMessage(error);
            alert(`증빙 검증 중 ${BRAND_STATUS_LABELS.attention}가 필요합니다: ${message}`);
        } finally {
            setIsVerifyingEvidence(false);
        }
    };

    const latestVerification = verificationHistory[0] || null;
    const interventionPlans = interventionHandoff?.plans || [];
    const interventionStatusSummary = interventionPlans.reduce((acc, plan) => {
        if (plan.status === 'completed') acc.completed += 1;
        else if (plan.status === 'in-progress') acc.inProgress += 1;
        else acc.notStarted += 1;
        return acc;
    }, { completed: 0, inProgress: 0, notStarted: 0 });
    const nextIntervention = interventionPlans.find((plan) => plan.status !== 'completed') || null;
    const taggingHasErrors = Boolean(taggingQuality && taggingQuality.errorCount > 0);
    const interventionDelayCount = interventionStatusSummary.notStarted;
    const isOpsDelayAlert = interventionDelayCount >= 2 || taggingHasErrors;
    const opsAlertLabel = isOpsDelayAlert ? '지연 경보' : '정상 흐름';
    const opsAlertClassName = isOpsDelayAlert
        ? 'bg-rose-100 text-rose-700 border border-rose-200'
        : 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    const appendOpsAlertClickLog = (action: OpsAlertClickLog['action']) => {
        try {
            if (typeof window === 'undefined') return;
            const existingRaw = window.localStorage.getItem(OPS_ALERT_CLICK_LOG_KEY);
            const existing = existingRaw ? JSON.parse(existingRaw) : [];
            const safeExisting: OpsAlertClickLog[] = Array.isArray(existing) ? existing : [];
            const entry: OpsAlertClickLog = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                clickedAt: new Date().toISOString(),
                action,
                delayAlertActive: isOpsDelayAlert,
                taggingErrorCount: taggingQuality?.errorCount || 0,
                interventionNotStartedCount: interventionDelayCount,
            };
            const nextLogs = [entry, ...safeExisting].slice(0, 200);
            window.localStorage.setItem(
                OPS_ALERT_CLICK_LOG_KEY,
                JSON.stringify(nextLogs),
            );
            setOpsAlertClickLogs(nextLogs);

            // 🔷 Supabase ops_alert_click_logs 테이블에 저장 (비동기)
            void logOpsAlertClick({
                action: action === 'go-intervention' ? 'go-intervention' : 'go-tagging-validation',
                delayAlertActive: isOpsDelayAlert,
                taggingErrorCount: taggingQuality?.errorCount || 0,
                interventionNotStartedCount: interventionDelayCount,
            }).catch((error) => {
                console.warn('[Reports] Supabase ops_alert_click_logs 저장 실패:', error);
            });

            void postAdminJson<{ ok: boolean; data?: { saved?: boolean; schemaReady?: boolean } }>(
                '/api/admin/safety-management',
                {
                    action: 'append-ops-alert-click-log',
                    payload: entry,
                },
                { fallbackMessage: '경보 CTA 로그 저장 실패' },
            ).catch((error) => {
                console.warn('[Reports] 경보 CTA 로그 서버 저장 실패 (로컬 유지):', extractMessage(error));
            });
        } catch {
            // ignore local log write failures
        }
    };
    const opsAlertDateWindow = useMemo(() => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        const formatDateInput = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        let startDate: Date | null = null;
        let endDate: Date | null = null;
        let previousStartDate: Date | null = null;
        let previousEndDate: Date | null = null;
        let comparisonLabel: string | null = null;

        if (opsAlertDatePreset === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            endDate = new Date(now);
            previousStartDate = new Date(startDate);
            previousStartDate.setDate(previousStartDate.getDate() - 1);
            previousEndDate = new Date(startDate);
            previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1);
            comparisonLabel = '전일 대비';
        } else if (opsAlertDatePreset === 'last7') {
            endDate = new Date(now);
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
            previousEndDate = new Date(startDate);
            previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1);
            previousStartDate = new Date(previousEndDate);
            previousStartDate.setDate(previousStartDate.getDate() - 6);
            previousStartDate.setHours(0, 0, 0, 0);
            comparisonLabel = '이전 7일 대비';
        } else if (opsAlertDatePreset === 'last30') {
            endDate = new Date(now);
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
            previousEndDate = new Date(startDate);
            previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1);
            previousStartDate = new Date(previousEndDate);
            previousStartDate.setDate(previousStartDate.getDate() - 29);
            previousStartDate.setHours(0, 0, 0, 0);
            comparisonLabel = '이전 30일 대비';
        } else if (opsAlertDatePreset === 'custom') {
            if (opsAlertStartDate) {
                const parsedStart = new Date(opsAlertStartDate);
                if (!Number.isNaN(parsedStart.getTime())) {
                    parsedStart.setHours(0, 0, 0, 0);
                    startDate = parsedStart;
                }
            }
            if (opsAlertEndDate) {
                const parsedEnd = new Date(opsAlertEndDate);
                if (!Number.isNaN(parsedEnd.getTime())) {
                    parsedEnd.setHours(23, 59, 59, 999);
                    endDate = parsedEnd;
                }
            }
            if (startDate && endDate && endDate >= startDate) {
                const rangeLengthMs = endDate.getTime() - startDate.getTime() + 1;
                previousEndDate = new Date(startDate);
                previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1);
                previousStartDate = new Date(previousEndDate.getTime() - rangeLengthMs + 1);
                previousStartDate.setHours(0, 0, 0, 0);
                comparisonLabel = '직전 동일 기간 대비';
            }
        }

        return {
            startDate,
            endDate,
            previousStartDate,
            previousEndDate,
            comparisonLabel,
            dateRangeLabel:
                opsAlertDatePreset === 'today'
                    ? '오늘'
                    : opsAlertDatePreset === 'last7'
                        ? '최근 7일'
                        : opsAlertDatePreset === 'last30'
                            ? '최근 30일'
                            : opsAlertDatePreset === 'custom' && opsAlertStartDate && opsAlertEndDate
                                ? `${opsAlertStartDate} ~ ${opsAlertEndDate}`
                                : opsAlertDatePreset === 'custom'
                                    ? '사용자 지정'
                                    : '전체',
            normalizedCustomStartLabel: formatDateInput(startDate || now),
        };
    }, [opsAlertDatePreset, opsAlertEndDate, opsAlertStartDate]);

    const filteredOpsAlertClickLogs = useMemo(() => {
        return opsAlertClickLogs.filter((log) => {
            if (opsAlertActionFilter !== 'all' && log.action !== opsAlertActionFilter) {
                return false;
            }

            const clickedDate = new Date(log.clickedAt);
            if (Number.isNaN(clickedDate.getTime())) return false;

            if (opsAlertDateWindow.startDate && clickedDate < opsAlertDateWindow.startDate) return false;
            if (opsAlertDateWindow.endDate && clickedDate > opsAlertDateWindow.endDate) return false;

            return true;
        });
    }, [opsAlertActionFilter, opsAlertClickLogs, opsAlertDateWindow.endDate, opsAlertDateWindow.startDate]);

    const opsAlertDateRangeLabel = opsAlertDateWindow.dateRangeLabel;

    const previousFilteredOpsAlertClickLogs = useMemo(() => {
        if (!opsAlertDateWindow.previousStartDate || !opsAlertDateWindow.previousEndDate) {
            return [] as OpsAlertClickLog[];
        }

        return opsAlertClickLogs.filter((log) => {
            if (opsAlertActionFilter !== 'all' && log.action !== opsAlertActionFilter) {
                return false;
            }

            const clickedDate = new Date(log.clickedAt);
            if (Number.isNaN(clickedDate.getTime())) return false;

            if (clickedDate < opsAlertDateWindow.previousStartDate!) return false;
            if (clickedDate > opsAlertDateWindow.previousEndDate!) return false;

            return true;
        });
    }, [opsAlertActionFilter, opsAlertClickLogs, opsAlertDateWindow.previousEndDate, opsAlertDateWindow.previousStartDate]);
    const opsAlertClickKpi = useMemo(() => {
        const total = filteredOpsAlertClickLogs.length;
        if (total === 0) {
            return {
                total,
                interventionRate: 0,
                taggingValidationRate: 0,
                delayActiveRate: 0,
            };
        }

        const interventionClicks = filteredOpsAlertClickLogs.filter((log) => log.action === 'go-intervention').length;
        const taggingValidationClicks = filteredOpsAlertClickLogs.filter((log) => log.action === 'go-tagging-validation').length;
        const delayActiveClicks = filteredOpsAlertClickLogs.filter((log) => log.delayAlertActive).length;

        return {
            total,
            interventionRate: (interventionClicks / total) * 100,
            taggingValidationRate: (taggingValidationClicks / total) * 100,
            delayActiveRate: (delayActiveClicks / total) * 100,
        };
    }, [filteredOpsAlertClickLogs]);
    const opsAlertPreviousClickKpi = useMemo(() => {
        const total = previousFilteredOpsAlertClickLogs.length;
        if (total === 0) return null;

        const interventionClicks = previousFilteredOpsAlertClickLogs.filter((log) => log.action === 'go-intervention').length;
        const taggingValidationClicks = previousFilteredOpsAlertClickLogs.filter((log) => log.action === 'go-tagging-validation').length;
        const delayActiveClicks = previousFilteredOpsAlertClickLogs.filter((log) => log.delayAlertActive).length;

        return {
            total,
            interventionRate: (interventionClicks / total) * 100,
            taggingValidationRate: (taggingValidationClicks / total) * 100,
            delayActiveRate: (delayActiveClicks / total) * 100,
        };
    }, [previousFilteredOpsAlertClickLogs]);
    const opsAlertComparisonLabel = opsAlertDateWindow.comparisonLabel;
    const formatOpsAlertCountDelta = (currentValue: number, previousValue: number) => {
        if (previousValue === 0) {
            return currentValue === 0 ? '변화 없음' : `${currentValue}건 증가`;
        }

        const diff = currentValue - previousValue;
        const percent = (diff / previousValue) * 100;
        const sign = diff > 0 ? '+' : '';
        return `${sign}${Math.round(diff)}건 (${sign}${Math.round(percent)}%)`;
    };
    const formatOpsAlertRateDelta = (currentValue: number, previousValue: number) => {
        const diff = currentValue - previousValue;
        const sign = diff > 0 ? '+' : '';
        return `${sign}${Math.round(diff)}%p`;
    };
    const formatOpsAlertRate = (value: number) => `${Math.round(value)}%`;
    const summaryStatusVariant = latestVerification
        ? (latestVerification.isValid ? 'normal' : 'warning')
        : 'offline';
    const summaryStatusLabel = latestVerification
        ? (latestVerification.isValid ? '검증 완료' : '확인 필요')
        : '준비 중';
    const generationStatusVariant = reportGenerationUi.status === 'error'
        ? 'critical'
        : (reportGenerationUi.status === 'running' || isGenerating || isPackagingEvidence)
            ? 'warning'
            : 'normal';
    const generationStatusLabel = reportGenerationUi.status === 'error'
        ? '점검 필요'
        : (reportGenerationUi.status === 'running' || isGenerating || isPackagingEvidence)
            ? '생성 진행 중'
            : '정상 운영';
    const handleClearOpsAlertClickLogs = () => {
        if (typeof window === 'undefined') return;
        if (!confirm('경보 CTA 클릭 로그를 모두 초기화하시겠습니까?')) return;

        const clearLocal = () => {
            try {
                window.localStorage.removeItem(OPS_ALERT_CLICK_LOG_KEY);
                setOpsAlertClickLogs([]);
            } catch {
                // ignore local log clear failures
            }
        };

        void postAdminJson<{ ok: boolean; data?: { cleared?: boolean; schemaReady?: boolean } }>(
            '/api/admin/safety-management',
            {
                action: 'clear-ops-alert-click-logs',
                payload: {},
            },
            { fallbackMessage: '경보 CTA 로그 초기화 실패' },
        ).then((response) => {
            if (response?.data?.schemaReady) {
                setOpsAlertSyncState('server');
                setOpsAlertSyncNote('서버/로컬 초기화 완료');
            } else {
                setOpsAlertSyncState('fallback');
                setOpsAlertSyncNote('서버 스키마 미준비 · 로컬만 초기화');
            }
            clearLocal();
        }).catch((error) => {
            console.warn('[Reports] 경보 CTA 로그 서버 초기화 실패 (로컬 초기화 실행):', extractMessage(error));
            setOpsAlertSyncState('fallback');
            setOpsAlertSyncNote('서버 초기화 실패 · 로컬만 초기화');
            clearLocal();
        });
    };

    useEffect(() => {
        if (opsAlertDatePreset !== 'custom') return;
        if (opsAlertStartDate || opsAlertEndDate) return;

        const formatDateInput = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const today = new Date();
        const end = formatDateInput(today);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 6);
        const start = formatDateInput(startDate);

        setOpsAlertStartDate(start);
        setOpsAlertEndDate(end);
    }, [opsAlertDatePreset, opsAlertEndDate, opsAlertStartDate]);
    const handleExportOpsAlertClickLogsCsv = () => {
        if (filteredOpsAlertClickLogs.length === 0) {
            alert('내보낼 경보 CTA 클릭 로그가 없습니다.');
            return;
        }

        const header = ['clickedAt', 'action', 'delayAlertActive', 'taggingErrorCount', 'interventionNotStartedCount'];
        const rows = filteredOpsAlertClickLogs.map((log) => [
            log.clickedAt,
            log.action,
            String(log.delayAlertActive),
            String(log.taggingErrorCount),
            String(log.interventionNotStartedCount),
        ]);

        const csv = [header, ...rows]
            .map((row) => row.map((value) => escapeCsvCell(value)).join(','))
            .join('\n');

        const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ops-alert-click-log-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    const handleNavigateToIntervention = () => {
        trackQuickAction('ops_alert_go_intervention', {
            delayAlertActive: isOpsDelayAlert,
            taggingErrorCount: taggingQuality?.errorCount || 0,
            interventionNotStartedCount: interventionDelayCount,
        });
        appendOpsAlertClickLog('go-intervention');
        onNavigateToPage?.('intervention-coaching');
    };
    const handleNavigateToTaggingValidation = () => {
        trackQuickAction('ops_alert_go_tagging_validation', {
            delayAlertActive: isOpsDelayAlert,
            taggingErrorCount: taggingQuality?.errorCount || 0,
            interventionNotStartedCount: interventionDelayCount,
        });
        appendOpsAlertClickLog('go-tagging-validation');
        onNavigateToPage?.('ocr-analysis');
    };

    const handleNavigateFromIntroQaWarning = (page: Page) => {
        trackQuickAction('intro_qa_warning_navigate', {
            targetPage: page,
            warnItems: latestIntroQaRunlog?.warnItems || 0,
        });
        onNavigateToPage?.(page);
    };

    const mobileReportBadge =
        harnessSummary.highRisk > 0
            ? { label: '🔴 고위험', tone: 'bg-rose-500/20 text-rose-200 border border-rose-400/40' }
            : harnessSummary.approvalPending > 0
              ? { label: '🟡 승인 대기', tone: 'bg-amber-400/20 text-amber-100 border border-amber-300/40' }
              : { label: '🟢 정상', tone: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' };

    return (
        <div className="space-y-6 pb-10 h-full flex flex-col font-sans">
            <div className="sm:hidden mb-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 text-white">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-300">11) 분석 리포트</p>
                        <h2 className="mt-1 text-lg font-black">KPI 요약 센터</h2>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${mobileReportBadge.tone}`}>{mobileReportBadge.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {[
                        { label: '대상', value: filteredRecords.length, tone: 'text-slate-300' },
                        { label: '연결', value: harnessSummary.connected, tone: harnessSummary.connected > 0 ? 'text-indigo-300' : 'text-slate-400' },
                        { label: '승인대기', value: harnessSummary.approvalPending, tone: harnessSummary.approvalPending > 0 ? 'text-amber-300' : 'text-slate-400' },
                        { label: '고위험', value: harnessSummary.highRisk, tone: harnessSummary.highRisk > 0 ? 'text-rose-300' : 'text-slate-400' },
                    ].map((chip) => (
                        <div key={chip.label} className="rounded-xl border border-slate-700 bg-slate-900/60 px-1.5 py-2 text-center">
                            <p className="text-[9px] font-black text-slate-500">{chip.label}</p>
                            <p className={`text-sm font-black ${chip.tone}`}>{chip.value}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => handleNavigateToTaggingValidation()}
                        className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-500 transition-colors"
                    >
                        태깅 검증 이동
                    </button>
                    <button
                        type="button"
                        onClick={() => handleNavigateToIntervention()}
                        className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                        개입 추천 이동
                    </button>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 no-print">
                <h2 className="text-2xl font-black text-slate-900">PSI 정밀 보고서 센터</h2>
                <div className="flex items-center space-x-3 bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 pl-3 pr-1">운영 상태</span>
                    <StatusPill
                        variant={summaryStatusVariant}
                        label={summaryStatusLabel}
                        size="md"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_0.85fr] no-print">
                <SectionCard
                    title="리포트 운영 요약"
                    subtitle="생성 상태와 최근 검증 결과를 한눈에 확인하고 바로 조치 화면으로 이동합니다."
                    className="rounded-3xl border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-slate-100"
                    action={
                        <StatusPill
                            variant={summaryStatusVariant}
                            label={summaryStatusLabel}
                            size="md"
                        />
                    }
                >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <MetricCard
                            title="보고서 대상"
                            value={`${filteredRecords.length}`}
                            unit="건"
                            tone="neutral"
                            className="min-h-[108px]"
                        />
                        <MetricCard
                            title="생성 진행률"
                            value={`${bulkProgressPercent}`}
                            unit="%"
                            tone={isGenerating || isPackagingEvidence ? 'warn' : 'safe'}
                            className="min-h-[108px]"
                        />
                        <MetricCard
                            title="최근 검증"
                            value={latestVerification ? (latestVerification.isValid ? '성공' : '확인 필요') : '이력 없음'}
                            tone={latestVerification ? (latestVerification.isValid ? 'safe' : 'warn') : 'neutral'}
                            className="min-h-[108px]"
                        />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={handleNavigateToIntervention} className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-500">
                            8번 개입 화면
                        </button>
                        <button type="button" onClick={handleNavigateToTaggingValidation} className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-700 transition duration-200 hover:-translate-y-0.5 hover:bg-violet-50">
                            10번 태깅 검증
                        </button>
                        <button type="button" onClick={() => onNavigateToPage?.('dashboard')} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-50">
                            대시보드로 이동
                        </button>
                    </div>
                </SectionCard>

                <section className="rounded-3xl border border-violet-200 bg-violet-50 px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">MOBILE ACTION FLOW</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <div>
                            <h3 className="text-lg font-black text-slate-900">리포트에서 바로 조치</h3>
                            <p className="mt-1 text-sm font-semibold text-slate-600">모바일은 읽는 것보다 움직이는 동선을 먼저 보여줍니다.</p>
                        </div>
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black text-violet-700">최신 기준</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                        {[
                            { step: '8', label: '개입 추천', action: '개입 보기' },
                            { step: '10', label: '태깅 검증', action: '검증 보기' },
                            { step: '11', label: '리포트 결과', action: '생성 보기' },
                            { step: '12', label: '메뉴/설정', action: '설정 보기' },
                        ].map((item) => (
                            <button
                                key={item.step}
                                type="button"
                                onClick={() => onNavigateToPage?.(item.step === '8' ? 'intervention-coaching' : item.step === '10' ? 'ocr-analysis' : item.step === '11' ? 'reports' : 'settings')}
                                className="rounded-2xl border border-white bg-white px-3 py-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
                            >
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">STEP {item.step}</p>
                                <p className="mt-1 text-sm font-black text-slate-900">{item.label}</p>
                                <p className="mt-1 text-[11px] font-semibold text-slate-500">{item.action}</p>
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            <SectionCard
                title="11) 리포트 생성 상태"
                subtitle="현재 필터 기준으로 생성 진행 상태를 확인합니다."
                className="border-indigo-200 bg-indigo-50 no-print"
                compact
                action={<StatusPill variant={generationStatusVariant} label={generationStatusLabel} />}
            >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <MetricCard
                        title="보고서 대상"
                        value={`${filteredRecords.length}`}
                        unit="건"
                        tone="neutral"
                        className="min-h-[104px]"
                    />
                    <MetricCard
                        title="생성 진행률"
                        value={`${bulkProgressPercent}`}
                        unit="%"
                        tone={isGenerating || isPackagingEvidence ? 'warn' : 'safe'}
                        className="min-h-[104px]"
                    />
                    <MetricCard
                        title="최근 검증"
                        value={latestVerification ? (latestVerification.isValid ? '성공' : '확인 필요') : '이력 없음'}
                        tone={latestVerification ? (latestVerification.isValid ? 'safe' : 'warn') : 'neutral'}
                        className="min-h-[104px]"
                    />
                </div>
                <p className="mt-2 text-[11px] font-bold text-indigo-700">
                    기간: {resolvedDateRange.startLabel} ~ {resolvedDateRange.endLabel}
                    {hasCustomDateRangeError ? ' · 날짜 범위를 먼저 수정하세요.' : ' · 필터 결과 기준으로 생성/검증을 실행합니다.'}
                </p>
            </SectionCard>

            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 no-print">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">운영 브리핑 OPS 3줄 (태깅+개입)</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${opsAlertClassName}`}>
                        {opsAlertLabel}
                    </span>
                </div>
                <div className="mt-2 space-y-2 text-[12px] font-bold text-slate-700">
                    <p>
                        완료: {taggingQualityLoading
                            ? '태깅 QA 데이터 로딩 중'
                            : (taggingQuality
                                ? `태깅 ${taggingQuality.status} (입력 ${taggingQuality.filledRows}건, 오류 ${taggingQuality.errorCount}건)`
                                : '태깅 QA 데이터 없음')}
                        {' · '}
                        {interventionPlans.length > 0
                            ? `개입 완료 ${interventionStatusSummary.completed}/${interventionPlans.length}건`
                            : '개입 인계 데이터 없음'}
                    </p>
                    <p>
                        다음: {taggingQuality?.actionItems?.length
                            ? `${taggingQuality.actionItems[0].title} — ${taggingQuality.actionItems[0].action}`
                            : '태깅 추가 조치 없음'}
                        {' · '}
                        {nextIntervention
                            ? `개입 우선: ${nextIntervention.actionTitle} (${nextIntervention.workerName})`
                            : '개입 미완료 없음'}
                    </p>
                    <p>
                        검증: {taggingQuality
                            ? `10번 QA ${taggingQuality.status}`
                            : '10번 QA 재실행 필요'}
                        {' · '}
                        {interventionPlans.length > 0
                            ? `8→11 동기화 완료 (${interventionHandoff?.generatedAt || '시간 미기록'})`
                            : '7번 예측 실행 계획 생성 필요'}
                        {isOpsDelayAlert && (
                            <>
                                {' · '}
                                경보사유: {taggingHasErrors
                                    ? `태깅 오류 ${taggingQuality?.errorCount || 0}건`
                                    : `미착수 ${interventionDelayCount}건`}
                            </>
                        )}
                    </p>
                </div>
                {isOpsDelayAlert && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={handleNavigateToIntervention}
                            className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-50"
                        >
                            8번 개입 화면으로 이동
                        </button>
                        <button
                            type="button"
                            onClick={handleNavigateToTaggingValidation}
                            className="rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50"
                        >
                            10번 태깅 검증으로 이동
                        </button>
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 no-print">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">경보 CTA 클릭 로그 (최근 10건)</p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleLoadLatestOpsAlertStatus}
                            disabled={opsAlertSyncState === 'syncing' || isOpsAlertPending}
                            className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${(opsAlertSyncState === 'syncing' || isOpsAlertPending) ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                        >
                            {(opsAlertSyncState === 'syncing' || isOpsAlertPending) ? '불러오는 중…' : '최신 상태 불러오기'}
                        </button>
                        <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[10px] font-black text-slate-600">
                            {Math.min(10, filteredOpsAlertClickLogs.length)}건 표시
                        </span>
                        <button
                            type="button"
                            onClick={handleExportOpsAlertClickLogsCsv}
                            disabled={filteredOpsAlertClickLogs.length === 0}
                            className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${filteredOpsAlertClickLogs.length === 0 ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                        >
                            CSV 내보내기
                        </button>
                        <button
                            type="button"
                            onClick={handleClearOpsAlertClickLogs}
                            disabled={opsAlertClickLogs.length === 0}
                            className={`rounded-lg border px-2.5 py-1 text-[10px] font-black ${opsAlertClickLogs.length === 0 ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                        >
                            전체 초기화
                        </button>
                    </div>
                </div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    동기화 상태: {opsAlertSyncState === 'server' ? '서버 연결' : opsAlertSyncState === 'syncing' ? '확인 중' : opsAlertSyncState === 'fallback' ? '로컬 폴백' : '초기 상태'}
                    {hasOpsAlertServerFetched
                        ? (opsAlertSyncNote ? ` · ${opsAlertSyncNote}` : '')
                        : ' · 최근 상태를 아직 불러오지 않았습니다. 필요 시 최신 상태 불러오기를 눌러 확인해 주세요.'}
                </p>

                <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-700">초기 점검 기록</p>
                    {latestIntroQaRunlog ? (
                        <>
                            <p className="mt-1 text-[11px] font-semibold text-indigo-800">
                                최신 점검: {new Date(latestIntroQaRunlog.checkedAt).toLocaleString('ko-KR', { hour12: false })}
                                {' · '}
                                연결 {latestIntroQaRunlog.connected}/{latestIntroQaRunlog.total}
                                {' · '}
                                데이터 {latestIntroQaRunlog.dataReady}/{latestIntroQaRunlog.total}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold text-indigo-700/80">
                                상태: {latestIntroQaRunlog.hasWarnings ? `경고 ${latestIntroQaRunlog.warnItems}건` : '정상'}
                            </p>
                            {latestIntroQaRunlog.warningPages.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {latestIntroQaRunlog.warningPages.map((page) => (
                                        <button
                                            key={`intro-qa-warning-${page}`}
                                            type="button"
                                            onClick={() => handleNavigateFromIntroQaWarning(page)}
                                            className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-black text-amber-700 hover:bg-amber-50"
                                        >
                                            {getPageLabel(page)} 이동
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">초기 점검 기록 데이터가 없습니다.</p>
                    )}
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                        value={opsAlertActionFilter}
                        onChange={(event) => setOpsAlertActionFilter(event.target.value as 'all' | OpsAlertClickLog['action'])}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700"
                    >
                        <option value="all">전체 액션</option>
                        <option value="go-intervention">8번 개입 이동</option>
                        <option value="go-tagging-validation">10번 태깅 검증 이동</option>
                    </select>
                    <select
                        value={opsAlertDatePreset}
                        onChange={(event) => setOpsAlertDatePreset(event.target.value as OpsAlertDatePreset)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700"
                    >
                        <option value="all">전체 기간</option>
                        <option value="today">오늘</option>
                        <option value="last7">최근 7일</option>
                        <option value="last30">최근 30일</option>
                        <option value="custom">사용자 지정</option>
                    </select>
                </div>

                {opsAlertDatePreset === 'custom' && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                            type="date"
                            value={opsAlertStartDate}
                            onChange={(event) => setOpsAlertStartDate(event.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700"
                        />
                        <input
                            type="date"
                            value={opsAlertEndDate}
                            onChange={(event) => setOpsAlertEndDate(event.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700"
                        />
                    </div>
                )}

                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    선택 기간: {opsAlertDateRangeLabel}
                </p>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-black text-slate-500">총 클릭수</p>
                        <p className="mt-1 text-base font-black text-slate-900">{opsAlertClickKpi.total}건</p>
                        <p className="mt-1 text-[10px] font-bold text-slate-500">
                            {opsAlertPreviousClickKpi && opsAlertComparisonLabel
                                ? `${opsAlertComparisonLabel} ${formatOpsAlertCountDelta(opsAlertClickKpi.total, opsAlertPreviousClickKpi.total)}`
                                : '비교 기준 없음'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-[10px] font-black text-amber-700">8번 이동률</p>
                        <p className="mt-1 text-base font-black text-amber-800">
                            {opsAlertClickKpi.total === 0 ? '-' : formatOpsAlertRate(opsAlertClickKpi.interventionRate)}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-amber-700/80">
                            {opsAlertPreviousClickKpi && opsAlertComparisonLabel
                                ? `${opsAlertComparisonLabel} ${formatOpsAlertRateDelta(opsAlertClickKpi.interventionRate, opsAlertPreviousClickKpi.interventionRate)}`
                                : '비교 기준 없음'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                        <p className="text-[10px] font-black text-violet-700">10번 이동률</p>
                        <p className="mt-1 text-base font-black text-violet-800">
                            {opsAlertClickKpi.total === 0 ? '-' : formatOpsAlertRate(opsAlertClickKpi.taggingValidationRate)}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-violet-700/80">
                            {opsAlertPreviousClickKpi && opsAlertComparisonLabel
                                ? `${opsAlertComparisonLabel} ${formatOpsAlertRateDelta(opsAlertClickKpi.taggingValidationRate, opsAlertPreviousClickKpi.taggingValidationRate)}`
                                : '비교 기준 없음'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                        <p className="text-[10px] font-black text-rose-700">경보활성 클릭 비율</p>
                        <p className="mt-1 text-base font-black text-rose-800">
                            {opsAlertClickKpi.total === 0 ? '-' : formatOpsAlertRate(opsAlertClickKpi.delayActiveRate)}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-rose-700/80">
                            {opsAlertPreviousClickKpi && opsAlertComparisonLabel
                                ? `${opsAlertComparisonLabel} ${formatOpsAlertRateDelta(opsAlertClickKpi.delayActiveRate, opsAlertPreviousClickKpi.delayActiveRate)}`
                                : '비교 기준 없음'}
                        </p>
                    </div>
                </div>

                {filteredOpsAlertClickLogs.length === 0 ? (
                    <p className="mt-2 text-[12px] font-semibold text-slate-500">아직 경보 CTA 클릭 로그가 없습니다.</p>
                ) : (
                    <div className="mt-2 space-y-1.5">
                        {filteredOpsAlertClickLogs.slice(0, 10).map((log) => (
                            <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                                <p>
                                    {new Date(log.clickedAt).toLocaleString('ko-KR', { hour12: false })}
                                    {' · '}
                                    {log.action === 'go-intervention' ? '8번 개입 이동' : '10번 태깅 검증 이동'}
                                </p>
                                <p className="text-[10px] text-slate-600 mt-0.5">
                                    경보활성: {log.delayAlertActive ? 'Y' : 'N'} · 태깅오류 {log.taggingErrorCount}건 · 미착수 {log.interventionNotStartedCount}건
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <InterpretationCardGrid
                items={reportSummaryCards}
                cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
            />

            {isDevMode && !isImmediateOperationalMode && (
                <div className="space-y-3">
                    <SummaryMetricGrid
                        items={harnessSummaryMetrics}
                        className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
                        cardClassName="rounded-2xl border px-4 py-3 shadow-sm shadow-slate-100"
                    />
                    {harnessSummary.fallback > 0 && (
                        <NoticeCallout
                            variant="amber"
                            eyebrow="리포트 저장 상태"
                            title={`현재 보고서 범위에서 ${harnessSummary.fallback}건이 영속 저장 폴백 상태입니다.`}
                            description="보고서 해석과 증빙 JSON 내보내기는 계속 가능하지만, 저장 연결 여부를 함께 읽어 재확인 순서를 정해야 합니다."
                        />
                    )}
                </div>
            )}

            {!isImmediateOperationalMode && (
            <div className="hidden lg:block rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 no-print">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">PC 운영 바로가기</p>
                <p className="mt-1 text-[11px] font-semibold text-indigo-700">생성/내보내기/검토를 한 구간에서 실행해 보고 사이클을 단축합니다.</p>
                <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-5">
                    <button type="button" onClick={() => { trackQuickAction('bulk_generate_start', { filteredCount: filteredRecords.length }); handleGenerate(); }} disabled={filteredRecords.length === 0 || hasCustomDateRangeError || isGenerating || isPackagingEvidence} className={`min-h-[44px] rounded-xl border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-black text-indigo-700 ${filteredRecords.length === 0 || hasCustomDateRangeError || isGenerating || isPackagingEvidence ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-50'}`}>일괄 생성 시작</button>
                    <button type="button" onClick={() => { trackQuickAction('export_evidence_zip', { filteredCount: filteredRecords.length }); handleExportEvidenceZip(); }} disabled={filteredRecords.length === 0 || hasCustomDateRangeError || isPackagingEvidence} className={`min-h-[44px] rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-xs font-black text-violet-700 ${filteredRecords.length === 0 || hasCustomDateRangeError || isPackagingEvidence ? 'opacity-50 cursor-not-allowed' : 'hover:bg-violet-50'}`}>증빙 ZIP 내보내기</button>
                    <button type="button" onClick={() => { trackQuickAction('export_csv', { filteredCount: filteredRecords.length }); handleExportCsv(); }} disabled={filteredRecords.length === 0 || hasCustomDateRangeError || isPackagingEvidence} className={`min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 ${filteredRecords.length === 0 || hasCustomDateRangeError || isPackagingEvidence ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}>CSV 내보내기</button>
                    <button type="button" onClick={() => { trackQuickAction('open_worker_preview', { filteredCount: filteredRecords.length, uiVariant: 'v2-lowfreq-tuning-1' }); setActiveTab('worker-report'); setViewMode('preview'); setPreviewIndex(0); }} disabled={filteredRecords.length === 0} className={`min-h-[44px] rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-xs font-black text-amber-700 ${filteredRecords.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-50'}`}>근로자 1건 미리보기</button>
                    <button type="button" onClick={() => { trackQuickAction('print_meeting_report'); window.print(); }} className="min-h-[44px] rounded-xl border border-sky-200 bg-white px-3 py-2 text-left text-xs font-black text-sky-700 hover:bg-sky-50">회의 리포트 인쇄</button>
                </div>
            </div>
            )}

            <div className="overflow-x-auto pb-2 -mb-2 shrink-0 no-print">
                <div className="flex space-x-6 border-b border-slate-200 min-w-max">
                    <button onClick={() => setActiveTab('team-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'team-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        팀별 통합 리포트
                        {activeTab === 'team-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
                    </button>
                    <button onClick={() => setActiveTab('worker-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'worker-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        전체 근로자 목록
                        {activeTab === 'worker-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 flex flex-wrap gap-4 items-end no-print">
                <div className="w-full">
                    <InterpretationCardGrid
                        items={filterInterpretationCards}
                        cardClassName="rounded-2xl border p-4"
                    />
                </div>
                {/* Filters */}
                {activeTab === 'team-report' && (
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">대상 공종 (팀)</label>
                        <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]">
                            {teams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">등급 필터</label>
                    <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[120px]">
                        <option value="전체">전체 등급</option>
                        <option value="초급">초급 (고위험)</option>
                        <option value="중급">중급 (주의)</option>
                        <option value="고급">고급 (우수)</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">기간 필터</label>
                    <select value={datePreset} onChange={e => setDatePreset(e.target.value as DatePreset)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]">
                        <option value="all">전체 기간</option>
                        <option value="last30">최근 30일</option>
                        <option value="thisMonth">당월</option>
                        <option value="custom">사용자 지정</option>
                    </select>
                </div>
                {datePreset === 'custom' && (
                    <>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">시작일</label>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={e => setCustomStartDate(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">종료일</label>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={e => setCustomEndDate(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]"
                            />
                        </div>
                        {isIncompleteCustomDateRange && (
                            <div className="self-end pb-1">
                                <p className="text-xs font-bold text-amber-600">사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.</p>
                            </div>
                        )}
                        {isInvalidCustomDateRange && (
                            <div className="self-end pb-1">
                                <p className="text-xs font-bold text-red-600">시작일이 종료일보다 늦습니다. 기간을 다시 설정해주세요.</p>
                            </div>
                        )}
                    </>
                )}
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">일괄 출력 형태</label>
                    <select value={genMode} onChange={e => setGenMode(e.target.value as GenMode)} className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-black min-w-[200px]">
                        <option value="individual-pdf">📁 개별 PDF (ZIP 압축)</option>
                        <option value="individual-img">🖼️ 개별 이미지 (ZIP 압축)</option>
                        <option value="combined-pdf">📑 통합 PDF (단일 파일)</option>
                    </select>
                </div>
                
                {/* View Mode Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl self-end">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        목록 보기
                    </button>
                    <button 
                        onClick={() => setViewMode('preview')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'preview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        상세 미리보기
                    </button>
                </div>

                <div className="flex-1"></div>

                {/* Actions */}
                <div className="flex gap-3 items-center">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 h-[42px]">
                        <span>대상: {filteredRecords.length}명</span>
                    </div>
                    
                    {isPackagingEvidence ? (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <div className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm min-w-[280px]">
                                <div className="text-xs font-black text-indigo-700 h-[20px] flex items-center justify-between">
                                    <span className="flex items-center">
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        증빙 패키지 생성 중
                                    </span>
                                    <span>{bulkProgressPercent}%</span>
                                </div>
                                <div className="mt-1.5 h-2 w-full rounded-full bg-indigo-100 overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-600 transition-all duration-300"
                                        style={{ width: `${bulkProgressPercent}%` }}
                                    ></div>
                                </div>
                                <div className="mt-1 text-[11px] font-bold text-indigo-600">
                                    {bulkProgress.current}/{bulkProgress.total} 처리 완료
                                </div>
                            </div>
                            <button onClick={cancelGeneration} className="px-4 py-2.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-300 h-[42px]" disabled={isPackagingEvidence}>
                                중단
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={handleExportEvidenceZip}
                                disabled={filteredRecords.length === 0 || hasCustomDateRangeError}
                                className={`px-4 py-2.5 font-black rounded-xl shadow-sm transition-all flex items-center gap-2 text-xs h-[42px] border
                                    ${filteredRecords.length === 0 || hasCustomDateRangeError ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 cursor-pointer'}`}
                            >
                                증빙 패키지 ZIP
                            </button>
                            <button
                                onClick={handleExportCsv}
                                disabled={filteredRecords.length === 0 || hasCustomDateRangeError}
                                className={`px-4 py-2.5 font-black rounded-xl shadow-sm transition-all flex items-center gap-2 text-xs h-[42px] border
                                    ${filteredRecords.length === 0 || hasCustomDateRangeError ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'}`}
                            >
                                CSV 내보내기
                            </button>
                            <button 
                                onClick={handleGenerate} 
                                disabled={filteredRecords.length === 0 || hasCustomDateRangeError || isGenerating}
                                className={`px-6 py-2.5 text-white font-black rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm h-[42px]
                                    ${filteredRecords.length === 0 || hasCustomDateRangeError || isGenerating ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5 cursor-pointer'}`}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> 
                                일괄 생성 시작
                            </button>
                        </>
                    )}
                </div>
            </div>

            {reportGenerationUi.status !== 'idle' && (
                <div className="no-print space-y-3">
                    <InterpretationCardGrid
                        items={generationInterpretationCards}
                        cardClassName="rounded-2xl border p-4"
                    />
                    <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <ReportGenerationProgress
                            status={reportGenerationUi.status === 'running' ? 'running' : reportGenerationUi.status === 'success' ? 'success' : 'error'}
                            progress={reportGenerationUi.progress}
                            phaseLabel={reportGenerationUi.phaseLabel}
                            actionLabel="일괄 보고서 생성"
                            errorMessage={reportGenerationUi.errorMessage}
                            onRetry={reportGenerationUi.status === 'error' ? retryReportGeneration : undefined}
                        />
                    </div>
                    {isGenerating && (
                        <button
                            onClick={cancelGeneration}
                            className="px-4 py-2.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-300 h-[42px]"
                        >
                            중단
                        </button>
                    )}
                    </div>
                </div>
            )}

            {isDevMode && !isImmediateOperationalMode && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 no-print space-y-4">
                <InterpretationCardGrid
                    items={verificationInterpretationCards}
                    cardClassName="rounded-2xl border p-4"
                />
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="text-sm font-black text-slate-800">증빙 패키지 무결성 검증</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        {verificationHistory.length > 0 ? (
                            <>
                                <button
                                    onClick={handleExportVerificationHistoryCsv}
                                    className="px-4 py-2.5 rounded-xl text-xs font-black border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all"
                                >
                                    검증 히스토리 CSV
                                </button>
                                <button
                                    onClick={handleClearVerificationHistory}
                                    className="px-4 py-2.5 rounded-xl text-xs font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-all"
                                >
                                    히스토리 초기화
                                </button>
                            </>
                        ) : null}
                        {verificationResult ? (
                            <>
                                <button
                                    onClick={handleExportVerificationCsv}
                                    className="px-4 py-2.5 rounded-xl text-xs font-black border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all"
                                >
                                    검증 CSV 저장
                                </button>
                                <button
                                    onClick={handleExportVerificationJson}
                                    className="px-4 py-2.5 rounded-xl text-xs font-black border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all"
                                >
                                    검증 JSON 저장
                                </button>
                            </>
                        ) : null}
                        <button
                            onClick={handleVerifyEvidencePackage}
                            disabled={isVerifyingEvidence || !verificationManifestFile || verificationJsonFiles.length === 0}
                            className={`px-4 py-2.5 rounded-xl text-xs font-black border transition-all ${isVerifyingEvidence || !verificationManifestFile || verificationJsonFiles.length === 0 ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer'}`}
                        >
                            {isVerifyingEvidence ? '검증 실행 중...' : '증빙 검증 실행'}
                        </button>
                    </div>
                </div>

                {verificationHistory.length > 0 ? (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Verification History</p>
                                <p className="mt-1 text-sm font-black text-slate-800">최근 세션 검증 결과 {verificationHistorySummary.total}건</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-500">보존 정책: 최근 {VERIFICATION_HISTORY_RETENTION_DAYS}일 · 최대 {VERIFICATION_HISTORY_MAX_ITEMS}건</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold text-slate-600">
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">성공 {verificationHistorySummary.success}건</span>
                                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">실패 {verificationHistorySummary.failed}건</span>
                                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">표준 적합 {verificationHistorySummary.templateConformant}건</span>
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">표준 불일치 {verificationHistorySummary.templateMismatch}건</span>
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">메타 불일치 {verificationHistorySummary.metadataMismatches}건</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-black text-slate-500">상태 필터</span>
                            {VERIFICATION_STATUS_FILTER_OPTIONS.map((option) => {
                                const active = selectedVerificationStatusFilter === option;
                                const label = option === 'ALL' ? '전체' : option === 'SUCCESS' ? '성공' : '실패';
                                const count = option === 'ALL'
                                    ? verificationHistory.length
                                    : option === 'SUCCESS'
                                        ? verificationHistory.filter((entry) => entry.isValid).length
                                        : verificationHistory.filter((entry) => !entry.isValid).length;

                                return (
                                    <button
                                        key={option}
                                        onClick={() => setSelectedVerificationStatusFilter(option)}
                                        className={`rounded-full px-3 py-1 text-[11px] font-black transition-all ${active ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        {label} {count}건
                                    </button>
                                );
                            })}
                        </div>

                        {verificationFailureFilterOptions.length > 1 ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-black text-slate-500">실패 원인 필터</span>
                                {verificationFailureFilterOptions.map((option) => {
                                    const active = selectedVerificationFailureFilter === option;
                                    const label = option === 'ALL' ? '전체' : option;
                                    const count = option === 'ALL'
                                        ? verificationHistory.length
                                        : verificationHistory.filter((entry) => !entry.isValid && entry.primaryFailureReason === option).length;

                                    return (
                                        <button
                                            key={option}
                                            onClick={() => setSelectedVerificationFailureFilter(option)}
                                            className={`rounded-full px-3 py-1 text-[11px] font-black transition-all ${active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            {label} {count}건
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}

                        {verificationPackageFilterOptions.length > 1 ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-black text-slate-500">Package 필터</span>
                                {verificationPackageFilterOptions.map((option) => {
                                    const active = selectedVerificationPackageFilter === option;
                                    const label = option === 'ALL' ? '전체 패키지' : option;
                                    const count = option === 'ALL'
                                        ? verificationHistory.length
                                        : verificationHistory.filter((entry) => entry.packageName === option).length;

                                    return (
                                        <button
                                            key={option}
                                            onClick={() => setSelectedVerificationPackageFilter(option)}
                                            className={`rounded-full px-3 py-1 text-[11px] font-black transition-all ${active ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            {label} {count}건
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-500">실패 패키지 수</p>
                                <p className="mt-1 text-sm font-black text-rose-800">{verificationPackageFailureSummary.failedPackages}개</p>
                                <p className="mt-1 text-[11px] font-bold text-rose-700">한 번 이상 실패가 기록된 package 기준입니다.</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">반복 실패 패키지</p>
                                <p className="mt-1 text-sm font-black text-amber-800">{verificationPackageFailureSummary.repeatedFailurePackages}개</p>
                                <p className="mt-1 text-[11px] font-bold text-amber-700">2회 이상 실패한 package 수입니다.</p>
                            </div>
                            <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">우선 재확인 대상</p>
                                <p className="mt-1 text-sm font-black text-violet-800 break-all">{verificationPackageFailureSummary.topPackages[0]?.packageName || '없음'}</p>
                                <p className="mt-1 text-[11px] font-bold text-violet-700">실패 횟수와 이슈 신호가 가장 높은 package입니다.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">최다 실패 원인</p>
                                <p className="mt-1 text-sm font-black text-indigo-800">{verificationFailureReasonDistribution.topReason}</p>
                                <p className="mt-1 text-[11px] font-bold text-indigo-700">최근 세션에서 {verificationFailureReasonDistribution.topReasonCount}회 기록되었습니다.</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">실패 원인 종류</p>
                                <p className="mt-1 text-sm font-black text-amber-800">{verificationFailureReasonDistribution.items.length}종</p>
                                <p className="mt-1 text-[11px] font-bold text-amber-700">세션 내 누적된 원인 유형 수입니다.</p>
                            </div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">최근 실패 원인</p>
                                <p className="mt-1 text-sm font-black text-emerald-800">{verificationHistory.find((entry) => !entry.isValid)?.primaryFailureReason || '없음'}</p>
                                <p className="mt-1 text-[11px] font-bold text-emerald-700">가장 최근 실패 실행 기준입니다.</p>
                            </div>
                        </div>

                        <NoticeCallout
                            variant="amber"
                            eyebrow="주요 실패 원인"
                            title="최근 package 실패 패턴에서 가장 먼저 보이는 원인을 확인합니다."
                            description={verificationPackageFailureSummary.dominantFailureReason === '실패 패키지 없음'
                                ? '아직 실패 package가 없어 별도 우선 원인이 없습니다.'
                                : `현재 가장 우세한 실패 원인은 "${verificationPackageFailureSummary.dominantFailureReason}"입니다. 권장 조치: ${getVerificationFailureRecommendedAction(verificationPackageFailureSummary.dominantFailureReason)}`}
                            className="rounded-2xl border px-4 py-3"
                            bodyClassName="block"
                            titleClassName="text-sm font-black"
                            descriptionClassName="mt-1 text-xs font-semibold leading-relaxed"
                        />

                        {verificationFailureReasonDistribution.items.length > 0 ? (
                            <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                                <table className="w-full min-w-[720px] text-left text-[11px]">
                                    <thead className="bg-slate-50 text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2">실패 원인</th>
                                            <th className="px-3 py-2">횟수</th>
                                            <th className="px-3 py-2">비중</th>
                                            <th className="px-3 py-2">권장 조치</th>
                                            <th className="px-3 py-2">최근 발생 시각</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700">
                                        {verificationFailureReasonDistribution.items.map((item) => {
                                            const failureShare = verificationHistorySummary.failed > 0
                                                ? Math.round((item.count / verificationHistorySummary.failed) * 100)
                                                : 0;

                                            return (
                                                <tr key={item.reason} className="border-t border-slate-100">
                                                    <td className="px-3 py-2 font-semibold">{item.reason}</td>
                                                    <td className="px-3 py-2 font-black">{item.count}회</td>
                                                    <td className="px-3 py-2">{failureShare}%</td>
                                                    <td className="px-3 py-2 leading-relaxed">{getVerificationFailureRecommendedAction(item.reason)}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{formatIsoKstTimestamp(item.latestAt)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        {verificationPackageFailureSummary.topPackages.length > 0 ? (
                            <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                                <table className="w-full min-w-[860px] text-left text-[11px]">
                                    <thead className="bg-slate-50 text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2">Package</th>
                                            <th className="px-3 py-2">시도</th>
                                            <th className="px-3 py-2">실패</th>
                                            <th className="px-3 py-2">Hash</th>
                                            <th className="px-3 py-2">Meta Diff</th>
                                            <th className="px-3 py-2">Snapshot</th>
                                            <th className="px-3 py-2">Invalid JSON</th>
                                            <th className="px-3 py-2">주요 원인</th>
                                            <th className="px-3 py-2">권장 조치</th>
                                            <th className="px-3 py-2">최근 시각</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700">
                                        {verificationPackageFailureSummary.topPackages.map((item) => (
                                            <tr key={item.packageName} className="border-t border-slate-100">
                                                <td className="px-3 py-2 break-all font-semibold">{item.packageName}</td>
                                                <td className="px-3 py-2">{item.attempts}</td>
                                                <td className="px-3 py-2 font-black text-rose-700">{item.failed}</td>
                                                <td className="px-3 py-2">{item.hashMismatches}</td>
                                                <td className="px-3 py-2">{item.metadataMismatches}</td>
                                                <td className="px-3 py-2">{item.missingHarnessSnapshots}</td>
                                                <td className="px-3 py-2">{item.invalidJsonFiles}</td>
                                                <td className="px-3 py-2 font-semibold">{item.primaryFailureReason}</td>
                                                <td className="px-3 py-2 leading-relaxed">{getVerificationFailureRecommendedAction(item.primaryFailureReason)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{formatIsoKstTimestamp(item.lastVerifiedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
                            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">최근 검증 수</p>
                                <p className="mt-1 text-sm font-black text-indigo-800">{verificationHistorySummary.total}건</p>
                                <p className="mt-1 text-[11px] font-bold text-indigo-700">세션 내 최근 12건까지 누적합니다.</p>
                            </div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">성공률</p>
                                <p className="mt-1 text-sm font-black text-emerald-800">{verificationHistorySummary.total > 0 ? Math.round((verificationHistorySummary.success / verificationHistorySummary.total) * 100) : 0}%</p>
                                <p className="mt-1 text-[11px] font-bold text-emerald-700">성공 {verificationHistorySummary.success}건 / 실패 {verificationHistorySummary.failed}건</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">해시/스냅샷 이슈</p>
                                <p className="mt-1 text-sm font-black text-amber-800">{verificationHistorySummary.hashMismatches + verificationHistorySummary.missingHarnessSnapshots}건</p>
                                <p className="mt-1 text-[11px] font-bold text-amber-700">해시 {verificationHistorySummary.hashMismatches}건 · 스냅샷 {verificationHistorySummary.missingHarnessSnapshots}건</p>
                            </div>
                            <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">메타 정합성</p>
                                <p className="mt-1 text-sm font-black text-violet-800">{verificationHistorySummary.metadataMismatches}건</p>
                                <p className="mt-1 text-[11px] font-bold text-violet-700">manifest/JSON 비교 누적 결과입니다.</p>
                            </div>
                            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-500">표준 템플릿 적합성</p>
                                <p className="mt-1 text-sm font-black text-sky-800">적합 {verificationHistorySummary.templateConformant}건 · 불일치 {verificationHistorySummary.templateMismatch}건</p>
                                <p className="mt-1 text-[11px] font-bold text-sky-700">히스토리 기준 템플릿 표준 적합 누적입니다.</p>
                            </div>
                        </div>

                        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full min-w-[1080px] text-left text-[11px]">
                                <thead className="bg-slate-50 text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2">시각</th>
                                        <th className="px-3 py-2">Manifest</th>
                                        <th className="px-3 py-2">Package</th>
                                        <th className="px-3 py-2">결과</th>
                                        <th className="px-3 py-2">템플릿 적합</th>
                                        <th className="px-3 py-2">Entries</th>
                                        <th className="px-3 py-2">Hash</th>
                                        <th className="px-3 py-2">Snapshot</th>
                                        <th className="px-3 py-2">Meta Diff</th>
                                        <th className="px-3 py-2">주요 원인</th>
                                        <th className="px-3 py-2">Summary Hash</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700">
                                    {filteredVerificationHistory.map((entry) => (
                                        <tr key={entry.id} className="border-t border-slate-100 align-top">
                                            <td className="px-3 py-2 whitespace-nowrap">{formatIsoKstTimestamp(entry.verifiedAt)}</td>
                                            <td className="px-3 py-2 break-all font-semibold">{entry.manifestFileName}</td>
                                            <td className="px-3 py-2 break-all">{entry.packageName || '-'}</td>
                                            <td className="px-3 py-2">
                                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${entry.isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    {entry.isValid ? 'SUCCESS' : 'FAILED'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${entry.templateConformanceStatus === 'CONFORMANT' ? 'bg-sky-100 text-sky-700' : entry.templateConformanceStatus === 'MISMATCH' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {entry.templateConformanceStatus === 'CONFORMANT' ? '적합' : entry.templateConformanceStatus === 'MISMATCH' ? '불일치' : '미확인'}
                                                </span>
                                                {entry.templateConformanceDescription ? (
                                                    <p className="mt-1 max-w-[220px] break-words text-[10px] font-semibold leading-relaxed text-slate-500">
                                                        {entry.templateConformanceDescription}
                                                    </p>
                                                ) : null}
                                            </td>
                                            <td className="px-3 py-2 font-semibold">{entry.verifiedEntries}/{entry.totalEntries}</td>
                                            <td className="px-3 py-2">{entry.hashMismatches}</td>
                                            <td className="px-3 py-2">{entry.missingHarnessSnapshots}</td>
                                            <td className="px-3 py-2">{entry.metadataMismatches}</td>
                                            <td className="px-3 py-2 font-semibold">{entry.primaryFailureReason}</td>
                                            <td className="px-3 py-2">{entry.packageSummaryHashMatched ? 'YES' : 'NO'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {filteredVerificationHistory.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-500">현재 선택한 실패 원인 또는 package 필터에 해당하는 검증 실행이 없습니다.</p>
                        ) : null}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Manifest 파일 (manifest.json)</label>
                        <input
                            type="file"
                            accept=".json,application/json"
                            onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setVerificationManifestFile(file);
                            }}
                            className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold hover:file:bg-slate-200"
                        />
                        <p className="text-xs text-slate-400 mt-1">선택: {verificationManifestFile?.name || '없음'}</p>
                        {verificationManifestPreviewError ? (
                            <p className="mt-2 text-xs font-bold text-amber-700">{verificationManifestPreviewError}</p>
                        ) : null}
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">JSON 폴더 파일들 (json/*.json)</label>
                        <input
                            type="file"
                            accept=".json,application/json"
                            multiple
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                setVerificationJsonFiles(files);
                            }}
                            className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold hover:file:bg-slate-200"
                        />
                        <p className="text-xs text-slate-400 mt-1">선택: {verificationJsonFiles.length}개</p>
                    </div>
                </div>

                {isDevMode && verificationHarnessMetaSummary && (
                    <div className="space-y-3">
                    {verificationTemplateMismatchWarnings.length > 0 ? (
                        <NoticeCallout
                            variant="amber"
                            title="현재 검증 중인 패키지는 최신 표준 템플릿과 일부 차이가 있습니다."
                            description={verificationTemplateMismatchWarnings.join(' / ')}
                            className="rounded-2xl border px-4 py-3"
                            bodyClassName="block"
                            titleClassName="text-xs font-black"
                            descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                        />
                    ) : null}
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">런 연결 범위</p>
                            <p className="mt-1 text-sm font-black text-indigo-800">{verificationHarnessMetaSummary.linkedRunCount}/{verificationHarnessMetaSummary.totalRecords}건</p>
                            <p className="mt-1 text-[11px] font-bold text-indigo-700">리포트 처리 번호가 연결된 JSON 수입니다.</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">템플릿 버전</p>
                            <p className="mt-1 text-sm font-black text-slate-800">{verificationHarnessMetaSummary.templateVersion}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-600 break-all">Schema {verificationHarnessMetaSummary.jsonSchemaVersion}</p>
                            <p className="mt-1 text-[10px] font-bold text-slate-500 break-all">생성시각 {formatIsoKstTimestamp(verificationHarnessMetaSummary.generatedAt)}</p>
                        </div>
                        <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">프롬프트/정책</p>
                            <p className="mt-1 text-sm font-black text-violet-800">P {verificationHarnessMetaSummary.promptVersions.length} · Policy {verificationHarnessMetaSummary.policyVersions.length}</p>
                            <p className="mt-1 text-[11px] font-bold text-violet-700 break-all">{verificationHarnessMetaSummary.promptVersions[0] || '미기록'} / {verificationHarnessMetaSummary.policyVersions[0] || '미기록'}</p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">룰/오버라이드</p>
                            <p className="mt-1 text-sm font-black text-amber-800">룰 버전 {verificationHarnessMetaSummary.ruleVersions.length}종 · 오버라이드 {verificationHarnessMetaSummary.overrideCount}건</p>
                            <p className="mt-1 text-[11px] font-bold text-amber-700 break-all">{verificationHarnessMetaSummary.ruleVersions.slice(0, 2).join(', ') || '미기록'}</p>
                            <p className="mt-1 text-[10px] font-bold text-amber-600">Critical 룰 {verificationHarnessMetaSummary.criticalRuleCount}건</p>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">승인/감사 스냅샷</p>
                            <p className="mt-1 text-sm font-black text-emerald-800">승인 로그 {verificationHarnessMetaSummary.approvalCount}건</p>
                            <p className="mt-1 text-[11px] font-bold text-emerald-700">안전 기록 스냅샷 포함: {verificationHarnessMetaSummary.harnessAuditSnapshotIncluded ? '예' : '아니오'}</p>
                            <p className="mt-1 text-[10px] font-bold text-emerald-600">README: {verificationHarnessMetaSummary.readmeFileName}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                        <HarnessRuleImpactSummaryPanel
                            title="Rule Impact Summary"
                            summary={verificationRuleImpactSummary}
                            maxVisible={2}
                        />
                        <HarnessVersionChangeSummaryPanel
                            title="Prompt 변경 요약"
                            tone="prompt"
                            lines={verificationHarnessMetaSummary.versionChangeSummary.prompt}
                        />
                        <HarnessVersionChangeSummaryPanel
                            title="Policy 변경 요약"
                            tone="policy"
                            lines={verificationHarnessMetaSummary.versionChangeSummary.policy}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-1">
                        <HarnessVersionChangeSummaryPanel
                            title="Rule 변경 요약"
                            tone="rule"
                            lines={verificationHarnessMetaSummary.versionChangeSummary.rule}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                        <HarnessVersionDetailsPanel
                            title="Prompt 버전 목록"
                            tone="prompt"
                            descriptors={verificationHarnessVersionDetails.prompt}
                        />
                        <HarnessVersionDetailsPanel
                            title="Policy 버전 목록"
                            tone="policy"
                            descriptors={verificationHarnessVersionDetails.policy}
                        />
                        <HarnessVersionDetailsPanel
                            title="Rule 버전 목록"
                            tone="rule"
                            descriptors={verificationHarnessVersionDetails.rule}
                        />
                    </div>

                    {verificationHarnessVersionRows.length > 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">버전 변경 포인트 표</p>
                            <div className="mt-3 overflow-auto">
                                <table className="w-full min-w-[720px] text-left text-[11px]">
                                    <thead className="text-slate-500">
                                        <tr>
                                            <th className="py-2 pr-3">Category</th>
                                            <th className="py-2 pr-3">Version</th>
                                            <th className="py-2 pr-3">Previous</th>
                                            <th className="py-2 pr-3">Released</th>
                                            <th className="py-2 pr-3">Summary</th>
                                            <th className="py-2 pr-3">Change Points</th>
                                        </tr>
                                    </thead>
                                    <tbody className="align-top text-slate-700">
                                        {verificationHarnessVersionRows.map((descriptor) => (
                                            <tr key={`${descriptor.category}-${descriptor.version}`} className="border-t border-slate-100">
                                                <td className="py-2 pr-3 font-black uppercase">{descriptor.category}</td>
                                                <td className="py-2 pr-3 font-black break-all">{descriptor.version}</td>
                                                <td className="py-2 pr-3 break-all">{descriptor.previousVersion || '-'}</td>
                                                <td className="py-2 pr-3">{descriptor.releasedAt}</td>
                                                <td className="py-2 pr-3 leading-relaxed">{descriptor.summary}</td>
                                                <td className="py-2 pr-3 leading-relaxed">
                                                    {descriptor.changesFromPrevious && descriptor.changesFromPrevious.length > 0
                                                        ? descriptor.changesFromPrevious.join(' / ')
                                                        : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}
                    </div>
                )}

                {verificationSummary && verificationResult && (
                    <div className={`rounded-xl border px-4 py-3 ${verificationResult.isValid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                        <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                            <p className={`text-xs font-black ${verificationResult.isValid ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {verificationResult.isValid ? '검증 성공' : `검증 ${BRAND_STATUS_LABELS.attention}`}
                            </p>
                            {verificationTemplateConformance ? (
                                <StatusBadge variant={verificationTemplateConformance.variant} className="px-2.5 py-1 text-[10px] font-black">
                                    {verificationTemplateConformance.label}
                                </StatusBadge>
                            ) : null}
                        </div>
                        <pre className="text-xs whitespace-pre-wrap text-slate-700 font-semibold">{verificationSummary}</pre>

                        {verificationTemplateConformance ? (
                            <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-600">
                                {verificationTemplateConformance.description}
                            </p>
                        ) : null}

                        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-5">
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Hash Check</p>
                                <p className="mt-1 text-sm font-black text-slate-800">{verificationResult.hashMismatches.length}건</p>
                                <p className="text-[11px] text-slate-500">JSON SHA-256 불일치 수</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Missing JSON</p>
                                <p className="mt-1 text-sm font-black text-slate-800">{verificationResult.missingJsonFiles.length}건</p>
                                <p className="text-[11px] text-slate-500">manifest에 있으나 업로드되지 않은 파일</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Invalid JSON</p>
                                <p className="mt-1 text-sm font-black text-slate-800">{verificationResult.invalidJsonFiles.length}건</p>
                                <p className="text-[11px] text-slate-500">파싱 불가능한 JSON 파일 수</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Harness Snapshot</p>
                                <p className="mt-1 text-sm font-black text-slate-800">{verificationResult.missingHarnessSnapshots.length}건</p>
                                <p className="text-[11px] text-slate-500">manifest 메타 대비 스냅샷 누락 수</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Meta Diff</p>
                                <p className="mt-1 text-sm font-black text-slate-800">{verificationResult.metadataMismatches.length}건</p>
                                <p className="text-[11px] text-slate-500">manifest와 JSON 메타 불일치 수</p>
                            </div>
                        </div>

                        {!verificationResult.isValid && (
                            <div className="mt-3 space-y-3">
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                    <p className="text-[11px] font-black text-slate-700 mb-1">패키지 요약 해시 비교</p>
                                    <p className="text-[11px] text-slate-600 break-all">기대값: {verificationResult.packageSummaryHashExpected || 'N/A'}</p>
                                    <p className="text-[11px] text-slate-600 break-all">실제값: {verificationResult.packageSummaryHashActual || 'N/A'}</p>
                                </div>

                                {verificationResult.missingJsonFiles.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[11px] font-black text-slate-700 mb-2">누락 JSON 파일</p>
                                        <div className="max-h-32 overflow-auto">
                                            <table className="w-full text-[11px] text-left">
                                                <thead className="text-slate-500">
                                                    <tr>
                                                        <th className="py-1 pr-2">파일 경로</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {verificationResult.missingJsonFiles.slice(0, 30).map((filePath) => (
                                                        <tr key={filePath}>
                                                            <td className="py-1 pr-2 break-all">{filePath}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {verificationResult.missingJsonFiles.length > 30 && (
                                            <p className="text-[11px] text-slate-500 mt-1">... 외 {verificationResult.missingJsonFiles.length - 30}건</p>
                                        )}
                                    </div>
                                )}

                                {verificationResult.invalidJsonFiles.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[11px] font-black text-slate-700 mb-2">파싱 불가 JSON 파일</p>
                                        <div className="max-h-32 overflow-auto">
                                            <table className="w-full text-[11px] text-left">
                                                <thead className="text-slate-500">
                                                    <tr>
                                                        <th className="py-1 pr-2">파일 경로</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {verificationResult.invalidJsonFiles.slice(0, 30).map((filePath) => (
                                                        <tr key={filePath}>
                                                            <td className="py-1 pr-2 break-all">{filePath}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {verificationResult.invalidJsonFiles.length > 30 && (
                                            <p className="text-[11px] text-slate-500 mt-1">... 외 {verificationResult.invalidJsonFiles.length - 30}건</p>
                                        )}
                                    </div>
                                )}

                                {verificationResult.hashMismatches.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[11px] font-black text-slate-700 mb-2">JSON 해시 불일치</p>
                                        <div className="max-h-40 overflow-auto">
                                            <table className="w-full text-[11px] text-left">
                                                <thead className="text-slate-500">
                                                    <tr>
                                                        <th className="py-1 pr-2">파일</th>
                                                        <th className="py-1 pr-2">기대 해시</th>
                                                        <th className="py-1 pr-2">실제 해시</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {verificationResult.hashMismatches.slice(0, 20).map((mismatch) => (
                                                        <tr key={mismatch.jsonFile}>
                                                            <td className="py-1 pr-2 break-all">{mismatch.jsonFile}</td>
                                                            <td className="py-1 pr-2 break-all">{mismatch.expectedSha256}</td>
                                                            <td className="py-1 pr-2 break-all">{mismatch.actualSha256}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {verificationResult.hashMismatches.length > 20 && (
                                            <p className="text-[11px] text-slate-500 mt-1">... 외 {verificationResult.hashMismatches.length - 20}건</p>
                                        )}
                                    </div>
                                )}

                                {verificationResult.missingHarnessSnapshots.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[11px] font-black text-slate-700 mb-2">안전 기록 스냅샷 누락</p>
                                        <div className="max-h-32 overflow-auto">
                                            <table className="w-full text-[11px] text-left">
                                                <thead className="text-slate-500">
                                                    <tr>
                                                        <th className="py-1 pr-2">파일 경로</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {verificationResult.missingHarnessSnapshots.slice(0, 30).map((filePath) => (
                                                        <tr key={filePath}>
                                                            <td className="py-1 pr-2 break-all">{filePath}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {verificationResult.missingHarnessSnapshots.length > 30 && (
                                            <p className="text-[11px] text-slate-500 mt-1">... 외 {verificationResult.missingHarnessSnapshots.length - 30}건</p>
                                        )}
                                    </div>
                                )}

                                {verificationResult.metadataMismatches.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[11px] font-black text-slate-700 mb-2">Manifest / JSON 메타 불일치</p>
                                        <div className="max-h-48 overflow-auto">
                                            <table className="w-full min-w-[760px] text-[11px] text-left">
                                                <thead className="text-slate-500">
                                                    <tr>
                                                        <th className="py-1 pr-2">파일</th>
                                                        <th className="py-1 pr-2">필드</th>
                                                        <th className="py-1 pr-2">기대값</th>
                                                        <th className="py-1 pr-2">실제값</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {verificationResult.metadataMismatches.slice(0, 30).map((mismatch, index) => (
                                                        <tr key={`${mismatch.jsonFile}-${mismatch.field}-${index}`}>
                                                            <td className="py-1 pr-2 break-all">{mismatch.jsonFile}</td>
                                                            <td className="py-1 pr-2 break-all font-bold">{mismatch.field}</td>
                                                            <td className="py-1 pr-2 break-all">{mismatch.expected}</td>
                                                            <td className="py-1 pr-2 break-all">{mismatch.actual}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {verificationResult.metadataMismatches.length > 30 && (
                                            <p className="text-[11px] text-slate-500 mt-1">... 외 {verificationResult.metadataMismatches.length - 30}건</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            )}

            {/* Hidden Rendering Area for Bulk Generation */}
            <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -50, width: '210mm', minHeight: '297mm', pointerEvents: 'none', visibility: isGenerating ? 'visible' : 'hidden' }}>
                {isGenerating && generatingRecord && (
                    <Suspense fallback={<ReportTemplateFallback compact />}>
                        <ReportTemplate record={generatingRecord} history={generatingHistory} ref={bulkReportRef} />
                    </Suspense>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col relative">
                {filteredRecords.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
                        <EmptyState
                            title="생성할 리포트 대상이 없습니다"
                            description="선택한 조건에 맞는 근로자 기록이 없습니다. 필터를 조정한 뒤 다시 확인해 주세요."
                            tone="info"
                            className="w-full max-w-2xl"
                        />
                    </div>
                ) : viewMode === 'list' ? (
                    /* VIEW MODE: LIST */
                    <>
                        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap justify-between items-start gap-2">
                            <div>
                                <h3 className="font-black text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
                                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                    생성 대상 목록 ({filteredRecords.length}명)
                                </h3>
                                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">필터 조건에 맞는 대상을 확인하고 목록 또는 미리보기로 이어서 작업합니다.</p>
                            </div>
                        </div>
                        <div className="border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                            <InterpretationCardGrid
                                items={viewInterpretationCards}
                                cardClassName="rounded-2xl border p-4"
                            />
                            {isDevMode && (
                                <div className="mt-4">
                                    <InterpretationCardGrid
                                        items={harnessReportOperationalCards}
                                        cardClassName="rounded-2xl border p-4"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="overflow-y-auto flex-1 p-0 custom-scrollbar">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-300 font-bold uppercase text-xs sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-6 py-3">이름</th>
                                        <th className="px-6 py-3">직종 (Team)</th>
                                        <th className="px-6 py-3">안전점수</th>
                                        <th className="px-6 py-3">등급</th>
                                        {isDevMode && <th className="px-6 py-3">안전 기록 상태</th>}
                                        <th className="px-6 py-3">주요 취약점</th>
                                        <th className="px-6 py-3 text-right">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {filteredRecords.map((r, idx) => {
                                        const workflowState = inferHarnessWorkflowState(r);
                                        const riskDecision = inferHarnessRiskDecision(r);
                                        const approvalState = inferHarnessApprovalState(r, workflowState);
                                        const persistenceState = getHarnessPersistenceState(r);

                                        return (
                                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer" onClick={() => { setViewMode('preview'); setPreviewIndex(idx); }}>
                                            <td className="px-6 py-3 font-bold text-slate-800 dark:text-slate-100">{r.name}</td>
                                            <td className="px-6 py-3 text-slate-600 dark:text-slate-300">{r.jobField}</td>
                                            <td className="px-6 py-3 font-black text-indigo-600">{r.safetyScore}</td>
                                            <td className="px-6 py-3">
                                                {(() => {
                                                    const safetyLevel = getSafetyLevelFromScore(Number(r.safetyScore));
                                                    return (
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    safetyLevel === '고급' ? 'bg-green-100 text-green-700' :
                                                    safetyLevel === '중급' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {safetyLevel}
                                                </span>
                                                    );
                                                })()}
                                            </td>
                                            {isDevMode && (
                                                <td className="px-6 py-3">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <StatusBadge variant={getHarnessWorkflowBadgeVariant(workflowState)} className="px-2 py-1">{getHarnessWorkflowStateLabel(workflowState)}</StatusBadge>
                                                        <StatusBadge variant={getHarnessRiskBadgeVariant(riskDecision)} className="px-2 py-1">{getHarnessRiskDecisionLabel(riskDecision)}</StatusBadge>
                                                        <StatusBadge variant={getHarnessApprovalBadgeVariant(approvalState)} className="px-2 py-1">{getHarnessApprovalStateLabel(approvalState)}</StatusBadge>
                                                        <StatusBadge variant={getHarnessPersistenceBadgeVariant(persistenceState)} className="px-2 py-1">{getHarnessPersistenceLabel(persistenceState)}</StatusBadge>
                                                    </div>
                                                    {r.workflowRunId ? <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">Run {r.workflowRunId}</p> : null}
                                                    {r.harnessPersistenceWarning ? <p className="mt-1 text-[11px] font-bold text-amber-700">{r.harnessPersistenceWarning}</p> : null}
                                                </td>
                                            )}
                                            <td className="px-6 py-3 text-slate-500 dark:text-slate-400 truncate max-w-xs">{r.weakAreas.join(', ')}</td>
                                            <td className="px-6 py-3 text-right">
                                                <button onClick={(e) => { e.stopPropagation(); setViewMode('preview'); setPreviewIndex(idx); }} className="text-xs font-bold text-indigo-600 hover:underline">
                                                    미리보기
                                                </button>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    /* VIEW MODE: PREVIEW */
                    <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900">
                        {/* Preview Toolbar */}
                        <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm z-20">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={handlePrev} 
                                    disabled={previewIndex === 0}
                                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <svg className="w-6 h-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">{previewIndex + 1} / {filteredRecords.length}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-300 font-bold">{currentPreviewRecord?.name}</p>
                                </div>
                                <button 
                                    onClick={handleNext} 
                                    disabled={previewIndex === filteredRecords.length - 1}
                                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <svg className="w-6 h-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                            
                            <div className="flex gap-2">
                                {isDevMode && currentPreviewHarnessMeta && (
                                    <div className="hidden xl:flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2">
                                        <StatusBadge variant={getHarnessWorkflowBadgeVariant(currentPreviewHarnessMeta.workflowState)} className="px-2 py-1">{getHarnessWorkflowStateLabel(currentPreviewHarnessMeta.workflowState)}</StatusBadge>
                                        <StatusBadge variant={getHarnessRiskBadgeVariant(currentPreviewHarnessMeta.riskDecision)} className="px-2 py-1">{getHarnessRiskDecisionLabel(currentPreviewHarnessMeta.riskDecision)}</StatusBadge>
                                        <StatusBadge variant={getHarnessApprovalBadgeVariant(currentPreviewHarnessMeta.approvalState)} className="px-2 py-1">{getHarnessApprovalStateLabel(currentPreviewHarnessMeta.approvalState)}</StatusBadge>
                                        <StatusBadge variant={getHarnessPersistenceBadgeVariant(currentPreviewHarnessMeta.persistenceState)} className="px-2 py-1">{getHarnessPersistenceLabel(currentPreviewHarnessMeta.persistenceState)}</StatusBadge>
                                    </div>
                                )}
                                <button 
                                    onClick={handleDownloadCurrent}
                                    disabled={hasCustomDateRangeError}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-colors ${hasCustomDateRangeError ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    현재 보고서 내보내기
                                </button>
                            </div>
                        </div>

                        <div className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                            <InterpretationCardGrid
                                items={viewInterpretationCards}
                                cardClassName="rounded-2xl border p-4"
                            />
                            {isDevMode && currentPreviewRecord && currentPreviewHarnessMeta && (
                                <div className="mt-4 space-y-3">
                                    <NoticeCallout
                                        variant={currentPreviewHarnessMeta.persistenceState === 'fallback' ? 'amber' : currentPreviewHarnessMeta.riskDecision === 'IMMEDIATE_ATTENTION' || currentPreviewHarnessMeta.riskDecision === 'CRITICAL_STOP' ? 'rose' : 'white'}
                                        eyebrow="리포트 보호 맥락"
                                        title={`${currentPreviewRecord.name} 보고서는 안전 기록 판단 상태와 함께 읽을 수 있습니다.`}
                                        description={currentPreviewRecord.workflowRunId
                                            ? `리포트 처리 번호 ${currentPreviewRecord.workflowRunId} 기준으로 보고서 근거를 추적할 수 있습니다.`
                                            : '아직 리포트 처리 번호 연결 전 단계이므로 저장 연결 상태를 먼저 확인한 뒤 보고서 해석을 이어가세요.'}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge variant={getHarnessWorkflowBadgeVariant(currentPreviewHarnessMeta.workflowState)} className="px-3 py-1.5 text-[11px] font-black">{getHarnessWorkflowStateLabel(currentPreviewHarnessMeta.workflowState)}</StatusBadge>
                                        <StatusBadge variant={getHarnessRiskBadgeVariant(currentPreviewHarnessMeta.riskDecision)} className="px-3 py-1.5 text-[11px] font-black">{getHarnessRiskDecisionLabel(currentPreviewHarnessMeta.riskDecision)}</StatusBadge>
                                        <StatusBadge variant={getHarnessApprovalBadgeVariant(currentPreviewHarnessMeta.approvalState)} className="px-3 py-1.5 text-[11px] font-black">{getHarnessApprovalStateLabel(currentPreviewHarnessMeta.approvalState)}</StatusBadge>
                                        <StatusBadge variant={getHarnessPersistenceBadgeVariant(currentPreviewHarnessMeta.persistenceState)} className="px-3 py-1.5 text-[11px] font-black">{getHarnessPersistenceLabel(currentPreviewHarnessMeta.persistenceState)}</StatusBadge>
                                        {currentPreviewRecord.workflowRunId ? <StatusBadge variant="slateSoft" className="px-3 py-1.5 text-[11px] font-black">Run {currentPreviewRecord.workflowRunId}</StatusBadge> : null}
                                        {currentPreviewRecord.evidenceHash ? <StatusBadge variant="violetSoft" className="px-3 py-1.5 text-[11px] font-black">Evidence Hash 연결</StatusBadge> : null}
                                    </div>
                                    {currentPreviewRecord.harnessPersistenceWarning ? (
                                        <p className="text-xs font-bold text-amber-700">{currentPreviewRecord.harnessPersistenceWarning}</p>
                                    ) : null}
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">승인 이력</p>
                                            <p className="mt-1 text-xs font-black text-slate-700">{previewWorkflowStatus?.approvals?.length ?? (currentPreviewRecord.approvalHistory || []).length}건</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">감사 이벤트</p>
                                            <p className="mt-1 text-xs font-black text-slate-700">{previewWorkflowStatus?.timeline?.length ?? (currentPreviewRecord.auditTrail || []).length}건</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">2차 재분석</p>
                                            <p className="mt-1 text-xs font-black text-slate-700">{previewWorkflowStatus?.secondPassStatus || currentPreviewRecord.secondPassStatus || '미지정'}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">증빙 해시</p>
                                            <p className="mt-1 text-xs font-black text-slate-700 truncate">{currentPreviewRecord.evidenceHash || '없음'}</p>
                                        </div>
                                        <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-500">오버라이드 로그</p>
                                            <p className="mt-1 text-xs font-black text-slate-700">{previewWorkflowStatus?.overrides?.length ?? 0}건</p>
                                        </div>
                                        <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">프롬프트 버전</p>
                                            <p className="mt-1 text-xs font-black text-slate-700 break-all">{currentPreviewHarnessVersions.promptVersion}</p>
                                        </div>
                                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">정책 버전</p>
                                            <p className="mt-1 text-xs font-black text-slate-700 break-all">{currentPreviewHarnessVersions.policyVersion}</p>
                                        </div>
                                        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 md:col-span-2 xl:col-span-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">룰 버전</p>
                                            <p className="mt-1 text-xs font-black text-slate-700 break-all">{currentPreviewHarnessVersions.ruleVersion}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={handleLoadPreviewStatus}
                                            disabled={!currentPreviewRecord || isPreviewStatusPending}
                                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-black ${(!currentPreviewRecord || isPreviewStatusPending) ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                        >
                                            {isPreviewStatusPending ? '조회 중…' : '상태 조회'}
                                        </button>
                                        <p className="text-[11px] font-bold text-slate-500">선택한 항목의 현재 상태를 확인합니다.</p>
                                    </div>
                                    {!hasPreviewStatusFetched ? (
                                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">아직 상태를 조회하지 않았습니다. 필요 시 버튼을 눌러 확인해 주세요.</p>
                                    ) : null}
                                    {previewWorkflowStatusLoading ? (
                                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">안전 기록 버전 스냅샷을 불러오는 중입니다.</p>
                                    ) : null}
                                    {previewWorkflowStatusError ? (
                                        <p className="text-[11px] font-bold text-amber-700">{previewWorkflowStatusError}</p>
                                    ) : null}
                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
                                        <NoticeCallout
                                            variant={currentPreviewApprovalNarrative.tone.includes('emerald') ? 'emerald' : currentPreviewApprovalNarrative.tone.includes('amber') ? 'amber' : 'white'}
                                            eyebrow="최신 승인 Diff"
                                            title={currentPreviewApprovalNarrative.title}
                                            description={currentPreviewApprovalNarrative.description}
                                        />
                                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Analyzer / Evaluator</p>
                                            <p className="mt-2 text-sm font-black text-indigo-800">{currentPreviewAnalysisNarrative.analyzerTitle}</p>
                                            <p className="mt-1 text-xs font-bold leading-relaxed text-indigo-700">{currentPreviewAnalysisNarrative.analyzerDescription}</p>
                                            <p className="mt-3 text-sm font-black text-violet-800">{currentPreviewAnalysisNarrative.evaluatorTitle}</p>
                                            <p className="mt-1 text-xs font-bold leading-relaxed text-violet-700">{currentPreviewAnalysisNarrative.evaluatorDescription}</p>
                                        </div>
                                        <HarnessRuleImpactSummaryPanel
                                            title="Override Summary"
                                            summary={currentPreviewRuleImpactSummary}
                                            className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4"
                                            maxVisible={2}
                                        />
                                        <div className={`rounded-2xl border p-4 ${currentPreviewGovernanceNarrative.tone}`}>
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Report Governance Narrative</p>
                                            <p className="mt-2 text-sm font-black text-slate-800">{currentPreviewGovernanceNarrative.title}</p>
                                            <p className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{currentPreviewGovernanceNarrative.description}</p>
                                            <p className="mt-3 text-[11px] font-black text-slate-600">{currentPreviewGovernanceNarrative.action}</p>
                                        </div>
                                        <div className={`rounded-2xl border p-4 ${currentPreviewTransitionNarrative.tone}`}>
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Action Readiness</p>
                                            <p className="mt-2 text-sm font-black text-slate-800">{currentPreviewTransitionNarrative.title}</p>
                                            <p className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{currentPreviewTransitionNarrative.description}</p>
                                            <p className="mt-3 text-[11px] font-black text-slate-600">{currentPreviewTransitionNarrative.action}</p>
                                            {currentPreviewTransitionActionLines.length > 0 ? (
                                                <div className="mt-3 space-y-1">
                                                    {currentPreviewTransitionActionLines.map((line) => (
                                                        <p key={line.key} className="text-[11px] font-semibold leading-relaxed text-slate-700">• {line.text}</p>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                                                <NoticeCallout
                                                    variant={currentPreviewTransitionGuide.variant}
                                                    eyebrow="권장 실행 가이드"
                                                    title={currentPreviewTransitionGuide.title}
                                                    description={currentPreviewTransitionGuide.description}
                                                    className="rounded-2xl border px-4 py-4"
                                                    bodyClassName="block"
                                                    eyebrowClassName="text-[11px] font-black"
                                                    titleClassName="mt-1 text-xs font-bold"
                                                    descriptionClassName="mt-1 text-[11px] font-semibold leading-relaxed"
                                                />
                                                <NextActionChecklist
                                                    title="액션 실행 전 체크"
                                                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                                                    titleClassName="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"
                                                    listClassName="space-y-2 text-[11px] font-bold leading-relaxed text-slate-700"
                                                    itemClassName="flex items-start gap-2"
                                                    bulletClassName="mt-[2px] text-indigo-500"
                                                    items={currentPreviewTransitionGuide.checklistItems}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {(currentPreviewVersionDetails.prompt.length > 0 || currentPreviewVersionDetails.policy.length > 0 || currentPreviewVersionDetails.rule.length > 0) ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                                <HarnessVersionChangeSummaryPanel title="Prompt 변경 요약" tone="prompt" lines={currentPreviewVersionChangeSummary.prompt} />
                                                <HarnessVersionChangeSummaryPanel title="Policy 변경 요약" tone="policy" lines={currentPreviewVersionChangeSummary.policy} />
                                                <HarnessVersionChangeSummaryPanel title="Rule 변경 요약" tone="rule" lines={currentPreviewVersionChangeSummary.rule} />
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                                <HarnessVersionDetailsPanel title="Prompt 버전 설명" tone="prompt" descriptors={currentPreviewVersionDetails.prompt} />
                                                <HarnessVersionDetailsPanel title="Policy 버전 설명" tone="policy" descriptors={currentPreviewVersionDetails.policy} />
                                                <HarnessVersionDetailsPanel title="Rule 버전 설명" tone="rule" descriptors={currentPreviewVersionDetails.rule} />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        {/* Preview Content Area */}
                        <div className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900 p-4 md:p-6 xl:p-8 custom-scrollbar">
                            {currentPreviewRecord && (
                                <div className="mx-auto flex w-full max-w-[calc(210mm+20px)] min-w-fit justify-center">
                                    <div className="w-full rounded-[20px] border border-slate-200 bg-white p-2 shadow-lg">
                                        <div className="overflow-auto max-h-[calc(100vh-240px)] rounded-xl bg-white p-1 custom-scrollbar">
                                            <div className="mx-auto flex min-w-fit justify-center">
                                                <div className="min-w-[210mm] origin-top bg-white">
                                                    <Suspense fallback={<ReportTemplateFallback />}>
                                                        <ReportTemplate 
                                                            ref={previewRef}
                                                            record={currentPreviewRecord} 
                                                            history={currentPreviewHistory} 
                                                        />
                                                    </Suspense>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;
