
import React, { useState, useEffect, useMemo } from 'react';
import type { AppSettings, WorkerRecord } from '../types';
import { getIsPaidApiMode, setIsPaidApiMode } from '../utils/apiModeUtils';
import { PSI_APP_VERSION, PSI_SYSTEM_NAME } from '../lib/appInfo';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { NoticeCallout } from '../components/shared/NoticeCallout';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { extractMessage } from '../utils/errorUtils';
import { BRAND_TONE } from '../utils/brandToneTokens';
import {
    fetchHarnessPersistenceHealth,
    fetchHarnessWorkflowStatus,
    type HarnessPersistenceHealth,
    type HarnessWorkflowDiagnostics,
} from '../services/harnessService';
import { getStoredTheme, getResolvedTheme, setTheme, watchSystemThemeChange, THEME_CHANGED_EVENT, type ThemeMode } from '../utils/themeUtils';
import type { UIViewMetricRecord } from '../utils/uiViewModeMetrics';

const TRAINING_LANGUAGE_OPTIONS = [
    { code: 'ko-KR', label: '한국어 (ko-KR)' },
    { code: 'en-US', label: '영어 (en-US)' },
    { code: 'vi-VN', label: '베트남어 (vi-VN)' },
    { code: 'cmn-CN', label: '중국어 (cmn-CN)' },
    { code: 'th-TH', label: '태국어 (th-TH)' },
    { code: 'id-ID', label: '인도네시아어 (id-ID)' },
    { code: 'ms-MY', label: '말레이시아어 (ms-MY)' },
    { code: 'uz-UZ', label: '우즈베크어 (uz-UZ)' },
    { code: 'mn-MN', label: '몽골어 (mn-MN)' },
    { code: 'km-KH', label: '크메르어 (km-KH)' },
    { code: 'ru-RU', label: '러시아어 (ru-RU)' },
    { code: 'kk-KZ', label: '카자흐어 (kk-KZ)' },
    { code: 'ne-NP', label: '네팔어 (ne-NP)' },
    { code: 'my-MM', label: '미얀마어 (my-MM)' },
    { code: 'fil-PH', label: '필리핀어 (fil-PH)' },
    { code: 'hi-IN', label: '힌디어 (hi-IN)' },
    { code: 'bn-BD', label: '벵골어 (bn-BD)' },
    { code: 'ur-PK', label: '우르두어 (ur-PK)' },
    { code: 'si-LK', label: '싱할라어 (si-LK)' },
] as const;

const CURRENT_SITE_LANGUAGE_SET = [
    'ko-KR',
    'vi-VN',
    'cmn-CN',
    'mn-MN',
    'id-ID',
    'ms-MY',
    'ru-RU',
    'kk-KZ',
    'uz-UZ',
    'th-TH',
    'km-KH',
    'my-MM',
] as const;

const VALID_TRAINING_LANGUAGE_CODES = new Set(TRAINING_LANGUAGE_OPTIONS.map((item) => item.code));

const normalizeTrainingLanguagePreset = (input?: string[]): string[] => {
    if (!Array.isArray(input)) return [...CURRENT_SITE_LANGUAGE_SET];

    const normalized = Array.from(new Set(input.filter((code) => VALID_TRAINING_LANGUAGE_CODES.has(code))));
    if (normalized.length === 0) return [...CURRENT_SITE_LANGUAGE_SET];
    return normalized;
};

const toFiniteOr = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const isManagementRole = (field: string) => /관리|팀장|부장|과장|기사|공무|소장/.test(field);
const UI_VIEW_MODE_METRICS_KEY = 'psi_view_mode_metrics';
const PRESET_PINNED_SOURCE_TARGET_RATE = 60;

const getWorkerIdentityKey = (record: WorkerRecord): string => {
    return String(
        record.worker_uuid
        || record.workerUuid
        || record.employeeId
        || record.qrId
        || `${record.name || 'unknown'}::${record.teamLeader || '미지정'}::${record.jobField || '미분류'}`,
    ).trim();
};

