
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkerRecord, SafetyCheckRecord, Page } from '../types';
import { StatCard } from '../components/StatCard';
import { SafetyActionCenter } from '../components/SafetyActionCenter';
import { Tooltip } from '../components/shared/Tooltip';
import { BrandPhilosophyLogo } from '../components/shared/BrandPhilosophyLogo';
import type { SelectedTarget } from '../components/charts/TradeNationalityCrossChart';
import {
    ALL_NATIONALITY_LABEL,
    getTargetGroupKey,
    normalizeDashboardTrade,
    transformDashboardData,
} from '../utils/dashboardDataTransformer';

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

// 관리 직군 여부 확인 함수
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

const ChartSkeleton: React.FC<{ minHeight?: string }> = ({ minHeight = '220px' }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 animate-pulse" style={{ minHeight }}>
        <div className="h-4 w-40 bg-slate-200 rounded mb-3" />
        <div className="h-3 w-64 bg-slate-100 rounded mb-6" />
        <div className="h-40 sm:h-52 rounded-xl bg-slate-100" />
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
    const teamList = useMemo(() => {
        const teams = new Set<string>();
        workerOnlyRecords.forEach(r => {
            if (r.teamLeader && r.teamLeader.trim().length > 0) teams.add(r.teamLeader.trim());
        });
        return Array.from(teams);
    }, [workerOnlyRecords]);

    // 팀별 필터링
    const filteredWorkerRecords = useMemo(() => {
        if (selectedTeam === 'ALL') return workerOnlyRecords;
        return workerOnlyRecords.filter(r => r.teamLeader === selectedTeam);
    }, [workerOnlyRecords, selectedTeam]);

    const teamSummaries = useMemo(() => {
        return teamList.map(team => {
            const records = workerOnlyRecords.filter(r => r.teamLeader === team);
            const uniqueWorkers = new Set(records.map(r => r.name));
            const latestRecords = Array.from(uniqueWorkers).map(name => {
                return records
                    .filter(r => r.name === name)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            });

            const avgScore = latestRecords.length > 0
                ? latestRecords.reduce((acc, r) => acc + r.safetyScore, 0) / latestRecords.length
                : 0;

            return {
                team,
                workerCount: uniqueWorkers.size,
                avgScore,
            };
        }).sort((a, b) => a.avgScore - b.avgScore);
    }, [teamList, workerOnlyRecords]);

    const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(null);
    const [selectedTradeForComparison, setSelectedTradeForComparison] = useState<string | null>(null);
    const [mobileInsightTab, setMobileInsightTab] = useState<'chart' | 'team' | 'worker'>('chart');
    const [teamComparisonSort, setTeamComparisonSort] = useState<'score-asc' | 'score-desc' | 'risk-desc' | 'workers-desc'>('score-asc');
    const [detailViewMode, setDetailViewMode] = useState<'integrated' | 'nationality'>('integrated');
    const [teamViewFilter, setTeamViewFilter] = useState<'all' | 'top3' | 'risk-only'>('all');

    const resetComparisonState = () => {
        setSelectedTeam('ALL');
        setSelectedTarget(null);
        setSelectedTradeForComparison(null);
        setMobileInsightTab('chart');
        setDetailViewMode('integrated');
        setTeamViewFilter('all');
    };

    const openTradeIntegratedAnalysis = (trade: string, nextTab: 'chart' | 'team' | 'worker' = 'team') => {
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
        if (selectedTeam !== 'ALL' && teamList.length > 0 && !teamList.includes(selectedTeam)) {
            setSelectedTeam('ALL');
        }
    }, [selectedTeam, teamList]);


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

    const dashboardData = useMemo(() => {
        return transformDashboardData(filteredWorkerRecords);
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

    const getRankBadge = (index: number) => {
        if (index === 0) return { label: '🥇', className: 'bg-amber-100 text-amber-700' };
        if (index === 1) return { label: '🥈', className: 'bg-slate-200 text-slate-700' };
        if (index === 2) return { label: '🥉', className: 'bg-orange-100 text-orange-700' };
        return { label: String(index + 1), className: 'bg-slate-100 text-slate-600' };
    };

    const unassignedCount = dashboardData.unassignedRecordCount;
    const isUnassignedWarning = unassignedCount > 0;

    const handleNavigateToUnassignedRecords = () => {
        const params = new URLSearchParams(window.location.search);
        params.set('filter', 'unassigned');
        const query = params.toString();
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
        setCurrentPage('worker-management');
    };
    
    // [SIMULATION DATE] 2026-02-17
    const today = "2026년 2월 17일 화요일";

    return (
        <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in-up">
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
                                    <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500/90 text-white text-[8px] sm:text-[10px] font-black rounded-md uppercase tracking-wide">v2.1</span>
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
                                    팀 필터: {selectedTeam}
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
                                        {stats.highRiskWorkers > 0 
                                            ? `현재 ${stats.highRiskWorkers}명의 고위험 근로자가 감지되었습니다. 즉시 교육 및 점검이 필요합니다.`
                                            : '모든 근로자가 안전 기준을 충족하고 있습니다. 현재 상태를 유지하세요.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full lg:w-auto">
                            <button onClick={() => setCurrentPage('ocr-analysis')} className="px-4 sm:px-5 py-2.5 sm:py-3 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 hover:scale-105 active:scale-95">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                신규 분석
                            </button>
                            <button onClick={() => setCurrentPage('reports')} className="px-4 sm:px-5 py-2.5 sm:py-3 bg-white text-slate-900 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm shadow-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2 hover:scale-105 active:scale-95">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                리포트 생성
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-50 border-l-4 border-indigo-400 p-3 sm:p-4 rounded-r-lg flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                <div className="flex items-start sm:items-center gap-2">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs sm:text-sm text-indigo-700 font-bold">
                        [데이터 안내] 2026년 기준 실무 근로자 중심 분석 모드 활성
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                <StatCard 
                    title="현장 실무 근로자" 
                    value={`${stats.totalWorkers}명`} 
                    iconType="users" 
                    onClick={() => setCurrentPage('worker-management')}
                />
                <StatCard 
                    title="실무 평균 안전 점수" 
                    value={`${stats.averageScore.toFixed(1)}점`} 
                    iconType="chart" 
                    onClick={() => setCurrentPage('performance-analysis')}
                />
                 <StatCard 
                    title="고위험 근로자" 
                    value={`${stats.highRiskWorkers}명`} 
                    iconType="warning"
                    onClick={() => setCurrentPage('predictive-analysis')}
                />
                <StatCard 
                    title="안전 이행 점검" 
                    value={`${stats.totalChecks}건`} 
                    iconType="check"
                    onClick={() => setCurrentPage('safety-checks')}
                />
            </div>

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
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                <div className="lg:col-span-2">
                    <div className="h-full rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <SafetyActionCenter workerRecords={workerOnlyRecords} />
                    </div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100 flex flex-col">
                    <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-6 text-slate-800">국적별 근로자 현황</h3>
                    <div className="flex-1 min-h-[200px]">
                        <DeferredSection fallback={<ChartSkeleton minHeight="200px" />} rootMargin="160px">
                            <Suspense fallback={<ChartSkeleton minHeight="200px" />}>
                                <NationalityChart records={workerOnlyRecords} />
                            </Suspense>
                        </DeferredSection>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                        <h3 className="text-base sm:text-lg font-bold text-slate-800">근로자 주요 취약 분야</h3>
                         <Tooltip text="관리 직군을 제외한 실무 근로자 데이터에서 추출된 주요 취약점입니다.">
                            <div className="flex items-center text-xs sm:text-sm text-slate-400 cursor-pointer hover:text-slate-600 transition-colors">
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
                 <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-slate-100">
                    <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-6 text-slate-800">최근 2주간 안전 점검 동향</h3>
                    <div className="h-64">
                        <DeferredSection fallback={<ChartSkeleton minHeight="16rem" />} rootMargin="160px">
                            <Suspense fallback={<ChartSkeleton minHeight="16rem" />}>
                                <SafetyCheckDonutChart records={safetyCheckRecords} />
                            </Suspense>
                        </DeferredSection>
                    </div>
                </div>
            </div>


            {/* ═══════════════════════════════════════════════════════
                    공종 × 국적 교차 안전 숙련도 분석 섹션 (아래)
            ═══════════════════════════════════════════════════════ */}
            <div className="space-y-4 sm:space-y-6">
                {/* 섹션 헤더 + 팀별 드롭다운 */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-1">
                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-1 h-6 bg-indigo-500 rounded-full" />
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-800">
                                공종 × 국적 교차 안전 숙련도 분석
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                팀별로 보기: 아래에서 팀을 선택하면 해당 팀의 데이터만 표시됩니다.
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
                            {teamList.map(team => (
                                <option key={team} value={team}>{team}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="md:hidden flex gap-2 overflow-x-auto pb-1">
                    {[
                        { key: 'chart', label: '차트' },
                        { key: 'team', label: '팀비교' },
                        { key: 'worker', label: '개인추이' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setMobileInsightTab(tab.key as 'chart' | 'team' | 'worker')}
                            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border transition-colors ${
                                mobileInsightTab === tab.key
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {tradeQuickAccess.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-xs font-black text-slate-700">주요 공종 바로가기</p>
                                <p className="text-[11px] text-slate-500">평균점수가 낮은 공종부터 바로 팀 비교로 진입할 수 있습니다.</p>
                            </div>
                            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold">
                                취약 공종 우선 노출
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
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-xs font-black text-slate-700">팀 비교 바로가기</p>
                                <p className="text-[11px] text-slate-500">형틀처럼 팀 편차가 큰 공종은 아래 칩으로 빠르게 전환할 수 있습니다.</p>
                            </div>
                            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold">
                                낮은 평균점수 순 정렬
                            </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            <button
                                type="button"
                                onClick={() => setSelectedTeam('ALL')}
                                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors min-w-[116px] ${
                                    selectedTeam === 'ALL'
                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                <p className="text-[10px] font-black uppercase tracking-wide">전체</p>
                                <p className="text-xs font-bold mt-1">전체 통합 뷰</p>
                            </button>
                            {teamSummaries.map(summary => (
                                <button
                                    key={summary.team}
                                    type="button"
                                    onClick={() => setSelectedTeam(summary.team)}
                                    className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors min-w-[132px] ${
                                        selectedTeam === summary.team
                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <p className="text-xs font-black truncate">{summary.team}</p>
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
                    <div className={`${mobileInsightTab === 'team' ? 'block' : 'hidden md:block'} bg-white rounded-2xl shadow-lg border border-slate-100 p-4 sm:p-6 space-y-4`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-base sm:text-lg font-bold text-slate-800">
                                    {selectedTradeForComparison} 팀 대 팀 비교
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    팀 비교는 항상 전체 국적 통합 기준으로 계산됩니다. 팀 내부의 다양한 국적은 분리하지 않습니다.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">
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
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
                                >
                                    되돌리기
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500">정렬 기준에 따라 취약 팀부터 우수 팀까지 빠르게 비교할 수 있습니다.</p>
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
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500">복잡하면 핵심 팀만 빠르게 보세요.</p>
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
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black text-slate-700">상세 분석 기준</p>
                                    <p className="text-[11px] text-slate-500 mt-1">팀 비교는 통합 기준으로 유지하고, 하단 상세만 필요 시 국적 세부 분석으로 전환합니다.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDetailViewMode('integrated')}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                            detailViewMode === 'integrated'
                                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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

                        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-500">
                            현재 <span className="font-black text-slate-700">{visibleTeamComparison.length}개 팀</span> 표시 중 · 팀 평가는 모두 <span className="font-black text-slate-700">국적 통합 기준</span>입니다.
                        </div>

                        <div className="space-y-3">
                            {visibleTeamComparison.map((team) => {
                                const rankingIndex = selectedTradeTeamComparison.findIndex(item => item.team === team.team);
                                const rankBadge = getRankBadge(rankingIndex);

                                return (
                                    <div
                                        key={team.team}
                                        className={`rounded-2xl border p-4 transition-colors ${
                                            selectedTeam === team.team
                                                ? 'border-indigo-300 bg-indigo-50'
                                                : 'border-slate-200 bg-white'
                                        }`}
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                            <div className="flex items-center gap-3 min-w-0 lg:w-[240px]">
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 ${rankBadge.className}`}>
                                                    {rankBadge.label}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-black text-slate-800 truncate">{team.team}</p>
                                                        {rankingIndex === 0 && (
                                                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-black">현재 기준 최상단</span>
                                                        )}
                                                        {rankingIndex === selectedTradeTeamComparison.length - 1 && teamComparisonSort === 'score-asc' && (
                                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-black">최우수팀</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 mt-1">최신 반영 {team.workerCount}명 · {team.latestDate ? new Date(team.latestDate).toLocaleDateString('ko-KR') : '-'}</p>
                                                </div>
                                            </div>

                                            <div className="flex-1 space-y-2">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                                                        <p className="text-[10px] font-bold text-slate-400">평균점수</p>
                                                        <p className="text-base font-black text-slate-800 mt-1">{team.avgScore.toFixed(1)}</p>
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
                                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className={`h-full ${team.avgScore >= 75 ? 'bg-emerald-500' : team.avgScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${Math.max(6, Math.min(team.avgScore, 100))}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-2 lg:w-auto">
                                                <button
                                                    type="button"
                                                    onClick={() => openTradeIntegratedAnalysis(selectedTradeForComparison, 'chart')}
                                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                                                >
                                                    팀 기준 분석
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTeam(team.team);
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
                            {visibleTeamComparison.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                                    <p className="text-sm font-bold text-slate-500">조건에 맞는 팀이 없습니다.</p>
                                    <p className="text-xs text-slate-400 mt-1">필터를 전체 팀으로 바꾸면 다시 확인할 수 있습니다.</p>
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
                        <div className="bg-white rounded-2xl shadow-lg border border-dashed border-indigo-200 p-8 flex flex-col items-center justify-center gap-2 text-center min-h-[200px]">
                            <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                            </svg>
                            <p className="text-sm font-bold text-indigo-400">위 그래프에서 분석할 작업조를 클릭하세요</p>
                            <p className="text-xs text-slate-400">막대는 공종·국적 기준, 팀 비교와 공종 칩은 전체 국적 통합 기준입니다.</p>
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
                        <div className="bg-white rounded-2xl shadow-lg border border-dashed border-slate-200 p-6 flex items-center justify-center min-h-[100px]">
                            <p className="text-xs text-slate-400 font-medium">작업조를 선택하면 개인별 트렌드 목록이 활성화됩니다.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
