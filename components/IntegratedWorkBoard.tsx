import React, { useEffect, useMemo, useState } from 'react';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../types';
import { getRouteLabel } from '../config/routeMeta';
import { postAdminJson } from '../utils/adminApiClient';
import {
    getDefaultUiCompositionConfig,
    loadUiCompositionConfig,
    resetUiCompositionConfig,
    saveUiCompositionConfig,
    setSidebarPageVisible,
    type UiCompositionConfig,
} from '../utils/uiCompositionConfig';
import {
    buildMonthlyCoreMetricSeries,
    calculateCoreMetricSnapshot,
    isOperationalWorkerRecord,
} from '../utils/coreMetrics';

interface IntegratedWorkBoardProps {
    workerRecords: WorkerRecord[];
    safetyCheckRecords: SafetyCheckRecord[];
    setCurrentPage: (page: Page) => void;
    onOpenAdvanced: () => void;
}

type BoardStep = {
    number: number;
    title: string;
    subtitle: string;
    page: Page;
    accent: 'blue' | 'orange' | 'green';
};

type TrainingSummary = {
    trainingSessions: number;
    trainingSubmissions: number | null;
};

const BOARD_STEPS: BoardStep[] = [
    { number: 1, title: '상세 분석 대시보드', subtitle: '현장 위험과 월별 지표를 상세 분석합니다.', page: 'dashboard', accent: 'blue' },
    { number: 2, title: '위험성평가 작성·분석', subtitle: '사진, PDF 또는 수기 내용으로 평가를 작성합니다.', page: 'ocr-analysis', accent: 'blue' },
    { number: 3, title: '월별 계도 리포트', subtitle: '지난달 작성 내용을 익명화하여 공유합니다.', page: 'monthly-guidance-report', accent: 'orange' },
    { number: 4, title: '다음 달 TBM 교육자료', subtitle: '기록과 PDF·PPTX를 근거로 전파교육 한 장을 만듭니다.', page: 'a4-education-material', accent: 'orange' },
    { number: 5, title: '다국어 교육·QR', subtitle: '언어별 교육을 배포하고 참여를 확인합니다.', page: 'admin-training', accent: 'green' },
    { number: 6, title: '월별 성과 확인', subtitle: '개선 이행과 반복 위험 변화를 확인합니다.', page: 'performance-analysis', accent: 'green' },
    { number: 7, title: '환경 설정', subtitle: '현장, 언어, 화면 구성을 관리합니다.', page: 'settings', accent: 'blue' },
];

const OPTIONAL_FEATURES: Page[] = [
    'site-issue-management',
    'worker-management',
    'safety-compliance-hub',
    'survey-intelligence',
    'predictive-analysis',
    'safety-behavior-management',
];

const CORE_MENU_PAGES = new Set<Page>([
    'dashboard',
    'ocr-analysis',
    'monthly-guidance-report',
    'a4-education-material',
    'admin-training',
    'reports',
    'performance-analysis',
    'settings',
]);

const formatMonth = (date = new Date()) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getRecentMonthKeys = (count: number): string[] => {
    const now = new Date();
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
        return getMonthKey(date);
    });
};

