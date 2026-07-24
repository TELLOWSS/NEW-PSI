
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkerRecord, SafetyCheckRecord, Page } from '../types';
import { StatCard } from '../components/StatCard';
import { NoticeCallout } from '../components/shared/NoticeCallout';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { Tooltip } from '../components/shared/Tooltip';
import { PrecisionOperationsBoard } from '../components/dashboard/PrecisionOperationsBoard';
import { AdvancedOperationsOverview } from '../components/dashboard/AdvancedOperationsOverview';
import { MOBILE_CARD_GRID_ITEM_CLASS, MOBILE_CARD_PANEL_CLASS, MOBILE_CARD_PANEL_COMPACT_CLASS } from '../components/shared/cardTokens';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { PSI_APP_VERSION } from '../lib/appInfo';
import type { SelectedTarget } from '../components/charts/TradeNationalityCrossChart';
import {
    ALL_NATIONALITY_LABEL,
    getTargetGroupKey,
    normalizeDashboardTrade,
    transformDashboardData,
} from '../utils/dashboardDataTransformer';
import {
    DASHBOARD_AUDIENCE_META,
    buildAudienceInsightMessage,
    buildAudienceQuickGuide,
    buildComparisonSectionMeta,
    buildDashboardSummaryCards,
    buildMobileInsightTabs,
    buildOperationalFocusCards,
    buildOverviewStatCards,
    type DashboardAudience,
    type DashboardInsightTab,
    type DashboardInsightTabConfig,
    type DashboardStatCardConfig,
} from '../utils/roleViewModel';
import { BRAND_TONE } from '../utils/brandToneTokens';
import { createMetricSessionId, trackUIViewMetric } from '../utils/uiViewModeMetrics';
import { useDevMode } from '../contexts/DevModeContext';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import type { UiAudienceMode } from '../config/routeMeta';
import { getUserRolePreset, mapUserRolePresetToDashboardAudience, USER_ROLE_PRESET_CHANGED_EVENT } from '../utils/userRolePresetUtils';
import { getPhrase } from '../utils/phraseUtils';
import { EmptyState, LoadingSkeleton, MetricCard, SectionCard, WorkTypeBadge } from '../components/common';
import {
    buildSurveyRiskGapRows,
    getRiskGapDirectionLabel,
    getRiskGapStatusLabel,
    getTopComparableGap,
    readManagerRiskBaselines,
    type ManagerRiskBaselineMap,
} from '../utils/surveyRiskGap';
import { loadSurveyRiskBaselines } from '../services/surveyRiskBaselineService';
import { calculateCoreMetricSnapshot } from '../utils/coreMetrics';

const NationalityChart = lazy(() => import('../components/charts/NationalityChart').then(module => ({ default: module.NationalityChart })));
const TopWeaknessesChart = lazy(() => import('../components/charts/TopWeaknessesChart').then(module => ({ default: module.TopWeaknessesChart })));
const SafetyCheckDonutChart = lazy(() => import('../components/charts/SafetyCheckDonutChart').then(module => ({ default: module.SafetyCheckDonutChart })));
const TradeNationalityCrossChart = lazy(() => import('../components/charts/TradeNationalityCrossChart').then(module => ({ default: module.TradeNationalityCrossChart })));
const TradeSixMetricRadar = lazy(() => import('../components/charts/TradeSixMetricRadar').then(module => ({ default: module.TradeSixMetricRadar })));
const WorkerTrendPanel = lazy(() => import('../components/charts/WorkerTrendPanel').then(module => ({ default: module.WorkerTrendPanel })));
const MonthlyTrendChart = lazy(() => import('../components/charts/MonthlyTrendChart').then(module => ({ default: module.MonthlyTrendChart })));

interface DashboardProps {
    workerRecords: WorkerRecord[];
    safetyCheckRecords: SafetyCheckRecord[];
    setCurrentPage: (page: Page) => void;
}

type DashboardTeamOption = {
    key: string;
    team: string;
    trade: string;
    label: string;
    workerCount: number;
    avgScore: number;
};

type DashboardQuickActionConfig = {
    key: string;
    label: string;
    page: Page;
    variant: 'ghost' | 'solid';
    icon: React.ReactNode;
};

type HarnessDashboardDrilldownType = 'approval-backlog' | 'immediate-attention' | 'fallback-pending' | 'trade-hotspot';

type HarnessDrilldownActionPlan = {
    headline: string;
    detail: string;
    primaryLabel: string;
    secondaryLabel: string;
    secondaryPage: Page;
};

type DashboardViewMode = 'full' | 'balanced' | 'essential';

type DashboardTeamComparisonPreset = {
    id: string;
    name: string;
    trade: string;
    teams: string[];
    createdAt: number;
    lastUsedAt?: number;
    pinned?: boolean;
    appliedAtHistory?: number[];
};

type DashboardTradeComparisonPreset = {
    id: string;
    name: string;
    trades: string[];
    createdAt: number;
    lastUsedAt?: number;
    pinned?: boolean;
    appliedAtHistory?: number[];
};

// 관리 직군 여부 확인 함수
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const getDashboardTeamKey = (trade: string, team: string) => `${trade}::${team}`;

const inferHarnessWorkflowState = (record: Partial<WorkerRecord>) => {
    if (record.workflowState) return record.workflowState;
    if (record.secondPassStatus === 'IN_PROGRESS') return 'second_pass_analyzing';
    if (record.reviewStatus === 'PENDING' || record.approvalStatus === 'PENDING') return 'awaiting_manager_approval';
    if (record.ocrErrorType || record.secondPassStatus === 'NEEDED') return 'manual_review_required';
    if (record.secondPassStatus === 'DONE' || record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED') return 'completed';
    return 'uploaded';
};

const inferHarnessRiskDecision = (record: Partial<WorkerRecord>) => {
    if (record.riskDecision) return record.riskDecision;
    if (record.ocrErrorType) return 'IMMEDIATE_ATTENTION';
    if (record.secondPassStatus === 'NEEDED') return 'SUPPLEMENTARY_REVIEW';
    return 'SAFE_TO_PROCEED';
};

const inferHarnessApprovalState = (record: Partial<WorkerRecord>, workflowState: string) => {
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

const DASHBOARD_VIEW_MODE_STORAGE_KEY = 'psi_dashboard_view_mode';
const DASHBOARD_VIEW_MODE_MANUAL_KEY = 'psi_dashboard_view_mode_manual';
const DASHBOARD_RISKMAP_FOCUS_KEY = 'psi_dashboard_riskmap_focus_v1';
const DASHBOARD_RISKMAP_FOCUS_EVENT = 'psi-dashboard-riskmap-focus';
const DASHBOARD_UI_MODE_STORAGE_KEY = 'psi_dashboard_ui_mode_v2';
const DASHBOARD_UI_MODE_LOCK_KEY = 'psi_dashboard_ui_mode_lock_v2';
const DASHBOARD_TEAM_COMPARISON_PRESETS_KEY = 'psi_dashboard_team_comparison_presets';
const DASHBOARD_TRADE_COMPARISON_PRESETS_KEY = 'psi_dashboard_trade_comparison_presets';
const DASHBOARD_LIVE_SYNC_SNAPSHOT_KEY = 'psi_dashboard_live_sync_snapshot_v1';
const TEAM_COMPARISON_MAX_SELECTION = 3;
const TRADE_COMPARISON_MAX_SELECTION = 3;

const getStoredDashboardTeamComparisonPresets = (): DashboardTeamComparisonPreset[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(DASHBOARD_TEAM_COMPARISON_PRESETS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((preset): preset is DashboardTeamComparisonPreset => {
            return Boolean(
                preset
                && typeof preset.id === 'string'
                && typeof preset.name === 'string'
                && typeof preset.trade === 'string'
                && Array.isArray(preset.teams)
                && typeof preset.createdAt === 'number',
            );
        }).map((preset) => ({
            id: preset.id,
            name: String(preset.name || '').trim() || `${preset.trade} 팀 비교`,
            trade: preset.trade,
            teams: preset.teams.filter((team) => typeof team === 'string' && team.trim().length > 0),
            createdAt: preset.createdAt,
            lastUsedAt: typeof preset.lastUsedAt === 'number' ? preset.lastUsedAt : undefined,
            pinned: Boolean(preset.pinned),
            appliedAtHistory: Array.isArray((preset as Partial<DashboardTeamComparisonPreset>).appliedAtHistory)
                ? (preset as Partial<DashboardTeamComparisonPreset>).appliedAtHistory
                    ?.filter((value): value is number => typeof value === 'number')
                    .slice(-60)
                : [],
        })).slice(0, 12);
    } catch {
        return [];
    }
};

const getStoredDashboardTradeComparisonPresets = (): DashboardTradeComparisonPreset[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(DASHBOARD_TRADE_COMPARISON_PRESETS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((preset): preset is DashboardTradeComparisonPreset => {
            return Boolean(
                preset
                && typeof preset.id === 'string'
                && typeof preset.name === 'string'
                && Array.isArray(preset.trades)
                && typeof preset.createdAt === 'number',
            );
        }).map((preset) => ({
            id: preset.id,
            name: String(preset.name || '').trim() || `공종 ${preset.trades.length}개 비교`,
            trades: preset.trades.filter((trade) => typeof trade === 'string' && trade.trim().length > 0),
            createdAt: preset.createdAt,
            lastUsedAt: typeof preset.lastUsedAt === 'number' ? preset.lastUsedAt : undefined,
            pinned: Boolean(preset.pinned),
            appliedAtHistory: Array.isArray((preset as Partial<DashboardTradeComparisonPreset>).appliedAtHistory)
                ? (preset as Partial<DashboardTradeComparisonPreset>).appliedAtHistory
                    ?.filter((value): value is number => typeof value === 'number')
                    .slice(-60)
                : [],
        })).slice(0, 12);
    } catch {
        return [];
    }
};

const areSameTeamList = (left: string[], right: string[]): boolean => {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort((a, b) => a.localeCompare(b, 'ko'));
    const rightSorted = [...right].sort((a, b) => a.localeCompare(b, 'ko'));
    return leftSorted.every((value, index) => value === rightSorted[index]);
};

const areSameTradeList = (left: string[], right: string[]): boolean => {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort((a, b) => a.localeCompare(b, 'ko'));
    const rightSorted = [...right].sort((a, b) => a.localeCompare(b, 'ko'));
    return leftSorted.every((value, index) => value === rightSorted[index]);
};

const DASHBOARD_SURVEY_RISK_KEYWORDS = ['추락', '끼임', '감전', '충돌'];

const getSurveySpecificityScore = (text: string): number => {
    const normalized = String(text || '').trim();
    if (normalized.length < 4) return 0;
    const highSpecific = /매일|항상|출근|작업 전|사용 전|확인하겠|착용하겠|실시하겠|점검하겠|체결하겠|신고하겠/;
    const midSpecific = /안전|조심|주의|확인|착용|점검|벨트|안전모|장갑|안전화/;
    if (highSpecific.test(normalized) && normalized.length > 10) return 5;
    if (highSpecific.test(normalized)) return 4;
    if (midSpecific.test(normalized) && normalized.length > 8) return 3;
    if (midSpecific.test(normalized)) return 2;
    return 1;
};

const formatPresetUsedAt = (timestamp?: number): string => {
    if (!timestamp) return '최근 사용 없음';
    const diffMs = Date.now() - timestamp;
    if (diffMs < 60_000) return '방금 사용';
    if (diffMs < 3_600_000) return `${Math.max(1, Math.round(diffMs / 60_000))}분 전 사용`;
    if (diffMs < 86_400_000) return `${Math.max(1, Math.round(diffMs / 3_600_000))}시간 전 사용`;
    return `${Math.max(1, Math.round(diffMs / 86_400_000))}일 전 사용`;
};

const getRecentPresetApplyCount = (appliedAtHistory?: number[], days: number = 7): number => {
    if (!Array.isArray(appliedAtHistory) || appliedAtHistory.length === 0) return 0;
    const windowStart = Date.now() - (days * 24 * 60 * 60 * 1000);
    return appliedAtHistory.filter((timestamp) => typeof timestamp === 'number' && timestamp >= windowStart).length;
};

const downloadDashboardTextFile = (fileName: string, content: string, mimeType: string) => {
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

const getStoredDashboardViewMode = (): DashboardViewMode | null => {
    if (typeof window === 'undefined') return null;
    try {
        const value = window.localStorage.getItem(DASHBOARD_VIEW_MODE_STORAGE_KEY);
        if (value === 'full' || value === 'balanced' || value === 'essential') {
            return value;
        }
    } catch {
        return null;
    }
    return null;
};

const getStoredDashboardViewModeManual = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(DASHBOARD_VIEW_MODE_MANUAL_KEY) === 'true';
    } catch {
        return false;
    }
};

const getRecommendedDashboardViewMode = (audience: DashboardAudience, viewportWidth: number): DashboardViewMode => {
    if (viewportWidth < 640) return 'essential';
    if (audience === 'worker') return 'essential';
    if (audience === 'executive') return 'full';
    return viewportWidth >= 1280 ? 'full' : 'balanced';
};

const getDefaultDashboardViewMode = (viewportWidth: number): DashboardViewMode => {
    if (viewportWidth < 640) return 'essential';
    if (viewportWidth >= 1280) return 'full';
    return 'balanced';
};

const ChartSkeleton: React.FC<{ minHeight?: string }> = ({ minHeight = '220px' }) => (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 sm:p-6 animate-pulse" style={{ minHeight }}>
        <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-3 w-64 bg-slate-100 dark:bg-slate-700 rounded mb-6" />
        <div className="h-40 sm:h-52 rounded-xl bg-slate-100 dark:bg-slate-700" />
    </div>
);

const DeferredSection: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode; rootMargin?: string }> = ({
    children,
    fallback = <ChartSkeleton />,
    rootMargin = '240px',
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isVisible) return;
        const node = containerRef.current;
        if (!node) return;

        if (!('IntersectionObserver' in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some(entry => entry.isIntersecting)) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [isVisible, rootMargin]);

    return <div ref={containerRef}>{isVisible ? children : fallback}</div>;
};

