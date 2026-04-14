
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkerRecord, SafetyCheckRecord, Page } from '../types';
import { StatCard } from '../components/StatCard';
import { SafetyActionCenter } from '../components/SafetyActionCenter';
import { NoticeCallout } from '../components/shared/NoticeCallout';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { Tooltip } from '../components/shared/Tooltip';
import { BrandPhilosophyLogo } from '../components/shared/BrandPhilosophyLogo';
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

const NationalityChart = lazy(() => import('../components/charts/NationalityChart').then(module => ({ default: module.NationalityChart })));
const TopWeaknessesChart = lazy(() => import('../components/charts/TopWeaknessesChart').then(module => ({ default: module.TopWeaknessesChart })));
const SafetyCheckDonutChart = lazy(() => import('../components/charts/SafetyCheckDonutChart').then(module => ({ default: module.SafetyCheckDonutChart })));
const TradeNationalityCrossChart = lazy(() => import('../components/charts/TradeNationalityCrossChart').then(module => ({ default: module.TradeNationalityCrossChart })));
const TradeSixMetricRadar = lazy(() => import('../components/charts/TradeSixMetricRadar').then(module => ({ default: module.TradeSixMetricRadar })));
const WorkerTrendPanel = lazy(() => import('../components/charts/WorkerTrendPanel').then(module => ({ default: module.WorkerTrendPanel })));

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
    // 순수 근로자 데이터만 필터링 (관리 직군 제외)

    const workerOnlyRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);

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
            const uniqueWorkers = new Set(records.map((record) => record.name));
            const latestRecords = Array.from(uniqueWorkers).map((name) => {
                return records
                    .filter((record) => record.name === name)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            });

            const avgScore = latestRecords.length > 0
                ? latestRecords.reduce((acc, record) => acc + record.safetyScore, 0) / latestRecords.length
                : 0;

            return {
                key,
                team,
                trade,
                label: `${team} (${trade})`,
                workerCount: uniqueWorkers.size,
                avgScore,
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
    const [teamComparisonSort, setTeamComparisonSort] = useState<'score-asc' | 'score-desc' | 'risk-desc' | 'workers-desc'>('score-asc');
    const [detailViewMode, setDetailViewMode] = useState<'integrated' | 'nationality'>('integrated');
    const [teamViewFilter, setTeamViewFilter] = useState<'all' | 'top3' | 'risk-only'>('all');
    const [selectedTeamsForComparison, setSelectedTeamsForComparison] = useState<string[]>([]);
    const [audienceView, setAudienceView] = useState<DashboardAudience>('manager');
    const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
    const [isDashboardViewModeManual, setIsDashboardViewModeManual] = useState<boolean>(() => getStoredDashboardViewModeManual());
    const viewMetricSessionRef = useRef<string>(createMetricSessionId('dashboard'));
    const viewMetricStartRef = useRef<number>(Date.now());
    const [dashboardViewMode, setDashboardViewMode] = useState<DashboardViewMode>(() => {
        const storedMode = getStoredDashboardViewMode();
        if (storedMode && getStoredDashboardViewModeManual()) return storedMode;
        return getDefaultDashboardViewMode(typeof window !== 'undefined' ? window.innerWidth : 1440);
    });

    useEffect(() => {
        try {
            const savedAudience = window.localStorage.getItem('psi_dashboard_audience');
            if (savedAudience === 'worker' || savedAudience === 'manager' || savedAudience === 'executive') {
                setAudienceView(savedAudience);
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
        if (isDashboardViewModeManual) return;
        const recommended = getRecommendedDashboardViewMode(audienceView, viewportWidth);
        setDashboardViewMode(recommended);
    }, [audienceView, viewportWidth, isDashboardViewModeManual]);

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

    const handleAudienceChange = (audience: DashboardAudience) => {
        setAudienceView(audience);
        trackUIViewMetric('control_change', 'dashboard', viewMetricSessionRef.current, {
            control: 'audience_view',
            audience,
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
    };

    const openTradeIntegratedAnalysis = (trade: string, nextTab: DashboardInsightTab = 'team') => {
        setSelectedTarget({ trade, nationality: ALL_NATIONALITY_LABEL });
        setSelectedTradeForComparison(trade);
        setMobileInsightTab(nextTab);
        setDetailViewMode('integrated');
        setTeamViewFilter('all');
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
        if (selectedTeam !== 'ALL' && teamOptions.length > 0 && !teamOptions.some((item) => item.key === selectedTeam)) {
            setSelectedTeam('ALL');
        }
    }, [selectedTeam, teamOptions]);

    useEffect(() => {
        setSelectedTeamsForComparison([]);
    }, [selectedTradeForComparison]);


    const stats = useMemo(() => {
        const uniqueWorkers = new Set(filteredWorkerRecords.map(r => r.name));
        const totalWorkers = uniqueWorkers.size;
        const latestRecords = Array.from(uniqueWorkers).map(name => {
            return filteredWorkerRecords
                .filter(r => r.name === name)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        });
        const averageScore = latestRecords.length > 0
            ? latestRecords.reduce((acc, r) => acc + r.safetyScore, 0) / latestRecords.length
            : 0;
        const highRiskWorkers = latestRecords.filter(r => r.safetyLevel === '초급').length;
        const totalChecks = safetyCheckRecords.length;
        return { totalWorkers, averageScore, highRiskWorkers, totalChecks };
    }, [filteredWorkerRecords, safetyCheckRecords]);

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
            label: '하네스 저장 연결',
            value: `${harnessDashboardSummary.connected}명`,
            helper: `${harnessDashboardSummary.runLinked}명이 workflow run과 연결되어 있습니다.`,
            tone: BRAND_TONE.emeraldSoft80,
        },
        {
            key: 'dashboard-harness-approval',
            label: '승인 백로그',
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
            label: '폴백/저장 대기',
            value: `${harnessDashboardSummary.fallback + harnessDashboardSummary.pending}명`,
            helper: `폴백 ${harnessDashboardSummary.fallback}명 · 저장 대기 ${harnessDashboardSummary.pending}명`,
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
                eyebrow: '운영 커버리지',
                title: `현재 하네스 저장 연결률은 ${coverageRate}%입니다.`,
                description: harnessDashboardSummary.pending > 0
                    ? `저장 대기 ${harnessDashboardSummary.pending}명과 폴백 ${harnessDashboardSummary.fallback}명을 우선 정리하셔야 운영 추적이 안정됩니다.`
                    : '현재 연결된 런 기준으로 승인 흐름과 보호 상태를 비교적 안정적으로 추적하실 수 있습니다.',
                tone: coverageRate < 70 ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
            },
            {
                key: 'dashboard-harness-trade',
                eyebrow: '공종 우선순위',
                title: topTrade
                    ? `${topTrade.trade} 공종에서 보호 신호가 가장 많이 감지됩니다.`
                    : '현재 공종별 하네스 경보 집중 구간은 크지 않습니다.',
                description: topTrade
                    ? `승인 ${topTrade.approval}건 · 즉시 보호 ${topTrade.immediate}건 · 저장 점검 ${topTrade.fallback}건 기준으로 우선순위를 정리하시면 됩니다.`
                    : '현재는 승인 대기, 즉시 보호, 저장 폴백 신호가 특정 공종에 과도하게 몰리지 않았습니다.',
                tone: topTrade ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-action',
                eyebrow: '권장 액션',
                title: harnessDashboardSummary.immediateAttention > 0
                    ? '즉시 보호 대상부터 승인 대기열보다 먼저 정리하시는 편이 안전합니다.'
                    : '즉시 중단 대상이 없다면 승인 백로그와 저장 연결부터 정리하시면 됩니다.',
                description: harnessDashboardSummary.immediateAttention > 0
                    ? '고위험 배지가 붙은 대상은 보고서 생성보다 현장 보호 조치와 관리자 판단을 먼저 이어가셔야 합니다.'
                    : '현재는 설명 지연보다 승인 누락과 영속 저장 누락을 줄이는 쪽이 운영 효율에 더 직접적입니다.',
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
            label: '감사 연결 대상',
            value: `${harnessAuditSummary.auditLinked}명`,
            helper: '하네스 관련 감사 메모가 남아 있는 최신 레코드 기준입니다.',
            tone: harnessAuditSummary.auditLinked > 0 ? 'border-indigo-200 bg-indigo-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-transition-blocked',
            label: '전이 차단 이력',
            value: `${harnessAuditSummary.transitionBlocked}명`,
            helper: '승인/재분석 시 상태 조건 불일치로 차단된 기록 수입니다.',
            tone: harnessAuditSummary.transitionBlocked > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-approval-audit',
            label: '승인 감사 기록',
            value: `${harnessAuditSummary.approvalAudited}명`,
            helper: '최신 레코드 기준 승인 stage 감사 로그가 존재하는 대상입니다.',
            tone: harnessAuditSummary.approvalAudited > 0 ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'dashboard-harness-audit-events',
            label: '누적 감사 이벤트',
            value: `${harnessAuditSummary.auditEvents}건`,
            helper: `validation ${harnessAuditSummary.validationAudited}명 · approval ${harnessAuditSummary.approvalAudited}명 기준`,
            tone: harnessAuditSummary.auditEvents > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
        },
    ], [harnessAuditSummary]);

    const harnessAuditInsights = useMemo(() => {
        return [
            {
                key: 'dashboard-harness-audit-action',
                eyebrow: '감사 우선순위',
                title: harnessAuditSummary.transitionBlocked > 0
                    ? `전이 차단 이력 ${harnessAuditSummary.transitionBlocked}명을 먼저 재검토하셔야 합니다.`
                    : '전이 차단 이력은 크지 않으며 승인·저장 연결 점검을 우선하시면 됩니다.',
                description: harnessAuditSummary.transitionBlocked > 0
                    ? '상태 전이 거부는 증빙 누락, 승인 순서 오류, 완료 후 재분석 시도 가능성을 뜻하므로 관리자 QA 우선 대상입니다.'
                    : '현재는 차단 이력보다 승인 백로그와 저장 연결 누락을 줄이는 쪽이 운영 효율에 더 직접적입니다.',
                tone: harnessAuditSummary.transitionBlocked > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-audit-coverage',
                eyebrow: '감사 커버리지',
                title: harnessAuditSummary.auditLinked > 0
                    ? `최신 레코드 ${harnessAuditSummary.auditLinked}명에 하네스 감사 메모가 연결되어 있습니다.`
                    : '아직 하네스 감사 메모가 충분히 누적되지 않았습니다.',
                description: harnessAuditSummary.auditLinked > 0
                    ? `승인 감사 ${harnessAuditSummary.approvalAudited}명, validation 감사 ${harnessAuditSummary.validationAudited}명을 함께 읽으면 운영 통제 설명이 쉬워집니다.`
                    : '관리자 모달에서 승인/재분석/차단 흐름을 사용하면서 감사 로그 누적을 늘리셔야 대시보드 설명력이 커집니다.',
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
                label: '최근 7일 감사 이벤트',
                value: `${harnessRecentOpsSummary.recentAuditEvents}건`,
                helper: `${touchedWorkerCount}명 레코드에서 최근 운영 흔적이 확인되었습니다.`,
                tone: harnessRecentOpsSummary.recentAuditEvents > 0 ? 'border-indigo-200 bg-indigo-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-approvals',
                label: '최근 승인/반려 로그',
                value: `${harnessRecentOpsSummary.recentApprovalDecisions}건`,
                helper: `approval stage ${harnessRecentOpsSummary.recentApprovals}건 기준입니다.`,
                tone: harnessRecentOpsSummary.recentApprovalDecisions > 0 ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-blocks',
                label: '최근 전이 차단',
                value: `${harnessRecentOpsSummary.recentTransitionBlocks}건`,
                helper: '승인 차단 또는 상태 전이 거부 메모 기준입니다.',
                tone: harnessRecentOpsSummary.recentTransitionBlocks > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-reassess',
                label: '최근 재분석 실행',
                value: `${harnessRecentOpsSummary.recentReassessments}건`,
                helper: 'reassessment stage 기록 기준입니다.',
                tone: harnessRecentOpsSummary.recentReassessments > 0 ? 'border-violet-200 bg-violet-50/80' : 'border-slate-200 bg-slate-50',
            },
        ];
    }, [harnessRecentOpsSummary]);

    const harnessRecentOpsInsights = useMemo(() => {
        const touchedWorkerCount = harnessRecentOpsSummary.touchedWorkers.size;
        const dominantSignal = [
            { key: 'transition', count: harnessRecentOpsSummary.recentTransitionBlocks, label: '전이 차단' },
            { key: 'reassessment', count: harnessRecentOpsSummary.recentReassessments, label: '재분석' },
            { key: 'approval', count: harnessRecentOpsSummary.recentApprovalDecisions, label: '승인/반려' },
        ].sort((a, b) => b.count - a.count)[0];

        return [
            {
                key: 'dashboard-harness-recent-window',
                eyebrow: '최근 7일 운영 창',
                title: touchedWorkerCount > 0
                    ? `${touchedWorkerCount}명에서 최근 하네스 운영 흔적이 확인되었습니다.`
                    : '최근 7일 기준 하네스 운영 흔적이 아직 많지 않습니다.',
                description: touchedWorkerCount > 0
                    ? `감사 이벤트 ${harnessRecentOpsSummary.recentAuditEvents}건을 기준으로 최근 승인, 차단, 재분석 흐름을 빠르게 읽으실 수 있습니다.`
                    : '승인/재분석/차단 흐름이 누적되면 대시보드의 단기 운영 설명력이 더 좋아집니다.',
                tone: touchedWorkerCount > 0 ? 'border-indigo-200 bg-indigo-50/80' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'dashboard-harness-recent-dominant',
                eyebrow: '우세 신호',
                title: dominantSignal.count > 0
                    ? `최근 운영 로그에서는 ${dominantSignal.label} 신호가 가장 크게 보입니다.`
                    : '최근 7일 기준으로 특정 하네스 운영 신호 쏠림은 크지 않습니다.',
                description: dominantSignal.key === 'transition'
                    ? '상태 전이 조건과 승인 순서를 먼저 재정렬하시면 운영 마찰을 줄이기 쉽습니다.'
                    : dominantSignal.key === 'reassessment'
                        ? '현장 수정 이후 재분석 루프가 많으므로 코멘트 품질과 OCR 원문 품질을 함께 보시는 편이 좋습니다.'
                        : dominantSignal.key === 'approval'
                            ? '최근 승인/반려 판단이 활발하므로 승인 근거 문구와 감사 저장 품질을 함께 관리하셔야 합니다.'
                            : '최근 로그가 충분히 쌓이면 주간 운영 요약 정밀도가 더 좋아집니다.',
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
            const latestRecords = Array.from(uniqueWorkers).map(name => {
                return records
                    .filter(record => record.name === name)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            });

            const avgScore = latestRecords.length > 0
                ? latestRecords.reduce((sum, record) => sum + record.safetyScore, 0) / latestRecords.length
                : 0;
            const riskCount = latestRecords.filter(record => record.safetyScore < 60).length;
            const cautionCount = latestRecords.filter(record => record.safetyScore >= 60 && record.safetyScore < 75).length;
            const goodCount = latestRecords.filter(record => record.safetyScore >= 75).length;
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
        if (selectedTeamsForComparison.length === 0) return visibleTeamComparison;
        return selectedTradeTeamComparison.filter((team) => selectedTeamsForComparison.includes(team.team));
    }, [selectedTeamsForComparison, selectedTradeTeamComparison, visibleTeamComparison]);

    const toggleTeamComparisonSelection = (teamName: string) => {
        setSelectedTeamsForComparison((previous) => {
            if (previous.includes(teamName)) {
                return previous.filter((item) => item !== teamName);
            }
            return [...previous, teamName];
        });
    };

    const getRankBadge = (index: number) => {
        if (index === 0) return { label: '🥇', className: 'bg-amber-100 text-amber-700' };
        if (index === 1) return { label: '🥈', className: 'bg-slate-200 text-slate-700' };
        if (index === 2) return { label: '🥉', className: 'bg-orange-100 text-orange-700' };
        return { label: String(index + 1), className: 'bg-slate-100 text-slate-600' };
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

    const overviewStatCards = useMemo<DashboardStatCardConfig[]>(() => {
        return buildOverviewStatCards(audienceView, {
            totalWorkers: stats.totalWorkers,
            averageScore: stats.averageScore,
            highRiskWorkers: stats.highRiskWorkers,
            totalChecks: stats.totalChecks,
        });
    }, [audienceView, stats.averageScore, stats.highRiskWorkers, stats.totalChecks, stats.totalWorkers]);

    const quickActions = useMemo<DashboardQuickActionConfig[]>(() => {
        if (audienceView === 'worker') {
            return [
                {
                    key: 'predictive',
                    label: '보호 우선순위 보기',
                    page: 'predictive-analysis',
                    variant: 'ghost',
                    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>,
                },
                {
                    key: 'worker-management',
                    label: '작업조 흐름 확인',
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
                    label: '추세 분석 보기',
                    page: 'performance-analysis',
                    variant: 'ghost',
                    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
                },
                {
                    key: 'reports',
                    label: '리포트 생성',
                    page: 'reports',
                    variant: 'solid',
                    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                },
            ];
        }

        return [
            {
                key: 'ocr-analysis',
                label: '신규 분석',
                page: 'ocr-analysis',
                variant: 'ghost',
                icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
            },
            {
                key: 'reports',
                label: '리포트 생성',
                page: 'reports',
                variant: 'solid',
                icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
            },
        ];
    }, [audienceView]);

    const comparisonCards: InterpretationCardItem[] = useMemo(() => {
        const sharedStatusDescription = selectedTradeForComparison
            ? `${selectedTradeTeamComparison.length}개 팀을 같은 공종 기준으로 비교하며${selectedTeamsForComparison.length > 0 ? `, 현재 ${selectedTeamsForComparison.length}개 팀을 직접 선택해 좁혀 보고 있습니다.` : ' 전체 팀 흐름을 먼저 보고 있습니다.'}`
            : '취약 공종 바로가기나 팀 비교 바로가기에서 대상을 고르면 상세 해석이 활성화됩니다.';

        if (audienceView === 'worker') {
            return [
                {
                    key: 'comparison-status',
                    eyebrow: '지금 비교 중',
                    title: selectedTradeForComparison ? `${selectedTradeForComparison} 유사 작업조 흐름을 보고 있습니다.` : '유사 작업조 비교 전 단계입니다.',
                    description: sharedStatusDescription,
                    tone: selectedTradeForComparison ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
                },
                {
                    key: 'comparison-evidence',
                    eyebrow: '무엇을 보면 되나',
                    title: '공종과 팀장 기준이 유사 작업 흐름 비교의 기준입니다.',
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
                        ? `평균 ${weakestTeam.avgScore.toFixed(1)}점과 고위험 ${weakestTeam.riskCount}명을 기준으로 어떤 작업조에 코칭이 먼저 필요한지 이어서 확인할 수 있습니다.`
                        : '차트에서 작업조를 고르면 레이더와 개인 추이로 바로 이어져 보완 순서를 구체화할 수 있습니다.',
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
                    eyebrow: '경영 근거',
                    title: '공종, 국적, 팀장 기준 분리가 리스크 분배 판단의 기준입니다.',
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
                        ? `가장 취약한 팀의 평균 ${weakestTeam.avgScore.toFixed(1)}점과 고위험 ${weakestTeam.riskCount}명을 기준으로 교육·점검·보고 자원 배분 순서를 정할 수 있습니다.`
                        : '차트에서 작업조를 고르면 레이더와 개인별 트렌드가 이어져 다음 보호 행동을 구체화할 수 있습니다.',
                    tone: weakestTeam ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
                },
            ];
        }

        return [
            {
                key: 'comparison-status',
                eyebrow: '지금 상태',
                title: selectedTradeForComparison ? `${selectedTradeForComparison} 공종 비교를 보고 있습니다.` : '공종 또는 팀 비교 전 단계입니다.',
                description: sharedStatusDescription,
                tone: selectedTradeForComparison ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
            },
            {
                key: 'comparison-evidence',
                eyebrow: '판단 근거',
                title: '공종, 국적, 팀장 기준 분리가 비교의 기준입니다.',
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
                    ? `가장 취약한 팀의 평균 ${weakestTeam.avgScore.toFixed(1)}점과 고위험 ${weakestTeam.riskCount}명을 기준으로 코칭·점검·보고 흐름을 연결할 수 있습니다.`
                    : '차트에서 작업조를 고르면 레이더와 개인별 트렌드가 이어져 다음 보호 행동을 구체화할 수 있습니다.',
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
                    headline: '저장 점검 대상은 환경 상태와 개별 레코드 상태를 함께 보셔야 합니다.',
                    detail: '설정 화면에서 persistence 환경 상태를 먼저 확인하고, 이후 근로자 관리 필터로 실제 폴백·대기 레코드를 좁히시면 됩니다.',
                    primaryLabel: '근로자 관리에서 저장 점검 대상 열기',
                    secondaryLabel: '설정 화면으로 이동',
                    secondaryPage: 'settings',
                };
            case 'trade-hotspot':
                return {
                    headline: `${activeHarnessDrilldown.trade || '선택 공종'}은 최근 운영 신호가 집중된 공종입니다.`,
                    detail: '대상 공종을 근로자 관리 필터로 바로 넘겨 우선순위를 정리하고, 보고서 화면에서 공종별 감사 근거를 함께 확인하시면 됩니다.',
                    primaryLabel: '근로자 관리에서 공종 hotspot 열기',
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
                    ? '저장 연결 점검 대상 미리보기'
                    : `${activeHarnessDrilldown.trade || '선택 공종'} 최근 7일 hotspot 미리보기`;

        const description = activeHarnessDrilldown.type === 'approval-backlog'
            ? '승인 또는 추가 검토가 남아 있는 최신 대상만 추렸습니다.'
            : activeHarnessDrilldown.type === 'immediate-attention'
                ? '즉시 보호 또는 중단 판단이 필요한 최신 대상입니다.'
                : activeHarnessDrilldown.type === 'fallback-pending'
                    ? 'persistence 폴백 또는 저장 대기 상태의 최신 대상입니다.'
                    : '선택 공종에서 최근 7일 감사 이벤트가 집중된 최신 대상을 보여드립니다.';

        return {
            title,
            description,
            entries,
        };
    }, [activeHarnessDrilldown, latestFilteredWorkerRecords]);
    
    // [SIMULATION DATE] 2026-02-17
    const today = "2026년 2월 17일 화요일";
    const isFullMode = dashboardViewMode === 'full';
    const isEssentialMode = dashboardViewMode === 'essential';
    const isEssentialMobile = isEssentialMode && viewportWidth < 640;

    return (
        <div className={`${isEssentialMobile ? 'space-y-3' : 'space-y-4 sm:space-y-6 lg:space-y-8'} animate-fade-in-up`}>
            {/* AI-Powered Safety Command Center */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 text-white shadow-2xl relative overflow-hidden border border-white/10">
                {/* Animated background elements */}
                <div className="absolute top-0 right-0 w-64 h-64 sm:w-96 sm:h-96 bg-indigo-500 opacity-10 rounded-full blur-3xl -mr-32 -mt-32 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 sm:w-80 sm:h-80 bg-blue-500 opacity-10 rounded-full blur-3xl -ml-24 -mb-24 animate-pulse" style={{ animationDelay: '1s' }}></div>
                
                <div className="relative z-10">
                    {/* System Status Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="p-2 sm:p-2.5 bg-indigo-500/20 backdrop-blur-sm rounded-lg sm:rounded-xl border border-indigo-400/30">
                                <BrandPhilosophyLogo className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                                    <h2 className="text-lg sm:text-2xl md:text-3xl font-black tracking-tight">PSI Safety Intelligence</h2>
                                    <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500/90 text-white text-[8px] sm:text-[10px] font-black rounded-md uppercase tracking-wide">{PSI_APP_VERSION}</span>
                                </div>
                                <p className="text-indigo-300 text-[10px] sm:text-xs font-bold flex items-center gap-1.5 sm:gap-2">
                                    <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    실시간 모니터링 · {today.split(' ')[0].replace('년', '/').replace('월', '/').replace('일', '')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-lg sm:rounded-xl">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-[10px] sm:text-xs font-bold text-emerald-300">AI 분석 엔진 정상</span>
                        </div>
                    </div>

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

                    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
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

                    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-200">화면 구성 모드</p>
                            <p className="mt-1 text-xs font-medium text-slate-200">
                                {dashboardViewMode === 'full'
                                    ? '현재 구성: 평가자 중심 전체 맥락(Full Context)'
                                    : dashboardViewMode === 'balanced'
                                        ? '중간 구성: 핵심 + 필요 시 확장(Balanced)'
                                        : '필수 구성: 즉시 행동 중심(Essential)'}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {([
                                { key: 'full', label: '현재 구성' },
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
                            ))}
                        </div>
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6">
                        {/* Real-time Safety Score */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-5">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <span className="text-indigo-300 text-[10px] sm:text-xs font-bold uppercase tracking-wide">현장 안전 지수</span>
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                            <div className="flex items-baseline gap-1.5 sm:gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-white">{stats.averageScore.toFixed(1)}</span>
                                <span className="text-base sm:text-lg font-bold text-indigo-300">/ 100</span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-indigo-200 mt-1.5 sm:mt-2 font-medium">실무 근로자 평균 점수</p>
                        </div>

                        {/* Active Workers */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-5">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <span className="text-indigo-300 text-[10px] sm:text-xs font-bold uppercase tracking-wide">활동 중인 근로자</span>
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <div className="flex items-baseline gap-1.5 sm:gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-white">{stats.totalWorkers}</span>
                                <span className="text-base sm:text-lg font-bold text-indigo-300">명</span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-indigo-200 mt-1.5 sm:mt-2 font-medium">관리 직군 제외</p>
                        </div>

                        {/* Risk Alert */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-5 sm:col-span-2 lg:col-span-1">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <span className="text-indigo-300 text-[10px] sm:text-xs font-bold uppercase tracking-wide">위험도 모니터링</span>
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="flex items-baseline gap-1.5 sm:gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-white">{stats.highRiskWorkers}</span>
                                <span className="text-base sm:text-lg font-bold text-amber-300">명</span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-amber-200 mt-1.5 sm:mt-2 font-medium">고위험 근로자 감지</p>
                        </div>
                    </div>

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
                                        <p className="text-[10px] sm:text-xs font-bold text-indigo-200 mb-1 uppercase tracking-wide">AI 인사이트</p>
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
                                    className={`px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 hover:scale-105 active:scale-95 ${
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
                <InterpretationCardGrid
                    items={dashboardSummaryCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            <SummaryMetricGrid
                items={harnessSummaryMetrics}
                columnsClassName="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
            />

            {isFullMode && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 p-4 shadow-sm shadow-slate-100">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Harness Drill-down</p>
                        <h3 className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">백로그와 hotspot을 대시보드 안에서 바로 좁혀 봅니다.</h3>
                    </div>
                    {activeHarnessDrilldown ? (
                        <button
                            type="button"
                            onClick={() => setActiveHarnessDrilldown(null)}
                            className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-black text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            Drill-down 해제
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
                        저장 점검 {harnessDashboardSummary.fallback + harnessDashboardSummary.pending}명
                    </button>
                </div>

                {harnessDrilldownPreview ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-sm font-black text-slate-800 dark:text-slate-100">{harnessDrilldownPreview.title}</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-300">{harnessDrilldownPreview.description}</p>
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
                                                <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-300">{record.jobField} · {record.teamLeader || '미지정 팀'}</p>
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
                                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-300 xl:col-span-2">
                                    현재 선택 조건에서 바로 보여드릴 대상이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
            )}

            {isFullMode && (
                <InterpretationCardGrid
                    items={harnessOperationalInsights}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            {isFullMode && (
                <SummaryMetricGrid
                    items={harnessAuditMetrics}
                    columnsClassName="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            {isFullMode && (
                <InterpretationCardGrid
                    items={harnessAuditInsights}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            {isFullMode && (
                <SummaryMetricGrid
                    items={harnessRecentOpsMetrics}
                    columnsClassName="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            {isFullMode && (
                <InterpretationCardGrid
                    items={harnessRecentOpsInsights}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            {isFullMode && harnessRecentTradeHotspots.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm shadow-slate-100">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">최근 7일 공종 집중도</p>
                            <h3 className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">전이 차단·승인·재분석이 몰린 공종을 우선 확인합니다.</h3>
                        </div>
                        <div className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">
                            상위 {harnessRecentTradeHotspots.length}개 공종
                        </div>
                    </div>

                    <div className="mt-4 overflow-auto">
                        <table className="w-full min-w-[760px] text-left text-[11px]">
                            <thead className="text-slate-500 dark:text-slate-300">
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

            {(harnessDashboardSummary.approvalBacklog > 0 || harnessDashboardSummary.fallback > 0 || harnessDashboardSummary.immediateAttention > 0) && (
                <NoticeCallout
                    variant={harnessDashboardSummary.immediateAttention > 0 ? 'rose' : harnessDashboardSummary.fallback > 0 ? 'amber' : 'indigo'}
                    title={harnessDashboardSummary.immediateAttention > 0
                        ? `즉시 보호 대상 ${harnessDashboardSummary.immediateAttention}명이 있어 승인·보완 우선순위를 먼저 정해야 합니다.`
                        : harnessDashboardSummary.fallback > 0
                            ? `하네스 persistence 폴백 ${harnessDashboardSummary.fallback}명이 있어 저장 연결 여부를 함께 점검해야 합니다.`
                            : `승인 백로그 ${harnessDashboardSummary.approvalBacklog}명이 남아 있어 관리자 검토 순서를 먼저 정리해야 합니다.`}
                    description={harnessDashboardSummary.fallback > 0
                        ? '대시보드 단계에서 백로그를 읽고 OCR 분석, 리포트, 관리자 검토로 이어가면 보호 흐름이 끊기지 않습니다.'
                        : '현장 보호 우선순위를 대시보드에서 먼저 읽고 세부 화면으로 내려가면 승인 누락과 설명 지연을 줄일 수 있습니다.'}
                    className="rounded-2xl border px-4 py-3 shadow-sm"
                    bodyClassName="block"
                    titleClassName="text-sm font-black"
                    descriptionClassName="mt-1 text-xs font-semibold leading-relaxed"
                />
            )}

            <div className="bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-400 p-3 sm:p-4 rounded-r-lg flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                <div className="flex items-start sm:items-center gap-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs sm:text-sm text-indigo-700 dark:text-indigo-200 font-bold">
                        [데이터 안내] 2026년 기준 실무 근로자 중심 분석 모드 활성 · 현재 {DASHBOARD_AUDIENCE_META[audienceView].label}
                    </p>
                </div>
            </div>

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

            {audienceView !== 'worker' && (
                <button
                    type="button"
                    onClick={handleNavigateToUnassignedRecords}
                    className={`w-full rounded-xl sm:rounded-2xl border px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left transition-colors ${
                    isUnassignedWarning
                        ? 'bg-amber-50 border-amber-300 hover:bg-amber-100 cursor-pointer'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 cursor-pointer'
                }`}
                >
                    <div className="flex items-start sm:items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            isUnassignedWarning ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'
                        }`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                            </svg>
                        </div>
                        <div>
                            <p className={`text-sm font-black ${isUnassignedWarning ? 'text-amber-800' : 'text-slate-700'}`}>
                                식별 불가 데이터 (Unassigned Records)
                            </p>
                            <p className={`text-xs font-medium ${isUnassignedWarning ? 'text-amber-700' : 'text-slate-500'}`}>
                                고유 식별자(worker_uuid/employeeId/qrId) 미매핑 레코드는 개인 이력 분석에서 제외됩니다.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-end gap-1 sm:gap-1.5">
                        <span className={`text-2xl sm:text-3xl font-black ${isUnassignedWarning ? 'text-amber-700' : 'text-slate-500'}`}>
                            {unassignedCount}
                        </span>
                        <span className={`text-sm font-bold pb-0.5 ${isUnassignedWarning ? 'text-amber-600' : 'text-slate-500'}`}>건</span>
                    </div>
                </button>
            )}

            {!isEssentialMode && (
                <InterpretationCardGrid
                    items={operationalFocusCards}
                    className="grid grid-cols-1 xl:grid-cols-2 gap-3"
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}
            
            {!isEssentialMode && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                <div className={`lg:col-span-2 ${audienceView === 'executive' ? 'lg:order-2' : 'lg:order-1'}`}>
                    <div className="h-full rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <SafetyActionCenter workerRecords={workerOnlyRecords} />
                    </div>
                </div>
                <div className={`bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 dark:border-slate-700 flex flex-col ${audienceView === 'executive' ? 'lg:order-1' : 'lg:order-2'}`}>
                    <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-6 text-slate-800 dark:text-slate-100">국적별 근로자 현황</h3>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                <div className={`bg-white dark:bg-slate-800 p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 dark:border-slate-700 ${audienceView === 'executive' ? 'md:order-2' : 'md:order-1'}`}>
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
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
                      <div className={`bg-white dark:bg-slate-800 p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 dark:border-slate-700 ${audienceView === 'executive' ? 'md:order-1' : 'md:order-2'}`}>
                          <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-6 text-slate-800 dark:text-slate-100">최근 2주간 안전 점검 동향</h3>
                    <div className="h-64">
                        <DeferredSection fallback={<ChartSkeleton minHeight="16rem" />} rootMargin="160px">
                            <Suspense fallback={<ChartSkeleton minHeight="16rem" />}>
                                <SafetyCheckDonutChart records={safetyCheckRecords} />
                            </Suspense>
                        </DeferredSection>
                    </div>
                </div>
            </div>
            )}


            {/* ═══════════════════════════════════════════════════════
                    공종 × 국적 교차 안전 숙련도 분석 섹션 (아래)
            ═══════════════════════════════════════════════════════ */}
            {isFullMode && (
            <div className="space-y-4 sm:space-y-6">
                <InterpretationCardGrid
                    items={comparisonCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
                {/* 섹션 헤더 + 팀별 드롭다운 */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-1">
                    <div className="flex items-center gap-3 flex-1">
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
                    <div className="flex items-center gap-2">
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

                <div className="md:hidden flex gap-2 overflow-x-auto pb-1">
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

                {teamSummaries.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-100">{comparisonSectionMeta.teamQuickAccessTitle}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-300">{comparisonSectionMeta.teamQuickAccessDescription}</p>
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
                            {teamSummaries.map(summary => (
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                                    {selectedTradeForComparison} 팀 대 팀 비교
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                                    {comparisonSectionMeta.teamComparisonDescription}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-lg text-xs font-bold">
                                    {selectedTradeTeamComparison.length}개 팀 비교
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                                    비교 기준: 전체 국적 통합
                                </span>
                                <button
                                    type="button"
                                    onClick={() => openTradeIntegratedAnalysis(selectedTradeForComparison, 'chart')}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors"
                                >
                                    {selectedTradeForComparison} 통합 분석 보기
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

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500 dark:text-slate-300">{comparisonSectionMeta.teamSortDescription}</p>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: 'score-asc', label: '취약팀순' },
                                    { key: 'score-desc', label: '우수팀순' },
                                    { key: 'risk-desc', label: '고위험순' },
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

                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 sm:p-4">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black text-indigo-700">직접 팀 선택 비교</p>
                                    <p className="text-[11px] text-indigo-600 mt-1">비교할 팀을 2개, 3개 또는 그 이상 직접 선택하세요. 선택한 팀만 아래에 남겨 비교합니다.</p>
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
                                <div className="rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 px-3 py-2">1) 먼저 공종을 선택합니다.</div>
                                <div className="rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 px-3 py-2">2) 비교할 팀을 2개 이상 고릅니다.</div>
                                <div className="rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 px-3 py-2">3) 아래 카드에서 점수·위험·인원을 바로 비교합니다.</div>
                            </div>
                            {selectedTeamsForComparison.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedTeamsForComparison.map((teamName) => (
                                        <button
                                            key={teamName}
                                            type="button"
                                            onClick={() => toggleTeamComparisonSelection(teamName)}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-black text-indigo-700"
                                        >
                                            {teamName}
                                            <span className="text-indigo-400">✕</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedTeamsForComparison.length === 1 && (
                                <p className="mt-3 text-[11px] font-bold text-amber-700">비교를 명확히 하려면 팀을 1개 더 선택하세요.</p>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500 dark:text-slate-300">복잡하면 핵심 팀만 빠르게 보세요.</p>
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
                                    <p className="text-xs font-black text-slate-700 dark:text-slate-100">상세 분석 기준</p>
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
                                        팀 통합 기준
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
                                            {selectedTarget.nationality} 세부 기준
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {weakestTeam && strongestTeam && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                                    <p className="text-[10px] uppercase tracking-wide font-black text-red-500">최취약 팀</p>
                                    <div className="mt-2 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-red-700 truncate">{weakestTeam.team}</p>
                                            <p className="text-[11px] text-red-600 mt-1">고위험 {weakestTeam.riskCount}명 · 인원 {weakestTeam.workerCount}명</p>
                                        </div>
                                        <p className="text-xl font-black text-red-700 shrink-0">{weakestTeam.avgScore.toFixed(1)}</p>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                    <p className="text-[10px] uppercase tracking-wide font-black text-emerald-500">최우수 팀</p>
                                    <div className="mt-2 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-emerald-700 truncate">{strongestTeam.team}</p>
                                            <p className="text-[11px] text-emerald-600 mt-1">양호 {strongestTeam.goodCount}명 · 인원 {strongestTeam.workerCount}명</p>
                                        </div>
                                        <p className="text-xl font-black text-emerald-700 shrink-0">{strongestTeam.avgScore.toFixed(1)}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-300">
                            현재 <span className="font-black text-slate-700 dark:text-slate-100">{comparedTeamRows.length}개 팀</span> 표시 중 · 팀 평가는 모두 <span className="font-black text-slate-700 dark:text-slate-100">국적 통합 기준</span>입니다.
                        </div>

                        <div className="space-y-3">
                            {comparedTeamRows.map((team) => {
                                const rankingIndex = selectedTradeTeamComparison.findIndex(item => item.team === team.team);
                                const rankBadge = getRankBadge(rankingIndex);
                                const isSelectedForComparison = selectedTeamsForComparison.includes(team.team);

                                return (
                                    <div
                                        key={team.team}
                                        className={`rounded-2xl border p-4 transition-colors ${
                                            selectedTeam === team.team
                                                ? 'border-indigo-300 bg-indigo-50'
                                                : isSelectedForComparison
                                                    ? 'border-indigo-200 bg-indigo-50/60'
                                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                        }`}
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                            <div className="flex items-center gap-3 min-w-0 lg:w-[240px]">
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 ${rankBadge.className}`}>
                                                    {rankBadge.label}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{team.team}</p>
                                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[10px] font-black">{selectedTradeForComparison}</span>
                                                        {rankingIndex === 0 && (
                                                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-black">현재 기준 최상단</span>
                                                        )}
                                                        {rankingIndex === selectedTradeTeamComparison.length - 1 && teamComparisonSort === 'score-asc' && (
                                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-black">최우수팀</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-1">최신 반영 {team.workerCount}명 · {team.latestDate ? new Date(team.latestDate).toLocaleDateString('ko-KR') : '-'}</p>
                                                </div>
                                            </div>

                                            <div className="flex-1 space-y-2">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-center">
                                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">평균점수</p>
                                                        <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-1">{team.avgScore.toFixed(1)}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-red-50 p-3 text-center">
                                                        <p className="text-[10px] font-bold text-red-400">고위험</p>
                                                        <p className="text-base font-black text-red-600 mt-1">{team.riskCount}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-amber-50 p-3 text-center">
                                                        <p className="text-[10px] font-bold text-amber-500">주의</p>
                                                        <p className="text-base font-black text-amber-600 mt-1">{team.cautionCount}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-emerald-50 p-3 text-center">
                                                        <p className="text-[10px] font-bold text-emerald-500">양호</p>
                                                        <p className="text-base font-black text-emerald-600 mt-1">{team.goodCount}</p>
                                                    </div>
                                                </div>
                                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                                    <div
                                                        className={`h-full ${team.avgScore >= 75 ? 'bg-emerald-500' : team.avgScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${Math.max(6, Math.min(team.avgScore, 100))}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-2 lg:w-auto">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleTeamComparisonSelection(team.team)}
                                                    className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                                                        isSelectedForComparison
                                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    {isSelectedForComparison ? '비교 제외' : '비교 추가'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openTradeIntegratedAnalysis(selectedTradeForComparison, 'chart')}
                                                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    팀 기준 분석
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTeam(getDashboardTeamKey(selectedTradeForComparison, team.team));
                                                        openTradeIntegratedAnalysis(selectedTradeForComparison, 'chart');
                                                    }}
                                                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                                                >
                                                    이 팀만 보기
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {comparedTeamRows.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center">
                                    <p className="text-sm font-bold text-slate-500 dark:text-slate-300">조건에 맞는 팀이 없습니다.</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">필터를 전체 팀으로 바꾸면 다시 확인할 수 있습니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ② Radar Chart — 선택된 타겟 그룹의 6대 지표 */}
                <div className={mobileInsightTab === 'chart' ? 'block' : 'hidden md:block'}>
                    {selectedTarget ? (
                        <DeferredSection fallback={<ChartSkeleton minHeight="280px" />} rootMargin="120px">
                            <Suspense fallback={<ChartSkeleton minHeight="280px" />}>
                                <TradeSixMetricRadar
                                    targetGroup={activeDetailGroup}
                                    siteAverageMetrics={dashboardData.siteAverageMetrics}
                                />
                            </Suspense>
                        </DeferredSection>
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

                {/* ③ 개인별 트렌드 패널 */}
                <div className={mobileInsightTab === 'worker' ? 'block' : 'hidden md:block'}>
                    {selectedTarget ? (
                        <DeferredSection fallback={<ChartSkeleton minHeight="220px" />} rootMargin="120px">
                            <Suspense fallback={<ChartSkeleton minHeight="220px" />}>
                                <WorkerTrendPanel
                                    targetGroup={activeDetailGroup}
                                />
                            </Suspense>
                        </DeferredSection>
                    ) : (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-dashed border-slate-200 dark:border-slate-700 p-6 flex items-center justify-center min-h-[100px]">
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{comparisonSectionMeta.emptyWorkerTrend}</p>
                        </div>
                    )}
                </div>
            </div>
            )}
        </div>
    );
};

export default Dashboard;