const TrendChart = ({ values, color = '#2563eb', label }: { values: number[]; color?: string; label: string }) => {
    const gradId = `grad-${color.replace('#', '')}`;

    // 1. 데이터가 아예 없을 때 (0개)
    if (values.length === 0) {
        return (
            <div className="relative flex flex-col justify-center items-center mt-1 h-8 w-full bg-slate-50/50 dark:bg-slate-800/10 rounded-lg">
                <svg viewBox="0 0 120 42" className="absolute inset-0 h-full w-full opacity-20" role="img" aria-label={label}>
                    <line x1="0" y1="25" x2="120" y2="25" stroke={color} strokeWidth="1" strokeDasharray="3,3" />
                </svg>
                <span className="relative z-10 text-[9px] font-bold text-slate-400">안전 분석 데이터 대기 중</span>
            </div>
        );
    }

    // 2. 단일 데이터 포인트만 있을 때 (1개)
    if (values.length === 1) {
        const val = values[0];
        // 0~100 점수 기준 정규화 (y 좌표 범위는 12 ~ 38)
        const cy = 38 - (Math.min(100, Math.max(0, val)) / 100) * 26;
        
        // 단일 포인트 기준 그라데이션 채우기 (가운데에 솟은 형태)
        const fillPoints = `0,42 60,${cy} 120,42`;

        return (
            <svg viewBox="0 0 120 42" className="mt-1 h-8 w-full" role="img" aria-label={label}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                    </linearGradient>
                </defs>
                {/* 은은한 가이드라인 */}
                <line x1="0" y1={cy} x2="120" y2={cy} stroke={color} strokeWidth="0.8" strokeDasharray="2,2" className="opacity-40" />
                
                {/* 영역 채우기 */}
                <polygon points={fillPoints} fill={`url(#${gradId})`} />
                
                {/* 추세선 대용 (중앙 연결선) */}
                <line x1="0" y1="38" x2="60" y2={cy} stroke={color} strokeWidth="1" className="opacity-30" />
                <line x1="60" y1={cy} x2="120" y2="38" stroke={color} strokeWidth="1" className="opacity-30" />

                {/* 중앙 강조 단일 점 */}
                <circle cx="60" cy={cy} r="2.5" fill={color} />
                <circle cx="60" cy={cy} r="4.5" stroke={color} strokeWidth="1" fill="none" className="animate-ping opacity-75" style={{ animationDuration: '3s' }} />
                
                {/* 값 텍스트 */}
                <text x="60" y={cy - 4} textAnchor="middle" fill={color} fontSize="5" fontWeight="bold" className="font-sans">
                    {val.toFixed(1)}{label.includes('개선') ? '%' : '점'}
                </text>
            </svg>
        );
    }

    // 3. 2개 이상의 데이터 포인트가 있을 때 (정상 추세선 렌더링)
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const points = values
        .map((value, index) => `${index * (120 / (values.length - 1))},${38 - ((value - min) / range) * 26}`)
        .join(' ');
    
    const fillPoints = `${points} 120,42 0,42`;

    return (
        <svg viewBox="0 0 120 42" className="mt-1 h-8 w-full" role="img" aria-label={label}>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                </linearGradient>
            </defs>
            <polygon points={fillPoints} fill={`url(#${gradId})`} />
            <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={points} />
            {values.map((value, index) => (
                <circle key={`${value}-${index}`} cx={index * (120 / (values.length - 1))} cy={38 - ((value - min) / range) * 26} r="1.5" fill={color} />
            ))}
        </svg>
    );
};

