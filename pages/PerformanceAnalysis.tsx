
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkerRecord } from '../types';
import { MonthlyTrendChart } from '../components/charts/MonthlyTrendChart';
import { FieldRadarChart } from '../components/charts/FieldRadarChart';
import { SafetyGradeTrendChart } from '../components/charts/SafetyGradeTrendChart';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { NoticeCallout } from '../components/shared/NoticeCallout';
import { SummaryMetricGrid } from '../components/shared/SummaryMetricGrid';
import { BRAND_TONE } from '../utils/brandToneTokens';
import { createMetricSessionId, trackUIViewMetric } from '../utils/uiViewModeMetrics';
import { buildMonthlyTrendDashboards } from '../utils/reportBuilders';
import { useUiAudienceMode } from '../hooks/useUiAudienceMode';
import type { UiAudienceMode } from '../config/routeMeta';

interface PerformanceAnalysisProps {
    workerRecords: WorkerRecord[];
}

type PerformanceViewMode = 'full' | 'balanced' | 'essential';

// 관리 직군 필터링 함수 (실무 공종인 '시스템', '할석' 등은 제외되지 않도록 유지)
const isManagementRole = (field: string) => 
    /관리|팀장|부장|과장|기사|공무|소장/.test(field);

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

const PERFORMANCE_VIEW_MODE_STORAGE_KEY = 'psi_performance_view_mode';
const PERFORMANCE_VIEW_MODE_MANUAL_KEY = 'psi_performance_view_mode_manual';

const getStoredPerformanceViewMode = (): PerformanceViewMode | null => {
    if (typeof window === 'undefined') return null;
    try {
        const value = window.localStorage.getItem(PERFORMANCE_VIEW_MODE_STORAGE_KEY);
        if (value === 'full' || value === 'balanced' || value === 'essential') {
            return value;
        }
    } catch {
        return null;
    }
    return null;
};

const getStoredPerformanceViewModeManual = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(PERFORMANCE_VIEW_MODE_MANUAL_KEY) === 'true';
    } catch {
        return false;
    }
};

const getRecommendedPerformanceViewMode = (audience: UiAudienceMode, viewportWidth: number): PerformanceViewMode => {
    if (viewportWidth < 640) return 'essential';
    if (audience === 'worker') return 'essential';
    if (audience === 'developer') return 'full';
    return viewportWidth >= 1280 ? 'full' : 'balanced';
};