const Dashboard: React.FC<DashboardProps> = ({ workerRecords, safetyCheckRecords, setCurrentPage }) => {
    const { isDevMode } = useDevMode();
    const { mode: operationalMode } = useOperationalMode();
    const isImmediateOperationalMode = operationalMode === 'immediate';
    const [managerRiskBaselines, setManagerRiskBaselines] = useState<ManagerRiskBaselineMap>(() => readManagerRiskBaselines());
    // 순수 근로자 데이터만 필터링 (관리 직군 제외)

    const workerOnlyRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);

    useEffect(() => {
        let cancelled = false;
        void loadSurveyRiskBaselines().then((result) => {
            if (!cancelled) setManagerRiskBaselines(result.baselines);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // 팀별 보기: 팀장 기준 유니크 팀 목록 추출
    const [selectedTeam, setSelectedTeam] = useState<string | 'ALL'>('ALL');
    const teamOptions = useMemo<DashboardTeamOption[]>(() => {
        const grouped = new Map<string, WorkerRecord[]>();

        workerOnlyRecords.forEach((record) => {
            const team = record.teamLeader?.trim();
            const trade = normalizeDashboardTrade(record.jobField);
            if (!team || !trade) return;
            const key = getDashboardTeamKey(trade, team);
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(record);
        });

        return Array.from(grouped.entries()).map(([key, records]) => {
            const first = records[0];
            const team = first.teamLeader?.trim() || '미지정 팀';
            const trade = normalizeDashboardTrade(first.jobField);
            const teamMetrics = calculateCoreMetricSnapshot(records);

            return {
                key,
                team,
                trade,
                label: `${team} (${trade})`,
                workerCount: teamMetrics.totalWorkers,
                avgScore: teamMetrics.averageScore,
            };
        }).sort((a, b) => a.avgScore - b.avgScore || a.label.localeCompare(b.label, 'ko'));
    }, [workerOnlyRecords]);

    const selectedTeamOption = useMemo(() => {
        if (selectedTeam === 'ALL') return null;
        return teamOptions.find((item) => item.key === selectedTeam) || null;
    }, [selectedTeam, teamOptions]);

    // 팀별 필터링
    const filteredWorkerRecords = useMemo(() => {
        if (selectedTeam === 'ALL') return workerOnlyRecords;
        if (!selectedTeamOption) return workerOnlyRecords;
        return workerOnlyRecords.filter((record) => (
            (record.teamLeader || '').trim() === selectedTeamOption.team
            && normalizeDashboardTrade(record.jobField) === selectedTeamOption.trade
        ));
    }, [workerOnlyRecords, selectedTeam, selectedTeamOption]);

    const teamSummaries = useMemo(() => {
        return teamOptions;
    }, [teamOptions]);

    const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(null);
    const [selectedTradeForComparison, setSelectedTradeForComparison] = useState<string | null>(null);
    const [activeHarnessDrilldown, setActiveHarnessDrilldown] = useState<{ type: HarnessDashboardDrilldownType; trade?: string } | null>(null);
    const [mobileInsightTab, setMobileInsightTab] = useState<DashboardInsightTab>('chart');
    const [isRiskMapFocusActive, setIsRiskMapFocusActive] = useState<boolean>(false);
    const [teamComparisonSort, setTeamComparisonSort] = useState<'score-asc' | 'score-desc' | 'risk-desc' | 'workers-desc'>('score-asc');
    const [detailViewMode, setDetailViewMode] = useState<'integrated' | 'nationality'>('integrated');
    const [teamViewFilter, setTeamViewFilter] = useState<'all' | 'top3' | 'risk-only'>('all');
    const [selectedTeamsForComparison, setSelectedTeamsForComparison] = useState<string[]>([]);
    const [selectedTradesForComparison, setSelectedTradesForComparison] = useState<string[]>([]);
    const [isComparisonAdvancedOpen, setIsComparisonAdvancedOpen] = useState<boolean>(false);
    const [isDetailedAnalysisRequested, setIsDetailedAnalysisRequested] = useState<boolean>(false);
    const [teamComparisonPresets, setTeamComparisonPresets] = useState<DashboardTeamComparisonPreset[]>(() => getStoredDashboardTeamComparisonPresets());
    const [tradeComparisonPresets, setTradeComparisonPresets] = useState<DashboardTradeComparisonPreset[]>(() => getStoredDashboardTradeComparisonPresets());
    const [presetNameDraft, setPresetNameDraft] = useState<string>('');
    const [tradePresetNameDraft, setTradePresetNameDraft] = useState<string>('');
    const [tradePresetSearchQuery, setTradePresetSearchQuery] = useState<string>('');
    const [tradePresetScope, setTradePresetScope] = useState<'current-trade' | 'all-trades'>('all-trades');
    const [presetSearchQuery, setPresetSearchQuery] = useState<string>('');
    const [presetScope, setPresetScope] = useState<'current-trade' | 'all-trades'>('current-trade');
    const [presetPinLimitNotice, setPresetPinLimitNotice] = useState<string | null>(null);
    const [tradePresetPinLimitNotice, setTradePresetPinLimitNotice] = useState<string | null>(null);
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
    const [editingPresetName, setEditingPresetName] = useState<string>('');
    const [editingTradePresetId, setEditingTradePresetId] = useState<string | null>(null);
    const [editingTradePresetName, setEditingTradePresetName] = useState<string>('');
    const [audienceView, setAudienceView] = useState<DashboardAudience>('manager');
    const [isAudienceManual, setIsAudienceManual] = useState<boolean>(false);
    const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
    const [isDashboardViewModeManual, setIsDashboardViewModeManual] = useState<boolean>(() => getStoredDashboardViewModeManual());
    const [trendTab, setTrendTab] = useState<'average' | 'check'>('average');
    const viewMetricSessionRef = useRef<string>(createMetricSessionId('dashboard'));
    const viewMetricStartRef = useRef<number>(Date.now());
    const teamComparisonSectionRef = useRef<HTMLDivElement | null>(null);
    const riskMapFocusTimeoutRef = useRef<number | null>(null);
    const skipTeamSelectionResetRef = useRef<boolean>(false);
    const [dashboardViewMode, setDashboardViewMode] = useState<DashboardViewMode>(() => {
        const storedMode = getStoredDashboardViewMode();
        if (storedMode && getStoredDashboardViewModeManual()) return storedMode;
        return getDefaultDashboardViewMode(typeof window !== 'undefined' ? window.innerWidth : 1440);
    });

    // 기본/고급 모드 토글 (첫 로딩 및 리셋 시에는 항상 'basic' 통합 보드 노출)
    const [dashboardUIMode, setDashboardUIMode] = useState<'basic' | 'advanced'>(() => {
        return 'basic';
    });
    const [isDashboardUIModeLocked, setIsDashboardUIModeLocked] = useState<boolean>(() => {
        try {
            const saved = window.localStorage.getItem(DASHBOARD_UI_MODE_LOCK_KEY);
            if (saved === null) return true;
            return saved !== 'false';
        } catch {
            return true;
        }
    });

    useEffect(() => {
        try {
            const manualAudience = window.localStorage.getItem('psi_dashboard_audience_manual') === 'true';
            setIsAudienceManual(manualAudience);

            const savedAudience = window.localStorage.getItem('psi_dashboard_audience');
            if (savedAudience === 'worker' || savedAudience === 'manager' || savedAudience === 'executive') {
                setAudienceView(savedAudience);
            } else {
                setAudienceView(mapUserRolePresetToDashboardAudience(getUserRolePreset()));
            }
        } catch {
            setAudienceView('manager');
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem('psi_dashboard_audience', audienceView);
        } catch {
            // ignore localStorage write failures
        }
    }, [audienceView]);

    useEffect(() => {
        try {
            window.localStorage.setItem('psi_dashboard_audience_manual', isAudienceManual ? 'true' : 'false');
        } catch {
            // ignore localStorage write failures
        }
    }, [isAudienceManual]);

    useEffect(() => {
        const syncAudienceByRolePreset = () => {
            const nextAudience = mapUserRolePresetToDashboardAudience(getUserRolePreset());
            setIsAudienceManual(false);
            setAudienceView(nextAudience);
        };

        window.addEventListener(USER_ROLE_PRESET_CHANGED_EVENT, syncAudienceByRolePreset);
        return () => window.removeEventListener(USER_ROLE_PRESET_CHANGED_EVENT, syncAudienceByRolePreset);
    }, []);

    useEffect(() => {
        if (isAudienceManual) return;
        setAudienceView(mapUserRolePresetToDashboardAudience(getUserRolePreset()));
    }, [isAudienceManual]);

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(DASHBOARD_VIEW_MODE_STORAGE_KEY, dashboardViewMode);
            window.localStorage.setItem(DASHBOARD_VIEW_MODE_MANUAL_KEY, isDashboardViewModeManual ? 'true' : 'false');
        } catch {
            // ignore localStorage write failures
        }
    }, [dashboardViewMode, isDashboardViewModeManual]);

    useEffect(() => {
        try {
            window.localStorage.setItem(DASHBOARD_UI_MODE_LOCK_KEY, isDashboardUIModeLocked ? 'true' : 'false');
        } catch {
            // ignore localStorage write failures
        }
    }, [isDashboardUIModeLocked]);

    useEffect(() => {
        if (isDashboardViewModeManual) return;
        const recommended = getRecommendedDashboardViewMode(audienceView, viewportWidth);
        setDashboardViewMode(recommended);
    }, [audienceView, viewportWidth, isDashboardViewModeManual]);

    useEffect(() => {
        if (!selectedTradeForComparison) {
            setPresetNameDraft('');
            return;
        }
        setPresetNameDraft(`${selectedTradeForComparison} 팀 비교`);
    }, [selectedTradeForComparison]);

    useEffect(() => {
        if (!selectedTradeForComparison && presetScope === 'current-trade') {
            setPresetScope('all-trades');
        }
    }, [presetScope, selectedTradeForComparison]);

    useEffect(() => {
        if (!selectedTradeForComparison && tradePresetScope === 'current-trade') {
            setTradePresetScope('all-trades');
        }
    }, [tradePresetScope, selectedTradeForComparison]);

    useEffect(() => {
        try {
            window.localStorage.setItem(DASHBOARD_TEAM_COMPARISON_PRESETS_KEY, JSON.stringify(teamComparisonPresets.slice(0, 12)));
        } catch {
            // ignore localStorage write failures
        }
    }, [teamComparisonPresets]);

    useEffect(() => {
        try {
            window.localStorage.setItem(DASHBOARD_TRADE_COMPARISON_PRESETS_KEY, JSON.stringify(tradeComparisonPresets.slice(0, 12)));
        } catch {
            // ignore localStorage write failures
        }
    }, [tradeComparisonPresets]);

    useEffect(() => {
        trackUIViewMetric('view_enter', 'dashboard', viewMetricSessionRef.current, {
            audienceView,
            dashboardViewMode,
            viewportWidth,
        });

        return () => {
            trackUIViewMetric('view_exit', 'dashboard', viewMetricSessionRef.current, {
                dwellMs: Date.now() - viewMetricStartRef.current,
            });
        };
    }, []);

    useEffect(() => {
        try {
            window.localStorage.removeItem(DASHBOARD_UI_MODE_STORAGE_KEY);
        } catch {}

    }, []);

    useEffect(() => {
        document.getElementById('psi-main-content')?.scrollTo({
            top: 0,
            left: 0,
            behavior: 'auto',
        });
    }, [dashboardUIMode]);

    const handleDashboardViewModeChange = (mode: DashboardViewMode) => {
        setIsDashboardViewModeManual(true);
        setDashboardViewMode(mode);
        trackUIViewMetric('view_mode_change', 'dashboard', viewMetricSessionRef.current, {
            mode,
            source: 'manual',
            viewportWidth,
            audienceView,
        });
    };

    const handleDashboardUIModeChange = (mode: 'basic' | 'advanced') => {
        if (isDashboardUIModeLocked && mode === 'advanced') {
            return;
        }
        setDashboardUIMode(mode);
        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'ui_mode_toggle',
            nextMode: mode,
            viewMode: dashboardViewMode,
            audienceView,
        });
    };

    const toggleDashboardUIModeLock = () => {
        setIsDashboardUIModeLocked((previous) => {
            const next = !previous;
            if (next) {
                setDashboardUIMode('basic');
            }
            trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
                control: 'ui_mode_lock_toggle',
                lockEnabled: next,
                viewMode: dashboardViewMode,
                audienceView,
            });
            return next;
        });
    };

    const handleAudienceChange = (audience: DashboardAudience) => {
        setIsAudienceManual(true);
        setAudienceView(audience);
        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'audience_view',
            audience,
            viewportWidth,
        });
    };

    const handleNavigateToTeamComparison = () => {
        setIsDashboardViewModeManual(true);
        setDashboardViewMode('full');
        setMobileInsightTab('team');

        if (!selectedTradeForComparison) {
            const fallbackTrade = tradeQuickAccess[0]?.trade || dashboardData.trades[0] || null;
            if (fallbackTrade) {
                openTradeIntegratedAnalysis(fallbackTrade, 'team');
            }
        }

        window.setTimeout(() => {
            teamComparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);

        trackUIViewMetric('cta_click', 'dashboard', viewMetricSessionRef.current, {
            actionKey: 'jump_team_comparison',
            viewMode: dashboardViewMode,
            audienceView,
            hadSelectedTrade: Boolean(selectedTradeForComparison),
        });
    };

    const handleNavigateToDetailedAnalysis = () => {
        const nextViewMode: DashboardViewMode = viewportWidth >= 1024 ? 'full' : 'balanced';
        setIsDetailedAnalysisRequested(true);
        handleDashboardViewModeChange(nextViewMode);

        window.setTimeout(() => {
            document.getElementById('advanced-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);

        trackUIViewMetric('cta_click', 'dashboard', viewMetricSessionRef.current, {
            actionKey: 'jump_advanced_analysis',
            previousViewMode: dashboardViewMode,
            nextViewMode,
            audienceView,
            viewportWidth,
        });
    };

    const handleQuickActionClick = (action: DashboardQuickActionConfig) => {
        trackUIViewMetric('cta_click', 'dashboard', viewMetricSessionRef.current, {
            actionKey: action.key,
            targetPage: action.page,
            viewMode: dashboardViewMode,
            audienceView,
            viewportWidth,
        });
        setCurrentPage(action.page);
    };

    const resetComparisonState = () => {
        setSelectedTeam('ALL');
        setSelectedTarget(null);
        setSelectedTradeForComparison(null);
        setMobileInsightTab('chart');
        setDetailViewMode('integrated');
        setTeamViewFilter('all');
        setSelectedTeamsForComparison([]);
        setSelectedTradesForComparison([]);
    };

    const openTradeIntegratedAnalysis = (trade: string, nextTab: DashboardInsightTab = 'team') => {
        setSelectedTarget({ trade, nationality: ALL_NATIONALITY_LABEL });
        setSelectedTradeForComparison(trade);
        setMobileInsightTab(nextTab);
        setDetailViewMode('integrated');
        setTeamViewFilter('all');
    };

    const openSelectedTeamNationalityDrilldown = (teamName: string) => {
        if (!selectedTradeForComparison) return;
        setSelectedTeam(getDashboardTeamKey(selectedTradeForComparison, teamName));
        setSelectedTarget({ trade: selectedTradeForComparison, nationality: ALL_NATIONALITY_LABEL });
        setDetailViewMode('integrated');
        setIsComparisonAdvancedOpen(true);
        setMobileInsightTab('chart');
    };

    const openNationalityDetailAnalysis = ({ trade, nationality }: SelectedTarget) => {
        setSelectedTarget({ trade, nationality });
        setSelectedTradeForComparison(trade);
        setMobileInsightTab('chart');
        setDetailViewMode(nationality === ALL_NATIONALITY_LABEL ? 'integrated' : 'nationality');
    };

    useEffect(() => {
        setSelectedTarget(null);
    }, [selectedTeam]);

    useEffect(() => {
        if (selectedTarget?.trade) {
            setSelectedTradeForComparison(selectedTarget.trade);
            setDetailViewMode(selectedTarget.nationality === ALL_NATIONALITY_LABEL ? 'integrated' : 'nationality');
        }
    }, [selectedTarget]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const consumeRiskMapFocusRequest = () => {
            try {
                const raw = window.localStorage.getItem(DASHBOARD_RISKMAP_FOCUS_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw) as { target?: string };
                if (parsed?.target !== 'risk-map') return;

                window.localStorage.removeItem(DASHBOARD_RISKMAP_FOCUS_KEY);
                setIsDashboardViewModeManual(true);
                setDashboardViewMode('full');
                setDashboardUIMode('advanced');
                setMobileInsightTab('chart');

                window.setTimeout(() => {
                    teamComparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setIsRiskMapFocusActive(true);
                    if (riskMapFocusTimeoutRef.current) {
                        window.clearTimeout(riskMapFocusTimeoutRef.current);
                    }
                    riskMapFocusTimeoutRef.current = window.setTimeout(() => {
                        setIsRiskMapFocusActive(false);
                    }, 2200);
                }, 120);
            } catch {
                // ignore storage parse failures
            }
        };

        consumeRiskMapFocusRequest();
        const onStorage = (event: StorageEvent) => {
            if (!event.key || event.key === DASHBOARD_RISKMAP_FOCUS_KEY) {
                consumeRiskMapFocusRequest();
            }
        };

        window.addEventListener('storage', onStorage);
        window.addEventListener(DASHBOARD_RISKMAP_FOCUS_EVENT, consumeRiskMapFocusRequest);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(DASHBOARD_RISKMAP_FOCUS_EVENT, consumeRiskMapFocusRequest);
            if (riskMapFocusTimeoutRef.current) {
                window.clearTimeout(riskMapFocusTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (selectedTeam !== 'ALL' && teamOptions.length > 0 && !teamOptions.some((item) => item.key === selectedTeam)) {
            setSelectedTeam('ALL');
        }
    }, [selectedTeam, teamOptions]);

    useEffect(() => {
        if (skipTeamSelectionResetRef.current) {
            skipTeamSelectionResetRef.current = false;
            return;
        }
        setSelectedTeamsForComparison([]);
    }, [selectedTradeForComparison]);


    const stats = useMemo(() => {
        const metrics = calculateCoreMetricSnapshot(filteredWorkerRecords);
        const totalChecks = safetyCheckRecords.length;
        return {
            totalWorkers: metrics.totalWorkers,
            averageScore: metrics.averageScore,
            highRiskWorkers: metrics.protectionPriorityCount,
            totalChecks,
            metricRuleVersion: metrics.ruleVersion,
        };
    }, [filteredWorkerRecords, safetyCheckRecords]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const snapshot = {
                updatedAt: new Date().toISOString(),
                totalWorkers: stats.totalWorkers,
                averageScore: Number(stats.averageScore.toFixed(2)),
                highRiskWorkers: stats.highRiskWorkers,
                totalChecks: stats.totalChecks,
                metricRuleVersion: stats.metricRuleVersion,
            };
            window.localStorage.setItem(DASHBOARD_LIVE_SYNC_SNAPSHOT_KEY, JSON.stringify(snapshot));
        } catch {
            // ignore localStorage write failures
        }
    }, [stats.averageScore, stats.highRiskWorkers, stats.metricRuleVersion, stats.totalChecks, stats.totalWorkers]);

    const harnessDashboardSummary = useMemo(() => {
        const uniqueWorkers = new Set(filteredWorkerRecords.map((record) => record.name));
        const latestRecords = Array.from(uniqueWorkers).map((name) => {
            return filteredWorkerRecords
                .filter((record) => record.name === name)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        });

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
    }, [filteredWorkerRecords]);

    const harnessSummaryMetrics = useMemo(() => [
        {
            key: 'dashboard-harness-connected',
            label: '안전 기록 저장 상태',
            value: `${harnessDashboardSummary.connected}명`,
            helper: `${harnessDashboardSummary.runLinked}명이 처리 번호와 연결되어 있습니다.`,
            tone: BRAND_TONE.emeraldSoft80,
        },
        {
            key: 'dashboard-harness-approval',
            label: '승인 대기 건수',
            value: `${harnessDashboardSummary.approvalBacklog}명`,
            helper: `재확인 필요 ${harnessDashboardSummary.reviewNeeded}명을 포함합니다.`,
            tone: harnessDashboardSummary.approvalBacklog > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-risk',
            label: '즉시 보호 대상',
            value: `${harnessDashboardSummary.immediateAttention}명`,
            helper: '위험 배지 기준으로 우선 보호 조치를 시작할 대상입니다.',
            tone: harnessDashboardSummary.immediateAttention > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-fallback',
            label: '저장 보완/저장 대기',
            value: `${harnessDashboardSummary.fallback + harnessDashboardSummary.pending}명`,
            helper: `저장 보완 ${harnessDashboardSummary.fallback}명 · 저장 대기 ${harnessDashboardSummary.pending}명`,
            tone: harnessDashboardSummary.fallback > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
        },
    ], [harnessDashboardSummary]);

    const harnessOperationalInsights = useMemo(() => {
        const uniqueWorkers = new Set(filteredWorkerRecords.map((record) => record.name));
        const latestRecords = Array.from(uniqueWorkers).map((name) => {
            return filteredWorkerRecords
                .filter((record) => record.name === name)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        });

        const tradeMap = latestRecords.reduce<Record<string, { approval: number; immediate: number; fallback: number }>>((acc, record) => {
            const trade = String(record.jobField || '미지정 공종').trim() || '미지정 공종';
            const workflowState = inferHarnessWorkflowState(record);
            const riskDecision = inferHarnessRiskDecision(record);
            const approvalState = inferHarnessApprovalState(record, workflowState);
            const persistenceState = getHarnessPersistenceState(record);

            if (!acc[trade]) {
                acc[trade] = { approval: 0, immediate: 0, fallback: 0 };
            }

            if (approvalState === 'PENDING' || approvalState === 'REQUIRED') acc[trade].approval += 1;
            if (riskDecision === 'IMMEDIATE_ATTENTION' || riskDecision === 'CRITICAL_STOP') acc[trade].immediate += 1;
            if (persistenceState === 'fallback' || persistenceState === 'pending') acc[trade].fallback += 1;

            return acc;
        }, {});

        const sortedTrades = Object.entries(tradeMap)
            .map(([trade, stats]) => ({ trade, ...stats, totalSignal: stats.approval + stats.immediate + stats.fallback }))
            .filter((item) => item.totalSignal > 0)
            .sort((a, b) => b.totalSignal - a.totalSignal);

        const topTrade = sortedTrades[0] || null;
        const coverageRate = harnessDashboardSummary.total > 0
            ? Math.round((harnessDashboardSummary.connected / harnessDashboardSummary.total) * 100)
            : 0;

        return [
            {
                key: 'dashboard-harness-coverage',
                eyebrow: '시스템 연동률',
                title: `현재 안전 기록 연동 성공률은 ${coverageRate}%입니다.`,
                description: harnessDashboardSummary.pending > 0
                    ? `저장 대기 ${harnessDashboardSummary.pending}명과 저장 보완 ${harnessDashboardSummary.fallback}명을 우선 확인하셔야 안전 이행 추적이 안정됩니다.`
                    : '현재 연동 완료된 기록 기준으로 승인 흐름과 보호 상태를 비교적 안정적으로 추적하실 수 있습니다.',
                tone: coverageRate < 70 ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
            },
            {
                key: 'dashboard-harness-trade',
                eyebrow: '공종 우선순위',
                title: topTrade
                    ? `${topTrade.trade} 공종에서 안전 관리 필요 신호가 가장 많이 감지됩니다.`
                    : '현재 공종별 위험 경보 집중 구간은 크지 않습니다.',
                description: topTrade
                    ? `승인 대기 ${topTrade.approval}건 · 즉시 보호 ${topTrade.immediate}건 · 저장 보완 점검 ${topTrade.fallback}건 기준으로 우선순위를 정리하시면 됩니다.`
                    : '현재는 승인 대기, 즉시 보호, 저장 보완 점검 신호가 특정 공종에 과도하게 몰리지 않았습니다.',
                tone: topTrade ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-action',
                eyebrow: '권장 액션',
                title: harnessDashboardSummary.immediateAttention > 0
                    ? '즉시 관찰 보호 대상부터 승인 대기 대상보다 먼저 확인하시는 편이 안전합니다.'
                    : '즉시 중단 대상이 없다면 승인 대기 건과 시스템 연동 상태부터 점검하시면 됩니다.',
                description: harnessDashboardSummary.immediateAttention > 0
                    ? '보호 우선 배지가 붙은 대상은 보고서 생성보다 현장 보호 조치와 관리자 판단을 먼저 이어가셔야 합니다.'
                    : '현재는 지연보다 승인 누락과 중앙 저장소 연동 누락을 점검하는 것이 좋습니다.',
                tone: harnessDashboardSummary.immediateAttention > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-indigo-200 bg-indigo-50/80',
            },
        ];
    }, [filteredWorkerRecords, harnessDashboardSummary]);

    const harnessAuditSummary = useMemo(() => {
        const uniqueWorkers = new Set(filteredWorkerRecords.map((record) => record.name));
        const latestRecords = Array.from(uniqueWorkers).map((name) => {
            return filteredWorkerRecords
                .filter((record) => record.name === name)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        });

        return latestRecords.reduce((summary, record) => {
            const latestAuditTrail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
            const hasHarnessAudit = latestAuditTrail.some((entry) => /하네스|Harness/i.test(String(entry.note || '')));
            const hasTransitionBlock = latestAuditTrail.some((entry) => /하네스 전이 거부|승인 차단/i.test(String(entry.note || '')));
            const hasApprovalAudit = latestAuditTrail.some((entry) => entry.stage === 'approval');
            const hasValidationAudit = latestAuditTrail.some((entry) => entry.stage === 'validation');

            if (hasHarnessAudit) summary.auditLinked += 1;
            if (hasTransitionBlock) summary.transitionBlocked += 1;
            if (hasApprovalAudit) summary.approvalAudited += 1;
            if (hasValidationAudit) summary.validationAudited += 1;

            summary.auditEvents += latestAuditTrail.length;
            return summary;
        }, {
            auditLinked: 0,
            transitionBlocked: 0,
            approvalAudited: 0,
            validationAudited: 0,
            auditEvents: 0,
        });
    }, [filteredWorkerRecords]);

    const harnessAuditMetrics = useMemo(() => [
        {
            key: 'dashboard-harness-audit-linked',
            label: '이행 검증 대상',
            value: `${harnessAuditSummary.auditLinked}명`,
            helper: '안전 기록 관련 조치 이력이 남아 있는 최신 레코드 기준입니다.',
            tone: harnessAuditSummary.auditLinked > 0 ? 'border-indigo-200 bg-indigo-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-transition-blocked',
            label: '결재 반려 이력',
            value: `${harnessAuditSummary.transitionBlocked}명`,
            helper: '승인 및 재평가 시 정합성 검증으로 반려된 건수입니다.',
            tone: harnessAuditSummary.transitionBlocked > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-approval-audit',
            label: '승인 이력 기록',
            value: `${harnessAuditSummary.approvalAudited}명`,
            helper: '최신 레코드 기준 승인 단계 감사 이력이 존재하는 대상입니다.',
            tone: harnessAuditSummary.approvalAudited > 0 ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-audit-events',
            label: '누적 이행 검증 이력',
            value: `${harnessAuditSummary.auditEvents}건`,
            helper: `검증 ${harnessAuditSummary.validationAudited}명 · 승인 ${harnessAuditSummary.approvalAudited}명 기준`,
            tone: harnessAuditSummary.auditEvents > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
        },
    ], [harnessAuditSummary]);

    const harnessAuditInsights = useMemo(() => {
        return [
            {
                key: 'dashboard-harness-audit-action',
                eyebrow: '감사 우선순위',
                title: harnessAuditSummary.transitionBlocked > 0
                    ? `결재 반려 이력 ${harnessAuditSummary.transitionBlocked}건을 먼저 재검토하셔야 합니다.`
                    : '결재 반려 이력은 크지 않으며 승인 및 저장 연동 점검을 우선하시면 됩니다.',
                description: harnessAuditSummary.transitionBlocked > 0
                    ? '결재 반려는 증빙 누락, 승인 순서 오류, 완료된 평가의 재분석 시도 가능성을 뜻하므로 관리자 검토 우선 대상입니다.'
                    : '현재는 반려 이력보다 승인 대기 건과 중앙 저장소 연동 누락을 줄이는 쪽이 현장 안전 관리에 더 효과적입니다.',
                tone: harnessAuditSummary.transitionBlocked > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-audit-coverage',
                eyebrow: '검증 이력율',
                title: harnessAuditSummary.auditLinked > 0
                    ? `최신 레코드 ${harnessAuditSummary.auditLinked}명에 안전 기록 이행 검증 메모가 연결되어 있습니다.`
                    : '아직 안전 기록 감사 메모가 충분히 누적되지 않았습니다.',
                description: harnessAuditSummary.auditLinked > 0
                    ? `승인 이력 ${harnessAuditSummary.approvalAudited}명, 검증 이력 ${harnessAuditSummary.validationAudited}명을 함께 읽으면 안전 관리 이행 설명이 쉬워집니다.`
                    : '승인/재분석/반려 단계를 진행하면서 이행 이력을 누적해야 대시보드 관리 효율이 커집니다.',
                tone: harnessAuditSummary.auditLinked > 0 ? 'border-indigo-200 bg-indigo-50/80' : 'border-slate-200 bg-slate-50',
            },
        ];
    }, [harnessAuditSummary]);

    const harnessRecentOpsSummary = useMemo(() => {
        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

        return filteredWorkerRecords.reduce((summary, record) => {
            const auditTrail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
            const recentEntries = auditTrail.filter((entry) => {
                const parsed = new Date(entry.timestamp).getTime();
                return !Number.isNaN(parsed) && parsed >= sevenDaysAgo;
            });

            if (recentEntries.length > 0) {
                summary.touchedWorkers.add(record.name);
            }

            recentEntries.forEach((entry) => {
                const note = String(entry.note || '');
                summary.recentAuditEvents += 1;
                if (entry.stage === 'approval') summary.recentApprovals += 1;
                if (entry.stage === 'reassessment') summary.recentReassessments += 1;
                if (/하네스 전이 거부|승인 차단/i.test(note)) summary.recentTransitionBlocks += 1;
                if (/Harness 승인 게이트 동기화|최종 승인|반려/i.test(note)) summary.recentApprovalDecisions += 1;
            });

            return summary;
        }, {
            recentAuditEvents: 0,
            recentApprovals: 0,
            recentReassessments: 0,
            recentTransitionBlocks: 0,
            recentApprovalDecisions: 0,
            touchedWorkers: new Set<string>(),
        });
    }, [filteredWorkerRecords]);

    const harnessRecentOpsMetrics = useMemo(() => {
        const touchedWorkerCount = harnessRecentOpsSummary.touchedWorkers.size;
        return [
            {
                key: 'dashboard-harness-recent-audits',
                label: '최근 7일 검증 이력',
                value: `${harnessRecentOpsSummary.recentAuditEvents}건`,
                helper: `${touchedWorkerCount}명 레코드에서 최근 조치 흔적이 확인되었습니다.`,
                tone: harnessRecentOpsSummary.recentAuditEvents > 0 ? 'border-indigo-200 bg-indigo-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-approvals',
                label: '최근 승인/반려 이력',
                value: `${harnessRecentOpsSummary.recentApprovalDecisions}건`,
                helper: `승인 단계 ${harnessRecentOpsSummary.recentApprovals}건 기준입니다.`,
                tone: harnessRecentOpsSummary.recentApprovalDecisions > 0 ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-blocks',
                label: '최근 결재 반려',
                value: `${harnessRecentOpsSummary.recentTransitionBlocks}건`,
                helper: '승인 반려 또는 결재 기준 미달 반려 메모 기준입니다.',
                tone: harnessRecentOpsSummary.recentTransitionBlocks > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-reassess',
                label: '최근 재평가 실행',
                value: `${harnessRecentOpsSummary.recentReassessments}건`,
                helper: '재평가 단계 기록 기준입니다.',
                tone: harnessRecentOpsSummary.recentReassessments > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
            },
        ];
    }, [harnessRecentOpsSummary]);

    const harnessRecentOpsInsights = useMemo(() => {
        const touchedWorkerCount = harnessRecentOpsSummary.touchedWorkers.size;
        const dominantSignal = [
            { key: 'transition', count: harnessRecentOpsSummary.recentTransitionBlocks, label: '결재 반려' },
            { key: 'reassessment', count: harnessRecentOpsSummary.recentReassessments, label: '재평가' },
            { key: 'approval', count: harnessRecentOpsSummary.recentApprovalDecisions, label: '승인/반려' },
        ].sort((a, b) => b.count - a.count)[0];

        return [
            {
                key: 'dashboard-harness-recent-window',
                eyebrow: '최근 7일 이행 현황',
                title: touchedWorkerCount > 0
                    ? `${touchedWorkerCount}명에서 최근 안전 조치 이력이 확인되었습니다.`
                    : '최근 7일 기준 안전 조치 이력이 아직 많지 않습니다.',
                description: touchedWorkerCount > 0
                    ? `검증 이력 ${harnessRecentOpsSummary.recentAuditEvents}건을 기준으로 최근 승인, 반려, 재평가 흐름을 빠르게 읽으실 수 있습니다.`
                    : '승인/재평가/반려 흐름이 누적되면 대시보드의 단기 안전 관리 분석력이 더 좋아집니다.',
                tone: touchedWorkerCount > 0 ? 'border-indigo-200 bg-indigo-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-dominant',
                eyebrow: '우세 신호',
                title: dominantSignal.count > 0
                    ? `최근 안전 관리 로그에서는 ${dominantSignal.label} 신호가 가장 크게 보입니다.`
                    : '최근 7일 기준으로 특정 안전 관리 신호 쏠림은 크지 않습니다.',
                description: dominantSignal.key === 'transition'
                    ? '승인 기준과 결재 순서를 먼저 점검하시면 업무 혼선을 줄이기 쉽습니다.'
                    : dominantSignal.key === 'reassessment'
                        ? '재평가 진행 횟수가 많으므로 피드백 및 OCR 파일의 글 판독 품질을 함께 보시는 편이 좋습니다.'
                        : dominantSignal.key === 'approval'
                            ? '최근 승인/반려 판단이 활발하므로 승인 근거 내용과 검증 이력 저장 상태를 함께 관리하셔야 합니다.'
                            : '최근 로그가 충분히 쌓이면 주간 안전 조치 요약 정밀도가 더 좋아집니다.',
                tone: dominantSignal.count > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
            },
        ];
    }, [harnessRecentOpsSummary]);

    const harnessRecentTradeHotspots = useMemo(() => {
        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
        const tradeMap = new Map<string, {
            trade: string;
            touchedWorkers: Set<string>;
            transitionBlocks: number;
            approvals: number;
            reassessments: number;
            auditEvents: number;
        }>();

        filteredWorkerRecords.forEach((record) => {
            const trade = normalizeDashboardTrade(record.jobField) || '미지정 공종';
            const auditTrail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
            const recentEntries = auditTrail.filter((entry) => {
                const parsed = new Date(entry.timestamp).getTime();
                return !Number.isNaN(parsed) && parsed >= sevenDaysAgo;
            });

            if (recentEntries.length === 0) {
                return;
            }

            if (!tradeMap.has(trade)) {
                tradeMap.set(trade, {
                    trade,
                    touchedWorkers: new Set<string>(),
                    transitionBlocks: 0,
                    approvals: 0,
                    reassessments: 0,
                    auditEvents: 0,
                });
            }

            const tradeEntry = tradeMap.get(trade)!;
            tradeEntry.touchedWorkers.add(record.name);

            recentEntries.forEach((entry) => {
                const note = String(entry.note || '');
                tradeEntry.auditEvents += 1;
                if (/하네스 전이 거부|승인 차단/i.test(note)) tradeEntry.transitionBlocks += 1;
                if (entry.stage === 'approval' || /Harness 승인 게이트 동기화|최종 승인|반려/i.test(note)) tradeEntry.approvals += 1;
                if (entry.stage === 'reassessment') tradeEntry.reassessments += 1;
            });
        });

        return Array.from(tradeMap.values())
            .map((item) => ({
                ...item,
                touchedWorkerCount: item.touchedWorkers.size,
                totalSignal: item.transitionBlocks + item.approvals + item.reassessments,
            }))
            .sort((a, b) => b.totalSignal - a.totalSignal || b.auditEvents - a.auditEvents || a.trade.localeCompare(b.trade, 'ko'))
            .slice(0, 6);
    }, [filteredWorkerRecords]);

    const dashboardData = useMemo(() => {
        return transformDashboardData(filteredWorkerRecords);
    }, [filteredWorkerRecords]);

    const latestFilteredWorkerRecords = useMemo(() => {
        const uniqueWorkers = new Set(filteredWorkerRecords.map((record) => record.name));
        return Array.from(uniqueWorkers).map((name) => {
            return filteredWorkerRecords
                .filter((record) => record.name === name)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        });
    }, [filteredWorkerRecords]);

    const mobileRecentReports = useMemo(() => {
        return latestFilteredWorkerRecords
            .filter((record): record is WorkerRecord => Boolean(record))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 3);
    }, [latestFilteredWorkerRecords]);

    const selectedGroup = useMemo(() => {
        if (!selectedTarget) return null;
        const key = getTargetGroupKey(selectedTarget.trade, selectedTarget.nationality);
        return dashboardData.groups[key] ?? null;
    }, [selectedTarget, dashboardData]);

    const comparisonTargetGroup = useMemo(() => {
        if (!selectedTradeForComparison) return null;
        const key = getTargetGroupKey(selectedTradeForComparison, ALL_NATIONALITY_LABEL);
        return dashboardData.groups[key] ?? null;
    }, [selectedTradeForComparison, dashboardData]);

    const activeDetailGroup = useMemo(() => {
        if (detailViewMode === 'nationality' && selectedGroup) {
            return selectedGroup;
        }
        return comparisonTargetGroup ?? selectedGroup;
    }, [comparisonTargetGroup, detailViewMode, selectedGroup]);

    const hasNationalityDetail = Boolean(
        selectedTarget
        && selectedTradeForComparison
        && selectedTarget.trade === selectedTradeForComparison
        && selectedTarget.nationality !== ALL_NATIONALITY_LABEL
    );

    const selectedTradeTeamComparison = useMemo(() => {
        if (!selectedTradeForComparison) return [];

        const tradeRecords = workerOnlyRecords.filter(record => normalizeDashboardTrade(record.jobField) === selectedTradeForComparison);
        const teams = new Map<string, WorkerRecord[]>();

        tradeRecords.forEach(record => {
            const teamKey = record.teamLeader?.trim() || '미지정 팀';
            if (!teams.has(teamKey)) {
                teams.set(teamKey, []);
            }
            teams.get(teamKey)!.push(record);
        });

        return Array.from(teams.entries()).map(([team, records]) => {
            const uniqueWorkers = new Set(records.map(record => record.name));
            const latestWorkerSnapshots = Array.from(uniqueWorkers).map(name => {
                const history = records
                    .filter(record => record.name === name)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return {
                    latest: history[0],
                    previous: history[1] ?? null,
                };
            }).filter((item): item is { latest: WorkerRecord; previous: WorkerRecord | null } => Boolean(item.latest));

            const latestRecords = latestWorkerSnapshots.map((item) => item.latest);

            const avgScore = latestRecords.length > 0
                ? latestRecords.reduce((sum, record) => sum + record.safetyScore, 0) / latestRecords.length
                : 0;
            const riskCount = latestRecords.filter(record => record.safetyScore < 60).length;
            const cautionCount = latestRecords.filter(record => record.safetyScore >= 60 && record.safetyScore < 75).length;
            const goodCount = latestRecords.filter(record => record.safetyScore >= 75).length;
            const unresolvedCount = latestRecords.filter((record) => {
                const workflowState = inferHarnessWorkflowState(record);
                const approvalState = inferHarnessApprovalState(record, workflowState);
                return workflowState !== 'completed' || approvalState === 'PENDING' || approvalState === 'REQUIRED';
            }).length;
            const deltaValues = latestWorkerSnapshots
                .filter((item) => item.previous)
                .map((item) => item.latest.safetyScore - (item.previous?.safetyScore || 0));
            const avgDelta = deltaValues.length > 0
                ? deltaValues.reduce((sum, delta) => sum + delta, 0) / deltaValues.length
                : 0;
            const trendDirection = avgDelta > 1 ? 'up' : avgDelta < -1 ? 'down' : 'flat';
            const latestDate = latestRecords
                .map(record => new Date(record.date).getTime())
                .filter(value => !Number.isNaN(value))
                .sort((a, b) => b - a)[0] ?? 0;

            return {
                team,
                workerCount: uniqueWorkers.size,
                avgScore,
                riskCount,
                cautionCount,
                goodCount,
                unresolvedCount,
                avgDelta,
                trendDirection,
                latestDate,
            };
        }).sort((a, b) => {
            switch (teamComparisonSort) {
                case 'score-desc':
                    return b.avgScore - a.avgScore;
                case 'risk-desc':
                    return b.riskCount - a.riskCount || a.avgScore - b.avgScore;
                case 'workers-desc':
                    return b.workerCount - a.workerCount || a.avgScore - b.avgScore;
                case 'score-asc':
                default:
                    return a.avgScore - b.avgScore;
            }
        });
    }, [selectedTradeForComparison, teamComparisonSort, workerOnlyRecords]);

    const selectedTradeComparison = useMemo(() => {
        return dashboardData.trades.map((trade) => {
            const records = workerOnlyRecords.filter((record) => normalizeDashboardTrade(record.jobField) === trade);
            const uniqueWorkers = new Set(records.map((record) => record.name));
            const latestWorkerSnapshots = Array.from(uniqueWorkers).map((name) => {
                const history = records
                    .filter((record) => record.name === name)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return {
                    latest: history[0],
                    previous: history[1] ?? null,
                };
            }).filter((item): item is { latest: WorkerRecord; previous: WorkerRecord | null } => Boolean(item.latest));

            const latestRecords = latestWorkerSnapshots.map((item) => item.latest);
            const avgScore = latestRecords.length > 0
                ? latestRecords.reduce((sum, record) => sum + record.safetyScore, 0) / latestRecords.length
                : 0;
            const riskCount = latestRecords.filter((record) => record.safetyScore < 60).length;
            const cautionCount = latestRecords.filter((record) => record.safetyScore >= 60 && record.safetyScore < 75).length;
            const goodCount = latestRecords.filter((record) => record.safetyScore >= 75).length;
            const unresolvedCount = latestRecords.filter((record) => {
                const workflowState = inferHarnessWorkflowState(record);
                const approvalState = inferHarnessApprovalState(record, workflowState);
                return workflowState !== 'completed' || approvalState === 'PENDING' || approvalState === 'REQUIRED';
            }).length;
            const deltaValues = latestWorkerSnapshots
                .filter((item) => item.previous)
                .map((item) => item.latest.safetyScore - (item.previous?.safetyScore || 0));
            const avgDelta = deltaValues.length > 0
                ? deltaValues.reduce((sum, delta) => sum + delta, 0) / deltaValues.length
                : 0;
            const trendDirection = avgDelta > 1 ? 'up' : avgDelta < -1 ? 'down' : 'flat';

            return {
                trade,
                workerCount: uniqueWorkers.size,
                avgScore,
                riskCount,
                cautionCount,
                goodCount,
                unresolvedCount,
                avgDelta,
                trendDirection,
            };
        }).sort((a, b) => {
            switch (teamComparisonSort) {
                case 'score-desc':
                    return b.avgScore - a.avgScore;
                case 'risk-desc':
                    return b.riskCount - a.riskCount || a.avgScore - b.avgScore;
                case 'workers-desc':
                    return b.workerCount - a.workerCount || a.avgScore - b.avgScore;
                case 'score-asc':
                default:
                    return a.avgScore - b.avgScore;
            }
        });
    }, [dashboardData.trades, teamComparisonSort, workerOnlyRecords]);

    useEffect(() => {
        if (selectedTeamsForComparison.length === 0) return;
        const validTeamSet = new Set(selectedTradeTeamComparison.map((item) => item.team));
        const nextTeams = selectedTeamsForComparison.filter((team) => validTeamSet.has(team));
        if (nextTeams.length !== selectedTeamsForComparison.length) {
            setSelectedTeamsForComparison(nextTeams);
        }
    }, [selectedTeamsForComparison, selectedTradeTeamComparison]);

    useEffect(() => {
        if (selectedTradeComparison.length === 0) {
            if (selectedTradesForComparison.length > 0) setSelectedTradesForComparison([]);
            return;
        }
        const validTradeSet = new Set(selectedTradeComparison.map((item) => item.trade));
        const nextTrades = selectedTradesForComparison.filter((trade) => validTradeSet.has(trade));
        if (nextTrades.length !== selectedTradesForComparison.length) {
            setSelectedTradesForComparison(nextTrades);
        }
    }, [selectedTradeComparison, selectedTradesForComparison]);

    useEffect(() => {
        if (!selectedTradeForComparison) return;
        if (selectedTradesForComparison.includes(selectedTradeForComparison)) return;
        setSelectedTradesForComparison((previous) => [selectedTradeForComparison, ...previous].slice(0, TRADE_COMPARISON_MAX_SELECTION));
    }, [selectedTradeForComparison, selectedTradesForComparison]);

    const tradeQuickAccess = useMemo(() => {
        return dashboardData.trades
            .map(trade => {
                const records = workerOnlyRecords.filter(record => normalizeDashboardTrade(record.jobField) === trade);
                const uniqueWorkers = new Set(records.map(record => record.name));
                const latestRecords = Array.from(uniqueWorkers).map(name => {
                    return records
                        .filter(record => record.name === name)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                });

                const avgScore = latestRecords.length > 0
                    ? latestRecords.reduce((sum, record) => sum + record.safetyScore, 0) / latestRecords.length
                    : 0;

                return {
                    trade,
                    workerCount: uniqueWorkers.size,
                    avgScore,
                };
            })
            .sort((a, b) => a.avgScore - b.avgScore)
            .slice(0, 8);
    }, [dashboardData.trades, workerOnlyRecords]);

    const teamQuickAccessSummaries = useMemo(() => {
        const scoped = selectedTradeForComparison
            ? teamSummaries.filter((summary) => summary.trade === selectedTradeForComparison)
            : teamSummaries;

        return scoped.slice(0, selectedTradeForComparison ? 18 : 12);
    }, [selectedTradeForComparison, teamSummaries]);

    const weakestTeam = selectedTradeTeamComparison[0] ?? null;
    const strongestTeam = selectedTradeTeamComparison[selectedTradeTeamComparison.length - 1] ?? null;

    const visibleTeamComparison = useMemo(() => {
        switch (teamViewFilter) {
            case 'top3':
                return selectedTradeTeamComparison.slice(0, 3);
            case 'risk-only':
                return selectedTradeTeamComparison.filter(team => team.riskCount > 0);
            case 'all':
            default:
                return selectedTradeTeamComparison;
        }
    }, [selectedTradeTeamComparison, teamViewFilter]);

    const comparedTeamRows = useMemo(() => {
        if (selectedTeamsForComparison.length === 0) return [];
        const visibleTeamSet = new Set(visibleTeamComparison.map((team) => team.team));
        return selectedTeamsForComparison
            .map((teamName) => selectedTradeTeamComparison.find((team) => team.team === teamName))
            .filter((team): team is NonNullable<typeof team> => Boolean(team && visibleTeamSet.has(team.team)));
    }, [selectedTeamsForComparison, selectedTradeTeamComparison, visibleTeamComparison]);

    const comparedTradeRows = useMemo(() => {
        if (selectedTradesForComparison.length === 0) return [];
        return selectedTradesForComparison
            .map((tradeName) => selectedTradeComparison.find((trade) => trade.trade === tradeName))
            .filter((trade): trade is NonNullable<typeof trade> => Boolean(trade));
    }, [selectedTradeComparison, selectedTradesForComparison]);

    const selectedTeamSummaryBarRows = useMemo(() => {
        return selectedTeamsForComparison
            .map((teamName) => selectedTradeTeamComparison.find((team) => team.team === teamName))
            .filter((team): team is NonNullable<typeof team> => Boolean(team));
    }, [selectedTeamsForComparison, selectedTradeTeamComparison]);

    const teamComparisonHeadline = useMemo(() => {
        if (!selectedTradeForComparison) return '팀 비교';
        if (comparedTeamRows.length === 0) return `${selectedTradeForComparison} 팀 비교`;
        return `${selectedTradeForComparison} ${comparedTeamRows.map((team) => team.team).slice(0, TEAM_COMPARISON_MAX_SELECTION).join(' vs ')}`;
    }, [comparedTeamRows, selectedTradeForComparison]);

    const tradeComparisonHeadline = useMemo(() => {
        if (comparedTradeRows.length === 0) return '공종 비교';
        return comparedTradeRows.map((trade) => trade.trade).slice(0, TRADE_COMPARISON_MAX_SELECTION).join(' vs ');
    }, [comparedTradeRows]);

    const teamNationalityDrilldownStatus = useMemo(() => {
        if (!selectedTeamOption || !selectedTradeForComparison) return null;
        return {
            teamLabel: selectedTeamOption.label,
            trade: selectedTradeForComparison,
            nationalityLabel: hasNationalityDetail && selectedTarget ? selectedTarget.nationality : ALL_NATIONALITY_LABEL,
            isSpecificNationality: Boolean(hasNationalityDetail && selectedTarget),
        };
    }, [hasNationalityDetail, selectedTarget, selectedTeamOption, selectedTradeForComparison]);

    const hasSelectedTeamForDrilldown = selectedTeamsForComparison.length > 0;

    const priorityTeamForAction = useMemo(() => {
        if (comparedTeamRows.length === 0) return null;
        return [...comparedTeamRows].sort((left, right) => {
            const leftRiskRate = left.workerCount > 0 ? left.riskCount / left.workerCount : 0;
            const rightRiskRate = right.workerCount > 0 ? right.riskCount / right.workerCount : 0;
            return rightRiskRate - leftRiskRate || left.avgScore - right.avgScore || right.riskCount - left.riskCount;
        })[0];
    }, [comparedTeamRows]);

    const benchmarkTeamForAction = useMemo(() => {
        if (comparedTeamRows.length === 0) return null;
        return [...comparedTeamRows].sort((left, right) => {
            return right.avgScore - left.avgScore || right.goodCount - left.goodCount || left.riskCount - right.riskCount;
        })[0];
    }, [comparedTeamRows]);

    const comparisonSummaryLines = useMemo(() => {
        const scope = selectedTradeForComparison
            ? comparedTeamRows.length > 0
                ? `${teamComparisonHeadline} 기준으로 같은 축에서 위험인식 신호, 보호신호, 미처리, 추세를 함께 비교하고 있습니다.`
                : `${selectedTradeForComparison} 공종에서 비교할 팀 2~3개를 먼저 선택하면 메인 비교가 시작됩니다.`
            : '비교할 공종을 먼저 선택한 뒤 팀 2~3개를 고르면 같은 기준으로 바로 비교할 수 있습니다.';

        const priority = priorityTeamForAction
            ? `우선 조치 팀은 ${priorityTeamForAction.team}이며, 추가 확인 ${priorityTeamForAction.riskCount}명과 위험인식 신호 ${priorityTeamForAction.avgScore.toFixed(1)}점 기준으로 즉시 점검 대상입니다.`
            : '우선 조치 팀 판단을 위해 비교할 팀을 2개 이상 선택해 주세요.';

        const benchmark = benchmarkTeamForAction
            ? `벤치마크 팀은 ${benchmarkTeamForAction.team}이며, 위험인식 신호 ${benchmarkTeamForAction.avgScore.toFixed(1)}점 기준으로 현장 코칭 기준점으로 활용할 수 있습니다.`
            : '벤치마크 팀 판단은 비교 데이터가 확보되면 자동으로 제안됩니다.';

        return { scope, priority, benchmark };
    }, [benchmarkTeamForAction, comparedTeamRows.length, priorityTeamForAction, selectedTradeForComparison, teamComparisonHeadline]);

    const applicableComparisonPresets = useMemo(() => {
        const normalizedQuery = presetSearchQuery.trim().toLowerCase();
        const scopedPresets = teamComparisonPresets.filter((preset) => {
            if (presetScope === 'all-trades') return true;
            if (!selectedTradeForComparison) return true;
            return preset.trade === selectedTradeForComparison;
        });

        return scopedPresets
            .filter((preset) => {
                if (!normalizedQuery) return true;
                const presetName = preset.name.toLowerCase();
                const presetTrade = preset.trade.toLowerCase();
                return presetName.includes(normalizedQuery) || presetTrade.includes(normalizedQuery);
            })
            .sort((left, right) => {
                const pinDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
                if (pinDelta !== 0) return pinDelta;
                return (right.lastUsedAt ?? right.createdAt) - (left.lastUsedAt ?? left.createdAt);
            })
            .slice(0, 8);
    }, [presetScope, presetSearchQuery, selectedTradeForComparison, teamComparisonPresets]);

    const pinnedQuickPresets = useMemo(() => {
        return applicableComparisonPresets
            .filter((preset) => preset.pinned)
            .slice(0, 3);
    }, [applicableComparisonPresets]);

    const applicableTradeComparisonPresets = useMemo(() => {
        const normalizedQuery = tradePresetSearchQuery.trim().toLowerCase();
        return [...tradeComparisonPresets]
            .filter((preset) => {
                if (tradePresetScope === 'current-trade') {
                    if (!selectedTradeForComparison) return false;
                    if (!preset.trades.includes(selectedTradeForComparison)) return false;
                }
                if (!normalizedQuery) return true;
                const presetName = preset.name.toLowerCase();
                const trades = preset.trades.join(' ').toLowerCase();
                return presetName.includes(normalizedQuery) || trades.includes(normalizedQuery);
            })
            .sort((left, right) => {
                const pinDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
                if (pinDelta !== 0) return pinDelta;
                return (right.lastUsedAt ?? right.createdAt) - (left.lastUsedAt ?? left.createdAt);
            })
            .slice(0, 8);
    }, [selectedTradeForComparison, tradeComparisonPresets, tradePresetScope, tradePresetSearchQuery]);

    const pinnedQuickTradePresets = useMemo(() => {
        return applicableTradeComparisonPresets
            .filter((preset) => preset.pinned)
            .slice(0, 3);
    }, [applicableTradeComparisonPresets]);

    const toggleTeamComparisonSelection = (teamName: string) => {
        setSelectedTeamsForComparison((previous) => {
            if (previous.includes(teamName)) {
                return previous.filter((item) => item !== teamName);
            }
            if (previous.length >= TEAM_COMPARISON_MAX_SELECTION) {
                return previous;
            }
            return [...previous, teamName];
        });
    };

    const toggleTradeComparisonSelection = (tradeName: string) => {
        setSelectedTradesForComparison((previous) => {
            if (previous.includes(tradeName)) {
                return previous.filter((item) => item !== tradeName);
            }
            if (previous.length >= TRADE_COMPARISON_MAX_SELECTION) {
                return previous;
            }
            return [...previous, tradeName];
        });
    };

    const saveCurrentTradeComparisonPreset = () => {
        const selectedTrades = Array.from(new Set<string>(selectedTradesForComparison));
        if (selectedTrades.length < 2) return;

        const presetName = String(tradePresetNameDraft || '').trim() || `${selectedTrades.length}개 공종 비교`;
        const nextPreset: DashboardTradeComparisonPreset = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: presetName,
            trades: selectedTrades,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            pinned: false,
            appliedAtHistory: [],
        };

        setTradeComparisonPresets((previous) => {
            const deduped = previous.filter((preset) => !areSameTradeList(preset.trades, nextPreset.trades));
            return [nextPreset, ...deduped].slice(0, 12);
        });
        setTradePresetNameDraft('');

        trackUIViewMetric('cta_click', 'dashboard', viewMetricSessionRef.current, {
            actionKey: 'trade_comparison_preset_save',
            tradeCount: selectedTrades.length,
            presetName,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const applyTradeComparisonPreset = (preset: DashboardTradeComparisonPreset) => {
        const appliedAt = Date.now();
        setSelectedTradesForComparison(preset.trades.slice(0, TRADE_COMPARISON_MAX_SELECTION));
        if (preset.trades[0]) {
            openTradeIntegratedAnalysis(preset.trades[0], 'team');
        }
        setTradeComparisonPresets((previous) => previous.map((item) => item.id === preset.id
            ? {
                ...item,
                lastUsedAt: appliedAt,
                appliedAtHistory: [...(item.appliedAtHistory || []), appliedAt].slice(-60),
            }
            : item,
        ));

        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'trade_comparison_preset_apply',
            presetName: preset.name,
            tradeCount: preset.trades.length,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const removeTradeComparisonPreset = (presetId: string) => {
        setTradeComparisonPresets((previous) => previous.filter((preset) => preset.id !== presetId));
        if (editingTradePresetId === presetId) {
            setEditingTradePresetId(null);
            setEditingTradePresetName('');
        }
    };

    const startEditingTradeComparisonPreset = (preset: DashboardTradeComparisonPreset) => {
        setEditingTradePresetId(preset.id);
        setEditingTradePresetName(preset.name);
    };

    const commitEditingTradeComparisonPreset = (presetId: string) => {
        const trimmed = String(editingTradePresetName || '').trim();
        if (!trimmed) return;

        setTradeComparisonPresets((previous) => previous.map((preset) => (
            preset.id === presetId
                ? { ...preset, name: trimmed }
                : preset
        )));

        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'trade_comparison_preset_rename',
            presetId,
            nextName: trimmed,
            audienceView,
            viewMode: dashboardViewMode,
        });

        setEditingTradePresetId(null);
        setEditingTradePresetName('');
    };

    const cancelEditingTradeComparisonPreset = () => {
        setEditingTradePresetId(null);
        setEditingTradePresetName('');
    };

    const handleTradePresetScopeChange = (nextScope: 'current-trade' | 'all-trades') => {
        setTradePresetScope(nextScope);
        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'trade_comparison_preset_scope',
            scope: nextScope,
            selectedTradeForComparison,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const handleToggleTradeComparisonPresetPin = (presetId: string) => {
        setTradeComparisonPresets((previous) => {
            const target = previous.find((preset) => preset.id === presetId);
            if (!target) return previous;

            const activePinCount = previous.filter((preset) => preset.pinned).length;
            const isPinning = !target.pinned;
            if (isPinning && activePinCount >= 3) {
                setTradePresetPinLimitNotice('공종 저장 조건 고정은 최대 3개까지 가능합니다.');
                return previous;
            }

            setTradePresetPinLimitNotice(null);
            return previous.map((preset) => (
                preset.id === presetId
                    ? { ...preset, pinned: isPinning }
                    : preset
            ));
        });
    };

    const handleExportTradeComparisonPresetsCsv = () => {
        if (tradeComparisonPresets.length === 0) return;

        const escapeCsv = (value: unknown): string => {
            const str = String(value ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows: string[][] = [
            ['id', 'name', 'trades', 'tradeCount', 'pinned', 'appliedRecent7d', 'appliedTotal', 'lastUsedAt', 'createdAt'],
        ];

        tradeComparisonPresets.forEach((preset) => {
            rows.push([
                preset.id,
                preset.name,
                preset.trades.join(' | '),
                String(preset.trades.length),
                preset.pinned ? 'YES' : 'NO',
                String(getRecentPresetApplyCount(preset.appliedAtHistory, 7)),
                String((preset.appliedAtHistory || []).length),
                preset.lastUsedAt ? new Date(preset.lastUsedAt).toISOString() : '',
                new Date(preset.createdAt).toISOString(),
            ]);
        });

        const bom = '\uFEFF';
        const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
        downloadDashboardTextFile(
            `PSI_Dashboard_TradeComparisonPresets_${new Date().toISOString().slice(0, 10)}.csv`,
            bom + csv,
            'text/csv;charset=utf-8;'
        );

        trackUIViewMetric('cta_click', 'dashboard', viewMetricSessionRef.current, {
            actionKey: 'trade_comparison_preset_export_csv',
            presetCount: tradeComparisonPresets.length,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const saveCurrentTeamComparisonPreset = () => {
        if (!selectedTradeForComparison) return;
        const selectedTeams = Array.from(new Set<string>(selectedTeamsForComparison));
        if (selectedTeams.length < 2) return;

        const presetName = String(presetNameDraft || '').trim() || `${selectedTradeForComparison} ${selectedTeams.length}팀 비교`;
        const nextPreset: DashboardTeamComparisonPreset = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: presetName,
            trade: selectedTradeForComparison,
            teams: selectedTeams,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            appliedAtHistory: [],
        };

        setTeamComparisonPresets((previous) => {
            const deduped = previous.filter((preset) => !(preset.trade === nextPreset.trade && areSameTeamList(preset.teams, nextPreset.teams)));
            return [nextPreset, ...deduped].slice(0, 12);
        });

        trackUIViewMetric('cta_click', 'dashboard', viewMetricSessionRef.current, {
            actionKey: 'comparison_preset_save',
            trade: selectedTradeForComparison,
            teamCount: selectedTeams.length,
            presetName,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const applyTeamComparisonPreset = (preset: DashboardTeamComparisonPreset, source: 'preset_list' | 'pinned_lane' = 'preset_list') => {
        const appliedAt = Date.now();
        skipTeamSelectionResetRef.current = true;
        setSelectedTarget({ trade: preset.trade, nationality: ALL_NATIONALITY_LABEL });
        setSelectedTradeForComparison(preset.trade);
        setMobileInsightTab('team');
        setDetailViewMode('integrated');
        setTeamViewFilter('all');
        setSelectedTeamsForComparison(preset.teams);
        setIsComparisonAdvancedOpen(true);
        setTeamComparisonPresets((previous) => previous.map((item) => item.id === preset.id
            ? {
                ...item,
                lastUsedAt: appliedAt,
                appliedAtHistory: [...(item.appliedAtHistory || []), appliedAt].slice(-60),
            }
            : item,
        ));

        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'comparison_preset_apply',
            source,
            presetTrade: preset.trade,
            presetName: preset.name,
            teamCount: preset.teams.length,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const removeTeamComparisonPreset = (presetId: string) => {
        setTeamComparisonPresets((previous) => previous.filter((preset) => preset.id !== presetId));
        if (editingPresetId === presetId) {
            setEditingPresetId(null);
            setEditingPresetName('');
        }
    };

    const handlePresetScopeChange = (nextScope: 'current-trade' | 'all-trades') => {
        setPresetScope(nextScope);
        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'comparison_preset_scope',
            scope: nextScope,
            selectedTradeForComparison,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const handleToggleTeamComparisonPresetPin = (presetId: string) => {
        setTeamComparisonPresets((previous) => {
            const target = previous.find((preset) => preset.id === presetId);
            if (!target) return previous;

            const activePinCount = previous.filter((preset) => preset.pinned).length;
            const isPinning = !target.pinned;
            if (isPinning && activePinCount >= 3) {
                setPresetPinLimitNotice('비교 저장 조건 고정은 최대 3개까지 가능합니다.');
                trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
                    control: 'comparison_preset_pin',
                    presetId,
                    pinned: false,
                    blockedByLimit: true,
                    pinLimit: 3,
                    audienceView,
                    viewMode: dashboardViewMode,
                });
                return previous;
            }

            setPresetPinLimitNotice(null);

            const next = previous.map((preset) => (
                preset.id === presetId
                    ? { ...preset, pinned: isPinning }
                    : preset
            ));

            trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
                control: 'comparison_preset_pin',
                presetId,
                pinned: isPinning,
                blockedByLimit: false,
                audienceView,
                viewMode: dashboardViewMode,
            });

            return next;
        });
    };

    const startEditingTeamComparisonPreset = (preset: DashboardTeamComparisonPreset) => {
        setEditingPresetId(preset.id);
        setEditingPresetName(preset.name);
    };

    const commitEditingTeamComparisonPreset = (presetId: string) => {
        const trimmed = String(editingPresetName || '').trim();
        if (!trimmed) return;

        setTeamComparisonPresets((previous) => previous.map((preset) => (
            preset.id === presetId
                ? { ...preset, name: trimmed }
                : preset
        )));

        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'comparison_preset_rename',
            presetId,
            nextName: trimmed,
            audienceView,
            viewMode: dashboardViewMode,
        });

        setEditingPresetId(null);
        setEditingPresetName('');
    };

    const cancelEditingTeamComparisonPreset = () => {
        setEditingPresetId(null);
        setEditingPresetName('');
    };

    const handleExportTeamComparisonPresetsCsv = () => {
        if (teamComparisonPresets.length === 0) return;

        const escapeCsv = (value: unknown): string => {
            const str = String(value ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows: string[][] = [
            ['id', 'name', 'trade', 'teams', 'teamCount', 'pinned', 'appliedRecent7d', 'appliedTotal', 'lastUsedAt', 'createdAt'],
        ];

        teamComparisonPresets.forEach((preset) => {
            rows.push([
                preset.id,
                preset.name,
                preset.trade,
                preset.teams.join(' | '),
                String(preset.teams.length),
                preset.pinned ? 'YES' : 'NO',
                String(getRecentPresetApplyCount(preset.appliedAtHistory, 7)),
                String((preset.appliedAtHistory || []).length),
                preset.lastUsedAt ? new Date(preset.lastUsedAt).toISOString() : '',
                new Date(preset.createdAt).toISOString(),
            ]);
        });

        const bom = '\uFEFF';
        const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
        downloadDashboardTextFile(
            `PSI_Dashboard_TeamComparisonPresets_${new Date().toISOString().slice(0, 10)}.csv`,
            bom + csv,
            'text/csv;charset=utf-8;'
        );

        trackUIViewMetric('cta_click', 'dashboard', viewMetricSessionRef.current, {
            actionKey: 'comparison_preset_export_csv',
            presetCount: teamComparisonPresets.length,
            audienceView,
            viewMode: dashboardViewMode,
        });
    };

    const getRankBadge = (index: number) => {
        if (index === 0) return { label: '🥇', className: 'bg-amber-100 text-amber-700' };
        if (index === 1) return { label: '🥈', className: 'bg-slate-200 text-slate-700' };
        if (index === 2) return { label: '🥉', className: 'bg-orange-100 text-orange-700' };
        return { label: String(index + 1), className: 'bg-slate-100 text-slate-600' };
    };

    const getSelectedTeamPriorityBadge = (teamName: string) => {
        const priorityIndex = selectedTeamsForComparison.indexOf(teamName);
        if (priorityIndex < 0) return null;
        return {
            label: `선택 ${priorityIndex + 1}`,
            className: priorityIndex === 0
                ? 'bg-indigo-600 text-white'
                : priorityIndex === 1
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-sky-100 text-sky-700',
        };
    };

    const unassignedCount = dashboardData.unassignedRecordCount;
    const isUnassignedWarning = unassignedCount > 0;

    const dashboardSummaryCards: InterpretationCardItem[] = useMemo(() => {
        return buildDashboardSummaryCards({
            audience: audienceView,
            stats: {
                totalWorkers: stats.totalWorkers,
                averageScore: stats.averageScore,
                highRiskWorkers: stats.highRiskWorkers,
                totalChecks: stats.totalChecks,
            },
            selectedTeamOption: selectedTeamOption ? { label: selectedTeamOption.label } : null,
            harnessSummary: {
                approvalBacklog: harnessDashboardSummary.approvalBacklog,
                fallback: harnessDashboardSummary.fallback,
                immediateAttention: harnessDashboardSummary.immediateAttention,
            },
        });
    }, [audienceView, harnessDashboardSummary.approvalBacklog, harnessDashboardSummary.fallback, harnessDashboardSummary.immediateAttention, selectedTeamOption, stats.averageScore, stats.highRiskWorkers, stats.totalChecks, stats.totalWorkers]);

    const audienceInsightMessage = useMemo(() => {
        return buildAudienceInsightMessage(audienceView, stats.highRiskWorkers);
    }, [audienceView, stats.highRiskWorkers]);

    const audienceQuickGuide = useMemo(() => {
        return buildAudienceQuickGuide({
            audience: audienceView,
            stats: {
                totalWorkers: stats.totalWorkers,
                averageScore: stats.averageScore,
                highRiskWorkers: stats.highRiskWorkers,
                totalChecks: stats.totalChecks,
            },
            harnessSummary: {
                approvalBacklog: harnessDashboardSummary.approvalBacklog,
                fallback: harnessDashboardSummary.fallback,
                immediateAttention: harnessDashboardSummary.immediateAttention,
            },
        });
    }, [audienceView, harnessDashboardSummary.approvalBacklog, harnessDashboardSummary.fallback, harnessDashboardSummary.immediateAttention, stats.averageScore, stats.highRiskWorkers, stats.totalChecks, stats.totalWorkers]);

    const overviewStatCards = useMemo<DashboardStatCardConfig[]>(() => {
        return buildOverviewStatCards(audienceView, {
            totalWorkers: stats.totalWorkers,
            averageScore: stats.averageScore,
            highRiskWorkers: stats.highRiskWorkers,
            totalChecks: stats.totalChecks,
        });
    }, [audienceView, stats.averageScore, stats.highRiskWorkers, stats.totalChecks, stats.totalWorkers]);

    const quickActions = useMemo<DashboardQuickActionConfig[]>(() => {
        const quickActionUiMode: UiAudienceMode = isDevMode && operationalMode === 'developer'
            ? 'developer'
            : audienceView === 'worker'
                ? 'worker'
                : 'practitioner';

        if (audienceView === 'worker') {
            return [
                {
                    key: 'predictive',
                    label: getPhrase('dashboard.quickAction.worker.priority', quickActionUiMode),
                    page: 'predictive-analysis',
                    variant: 'ghost',
                    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>,
                },
                {
                    key: 'worker-management',
                    label: getPhrase('dashboard.quickAction.worker.flow', quickActionUiMode),
                    page: 'worker-management',
                    variant: 'solid',
                    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                },
            ];
        }

        if (audienceView === 'executive') {
            return [
                {
                    key: 'performance',
                    label: getPhrase('dashboard.quickAction.executive.trend', quickActionUiMode),
                    page: 'performance-analysis',
                    variant: 'ghost',
                    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
                },
                {
                    key: 'reports',
                    label: getPhrase('dashboard.quickAction.executive.report', quickActionUiMode),
                    page: 'reports',
                    variant: 'solid',
                    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                },
            ];
        }

        return [
            {
                key: 'ocr-analysis',
                label: getPhrase('dashboard.quickAction.practitioner.newAnalysis', quickActionUiMode),
                page: 'ocr-analysis',
                variant: 'ghost',
                icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
            },
            {
                key: 'reports',
                label: getPhrase('dashboard.quickAction.practitioner.report', quickActionUiMode),
                page: 'reports',
                variant: 'solid',
                icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
            },
        ];
    }, [audienceView, isDevMode, operationalMode]);

    const pcConsoleActions = useMemo<Array<{ key: string; label: string; description: string; page: Page }>>(() => {
        return [
            {
                key: 'pc-console-ocr',
                label: '안전 평가 서류 분석(OCR)',
                description: '평가서 분석 및 점검을 진행합니다.',
                page: 'ocr-analysis',
            },
            {
                key: 'pc-console-risk',
                label: 'AI 위험성 예측 분석',
                description: '우선 관리 근로자 조치 계획을 확인합니다.',
                page: 'predictive-analysis',
            },
            {
                key: 'pc-console-reports',
                label: '보고서 관리',
                description: '이행 보고서 검토 및 다운로드 화면으로 이동합니다.',
                page: 'reports',
            },
            {
                key: 'pc-console-workers',
                label: '현장 근로자 관리',
                description: '근로자별 안전 점검 및 조치 이력을 확인합니다.',
                page: 'worker-management',
            },
            {
                key: 'pc-console-settings',
                label: '시스템 환경 설정',
                description: '연동 상태 및 안전 관리 정책을 설정합니다.',
                page: 'settings',
            },
        ];
    }, []);

    const comparisonCards: InterpretationCardItem[] = useMemo(() => {
        const sharedStatusDescription = selectedTradeForComparison
            ? `${selectedTradeTeamComparison.length}개 팀을 같은 공종 기준으로 비교하며${selectedTeamsForComparison.length > 0 ? `, 현재 ${selectedTeamsForComparison.length}개 팀을 직접 선택해 좁혀 보고 있습니다.` : ' 전체 팀 흐름을 먼저 보고 있습니다.'}`
            : '취약 공종 바로가기나 팀 비교 바로가기에서 대상을 고르면 상세 해석이 활성화됩니다.';

        if (audienceView === 'worker') {
            return [
                {
                    key: 'comparison-status',
                    eyebrow: '비교 현황',
                    title: selectedTradeForComparison ? `${selectedTradeForComparison} 유사 작업조 흐름을 보고 있습니다.` : '유사 작업조 비교 전 단계입니다.',
                    description: sharedStatusDescription,
                    tone: selectedTradeForComparison ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
                },
                {
                    key: 'comparison-evidence',
                    eyebrow: '근거',
                    title: '공종(작업 종류)·팀장 기준이 유사 작업 흐름 비교의 기준입니다.',
                    description: hasNationalityDetail && selectedTarget
                        ? `${selectedTarget.trade} · ${selectedTarget.nationality} 세부 기준이 열려 있어 같은 작업군 안의 세부 차이도 함께 볼 수 있습니다.`
                        : '팀 비교는 전체 국적 통합 기준으로 유지되어, 같은 공종 안에서 어느 작업조가 더 보호가 필요한지 빠르게 읽을 수 있습니다.',
                    tone: BRAND_TONE.whiteSoft,
                },
                {
                    key: 'comparison-action',
                    eyebrow: '다음 행동',
                    title: weakestTeam ? `${weakestTeam.team} 등 보호가 더 필요한 팀부터 확인하세요.` : '먼저 취약 공종 또는 팀을 선택하세요.',
                    description: weakestTeam
                        ? `위험인식 신호 ${weakestTeam.avgScore.toFixed(1)}점과 추가 확인 ${weakestTeam.riskCount}명을 기준으로 어떤 작업조에 코칭이 먼저 필요한지 이어서 확인할 수 있습니다.`
                        : '차트에서 작업조를 고르면 역량 분포도와 개인별 평가 기록으로 바로 이어져 보완 순서를 구체화할 수 있습니다.',
                    tone: weakestTeam ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
                },
            ];
        }

        if (audienceView === 'executive') {
            return [
                {
                    key: 'comparison-status',
                    eyebrow: '비교 현황',
                    title: selectedTradeForComparison ? `${selectedTradeForComparison} 공종 리스크 편차를 보고 있습니다.` : '공종 또는 팀 비교 전 단계입니다.',
                    description: sharedStatusDescription,
                    tone: selectedTradeForComparison ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
                },
                {
                    key: 'comparison-evidence',
                    eyebrow: '근거',
                    title: '공종(작업 종류)·국적·팀장 기준 분리가 리스크 분배 판단의 기준입니다.',
                    description: hasNationalityDetail && selectedTarget
                        ? `${selectedTarget.trade} · ${selectedTarget.nationality} 세부 기준이 열려 있어 통합 흐름과 세부 리스크를 번갈아 읽을 수 있습니다.`
                        : '팀 비교는 전체 국적 통합 기준으로 유지되어, 동일 공종 내 팀 편차를 안정적으로 읽을 수 있습니다.',
                    tone: BRAND_TONE.whiteSoft,
                },
                {
                    key: 'comparison-action',
                    eyebrow: '의사결정 포인트',
                    title: weakestTeam ? `${weakestTeam.team} 등 취약 팀부터 자원 배분 우선순위를 잡으세요.` : '먼저 취약 공종 또는 팀을 선택하세요.',
                    description: weakestTeam
                        ? `가장 취약한 팀의 위험인식 신호 ${weakestTeam.avgScore.toFixed(1)}점과 추가 확인 ${weakestTeam.riskCount}명을 기준으로 교육·점검·보고 자원 배분 순서를 정할 수 있습니다.`
                        : '차트에서 작업조를 고르면 역량 분포도와 개인별 평가 기록이 이어져 다음 보호 행동을 구체화할 수 있습니다.',
                    tone: weakestTeam ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
                },
            ];
        }

        return [
            {
                key: 'comparison-status',
                eyebrow: '비교 현황',
                title: selectedTradeForComparison ? `${selectedTradeForComparison} 공종 비교를 보고 있습니다.` : '공종 또는 팀 비교 전 단계입니다.',
                description: sharedStatusDescription,
                tone: selectedTradeForComparison ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'comparison-evidence',
                eyebrow: '근거',
                title: '공종(작업 종류)·국적·팀장 기준 분리가 비교의 기준입니다.',
                description: hasNationalityDetail && selectedTarget
                    ? `${selectedTarget.trade} · ${selectedTarget.nationality} 세부 기준이 열려 있어 통합 흐름과 세부 흐름을 번갈아 읽을 수 있습니다.`
                    : '팀 비교는 전체 국적 통합 기준으로 유지되어, 동일 공종 내 팀 편차를 안정적으로 읽을 수 있습니다.',
                tone: BRAND_TONE.whiteSoft,
            },
            {
                key: 'comparison-action',
                eyebrow: '다음 행동',
                title: weakestTeam ? `${weakestTeam.team} 등 취약 팀부터 보완 우선순위를 잡으세요.` : '먼저 취약 공종 또는 팀을 선택하세요.',
                description: weakestTeam
                    ? `가장 취약한 팀의 위험인식 신호 ${weakestTeam.avgScore.toFixed(1)}점과 추가 확인 ${weakestTeam.riskCount}명을 기준으로 코칭·점검·보고 흐름을 연결할 수 있습니다.`
                    : '차트에서 작업조를 고르면 역량 분포도와 개인별 평가 기록이 이어져 다음 보호 행동을 구체화할 수 있습니다.',
                tone: weakestTeam ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
            },
        ];
    }, [audienceView, hasNationalityDetail, selectedTarget, selectedTeamsForComparison.length, selectedTradeForComparison, selectedTradeTeamComparison.length, weakestTeam]);

    const operationalFocusCards: InterpretationCardItem[] = useMemo(() => {
        return buildOperationalFocusCards(audienceView);
    }, [audienceView]);

    const mobileInsightTabs = useMemo<DashboardInsightTabConfig[]>(() => {
        return buildMobileInsightTabs(audienceView);
    }, [audienceView]);

    const comparisonSectionMeta = useMemo(() => {
        return buildComparisonSectionMeta({
            audience: audienceView,
        });
    }, [audienceView]);

    const handleNavigateToUnassignedRecords = () => {
        const params = new URLSearchParams(window.location.search);
        params.set('filter', 'unassigned');
        const query = params.toString();
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
        setCurrentPage('worker-management');
    };

    const navigateToWorkerManagementWithHarnessFilter = (drilldown: { type: HarnessDashboardDrilldownType; trade?: string } | null) => {
        const params = new URLSearchParams(window.location.search);
        params.delete('filter');
        params.delete('harnessFilter');
        params.delete('harnessTrade');

        if (drilldown) {
            params.set('harnessFilter', drilldown.type);
            if (drilldown.type === 'trade-hotspot' && drilldown.trade) {
                params.set('harnessTrade', drilldown.trade);
            }
        }

        const query = params.toString();
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
        setCurrentPage('worker-management');
    };

    const openHarnessTradeDrilldown = (trade: string) => {
        setSelectedTeam('ALL');
        openTradeIntegratedAnalysis(trade, 'team');
        setActiveHarnessDrilldown({ type: 'trade-hotspot', trade });
    };

    const openHarnessOperationalDrilldown = (type: HarnessDashboardDrilldownType) => {
        setActiveHarnessDrilldown({ type });
        if (type === 'approval-backlog') {
            setMobileInsightTab('team');
        }
        if (type === 'immediate-attention') {
            setMobileInsightTab('worker');
        }
    };

    const navigateToDashboardFollowUpPage = (page: Page) => {
        setCurrentPage(page);
    };

    const harnessDrilldownActionPlan = useMemo<HarnessDrilldownActionPlan | null>(() => {
        if (!activeHarnessDrilldown) return null;

        switch (activeHarnessDrilldown.type) {
            case 'approval-backlog':
                return {
                    headline: '승인 대기 대상은 관리자 검토 순서를 먼저 잠그는 편이 안전합니다.',
                    detail: '먼저 근로자 관리 필터로 대상자를 좁히고, 이후 보고서 화면에서 승인·반려 근거와 감사 문맥을 함께 확인하시면 됩니다.',
                    primaryLabel: '근로자 관리에서 승인 대기열 열기',
                    secondaryLabel: '보고서 화면으로 이동',
                    secondaryPage: 'reports',
                };
            case 'immediate-attention':
                return {
                    headline: '즉시 보호 대상은 OCR 판정과 운영 후속 조치를 같은 흐름으로 보셔야 합니다.',
                    detail: 'OCR 분석 화면에서 원인 텍스트와 재분석 필요 여부를 먼저 확인한 뒤, 근로자 관리로 내려가 보호 조치를 연결하시면 됩니다.',
                    primaryLabel: '근로자 관리에서 즉시 보호 대상 열기',
                    secondaryLabel: 'OCR 분석 화면으로 이동',
                    secondaryPage: 'ocr-analysis',
                };
            case 'fallback-pending':
                return {
                    headline: '데이터 저장 점검 대상은 연동 환경과 개별 기록 상태를 함께 보셔야 합니다.',
                    detail: '설정 화면에서 데이터 연동 환경 상태를 먼저 확인하고, 이후 근로자 관리 필터로 실제 저장 보완·대기 기록을 좁히시면 됩니다.',
                    primaryLabel: '근로자 관리에서 저장 보완 점검 열기',
                    secondaryLabel: '설정 화면으로 이동',
                    secondaryPage: 'settings',
                };
            case 'trade-hotspot':
                return {
                    headline: `${activeHarnessDrilldown.trade || '선택 공종'}은 최근 운영 신호가 집중된 공종입니다.`,
                    detail: '대상 공종을 근로자 관리 필터로 바로 넘겨 우선순위를 정리하고, 보고서 화면에서 공종별 감사 근거를 함께 확인하시면 됩니다.',
                    primaryLabel: '근로자 관리에서 집중 관리 공종 열기',
                    secondaryLabel: '보고서 화면으로 이동',
                    secondaryPage: 'reports',
                };
            default:
                return null;
        }
    }, [activeHarnessDrilldown]);

    const harnessDrilldownPreview = useMemo(() => {
        if (!activeHarnessDrilldown) return null;

        const entries = latestFilteredWorkerRecords.filter((record) => {
            const workflowState = inferHarnessWorkflowState(record);
            const riskDecision = inferHarnessRiskDecision(record);
            const approvalState = inferHarnessApprovalState(record, workflowState);
            const persistenceState = getHarnessPersistenceState(record);
            const trade = normalizeDashboardTrade(record.jobField) || '미지정 공종';
            const selectedTrade = normalizeDashboardTrade(activeHarnessDrilldown.trade) || activeHarnessDrilldown.trade;

            switch (activeHarnessDrilldown.type) {
                case 'approval-backlog':
                    return approvalState === 'PENDING' || approvalState === 'REQUIRED';
                case 'immediate-attention':
                    return riskDecision === 'IMMEDIATE_ATTENTION' || riskDecision === 'CRITICAL_STOP';
                case 'fallback-pending':
                    return persistenceState === 'fallback' || persistenceState === 'pending';
                case 'trade-hotspot':
                    return trade === selectedTrade;
                default:
                    return false;
            }
        }).slice(0, 8);

        const title = activeHarnessDrilldown.type === 'approval-backlog'
            ? '승인 대기열 미리보기'
            : activeHarnessDrilldown.type === 'immediate-attention'
                ? '즉시 보호 대상 미리보기'
                : activeHarnessDrilldown.type === 'fallback-pending'
                    ? '데이터 저장 점검 대상 미리보기'
                    : `${activeHarnessDrilldown.trade || '선택 공종'} 최근 7일 집중 관리 미리보기`;

        const description = activeHarnessDrilldown.type === 'approval-backlog'
            ? '승인 또는 추가 검토가 남아 있는 최신 대상만 추렸습니다.'
            : activeHarnessDrilldown.type === 'immediate-attention'
                ? '즉시 보호 또는 중단 판단이 필요한 최신 대상입니다.'
                : activeHarnessDrilldown.type === 'fallback-pending'
                    ? '로컬 보관 또는 저장 대기 상태의 최신 대상입니다.'
                    : '선택 공종에서 최근 7일 이행 감사 이벤트가 집중된 최신 대상을 보여드립니다.';

        return {
            title,
            description,
            entries,
        };
    }, [activeHarnessDrilldown, latestFilteredWorkerRecords]);
    
    // [SIMULATION DATE] 2026-02-17
    const today = "2026년 2월 17일 화요일";
    const effectiveDashboardViewMode: DashboardViewMode =
        !isDetailedAnalysisRequested && (viewportWidth < 640 || isImmediateOperationalMode)
            ? 'essential'
            : dashboardViewMode;
    const isFullMode = effectiveDashboardViewMode === 'full';
    const isEssentialMode = effectiveDashboardViewMode === 'essential';
    const isEssentialMobile = isEssentialMode && viewportWidth < 640;
    const surveyDashboardSummary = useMemo(() => {
        const recordsWithAnswers = workerOnlyRecords.filter((record) => Array.isArray(record.handwrittenAnswers) && record.handwrittenAnswers.length > 0);
        if (recordsWithAnswers.length === 0) {
            return {
                topGapTrade: '-',
                topGapScore: 0,
                risingKeyword: '-',
                risingKeywordDelta: 0,
                latestSpecificity: 0,
                specificityDelta: 0,
                hasGapComparison: false,
                topGapDirection: '관리자 기준 미등록',
                topGapStatus: '비교 불가',
                gapAvailabilityLabel: '데이터 없음',
                baselineCoverage: 0,
                hasData: false,
            };
        }

        const tradeGapRows = buildSurveyRiskGapRows(
            recordsWithAnswers,
            managerRiskBaselines,
            trade => normalizeDashboardTrade(trade) || '기타',
        );
        const topGap = getTopComparableGap(tradeGapRows);
        const hasLowSample = tradeGapRows.some(row => row.status === 'low-sample');
        const comparableCount = tradeGapRows.reduce((sum, row) => sum + row.comparableCount, 0);
        const riskResponseCount = tradeGapRows.reduce((sum, row) => sum + row.workerResponseCount, 0);

        const monthKeys = (Array.from(new Set(recordsWithAnswers.map((record) => {
            const date = record.date ? new Date(record.date) : null;
            if (!date || Number.isNaN(date.getTime())) return '';
            const month = `${date.getMonth() + 1}`.padStart(2, '0');
            return `${date.getFullYear()}-${month}`;
        }))).filter(Boolean) as string[]).sort((left, right) => left.localeCompare(right));
        const latestMonth = monthKeys[monthKeys.length - 1] || '';
        const previousMonth = monthKeys[monthKeys.length - 2] || '';

        const getMonthKeywordCount = (monthKey: string, keyword: string): number => {
            if (!monthKey) return 0;
            const monthTexts = recordsWithAnswers
                .filter((record) => {
                    const date = record.date ? new Date(record.date) : null;
                    if (!date || Number.isNaN(date.getTime())) return false;
                    const month = `${date.getMonth() + 1}`.padStart(2, '0');
                    return `${date.getFullYear()}-${month}` === monthKey;
                })
                .flatMap((record) => (record.handwrittenAnswers || [])
                    .filter((answer) => answer.questionNumber === '1' || answer.questionNumber === '2')
                    .map((answer) => answer.koreanTranslation || answer.answerText));
            const merged = monthTexts.join(' ');
            return (merged.match(new RegExp(keyword, 'g')) || []).length;
        };

        const keywordDeltas = DASHBOARD_SURVEY_RISK_KEYWORDS.map((keyword) => {
            const current = getMonthKeywordCount(latestMonth, keyword);
            const previous = getMonthKeywordCount(previousMonth, keyword);
            const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);
            return { keyword, current, delta };
        }).sort((left, right) => right.current - left.current || right.delta - left.delta);
        const risingKeyword = keywordDeltas[0] || { keyword: '-', delta: 0 };

        const getMonthSpecificityAverage = (monthKey: string): number => {
            if (!monthKey) return 0;
            const scores = recordsWithAnswers
                .filter((record) => {
                    const date = record.date ? new Date(record.date) : null;
                    if (!date || Number.isNaN(date.getTime())) return false;
                    const month = `${date.getMonth() + 1}`.padStart(2, '0');
                    return `${date.getFullYear()}-${month}` === monthKey;
                })
                .flatMap((record) => (record.handwrittenAnswers || [])
                    .filter((answer) => answer.questionNumber === '4' || answer.questionNumber === '5' || answer.questionNumber === 'Q4' || answer.questionNumber === 'Q5')
                    .map((answer) => getSurveySpecificityScore(answer.koreanTranslation || answer.answerText)));
            if (scores.length === 0) return 0;
            return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
        };

        const latestSpecificity = getMonthSpecificityAverage(latestMonth);
        const previousSpecificity = getMonthSpecificityAverage(previousMonth);

        return {
            topGapTrade: topGap?.trade || '-',
            topGapScore: topGap?.absoluteGap || 0,
            hasGapComparison: Boolean(topGap),
            topGapDirection: topGap
                ? getRiskGapDirectionLabel(topGap.direction)
                : hasLowSample
                    ? '표본 3건 이상 필요'
                    : '관리자 기준 미등록',
            topGapStatus: topGap
                ? getRiskGapStatusLabel(topGap.status)
                : hasLowSample
                    ? '표본 부족'
                    : '비교 불가',
            gapAvailabilityLabel: hasLowSample ? '표본 부족' : '기준 미등록',
            baselineCoverage: riskResponseCount > 0 ? Math.round((comparableCount / riskResponseCount) * 100) : 0,
            risingKeyword: risingKeyword.keyword,
            risingKeywordDelta: risingKeyword.delta,
            latestSpecificity,
            specificityDelta: Math.round((latestSpecificity - previousSpecificity) * 10) / 10,
            hasData: true,
        };
    }, [managerRiskBaselines, workerOnlyRecords]);

    if (dashboardUIMode === 'basic') {
        return (
            <PrecisionOperationsBoard
                workerRecords={workerRecords}
                safetyCheckRecords={safetyCheckRecords}
                setCurrentPage={setCurrentPage}
                onOpenAdvanced={() => {
                    setIsDashboardUIModeLocked(false);
                    setDashboardUIMode('advanced');
                }}
            />
        );
    }
    return (
        <div className={`${isEssentialMobile ? 'space-y-3' : 'space-y-3 sm:space-y-4 lg:space-y-5'} animate-fade-in-up`}>
            {/* Precision Operations advanced command center */}
            <div id="advanced-overview" className="scroll-mt-24">
                <AdvancedOperationsOverview
                    appVersion={PSI_APP_VERSION}
                    dateLabel={today.split(' ')[0].replace('년', '/').replace('월', '/').replace('일', '')}
                    totalWorkers={stats.totalWorkers}
                    averageScore={stats.averageScore}
                    protectionPriorityCount={stats.highRiskWorkers}
                    approvalBacklogCount={harnessDashboardSummary.approvalBacklog}
                    onBackToBoard={() => setDashboardUIMode('basic')}
                    onOpenReports={() => setCurrentPage('reports')}
                    onOpenDetailedAnalysis={handleNavigateToDetailedAnalysis}
                    onOpenTeamComparison={handleNavigateToTeamComparison}
                    onOpenPredictiveAnalysis={() => setCurrentPage('predictive-analysis')}
                />

                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-white sm:p-4 lg:p-5">
                        <section id="field-mobile-flow" className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-300">MOBILE FIELD FLOW</p>
                                    </div>
                                    <h3 className="mt-1 text-lg sm:text-xl font-black text-white">현장 모바일 실행 흐름</h3>
                                    <p className="mt-1 text-xs font-medium text-slate-400 leading-relaxed">
                                        현장 입력부터 보호 판단, 교육, 리포트, 설정까지 필요한 기능을 단계별로 연결합니다.
                                    </p>
                                </div>
                                <div className="hidden sm:block shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-300">ACTIVE</p>
                                    <p className="mt-0.5 text-xs font-black text-white">핵심 흐름</p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
                                {[
                                    {
                                        step: '01',
                                        label: '홈 대시보드',
                                        page: 'dashboard' as Page,
                                        desc: '현장 위험현황 요약',
                                        status: `위험인식 신호 ${stats.averageScore.toFixed(1)}점`,
                                        isWarning: false,
                                    },
                                    {
                                        step: '02',
                                        label: '실시간 경보',
                                        page: 'site-issue-management' as Page,
                                        desc: '우선 대응 경보 목록',
                                        status: stats.highRiskWorkers > 0 ? `추가 확인 ${stats.highRiskWorkers}명` : '정상 상태',
                                        isWarning: stats.highRiskWorkers > 0,
                                    },
                                    {
                                        step: '03',
                                        label: '인지 프로파일',
                                        page: 'worker-management' as Page,
                                        desc: '안전 인지 프로파일',
                                        status: `총 ${stats.totalWorkers}명 등록`,
                                        isWarning: false,
                                    },
                                    {
                                        step: '04',
                                        label: '위험인지 진단',
                                        page: 'worker-training' as Page,
                                        desc: '자가진단 테스트',
                                        status: '진단 활성화',
                                        isWarning: false,
                                    },
                                    {
                                        step: '05',
                                        label: '현장 컨텍스트',
                                        page: 'field-context-input' as Page,
                                        desc: '기상/시간/공정 입력',
                                        status: '연동 정상',
                                        isWarning: false,
                                    },
                                    {
                                        step: '06',
                                        label: '행동 패턴 분석',
                                        page: 'safety-behavior-management' as Page,
                                        desc: '행동 유형 추적',
                                        status: '패턴 감지 중',
                                        isWarning: false,
                                    },
                                    {
                                        step: '07',
                                        label: '선행 위험신호',
                                        page: 'predictive-analysis' as Page,
                                        desc: '조치 우선순위 확인',
                                        status: '분석 갱신 완료',
                                        isWarning: false,
                                    },
                                    {
                                        step: '08',
                                        label: '현장 개입 추천',
                                        page: 'intervention-coaching' as Page,
                                        desc: '행동 교정 코칭 가이드',
                                        status: harnessDashboardSummary.immediateAttention > 0 ? `즉시 조치 ${harnessDashboardSummary.immediateAttention}건` : '조치 완료',
                                        isWarning: harnessDashboardSummary.immediateAttention > 0,
                                    },
                                    {
                                        step: '09',
                                        label: '수기 데이터 입력',
                                        page: 'judgment-tagging-input' as Page,
                                        desc: '원문 판단 태깅 입력',
                                        status: '대기 중',
                                        isWarning: false,
                                    },
                                    {
                                        step: '10',
                                        label: '데이터 태깅 검증',
                                        page: 'ocr-analysis' as Page,
                                        desc: '문서 자동 판독·검증',
                                        status: harnessDashboardSummary.approvalBacklog > 0 ? `승인 대기 ${harnessDashboardSummary.approvalBacklog}건` : '검증 완료',
                                        isWarning: harnessDashboardSummary.approvalBacklog > 0,
                                    },
                                    {
                                        step: '11',
                                        label: '안전 분석 리포트',
                                        page: 'reports' as Page,
                                        desc: '이행 감사 보고서',
                                        status: '보고서 갱신',
                                        isWarning: false,
                                    },
                                    {
                                        step: '12',
                                        label: '시스템 환경 설정',
                                        page: 'settings' as Page,
                                        desc: '권한 및 연동 설정',
                                        status: '연동 완료',
                                        isWarning: false,
                                    },
                                ].map((channel) => (
                                    <button
                                        key={channel.step}
                                        type="button"
                                        onClick={() => setCurrentPage(channel.page)}
                                        className="relative group rounded-2xl border border-white/5 bg-slate-900/40 p-3 text-left transition-all duration-300 hover:border-indigo-500/50 hover:bg-slate-900/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:-translate-y-0.5"
                                    >
                                        <div className="flex items-center justify-between gap-1 mb-1.5">
                                            <span className="text-[9px] font-black tracking-widest text-indigo-400">STEP {channel.step}</span>
                                            {channel.isWarning && (
                                                <span className="flex h-2 w-2 relative">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="text-xs sm:text-sm font-black text-white group-hover:text-indigo-200 transition-colors">
                                            {channel.label}
                                        </h4>
                                        <p className="mt-0.5 text-[10px] text-slate-500 font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                                            {channel.desc}
                                        </p>
                                        <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-1.5">
                                            <span className={`text-[10px] font-bold ${channel.isWarning ? 'text-rose-400' : 'text-slate-300'}`}>
                                                {channel.status}
                                            </span>
                                            <span className="text-[9px] font-bold text-indigo-300 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0">
                                                이동 →
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                    {(selectedTarget || selectedTradeForComparison || selectedTeam !== 'ALL') && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            {selectedTradeForComparison && (
                                <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-[11px] sm:text-xs font-bold text-indigo-100">
                                    비교 공종: {selectedTradeForComparison}
                                </span>
                            )}
                            {selectedTarget && (
                                <span className="px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-300/20 text-[11px] sm:text-xs font-bold text-indigo-100">
                                    분석 대상: {selectedTarget.trade} · {selectedTarget.nationality}
                                </span>
                            )}
                            {selectedTeam !== 'ALL' && (
                                <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-[11px] sm:text-xs font-bold text-slate-100">
                                    팀 필터: {selectedTeamOption?.label || selectedTeam}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={resetComparisonState}
                                className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-[11px] sm:text-xs font-black hover:bg-slate-100 transition-colors"
                            >
                                처음으로 돌아가기
                            </button>
                        </div>
                    )}

                    {!isImmediateOperationalMode && (
                    <div className="mb-3 sm:mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-200">역할별 보기</p>
                            <p className="mt-1 text-xs font-medium text-slate-200">{DASHBOARD_AUDIENCE_META[audienceView].description}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(Object.keys(DASHBOARD_AUDIENCE_META) as DashboardAudience[]).map((audience) => (
                                <button
                                    key={audience}
                                    type="button"
                                    onClick={() => handleAudienceChange(audience)}
                                    className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                        audienceView === audience
                                            ? 'bg-white text-slate-900'
                                            : 'bg-white/10 text-slate-100 hover:bg-white/20'
                                    }`}
                                >
                                    {DASHBOARD_AUDIENCE_META[audience].label}
                                </button>
                            ))}
                        </div>
                    </div>
                    )}

                    {!isEssentialMobile && (
                    <div className="mb-4 grid grid-cols-1 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:grid-cols-3">
                        {audienceQuickGuide.map((item) => (
                            <div key={item.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-200">{item.title}</p>
                                <p className="mt-1 text-xs font-bold text-white">{item.focus}</p>
                                <p className="mt-1 text-[11px] font-medium text-indigo-100">{item.action}</p>
                            </div>
                        ))}
                    </div>
                    )}

                    {!isImmediateOperationalMode && viewportWidth >= 640 && (
                    <div className="mb-3 sm:mb-4 flex flex-col gap-2 rounded-2xl border border-indigo-300/20 bg-indigo-500/10 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-300">대시보드 모드</p>
                            <p className="mt-1 text-xs font-medium text-indigo-100">
                                {dashboardUIMode === 'basic'
                                    ? '🟢 기본 모드: 새 사용자 중심 간단한 구성'
                                    : '⚙️ 고급 모드: 숙련자/관리자 중심 전체 기능'}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-indigo-200/90">
                                {isDashboardUIModeLocked
                                    ? '기본 보드 고정 설정이 켜져 있어 고급 모드 진입이 잠겨 있습니다.'
                                    : '기본 보드 고정이 해제되어 필요 시 고급 모드로 전환할 수 있습니다.'}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={toggleDashboardUIModeLock}
                                className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                    isDashboardUIModeLocked
                                        ? 'bg-emerald-300 text-slate-900'
                                        : 'bg-amber-300 text-slate-900'
                                }`}
                            >
                                {isDashboardUIModeLocked ? '기본 보드 고정 ON' : '기본 보드 고정 OFF'}
                            </button>
                            {(['basic', 'advanced'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => handleDashboardUIModeChange(mode)}
                                    disabled={isDashboardUIModeLocked && mode === 'advanced'}
                                    className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                        dashboardUIMode === mode
                                            ? 'bg-indigo-400 text-slate-900 shadow-lg'
                                            : 'bg-indigo-400/20 text-indigo-200 hover:bg-indigo-400/30'
                                    } ${isDashboardUIModeLocked && mode === 'advanced' ? 'cursor-not-allowed opacity-45' : ''}`}
                                >
                                    {mode === 'basic' ? '🟢 기본 모드' : '⚙️ 고급 모드'}
                                </button>
                            ))}
                        </div>
                    </div>
                    )}

                    {!isImmediateOperationalMode && (
                    <div className="mb-3 sm:mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-200">화면 구성 모드</p>
                            <p className="mt-1 text-xs font-medium text-slate-200">
                                {effectiveDashboardViewMode === 'full'
                                    ? '전체 분석: 평가자 중심 전체 맥락(Full Context)'
                                    : effectiveDashboardViewMode === 'balanced'
                                        ? '중간 구성: 핵심 + 필요 시 확장(Balanced)'
                                        : '필수 구성: 즉시 행동 중심(Essential)'}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {viewportWidth >= 640 ? (
                                ([
                                    { key: 'full', label: '전체 분석' },
                                    { key: 'balanced', label: '중간 구성' },
                                    { key: 'essential', label: '필수 구성' },
                                ] as Array<{ key: DashboardViewMode; label: string }>).map((mode) => (
                                    <button
                                        key={mode.key}
                                        type="button"
                                        onClick={() => handleDashboardViewModeChange(mode.key)}
                                        className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                            dashboardViewMode === mode.key
                                                ? 'bg-white text-slate-900'
                                                : 'bg-white/10 text-slate-100 hover:bg-white/20'
                                        }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))
                            ) : (
                                <span className="rounded-xl border border-indigo-300/30 bg-indigo-500/15 px-3 py-2 text-[11px] font-black text-indigo-100">
                                    모바일은 필수 구성으로 자동 최적화됩니다.
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={handleNavigateToTeamComparison}
                                className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-indigo-400"
                            >
                                팀 비교 바로가기
                            </button>
                        </div>
                    </div>
                    )}

                    {viewportWidth >= 1024 && !isEssentialMode && dashboardUIMode === 'advanced' && (
                        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-200">PC 운영 콘솔</p>
                                    <p className="mt-1 text-xs font-medium text-slate-200">운영 목적 화면으로 빠르게 전환해 대량 처리 흐름을 유지합니다.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 xl:grid-cols-5">
                                {pcConsoleActions.map((action) => (
                                    <button
                                        key={action.key}
                                        type="button"
                                        onClick={() => setCurrentPage(action.page)}
                                        className="min-h-[44px] rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left transition-colors hover:bg-white/20"
                                    >
                                        <p className="text-xs font-black text-white">{action.label}</p>
                                        <p className="mt-1 text-[10px] font-medium text-indigo-100">{action.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6">
                        <MetricCard
                            title="현장 안전 지수"
                            value={stats.averageScore.toFixed(1)}
                            unit="/ 100"
                            tone="neutral"
                            footer="실무 근로자 평균 점수"
                            icon={(
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            )}
                            className="bg-white/5 backdrop-blur-sm border-white/10"
                            darkBg
                        />

                        <MetricCard
                            title="활동 중인 근로자"
                            value={stats.totalWorkers}
                            unit="명"
                            tone="neutral"
                            footer="관리 직군 제외"
                            icon={(
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            )}
                            className="bg-white/5 backdrop-blur-sm border-white/10"
                            darkBg
                        />

                        <div className="sm:col-span-2 lg:col-span-1">
                            <MetricCard
                                title="보호 우선 모니터링"
                                value={stats.highRiskWorkers}
                                unit="명"
                                tone="warn"
                                footer="추가 확인 대상 감지"
                                icon={(
                                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                )}
                                className="bg-white/5 backdrop-blur-sm border-white/10"
                                darkBg
                            />
                        </div>
                    </div>

                    {isEssentialMobile && (
                        <div className="mb-4 rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h3 className="text-xs font-black text-white">최근 리포트</h3>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage('reports')}
                                    className="min-h-[44px] rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-black text-indigo-100"
                                >
                                    전체 보기
                                </button>
                            </div>
                            {mobileRecentReports.length === 0 ? (
                                <EmptyState
                                    title="최근 리포트가 없습니다."
                                    tone="info"
                                    className="rounded-xl border-dashed border-white/20 bg-white/5 px-3 py-3 text-[11px]"
                                />
                            ) : (
                                <div className="space-y-2">
                                    {mobileRecentReports.map((record) => {
                                        const reportDate = record.date
                                            ? new Date(record.date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
                                            : '-';
                                        const riskTone = record.safetyScore < 60
                                            ? 'bg-rose-500/20 text-rose-100 border-rose-300/40'
                                            : record.safetyScore < 75
                                                ? 'bg-amber-500/20 text-amber-100 border-amber-300/40'
                                                : 'bg-emerald-500/20 text-emerald-100 border-emerald-300/40';

                                        return (
                                            <button
                                                key={record.id}
                                                type="button"
                                                onClick={() => setCurrentPage('reports')}
                                                className="w-full min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-xs font-black text-white">{record.name}</p>
                                                        <p className="mt-0.5 text-[10px] font-medium text-indigo-100">{reportDate}</p>
                                                    </div>
                                                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${riskTone}`}>
                                                        {record.safetyScore.toFixed(1)}점
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Insights & Quick Actions */}
                    <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-stretch">
                        {!isEssentialMobile && (
                            <div className="flex-1 bg-indigo-500/10 backdrop-blur-sm border border-indigo-400/20 rounded-lg sm:rounded-xl p-3 sm:p-4">
                                <div className="flex items-start gap-2 sm:gap-3">
                                    <div className="p-1.5 sm:p-2 bg-indigo-400/20 rounded-lg shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] sm:text-xs font-bold text-indigo-200 mb-1 tracking-wide">자동 분석 의견</p>
                                        <p className="text-xs sm:text-sm text-white font-medium leading-relaxed">
                                            {audienceInsightMessage}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full lg:w-auto">
                            {quickActions.map((action) => (
                                <button
                                    key={action.key}
                                    onClick={() => handleQuickActionClick(action)}
                                    className={`w-full sm:w-auto min-h-[44px] px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                                        action.variant === 'solid'
                                            ? 'bg-white text-slate-900 shadow-lg hover:bg-slate-50'
                                            : 'bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md text-white'
                                    }`}
                                >
                                    {action.icon}
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {!isEssentialMode && (
            <div id="advanced-analysis" className="scroll-mt-24 grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                <div className={`lg:col-span-2 ${audienceView === 'executive' ? 'lg:order-2' : 'lg:order-1'}`}>
                    <SectionCard
                        title="설문 기반 핵심지표 포지셔닝"
                        subtitle="현장 설문 분석 지표를 대시보드 핵심 영역에 배치했습니다."
                        action={(
                            <button
                                type="button"
                                onClick={() => setCurrentPage('survey-intelligence')}
                                className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 transition-colors"
                            >
                                설문 인텔리전스 상세 보기
                            </button>
                        )}
                        className="h-full bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-lg hover:shadow-xl transition-shadow duration-300"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-900/20 p-3">
                                <p className="text-[11px] font-black text-rose-700 dark:text-rose-300">최대 인지 갭 공종</p>
                                <p className="mt-1 text-xl font-black text-rose-800 dark:text-rose-200">
                                    {surveyDashboardSummary.hasGapComparison
                                        ? surveyDashboardSummary.topGapTrade
                                        : surveyDashboardSummary.gapAvailabilityLabel}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">
                                    {surveyDashboardSummary.hasGapComparison
                                        ? `${surveyDashboardSummary.topGapScore}pt · ${surveyDashboardSummary.topGapStatus}`
                                        : surveyDashboardSummary.topGapStatus === '표본 부족'
                                            ? '공종별 Q3 비교 표본 3건 이상 필요'
                                            : '설문 상세에서 월·공종별 관리자 기준 등록'}
                                </p>
                                <p className="mt-1 text-[10px] font-semibold text-rose-500 dark:text-rose-400">
                                    {surveyDashboardSummary.hasGapComparison
                                        ? surveyDashboardSummary.topGapDirection
                                        : `기준 연결률 ${surveyDashboardSummary.baselineCoverage}%`}
                                </p>
                            </div>
                            <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                                <p className="text-[11px] font-black text-amber-700 dark:text-amber-300">이번 달 급증 위험어</p>
                                <p className="mt-1 text-xl font-black text-amber-800 dark:text-amber-200">{surveyDashboardSummary.risingKeyword}</p>
                                <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">{surveyDashboardSummary.risingKeywordDelta >= 0 ? `▲ ${surveyDashboardSummary.risingKeywordDelta}%` : `▼ ${Math.abs(surveyDashboardSummary.risingKeywordDelta)}%`}</p>
                            </div>
                            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                                <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300">자기규율 구체성 지수</p>
                                <p className="mt-1 text-xl font-black text-emerald-800 dark:text-emerald-200">{surveyDashboardSummary.latestSpecificity.toFixed(1)}점</p>
                                <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">{surveyDashboardSummary.specificityDelta >= 0 ? `+${surveyDashboardSummary.specificityDelta.toFixed(1)}pt` : `${surveyDashboardSummary.specificityDelta.toFixed(1)}pt`} 전월 대비</p>
                            </div>
                        </div>
                        {!surveyDashboardSummary.hasData && (
                            <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">설문 수기답변 데이터(Q1~Q5) 누적 후 지표가 자동 계산됩니다.</p>
                        )}
                    </SectionCard>
                </div>
                <div className={`bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 dark:border-slate-700 flex flex-col ${audienceView === 'executive' ? 'lg:order-1' : 'lg:order-2'}`}>
                    <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">국적별 근로자 현황</h3>
                    <div className="flex-1 min-h-[200px]">
                        <DeferredSection fallback={<ChartSkeleton minHeight="200px" />} rootMargin="160px">
                            <Suspense fallback={<ChartSkeleton minHeight="200px" />}>
                                <NationalityChart records={workerOnlyRecords} />
                            </Suspense>
                        </DeferredSection>
                    </div>
                </div>
            </div>
            )}

            {!isEssentialMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                <div className={`bg-white dark:bg-slate-800 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 dark:border-slate-700 ${audienceView === 'executive' ? 'md:order-2' : 'md:order-1'}`}>
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">근로자 주요 취약 분야</h3>
                         <Tooltip text="관리 직군을 제외한 실무 근로자 데이터에서 추출된 주요 취약점입니다.">
                            <div className="flex items-center text-xs sm:text-sm text-slate-400 dark:text-slate-300 cursor-pointer hover:text-slate-600 dark:hover:text-slate-100 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                <span className="hidden sm:inline">데이터 안내</span>
                            </div>
                        </Tooltip>
                    </div>
                    <div className="h-auto min-h-[15rem]">
                        <DeferredSection fallback={<ChartSkeleton minHeight="15rem" />} rootMargin="160px">
                            <Suspense fallback={<ChartSkeleton minHeight="15rem" />}>
                                <TopWeaknessesChart records={workerOnlyRecords} />
                            </Suspense>
                        </DeferredSection>
                    </div>
                </div>
                      <div className={`bg-white dark:bg-slate-800 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 dark:border-slate-700 ${audienceView === 'executive' ? 'md:order-1' : 'md:order-2'}`}>
                          <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
                              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">현장 안전 트렌드</h3>
                              <div className="flex bg-slate-100 dark:bg-slate-700 p-0.5 rounded-lg text-xs">
                                  <button
                                      type="button"
                                      onClick={() => setTrendTab('average')}
                                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                                          trendTab === 'average'
                                              ? 'bg-white dark:bg-slate-650 text-indigo-650 dark:text-indigo-200 shadow-sm'
                                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                      }`}
                                  >
                                      최근 평균 추세
                                  </button>
                                  <button
                                      type="button"
                                      onClick={() => setTrendTab('check')}
                                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                                          trendTab === 'check'
                                              ? 'bg-white dark:bg-slate-650 text-indigo-650 dark:text-indigo-200 shadow-sm'
                                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                      }`}
                                  >
                                      최근 점검 동향
                                  </button>
                              </div>
                          </div>
                    <div className="h-52 sm:h-56">
                        <DeferredSection fallback={<ChartSkeleton minHeight="16rem" />} rootMargin="160px">
                            <Suspense fallback={<ChartSkeleton minHeight="16rem" />}>
                                {trendTab === 'average' ? (
                                    <MonthlyTrendChart records={workerOnlyRecords} />
                                ) : (
                                    <SafetyCheckDonutChart records={safetyCheckRecords} />
                                )}
                            </Suspense>
                        </DeferredSection>
                    </div>
                </div>
            </div>
            )}

            {isDevMode && (harnessDashboardSummary.approvalBacklog > 0 || harnessDashboardSummary.fallback > 0 || harnessDashboardSummary.immediateAttention > 0) && (
                <NoticeCallout
                    variant={harnessDashboardSummary.immediateAttention > 0 ? 'rose' : harnessDashboardSummary.fallback > 0 ? 'amber' : 'indigo'}
                    title={harnessDashboardSummary.immediateAttention > 0
                        ? `즉시 보호 대상 ${harnessDashboardSummary.immediateAttention}명이 있어 승인·보완 우선순위를 먼저 정해야 합니다.`
                        : harnessDashboardSummary.fallback > 0
                            ? `안전 기록 저장 연결 보완 ${harnessDashboardSummary.fallback}명이 있어 저장 연결 여부를 함께 점검해야 합니다.`
                            : `관리자 검토 대기 ${harnessDashboardSummary.approvalBacklog}명이 남아 있어 검토 순서를 먼저 정리해야 합니다.`}
                    description={harnessDashboardSummary.fallback > 0
                        ? '대시보드에서 검토 대기 항목을 확인하고 서류 분석, 리포트, 관리자 검토로 이어가면 보호 흐름이 끊기지 않습니다.'
                        : '현장 보호 우선순위를 대시보드에서 먼저 읽고 세부 화면으로 내려가면 승인 누락과 설명 지연을 줄일 수 있습니다.'}
                    className={MOBILE_CARD_PANEL_COMPACT_CLASS}
                    bodyClassName="block"
                    titleClassName="text-sm font-black"
                    descriptionClassName="mt-1 text-xs font-semibold leading-relaxed"
                />
            )}

            {isDevMode && (
                <SummaryMetricGrid
                    items={harnessSummaryMetrics}
                    columnsClassName="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}

            {isFullMode && isDevMode && harnessRecentTradeHotspots.length > 0 ? (
                <div className={`${MOBILE_CARD_PANEL_CLASS} border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-650 dark:text-slate-350">최근 7일 공종 집중도</p>
                            <h3 className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">전이 차단·승인·재분석이 몰린 공종을 우선 확인합니다.</h3>
                        </div>
                        <div className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">
                            상위 {harnessRecentTradeHotspots.length}개 공종
                        </div>
                    </div>

                    <div className="mt-4 overflow-auto">
                        <table className="w-full min-w-[760px] text-left text-[11px]">
                            <thead className="text-slate-650 dark:text-slate-300">
                                <tr>
                                    <th className="py-2 pr-3">공종</th>
                                    <th className="py-2 pr-3">최근 운영 대상</th>
                                    <th className="py-2 pr-3">전이 차단</th>
                                    <th className="py-2 pr-3">승인/반려</th>
                                    <th className="py-2 pr-3">재분석</th>
                                    <th className="py-2 pr-3">감사 이벤트</th>
                                    <th className="py-2 pr-3">집중도</th>
                                </tr>
                            </thead>
                            <tbody className="align-top text-slate-700 dark:text-slate-200">
                                {harnessRecentTradeHotspots.map((item) => (
                                    <tr key={item.trade} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="py-2 pr-3 font-black">
                                            <button
                                                type="button"
                                                onClick={() => openHarnessTradeDrilldown(item.trade)}
                                                className="text-left text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-200 hover:underline"
                                            >
                                                {item.trade}
                                            </button>
                                        </td>
                                        <td className="py-2 pr-3">{item.touchedWorkerCount}명</td>
                                        <td className="py-2 pr-3 font-semibold text-amber-700">{item.transitionBlocks}건</td>
                                        <td className="py-2 pr-3 font-semibold text-emerald-700">{item.approvals}건</td>
                                        <td className="py-2 pr-3 font-semibold text-violet-700">{item.reassessments}건</td>
                                        <td className="py-2 pr-3">{item.auditEvents}건</td>
                                        <td className="py-2 pr-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.totalSignal >= 8 ? 'bg-rose-100 text-rose-700' : item.totalSignal >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {item.totalSignal >= 8 ? '높음' : item.totalSignal >= 4 ? '중간' : '낮음'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => openHarnessTradeDrilldown(item.trade)}
                                                    className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                >
                                                    바로 보기
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            {isFullMode && isDevMode && (
            <div className={`${MOBILE_CARD_PANEL_CLASS} border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-655 dark:text-slate-350">안전 이행 상세 분석</p>
                        <h3 className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">대기 항목과 집중 관리 공종을 대시보드 안에서 바로 분석합니다.</h3>
                    </div>
                    {activeHarnessDrilldown ? (
                        <button
                             type="button"
                             onClick={() => setActiveHarnessDrilldown(null)}
                             className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-black text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            상세 분석 해제
                        </button>
                    ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => openHarnessOperationalDrilldown('approval-backlog')}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-black transition-colors ${activeHarnessDrilldown?.type === 'approval-backlog' ? 'bg-violet-600 text-white' : 'border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}
                    >
                        승인 대기 {harnessDashboardSummary.approvalBacklog}명
                    </button>
                    <button
                        type="button"
                        onClick={() => openHarnessOperationalDrilldown('immediate-attention')}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-black transition-colors ${activeHarnessDrilldown?.type === 'immediate-attention' ? 'bg-rose-600 text-white' : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                    >
                        즉시 보호 {harnessDashboardSummary.immediateAttention}명
                    </button>
                    <button
                        type="button"
                        onClick={() => openHarnessOperationalDrilldown('fallback-pending')}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-black transition-colors ${activeHarnessDrilldown?.type === 'fallback-pending' ? 'bg-amber-600 text-white' : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                    >
                        저장 보완 점검 {harnessDashboardSummary.fallback + harnessDashboardSummary.pending}명
                    </button>
                </div>

                {harnessDrilldownPreview ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-sm font-black text-slate-800 dark:text-slate-100">{harnessDrilldownPreview.title}</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-650 dark:text-slate-300">{harnessDrilldownPreview.description}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => navigateToWorkerManagementWithHarnessFilter(activeHarnessDrilldown)}
                                    className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-[11px] font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                    {harnessDrilldownActionPlan?.primaryLabel || '근로자 관리 필터로 이어보기'}
                                </button>
                                {harnessDrilldownActionPlan ? (
                                    <button
                                        type="button"
                                        onClick={() => navigateToDashboardFollowUpPage(harnessDrilldownActionPlan.secondaryPage)}
                                        className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700 hover:bg-indigo-100"
                                    >
                                        {harnessDrilldownActionPlan.secondaryLabel}
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {harnessDrilldownActionPlan ? (
                            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
                                <p className="text-[11px] font-black text-indigo-900">{harnessDrilldownActionPlan.headline}</p>
                                <p className="mt-1 text-[11px] font-semibold leading-relaxed text-indigo-700">{harnessDrilldownActionPlan.detail}</p>
                            </div>
                        ) : null}

                        <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                            {harnessDrilldownPreview.entries.length > 0 ? harnessDrilldownPreview.entries.map((record) => {
                                const workflowState = inferHarnessWorkflowState(record);
                                const riskDecision = inferHarnessRiskDecision(record);
                                const approvalState = inferHarnessApprovalState(record, workflowState);
                                const persistenceState = getHarnessPersistenceState(record);

                                return (
                                    <div key={`${record.id}-${record.date}`} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 px-3 py-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-black text-slate-800 dark:text-slate-100">{record.name}</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-650 dark:text-slate-300">{record.jobField} · {record.teamLeader || '미지정 팀'}</p>
                                            </div>
                                            <span className="rounded-full bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-black text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                                {Number(record.safetyScore).toFixed(0)}점
                                            </span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black">
                                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">{workflowState}</span>
                                            <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700">{riskDecision}</span>
                                            <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">{approvalState}</span>
                                            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">{persistenceState}</span>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-4 text-[11px] font-bold text-slate-655 dark:text-slate-300 xl:col-span-2">
                                    현재 선택 조건에서 바로 보여드릴 대상이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
            )}

            {isFullMode && isDevMode && (
                <InterpretationCardGrid
                    items={harnessOperationalInsights}
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}

            {isFullMode && isDevMode && (
                <SummaryMetricGrid
                    items={harnessAuditMetrics}
                    columnsClassName="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}

            {isFullMode && isDevMode && (
                <InterpretationCardGrid
                    items={harnessAuditInsights}
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}

            {isFullMode && isDevMode && (
                <SummaryMetricGrid
                    items={harnessRecentOpsMetrics}
                    columnsClassName="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}

            {isFullMode && isDevMode && (
                <InterpretationCardGrid
                    items={harnessRecentOpsInsights}
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}

            {!isEssentialMobile && (
            <div className="bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-400 p-3 sm:p-4 rounded-r-lg flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                <div className="flex items-start sm:items-center gap-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs sm:text-sm text-indigo-700 dark:text-indigo-200 font-bold">
                        [데이터 안내] 2026년 기준 실무 근로자 중심 분석 모드 활성 · 현재 {DASHBOARD_AUDIENCE_META[audienceView].label}
                    </p>
                </div>
            </div>
            )}

            {!isEssentialMobile && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                {overviewStatCards.map((card) => (
                    <StatCard
                        key={card.key}
                        title={card.title}
                        value={card.value}
                        iconType={card.iconType}
                        onClick={() => setCurrentPage(card.page)}
                    />
                ))}
            </div>
            )}

            {!isEssentialMobile && audienceView !== 'worker' && (
                <button
                    type="button"
                    onClick={handleNavigateToUnassignedRecords}
                    className={`w-full rounded-xl sm:rounded-2xl border px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left transition-colors ${
                    isUnassignedWarning
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                }`}
                >
                    <div className="flex items-start sm:items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            isUnassignedWarning ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                            </svg>
                        </div>
                        <div>
                            <p className={`text-sm font-black ${isUnassignedWarning ? 'text-amber-900 dark:text-amber-200' : 'text-slate-800 dark:text-slate-100'}`}>
                                식별 보완 필요 데이터
                            </p>
                            <p className={`text-xs font-medium ${isUnassignedWarning ? 'text-amber-800 dark:text-amber-300' : 'text-slate-650 dark:text-slate-400'}`}>
                                관리자 식별정보가 연결되지 않은 기록은 개인 이력 분석에서 제외됩니다.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-end gap-1 sm:gap-1.5">
                        <span className={`text-2xl sm:text-3xl font-black ${isUnassignedWarning ? 'text-amber-800 dark:text-amber-200' : 'text-slate-700 dark:text-slate-300'}`}>
                            {unassignedCount}
                        </span>
                        <span className={`text-sm font-bold pb-0.5 ${isUnassignedWarning ? 'text-amber-700 dark:text-amber-400' : 'text-slate-650 dark:text-slate-400'}`}>건</span>
                    </div>
                </button>
            )}

            {!isEssentialMode && (
                <InterpretationCardGrid
                    items={dashboardSummaryCards}
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}

            {!isEssentialMode && (
                <InterpretationCardGrid
                    items={operationalFocusCards}
                    className="grid grid-cols-1 xl:grid-cols-2 gap-3"
                    cardClassName={MOBILE_CARD_GRID_ITEM_CLASS}
                />
            )}
            
            {/* ═══════════════════════════════════════════════════════
                    공종 × 국적 교차 안전 숙련도 분석 섹션 (아래)
            ═══════════════════════════════════════════════════════ */}
            {isFullMode && dashboardUIMode === 'advanced' && (
            <div id="advanced-team-comparison" ref={teamComparisonSectionRef} className={`scroll-mt-24 space-y-4 sm:space-y-6 transition-all duration-300 ${isRiskMapFocusActive ? 'rounded-2xl ring-2 ring-rose-300 ring-offset-2 ring-offset-white' : ''}`}>
                <InterpretationCardGrid
                    items={comparisonCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
                {/* 섹션 헤더 + 팀별 드롭다운 */}
                <div className="sticky top-2 z-20 rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-3 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-1 h-6 bg-indigo-500 rounded-full" />
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-800">
                                {comparisonSectionMeta.title}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {comparisonSectionMeta.description}
                            </p>
                        </div>
                    </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedTradeForComparison && (
                                <WorkTypeBadge
                                    workType={selectedTradeForComparison}
                                    emphasis="strong"
                                    className="bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-100"
                                />
                            )}
                            <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-black text-slate-700 dark:text-slate-100">
                                메인 비교 {selectedTeamsForComparison.length}/{TEAM_COMPARISON_MAX_SELECTION}팀
                            </span>
                            <div className="hidden sm:flex items-center gap-2">
                                <label htmlFor="team-select" className="text-xs font-bold text-slate-600 mr-1">팀별 보기</label>
                                <select
                                    id="team-select"
                                    className="border rounded-lg px-2 py-1 text-xs font-bold text-slate-700 bg-white"
                                    value={selectedTeam}
                                    onChange={e => setSelectedTeam(e.target.value)}
                                >
                                    <option value="ALL">전체</option>
                                    {teamOptions.map(option => (
                                        <option key={option.key} value={option.key}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    {selectedTeamsForComparison.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:hidden">
                            {selectedTeamsForComparison.map((teamName) => (
                                (() => {
                                    const priorityBadge = getSelectedTeamPriorityBadge(teamName);
                                    return (
                                        <button
                                            key={`sticky-${teamName}`}
                                            type="button"
                                            onClick={() => toggleTeamComparisonSelection(teamName)}
                                            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-black text-indigo-700"
                                        >
                                            {priorityBadge && (
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${priorityBadge.className}`}>
                                                    {priorityBadge.label}
                                                </span>
                                            )}
                                            {teamName}
                                            <span className="text-indigo-400">✕</span>
                                        </button>
                                    );
                                })()
                            ))}
                        </div>
                    )}
                    <div className="mt-3 sm:hidden">
                        <select
                            className="w-full border rounded-xl px-3 py-2 text-xs font-bold text-slate-700 bg-white"
                            value={selectedTeam}
                            onChange={e => setSelectedTeam(e.target.value)}
                        >
                            <option value="ALL">전체 팀 보기</option>
                            {teamOptions.map(option => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="md:hidden sticky top-[104px] z-10 -mt-1 flex gap-2 overflow-x-auto rounded-2xl bg-slate-50/95 dark:bg-slate-900/95 px-1 py-2 backdrop-blur">
                    {mobileInsightTabs.map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setMobileInsightTab(tab.key)}
                            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border transition-colors ${
                                mobileInsightTab === tab.key
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {tradeQuickAccess.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-100">{comparisonSectionMeta.tradeQuickAccessTitle}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-300">{comparisonSectionMeta.tradeQuickAccessDescription}</p>
                            </div>
                            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold">
                                {comparisonSectionMeta.tradeQuickAccessBadge}
                            </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {tradeQuickAccess.map(item => (
                                <button
                                    key={item.trade}
                                    type="button"
                                    onClick={() => openTradeIntegratedAnalysis(item.trade)}
                                    className={`shrink-0 rounded-xl border px-3 py-2 text-left min-w-[132px] transition-colors ${
                                        selectedTradeForComparison === item.trade
                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <p className="text-xs font-black truncate">{item.trade}</p>
                                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                                        <span>{item.workerCount}명</span>
                                        <span className="font-black">{item.avgScore.toFixed(1)}점</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {teamQuickAccessSummaries.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-100">{comparisonSectionMeta.teamQuickAccessTitle}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-300">
                                    {selectedTradeForComparison
                                        ? `${selectedTradeForComparison} 공종 팀만 빠르게 노출합니다. 메인 비교에 넣을 팀을 2~3개 고르세요.`
                                        : comparisonSectionMeta.teamQuickAccessDescription}
                                </p>
                            </div>
                            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold">
                                {comparisonSectionMeta.teamQuickAccessBadge}
                            </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            <button
                                type="button"
                                onClick={() => setSelectedTeam('ALL')}
                                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors min-w-[116px] ${
                                    selectedTeam === 'ALL'
                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                <p className="text-[10px] font-black uppercase tracking-wide">전체</p>
                                <p className="text-xs font-bold mt-1">전체 통합 뷰</p>
                            </button>
                            {teamQuickAccessSummaries.map(summary => (
                                <button
                                    key={summary.key}
                                    type="button"
                                    onClick={() => setSelectedTeam(summary.key)}
                                    className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors min-w-[132px] ${
                                        selectedTeam === summary.key
                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <p className="text-xs font-black truncate">{summary.team}</p>
                                    <p className="text-[10px] font-bold mt-1 opacity-70">{summary.trade}</p>
                                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                                        <span>{summary.workerCount}명</span>
                                        <span className="font-black">{summary.avgScore.toFixed(1)}점</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ① Grouped Bar Chart */}
                <div className={mobileInsightTab === 'chart' ? 'block' : 'hidden md:block'}>
                    {teamNationalityDrilldownStatus && (
                        <div className="mb-3 rounded-2xl border border-violet-100 bg-violet-50/80 px-3 py-3 sm:px-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div>
                                    <p className="text-[11px] font-black text-violet-700">현재 팀 내부 국적 분석 상태</p>
                                    <p className="mt-1 text-xs text-violet-800">
                                        현재 <span className="font-black">{teamNationalityDrilldownStatus.teamLabel}</span> 기준으로 국적 흐름을 확인하고 있습니다.
                                        {teamNationalityDrilldownStatus.isSpecificNationality
                                            ? ` 현재 선택 국적은 ${teamNationalityDrilldownStatus.nationalityLabel}입니다.`
                                            : ' 아직 특정 국적을 고르지 않았으며, 막대를 눌러 세부 국적으로 내려갈 수 있습니다.'}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-violet-700 border border-violet-200">
                                        팀 {teamNationalityDrilldownStatus.teamLabel}
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-black text-violet-700">
                                        국적 {teamNationalityDrilldownStatus.nationalityLabel}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                    {!teamNationalityDrilldownStatus && selectedTradeForComparison && (
                        <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
                            <p className="text-[11px] font-black text-slate-700">차트 해석 안내</p>
                            <p className="mt-1 text-xs text-slate-600">
                                메인 비교는 팀 기준으로 유지됩니다. 팀 내부 국적 차이를 보려면 먼저 비교 팀을 고른 뒤 <span className="font-black">국적 보기</span>로 내려가세요.
                            </p>
                        </div>
                    )}
                    <DeferredSection fallback={<ChartSkeleton minHeight="320px" />} rootMargin="120px">
                        <Suspense fallback={<ChartSkeleton minHeight="320px" />}>
                            <TradeNationalityCrossChart
                                onSelect={openNationalityDetailAnalysis}
                                selected={selectedTarget}
                                data={dashboardData}
                            />
                        </Suspense>
                    </DeferredSection>
                </div>

                {selectedTradeForComparison && selectedTradeTeamComparison.length > 0 && (
                    <div className={`${mobileInsightTab === 'team' ? 'block' : 'hidden md:block'} bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-4 sm:p-6 space-y-4`}>
                        {selectedTradeComparison.length > 1 && (
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 sm:p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-black text-emerald-700">공종 비교 분석</p>
                                        <p className="text-[11px] text-emerald-700/80 mt-1">팀 비교와 별개로 공종 2~3개를 같은 축에서 비교할 수 있습니다.</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 rounded-lg text-xs font-black border border-emerald-200">
                                            선택 공종 {selectedTradesForComparison.length} / {TRADE_COMPARISON_MAX_SELECTION}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTradesForComparison([])}
                                            className="px-3 py-1.5 rounded-lg bg-white text-slate-700 text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors"
                                        >
                                            공종 선택 초기화
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                                    {selectedTradeComparison.map((trade) => {
                                        const isSelectedForComparison = selectedTradesForComparison.includes(trade.trade);
                                        const isSelectionLocked = !isSelectedForComparison && selectedTradesForComparison.length >= TRADE_COMPARISON_MAX_SELECTION;
                                        return (
                                            <button
                                                key={`trade-select-${trade.trade}`}
                                                type="button"
                                                onClick={() => toggleTradeComparisonSelection(trade.trade)}
                                                disabled={isSelectionLocked}
                                                className={`shrink-0 rounded-xl border px-3 py-2 text-left min-w-[148px] transition-colors ${
                                                    isSelectedForComparison
                                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                                        : isSelectionLocked
                                                            ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                <p className="text-xs font-black truncate">{trade.trade}</p>
                                                <p className="mt-1 text-[10px] font-bold opacity-70">{trade.workerCount}명 · {trade.avgScore.toFixed(1)}점</p>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <input
                                            value={tradePresetNameDraft}
                                            onChange={(event) => setTradePresetNameDraft(event.target.value)}
                                            placeholder="예: 형틀·철근·타설 비교"
                                            className="w-full sm:max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 placeholder:text-slate-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={saveCurrentTradeComparisonPreset}
                                            disabled={selectedTradesForComparison.length < 2}
                                            className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-black enabled:hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            현재 공종 조합 저장
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleExportTradeComparisonPresetsCsv}
                                            disabled={tradeComparisonPresets.length === 0}
                                            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11px] font-black enabled:hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            공종 저장 조건 표(CSV)
                                        </button>
                                    </div>
                                    <div className="mt-2">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleTradePresetScopeChange('current-trade')}
                                                    disabled={!selectedTradeForComparison}
                                                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-black transition-colors ${
                                                        tradePresetScope === 'current-trade'
                                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                            : 'border-slate-200 bg-white text-slate-600'
                                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                                >
                                                    현재 공종
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleTradePresetScopeChange('all-trades')}
                                                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-black transition-colors ${
                                                        tradePresetScope === 'all-trades'
                                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                            : 'border-slate-200 bg-white text-slate-600'
                                                    }`}
                                                >
                                                    전체 공종
                                                </button>
                                            </div>
                                            <input
                                                value={tradePresetSearchQuery}
                                                onChange={(event) => setTradePresetSearchQuery(event.target.value)}
                                                placeholder="저장한 공종 조건 검색"
                                                className="w-full sm:max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 placeholder:text-slate-400"
                                            />
                                        </div>
                                    </div>
                                    <p className="mt-1 text-[10px] text-slate-500">자주 비교하는 공종 조합을 저장해 다시 불러올 수 있습니다.</p>
                                    {tradePresetPinLimitNotice && (
                                        <p className="mt-1 text-[10px] font-bold text-amber-700">{tradePresetPinLimitNotice}</p>
                                    )}
                                    {pinnedQuickTradePresets.length > 0 && (
                                        <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-2">
                                            <p className="text-[10px] font-black tracking-[0.08em] text-emerald-700">고정한 공종 조건 · 최근 사용 순</p>
                                            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                                {pinnedQuickTradePresets.map((preset) => {
                                                    const recent7dApplyCount = getRecentPresetApplyCount(preset.appliedAtHistory, 7);
                                                    const totalApplyCount = (preset.appliedAtHistory || []).length;
                                                    return (
                                                        <button
                                                            key={`trade-quick-${preset.id}`}
                                                            type="button"
                                                            onClick={() => applyTradeComparisonPreset(preset)}
                                                            className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-left min-w-[184px]"
                                                        >
                                                            <p className="text-[11px] font-black text-emerald-700 truncate">📌 {preset.name}</p>
                                                            <p className="text-[10px] font-semibold text-slate-500">{preset.trades.join(' · ')}</p>
                                                            <p className="mt-1 text-[10px] font-bold text-emerald-700">최근 사용: {formatPresetUsedAt(preset.lastUsedAt)}</p>
                                                            <p className="text-[10px] font-bold text-slate-500">최근7일 {recent7dApplyCount}회 · 누적 {totalApplyCount}회</p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {applicableTradeComparisonPresets.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {applicableTradeComparisonPresets.map((preset) => {
                                                const recent7dApplyCount = getRecentPresetApplyCount(preset.appliedAtHistory, 7);
                                                const totalApplyCount = (preset.appliedAtHistory || []).length;
                                                return (
                                                <div key={`trade-preset-${preset.id}`} className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 ${preset.pinned ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'}`}>
                                                    {editingTradePresetId === preset.id ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                value={editingTradePresetName}
                                                                onChange={(event) => setEditingTradePresetName(event.target.value)}
                                                                className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => commitEditingTradeComparisonPreset(preset.id)}
                                                                disabled={String(editingTradePresetName || '').trim().length === 0}
                                                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 enabled:hover:bg-emerald-100 disabled:opacity-50"
                                                            >
                                                                저장
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={cancelEditingTradeComparisonPreset}
                                                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-50"
                                                            >
                                                                취소
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => applyTradeComparisonPreset(preset)}
                                                            className="text-left"
                                                        >
                                                            <p className="text-[11px] font-black text-slate-700 hover:text-emerald-700 transition-colors">{preset.pinned ? '📌 ' : ''}{preset.name}</p>
                                                            <p className="text-[10px] font-semibold text-slate-500">{preset.trades.join(' · ')}</p>
                                                            <p className="text-[10px] font-bold text-slate-400">{formatPresetUsedAt(preset.lastUsedAt)}</p>
                                                            <p className="text-[10px] font-bold text-slate-400">최근7일 {recent7dApplyCount}회 · 누적 {totalApplyCount}회</p>
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleTradeComparisonPresetPin(preset.id)}
                                                        className={`text-[11px] font-black transition-colors ${preset.pinned ? 'text-emerald-700 hover:text-emerald-800' : 'text-slate-400 hover:text-emerald-600'}`}
                                                    >
                                                        {preset.pinned ? '고정해제' : '고정'}
                                                    </button>
                                                    {editingTradePresetId !== preset.id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditingTradeComparisonPreset(preset)}
                                                            className="text-[11px] font-black text-slate-400 hover:text-emerald-600 transition-colors"
                                                        >
                                                            수정
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeTradeComparisonPreset(preset.id)}
                                                        className="text-[11px] font-black text-slate-400 hover:text-rose-500 transition-colors"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {selectedTradesForComparison.length < 2 ? (
                                    <p className="mt-3 text-[11px] font-bold text-amber-700">공종 비교를 시작하려면 공종을 2개 이상 선택하세요.</p>
                                ) : (
                                    <>
                                        <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-800">
                                            현재 공종 비교: {tradeComparisonHeadline}
                                        </div>
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {comparedTradeRows.map((trade) => {
                                                const trendLabel = trade.trendDirection === 'up'
                                                    ? `상승 ${trade.avgDelta.toFixed(1)}점`
                                                    : trade.trendDirection === 'down'
                                                        ? `하락 ${Math.abs(trade.avgDelta).toFixed(1)}점`
                                                        : '보합';

                                                return (
                                                    <div key={`trade-card-${trade.trade}`} className="rounded-2xl border border-emerald-200 bg-white p-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <p className="text-sm font-black text-slate-800">{trade.trade}</p>
                                                                <p className="mt-1 text-[11px] font-bold text-slate-500">인원 {trade.workerCount}명</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => openTradeIntegratedAnalysis(trade.trade, 'team')}
                                                                className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 hover:bg-emerald-100"
                                                            >
                                                                상세 보기
                                                            </button>
                                                        </div>
                                                        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                                                            <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                                                                <p className="text-[9px] font-bold text-slate-400">점수</p>
                                                                <p className="mt-1 text-[11px] font-black text-slate-700">{trade.avgScore.toFixed(1)}</p>
                                                            </div>
                                                            <div className="rounded-lg bg-red-50 px-2 py-1.5">
                                                                <p className="text-[9px] font-bold text-red-400">위험</p>
                                                                <p className="mt-1 text-[11px] font-black text-red-600">{trade.riskCount}</p>
                                                            </div>
                                                            <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                                                                <p className="text-[9px] font-bold text-amber-500">미처리</p>
                                                                <p className="mt-1 text-[11px] font-black text-amber-600">{trade.unresolvedCount}</p>
                                                            </div>
                                                            <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
                                                                <p className="text-[9px] font-bold text-emerald-500">추세</p>
                                                                <p className="mt-1 text-[11px] font-black text-emerald-700">{trendLabel}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                                    {teamComparisonHeadline}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                                    형틀 A팀 vs B팀 vs C팀처럼 팀 축을 먼저 고정하고, 국적은 필요할 때만 하단 고급 보기에서 해석 근거로 확인합니다.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-lg text-xs font-bold">
                                    선택 팀 {selectedTeamsForComparison.length} / {TEAM_COMPARISON_MAX_SELECTION}
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                                    비교 기준: 전체 국적 통합
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDetailViewMode('integrated');
                                        setMobileInsightTab('team');
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors"
                                >
                                    팀 비교
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!hasSelectedTeamForDrilldown) return;
                                        const leadTeam = selectedTeamsForComparison[0];
                                        if (leadTeam) {
                                            openSelectedTeamNationalityDrilldown(leadTeam);
                                            return;
                                        }
                                        setIsComparisonAdvancedOpen(true);
                                        if (hasNationalityDetail) {
                                            setDetailViewMode('nationality');
                                        }
                                        setMobileInsightTab('chart');
                                    }}
                                    disabled={!hasSelectedTeamForDrilldown}
                                    className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold hover:bg-violet-100 transition-colors disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                                >
                                    {hasSelectedTeamForDrilldown ? '선택 1팀 국적 보기' : '먼저 팀 선택'}
                                </button>
                                <button
                                    type="button"
                                    onClick={resetComparisonState}
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                    되돌리기
                                </button>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/20 p-3 sm:p-4">
                            <p className="text-[11px] font-black text-indigo-700 dark:text-indigo-200">핵심 비교 요약</p>
                            <div className="mt-2 space-y-1.5 text-[11px] text-indigo-800 dark:text-indigo-100">
                                <p>1) {comparisonSummaryLines.scope}</p>
                                <p>2) {comparisonSummaryLines.priority}</p>
                                <p>3) {comparisonSummaryLines.benchmark}</p>
                            </div>
                        </div>

                        {selectedTeamSummaryBarRows.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 sm:p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-black text-slate-700 dark:text-slate-100">선택 팀 요약 바</p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-1">선택 순서대로 고정됩니다. 메인 비교 카드도 같은 순서로 정렬됩니다.</p>
                                    </div>
                                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">
                                        {selectedTeamSummaryBarRows.length} / {TEAM_COMPARISON_MAX_SELECTION}팀
                                    </span>
                                </div>
                                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible">
                                    {selectedTeamSummaryBarRows.map((team) => {
                                        const priorityBadge = getSelectedTeamPriorityBadge(team.team);
                                        const trendLabel = team.trendDirection === 'up'
                                            ? `상승 ${team.avgDelta.toFixed(1)}점`
                                            : team.trendDirection === 'down'
                                                ? `하락 ${Math.abs(team.avgDelta).toFixed(1)}점`
                                                : '보합';

                                        return (
                                            <div key={`summary-${team.team}`} className="shrink-0 snap-start w-[260px] lg:w-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {priorityBadge && (
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${priorityBadge.className}`}>
                                                                    {priorityBadge.label}
                                                                </span>
                                                            )}
                                                            <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{team.team}</p>
                                                        </div>
                                                        <p className="mt-1 text-[10px] font-bold text-slate-500 dark:text-slate-300">{selectedTradeForComparison} · 최신 {team.workerCount}명</p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openSelectedTeamNationalityDrilldown(team.team)}
                                                            className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700 hover:bg-violet-100"
                                                        >
                                                            국적 보기
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleTeamComparisonSelection(team.team)}
                                                            className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-black text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                                                        >
                                                            제외
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                                                    <div className="rounded-lg bg-white dark:bg-slate-900 px-2 py-1.5">
                                                        <p className="text-[9px] font-bold text-slate-400">점수</p>
                                                        <p className="mt-1 text-[11px] font-black text-slate-800 dark:text-slate-100">{team.avgScore.toFixed(1)}</p>
                                                    </div>
                                                    <div className="rounded-lg bg-red-50 px-2 py-1.5">
                                                        <p className="text-[9px] font-bold text-red-400">위험</p>
                                                        <p className="mt-1 text-[11px] font-black text-red-600">{team.riskCount}</p>
                                                    </div>
                                                    <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                                                        <p className="text-[9px] font-bold text-amber-500">미처리</p>
                                                        <p className="mt-1 text-[11px] font-black text-amber-600">{team.unresolvedCount}</p>
                                                    </div>
                                                    <div className="rounded-lg bg-slate-100 dark:bg-slate-900 px-2 py-1.5">
                                                        <p className="text-[9px] font-bold text-slate-400">추세</p>
                                                        <p className="mt-1 text-[11px] font-black text-slate-700 dark:text-slate-100">{trendLabel}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 sm:p-4">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black text-indigo-700">메인 비교 팀 선택</p>
                                    <p className="text-[11px] text-indigo-600 mt-1">첫 액션은 팀 선택만 진행합니다. 비교할 팀을 2~3개 고르면 같은 축으로 바로 비교됩니다.</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-700 rounded-lg text-xs font-black border border-indigo-200">
                                        선택 팀 {selectedTeamsForComparison.length}개
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedTeamsForComparison([])}
                                        className="px-3 py-1.5 rounded-lg bg-white text-slate-700 text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors"
                                    >
                                        팀 선택 초기화
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-200">
                                <div className="rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 px-3 py-2">1) 먼저 공종을 고릅니다.</div>
                                <div className="rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 px-3 py-2">2) 비교할 팀을 2~3개 선택합니다.</div>
                                <div className="rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 px-3 py-2">3) 점수 · 위험 · 미처리 · 추세를 같은 축으로 봅니다.</div>
                            </div>
                            {selectedTeamsForComparison.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedTeamsForComparison.map((teamName) => (
                                        (() => {
                                            const priorityBadge = getSelectedTeamPriorityBadge(teamName);
                                            return (
                                                <button
                                                    key={teamName}
                                                    type="button"
                                                    onClick={() => toggleTeamComparisonSelection(teamName)}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-black text-indigo-700"
                                                >
                                                    {priorityBadge && (
                                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${priorityBadge.className}`}>
                                                            {priorityBadge.label}
                                                        </span>
                                                    )}
                                                    {teamName}
                                                    <span className="text-indigo-400">✕</span>
                                                </button>
                                            );
                                        })()
                                    ))}
                                </div>
                            )}
                            {selectedTeamsForComparison.length < 2 && (
                                <p className="mt-3 text-[11px] font-bold text-amber-700">메인 비교를 시작하려면 팀을 2개 이상 선택하세요.</p>
                            )}
                        </div>

                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black text-slate-700 dark:text-slate-100">저장한 팀 비교 조건</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-1">자주 보는 팀 조합을 저장해 평가 재현성과 실무 속도를 함께 높입니다. (상단 고정 최대 3개)</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsComparisonAdvancedOpen((previous) => {
                                                const next = !previous;
                                                trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
                                                    control: 'comparison_advanced_toggle',
                                                    isOpen: next,
                                                    audienceView,
                                                    viewMode: dashboardViewMode,
                                                });
                                                return next;
                                            });
                                        }}
                                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        {isComparisonAdvancedOpen ? '고급 보기 닫기' : '고급 보기 열기'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveCurrentTeamComparisonPreset}
                                        disabled={!selectedTradeForComparison || selectedTeamsForComparison.length < 2}
                                        className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold enabled:hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        현재 팀 조합 저장
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExportTeamComparisonPresetsCsv}
                                        disabled={teamComparisonPresets.length === 0}
                                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold enabled:hover:bg-slate-50 dark:enabled:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        비교 조건 표로 내보내기(CSV)
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <input
                                    value={presetNameDraft}
                                    onChange={(event) => setPresetNameDraft(event.target.value)}
                                    placeholder="예: 타설 핵심 3팀"
                                    className="w-full sm:max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 placeholder:text-slate-400"
                                />
                                <p className="text-[11px] text-slate-500 dark:text-slate-300">비교 조건을 저장할 때 이 이름이 사용됩니다.</p>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handlePresetScopeChange('current-trade')}
                                        disabled={!selectedTradeForComparison}
                                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-black transition-colors ${
                                            presetScope === 'current-trade'
                                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        현재 공종
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePresetScopeChange('all-trades')}
                                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-black transition-colors ${
                                            presetScope === 'all-trades'
                                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200'
                                        }`}
                                    >
                                        전체 공종
                                    </button>
                                </div>
                                <input
                                    value={presetSearchQuery}
                                    onChange={(event) => setPresetSearchQuery(event.target.value)}
                                    placeholder="저장 조건 또는 공종 검색"
                                    className="w-full sm:max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 placeholder:text-slate-400"
                                />
                            </div>
                            {presetPinLimitNotice && (
                                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{presetPinLimitNotice}</p>
                            )}

                            {pinnedQuickPresets.length > 0 && (
                                <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/20 px-2.5 py-2">
                                    <p className="text-[10px] font-black tracking-[0.08em] text-indigo-700 dark:text-indigo-200">고정한 비교 조건 빠른 실행</p>
                                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                        {pinnedQuickPresets.map((preset) => {
                                            const recent7dApplyCount = getRecentPresetApplyCount(preset.appliedAtHistory, 7);
                                            const totalApplyCount = (preset.appliedAtHistory || []).length;
                                            return (
                                                <button
                                                    key={`quick-${preset.id}`}
                                                    type="button"
                                                    onClick={() => applyTeamComparisonPreset(preset, 'pinned_lane')}
                                                    className="shrink-0 rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3 py-2 text-left min-w-[170px]"
                                                >
                                                    <p className="text-[11px] font-black text-indigo-700 dark:text-indigo-200 truncate">📌 {preset.name}</p>
                                                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">{preset.trade} · {formatPresetUsedAt(preset.lastUsedAt)}</p>
                                                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300">최근7일 {recent7dApplyCount}회 · 누적 {totalApplyCount}회</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {applicableComparisonPresets.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {applicableComparisonPresets.map((preset) => {
                                        const recent7dApplyCount = getRecentPresetApplyCount(preset.appliedAtHistory, 7);
                                        const totalApplyCount = (preset.appliedAtHistory || []).length;
                                        return (
                                        <div key={preset.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
                                            {editingPresetId === preset.id ? (
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        value={editingPresetName}
                                                        onChange={(event) => setEditingPresetName(event.target.value)}
                                                        className="w-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-100"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => commitEditingTeamComparisonPreset(preset.id)}
                                                        disabled={String(editingPresetName || '').trim().length === 0}
                                                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700 enabled:hover:bg-indigo-100 disabled:opacity-50"
                                                    >
                                                        저장
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelEditingTeamComparisonPreset}
                                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-50"
                                                    >
                                                        취소
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => applyTeamComparisonPreset(preset, 'preset_list')}
                                                    className="text-left"
                                                >
                                                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors">
                                                        {preset.pinned ? '📌 ' : ''}{preset.name}
                                                    </p>
                                                    {presetScope === 'all-trades' && (
                                                        <p className="text-[10px] font-semibold text-slate-500">{preset.trade}</p>
                                                    )}
                                                    <p className="text-[10px] font-semibold text-slate-400">{formatPresetUsedAt(preset.lastUsedAt)}</p>
                                                    <p className="text-[10px] font-bold text-slate-400">최근7일 {recent7dApplyCount}회 · 누적 {totalApplyCount}회</p>
                                                </button>
                                            )}
                                            {editingPresetId !== preset.id && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleTeamComparisonPresetPin(preset.id)}
                                                    className={`text-[11px] font-black transition-colors ${preset.pinned ? 'text-indigo-600 hover:text-indigo-700' : 'text-slate-400 hover:text-indigo-500'}`}
                                                >
                                                    {preset.pinned ? '고정해제' : '고정'}
                                                </button>
                                            )}
                                            {editingPresetId !== preset.id && (
                                                <button
                                                    type="button"
                                                    onClick={() => startEditingTeamComparisonPreset(preset)}
                                                    className="text-[11px] font-black text-slate-400 hover:text-indigo-500 transition-colors"
                                                >
                                                    수정
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => removeTeamComparisonPreset(preset.id)}
                                                className="text-[11px] font-black text-slate-400 hover:text-rose-500 transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-500 dark:text-slate-300">조건에 맞는 저장 항목이 없습니다. 팀 2개 이상을 선택해 저장하거나 검색·공종 범위를 조정해 보세요.</p>
                            )}
                        </div>

                        {isComparisonAdvancedOpen && (
                            <>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <p className="text-[11px] text-slate-500 dark:text-slate-300">{comparisonSectionMeta.teamSortDescription}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { key: 'score-asc', label: '취약팀순' },
                                            { key: 'score-desc', label: '우수팀순' },
                                            { key: 'risk-desc', label: '보호우선순' },
                                            { key: 'workers-desc', label: '인원순' },
                                        ].map(option => (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => setTeamComparisonSort(option.key as 'score-asc' | 'score-desc' | 'risk-desc' | 'workers-desc')}
                                                className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                                                    teamComparisonSort === option.key
                                                        ? 'border-slate-900 bg-slate-900 text-white'
                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <p className="text-[11px] text-slate-500 dark:text-slate-300">정렬과 축약은 고급 보기에서만 조정합니다.</p>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { key: 'all', label: '전체 팀' },
                                            { key: 'top3', label: '상위 3팀' },
                                            { key: 'risk-only', label: '위험팀만' },
                                        ].map(option => (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => setTeamViewFilter(option.key as 'all' | 'top3' | 'risk-only')}
                                                className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                                                    teamViewFilter === option.key
                                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 sm:p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-black text-slate-700 dark:text-slate-100">국적 보조 드릴다운</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-1">{comparisonSectionMeta.detailModeDescription}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setDetailViewMode('integrated')}
                                                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                                    detailViewMode === 'integrated'
                                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                    팀 비교
                                            </button>
                                            {hasNationalityDetail && selectedTarget && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDetailViewMode('nationality')}
                                                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                                        detailViewMode === 'nationality'
                                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    팀 내부 국적 보기
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {weakestTeam && strongestTeam && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4">
                                    <p className="text-[10px] uppercase tracking-wide font-black text-red-700 dark:text-red-300">최취약 팀</p>
                                    <div className="mt-2 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-red-900 dark:text-red-100 truncate">{weakestTeam.team}</p>
                                            <p className="text-[11px] text-red-800 dark:text-red-300 mt-1">추가 확인 {weakestTeam.riskCount}명 · 인원 {weakestTeam.workerCount}명</p>
                                        </div>
                                        <p className="text-xl font-black text-red-700 dark:text-red-350 shrink-0">{weakestTeam.avgScore.toFixed(1)}</p>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
                                    <p className="text-[10px] uppercase tracking-wide font-black text-emerald-700 dark:text-emerald-300">최우수 팀</p>
                                    <div className="mt-2 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-emerald-900 dark:text-emerald-100 truncate">{strongestTeam.team}</p>
                                            <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1">양호 {strongestTeam.goodCount}명 · 인원 {strongestTeam.workerCount}명</p>
                                        </div>
                                        <p className="text-xl font-black text-emerald-700 dark:text-emerald-350 shrink-0">{strongestTeam.avgScore.toFixed(1)}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-300">
                            현재 <span className="font-black text-slate-700 dark:text-slate-100">{comparedTeamRows.length}개 팀</span> 표시 중 · 메인 비교는 모두 <span className="font-black text-slate-700 dark:text-slate-100">국적 통합 기준</span>이며, 국적은 하단 고급 보기에서만 해석 근거로 확인합니다.
                        </div>

                        <div className="space-y-3">
                            {selectedTeamsForComparison.length < 2 && (
                                <div className="rounded-2xl border border-dashed border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 p-6">
                                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-300 text-center">팀 2~3개를 먼저 선택하세요.</p>
                                    <p className="text-xs text-slate-650 dark:text-slate-400 mt-1 text-center">메인 비교는 선택한 팀만 같은 축으로 보여 줍니다.</p>
                                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {visibleTeamComparison.map((team) => {
                                            const isSelectedForComparison = selectedTeamsForComparison.includes(team.team);
                                            const priorityBadge = getSelectedTeamPriorityBadge(team.team);
                                            const isSelectionLocked = !isSelectedForComparison && selectedTeamsForComparison.length >= TEAM_COMPARISON_MAX_SELECTION;
                                            return (
                                                <button
                                                    key={`team-add-${team.team}`}
                                                    type="button"
                                                    onClick={() => toggleTeamComparisonSelection(team.team)}
                                                    disabled={isSelectionLocked}
                                                    className={`rounded-xl border p-3 text-left transition-colors ${
                                                        isSelectedForComparison
                                                            ? 'border-indigo-300 bg-indigo-50 text-slate-700'
                                                            : isSelectionLocked
                                                                ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                {priorityBadge && (
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${priorityBadge.className}`}>
                                                                        {priorityBadge.label}
                                                                    </span>
                                                                )}
                                                                <p className="text-xs font-black truncate">{team.team}</p>
                                                            </div>
                                                            <p className="mt-1 text-[10px] font-bold opacity-70">{team.workerCount}명 · {team.avgScore.toFixed(1)}점</p>
                                                        </div>
                                                        <div className="text-lg">
                                                            {isSelectedForComparison ? '➖' : isSelectionLocked ? '⛔' : '➕'}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {comparedTeamRows.map((team) => {
                                const rankingIndex = selectedTradeTeamComparison.findIndex(item => item.team === team.team);
                                const rankBadge = getRankBadge(rankingIndex);
                                const isSelectedForComparison = selectedTeamsForComparison.includes(team.team);
                                const priorityBadge = getSelectedTeamPriorityBadge(team.team);
                                const teamKey = getDashboardTeamKey(selectedTradeForComparison, team.team);
                                const isSelectionLocked = !isSelectedForComparison && selectedTeamsForComparison.length >= TEAM_COMPARISON_MAX_SELECTION;
                                const trendLabel = team.trendDirection === 'up'
                                    ? `↑ ${team.avgDelta.toFixed(1)}점`
                                    : team.trendDirection === 'down'
                                        ? `↓ ${Math.abs(team.avgDelta).toFixed(1)}점`
                                        : '→ 보합';
                                const trendToneClass = team.trendDirection === 'up'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300'
                                    : team.trendDirection === 'down'
                                        ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-250';

                                return (
                                    <div
                                        key={team.team}
                                        className={`rounded-2xl border p-3 sm:p-4 transition-colors ${
                                            selectedTeam === teamKey
                                                ? 'border-indigo-300 bg-indigo-50'
                                                : isSelectedForComparison
                                                    ? 'border-indigo-200 bg-indigo-50/60'
                                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                        }`}
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                                            <div className="flex items-start gap-2.5 min-w-0 lg:w-[240px]">
                                                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 ${rankBadge.className}`}>
                                                    {rankBadge.label}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate max-w-[180px] sm:max-w-none">{team.team}</p>
                                                        {priorityBadge && (
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${priorityBadge.className}`}>
                                                                {priorityBadge.label}
                                                            </span>
                                                        )}
                                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[10px] font-black">{selectedTradeForComparison}</span>
                                                        {rankingIndex === 0 && (
                                                            <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 text-[10px] font-black">현재 기준 최상단</span>
                                                        )}
                                                        {rankingIndex === selectedTradeTeamComparison.length - 1 && teamComparisonSort === 'score-asc' && (
                                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-black">최우수팀</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-550 dark:text-slate-300 mt-1">최신 반영 {team.workerCount}명 · {team.latestDate ? new Date(team.latestDate).toLocaleDateString('ko-KR') : '-'}</p>
                                                </div>
                                            </div>

                                            <div className="flex-1 space-y-2">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2.5 sm:p-3 text-center">
                                                        <p className="text-[10px] font-bold text-slate-550 dark:text-slate-400">평균점수</p>
                                                        <p className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 mt-1">{team.avgScore.toFixed(1)}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-red-50 dark:bg-red-950/20 p-2.5 sm:p-3 text-center">
                                                        <p className="text-[10px] font-bold text-red-800 dark:text-red-300">위험</p>
                                                        <p className="text-sm sm:text-base font-black text-red-600 dark:text-red-400 mt-1">{team.riskCount}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-2.5 sm:p-3 text-center">
                                                        <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300">미처리</p>
                                                        <p className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 mt-1">{team.unresolvedCount}</p>
                                                    </div>
                                                    <div className={`rounded-xl p-2.5 sm:p-3 text-center ${trendToneClass}`}>
                                                        <p className="text-[10px] font-bold">추세</p>
                                                        <p className="text-sm sm:text-base font-black mt-1 leading-tight">{trendLabel}</p>
                                                    </div>
                                                </div>
                                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                                    <div
                                                        className={`h-full ${team.avgScore >= 75 ? 'bg-emerald-500' : team.avgScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${Math.max(6, Math.min(team.avgScore, 100))}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:w-auto min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleTeamComparisonSelection(team.team)}
                                                    disabled={isSelectionLocked}
                                                    aria-label={isSelectedForComparison ? '메인 비교 선택 해제' : isSelectionLocked ? '메인 비교 최대 3팀' : '메인 비교에 팀 추가'}
                                                    title={isSelectedForComparison ? '선택 해제' : isSelectionLocked ? '최대 3팀' : '메인 비교에 추가'}
                                                    className={`px-3 py-2 rounded-xl border text-[11px] sm:text-xs font-bold transition-colors ${
                                                        isSelectedForComparison
                                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                            : isSelectionLocked
                                                                ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <span className="sm:hidden">
                                                        {isSelectedForComparison ? '선택해제' : isSelectionLocked ? '최대3팀' : '비교추가'}
                                                    </span>
                                                    <span className="hidden sm:inline">
                                                        {isSelectedForComparison ? '선택 해제' : isSelectionLocked ? '최대 3팀' : '메인 비교에 추가'}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        openSelectedTeamNationalityDrilldown(team.team);
                                                    }}
                                                    aria-label="팀 내부 국적 보기"
                                                    title="팀 내부 국적 보기"
                                                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-[11px] sm:text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <span className="sm:hidden">국적보기</span>
                                                    <span className="hidden sm:inline">국적 보기</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTeam(teamKey);
                                                        openTradeIntegratedAnalysis(selectedTradeForComparison, 'chart');
                                                    }}
                                                    aria-label="이 팀만 보기"
                                                    title="이 팀만 보기"
                                                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] sm:text-xs font-bold hover:bg-slate-800 transition-colors"
                                                >
                                                    <span className="sm:hidden">팀만보기</span>
                                                    <span className="hidden sm:inline">팀만 보기</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {comparedTeamRows.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center">
                                    <p className="text-sm font-bold text-slate-500 dark:text-slate-300">선택된 팀 비교가 아직 없습니다.</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">위에서 팀 2~3개를 고르면 메인 비교가 바로 열립니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ② Radar Chart — 선택된 타겟 그룹의 6대 지표 */}
                <div className={mobileInsightTab === 'chart' ? 'block' : 'hidden md:block'}>
                    {selectedTarget ? (
                        <>
                            {teamNationalityDrilldownStatus && (
                                <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2">
                                    <p className="text-[11px] font-black text-indigo-700">현재 {teamNationalityDrilldownStatus.teamLabel} 내부 분석 중</p>
                                    <p className="mt-0.5 text-[11px] text-indigo-600">
                                        역량 분포도는 팀 기준 통합 흐름을 유지하며, 선택 국적은 <span className="font-black">{teamNationalityDrilldownStatus.nationalityLabel}</span> 상태입니다.
                                    </p>
                                </div>
                            )}
                            <DeferredSection fallback={<ChartSkeleton minHeight="280px" />} rootMargin="120px">
                                <Suspense fallback={<ChartSkeleton minHeight="280px" />}>
                                    <TradeSixMetricRadar
                                        targetGroup={activeDetailGroup}
                                        siteAverageMetrics={dashboardData.siteAverageMetrics}
                                    />
                                </Suspense>
                            </DeferredSection>
                        </>
                    ) : (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-dashed border-indigo-200 dark:border-indigo-800 p-8 flex flex-col items-center justify-center gap-2 text-center min-h-[200px]">
                            <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                            </svg>
                            <p className="text-sm font-bold text-indigo-400">{comparisonSectionMeta.emptyRadarTitle}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{comparisonSectionMeta.emptyRadarDescription}</p>
                        </div>
                    )}
                </div>

                {/* ③ 개인별 평가 기록 패널 */}
                <div className={mobileInsightTab === 'worker' ? 'block' : 'hidden md:block'}>
                    {selectedTarget ? (
                        <>
                            {teamNationalityDrilldownStatus && (
                                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                                    <p className="text-[11px] font-black text-slate-700">개인별 평가 기록 해석 기준</p>
                                    <p className="mt-0.5 text-[11px] text-slate-600">
                                        현재 <span className="font-black">{teamNationalityDrilldownStatus.teamLabel}</span> 내부 기록만 중심으로 추이를 확인 중입니다.
                                    </p>
                                </div>
                            )}
                            <DeferredSection fallback={<ChartSkeleton minHeight="220px" />} rootMargin="120px">
                                <Suspense fallback={<div className="min-h-[220px]"><LoadingSkeleton variant="list" rows={2} dense /></div>}>
                                    <WorkerTrendPanel targetGroup={activeDetailGroup} />
                                </Suspense>
                            </DeferredSection>
                        </>
                    ) : (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-dashed border-slate-200 dark:border-slate-700 p-6 flex items-center justify-center min-h-[100px]">
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{comparisonSectionMeta.emptyWorkerTrend}</p>
                        </div>
                    )}
                </div>
            </div>
            )}

            <div className="sm:hidden fixed bottom-4 left-4 right-4 z-40">
                <button
                    type="button"
                    onClick={() => setCurrentPage('ocr-analysis')}
                    className="w-full min-h-[48px] rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-2xl transition-colors hover:bg-indigo-500 active:scale-[0.99]"
                >
                    시작하기
                </button>
            </div>
        </div>
    );
};

export default Dashboard;