export const IntegratedWorkBoard: React.FC<IntegratedWorkBoardProps> = ({
    workerRecords,
    safetyCheckRecords,
    setCurrentPage,
    onOpenAdvanced,
}) => {
    const [showFeatureLocker, setShowFeatureLocker] = useState(false);
    const [composition, setComposition] = useState<UiCompositionConfig>(() => loadUiCompositionConfig());
    const [trainingSummary, setTrainingSummary] = useState<TrainingSummary | null>(null);
    const [trainingSummaryError, setTrainingSummaryError] = useState('');
    const [activeChartTab, setActiveChartTab] = useState<'score' | 'improvement'>('score');

    useEffect(() => {
        let active = true;
        void postAdminJson<{ ok: true; summary: TrainingSummary }>(
            '/api/admin/training',
            { action: 'dashboard-summary' },
            { fallbackMessage: '서버 교육 현황을 불러오지 못했습니다.' },
        )
            .then((response) => {
                if (!active) return;
                setTrainingSummary(response.summary);
                setTrainingSummaryError('');
            })
            .catch((error) => {
                if (!active) return;
                setTrainingSummaryError(error instanceof Error ? error.message : '서버 교육 현황을 불러오지 못했습니다.');
            });
        return () => {
            active = false;
        };
    }, []);

    const summary = useMemo(() => {
        const metrics = calculateCoreMetricSnapshot(workerRecords.filter(isOperationalWorkerRecord));
        return {
            averageScore: metrics.averageScore,
            highRisk: metrics.protectionPriorityCount,
            analyzed: metrics.analyzedWorkerCount,
            improvement: metrics.improvementExecutionRate,
            workTypes: metrics.workTypeCount,
            workerCount: metrics.totalWorkers,
            metricRuleVersion: metrics.ruleVersion,
        };
    }, [workerRecords]);

    const monthlyTrends = useMemo(() => {
        const monthKeys = getRecentMonthKeys(6);
        const scoreValues: number[] = [];
        const improvementValues: number[] = [];

        const monthlyMetrics = new Map(
            buildMonthlyCoreMetricSeries(workerRecords.filter(isOperationalWorkerRecord))
                .map((point) => [point.month, point]),
        );

        monthKeys.forEach((monthKey) => {
            const point = monthlyMetrics.get(monthKey);
            if (point?.validScoreRecordCount) scoreValues.push(point.averageScore);
            if (point?.analyzedWorkerCount) improvementValues.push(point.improvementExecutionRate);
        });

        return { scoreValues, improvementValues };
    }, [workerRecords]);

    const priorityTrade = useMemo(() => {
        const tradeScores = new Map<string, { sum: number; count: number }>();
        workerRecords.filter(isOperationalWorkerRecord).forEach((r) => {
            const score = Number(r.safetyScore);
            const trade = String(r.jobField || '').trim();
            if (trade && Number.isFinite(score)) {
                const current = tradeScores.get(trade) || { sum: 0, count: 0 };
                tradeScores.set(trade, { sum: current.sum + score, count: current.count + 1 });
            }
        });
        
        let worstTrade = '대기 중';
        let worstAvg = 100;
        tradeScores.forEach((val, key) => {
            const avg = val.sum / val.count;
            if (avg < worstAvg) {
                worstAvg = avg;
                worstTrade = key;
            }
        });
        
        return { name: worstTrade, score: worstTrade === '대기 중' ? 0 : Math.round(worstAvg * 10) / 10 };
    }, [workerRecords]);

    const trendDelta = useMemo(() => {
        if (monthlyTrends.scoreValues.length >= 2) {
            const latest = monthlyTrends.scoreValues[monthlyTrends.scoreValues.length - 1];
            const previous = monthlyTrends.scoreValues[monthlyTrends.scoreValues.length - 2];
            return latest - previous;
        }
        return 0;
    }, [monthlyTrends]);

    const aiInsightText = useMemo(() => {
        const score = summary.averageScore;
        const imp = summary.improvement;
        if (score === 0) return '현장 데이터 수집이 시작되었습니다. 축적 데이터에 따라 실시간 AI 관제 소견이 활성화됩니다.';
        
        if (score < 75 && imp < 60) {
            return `평균 응답품질(${score}점)과 개선율(${imp}%)이 정체 중입니다. ${priorityTrade.name} 공종을 중심으로 밀착 지도가 필요합니다.`;
        } else if (imp < 60) {
            return `근로자 안전 이해도(${score}점)에 비해 개선 이행률(${imp}%)이 낮습니다. 지적 사항 보강 상태를 점검하세요.`;
        } else {
            return `전체 지표가 우수하게 유지 중입니다. 다국어 근로자 TBM 전파율을 점검하며 현재의 흐름을 보존하십시오.`;
        }
    }, [summary, priorityTrade]);

    const topRisks = useMemo(() => {
        const counts = new Map<string, number>();
        workerRecords.forEach((record) => {
            (record.weakAreas || []).forEach((risk) => counts.set(risk, (counts.get(risk) || 0) + 1));
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    }, [workerRecords]);

    const updateFeature = (page: Page, visible: boolean) => {
        const next = saveUiCompositionConfig(setSidebarPageVisible(composition, page, visible));
        setComposition(next);
    };

    const showAllFeatures = () => {
        let next = getDefaultUiCompositionConfig();
        OPTIONAL_FEATURES.forEach((page) => {
            next = setSidebarPageVisible(next, page, true);
        });
        setComposition(saveUiCompositionConfig(next));
    };

    const openStep = (step: BoardStep) => {
        if (step.page === 'dashboard') {
            onOpenAdvanced();
            return;
        }
        setCurrentPage(step.page);
    };

    return (
        <div className="psi-work-board min-h-full space-y-3 pb-1 text-slate-900">
            {/* 1. 상단 프리미엄 헤더 */}
            <section className="psi-industrial-panel px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-blue-700 dark:text-blue-400">Control Hub</p>
                        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0c2348] dark:text-slate-100 font-sans">PSI 통합 안전 관리 센터</h1>
                        <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            현장 기록 분석, AI 위험 도출, 다국어 TBM 교육 전파 및 개선율 추이를 단일 대시보드에서 제어합니다.
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                            <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                            <span>분석 데이터 기준: 현재 브라우저에 누적된 현장 안전점검 데이터 ({workerRecords.length}건)</span>
                            <span title={summary.metricRuleVersion}>· 공식 계산 기준: 근로자별 최신 기록</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="rounded-xl border border-blue-100 bg-blue-50/50 px-3.5 py-1.5 text-xs font-black text-blue-700 dark:border-blue-500/20 dark:bg-blue-950/30 dark:text-blue-300">
                            🗓️ {formatMonth()} 운영
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage('ocr-analysis')}
                            className="inline-flex items-center min-h-[36px] px-3.5 py-1.5 text-xs font-black rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                        >
                            ⚡ AI 분석 스튜디오
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowFeatureLocker((value) => !value)}
                            className={`inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-black rounded-xl transition-all duration-200 ${
                                showFeatureLocker
                                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 border border-slate-350 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-755 dark:border-slate-700'
                                    : 'bg-gradient-to-r from-blue-700 to-blue-800 text-white hover:from-blue-800 hover:to-blue-900 shadow-sm'
                            }`}
                        >
                            ⚙️ 화면 구성 설정
                        </button>
                    </div>
                </div>
            </section>

            {/* 화면 구성 설정 아코디언 */}
            {showFeatureLocker && (
                <section className="psi-industrial-panel p-4 border-blue-400/80 bg-blue-50/15 dark:border-blue-500/40 dark:bg-blue-950/10 ring-4 ring-blue-500/5 transition-all duration-300">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-black text-blue-600 dark:text-blue-400">화면 기능 설정</p>
                            <h2 className="mt-0.5 text-base font-black">현장 실무에 맞추어 활성화할 메뉴를 필터링하세요.</h2>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setComposition(resetUiCompositionConfig())} className="min-h-9 rounded-xl border border-slate-200 px-3 py-1 text-xs font-black text-slate-655 bg-white">기본값</button>
                            <button type="button" onClick={showAllFeatures} className="min-h-9 rounded-xl bg-[#0c377d] px-3 py-1 text-xs font-black text-white">모두 표시</button>
                        </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {composition.sidebarOrder.map((page) => {
                            const fixed = CORE_MENU_PAGES.has(page);
                            const visible = !composition.hiddenSidebarPages.includes(page);
                            return (
                                <label key={page} className={`flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 ${fixed ? 'border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'}`}>
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{getRouteLabel(page, 'practitioner')}</span>
                                    <input type="checkbox" checked={visible} disabled={fixed} onChange={(event) => updateFeature(page, event.target.checked)} className="h-4.5 w-4.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50" />
                                </label>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* 2. 6대 현장 핵심 지표 KPI 위젯 보드 */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {[
                    { label: '현장 작성물', value: `${workerRecords.length}건`, helper: '이 브라우저', icon: '📝', color: 'blue' },
                    { label: 'AI 분석 완료', value: `${summary.analyzed}건`, helper: `응답품질 ${summary.averageScore}점`, icon: '🤖', color: 'indigo' },
                    { label: '보호 우선 집중', value: `${summary.highRisk}건`, helper: '교육 우선 대상', icon: '🚨', color: 'rose' },
                    { label: '개선 이행', value: `${summary.improvement}%`, helper: `${summary.workTypes}개 공종`, icon: '✅', color: 'emerald' },
                    { label: '교육 세션', value: trainingSummary ? `${trainingSummary.trainingSessions}건` : '-', helper: '서버 전체', icon: '🏫', color: 'violet' },
                    { label: '교육 참여', value: trainingSummary?.trainingSubmissions == null ? '-' : `${trainingSummary.trainingSubmissions}건`, helper: '서버 전체', icon: '👥', color: 'sky' },
                ].map((item) => {
                    const ringColors: Record<string, string> = {
                        blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
                        indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
                        rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
                        emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
                        violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
                        sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
                    };
                    return (
                        <div key={item.label} className="psi-industrial-panel psi-industrial-panel--flat flex items-center gap-3 px-3.5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-305 dark:hover:border-slate-700 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-800/80">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${ringColors[item.color] || ringColors.blue}`}>
                                {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{item.label}</p>
                                <p className="mt-0.5 text-xl font-black text-slate-800 dark:text-slate-100">{item.value}</p>
                                <p className="text-[10px] font-bold text-slate-405 truncate mt-0.5">{item.helper}</p>
                            </div>
                        </div>
                    );
                })}
            </section>

            {trainingSummaryError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2 text-xs font-bold text-rose-700 dark:bg-rose-950/20 dark:text-rose-300">
                    ⚠️ 서버 교육 통계 동기화 일시 지연: 관리자 계정 권한을 다시 점검해 주십시오.
                </p>
            )}

            {/* 3. 3열 비대칭 와이드 그리드 영역 */}
            <section className="grid gap-4 md:grid-cols-3">
                {/* [1열] 현황 & 모니터링 스튜디오 (상세 대시보드 및 성과 통합) */}
                <div className="psi-interactive-card flex flex-col justify-between p-4 bg-gradient-to-br from-white to-slate-50/20 dark:from-slate-900 dark:to-slate-800/20 text-left">
                    <div>
                        <div className="flex items-start justify-between">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-900 text-xs font-black text-white dark:bg-blue-600">01</span>
                            {/* 차트 전환 탭 */}
                            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setActiveChartTab('score'); }}
                                    className={`rounded-md px-2 py-0.5 text-[10px] font-black transition-colors ${
                                        activeChartTab === 'score'
                                            ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                    }`}
                                >
                                    응답품질
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setActiveChartTab('improvement'); }}
                                    className={`rounded-md px-2 py-0.5 text-[10px] font-black transition-colors ${
                                        activeChartTab === 'improvement'
                                            ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                    }`}
                                >
                                    개선 이행률
                                </button>
                            </div>
                        </div>

                        <div className="mt-3">
                            <h3 className="text-sm font-black text-slate-900 dark:text-slate-150">현장 안전 트렌드 & 지표 분석</h3>
                            <p className="mt-1 text-[11px] font-medium text-slate-400 leading-4">최근 월별 응답품질 신호와 공종별 개선 이행 추이를 그래프로 분석합니다.</p>
                        </div>

                        {/* 메트릭 정보 요약 */}
                        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                                <b className="text-base font-black text-blue-700 dark:text-blue-400">{summary.averageScore}점</b>
                                <span className="block text-[9px] font-bold text-slate-400 mt-0.5">평균 응답품질</span>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                                <b className="text-base font-black text-emerald-700 dark:text-emerald-400">{summary.improvement}%</b>
                                <span className="block text-[9px] font-bold text-slate-400 mt-0.5">평균 개선율</span>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                                <b className="text-base font-black text-slate-700 dark:text-slate-350">{summary.workTypes}개</b>
                                <span className="block text-[9px] font-bold text-slate-400 mt-0.5">대상 공종 수</span>
                            </div>
                        </div>

                        {/* 활성화된 차트 렌더링 */}
                        <div className="mt-3.5 rounded-xl bg-slate-50/50 p-2 dark:bg-slate-800/30">
                            {activeChartTab === 'score' ? (
                                <>
                                    <p className="text-[10px] font-black text-slate-500">최근 평균 응답품질 추세</p>
                                    <TrendChart values={monthlyTrends.scoreValues} label="최근 평균 응답품질 추세" />
                                </>
                            ) : (
                                <>
                                    <p className="text-[10px] font-black text-slate-550 dark:text-slate-400">최근 개선 이행 추세</p>
                                    <TrendChart values={monthlyTrends.improvementValues} color="#059669" label="최근 개선 이행 추세" />
                                </>
                            )}
                        </div>

                        {/* 신규: AI 안전 소견 및 실시간 지표 분석 */}
                        <div className="mt-3 space-y-2.5">
                            <div className="rounded-xl border border-indigo-100/70 bg-indigo-50/30 p-2.5 dark:border-indigo-950/40 dark:bg-indigo-950/20">
                                <div className="flex items-center gap-1 text-[10px] font-black text-indigo-900 dark:text-indigo-300">
                                    <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                    AI 실시간 관제 소견
                                </div>
                                <p className="mt-1 text-[10px] font-bold text-slate-600 dark:text-slate-450 leading-relaxed font-sans">
                                    {aiInsightText}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-left">
                                <div className="rounded-xl border border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/40">
                                    <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">중점 계도 공종</span>
                                    <div className="mt-1 flex items-center justify-between">
                                        <b className="text-xs font-black text-slate-700 dark:text-slate-300">{priorityTrade.name}</b>
                                        {priorityTrade.name !== '대기 중' && (
                                            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-black text-rose-700 dark:bg-rose-955/20 dark:text-rose-300">
                                                {priorityTrade.score}점
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/40">
                                    <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">전월 대비 추세</span>
                                    <div className="mt-1 flex items-center justify-between">
                                        <b className="text-xs font-black text-slate-700 dark:text-slate-300">평균 응답품질</b>
                                        <span className={`text-[10px] font-black flex items-center gap-0.5 ${trendDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {trendDelta >= 0 ? '▲' : '▼'} {Math.abs(trendDelta).toFixed(1)}점
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => openStep(BOARD_STEPS[0])}
                            className="text-xs font-black text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                            📊 상세 분석 대시보드 바로가기 <span aria-hidden="true">→</span>
                        </button>
                        <span className="text-[10px] font-bold text-slate-400">{safetyCheckRecords.length}건 안전기록</span>
                    </div>
                </div>

                {/* [2열] 핵심 액션 (위험성평가 AI 분석 스튜디오 및 계도 리포트) */}
                <div className="flex flex-col gap-4 text-left">
                    {/* 2번 과업: 위험성평가 작성·분석 (AI 메인 히어로 위젯) */}
                    <div className="psi-interactive-card flex-1 p-4 border-2 border-dashed border-blue-355 bg-blue-50/15 dark:border-blue-550/40 dark:bg-blue-950/5 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 flex flex-col justify-between">
                        <div onClick={() => openStep(BOARD_STEPS[1])} className="cursor-pointer">
                            <div className="flex items-center justify-between">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-xs font-black text-white shadow-sm">02</span>
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">AI 권장 스튜디오</span>
                            </div>
                            <div className="mt-3">
                                <h3 className="text-sm font-black text-[#0c2348] dark:text-slate-150">위험성평가 AI 스튜디오</h3>
                                <p className="mt-1 text-[11px] font-semibold text-slate-550 dark:text-slate-400 font-sans">
                                    현장 사진, PDF 보고서 또는 수기 텍스트를 기계 학습 기반 엔진으로 분석하여 응답품질 신호와 상등급 위험 조치를 도출합니다.
                                </p>
                            </div>
                            <div className="mt-3 rounded-xl border border-dashed border-blue-200/60 bg-blue-50/40 p-2.5 text-center dark:border-blue-500/20 dark:bg-blue-950/20">
                                <p className="text-xs font-black text-blue-800 dark:text-blue-300">📸 사진 · 📄 PDF · ✍️ 수기 통합 등록</p>
                                <p className="mt-1 text-[10px] font-bold text-blue-500">기본 AI 분석 엔진 탑재 (무료 한도 무제한 자동 필터링)</p>
                            </div>
                        </div>

                        <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => openStep(BOARD_STEPS[1])}
                                className="text-xs font-black text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                                ⚡ 신규 AI 분석 개시하기 <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>

                    {/* 3번 과업: 월별 계도 리포트 공유 */}
                    <div className="psi-interactive-card p-4 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-xs font-black text-white">03</span>
                                <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-300">익명 전파</span>
                            </div>
                            <div className="mt-3">
                                <h3 className="text-sm font-black text-slate-900 dark:text-slate-150">월별 계도 리포트</h3>
                                <p className="mt-1 text-[11px] font-medium text-slate-400 leading-4">이 브라우저의 분석 결과를 취합하여 지난달 3대 핵심 위해 요소를 익명화하여 공유합니다.</p>
                            </div>

                            <div className="mt-2.5 space-y-1">
                                {topRisks.length ? (
                                    topRisks.map(([risk, count], index) => (
                                        <div key={risk} className="flex items-center gap-2 text-[10px] font-bold">
                                            <b className="w-4.5 text-blue-700 dark:text-blue-400">{index + 1}위</b>
                                            <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{risk}</span>
                                            <span className="text-slate-400">{count}건</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="rounded-xl bg-slate-50 p-2 text-center text-[10px] font-bold text-slate-400">현장 기록 분석 후 주요 위험 항목이 실시간 반영됩니다.</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-3.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => openStep(BOARD_STEPS[2])}
                                className="text-xs font-black text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                                📊 계도 리포트 공유 및 관리 <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* [3열] 전파 교육 및 설정 (TBM 교육자료 및 다국어 QR 전파) */}
                <div className="flex flex-col gap-4 text-left">
                    {/* 4번 + 5번 과업 통합: 전파 교육 & 다국어 QR 배포 스튜디오 */}
                    <div className="psi-interactive-card flex-1 p-4 bg-gradient-to-br from-white to-emerald-50/10 dark:from-slate-900 dark:to-emerald-950/20 hover:shadow-lg transition flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between">
                                <div className="flex gap-1.5">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-xs font-black text-white">04</span>
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-800 text-xs font-black text-white">05</span>
                                </div>
                                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-300">TBM 배포</span>
                            </div>
                            <div className="mt-3">
                                <h3 className="text-sm font-black text-slate-900 dark:text-slate-150">TBM 교육자료 & 다국어 QR 배포</h3>
                                <p className="mt-1 text-[11px] font-medium text-slate-400 leading-4">
                                    도출된 위해 정보와 원문 PDF를 기반으로 전파 교육 한 장을 인쇄 생성하고, 외국인 근로자를 위한 모바일 다국어 번역 및 QR 인증을 지원합니다.
                                </p>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                                <div onClick={() => openStep(BOARD_STEPS[3])} className="cursor-pointer rounded-lg bg-amber-50/50 p-2 border border-amber-100/40 hover:bg-amber-100/30 transition dark:bg-amber-950/10 dark:border-amber-900/20">
                                    <b className="text-base text-amber-700 dark:text-amber-400 font-bold">📄 A4</b>
                                    <p className="mt-1 text-[9px] font-black text-amber-800 dark:text-amber-300">교육 자료 인쇄</p>
                                </div>
                                <div onClick={() => openStep(BOARD_STEPS[4])} className="cursor-pointer rounded-lg bg-emerald-50/50 p-2 border border-emerald-100/40 hover:bg-emerald-100/30 transition dark:bg-emerald-950/10 dark:border-emerald-900/20">
                                    <b className="text-base text-emerald-700 dark:text-emerald-400 font-bold">📱 QR</b>
                                    <p className="mt-1 text-[9px] font-black text-emerald-800 dark:text-emerald-300">다국어 교육 배포</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
                            <button
                                type="button"
                                onClick={() => openStep(BOARD_STEPS[3])}
                                className="text-xs font-black text-slate-700 dark:text-slate-350 hover:text-blue-700 dark:hover:text-blue-400 flex items-center gap-1.5"
                            >
                                📑 TBM 교육자료 스튜디오 열기 <span aria-hidden="true">→</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => openStep(BOARD_STEPS[4])}
                                className="text-xs font-black text-slate-700 dark:text-slate-350 hover:text-blue-700 dark:hover:text-blue-400 flex items-center gap-1.5"
                            >
                                🌐 다국어 교육 & QR 확인 열기 <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>

                    {/* 7번 과업: 환경 설정 */}
                    <div className="psi-interactive-card p-4 flex flex-col justify-between bg-slate-50/35 dark:bg-slate-900/35">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-xs font-black text-slate-200">06</span>
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">시스템</span>
                            </div>
                            <div className="mt-3">
                                <h3 className="text-sm font-black text-slate-900 dark:text-slate-150">시스템 환경 설정</h3>
                                <p className="mt-1 text-[11px] font-medium text-slate-400 leading-4">현장 정보, 다국어 번역 언어, AI API 분석 키 및 대시보드 화면 구성을 원격 관리합니다.</p>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-350">⚙️ API 연동 설정</span>
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-355">🌐 다국어 언어</span>
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-350">🖥️ 사이드바 관리</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => openStep(BOARD_STEPS[6])}
                                className="text-xs font-black text-slate-700 dark:text-slate-350 hover:text-blue-700 dark:hover:text-blue-400 flex items-center gap-1"
                            >
                                ⚙️ 환경 및 구성 설정 관리 <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* 신규 브라우저 진입 안내 패널 */}
            {!workerRecords.length && (
                <section className="psi-industrial-panel border-dashed py-2.5 px-4 text-center bg-slate-50/20 mt-1 dark:bg-slate-900/10">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                        <div>
                            <h2 className="text-xs font-black text-slate-900 dark:text-slate-200 flex items-center gap-1.5">📢 현장 안전 기록 데이터 없음</h2>
                            <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                                첫 점검 기록(사진, PDF, 수기)을 등록하면 실시간 지표 분석 및 TBM 전파 자료 생성이 시작됩니다.
                            </p>
                        </div>
                        <button type="button" onClick={() => setCurrentPage('ocr-analysis')} className="min-h-[30px] rounded-lg bg-blue-700 hover:bg-blue-800 px-3 py-1 text-[11px] font-black text-white transition shrink-0 shadow-sm dark:bg-blue-600 dark:hover:bg-blue-700">
                            첫 안전점검 등록하기
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
};