const inferHarnessWorkflowState = (record: Partial<WorkerRecord>): string => {
    if (record.workflowState) return record.workflowState;
    if (record.secondPassStatus === 'IN_PROGRESS') return 'second_pass_analyzing';
    if (record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING') return 'awaiting_manager_approval';
    if (record.ocrErrorType || record.secondPassStatus === 'NEEDED') return 'manual_review_required';
    if (record.secondPassStatus === 'DONE' || record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'completed';
    return 'uploaded';
};

const inferHarnessRiskDecision = (record: Partial<WorkerRecord>): string => {
    if (record.riskDecision) return record.riskDecision;
    if (record.ocrErrorType) return 'IMMEDIATE_ATTENTION';
    if (record.secondPassStatus === 'NEEDED') return 'SUPPLEMENTARY_REVIEW';
    return 'SAFE_TO_PROCEED';
};

const inferHarnessApprovalState = (record: Partial<WorkerRecord>, workflowState: string): string => {
    if (record.approvalState) return record.approvalState;
    if (record.reviewStatus === 'REJECTED') return 'REJECTED';
    if (record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'APPROVED';
    if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') return 'PENDING';
    return 'NOT_REQUIRED';
};

const getHarnessPersistenceState = (record: Partial<WorkerRecord>): 'connected' | 'fallback' | 'pending' => {
    if (String(record.harnessPersistenceWarning || '').trim()) return 'fallback';
    if (String(record.workflowRunId || '').trim()) return 'connected';
    return 'pending';
};

const summarizeHarnessRecords = (records: WorkerRecord[]) => {
    const latestRecords = Array.from(
        records.reduce((map, record) => {
            const key = getWorkerIdentityKey(record);
            const current = map.get(key);
            if (!current || new Date(record.date).getTime() >= new Date(current.date).getTime()) {
                map.set(key, record);
            }
            return map;
        }, new Map<string, WorkerRecord>()).values(),
    );

    return latestRecords.reduce((summary, record) => {
        const workflowState = inferHarnessWorkflowState(record);
        const riskDecision = inferHarnessRiskDecision(record);
        const approvalState = inferHarnessApprovalState(record, workflowState);
        const persistenceState = getHarnessPersistenceState(record);

        summary.total += 1;
        if (String(record.workflowRunId || '').trim()) summary.runLinked += 1;
        if (persistenceState === 'connected') summary.connected += 1;
        if (persistenceState === 'fallback') summary.fallback += 1;
        if (persistenceState === 'pending') summary.pending += 1;
        if (approvalState === 'PENDING' || approvalState === 'REQUIRED') summary.approvalBacklog += 1;
        if (workflowState === 'manual_review_required' || workflowState === 'awaiting_manager_approval' || workflowState === 'second_pass_analyzing') summary.reviewNeeded += 1;
        if (riskDecision === 'IMMEDIATE_ATTENTION' || riskDecision === 'CRITICAL_STOP') summary.immediateAttention += 1;
        return summary;
    }, {
        total: 0,
        runLinked: 0,
        connected: 0,
        fallback: 0,
        pending: 0,
        approvalBacklog: 0,
        reviewNeeded: 0,
        immediateAttention: 0,
    });
};

type HarnessProbeResult = {
    status: 'idle' | 'loading' | 'success' | 'error';
    diagnostics?: HarnessWorkflowDiagnostics;
    message?: string;
    warning?: string | null;
    workflowState?: string;
    riskDecision?: string;
    approvalState?: string;
    overrideCount?: number;
    criticalRuleCount?: number;
    ruleImpactNarrative?: string;
    ruleImpactRuleCodes?: string[];
    checkedAt?: string;
};

type HarnessHealthState = {
    status: 'idle' | 'loading' | 'success' | 'error';
    data?: HarnessPersistenceHealth;
    message?: string;
};

const downloadTextFile = (fileName: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
};

interface SettingsProps {
    workerRecords?: WorkerRecord[];
}

// [Guide Component] CSS-based Infographics for Beginners
const SettingsGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    return (
        <div className="bg-white rounded-[30px] p-8 md:p-10 shadow-2xl border border-indigo-100 mb-10 relative animate-fade-in-up overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400"></div>
            <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="text-center mb-10">
                <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-3 inline-block">Beginner's Guide</span>
                <h3 className="text-3xl font-black text-slate-900">3단계로 끝내는 시스템 설정</h3>
                <p className="text-slate-500 mt-2 font-medium">복잡해 보이지만 아주 간단합니다. 아래 그림을 따라 순서대로 진행해보세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-1 bg-slate-100 -z-10"></div>

                {/* Step 1: API Key */}
                <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-lg hover:border-indigo-200 transition-all group text-center relative">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl font-black mx-auto mb-4 shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">1</div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">AI 두뇌 연결하기</h4>
                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        Google의 AI(Gemini)를 사용하려면<br/>
                        <span className="text-indigo-600 font-bold">'전용 열쇠(API Key)'</span>가 필요합니다.
                    </p>
                    
                    {/* Visual: Key -> Cloud */}
                    <div className="h-24 bg-slate-50 rounded-2xl flex items-center justify-center gap-4 border border-slate-100 mb-4 px-4">
                        <div className="flex flex-col items-center">
                            <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-white shadow-sm">🔑</div>
                            <span className="text-[9px] font-bold text-slate-400 mt-1">Key 발급</span>
                        </div>
                        <div className="flex-1 h-1 bg-slate-200 rounded-full relative overflow-hidden">
                            <div className="absolute top-0 left-0 h-full w-1/2 bg-indigo-400 animate-[shimmer_1s_infinite]"></div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 bg-white border-2 border-indigo-100 rounded-full flex items-center justify-center text-xl shadow-sm">🧠</div>
                            <span className="text-[9px] font-bold text-slate-400 mt-1">PSI 시스템</span>
                        </div>
                    </div>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="block w-full py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors">
                        Google에서 키 발급받기 →
                    </a>
                </div>

                {/* Step 2: Site Info */}
                <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-lg hover:border-indigo-200 transition-all group text-center">
                    <div className="w-12 h-12 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl flex items-center justify-center text-xl font-black mx-auto mb-4 group-hover:border-indigo-400 group-hover:text-indigo-500 transition-colors">2</div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">현장 명찰 만들기</h4>
                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        입력하신 현장명과 관리자 이름은<br/>
                        <span className="text-indigo-600 font-bold">모든 리포트의 헤더와 인증서</span>에 인쇄됩니다.
                    </p>

                    {/* Visual: Input -> Report Header */}
                    <div className="h-24 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100 mb-4 p-3 relative overflow-hidden">
                        <div className="w-full bg-white border border-slate-200 p-2 rounded-lg shadow-sm mb-2 scale-90 origin-bottom">
                            <div className="h-2 w-1/3 bg-slate-200 rounded mb-1"></div>
                            <div className="h-1 w-1/2 bg-slate-100 rounded"></div>
                        </div>
                        <div className="text-indigo-500">▼</div>
                        <div className="w-full bg-white border border-slate-200 p-2 rounded-lg shadow-md scale-100 z-10 flex justify-between items-center">
                            <div className="text-[8px] font-bold text-slate-800">OO건설 리포트</div>
                            <div className="text-[6px] text-slate-400">Manager: 홍길동</div>
                        </div>
                    </div>
                </div>

                {/* Step 3: Job Fields */}
                <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-lg hover:border-indigo-200 transition-all group text-center">
                    <div className="w-12 h-12 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl flex items-center justify-center text-xl font-black mx-auto mb-4 group-hover:border-indigo-400 group-hover:text-indigo-500 transition-colors">3</div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">우리 팀 등록하기</h4>
                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        현장에 존재하는 공종들을 쉼표(,)로 구분해 적으면<br/>
                        <span className="text-indigo-600 font-bold">선택 메뉴(Dropdown)</span>가 자동으로 생성됩니다.
                    </p>

                    {/* Visual: Text -> Dropdown */}
                    <div className="h-24 bg-slate-50 rounded-2xl flex items-center justify-center gap-2 border border-slate-100 mb-4 px-2">
                        <div className="bg-white px-2 py-1 rounded border border-slate-200 text-[8px] text-slate-400">철근, 타설, 전기</div>
                        <div className="text-indigo-400">→</div>
                        <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-md text-[10px] font-bold flex items-center gap-1">
                            철근
                            <svg className="w-2 h-2 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Settings: React.FC<SettingsProps> = ({ workerRecords = [] }) => {
    const [settings, setSettings] = useState<AppSettings>({
        siteName: '용인 푸르지오 원클러스터 2,3단지',
        siteManager: '정 용 현',
        safetyManager: '박 성 훈',
        jobFields: ['시스템', '용역', '철근', '분석', '배체정리', '형틀', '타설', '미장', '견출', '설비', '전기'],
        apiKey: '',
        trainingLanguagePreset: [...CURRENT_SITE_LANGUAGE_SET],
        competencyWeights: {
            psychological: 0.20,
            jobUnderstanding: 0.22,
            riskAssessmentUnderstanding: 0.22,
            proficiency: 0.18,
            improvementExecution: 0.18,
            repeatViolationPenalty: 1,
            version: 'v1.0.0',
        },
        safetyLevelThresholds: {
            advancedMin: 80,
            intermediateMin: 60,
        },
        approvalPolicy: {
            strictRoleGate: false,
        },
        feedbackChannel: {
            webhookUrl: '',
            timeoutMs: 8000,
            includeMetadata: true,
        },
    });

    const [jobFieldInput, setJobFieldInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [isPaidApiMode, setIsPaidApiModeState] = useState(false);
    const [freeApiKey, setFreeApiKey] = useState('');
    const [paidApiKey, setPaidApiKey] = useState('');
    const [adminPin, setAdminPinState] = useState('');
    const [weightHistory, setWeightHistory] = useState<Array<{
        timestamp: string;
        previousVersion: string | null;
        nextVersion: string;
        weights: AppSettings['competencyWeights'];
    }>>([]);
    const [harnessProbeResults, setHarnessProbeResults] = useState<Record<string, HarnessProbeResult>>({});
    const [isHarnessProbeLoading, setIsHarnessProbeLoading] = useState(false);
    const [harnessHealthState, setHarnessHealthState] = useState<HarnessHealthState>({ status: 'idle' });
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => getResolvedTheme(getStoredTheme()));
    const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
    const [isTouchPointer, setIsTouchPointer] = useState<boolean>(() => (typeof window !== 'undefined' ? window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false : false));
    const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => (typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false : false));
    const [uiViewMetrics, setUIViewMetrics] = useState<UIViewMetricRecord[]>([]);

    const harnessSourceRecords = useMemo(() => workerRecords.filter((record) => !isManagementRole(record.jobField)), [workerRecords]);
    const harnessSummary = useMemo(() => summarizeHarnessRecords(harnessSourceRecords), [harnessSourceRecords]);
    const harnessCandidates = useMemo(() => {
        const latestRecords = Array.from(
            harnessSourceRecords.reduce((map, record) => {
                const key = getWorkerIdentityKey(record);
                const current = map.get(key);
                if (!current || new Date(record.date).getTime() >= new Date(current.date).getTime()) {
                    map.set(key, record);
                }
                return map;
            }, new Map<string, WorkerRecord>()).values(),
        );

        return latestRecords
            .filter((record) => String(record.workflowRunId || '').trim())
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
    }, [harnessSourceRecords]);

    const normalizedAdvancedThreshold = Math.min(100, Math.max(0, Math.round(settings.safetyLevelThresholds?.advancedMin ?? 80)));
    const normalizedIntermediateThreshold = Math.min(
        normalizedAdvancedThreshold,
        Math.min(100, Math.max(0, Math.round(settings.safetyLevelThresholds?.intermediateMin ?? 60)))
    );

    const getPreviewSafetyLevel = (score: number): '초급' | '중급' | '고급' => {
        if (score >= normalizedAdvancedThreshold) return '고급';
        if (score >= normalizedIntermediateThreshold) return '중급';
        return '초급';
    };

    const weightSum =
        (settings.competencyWeights?.psychological || 0) +
        (settings.competencyWeights?.jobUnderstanding || 0) +
        (settings.competencyWeights?.riskAssessmentUnderstanding || 0) +
        (settings.competencyWeights?.proficiency || 0) +
        (settings.competencyWeights?.improvementExecution || 0);

    const updateWeights = (patch: Partial<NonNullable<AppSettings['competencyWeights']>>) => {
        setSettings((prev) => ({
            ...prev,
            competencyWeights: {
                psychological: prev.competencyWeights?.psychological ?? 0.2,
                jobUnderstanding: prev.competencyWeights?.jobUnderstanding ?? 0.22,
                riskAssessmentUnderstanding: prev.competencyWeights?.riskAssessmentUnderstanding ?? 0.22,
                proficiency: prev.competencyWeights?.proficiency ?? 0.18,
                improvementExecution: prev.competencyWeights?.improvementExecution ?? 0.18,
                repeatViolationPenalty: prev.competencyWeights?.repeatViolationPenalty ?? 1,
                version: prev.competencyWeights?.version ?? 'v1.0.0',
                ...patch,
            },
        }));
    };

    useEffect(() => {
        const savedSettings = localStorage.getItem('psi_app_settings');
        setIsPaidApiModeState(getIsPaidApiMode());
        setFreeApiKey(localStorage.getItem('freeApiKey') || '');
        setPaidApiKey(localStorage.getItem('paidApiKey') || '');
        setAdminPinState(localStorage.getItem('adminPin') || '');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings) as AppSettings;
                setSettings((prev) => ({
                    ...prev,
                    ...parsed,
                    trainingLanguagePreset: normalizeTrainingLanguagePreset(parsed.trainingLanguagePreset),
                    competencyWeights: {
                        ...prev.competencyWeights,
                        ...(parsed.competencyWeights || {}),
                    },
                    approvalPolicy: {
                        ...prev.approvalPolicy,
                        ...(parsed.approvalPolicy || {}),
                    },
                    safetyLevelThresholds: {
                        advancedMin: toFiniteOr(parsed.safetyLevelThresholds?.advancedMin, prev.safetyLevelThresholds?.advancedMin ?? 80),
                        intermediateMin: toFiniteOr(parsed.safetyLevelThresholds?.intermediateMin, prev.safetyLevelThresholds?.intermediateMin ?? 60),
                    },
                    batchSplitSize: toFiniteOr(parsed.batchSplitSize, prev.batchSplitSize ?? 50),
                    feedbackChannel: {
                        ...prev.feedbackChannel,
                        ...(parsed.feedbackChannel || {}),
                    },
                }));
                setJobFieldInput((parsed.jobFields || []).join(', '));
            } catch (e) {
                console.error('Failed to load settings', e);
            }
        } else {
            setJobFieldInput(settings.jobFields.join(', '));
            setShowGuide(true);
        }
    }, []);

    const handlePaidApiModeToggle = (checked: boolean) => {
        if (checked) {
            const enteredPin = window.prompt('관리자 PIN 번호를 입력하세요.');
            const savedPin = localStorage.getItem('adminPin') || '';
            if (enteredPin !== savedPin) {
                window.alert('PIN 번호가 틀렸습니다.');
                setIsPaidApiModeState(false);
                setIsPaidApiMode(false);
                return;
            }
        }

        setIsPaidApiModeState(checked);
        setIsPaidApiMode(checked);
    };

    const handleFreeApiKeyChange = (value: string) => {
        setFreeApiKey(value);
        localStorage.setItem('freeApiKey', value);
    };

    const handlePaidApiKeyChange = (value: string) => {
        setPaidApiKey(value);
        localStorage.setItem('paidApiKey', value);
    };

    const handleAdminPinChange = (value: string) => {
        setAdminPinState(value);
        localStorage.setItem('adminPin', value);
    };

    useEffect(() => {
        const historyRaw = localStorage.getItem('psi_competency_weight_history');
        if (!historyRaw) return;
        try {
            const parsed = JSON.parse(historyRaw);
            if (Array.isArray(parsed)) {
                setWeightHistory(parsed as Array<{
                    timestamp: string;
                    previousVersion: string | null;
                    nextVersion: string;
                    weights: AppSettings['competencyWeights'];
                }>);
            }
        } catch (e) {
            console.error('Failed to load weight history', e);
        }
    }, []);

    useEffect(() => {
        const syncTheme = () => {
            const mode = getStoredTheme();
            setThemeMode(mode);
            setResolvedTheme(getResolvedTheme(mode));
        };

        syncTheme();
        window.addEventListener(THEME_CHANGED_EVENT, syncTheme);
        const unwatch = watchSystemThemeChange(syncTheme);

        return () => {
            window.removeEventListener(THEME_CHANGED_EVENT, syncTheme);
            unwatch();
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;

        const pointerMedia = window.matchMedia('(hover: none) and (pointer: coarse)');
        const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

        const syncDisplayContext = () => {
            setViewportWidth(window.innerWidth);
            setIsTouchPointer(pointerMedia.matches);
            setPrefersReducedMotion(motionMedia.matches);
        };

        syncDisplayContext();
        window.addEventListener('resize', syncDisplayContext);

        const pointerHandler = () => syncDisplayContext();
        const motionHandler = () => syncDisplayContext();

        if (typeof pointerMedia.addEventListener === 'function') {
            pointerMedia.addEventListener('change', pointerHandler);
            motionMedia.addEventListener('change', motionHandler);
        } else {
            pointerMedia.addListener(pointerHandler);
            motionMedia.addListener(motionHandler);
        }

        return () => {
            window.removeEventListener('resize', syncDisplayContext);
            if (typeof pointerMedia.removeEventListener === 'function') {
                pointerMedia.removeEventListener('change', pointerHandler);
                motionMedia.removeEventListener('change', motionHandler);
            } else {
                pointerMedia.removeListener(pointerHandler);
                motionMedia.removeListener(motionHandler);
            }
        };
    }, []);

    const loadUIViewMetrics = () => {
        try {
            const raw = localStorage.getItem(UI_VIEW_MODE_METRICS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            setUIViewMetrics(Array.isArray(parsed) ? parsed : []);
        } catch {
            setUIViewMetrics([]);
        }
    };

    useEffect(() => {
        loadUIViewMetrics();

        const handleStorage = (event: StorageEvent) => {
            if (event.key === UI_VIEW_MODE_METRICS_KEY) {
                loadUIViewMetrics();
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const handleSave = () => {
        const fields = jobFieldInput.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        const prevRaw = localStorage.getItem('psi_app_settings');
        const prevSettings = prevRaw ? (JSON.parse(prevRaw) as AppSettings) : null;
        const previousVersion = prevSettings?.competencyWeights?.version || '';
        const nextVersion = settings.competencyWeights?.version || 'v1.0.0';

        if (weightSum < 0.95 || weightSum > 1.05) {
            const proceed = confirm(`가중치 합계(w1~w5)가 ${weightSum.toFixed(2)} 입니다.\n권장 범위는 1.00±0.05 입니다.\n\n이 상태로 저장하시겠습니까?`);
            if (!proceed) return;
        }

        const newSettings = {
            ...settings,
            jobFields: fields,
            trainingLanguagePreset: normalizeTrainingLanguagePreset(settings.trainingLanguagePreset),
            safetyLevelThresholds: {
                advancedMin: Math.min(100, Math.max(0, Math.round(settings.safetyLevelThresholds?.advancedMin ?? 80))),
                intermediateMin: Math.min(
                    Math.min(100, Math.max(0, Math.round(settings.safetyLevelThresholds?.advancedMin ?? 80))),
                    Math.min(100, Math.max(0, Math.round(settings.safetyLevelThresholds?.intermediateMin ?? 60)))
                ),
            },
            batchSplitSize: Math.min(500, Math.max(10, Math.round(settings.batchSplitSize ?? 50))),
        };

        if (previousVersion !== nextVersion) {
            const historyRaw = localStorage.getItem('psi_competency_weight_history');
            const history = historyRaw ? (JSON.parse(historyRaw) as Array<Record<string, unknown>>) : [];
            history.unshift({
                timestamp: new Date().toISOString(),
                previousVersion: previousVersion || null,
                nextVersion,
                weights: newSettings.competencyWeights,
            });
            const nextHistory = history.slice(0, 50);
            localStorage.setItem('psi_competency_weight_history', JSON.stringify(nextHistory));
            setWeightHistory(nextHistory as Array<{
                timestamp: string;
                previousVersion: string | null;
                nextVersion: string;
                weights: AppSettings['competencyWeights'];
            }>);
        }

        localStorage.setItem('psi_app_settings', JSON.stringify(newSettings));
        setSettings(newSettings);

        alert('설정이 저장되었습니다. 시스템에 즉시 반영됩니다.');
        window.location.reload();
    };

    const handleResetData = () => {
        if (confirm("⚠️ 경고: 모든 데이터가 삭제됩니다 (근로자 기록, 점검 일지 등).\n설정 정보(API 키 등)는 유지됩니다.\n\n정말 초기화 하시겠습니까?")) {
            localStorage.removeItem('psi_safety_checks');
            localStorage.removeItem('psi_site_issues');
            alert("로컬 저장소 데이터가 정리되었습니다. 완벽한 초기화를 위해 브라우저의 '사이트 데이터 삭제'를 권장합니다.\n페이지를 새로고침합니다.");
            window.location.reload();
        }
    };

    const handleClearWeightHistory = () => {
        if (!confirm('가중치 버전 변경 이력을 모두 삭제하시겠습니까?')) return;
        localStorage.removeItem('psi_competency_weight_history');
        setWeightHistory([]);
        alert('가중치 이력이 초기화되었습니다.');
    };

    const handleApplyWeightHistory = (entry: {
        timestamp: string;
        previousVersion: string | null;
        nextVersion: string;
        weights: AppSettings['competencyWeights'];
    }) => {
        if (!entry.weights) return;
        const proceed = confirm(`${entry.nextVersion} 버전 가중치를 현재 설정에 복원하시겠습니까?\n(복원 후 반드시 '설정 저장 및 적용'을 눌러야 반영됩니다)`);
        if (!proceed) return;

        setSettings((prev) => ({
            ...prev,
            competencyWeights: {
                psychological: entry.weights?.psychological ?? 0.2,
                jobUnderstanding: entry.weights?.jobUnderstanding ?? 0.22,
                riskAssessmentUnderstanding: entry.weights?.riskAssessmentUnderstanding ?? 0.22,
                proficiency: entry.weights?.proficiency ?? 0.18,
                improvementExecution: entry.weights?.improvementExecution ?? 0.18,
                repeatViolationPenalty: entry.weights?.repeatViolationPenalty ?? 1,
                version: entry.weights?.version || entry.nextVersion || 'v1.0.0',
            },
        }));
    };

    const toggleTrainingLanguagePreset = (code: string) => {
        setSettings((prev) => {
            const current = normalizeTrainingLanguagePreset(prev.trainingLanguagePreset);
            if (current.includes(code)) {
                const next = current.filter((item) => item !== code);
                if (next.length === 0) return prev;
                return { ...prev, trainingLanguagePreset: next };
            }
            return { ...prev, trainingLanguagePreset: [...current, code] };
        });
    };

    const settingsSummaryCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'settings-status',
            eyebrow: '지금 상태',
            title: `${settings.siteName || '현장명 미입력'} 기준 시스템 구성을 조정 중입니다.`,
            description: `현재 ${isPaidApiMode ? '유료 API 모드' : '무료 API 모드'}이며 공종 ${jobFieldInput.split(',').filter((s) => s.trim()).length}개, 기본 교육 언어 ${normalizeTrainingLanguagePreset(settings.trainingLanguagePreset).length}개가 설정되어 있습니다.`,
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'settings-evidence',
            eyebrow: '판단 근거',
            title: 'API, 현장 정보, 가중치, 컷오프, 배치 크기, 언어 세트가 운영 기준입니다.',
            description: '설정 화면은 단순 입력 폼이 아니라 현장 판단 기준을 고정하는 곳이므로, 저장 전 현재 기준이 어떤 운영 흐름을 만드는지 함께 읽을 수 있게 구성했습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'settings-action',
            eyebrow: '다음 행동',
            title: weightSum >= 0.95 && weightSum <= 1.05 ? '기준 확인 후 저장 및 적용으로 마감하세요.' : '가중치 합계와 핵심 기준을 먼저 다시 확인하세요.',
            description: '설정 저장 시 즉시 시스템 전반에 반영되므로, 현장 정보와 평가 기준이 실제 운영 언어와 맞는지 마지막으로 점검하는 것이 중요합니다.',
            tone: weightSum >= 0.95 && weightSum <= 1.05 ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80',
        },
    ], [isPaidApiMode, jobFieldInput, settings.siteName, settings.trainingLanguagePreset, weightSum]);

    const apiInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'api-status',
            eyebrow: '지금 상태',
            title: isPaidApiMode ? '대규모 고속 처리 모드가 준비되어 있습니다.' : '기본 무료 API 모드로 운영 중입니다.',
            description: `${freeApiKey ? '무료 API 키가 입력됨' : '무료 API 키 미입력'} · ${paidApiKey ? '유료 API 키가 입력됨' : '유료 API 키 미입력'} 상태입니다.`,
            tone: isPaidApiMode ? 'border-rose-200 bg-rose-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'api-evidence',
            eyebrow: '판단 근거',
            title: 'API 키와 관리자 PIN이 처리 권한의 기준입니다.',
            description: '유료 모드는 PIN 확인을 거쳐야 켜지도록 구성해 무분별한 비용 사용 대신 운영 책임이 남도록 만들었습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'api-action',
            eyebrow: '다음 행동',
            title: freeApiKey || paidApiKey ? '운영 모드에 맞는 키를 유지하세요.' : '먼저 사용할 API 키를 입력하세요.',
            description: '현장 규모와 처리량에 맞춰 무료/유료 모드를 선택하면 이후 OCR, 리포트, 대량 분석 흐름이 안정적으로 이어집니다.',
            tone: freeApiKey || paidApiKey ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80',
        },
    ], [freeApiKey, isPaidApiMode, paidApiKey]);

    const policyInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'policy-status',
            eyebrow: '지금 상태',
            title: `현재 승인 정책은 ${settings.approvalPolicy?.strictRoleGate ? '엄격 기준' : '유연 기준'}입니다.`,
            description: `안전 등급 기준은 고급 ${normalizedAdvancedThreshold}점 이상, 중급 ${normalizedIntermediateThreshold}점 이상으로 설정되어 있습니다.`,
            tone: settings.approvalPolicy?.strictRoleGate ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'policy-evidence',
            eyebrow: '판단 근거',
            title: '가중치와 컷오프가 해석 기준을 만듭니다.',
            description: `현재 w1~w5 합계는 ${weightSum.toFixed(2)}이며, 배치 크기는 ${settings.batchSplitSize ?? 50}건 기준입니다. 이 값들이 점수 해석과 대량 처리 체감에 직접 영향을 줍니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'policy-action',
            eyebrow: '다음 행동',
            title: '현장 운영 언어와 평가 기준이 맞는지 마지막으로 확인하세요.',
            description: '엄격 차단, 점수 컷오프, OCR 배치 크기는 실제 현장 보호 흐름을 바꾸므로, 저장 전 관리자와 현장 리듬에 맞는지 보는 것이 좋습니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
    ], [normalizedAdvancedThreshold, normalizedIntermediateThreshold, settings.approvalPolicy?.strictRoleGate, settings.batchSplitSize, weightSum]);

    const themeInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'theme-status',
            eyebrow: '지금 상태',
            title: `테마 모드는 ${themeMode === 'system' ? '시스템 자동' : themeMode === 'dark' ? '다크' : '라이트'}이며 현재 화면은 ${resolvedTheme === 'dark' ? '다크' : '라이트'}로 렌더링 중입니다.`,
            description: '평가 시점과 실사용 시점이 다를 수 있어 모드(선택값)와 실제 적용값을 분리해 보여줍니다.',
            tone: resolvedTheme === 'dark' ? BRAND_TONE.darkIndigoText : BRAND_TONE.indigoSoft70,
        },
        {
            key: 'theme-evidence',
            eyebrow: '판단 근거',
            title: '가독성·작업성 기준은 배경 대비, 입력 필드 식별성, 모바일 터치 타겟 안정성입니다.',
            description: '다크모드에서도 카드 경계, 본문 텍스트, 입력 placeholder가 분리되어야 현장 입력 실수가 줄어듭니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'theme-action',
            eyebrow: '다음 행동',
            title: resolvedTheme === 'dark'
                ? '야간/실내 작업 시 다크를 유지하고 보고서 검토 전에는 라이트 대비를 한 번 교차 확인하세요.'
                : '주간/문서 공유 중심이면 라이트를 유지하고 야간 현장 점검 시 다크로 즉시 전환하세요.',
            description: '테마는 미관보다 오입력 방지와 피로 저감이 목적이므로, 운영 시간대 기준으로 선택하는 것이 안전합니다.',
            tone: resolvedTheme === 'dark' ? BRAND_TONE.darkEmeraldText : BRAND_TONE.emeraldSoft80,
        },
    ], [resolvedTheme, themeMode]);

    const displayAuditMetrics = useMemo(() => {
        const viewportLabel = viewportWidth < 640 ? '모바일' : viewportWidth < 1024 ? '태블릿' : '데스크톱';

        return [
            {
                key: 'display-viewport',
                label: '뷰포트',
                value: viewportLabel,
                helper: `${viewportWidth}px`,
                tone: viewportWidth < 640 ? BRAND_TONE.indigoSoft70 : BRAND_TONE.whiteSoft,
            },
            {
                key: 'display-touch',
                label: '포인터',
                value: isTouchPointer ? '터치 중심' : '마우스 중심',
                helper: isTouchPointer ? '버튼 44px 이상 권장' : '밀집 정보 보기 최적',
                tone: isTouchPointer ? BRAND_TONE.emeraldSoft80 : BRAND_TONE.whiteSoft,
            },
            {
                key: 'display-motion',
                label: '모션 선호',
                value: prefersReducedMotion ? '감소 모드' : '기본 모드',
                helper: prefersReducedMotion ? '과한 애니메이션 억제 권장' : '시각 피드백 활성',
                tone: prefersReducedMotion ? 'border-amber-200 bg-amber-50/80' : BRAND_TONE.whiteSoft,
            },
            {
                key: 'display-theme-live',
                label: '실적용 테마',
                value: resolvedTheme === 'dark' ? '다크' : '라이트',
                helper: themeMode === 'system' ? '시스템 정책 연동' : '사용자 고정',
                tone: resolvedTheme === 'dark' ? BRAND_TONE.darkIndigoText : BRAND_TONE.indigoSoft70,
            },
        ];
    }, [isTouchPointer, prefersReducedMotion, resolvedTheme, themeMode, viewportWidth]);

    const uiViewMetricSummary = useMemo(() => {
        const modeChanges = uiViewMetrics.filter((item) => item.event === 'view_mode_change').length;
        const ctaClicks = uiViewMetrics.filter((item) => item.event === 'cta_click').length;
        const controlChanges = uiViewMetrics.filter((item) => item.event === 'control_change').length;
        const presetSaves = uiViewMetrics.filter((item) => (
            item.event === 'cta_click'
            && String(item.payload?.actionKey || '') === 'comparison_preset_save'
        )).length;
        const presetExports = uiViewMetrics.filter((item) => (
            item.event === 'cta_click'
            && String(item.payload?.actionKey || '') === 'comparison_preset_export_csv'
        )).length;
        const presetApplies = uiViewMetrics.filter((item) => (
            item.event === 'control_change'
            && String(item.payload?.control || '') === 'comparison_preset_apply'
        )).length;
        const presetRenames = uiViewMetrics.filter((item) => (
            item.event === 'control_change'
            && String(item.payload?.control || '') === 'comparison_preset_rename'
        )).length;
        const presetScopeChanges = uiViewMetrics.filter((item) => (
            item.event === 'control_change'
            && String(item.payload?.control || '') === 'comparison_preset_scope'
        )).length;
        const presetPinToggles = uiViewMetrics.filter((item) => (
            item.event === 'control_change'
            && String(item.payload?.control || '') === 'comparison_preset_pin'
            && !Boolean(item.payload?.blockedByLimit)
        )).length;
        const presetPinLimitBlocked = uiViewMetrics.filter((item) => (
            item.event === 'control_change'
            && String(item.payload?.control || '') === 'comparison_preset_pin'
            && Boolean(item.payload?.blockedByLimit)
        )).length;
        const presetApplySessions = new Set(uiViewMetrics.filter((item) => (
            item.page === 'dashboard'
            && item.event === 'control_change'
            && String(item.payload?.control || '') === 'comparison_preset_apply'
        )).map((item) => item.sessionId)).size;
        const dwellEvents = uiViewMetrics.filter((item) => item.event === 'view_exit');
        const dwellValues = dwellEvents
            .map((item) => Number(item.payload?.dwellMs || 0))
            .filter((value) => Number.isFinite(value) && value > 0);
        const avgDwellSec = dwellValues.length > 0
            ? Math.round((dwellValues.reduce((acc, value) => acc + value, 0) / dwellValues.length) / 100) / 10
            : 0;
        const dashboardSessions = new Set(uiViewMetrics.filter((item) => item.page === 'dashboard').map((item) => item.sessionId)).size;
        const performanceSessions = new Set(uiViewMetrics.filter((item) => item.page === 'performance-analysis').map((item) => item.sessionId)).size;
        const presetApplyRate = dashboardSessions > 0
            ? Math.round((presetApplySessions / dashboardSessions) * 100)
            : 0;

        return {
            total: uiViewMetrics.length,
            modeChanges,
            ctaClicks,
            controlChanges,
            presetSaves,
            presetExports,
            presetApplies,
            presetApplySessions,
            presetApplyRate,
            presetRenames,
            presetScopeChanges,
            presetPinToggles,
            presetPinLimitBlocked,
            avgDwellSec,
            dashboardSessions,
            performanceSessions,
        };
    }, [uiViewMetrics]);

    const uiViewMetricCards = useMemo(() => [
        {
            key: 'ui-metric-total',
            label: '수집 이벤트',
            value: uiViewMetricSummary.total,
            helper: '최근 local KPI 로그 수',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'ui-metric-mode',
            label: '모드 변경',
            value: uiViewMetricSummary.modeChanges,
            helper: 'view_mode_change',
            tone: uiViewMetricSummary.modeChanges > 0 ? BRAND_TONE.indigoSoft70 : BRAND_TONE.whiteSoft,
        },
        {
            key: 'ui-metric-cta',
            label: '핵심 클릭',
            value: uiViewMetricSummary.ctaClicks,
            helper: 'cta_click',
            tone: uiViewMetricSummary.ctaClicks > 0 ? BRAND_TONE.emeraldSoft80 : BRAND_TONE.whiteSoft,
        },
        {
            key: 'ui-metric-preset',
            label: '프리셋 적용',
            value: uiViewMetricSummary.presetApplies,
            helper: `저장 ${uiViewMetricSummary.presetSaves}건 · 내보내기 ${uiViewMetricSummary.presetExports}건 · 이름수정 ${uiViewMetricSummary.presetRenames}건 · 고정전환 ${uiViewMetricSummary.presetPinToggles}건 · 제한차단 ${uiViewMetricSummary.presetPinLimitBlocked}건 · 범위전환 ${uiViewMetricSummary.presetScopeChanges}건 · Dashboard 세션 적용률 ${uiViewMetricSummary.presetApplyRate}%`,
            tone: uiViewMetricSummary.presetApplies > 0 ? BRAND_TONE.indigoSoft70 : BRAND_TONE.whiteSoft,
        },
        {
            key: 'ui-metric-dwell',
            label: '평균 체류',
            value: `${uiViewMetricSummary.avgDwellSec.toFixed(1)}초`,
            helper: 'view_exit dwell 평균',
            tone: BRAND_TONE.slate,
        },
    ], [uiViewMetricSummary]);

    const presetSourceTargetStatus = useMemo(() => {
        if (uiViewMetricSummary.presetApplies === 0) {
            return {
                label: '데이터 수집 중',
                description: '프리셋 적용 로그가 누적되면 빠른실행 사용률 목표(60%) 달성 여부를 평가합니다.',
                toneClassName: 'text-slate-600',
            };
        }

        if (uiViewMetricSummary.presetPinnedSourceRate >= PRESET_PINNED_SOURCE_TARGET_RATE) {
            return {
                label: '목표 달성',
                description: `빠른실행 비중 ${uiViewMetricSummary.presetPinnedSourceRate}%로 목표 ${PRESET_PINNED_SOURCE_TARGET_RATE}% 이상입니다.`,
                toneClassName: 'text-emerald-700',
            };
        }

        return {
            label: '개선 필요',
            description: `빠른실행 비중 ${uiViewMetricSummary.presetPinnedSourceRate}%로 목표 ${PRESET_PINNED_SOURCE_TARGET_RATE}% 미만입니다. 고정 프리셋 배치/이름을 점검하세요.`,
            toneClassName: 'text-amber-700',
        };
    }, [uiViewMetricSummary.presetApplies, uiViewMetricSummary.presetPinnedSourceRate]);

    const recentUIViewMetrics = useMemo(() => uiViewMetrics.slice(0, 3), [uiViewMetrics]);

    const handleClearUIViewMetrics = () => {
        if (!confirm('UI KPI 로그를 모두 초기화하시겠습니까?')) return;
        localStorage.removeItem(UI_VIEW_MODE_METRICS_KEY);
        setUIViewMetrics([]);
    };

    const handleThemeModeChange = (mode: ThemeMode) => {
        const next = setTheme(mode);
        setThemeMode(next);
        setResolvedTheme(getResolvedTheme(next));
    };

    const harnessSettingsMetrics = useMemo(() => ([
        {
            key: 'settings-harness-connected',
            label: '저장 연결',
            value: `${harnessSummary.connected}명`,
            helper: `run 연결 ${harnessSummary.runLinked}명 / 전체 ${harnessSummary.total}명`,
            tone: BRAND_TONE.emeraldSoft80,
            labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700',
            helperClassName: 'mt-1 text-xs font-bold text-emerald-700',
        },
        {
            key: 'settings-harness-backlog',
            label: '승인 백로그',
            value: `${harnessSummary.approvalBacklog}명`,
            helper: `재검토 필요 ${harnessSummary.reviewNeeded}명`,
            tone: harnessSummary.approvalBacklog > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700' : 'text-slate-500'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700' : 'text-slate-600'}`,
        },
        {
            key: 'settings-harness-attention',
            label: '즉시 보호',
            value: `${harnessSummary.immediateAttention}명`,
            helper: '설정 저장 전 현재 보호 공백 우선 확인',
            tone: harnessSummary.immediateAttention > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-indigo-200 bg-indigo-50/70',
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
        },
        {
            key: 'settings-harness-fallback',
            label: '폴백·저장 대기',
            value: `${harnessSummary.fallback + harnessSummary.pending}명`,
            helper: `폴백 ${harnessSummary.fallback}명 · 대기 ${harnessSummary.pending}명`,
            tone: harnessSummary.fallback > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.fallback > 0 ? 'text-amber-700' : 'text-slate-500'}`,
            helperClassName: `mt-1 text-xs font-bold ${harnessSummary.fallback > 0 ? 'text-amber-700' : 'text-slate-600'}`,
        },
    ]), [harnessSummary]);

    const harnessProbeSummary = useMemo(() => {
        return Object.values(harnessProbeResults).reduce((acc, item) => {
            if (item.status === 'success' && item.diagnostics) {
                if (item.diagnostics.found && item.diagnostics.resolvedBy === 'workflow_run_id') acc.direct += 1;
                if (item.diagnostics.found && item.diagnostics.resolvedBy === 'source_record_id') acc.sourceFallback += 1;
                if (!item.diagnostics.found) acc.missing += 1;
            }
            if (item.warning) acc.warning += 1;
            if ((item.overrideCount || 0) > 0) acc.overrideRuns += 1;
            acc.criticalRules += Number(item.criticalRuleCount || 0);
            if (item.status === 'error') acc.error += 1;
            return acc;
        }, { direct: 0, sourceFallback: 0, missing: 0, warning: 0, overrideRuns: 0, criticalRules: 0, error: 0 });
    }, [harnessProbeResults]);

    const handleRunHarnessHealthCheck = async () => {
        setHarnessHealthState({ status: 'loading' });
        try {
            const data = await fetchHarnessPersistenceHealth();
            setHarnessHealthState({ status: 'success', data });
        } catch (error) {
            setHarnessHealthState({
                status: 'error',
                message: extractMessage(error),
            });
        }
    };

    const handleRunHarnessProbe = async () => {
        if (harnessCandidates.length === 0) return;
        setIsHarnessProbeLoading(true);
        setHarnessProbeResults((prev) => {
            const next = { ...prev };
            harnessCandidates.forEach((record) => {
                const runId = String(record.workflowRunId || '').trim();
                if (!runId) return;
                next[runId] = { status: 'loading' };
            });
            return next;
        });

        const entries = await Promise.all(harnessCandidates.map(async (record) => {
            const runId = String(record.workflowRunId || '').trim();
            if (!runId) return null;
            try {
                const response = await fetchHarnessWorkflowStatus(runId);
                return [runId, {
                    status: 'success',
                    diagnostics: response.diagnostics,
                    warning: response.persistence?.warning || null,
                    workflowState: response.workflowState,
                    riskDecision: response.riskDecision,
                    approvalState: response.approvalState,
                    overrideCount: response.ruleImpactSummary?.totalCount || response.overrides?.length || 0,
                    criticalRuleCount: response.ruleImpactSummary?.criticalCount || 0,
                    ruleImpactNarrative: response.ruleImpactSummary?.narrative || null,
                    ruleImpactRuleCodes: response.ruleImpactSummary?.items.map((item) => item.ruleCode) || [],
                    checkedAt: new Date().toISOString(),
                } satisfies HarnessProbeResult] as const;
            } catch (error) {
                return [runId, {
                    status: 'error',
                    message: extractMessage(error),
                    checkedAt: new Date().toISOString(),
                } satisfies HarnessProbeResult] as const;
            }
        }));

        setHarnessProbeResults((prev) => {
            const next = { ...prev };
            entries.forEach((entry) => {
                if (!entry) return;
                next[entry[0]] = entry[1];
            });
            return next;
        });
        setIsHarnessProbeLoading(false);
    };

    const handleExportHarnessProbeJson = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            candidateCount: harnessCandidates.length,
            summary: harnessProbeSummary,
            runs: harnessCandidates.map((record) => {
                const runId = String(record.workflowRunId || '').trim();
                const result = harnessProbeResults[runId];
                return {
                    runId,
                    recordId: record.id,
                    name: record.name,
                    jobField: record.jobField || '미분류',
                    teamLeader: record.teamLeader || '미지정',
                    date: record.date,
                    probe: result || null,
                };
            }),
        };

        downloadTextFile(
            `PSI_Harness_Probe_${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify(payload, null, 2),
            'application/json;charset=utf-8;'
        );
    };

    const handleExportHarnessProbeCsv = () => {
        const escapeCsv = (value: unknown) => {
            const str = String(value ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows: string[][] = [
            ['runId', 'recordId', 'name', 'jobField', 'teamLeader', 'date', 'status', 'workflowState', 'riskDecision', 'approvalState', 'resolvedBy', 'found', 'eventCount', 'approvalCount', 'timelineCount', 'warning', 'overrideCount', 'criticalRuleCount', 'ruleImpactRuleCodes', 'ruleImpactNarrative', 'checkedAt'],
        ];

        harnessCandidates.forEach((record) => {
            const runId = String(record.workflowRunId || '').trim();
            const result = harnessProbeResults[runId];
            rows.push([
                runId,
                record.id,
                record.name,
                record.jobField || '미분류',
                record.teamLeader || '미지정',
                record.date,
                result?.status || 'idle',
                result?.workflowState || record.workflowState || inferHarnessWorkflowState(record),
                result?.riskDecision || record.riskDecision || inferHarnessRiskDecision(record),
                result?.approvalState || record.approvalState || inferHarnessApprovalState(record, inferHarnessWorkflowState(record)),
                result?.diagnostics?.resolvedBy || '',
                result?.diagnostics?.found ? 'YES' : 'NO',
                String(result?.diagnostics?.eventCount ?? 0),
                String(result?.diagnostics?.approvalCount ?? 0),
                String(result?.diagnostics?.timelineCount ?? 0),
                result?.warning || '',
                String(result?.overrideCount ?? 0),
                String(result?.criticalRuleCount ?? 0),
                result?.ruleImpactRuleCodes?.join(' | ') || '',
                result?.ruleImpactNarrative || '',
                result?.checkedAt || '',
            ]);
        });

        const bom = '\uFEFF';
        const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
        downloadTextFile(
            `PSI_Harness_Probe_${new Date().toISOString().slice(0, 10)}.csv`,
            bom + csv,
            'text/csv;charset=utf-8;'
        );
    };

    return (
        <div className="space-y-6 sm:space-y-8 animate-fade-in-up pb-10 sm:pb-12">
            <div className="bg-slate-900 rounded-3xl sm:rounded-[30px] p-5 sm:p-8 md:p-10 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="relative z-10">
                    <h2 className="text-2xl sm:text-3xl font-black mb-1.5 sm:mb-2">시스템 설정 (System Configuration)</h2>
                    <p className="text-slate-400 max-w-xl text-sm sm:text-base md:text-lg">현장 맞춤형 환경을 구성하고 API 키를 관리하세요.</p>
                </div>
                <div className="relative z-10 inline-flex items-center gap-2 rounded-full border border-indigo-300/30 bg-white/10 px-4 py-2 text-xs font-black text-indigo-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                    현재 버전 {PSI_APP_VERSION}
                </div>
                <button
                    onClick={() => setShowGuide(!showGuide)}
                    className={`relative z-10 w-full md:w-auto px-5 sm:px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${showGuide ? 'bg-white text-indigo-900' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                >
                    {showGuide ? '가이드 닫기' : '초보자 가이드 보기'}
                </button>
            </div>

            <InterpretationCardGrid
                items={settingsSummaryCards}
                cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
            />

            <SummaryMetricGrid
                items={harnessSettingsMetrics}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
            />

            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-indigo-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">테마/다크모드 운영 설정</h3>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">
                            평가자 관점(검증 가능성)과 실무자 관점(야간/장시간 사용 피로도)을 함께 반영해 테마를 선택합니다.
                        </p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-700">
                        적용 상태: {themeMode === 'system' ? '시스템 자동' : themeMode === 'dark' ? '다크' : '라이트'} / 현재 {resolvedTheme === 'dark' ? '다크' : '라이트'}
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={() => handleThemeModeChange('light')}
                        className={`rounded-xl border px-4 py-3 text-sm font-black transition-colors ${themeMode === 'light' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                        라이트 고정
                    </button>
                    <button
                        type="button"
                        onClick={() => handleThemeModeChange('dark')}
                        className={`rounded-xl border px-4 py-3 text-sm font-black transition-colors ${themeMode === 'dark' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                        다크 고정
                    </button>
                    <button
                        type="button"
                        onClick={() => handleThemeModeChange('system')}
                        className={`rounded-xl border px-4 py-3 text-sm font-black transition-colors ${themeMode === 'system' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                        시스템 자동
                    </button>
                </div>

                <InterpretationCardGrid
                    items={themeInterpretationCards}
                    className="mt-4 grid-cols-1 xl:grid-cols-3"
                    cardClassName="rounded-2xl border p-4 shadow-sm"
                />

                <SummaryMetricGrid
                    items={displayAuditMetrics}
                    className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                    cardClassName="rounded-2xl border p-4 shadow-sm"
                />

                <NoticeCallout
                    variant={resolvedTheme === 'dark' ? 'indigo' : 'emerald'}
                    className="mt-4 rounded-2xl px-4 py-3"
                    eyebrow="QUALITY CHECK"
                    title="다크모드 검증 체크: 본문 가독성, 입력창 경계, 모바일 터치 영역(44px+)"
                    description="테마 전환 후 입력 폼·표·배지에서 색만 바뀌고 의미가 흐려지지 않는지 확인하면, 평가/실무 모두에서 재작업이 줄어듭니다."
                    titleClassName="text-sm font-black"
                    descriptionClassName="mt-1 text-xs font-semibold"
                    bodyClassName="block"
                />
            </div>

            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-indigo-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">UI 모드 실험 KPI 요약</h3>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">
                            Dashboard/PerformanceAnalysis의 모드 전환, 핵심 클릭, 체류시간 로그를 로컬 기준으로 빠르게 확인합니다.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={loadUIViewMetrics}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                        >
                            지표 새로고침
                        </button>
                        <button
                            type="button"
                            onClick={handleClearUIViewMetrics}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100"
                        >
                            지표 초기화
                        </button>
                    </div>
                </div>

                <SummaryMetricGrid
                    items={uiViewMetricCards}
                    className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                    cardClassName="rounded-2xl border p-4 shadow-sm"
                />

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">세션 요약</p>
                    <p className="mt-2 text-sm font-bold text-slate-700">
                        Dashboard 세션 {uiViewMetricSummary.dashboardSessions}건 · Performance 세션 {uiViewMetricSummary.performanceSessions}건 · 컨트롤 변경 {uiViewMetricSummary.controlChanges}건 · 프리셋 적용 세션 {uiViewMetricSummary.presetApplySessions}건
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                        프리셋 적용 소스 비중: 빠른실행 {uiViewMetricSummary.presetApplyFromPinnedLane}건({uiViewMetricSummary.presetPinnedSourceRate}%) · 리스트 {uiViewMetricSummary.presetApplyFromPresetList}건({uiViewMetricSummary.presetListSourceRate}%) · 기타 {uiViewMetricSummary.presetApplyFromUnknown}건
                    </p>
                    <p className={`mt-1 text-xs font-black ${presetSourceTargetStatus.toneClassName}`}>
                        빠른실행 사용률 목표(60%): {presetSourceTargetStatus.label} · {presetSourceTargetStatus.description}
                    </p>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">최근 이벤트 3건</div>
                    {recentUIViewMetrics.length === 0 ? (
                        <div className="px-4 py-5 text-sm font-semibold text-slate-500">수집된 이벤트가 없습니다.</div>
                    ) : (
                        <div className="divide-y divide-slate-200 bg-white">
                            {recentUIViewMetrics.map((item, index) => (
                                <div key={`${item.timestamp}-${item.sessionId}-${index}`} className="px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-slate-700">
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{item.page}</span>
                                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">{item.event}</span>
                                        <span className="text-slate-400 font-semibold">{new Date(item.timestamp).toLocaleString('ko-KR')}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500 break-all">session: {item.sessionId}</p>
                                    {item.payload ? (
                                        <p className="mt-1 text-xs text-slate-600 break-all">payload: {JSON.stringify(item.payload)}</p>
                                    ) : null}
                                </div>
                            ))}
                            {uiViewMetrics.length > recentUIViewMetrics.length && (
                                <div className="px-4 py-2 text-[11px] font-bold text-slate-500 bg-slate-50/70">
                                    전체 {uiViewMetrics.length}건 중 최근 3건만 표시합니다.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {(harnessSummary.immediateAttention > 0 || harnessSummary.approvalBacklog > 0 || harnessSummary.fallback > 0) && (
                <NoticeCallout
                    variant={harnessSummary.immediateAttention > 0 ? 'rose' : harnessSummary.fallback > 0 ? 'amber' : 'indigo'}
                    eyebrow="Harness priority"
                    title={harnessSummary.immediateAttention > 0
                        ? `설정 조정 전에 즉시 보호 대상 ${harnessSummary.immediateAttention}명을 먼저 확인해야 합니다.`
                        : harnessSummary.fallback > 0
                            ? `하네스 persistence 폴백 ${harnessSummary.fallback}명이 있어 운영 기준 변경 전 저장 연결 상태를 함께 점검해야 합니다.`
                            : `승인 백로그 ${harnessSummary.approvalBacklog}명이 남아 있어 설정 변경과 함께 관리자 검토 순서를 먼저 정리해야 합니다.`}
                    description="설정 화면은 정책 기준을 바꾸는 곳이므로, 현재 보호 흐름이 끊긴 레코드가 있는지 먼저 확인해야 운영 기준 변경이 현장 혼선을 만들지 않습니다."
                    className="rounded-2xl border px-4 py-3 shadow-sm"
                    bodyClassName="block"
                    titleClassName="text-sm font-black"
                    descriptionClassName="mt-1 text-xs font-semibold leading-relaxed"
                />
            )}

            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-indigo-100">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-slate-900">하네스 persistence 환경 상태</h3>
                            <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">
                                Supabase 환경변수, 키 모드, 하네스 테이블 준비 상태와 현재 적재 건수를 한 번에 확인해 실환경 persisted 검증 전에 환경 문제를 먼저 분리합니다.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleRunHarnessHealthCheck}
                            disabled={harnessHealthState.status === 'loading'}
                            className={`px-4 py-2.5 rounded-2xl text-sm font-black transition-all ${harnessHealthState.status === 'loading' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg'}`}
                        >
                            {harnessHealthState.status === 'loading' ? '환경 점검 중...' : '환경 상태 점검'}
                        </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div className={`rounded-2xl border px-4 py-3 ${harnessHealthState.data?.envConfigured ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'}`}>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">환경변수</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{harnessHealthState.data?.envConfigured ? '준비됨' : '미구성'}</p>
                        </div>
                        <div className={`rounded-2xl border px-4 py-3 ${harnessHealthState.data?.keyMode === 'service_role' ? 'border-indigo-200 bg-indigo-50/70' : harnessHealthState.data?.keyMode === 'anon' ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50'}`}>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">키 모드</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{harnessHealthState.data?.keyMode === 'service_role' ? 'service_role' : harnessHealthState.data?.keyMode === 'anon' ? 'anon' : '-'}</p>
                        </div>
                        <div className={`rounded-2xl border px-4 py-3 ${harnessHealthState.data?.tablesReady ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'}`}>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">테이블 준비</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{harnessHealthState.data?.tablesReady ? '완료' : '미확인'}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">workflow runs</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{harnessHealthState.data?.counts.workflowRuns ?? 0}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">events / approvals</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{`${harnessHealthState.data?.counts.workflowEvents ?? 0} / ${harnessHealthState.data?.counts.humanApprovals ?? 0}`}</p>
                        </div>
                    </div>

                    {harnessHealthState.status === 'error' ? (
                        <p className="mt-3 text-xs font-bold text-rose-700">{harnessHealthState.message}</p>
                    ) : null}
                    {harnessHealthState.data?.warning ? (
                        <p className="mt-3 text-xs font-bold text-amber-700">{harnessHealthState.data.warning}</p>
                    ) : null}
                    {harnessHealthState.data?.checkedAt ? (
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">마지막 점검: {new Date(harnessHealthState.data.checkedAt).toLocaleString('ko-KR')}</p>
                    ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">하네스 persistence 진단 준비</h3>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">
                            최근 workflow run 연결 레코드를 기준으로 persisted 상태를 즉시 조회해 `직접 조회`, `원본 레코드 기준 조회`, `실데이터 미발견` 케이스를 설정 화면에서 바로 분류할 수 있습니다.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportHarnessProbeCsv}
                            disabled={harnessCandidates.length === 0}
                            className={`px-4 py-2.5 rounded-2xl text-sm font-black transition-all ${harnessCandidates.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                        >
                            진단 CSV 내보내기
                        </button>
                        <button
                            type="button"
                            onClick={handleExportHarnessProbeJson}
                            disabled={harnessCandidates.length === 0}
                            className={`px-4 py-2.5 rounded-2xl text-sm font-black transition-all ${harnessCandidates.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                        >
                            진단 JSON 내보내기
                        </button>
                        <button
                            type="button"
                            onClick={handleRunHarnessProbe}
                            disabled={isHarnessProbeLoading || harnessCandidates.length === 0}
                            className={`px-4 py-2.5 rounded-2xl text-sm font-black transition-all ${isHarnessProbeLoading || harnessCandidates.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'}`}
                        >
                            {isHarnessProbeLoading ? '진단 조회 중...' : '최근 workflow run 진단 새로고침'}
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">직접 조회</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{harnessProbeSummary.direct}</p>
                    </div>
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">원본 레코드 보정</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{harnessProbeSummary.sourceFallback}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">실데이터 미발견</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{harnessProbeSummary.missing}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">경고 포함</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{harnessProbeSummary.warning}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">룰 개입 런</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{harnessProbeSummary.overrideRuns}</p>
                        <p className="mt-1 text-[10px] font-bold text-amber-700">Critical 합계 {harnessProbeSummary.criticalRules}</p>
                    </div>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">조회 실패</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{harnessProbeSummary.error}</p>
                    </div>
                </div>

                {harnessCandidates.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-500">
                        아직 `workflowRunId`가 연결된 최신 레코드가 없어 실환경 persistence 진단 대상을 만들 수 없습니다. 먼저 OCR/리포트 흐름에서 하네스 run 연결을 생성해야 합니다.
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        {harnessCandidates.map((record) => {
                            const runId = String(record.workflowRunId || '').trim();
                            const result = harnessProbeResults[runId];
                            const statusLabel = result?.status === 'loading'
                                ? '조회 중'
                                : result?.status === 'error'
                                    ? '조회 실패'
                                    : result?.diagnostics?.found
                                        ? result.diagnostics.resolvedBy === 'source_record_id'
                                            ? '원본 레코드 기준 조회'
                                            : '직접 조회 성공'
                                        : result?.status === 'success'
                                            ? '실데이터 미발견'
                                            : '검증 대기';
                            const statusClassName = result?.status === 'loading'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : result?.status === 'error'
                                    ? 'bg-rose-100 text-rose-700 border-rose-200'
                                    : result?.diagnostics?.found
                                        ? result.diagnostics.resolvedBy === 'source_record_id'
                                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                            : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        : result?.status === 'success'
                                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                                            : 'bg-slate-100 text-slate-500 border-slate-200';

                            return (
                                <div key={runId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{record.name} · {record.jobField || '미분류'}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{record.date} · 팀 {record.teamLeader || '미지정'} · Run {runId}</p>
                                        </div>
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black ${statusClassName}`}>{statusLabel}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                                        <div>workflow: <span className="font-black text-slate-800">{result?.workflowState || record.workflowState || inferHarnessWorkflowState(record)}</span></div>
                                        <div>risk: <span className="font-black text-slate-800">{result?.riskDecision || record.riskDecision || inferHarnessRiskDecision(record)}</span></div>
                                        <div>approval: <span className="font-black text-slate-800">{result?.approvalState || record.approvalState || inferHarnessApprovalState(record, inferHarnessWorkflowState(record))}</span></div>
                                        <div>counts: <span className="font-black text-slate-800">E {result?.diagnostics?.eventCount ?? 0} · A {result?.diagnostics?.approvalCount ?? 0} · T {result?.diagnostics?.timelineCount ?? 0}</span></div>
                                    </div>
                                    {result?.status === 'success' ? (
                                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Rule Impact Summary</p>
                                                <p className="text-[11px] font-black text-amber-800">오버라이드 {result?.overrideCount ?? 0}건 · Critical {result?.criticalRuleCount ?? 0}</p>
                                            </div>
                                            <p className="mt-2 text-xs font-bold leading-relaxed text-amber-800">{result?.ruleImpactNarrative || '저장된 룰 개입 요약이 없습니다.'}</p>
                                            {result?.ruleImpactRuleCodes && result.ruleImpactRuleCodes.length > 0 ? (
                                                <p className="mt-1 text-[10px] font-bold text-amber-700 break-all">룰 코드: {result.ruleImpactRuleCodes.slice(0, 4).join(', ')}{result.ruleImpactRuleCodes.length > 4 ? ` 외 ${result.ruleImpactRuleCodes.length - 4}개` : ''}</p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {result?.message ? <p className="mt-2 text-xs font-bold text-rose-700">{result.message}</p> : null}
                                    {result?.warning ? <p className="mt-2 text-xs font-bold text-amber-700">{result.warning}</p> : null}
                                    {result?.diagnostics && !result.diagnostics.found ? (
                                        <p className="mt-2 text-xs font-bold text-amber-700">저장 환경은 응답했지만 해당 run의 persisted 데이터는 아직 확인되지 않았습니다.</p>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showGuide && <SettingsGuide onClose={() => setShowGuide(false)} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-indigo-100">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">1단계: Google Gemini API 연결</h3>
                    <InterpretationCardGrid
                        items={apiInterpretationCards}
                        className="grid grid-cols-1 gap-3 mb-5"
                        cardClassName="rounded-2xl border p-4"
                    />
                    <label className="block text-sm font-bold text-slate-600 mb-2">무료 API 키</label>
                    <div className="relative mb-4">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={freeApiKey}
                            onChange={(e) => handleFreeApiKeyChange(e.target.value)}
                            placeholder="무료 API 키 입력"
                            className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 font-mono text-sm transition-all"
                        />
                    </div>

                    <label className="block text-sm font-bold text-slate-600 mb-2">유료 API 키</label>
                    <div className="relative mb-4">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={paidApiKey}
                            onChange={(e) => handlePaidApiKeyChange(e.target.value)}
                            placeholder="유료 API 키 입력"
                            className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 font-mono text-sm transition-all"
                        />
                    </div>

                    <label className="block text-sm font-bold text-slate-600 mb-2">관리자 PIN 번호</label>
                    <div className="relative mb-2">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={adminPin}
                            onChange={(e) => handleAdminPinChange(e.target.value)}
                            placeholder="관리자 PIN 번호 입력"
                            className="w-full p-4 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 font-mono text-sm transition-all"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600">{showKey ? '숨김' : '보기'}</button>
                    </div>
                    <span className="text-xs text-indigo-500 font-normal cursor-pointer hover:underline" onClick={() => window.open('https://aistudio.google.com/app/apikey')}>키가 없으신가요?</span>
                    <div className="mt-5 flex items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={isPaidApiMode}
                            onChange={(e) => handlePaidApiModeToggle(e.target.checked)}
                            className="w-5 h-5 rounded border-slate-300 text-indigo-600"
                        />
                        <span className="text-sm font-bold text-slate-700">🚀 대규모 고속 처리 모드 (유료 API)</span>
                        </label>
                        <span className={`text-xs font-black px-3 py-1 rounded-full ${isPaidApiMode ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {isPaidApiMode ? '현재: 유료 API' : '현재: 무료 API'}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-200">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">2단계: 현장 정보 설정</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2">현장명</label>
                            <input type="text" value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">현장소장</label>
                                <input type="text" value={settings.siteManager} onChange={(e) => setSettings({ ...settings, siteManager: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">안전관리자</label>
                                <input type="text" value={settings.safetyManager} onChange={(e) => setSettings({ ...settings, safetyManager: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-200 lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">3단계: 공종 및 팀 구성</h3>
                    <textarea value={jobFieldInput} onChange={(e) => setJobFieldInput(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl h-32" placeholder="시스템, 철근, 형틀, 전기..." />
                    <div className="text-xs text-slate-400 mt-2">감지된 공종: <span className="font-bold text-emerald-600">{jobFieldInput.split(',').filter((s) => s.trim()).length}개</span></div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-violet-200 lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 sm:mb-6">개인 안전역량 가중치 설정</h3>
                    <InterpretationCardGrid
                        items={policyInterpretationCards}
                        className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-5"
                        cardClassName="rounded-2xl border p-4"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">심리 지표(w1)</label><input type="number" step="0.01" value={settings.competencyWeights?.psychological ?? 0.2} onChange={(e) => updateWeights({ psychological: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">업무 이해도(w2)</label><input type="number" step="0.01" value={settings.competencyWeights?.jobUnderstanding ?? 0.22} onChange={(e) => updateWeights({ jobUnderstanding: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">위험성평가 이해도(w3)</label><input type="number" step="0.01" value={settings.competencyWeights?.riskAssessmentUnderstanding ?? 0.22} onChange={(e) => updateWeights({ riskAssessmentUnderstanding: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">숙련도(w4)</label><input type="number" step="0.01" value={settings.competencyWeights?.proficiency ?? 0.18} onChange={(e) => updateWeights({ proficiency: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">개선이행도(w5)</label><input type="number" step="0.01" value={settings.competencyWeights?.improvementExecution ?? 0.18} onChange={(e) => updateWeights({ improvementExecution: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">반복위반 패널티(w6)</label><input type="number" step="0.1" value={settings.competencyWeights?.repeatViolationPenalty ?? 1} onChange={(e) => updateWeights({ repeatViolationPenalty: Number(e.target.value) })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">가중치 버전</label>
                            <input type="text" value={settings.competencyWeights?.version ?? 'v1.0.0'} onChange={(e) => updateWeights({ version: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" />
                        </div>
                        <div className={`text-xs font-bold rounded-lg p-3 border ${weightSum >= 0.95 && weightSum <= 1.05 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            현재 w1~w5 합계: {weightSum.toFixed(2)} {weightSum >= 0.95 && weightSum <= 1.05 ? '(권장 범위)' : '(권장 범위 이탈)'}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-amber-200 lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">승인 정책</h3>
                    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={!!settings.approvalPolicy?.strictRoleGate} onChange={(e) => setSettings({ ...settings, approvalPolicy: { ...(settings.approvalPolicy || { strictRoleGate: false }), strictRoleGate: e.target.checked } })} className="w-5 h-5 rounded border-slate-300 text-amber-600" />
                        <span className="text-sm font-bold text-slate-700">항상 안전관리자 엄격 기준으로 승인 차단 규칙 적용</span>
                    </label>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-emerald-200 lg:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">안전 등급 컷오프 설정</h3>
                        <button
                            type="button"
                            onClick={() => setSettings((prev) => ({
                                ...prev,
                                safetyLevelThresholds: {
                                    advancedMin: 80,
                                    intermediateMin: 60,
                                },
                            }))}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-black border border-emerald-200 hover:bg-emerald-100"
                        >
                            기준 복원 (80/60)
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">고급 최소 점수 (고급: score ≥ advancedMin)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={settings.safetyLevelThresholds?.advancedMin ?? 80}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    safetyLevelThresholds: {
                                        advancedMin: Number(e.target.value) || 0,
                                        intermediateMin: settings.safetyLevelThresholds?.intermediateMin ?? 60,
                                    },
                                })}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">중급 최소 점수 (중급: score ≥ intermediateMin)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={settings.safetyLevelThresholds?.intermediateMin ?? 60}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    safetyLevelThresholds: {
                                        advancedMin: settings.safetyLevelThresholds?.advancedMin ?? 80,
                                        intermediateMin: Number(e.target.value) || 0,
                                    },
                                })}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                            />
                        </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                        저장 시 자동 보정 규칙: 0~100 범위로 정규화되며, 중급 최소 점수는 고급 최소 점수를 초과할 수 없습니다.
                    </p>
                    <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p className="text-[11px] font-black text-slate-600 mb-2">실시간 등급 예시</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold">
                            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">68점 → {getPreviewSafetyLevel(68)}</div>
                            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">69점 → {getPreviewSafetyLevel(69)}</div>
                            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">92점 → {getPreviewSafetyLevel(92)}</div>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500">현재 기준: 고급 ≥ {normalizedAdvancedThreshold}, 중급 ≥ {normalizedIntermediateThreshold}, 그 미만 초급</p>
                    </div>
                </div>

                {/* OCR 배치 분할 단위 설정 */}
                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-violet-200 lg:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                            <h3 className="text-lg sm:text-xl font-bold text-slate-900">OCR 일괄 분석 배치 크기</h3>
                            <p className="text-xs text-slate-500 mt-1">전체 재분석 시 한 번에 처리할 최대 건수입니다. API 할당량 절약을 위해 50~100건을 권장합니다.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSettings((prev) => ({ ...prev, batchSplitSize: 50 }))}
                            className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-black border border-violet-200 hover:bg-violet-100"
                        >
                            기본값 복원 (50)
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="range"
                            min={10}
                            max={300}
                            step={10}
                            value={settings.batchSplitSize ?? 50}
                            onChange={(e) => setSettings({ ...settings, batchSplitSize: Number(e.target.value) })}
                            className="flex-1 accent-violet-600"
                        />
                        <input
                            type="number"
                            min={10}
                            max={500}
                            step={10}
                            value={settings.batchSplitSize ?? 50}
                            onChange={(e) => setSettings({ ...settings, batchSplitSize: Number(e.target.value) || 50 })}
                            className="w-20 p-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-center text-sm"
                        />
                        <span className="text-sm font-bold text-slate-600 whitespace-nowrap">건 / 회</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div className={`p-2 rounded-lg border ${(settings.batchSplitSize ?? 50) <= 50 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-black' : 'border-slate-200 text-slate-500'}`}>
                            10~50건<br/><span className="font-normal">절약 모드</span>
                        </div>
                        <div className={`p-2 rounded-lg border ${(settings.batchSplitSize ?? 50) > 50 && (settings.batchSplitSize ?? 50) <= 150 ? 'bg-violet-50 border-violet-200 text-violet-700 font-black' : 'border-slate-200 text-slate-500'}`}>
                            51~150건<br/><span className="font-normal">균형 모드</span>
                        </div>
                        <div className={`p-2 rounded-lg border ${(settings.batchSplitSize ?? 50) > 150 ? 'bg-amber-50 border-amber-200 text-amber-700 font-black' : 'border-slate-200 text-slate-500'}`}>
                            151건 이상<br/><span className="font-normal">⚠️ 할당량 주의</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-indigo-200 lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-5">피드백 전송 연동 (Webhook)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-slate-600 mb-2">Webhook URL</label>
                            <input
                                type="url"
                                value={settings.feedbackChannel?.webhookUrl || ''}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    feedbackChannel: {
                                        webhookUrl: e.target.value,
                                        timeoutMs: settings.feedbackChannel?.timeoutMs ?? 8000,
                                        includeMetadata: settings.feedbackChannel?.includeMetadata ?? true,
                                    },
                                })}
                                placeholder="https://hooks.slack.com/services/..."
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-2">타임아웃(ms)</label>
                            <input
                                type="number"
                                min={2000}
                                step={500}
                                value={settings.feedbackChannel?.timeoutMs ?? 8000}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    feedbackChannel: {
                                        webhookUrl: settings.feedbackChannel?.webhookUrl || '',
                                        timeoutMs: Number(e.target.value) || 8000,
                                        includeMetadata: settings.feedbackChannel?.includeMetadata ?? true,
                                    },
                                })}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                            />
                        </div>
                    </div>
                    <label className="inline-flex items-center gap-3 cursor-pointer select-none mt-4">
                        <input
                            type="checkbox"
                            checked={settings.feedbackChannel?.includeMetadata ?? true}
                            onChange={(e) => setSettings({
                                ...settings,
                                feedbackChannel: {
                                    webhookUrl: settings.feedbackChannel?.webhookUrl || '',
                                    timeoutMs: settings.feedbackChannel?.timeoutMs ?? 8000,
                                    includeMetadata: e.target.checked,
                                },
                            })}
                            className="w-5 h-5 rounded border-slate-300 text-indigo-600"
                        />
                        <span className="text-sm font-bold text-slate-700">전송 시 현장/시간/버전 메타데이터 포함</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                        비워두면 피드백 탭은 데모 모드(시뮬레이션)로 동작합니다. URL을 입력하면 실제 전송을 시도하고,
                        실패 시 로컬 Outbox에 자동 보관됩니다.
                    </p>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-cyan-200 lg:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">다국어 교육 기본 언어 세트</h3>
                        <button
                            type="button"
                            onClick={() => setSettings((prev) => ({ ...prev, trainingLanguagePreset: [...CURRENT_SITE_LANGUAGE_SET] }))}
                            className="px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-[11px] font-black border border-cyan-200 hover:bg-cyan-100"
                        >
                            현장 국적 기본값 복원
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {TRAINING_LANGUAGE_OPTIONS.map((lang) => {
                            const currentPreset = normalizeTrainingLanguagePreset(settings.trainingLanguagePreset);
                            return (
                                <label key={lang.code} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                                    <input
                                        type="checkbox"
                                        checked={currentPreset.includes(lang.code)}
                                        onChange={() => toggleTrainingLanguagePreset(lang.code)}
                                    />
                                    <span className="text-xs font-bold text-slate-700">{lang.label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                        여기서 저장한 기본 언어 세트는 관리자 다국어 안내 생성 화면의 초기 선택값으로 자동 반영됩니다.
                    </p>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-200 lg:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900">가중치 버전 변경 이력</h3>
                        <button onClick={handleClearWeightHistory} className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">이력 초기화</button>
                    </div>
                    {weightHistory.length === 0 ? (
                        <p className="text-sm text-slate-400">저장된 가중치 버전 변경 이력이 없습니다.</p>
                    ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                            {weightHistory.slice(0, 10).map((entry, idx) => (
                                <div key={`${entry.timestamp}-${idx}`} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="font-black text-slate-700">{entry.previousVersion || 'N/A'} → {entry.nextVersion}</div>
                                        <button onClick={() => handleApplyWeightHistory(entry)} className="w-full sm:w-auto px-2.5 py-1.5 text-[11px] font-black rounded-md bg-indigo-600 text-white hover:bg-indigo-700">이 버전 복원</button>
                                    </div>
                                    <div className="text-slate-500 mt-1">{new Date(entry.timestamp).toLocaleString()}</div>
                                    <div className="text-slate-600 mt-2">w1:{entry.weights?.psychological ?? '-'} / w2:{entry.weights?.jobUnderstanding ?? '-'} / w3:{entry.weights?.riskAssessmentUnderstanding ?? '-'} / w4:{entry.weights?.proficiency ?? '-'} / w5:{entry.weights?.improvementExecution ?? '-'} / w6:{entry.weights?.repeatViolationPenalty ?? '-'}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-200">
                <button onClick={handleResetData} className="w-full sm:w-auto px-6 py-3 text-red-600 font-bold bg-red-50 hover:bg-red-100 rounded-xl transition-colors">데이터 초기화 (Factory Reset)</button>
                <button onClick={handleSave} className="w-full sm:w-auto px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 transition-all">설정 저장 및 적용</button>
            </div>

            <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-5">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                    </svg>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900">시스템 및 특허 정보 (System & Patent Info)</h3>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-4 gap-y-3 text-sm">
                    <dt className="font-bold text-slate-600">시스템명</dt>
                    <dd className="text-slate-800">{PSI_SYSTEM_NAME}</dd>

                    <dt className="font-bold text-slate-600">발명의 명칭</dt>
                    <dd className="text-slate-800">인공지능(AI) 기반 위험성평가 무결성 검증 및 대규모 근로자 안전 관리 자동화 시스템</dd>

                    <dt className="font-bold text-slate-600">출원번호</dt>
                    <dd className="text-slate-800">10-2026-0039151</dd>

                    <dt className="font-bold text-slate-600">출원일자</dt>
                    <dd className="text-slate-800">2026.03.04</dd>

                    <dt className="font-bold text-slate-600">발명자</dt>
                    <dd className="text-slate-800">박성훈</dd>

                    <dt className="font-bold text-slate-600">법적 상태</dt>
                    <dd className="text-slate-800">대한민국 특허청 심사 대기 및 우선권 주장(선출원) 완료</dd>
                </dl>
            </div>
        </div>
    );
};

export default Settings;