const getDefaultPerformanceViewMode = (viewportWidth: number): PerformanceViewMode => {
    if (viewportWidth < 640) return 'essential';
    if (viewportWidth >= 1280) return 'full';
    return 'balanced';
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

const calculateStandardDeviation = (scores: number[]) => {
    if (scores.length < 2) return 0;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    return Math.sqrt(variance);
};

const PerformanceAnalysis: React.FC<PerformanceAnalysisProps> = ({ workerRecords }) => {
    const uiAudienceMode = useUiAudienceMode();
    const [timeRange, setTimeRange] = useState('최근 6개월');
    const [compareMode, setCompareMode] = useState<'field' | 'team'>('field'); // New state for Radar Chart
    const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
    const [isViewModeManual, setIsViewModeManual] = useState<boolean>(() => getStoredPerformanceViewModeManual());
    const viewMetricSessionRef = useRef<string>(createMetricSessionId('performance-analysis'));
    const viewMetricStartRef = useRef<number>(Date.now());
    const prevTimeRangeRef = useRef<string>('최근 6개월');
    const prevCompareModeRef = useRef<'field' | 'team'>('field');
    const [viewMode, setViewMode] = useState<PerformanceViewMode>(() => {
        const storedMode = getStoredPerformanceViewMode();
        if (storedMode && getStoredPerformanceViewModeManual()) return storedMode;
        return getDefaultPerformanceViewMode(typeof window !== 'undefined' ? window.innerWidth : 1440);
    });

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(PERFORMANCE_VIEW_MODE_STORAGE_KEY, viewMode);
            window.localStorage.setItem(PERFORMANCE_VIEW_MODE_MANUAL_KEY, isViewModeManual ? 'true' : 'false');
        } catch {
            // ignore localStorage write failures
        }
    }, [viewMode, isViewModeManual]);

    useEffect(() => {
        if (isViewModeManual) return;
        setViewMode(getRecommendedPerformanceViewMode(uiAudienceMode, viewportWidth));
    }, [viewportWidth, isViewModeManual, uiAudienceMode]);

    useEffect(() => {
        trackUIViewMetric('view_enter', 'performance-analysis', viewMetricSessionRef.current, {
            viewMode,
            viewportWidth,
            audience: uiAudienceMode,
        });

        return () => {
            trackUIViewMetric('view_exit', 'performance-analysis', viewMetricSessionRef.current, {
                dwellMs: Date.now() - viewMetricStartRef.current,
            });
        };
    }, [uiAudienceMode]);

    useEffect(() => {
        if (prevTimeRangeRef.current === timeRange) return;
        trackUIViewMetric('control_change', 'performance-analysis', viewMetricSessionRef.current, {
            control: 'time_range',
            before: prevTimeRangeRef.current,
            after: timeRange,
            viewMode,
        });
        prevTimeRangeRef.current = timeRange;
    }, [timeRange, viewMode]);

    useEffect(() => {
        if (prevCompareModeRef.current === compareMode) return;
        trackUIViewMetric('control_change', 'performance-analysis', viewMetricSessionRef.current, {
            control: 'compare_mode',
            before: prevCompareModeRef.current,
            after: compareMode,
            viewMode,
        });
        prevCompareModeRef.current = compareMode;
    }, [compareMode, viewMode]);

    const handleViewModeChange = (mode: PerformanceViewMode) => {
        setIsViewModeManual(true);
        setViewMode(mode);
        trackUIViewMetric('view_mode_change', 'performance-analysis', viewMetricSessionRef.current, {
            mode,
            source: 'manual',
            viewportWidth,
            audience: uiAudienceMode,
        });
    };

    const handleTimeRangeChange = (range: string) => {
        setTimeRange(range);
        trackUIViewMetric('cta_click', 'performance-analysis', viewMetricSessionRef.current, {
            actionKey: 'time_range',
            range,
            viewMode,
        });
    };

    // 1. 순수 근로자 데이터만 추출
    const filteredBaseRecords = useMemo(() => 
        workerRecords.filter(r => !isManagementRole(r.jobField))
    , [workerRecords]);
    const harnessSummary = useMemo(() => summarizeHarnessRecords(filteredBaseRecords), [filteredBaseRecords]);
    const monthlyTrendDashboards = useMemo(() => buildMonthlyTrendDashboards(filteredBaseRecords), [filteredBaseRecords]);
    const latestMonthlyTrend = monthlyTrendDashboards[monthlyTrendDashboards.length - 1];

    const kpiData = useMemo(() => {
        if (filteredBaseRecords.length === 0) return null;
        
        const sorted = [...filteredBaseRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const monthlyAvgs = Object.entries(sorted.reduce((acc, r) => {
            const m = r.date.substring(0, 7);
            if (!acc[m]) acc[m] = [];
            acc[m].push(r.safetyScore);
            return acc;
        }, {} as Record<string, number[]>)).map(([m, scores]: [string, number[]]) => ({
            month: m,
            avg: scores.reduce((a, b) => a + b, 0) / scores.length
        })).sort((a, b) => a.month.localeCompare(b.month));

        const currentAvg = monthlyAvgs[monthlyAvgs.length - 1]?.avg || 0;
        const prevAvg = monthlyAvgs[monthlyAvgs.length - 2]?.avg || 0;
        const trend = currentAvg - prevAvg;

        const allScores = sorted.map(r => r.safetyScore);
        const volatility = calculateStandardDeviation(allScores);

        const fieldScores = filteredBaseRecords.reduce((acc, r) => {
            const field = r.jobField || '미분류';
            if (!acc[field]) acc[field] = [];
            acc[field].push(r.safetyScore);
            return acc;
        }, {} as Record<string, number[]>);
        
        const topField = Object.entries(fieldScores)
            .map(([f, s]: [string, number[]]) => ({ field: f, avg: s.reduce((a,b)=>a+b,0)/s.length }))
            .sort((a, b) => b.avg - a.avg)[0];

        return { currentAvg, trend, volatility, topField };
    }, [filteredBaseRecords]);

    const matrixData = useMemo(() => {
        const fields = Array.from(new Set(filteredBaseRecords.map(r => r.jobField || '미분류'))).sort();
        const uniqueMonths = Array.from(new Set(filteredBaseRecords.map(r => r.date.substring(0, 7)))).sort().slice(-6);
        
        return {
            fields,
            months: uniqueMonths,
            data: fields.map(field => {
                return {
                    field,
                    scores: uniqueMonths.map(month => {
                        const records = filteredBaseRecords.filter(r => (r.jobField || '미분류') === field && r.date.startsWith(month));
                        return records.length > 0 
                            ? records.reduce((a, b) => a + b.safetyScore, 0) / records.length 
                            : null;
                    })
                };
            })
        };
    }, [filteredBaseRecords]);

    const safetyHabitRanking = useMemo(() => {
        const workers = Array.from(new Set(filteredBaseRecords.map(r => r.name)));
        return workers.map(name => {
            const records = filteredBaseRecords.filter(r => r.name === name);
            const scores = records.map(r => r.safetyScore);
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            const stdDev = calculateStandardDeviation(scores);
            const safetyHabitIndex = avg / (1 + stdDev);
            return { name, jobField: records[0].jobField, avg, stdDev, count: records.length, safetyHabitIndex };
        })
        .filter(w => w.count >= 2)
        .sort((a, b) => b.safetyHabitIndex - a.safetyHabitIndex)
        .slice(0, 5);
    }, [filteredBaseRecords]);

    const riskKeywords = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredBaseRecords.flatMap(r => r.weakAreas).forEach(w => {
            const keyword = w.split(' ')[0]; // 첫 단어만 추출 (예: 추락, 감전)
            if(keyword.length > 1) counts[keyword] = (counts[keyword] || 0) + 1;
        });
        return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 15);
    }, [filteredBaseRecords]);

    const getScoreColorClass = (score: number | null) => {
        if (score === null) return 'bg-slate-100 text-slate-300';
        if (score >= 90) return 'bg-indigo-600 text-white shadow-indigo-300/50';
        if (score >= 80) return 'bg-blue-500 text-white shadow-blue-300/50';
        if (score >= 70) return 'bg-teal-400 text-white shadow-teal-300/50';
        if (score >= 60) return 'bg-amber-400 text-white shadow-amber-300/50';
        return 'bg-rose-500 text-white shadow-rose-300/50';
    };

    const performanceSummaryCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'performance-status',
            eyebrow: '지금 상태',
            title: `${filteredBaseRecords.length.toLocaleString()}건의 실무 근로자 성과 흐름을 분석 중입니다.`,
            description: `${timeRange} 기준으로 관리 직군을 제외한 실무 기록만 모아 변동성과 성장 흐름을 읽고 있습니다.`,
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'performance-evidence',
            eyebrow: '판단 근거',
            title: `평균 ${kpiData?.currentAvg.toFixed(1) || '-'}점 · 변동성 ${kpiData?.volatility.toFixed(1) || '-'} · 최우수 ${kpiData?.topField.field || '-'}`,
            description: '평균 점수, 일관성, 공종별 편차, 등급 분포, 위험 키워드를 함께 봐야 단순 점수보다 실제 현장 안정도를 더 정확히 읽을 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'performance-action',
            eyebrow: '다음 행동',
            title: compareMode === 'team' ? '팀 간 편차가 큰 구간부터 보완하세요.' : '공종(작업 종류) 간 차이가 큰 영역부터 확인하세요.',
            description: '성과가 낮은 공종(작업 종류)이나 팀을 찾았다면 보고서, 교육, 코칭 흐름과 연결해 왜 점수가 흔들리는지 설명 중심으로 보완할 수 있습니다.',
            tone: compareMode === 'team' ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
        },
    ], [compareMode, filteredBaseRecords.length, kpiData, timeRange]);

    const chartInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'chart-status',
            eyebrow: '지금 상태',
            title: '시계열, 역량 분포도, 히트맵, 등급 분포를 함께 읽는 구조입니다.',
            description: '한 차트만 보면 놓치는 흔들림을 여러 관점에서 동시에 확인하도록 배치했습니다.',
            tone: BRAND_TONE.slate,
        },
        {
            key: 'chart-evidence',
            eyebrow: '판단 근거',
            title: riskKeywords.length > 0 ? `${riskKeywords[0][0]} 등 주요 위험 키워드가 반복됩니다.` : '아직 위험 키워드 데이터가 충분하지 않습니다.',
            description: safetyHabitRanking.length > 0
                ? `상위 안전 습관 근로자 ${safetyHabitRanking.length}명과 반복 키워드를 함께 보면 좋은 사례와 보완 대상이 동시에 보입니다.`
                : '기복 없는 실천 사례가 충분히 쌓이면 상위 안전 습관자와 반복 위험 키워드를 함께 비교할 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'chart-action',
            eyebrow: '다음 행동',
            title: '좋은 습관은 확산하고 반복 위험은 선제 보완하세요.',
            description: '최우수 성과 공종과 상위 안전 실무자의 패턴을 교육·코칭 메시지로 전환하면 보호 중심 운영이 더 쉬워집니다.',
            tone: BRAND_TONE.amberSoft80,
        },
    ], [riskKeywords, safetyHabitRanking.length]);

    const harnessSummaryMetrics = useMemo(() => {
        const isDev = uiAudienceMode === 'developer';
        
        const metrics = [
            {
                key: 'performance-harness-connected',
                label: isDev ? '저장 연결' : '기록 연동 완료',
                value: `${harnessSummary.connected}명`,
                helper: isDev 
                    ? `run 연결 ${harnessSummary.runLinked}명 / 전체 ${harnessSummary.total}명` 
                    : `기록 연동 ${harnessSummary.connected}명 / 전체 ${harnessSummary.total}명`,
                tone: BRAND_TONE.emeraldSoft80,
                labelClassName: 'text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700',
                helperClassName: 'mt-1 text-xs font-bold text-emerald-700',
            },
            {
                key: 'performance-harness-backlog',
                label: isDev ? '검토 대기 항목' : '결재 대기 항목',
                value: `${harnessSummary.approvalBacklog}명`,
                helper: `재검토 필요 ${harnessSummary.reviewNeeded}명`,
                tone: harnessSummary.approvalBacklog > 0 ? 'border-amber-200 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-900/30' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800',
                labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-300'}`,
                helperClassName: `mt-1 text-xs font-bold ${harnessSummary.approvalBacklog > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}`,
            },
            {
                key: 'performance-harness-attention',
                label: '즉시 보호',
                value: `${harnessSummary.immediateAttention}명`,
                helper: '성과 편차보다 먼저 닫아야 할 보호 대상',
                tone: harnessSummary.immediateAttention > 0 ? 'border-rose-200 bg-rose-50/80' : 'border-indigo-200 bg-indigo-50/70',
                labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
                helperClassName: `mt-1 text-xs font-bold ${harnessSummary.immediateAttention > 0 ? 'text-rose-700' : 'text-indigo-700'}`,
            }
        ];

        if (isDev) {
            metrics.push({
                key: 'performance-harness-fallback',
                label: '저장 보완·대기',
                value: `${harnessSummary.fallback + harnessSummary.pending}명`,
                helper: `저장 보완 ${harnessSummary.fallback}명 · 대기 ${harnessSummary.pending}명`,
                tone: harnessSummary.fallback > 0 ? 'border-amber-200 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-900/30' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800',
                labelClassName: `text-[10px] font-black uppercase tracking-[0.18em] ${harnessSummary.fallback > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-300'}`,
                helperClassName: `mt-1 text-xs font-bold ${harnessSummary.fallback > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}`,
            });
        }

        return metrics;
    }, [harnessSummary, uiAudienceMode]);

    const isFullMode = uiAudienceMode !== 'worker' && viewMode === 'full';
    const isEssentialMode = viewMode === 'essential';
    const isEssentialMobile = isEssentialMode && viewportWidth < 640;

    return (
        <div className={`${isEssentialMobile ? 'space-y-4' : 'space-y-6 sm:space-y-8'} pb-10`}>
            <div className="relative bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full opacity-10 blur-2xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-indigo-600 font-bold tracking-wider text-xs uppercase block">Advanced Safety Analytics</span>
                            <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold uppercase tracking-tighter">* 관리 직군 제외됨</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">근로자 안전 성과 심층 분석</h2>
                        {!isEssentialMobile && (
                            <p className="text-slate-500 dark:text-slate-300 mt-2 max-w-xl leading-relaxed text-sm sm:text-base">
                                관리 직군을 제외한 실무 근로자 데이터를 바탕으로 변동성과 역량을 분석합니다. <br/>
                                <span className="font-bold text-indigo-600">시스템, 할석미장견출, 콘비팀</span> 등 모든 실무 공종의 데이터를 누락 없이 추적합니다.
                            </p>
                        )}
                    </div>
                    <div className="flex items-center bg-slate-50 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                        {['최근 3개월', '최근 6개월', '최근 1년'].map(range => (
                            <button 
                                key={range}
                                onClick={() => handleTimeRangeChange(range)}
                                className={`px-3 sm:px-4 py-2 text-xs font-bold rounded-md transition-all duration-200 ${timeRange === range ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'}`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>

                {uiAudienceMode !== 'worker' && (
                    <div className="relative z-10 mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">화면 구성 모드</p>
                            <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-200">
                                {viewMode === 'full' ? '현재 구성' : viewMode === 'balanced' ? '중간 구성' : '필수 구성'}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {([
                                { key: 'full', label: '현재 구성' },
                                { key: 'balanced', label: '중간 구성' },
                                { key: 'essential', label: '필수 구성' },
                            ] as Array<{ key: PerformanceViewMode; label: string }>).map((mode) => (
                                <button
                                    key={mode.key}
                                    type="button"
                                    onClick={() => handleViewModeChange(mode.key)}
                                    className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                        viewMode === mode.key
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {uiAudienceMode !== 'worker' && !isEssentialMode && (
                <InterpretationCardGrid
                    items={performanceSummaryCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            {uiAudienceMode !== 'worker' && (
                <SummaryMetricGrid
                    items={harnessSummaryMetrics}
                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            )}

            {uiAudienceMode !== 'worker' && (harnessSummary.immediateAttention > 0 || harnessSummary.approvalBacklog > 0 || (uiAudienceMode === 'developer' && harnessSummary.fallback > 0)) && (
                <NoticeCallout
                    variant={harnessSummary.immediateAttention > 0 ? 'rose' : (harnessSummary.fallback > 0 && uiAudienceMode === 'developer') ? 'amber' : 'indigo'}
                    eyebrow="우선 점검 항목"
                    title={harnessSummary.immediateAttention > 0
                        ? `성과 해석 전에 즉시 관찰 보호 대상 ${harnessSummary.immediateAttention}명을 먼저 조치해야 합니다.`
                        : (uiAudienceMode === 'developer' && harnessSummary.fallback > 0)
                            ? `안전 기록 저장 연결 보완 ${harnessSummary.fallback}명이 있어 성과 데이터와 저장 연결 상태를 함께 확인해야 합니다.`
                            : `결재 대기 항목이 ${harnessSummary.approvalBacklog}명이 남아 있어 점수 비교 전에 결재 검토 순서를 먼저 정리해야 합니다.`}
                    description={uiAudienceMode === 'developer'
                        ? "성과 분석은 추세를 읽는 화면이지만, 현재 보호 흐름이 끊긴 인원이 있으면 평균과 변동성보다 먼저 안전 기록 승인·저장 상태를 확인해야 운영 판단이 어긋나지 않습니다."
                        : "성과 분석은 추세를 읽는 화면이지만, 현재 보호 흐름이 끊긴 인원이 있으면 평균과 변동성보다 먼저 안전 기록 결재·기록 연동 상태를 확인해야 운영 판단이 어긋나지 않습니다."}
                    className="rounded-2xl border px-4 py-3 shadow-sm"
                    bodyClassName="block"
                    titleClassName="text-sm font-black"
                    descriptionClassName="mt-1 text-xs font-semibold leading-relaxed"
                />
            )}

            {uiAudienceMode !== 'worker' && (
                <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-blue-700">MonthlyTrendDashboard</p><h3 className="mt-1 text-lg font-black text-slate-900">월별 개선 추적 요약</h3></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">{latestMonthlyTrend?.month || '분석 대기'}</span></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold text-slate-500">월 평균 점수</p><p className="mt-1 text-2xl font-black">{latestMonthlyTrend?.averageScore ?? 0}</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold text-slate-500">개선이행률</p><p className="mt-1 text-2xl font-black text-emerald-700">{latestMonthlyTrend?.improvementExecutionRate ?? 0}%</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold text-slate-500">반복지적 건수</p><p className="mt-1 text-2xl font-black text-orange-700">{latestMonthlyTrend?.repeatedIssueCount ?? 0}건</p></div></div>
                    <p className="mt-3 text-sm font-bold text-slate-600">다음 교육 반영: {latestMonthlyTrend?.nextEducationFocus.join(' · ') || '월별 분석 데이터가 쌓이면 자동 제안됩니다.'}</p>
                </section>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        {kpiData && (
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${kpiData.trend >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {kpiData.trend >= 0 ? '+' : ''}{kpiData.trend.toFixed(1)} vs 지난달
                            </span>
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-300">종합 응답품질 신호</p>
                        <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{kpiData?.currentAvg.toFixed(1) || '-'}</h3>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">{uiAudienceMode === 'developer' ? 'Consistency' : '일관성'}</p>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-300">안전 일관성 (표준편차)</p>
                        <div className="flex items-baseline gap-2 mt-1">
                            <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">{kpiData?.volatility.toFixed(1) || '-'}</h3>
                            <span className="text-xs text-slate-400 dark:text-slate-500">낮을수록 안정적</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 text-teal-600 border-t-4 border-t-teal-500">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-teal-50 text-teal-600 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-300">최우수 성과 공종</p>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1 truncate">{kpiData?.topField.field || '-'}</h3>
                        <p className="text-sm text-teal-600 font-bold mt-1">Avg. {kpiData?.topField.avg.toFixed(1)}점</p>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-white/10 text-white rounded-xl backdrop-blur-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-400">분석 대상 기록 수</p>
                        <h3 className="text-3xl font-black mt-1">{filteredBaseRecords.length.toLocaleString()} <span className="text-lg font-normal text-slate-400">건</span></h3>
                    </div>
                </div>
            </div>

            {uiAudienceMode === 'worker' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                    <div className="bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">현장 안전 성과 추이</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">핵심 추세만 빠르게 확인합니다.</p>
                            </div>
                        </div>
                        <div className="h-80 w-full">
                            <MonthlyTrendChart records={filteredBaseRecords} />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">현장 확인단계 분포 변화 (6개월)</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">월별 근로자 확인단계 구성 비율의 변화를 추적합니다.</p>
                            </div>
                        </div>
                        <div className="h-80 w-full">
                            <SafetyGradeTrendChart records={filteredBaseRecords} />
                        </div>
                    </div>
                </div>
            ) : isEssentialMode ? (
                <div className="bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">현장 안전 성과 추이</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">핵심 추세만 빠르게 확인합니다.</p>
                        </div>
                    </div>
                    <div className="h-72 w-full">
                        <MonthlyTrendChart records={filteredBaseRecords} />
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                    <div className="lg:col-span-3">
                        <InterpretationCardGrid
                            items={chartInterpretationCards}
                            cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                        />
                    </div>
                    <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">현장 안전 성과 추이</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">전체 근로자의 안전 수준 변화를 시계열로 추적합니다.</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                <span className="text-slate-600 dark:text-slate-300">근로자 평균</span>
                            </div>
                        </div>
                        <div className="h-80 w-full">
                            <MonthlyTrendChart records={filteredBaseRecords} />
                        </div>
                    </div>

                    <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">역량 비교 분석</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">공종별 또는 팀별로 세분화하여 역량을 비교합니다.</p>
                        </div>

                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg mb-4">
                            <button
                                onClick={() => setCompareMode('field')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${compareMode === 'field' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'}`}
                            >
                                공종별 비교
                            </button>
                            <button
                                onClick={() => setCompareMode('team')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${compareMode === 'team' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'}`}
                            >
                                팀 단위 비교
                            </button>
                        </div>

                        <div className="flex-1 flex items-center justify-center relative">
                            <div className="w-full h-64">
                                <FieldRadarChart records={filteredBaseRecords} mode={compareMode} />
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-2">지표 설명</h4>
                            <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-300">
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> 평균 점수: 높을수록 안전 역량 우수</li>
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-teal-500"></div> 일관성: 점수 편차가 적을수록 우수</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {isFullMode && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
                <div className="xl:col-span-2 bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        공종별 성과 히트맵 (실무 공종 전체)
                    </h3>
                    <div className="overflow-x-auto">
                        <div className="min-w-[600px]">
                            <div className="grid grid-flow-col auto-cols-fr gap-2 mb-2">
                                <div className="w-32 font-bold text-xs text-slate-400 uppercase tracking-wider text-left py-2">공종 \ 월</div>
                                {matrixData.months.map(m => (
                                    <div key={m} className="font-bold text-sm text-slate-600 dark:text-slate-200 text-center py-2 bg-slate-50 dark:bg-slate-900 rounded-lg">{m.substring(5)}월</div>
                                ))}
                            </div>
                            <div className="space-y-2">
                                {matrixData.data.map(row => (
                                    <div key={row.field} className="grid grid-flow-col auto-cols-fr gap-2 items-center group">
                                        <div className="w-32 font-bold text-slate-700 dark:text-slate-200 text-sm truncate pr-2" title={row.field}>{row.field}</div>
                                        {row.scores.map((score, idx) => (
                                            <div key={idx} className="relative h-12 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-105 cursor-default group/cell">
                                                <div className={`absolute inset-0 rounded-lg opacity-90 ${getScoreColorClass(score)}`}></div>
                                                <span className={`relative z-10 font-bold text-sm ${score === null ? 'text-slate-300' : 'text-white'}`}>
                                                    {score !== null ? score.toFixed(0) : '-'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-1 bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6">최우수 안전 실무자</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-300 mb-4">
                        기복 없는 안전 실천 능력을 보여준 상위 근로자입니다. (관리 직군 제외)
                    </p>
                    <div className="space-y-4">
                        {safetyHabitRanking.length > 0 ? safetyHabitRanking.map((worker, idx) => (
                            <div key={worker.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-yellow-400 shadow-md' : 'bg-slate-300'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{worker.name}</p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{worker.jobField} | 평균 {worker.avg.toFixed(0)}점</p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-xs font-bold text-indigo-600">{worker.safetyHabitIndex.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500">습관 지수</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center text-slate-400 dark:text-slate-500 py-10 text-sm">분석 데이터가 부족합니다.</div>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* NEW SECTION: Bottom Infographics to utilize whitespace */}
            {isFullMode && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                    <div className="mb-6 flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">현장 확인단계 분포 변화 (6개월)</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">월별 근로자 확인단계 구성 비율의 변화를 추적합니다. 추가 확인 구간 감소가 목표입니다.</p>
                        </div>
                        <div className="flex gap-3 text-xs font-bold">
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>고급</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded-sm"></div>중급</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div>초급</span>
                        </div>
                    </div>
                    <div className="h-64 w-full">
                        <SafetyGradeTrendChart records={filteredBaseRecords} />
                    </div>
                </div>
                <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 flex flex-col">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6">주요 위험 키워드 클라우드</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-300 mb-4">최근 분석된 기록에서 가장 빈번하게 등장한 위험 요인입니다.</p>
                    <div className="flex-1 flex flex-wrap content-start gap-2">
                        {riskKeywords.map(([word, count], i) => (
                            <span 
                                key={word} 
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-all hover:scale-105 cursor-default
                                    ${i < 3 ? 'bg-rose-100 text-rose-700 text-lg border border-rose-200' : 
                                      i < 7 ? 'bg-orange-50 text-orange-600 border border-orange-100' : 
                                      'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-300 border border-slate-100 dark:border-slate-700 text-xs'}`}
                            >
                                {word} <span className="opacity-50 text-[0.8em] ml-1">{count}</span>
                            </span>
                        ))}
                        {riskKeywords.length === 0 && (
                            <div className="w-full text-center text-slate-400 dark:text-slate-500 text-sm py-10">데이터가 없습니다.</div>
                        )}
                    </div>
                </div>
            </div>
            )}
        </div>
    );
};

export default PerformanceAnalysis;
