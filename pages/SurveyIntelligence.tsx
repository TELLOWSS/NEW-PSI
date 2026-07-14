/**
 * 설문 인텔리전스 대시보드
 * ─────────────────────────────────────────────────────────────────────────────
 * 지표 1 : 근로자 체감 위험도 갭 차트  (Risk Perception Gap Analysis)
 * 지표 2 : 공종별 실질 위협 트렌드      (Risk Ontology Trend)
 * 지표 3 : 자기규율 약속 구체성 지수   (Self-Discipline Specificity Score)
 * ─────────────────────────────────────────────────────────────────────────────
 * 데이터 소스 : WorkerRecord.handwrittenAnswers (questionNumber 1~5)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip, Legend,
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    BarChart, Bar, ReferenceLine,
} from 'recharts';
import type { WorkerRecord } from '../types';
import {
    buildSurveyRiskGapRows,
    formatSurveyMonth,
    formatSurveyMonthShort,
    getManagerRiskBaselineKey,
    getRecordMonthKey,
    getRiskGapDirectionLabel,
    getRiskGapStatusLabel,
    getTopComparableGap,
    getWorkerRiskLevel,
    MIN_COMPARABLE_SAMPLE,
    MANAGER_BASELINE_RULE_VERSION,
    readManagerRiskBaselineHistory,
    readManagerRiskBaselines,
    riskLevelToScore,
    writeManagerRiskBaselines,
    type ManagerRiskBaselineBasis,
    type ManagerRiskBaselineHistoryEntry,
    type ManagerRiskBaselineMap,
    type SurveyRiskGapRow,
    type SurveyRiskLevel,
} from '../utils/surveyRiskGap';
import { normalizeDashboardTrade } from '../utils/dashboardDataTransformer';
import {
    deleteSurveyRiskBaseline,
    loadSurveyRiskBaselineHistory,
    loadSurveyRiskBaselines,
    persistSurveyRiskBaseline,
    persistSurveyRiskBaselines,
    type SurveyRiskBaselineStorageMode,
} from '../services/surveyRiskBaselineService';
import {
    buildTradeWorkerRiskReference,
    getManagerWorkerComparisonAction,
    getPreviousMonthKey,
    getTradeDecisionCues,
    previewManagerWorkerRiskGap,
    recommendManagerRiskLevel,
    type BaselineControl,
    type BaselineExposure,
    type BaselineSeverity,
    type ManagerBaselineWizardAnswers,
} from '../utils/managerRiskBaselineWizard';

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface Props {
    workerRecords: WorkerRecord[];
}

// ─── 위험어 사전 ──────────────────────────────────────────────────────────────
const RISK_KEYWORDS: string[] = [
    '추락', '끼임', '충돌', '감전', '낙하', '전도', '화재', '폭발', '협착', '질식',
    '절단', '비래', '붕괴', '익수', '중독', '골절', '화상', '과부하', '소음', '진동',
];

const TRADE_COLORS: Record<string, string> = {
    '골조': '#6366f1',
    '철근': '#f59e0b',
    '형틀': '#10b981',
    '배관': '#3b82f6',
    '전기': '#f97316',
    '미장': '#8b5cf6',
    '시스템': '#ec4899',
    '기타': '#94a3b8',
};
const tradeColor = (trade: string) => TRADE_COLORS[trade] ?? '#94a3b8';
const QUERY_TRADE_KEY = 'siTrade';
const QUERY_MONTH_KEY = 'siMonth';
const ALL_TRADES = '전체 공종';
const ALL_MONTHS = '전체 월';
const BASELINE_TRADE_OPTIONS = [
    '형틀',
    '철근',
    '갱폼',
    '알폼',
    '시스템',
    '바닥미장',
    '할석미장견출',
    '해체정리',
    '직영',
    '용역',
    '콘크리트비계',
];
const SEVERITY_OPTIONS: Array<{ value: BaselineSeverity; label: string; description: string }> = [
    { value: 'minor', label: '경미', description: '응급처치 수준' },
    { value: 'serious', label: '중대', description: '치료·휴업 가능' },
    { value: 'fatal', label: '치명', description: '사망·다수 부상 가능' },
];
const EXPOSURE_OPTIONS: Array<{ value: BaselineExposure; label: string; description: string }> = [
    { value: 'rare', label: '드묾', description: '예외적·월 1회 이하' },
    { value: 'repeated', label: '반복', description: '주기적·매일 일부' },
    { value: 'continuous', label: '상시', description: '대부분 시간·다수 인원' },
];
const CONTROL_OPTIONS: Array<{ value: BaselineControl; label: string; description: string }> = [
    { value: 'controlled', label: '충분', description: '설치·작동 확인' },
    { value: 'partial', label: '일부', description: '누락·추가 확인 필요' },
    { value: 'weak', label: '미흡', description: '없음·작동 불확실' },
];
const BASELINE_SOURCE_LABELS: Record<ManagerRiskBaselineBasis['source'], string> = {
    wizard: '3문항 빠른 판정',
    manual: '관리자 직접 선택',
    'previous-month': '전월 기준 복사',
};
const formatBaselineAuditTime = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};
const getCurrentAdminActorName = (): string => {
    try {
        if (typeof window === 'undefined') return '관리자';
        const raw = window.localStorage.getItem('psi_app_settings');
        if (!raw) return '관리자';
        const parsed = JSON.parse(raw) as { siteManager?: unknown };
        return String(parsed.siteManager || '').trim().slice(0, 80) || '관리자';
    } catch {
        return '관리자';
    }
};
const normalizeSurveyTrade = (trade: string | undefined | null): string => normalizeDashboardTrade(trade) || '기타';
const getCurrentMonthKey = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const specificityScore = (text: string): number => {
    if (!text || text.trim().length < 4) return 0;
    const t = text.trim();
    // 구체적 행동(시간/조건+동사) → 5점, 부분 구체 → 3점, 상투적 → 1점
    const highSpecific = /매일|항상|출근|작업 전|사용 전|확인하겠|착용하겠|실시하겠|점검하겠|체결하겠|신고하겠/;
    const midSpecific =  /안전|조심|주의|확인|착용|점검|벨트|안전모|장갑|안전화/;
    if (highSpecific.test(t) && t.length > 10) return 5;
    if (highSpecific.test(t)) return 4;
    if (midSpecific.test(t) && t.length > 8) return 3;
    if (midSpecific.test(t)) return 2;
    return 1;
};

// ─── 데이터 처리 훅 ───────────────────────────────────────────────────────────
function useSurveyData(records: WorkerRecord[], managerBaselines: ManagerRiskBaselineMap) {
    return useMemo(() => {
        const hasData = records.some(r => (r.handwrittenAnswers || []).length > 0);

        if (!hasData) {
            return {
                isDemo: false,
                gapData: [] as SurveyRiskGapRow[],
                radarData: [] as Array<{ trade: string; A: number; B: number }>,
                keywordTrend: [] as Array<Record<string, number | string>>,
                wordData: [] as Array<{ word: string; count: number }>,
                specificityTrend: [] as Array<Record<string, number | string>>,
                specificityTrades: [] as string[],
                topGapTrade: '-',
                topGapScore: null as number | null,
                topGapDirection: '비교 가능한 관리자 기준이 없습니다.',
                gapAvailabilityLabel: '기준 미등록',
                gapAvailabilityDescription: '월·공종별 관리자 기준을 등록해 주세요.',
                comparableResponseCount: 0,
                totalRiskResponseCount: 0,
                baselineCoverage: 0,
                avgSpecificityLatest: 0,
                avgSpecificityPrev: 0,
                latestTopKeyword: '-',
                latestTopKeywordDelta: 0,
            };
        }

        // ── 실데이터 처리 ──────────────────────────────────────────────────────

        // 공종 목록
        const trades = Array.from(new Set(records.map(r => normalizeSurveyTrade(r.jobField))));

        // 월 추출
        const months = Array.from(new Set(records.map(r => getRecordMonthKey(r.date)).filter(Boolean) as string[]))
            .sort((left, right) => left.localeCompare(right))
            .slice(-6);

        // ── 지표 1: 갭 분석 ─────────────────────────────────────────────────
        const gapData = buildSurveyRiskGapRows(records, managerBaselines, normalizeSurveyTrade);
        const radarData = gapData
            .filter(row => row.managerScore !== null && row.workerScore !== null)
            .map(row => ({ trade: row.trade, A: row.managerScore as number, B: row.workerScore as number }));

        // ── 지표 2: 키워드 트렌드 ────────────────────────────────────────────
        const keywordTrend = months.map(month => {
            const monthRecords = records.filter(r => {
                return getRecordMonthKey(r.date) === month;
            });
            const texts = monthRecords.flatMap(r =>
                (r.handwrittenAnswers || [])
                    .filter(a => a.questionNumber === '1' || a.questionNumber === '2')
                    .map(a => a.koreanTranslation || a.answerText)
            ).join(' ');
            const obj: Record<string, number | string> = { month: formatSurveyMonthShort(month) };
            RISK_KEYWORDS.slice(0, 4).forEach(kw => {
                obj[kw] = (texts.match(new RegExp(kw, 'g')) || []).length;
            });
            return obj;
        });

        const allTexts = records.flatMap(r =>
            (r.handwrittenAnswers || [])
                .filter(a => a.questionNumber === '1' || a.questionNumber === '2')
                .map(a => a.koreanTranslation || a.answerText)
        ).join(' ');
        const wordData = RISK_KEYWORDS.map(kw => ({
            word: kw,
            count: (allTexts.match(new RegExp(kw, 'g')) || []).length,
        })).filter(w => w.count > 0).sort((a, b) => b.count - a.count);

        // ── 지표 3: 구체성 점수 추세 ─────────────────────────────────────────
        const topTrades = trades.slice(0, 3);
        const specificityTrend = months.map(month => {
            const obj: Record<string, number | string> = { month: formatSurveyMonthShort(month) };
            topTrades.forEach(trade => {
                const recs = records.filter(r => {
                    return normalizeSurveyTrade(r.jobField) === trade && getRecordMonthKey(r.date) === month;
                });
                const scores = recs.flatMap(r =>
                    (r.handwrittenAnswers || [])
                        .filter(a => ['4', '5', 'Q4', 'Q5'].includes(a.questionNumber))
                        .map(a => specificityScore(a.koreanTranslation || a.answerText))
                );
                obj[trade] = scores.length > 0
                    ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
                    : 0;
            });
            return obj;
        });

        const latest = specificityTrend[specificityTrend.length - 1] ?? {};
        const prev = specificityTrend[specificityTrend.length - 2] ?? {};
        const latestAvg = topTrades.reduce((s, t) => s + ((latest[t] as number) || 0), 0) / (topTrades.length || 1);
        const prevAvg = topTrades.reduce((s, t) => s + ((prev[t] as number) || 0), 0) / (topTrades.length || 1);

        const topGap = getTopComparableGap(gapData);
        const hasLowSample = gapData.some(row => row.status === 'low-sample');
        const comparableResponseCount = gapData.reduce((sum, row) => sum + row.comparableCount, 0);
        const totalRiskResponseCount = gapData.reduce((sum, row) => sum + row.workerResponseCount, 0);
        const latestKwCounts = RISK_KEYWORDS.slice(0, 4).map(kw => ({
            kw,
            cur: (keywordTrend[keywordTrend.length - 1]?.[kw] as number) || 0,
            prev: (keywordTrend[keywordTrend.length - 2]?.[kw] as number) || 0,
        })).sort((a, b) => b.cur - a.cur)[0] ?? { kw: '-', cur: 0, prev: 0 };

        return {
            isDemo: false,
            gapData,
            radarData,
            keywordTrend,
            wordData,
            specificityTrend,
            specificityTrades: topTrades,
            topGapTrade: topGap?.trade ?? '-',
            topGapScore: topGap?.absoluteGap ?? null,
            topGapDirection: topGap ? getRiskGapDirectionLabel(topGap.direction) : '비교 가능한 관리자 기준이 없습니다.',
            gapAvailabilityLabel: hasLowSample ? '표본 부족' : '기준 미등록',
            gapAvailabilityDescription: hasLowSample
                ? `공종별 비교 표본이 ${MIN_COMPARABLE_SAMPLE}건 이상 쌓이면 우선 공종을 판정합니다.`
                : '월·공종별 관리자 기준을 등록해 주세요.',
            comparableResponseCount,
            totalRiskResponseCount,
            baselineCoverage: totalRiskResponseCount > 0
                ? Math.round((comparableResponseCount / totalRiskResponseCount) * 100)
                : 0,
            avgSpecificityLatest: Math.round(latestAvg * 10) / 10,
            avgSpecificityPrev: Math.round(prevAvg * 10) / 10,
            latestTopKeyword: latestKwCounts.kw,
            latestTopKeywordDelta: latestKwCounts.prev > 0
                ? Math.round((latestKwCounts.cur - latestKwCounts.prev) / latestKwCounts.prev * 100)
                : 0,
        };
    }, [records, managerBaselines]);
}

// ─── 공통 UI 컴포넌트 ──────────────────────────────────────────────────────────
const SectionCard: React.FC<{
    title: string;
    subtitle: string;
    badge: string;
    badgeColor: string;
    children: React.ReactNode;
    actionLabel?: string;
    actionDesc?: string;
}> = ({ title, subtitle, badge, badgeColor, children, actionLabel, actionDesc }) => (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* 상단 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-4">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeColor}`}>
                        {badge}
                    </span>
                </div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">{title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
            </div>
        </div>

        {/* 차트 영역 */}
        <div className="p-6">{children}</div>

        {/* 하단 액션 인사이트 */}
        {actionLabel && (
            <div className="px-6 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-800/30 flex items-start gap-3">
                <svg className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div>
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{actionLabel}: </span>
                    <span className="text-xs text-indigo-600 dark:text-indigo-400">{actionDesc}</span>
                </div>
            </div>
        )}
    </div>
);

const KpiCard: React.FC<{
    label: string; value: string; sub: string; delta?: number; color: string;
}> = ({ label, value, sub, delta, color }) => (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${color}`}>
        <span className="text-xs font-semibold opacity-70">{label}</span>
        <span className="text-2xl font-black">{value}</span>
        <span className="text-xs opacity-60">{sub}</span>
        {delta !== undefined && (
            <span className={`text-xs font-bold ${delta > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {delta > 0 ? `▲ ${delta}%` : `▼ ${Math.abs(delta)}%`} 전월 대비
            </span>
        )}
    </div>
);

// ─── 워드클라우드 시뮬레이션 ──────────────────────────────────────────────────
const WordCloudSimulated: React.FC<{ data: { word: string; count: number }[] }> = ({ data }) => {
    const max = data[0]?.count || 1;
    const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899'];
    return (
        <div className="flex flex-wrap gap-2 items-center justify-center py-4 min-h-[140px]">
            {data.slice(0, 15).map((item, i) => {
                const ratio = item.count / max;
                const size = 12 + Math.round(ratio * 24);
                return (
                    <span
                        key={item.word}
                        className="font-black rounded-lg px-2 py-0.5 transition-transform hover:scale-110 cursor-default select-none"
                        style={{
                            fontSize: `${size}px`,
                            color: COLORS[i % COLORS.length],
                            opacity: 0.5 + ratio * 0.5,
                        }}
                        title={`언급 ${item.count}회`}
                    >
                        {item.word}
                    </span>
                );
            })}
        </div>
    );
};

// ─── 커스텀 툴팁 ──────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900/95 text-white text-xs rounded-xl shadow-2xl p-3 border border-white/10 min-w-[140px]">
            <p className="font-bold mb-1 text-indigo-300">{label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex justify-between gap-4">
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span className="font-bold">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
                </div>
            ))}
        </div>
    );
};

const gapStatusClass = (status: SurveyRiskGapRow['status']): string => {
    if (status === 'urgent') return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
    if (status === 'attention') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    if (status === 'aligned') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
};

const gapValueClass = (row: SurveyRiskGapRow): string => {
    if (row.status === 'urgent') return 'text-rose-600';
    if (row.status === 'attention') return 'text-amber-600';
    if (row.status === 'aligned') return 'text-emerald-600';
    return 'text-slate-400';
};

const formatGapScore = (value: number | null): string => value === null ? '-' : `${value > 0 ? '+' : ''}${value}pt`;
const formatRiskScore = (value: number | null): string => value === null ? '-' : `${value}점`;

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const SurveyIntelligence: React.FC<Props> = ({ workerRecords }) => {
    const [selectedTrade, setSelectedTrade] = useState<string>(() => {
        if (typeof window === 'undefined') return ALL_TRADES;
        return new URLSearchParams(window.location.search).get(QUERY_TRADE_KEY) || ALL_TRADES;
    });
    const [selectedMonth, setSelectedMonth] = useState<string>(() => {
        if (typeof window === 'undefined') return ALL_MONTHS;
        return new URLSearchParams(window.location.search).get(QUERY_MONTH_KEY) || ALL_MONTHS;
    });
    const [managerBaselines, setManagerBaselines] = useState<ManagerRiskBaselineMap>(() => readManagerRiskBaselines());
    const [baselineStorageMode, setBaselineStorageMode] = useState<SurveyRiskBaselineStorageMode | 'loading'>('loading');
    const [baselineStorageWarning, setBaselineStorageWarning] = useState('');
    const [savingBaselineKey, setSavingBaselineKey] = useState('');
    const [wizardTrade, setWizardTrade] = useState('');
    const [wizardAnswers, setWizardAnswers] = useState<ManagerBaselineWizardAnswers>({});
    const [wizardReason, setWizardReason] = useState('');
    const [baselineHistory, setBaselineHistory] = useState<ManagerRiskBaselineHistoryEntry[]>([]);
    const [baselineHistoryWarning, setBaselineHistoryWarning] = useState('');
    const [isCopyingPreviousMonth, setIsCopyingPreviousMonth] = useState(false);
    const [baselineListMode, setBaselineListMode] = useState<'pending' | 'all'>('pending');
    const [activeKeywords] = useState<string[]>(['추락', '끼임', '감전', '충돌']);
    const currentAdminActor = useMemo(() => getCurrentAdminActorName(), []);

    const monthOptions = useMemo(() => {
        const months = Array.from(new Set([
            getCurrentMonthKey(),
            ...(workerRecords.map(record => getRecordMonthKey(record.date)).filter(Boolean) as string[]),
        ])).sort((left, right) => right.localeCompare(left));
        return [ALL_MONTHS, ...months];
    }, [workerRecords]);

    const tradeOptions = useMemo(() => {
        const trades = Array.from(new Set([
            ...BASELINE_TRADE_OPTIONS,
            ...workerRecords.map((record) => normalizeSurveyTrade(record.jobField)),
        ])).sort();
        return [ALL_TRADES, ...trades];
    }, [workerRecords]);

    useEffect(() => {
        let cancelled = false;

        void loadSurveyRiskBaselines().then((result) => {
            if (cancelled) return;
            setManagerBaselines(result.baselines);
            setBaselineStorageMode(result.mode);
            setBaselineStorageWarning(result.warning || '');
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!tradeOptions.includes(selectedTrade)) {
            setSelectedTrade(ALL_TRADES);
        }
    }, [tradeOptions, selectedTrade]);

    useEffect(() => {
        if (!monthOptions.includes(selectedMonth)) {
            setSelectedMonth(ALL_MONTHS);
        }
    }, [monthOptions, selectedMonth]);

    useEffect(() => {
        let cancelled = false;
        if (selectedMonth === ALL_MONTHS) {
            setBaselineHistory([]);
            setBaselineHistoryWarning('');
            return () => {
                cancelled = true;
            };
        }

        void loadSurveyRiskBaselineHistory(selectedMonth).then((result) => {
            if (cancelled) return;
            setBaselineHistory(result.items);
            setBaselineHistoryWarning(result.warning || '');
        });
        return () => {
            cancelled = true;
        };
    }, [selectedMonth]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const currentUrl = new URL(window.location.href);
        if (selectedTrade === ALL_TRADES) currentUrl.searchParams.delete(QUERY_TRADE_KEY);
        else currentUrl.searchParams.set(QUERY_TRADE_KEY, selectedTrade);

        if (selectedMonth === ALL_MONTHS) currentUrl.searchParams.delete(QUERY_MONTH_KEY);
        else currentUrl.searchParams.set(QUERY_MONTH_KEY, selectedMonth);

        const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
        window.history.replaceState(null, '', nextUrl);
    }, [selectedTrade, selectedMonth]);

    const filteredRecords = useMemo(() => {
        return workerRecords.filter((record) => {
            const trade = normalizeSurveyTrade(record.jobField);
            const month = getRecordMonthKey(record.date);
            const tradeMatch = selectedTrade === ALL_TRADES || trade === selectedTrade;
            const monthMatch = selectedMonth === ALL_MONTHS || month === selectedMonth;
            return tradeMatch && monthMatch;
        });
    }, [workerRecords, selectedTrade, selectedMonth]);

    const baselineTradeOptions = useMemo(() => {
        const sourceTrades = selectedTrade === ALL_TRADES
            ? BASELINE_TRADE_OPTIONS
            : [selectedTrade];
        return Array.from(new Set([
            ...sourceTrades,
            ...filteredRecords.map(record => normalizeSurveyTrade(record.jobField)),
        ])).sort();
    }, [filteredRecords, selectedTrade]);

    const selectedMonthRecords = useMemo(() => (
        workerRecords.filter((record) => getRecordMonthKey(record.date) === selectedMonth)
    ), [selectedMonth, workerRecords]);

    const selectedMonthRecordsByTrade = useMemo(() => {
        const recordsByTrade = new Map<string, WorkerRecord[]>();
        selectedMonthRecords.forEach((record) => {
            const trade = normalizeSurveyTrade(record.jobField);
            const tradeRecords = recordsByTrade.get(trade) || [];
            tradeRecords.push(record);
            recordsByTrade.set(trade, tradeRecords);
        });
        return recordsByTrade;
    }, [selectedMonthRecords]);

    const previousMonthKey = useMemo(
        () => selectedMonth === ALL_MONTHS ? '' : getPreviousMonthKey(selectedMonth),
        [selectedMonth],
    );

    const baselineProgress = useMemo(() => {
        const registered = baselineTradeOptions.filter((trade) => (
            Boolean(managerBaselines[getManagerRiskBaselineKey(selectedMonth, trade)])
        )).length;
        return {
            registered,
            total: baselineTradeOptions.length,
            remaining: Math.max(0, baselineTradeOptions.length - registered),
        };
    }, [baselineTradeOptions, managerBaselines, selectedMonth]);

    const baselineRegistrationQueue = useMemo(() => (
        baselineTradeOptions
            .map((trade) => ({
                trade,
                registered: Boolean(managerBaselines[getManagerRiskBaselineKey(selectedMonth, trade)]),
                responseCount: buildTradeWorkerRiskReference(selectedMonthRecordsByTrade.get(trade) || []).responseCount,
            }))
            .sort((left, right) => (
                Number(left.registered) - Number(right.registered)
                || right.responseCount - left.responseCount
                || left.trade.localeCompare(right.trade)
            ))
    ), [baselineTradeOptions, managerBaselines, selectedMonth, selectedMonthRecordsByTrade]);

    const nextBaselineTrade = baselineRegistrationQueue.find((item) => !item.registered)
        || baselineRegistrationQueue[0];

    const visibleBaselineTrades = useMemo(() => (
        baselineListMode === 'pending'
            ? baselineRegistrationQueue.filter((item) => !item.registered).map((item) => item.trade)
            : baselineRegistrationQueue.map((item) => item.trade)
    ), [baselineListMode, baselineRegistrationQueue]);

    const previousMonthCopyCandidates = useMemo(() => (
        baselineTradeOptions
            .map((trade) => ({
                trade,
                previous: managerBaselines[getManagerRiskBaselineKey(previousMonthKey, trade)],
                current: managerBaselines[getManagerRiskBaselineKey(selectedMonth, trade)],
            }))
            .filter((item) => item.previous && !item.current)
    ), [baselineTradeOptions, managerBaselines, previousMonthKey, selectedMonth]);

    const wizardRecommendation = useMemo(
        () => recommendManagerRiskLevel(wizardAnswers),
        [wizardAnswers],
    );

    const wizardTradeRecords = useMemo(
        () => selectedMonthRecordsByTrade.get(wizardTrade) || [],
        [selectedMonthRecordsByTrade, wizardTrade],
    );

    const wizardWorkerReference = useMemo(
        () => buildTradeWorkerRiskReference(wizardTradeRecords),
        [wizardTradeRecords],
    );

    const wizardComparison = useMemo(() => (
        wizardTrade && wizardRecommendation && selectedMonth !== ALL_MONTHS
            ? previewManagerWorkerRiskGap(
                wizardTradeRecords,
                selectedMonth,
                wizardTrade,
                wizardRecommendation.level,
            )
            : null
    ), [selectedMonth, wizardRecommendation, wizardTrade, wizardTradeRecords]);

    const data = useSurveyData(filteredRecords, managerBaselines);

    const specificityDelta = data.avgSpecificityLatest - data.avgSpecificityPrev;
    const canEditBaseline = selectedMonth !== ALL_MONTHS;

    const syncLocalBaselineHistory = () => {
        setBaselineHistory(readManagerRiskBaselineHistory({ monthKey: selectedMonth }));
    };

    const handleBaselineChange = async (
        trade: string,
        level: SurveyRiskLevel | '',
        basis?: ManagerRiskBaselineBasis,
    ) => {
        if (!canEditBaseline) return;
        const key = getManagerRiskBaselineKey(selectedMonth, trade);
        const previous = managerBaselines[key];
        const resolvedBasis: ManagerRiskBaselineBasis = basis || {
            reason: level ? '관리자가 공종별 기준 등급을 직접 선택했습니다.' : '관리자 기준을 삭제했습니다.',
            source: 'manual',
            ruleVersion: 'manual-v1',
            updatedBy: currentAdminActor,
        };
        const next = { ...managerBaselines };
        if (!level) {
            delete next[key];
        } else {
            next[key] = {
                trade,
                monthKey: selectedMonth,
                level,
                updatedAt: new Date().toISOString(),
                basis: resolvedBasis,
            };
        }
        setManagerBaselines(next);
        writeManagerRiskBaselines(next);
        setSavingBaselineKey(key);

        const result = level
            ? await persistSurveyRiskBaseline(next[key], previous?.level || null)
            : await deleteSurveyRiskBaseline(
                selectedMonth,
                trade,
                previous?.level || null,
                resolvedBasis,
            );

        setBaselineStorageMode(result.mode);
        setBaselineStorageWarning(result.warning || '');
        syncLocalBaselineHistory();
        setSavingBaselineKey('');
    };

    const openBaselineWizard = (trade: string) => {
        setWizardTrade(trade);
        setWizardAnswers({});
        setWizardReason('');
    };

    const handleMonthSelection = (month: string) => {
        setSelectedMonth(month);
        setWizardTrade('');
        setWizardAnswers({});
        setWizardReason('');
    };

    const startCurrentMonthBaselineRegistration = () => {
        const currentMonth = getCurrentMonthKey();
        const firstTrade = BASELINE_TRADE_OPTIONS
            .map((trade) => ({
                trade,
                registered: Boolean(managerBaselines[getManagerRiskBaselineKey(currentMonth, trade)]),
                responseCount: buildTradeWorkerRiskReference(
                    workerRecords.filter((record) => (
                        getRecordMonthKey(record.date) === currentMonth
                        && normalizeSurveyTrade(record.jobField) === trade
                    )),
                ).responseCount,
            }))
            .sort((left, right) => (
                Number(left.registered) - Number(right.registered)
                || right.responseCount - left.responseCount
                || left.trade.localeCompare(right.trade)
            ))[0]?.trade || BASELINE_TRADE_OPTIONS[0];
        setSelectedTrade(ALL_TRADES);
        setSelectedMonth(currentMonth);
        openBaselineWizard(firstTrade);
    };

    const applyWizardRecommendation = async () => {
        if (!wizardTrade || !wizardRecommendation) return;
        const currentTrade = wizardTrade;
        const basis: ManagerRiskBaselineBasis = {
            ...wizardAnswers,
            reason: wizardReason.trim() || wizardRecommendation.reasons.join(' '),
            source: 'wizard',
            ruleVersion: MANAGER_BASELINE_RULE_VERSION,
            updatedBy: currentAdminActor,
        };
        await handleBaselineChange(currentTrade, wizardRecommendation.level, basis);

        const nextTrade = baselineRegistrationQueue.find((item) => (
            item.trade !== currentTrade && !item.registered
        ))?.trade;
        setWizardTrade(nextTrade || '');
        setWizardAnswers({});
        setWizardReason('');
    };

    const handleCopyPreviousMonth = async () => {
        if (!canEditBaseline || previousMonthCopyCandidates.length === 0) return;
        setIsCopyingPreviousMonth(true);
        try {
            const now = new Date().toISOString();
            const copiedBaselines = previousMonthCopyCandidates.map(({ trade, previous }) => ({
                trade,
                monthKey: selectedMonth,
                level: previous!.level,
                updatedAt: now,
                basis: {
                    severity: previous!.basis?.severity,
                    exposure: previous!.basis?.exposure,
                    control: previous!.basis?.control,
                    reason: `${formatSurveyMonth(previousMonthKey)} 기준을 검토용으로 복사했습니다.`,
                    source: 'previous-month' as const,
                    ruleVersion: previous!.basis?.ruleVersion || 'previous-month-copy-v1',
                    updatedBy: currentAdminActor,
                },
            }));
            const next = { ...managerBaselines };
            copiedBaselines.forEach((baseline) => {
                next[getManagerRiskBaselineKey(selectedMonth, baseline.trade)] = baseline;
            });
            setManagerBaselines(next);
            writeManagerRiskBaselines(next);

            const result = await persistSurveyRiskBaselines(copiedBaselines);
            setBaselineStorageMode(result.mode);
            setBaselineStorageWarning(result.warning || '');
            syncLocalBaselineHistory();
        } finally {
            setIsCopyingPreviousMonth(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

                {/* ── 페이지 헤더 ─────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                설문 인텔리전스
                            </span>
                            {filteredRecords.length === 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                    현장 데이터 없음
                                </span>
                            ) : data.radarData.length === 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                    관리자 기준 등록 대기
                                </span>
                            ) : null}
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                            위험성평가 설문 분석 대시보드
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            근로자 자필 응답(Q1~Q5)에서 추출한 3개 핵심 지표 · 용인 푸르지오 현장
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            필터 결과: 총 {filteredRecords.length}건
                        </p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2">
                        <p className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                            조회 기준: {selectedMonth === ALL_MONTHS ? '전체 누적 기간' : formatSurveyMonth(selectedMonth)}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={selectedTrade}
                                onChange={(event) => setSelectedTrade(event.target.value)}
                                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                            >
                                {tradeOptions.map((trade) => (
                                    <option key={trade} value={trade}>{trade}</option>
                                ))}
                            </select>
                            <select
                                value={selectedMonth}
                                onChange={(event) => handleMonthSelection(event.target.value)}
                                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                            >
                                {monthOptions.map((month) => (
                                    <option key={month} value={month}>
                                        {month === ALL_MONTHS ? month : formatSurveyMonth(month)}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedTrade(ALL_TRADES);
                                    setSelectedMonth(ALL_MONTHS);
                                }}
                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 bg-slate-100 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"
                            >
                                필터 초기화
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── 상단 KPI 3개 ────────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard
                        label="최대 인식 차이 공종"
                        value={data.topGapScore === null ? data.gapAvailabilityLabel : data.topGapTrade}
                        sub={data.topGapScore === null ? data.gapAvailabilityDescription : `${data.topGapScore}pt · ${data.topGapDirection}`}
                        color="bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-300"
                    />
                    <KpiCard
                        label={`이번 달 급증 위험어`}
                        value={data.latestTopKeyword}
                        sub="Q1·Q2 텍스트 언급 빈도 1위"
                        delta={data.latestTopKeywordDelta}
                        color="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300"
                    />
                    <KpiCard
                        label="평균 약속 구체성 점수"
                        value={`${data.avgSpecificityLatest}점`}
                        sub="Q4·Q5 AI 텍스트 분석 (5점 만점)"
                        delta={specificityDelta > 0 ? Math.round(specificityDelta * 10) : undefined}
                        color="bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-300"
                    />
                </div>

                <div className="rounded-2xl border border-indigo-200 bg-white dark:bg-slate-800 dark:border-indigo-800/50 overflow-hidden shadow-sm">
                    <div className="px-5 py-4 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/40">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">처음 보는 분을 위한 읽는 법</p>
                                <h2 className="mt-1 text-base font-black text-slate-900 dark:text-slate-100">같은 척도로 비교하되, 관리자 기준과 근로자 응답은 서로 다른 입력입니다.</h2>
                            </div>
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                비교 가능 {data.comparableResponseCount}/{data.totalRiskResponseCount}건 · 기준 연결률 {data.baselineCoverage}%
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-5">
                        <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/40 p-4">
                            <p className="text-[11px] font-black text-rose-600 dark:text-rose-300">① 관리자 기준점수</p>
                            <p className="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">작업계획·현장 안전공유 기준 위험등급</p>
                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">공종·월별로 관리자가 별도 등록합니다. 상=100점, 중=50점, 하=0점입니다.</p>
                        </div>
                        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 p-4">
                            <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-300">② 근로자 체감점수</p>
                            <p className="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">Q3 자기평가 평균</p>
                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">근로자가 선택한 상·중·하를 같은 점수로 바꾸어 공종별 평균을 계산합니다.</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 p-4">
                            <p className="text-[11px] font-black text-emerald-600 dark:text-emerald-300">③ 인식 차이</p>
                            <p className="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">관리자 점수 - 근로자 점수</p>
                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">+값은 근로자가 위험을 낮게 본 경우, -값은 근로자가 더 높게 느낀 경우입니다.</p>
                        </div>
                    </div>
                    <div className="px-5 pb-5">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                                <div>
                                    <p className="text-sm font-black text-slate-900 dark:text-slate-100">관리자 기준 위험도 등록</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        근로자 Q3와 별개의 값입니다. 월 필터를 선택한 뒤 해당 월 작업계획과 TBM을 기준으로 공종별 등급을 한 번 등록하세요.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-black ${
                                        baselineStorageMode === 'shared-db'
                                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                            : baselineStorageMode === 'local-fallback'
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                    }`}>
                                        {baselineStorageMode === 'shared-db'
                                            ? '팀 공동 저장소'
                                            : baselineStorageMode === 'local-fallback'
                                                ? '이 기기에 임시 저장'
                                                : '저장소 확인 중'}
                                    </span>
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-black ${
                                        canEditBaseline
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                    }`}>
                                        {canEditBaseline ? formatSurveyMonth(selectedMonth) : '월 선택 필요'}
                                    </span>
                                </div>
                            </div>
                            {baselineStorageWarning && (
                                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                                    {baselineStorageWarning}
                                </p>
                            )}
                            {canEditBaseline ? (
                                <div className="mt-4 space-y-4">
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                                        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-800/50 dark:bg-indigo-900/20">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-black text-indigo-800 dark:text-indigo-200">
                                                        {formatSurveyMonth(selectedMonth)} 등록 {baselineProgress.registered}/{baselineProgress.total}개 공종
                                                    </p>
                                                    <p className="mt-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                                                        {baselineProgress.remaining > 0
                                                            ? `미등록 ${baselineProgress.remaining}개를 빠른 판정으로 이어서 처리할 수 있습니다.`
                                                            : '선택한 공종의 관리자 기준 등록이 완료됐습니다.'}
                                                    </p>
                                                </div>
                                                <span className="text-sm font-black text-indigo-700 dark:text-indigo-200">
                                                    {baselineProgress.total > 0
                                                        ? Math.round((baselineProgress.registered / baselineProgress.total) * 100)
                                                        : 0}%
                                                </span>
                                            </div>
                                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-800">
                                                <div
                                                    className="h-full rounded-full bg-indigo-500 transition-all"
                                                    style={{
                                                        width: `${baselineProgress.total > 0
                                                            ? (baselineProgress.registered / baselineProgress.total) * 100
                                                            : 0}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                                            <button
                                                type="button"
                                                onClick={() => openBaselineWizard(nextBaselineTrade?.trade || baselineTradeOptions[0])}
                                                disabled={baselineTradeOptions.length === 0}
                                                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {nextBaselineTrade && !nextBaselineTrade.registered
                                                    ? `3문항 빠른 판정 · ${nextBaselineTrade.trade}`
                                                    : '등록 기준 다시 확인'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleCopyPreviousMonth}
                                                disabled={previousMonthCopyCandidates.length === 0 || isCopyingPreviousMonth}
                                                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                            >
                                                {isCopyingPreviousMonth
                                                    ? '복사 중…'
                                                    : `전월 기준 불러오기${previousMonthCopyCandidates.length > 0 ? ` ${previousMonthCopyCandidates.length}건` : ''}`}
                                            </button>
                                        </div>
                                    </div>

                                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                                        빠른 판정은 근로자 응답을 계산에 사용하지 않습니다. 관리자가 작업계획·현장 안전공유·현장 방호상태를 3문항으로 확인하면 권고 등급만 제시하며 최종 선택은 관리자가 확정합니다.
                                    </p>

                                    {wizardTrade && (
                                        <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-700 dark:bg-slate-900">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">빠른 판정 도우미</p>
                                                    <h3 className="mt-1 text-base font-black text-slate-900 dark:text-slate-100">{wizardTrade} 공종</h3>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">현장 상태에 가장 가까운 항목을 하나씩 선택하세요.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setWizardTrade('');
                                                        setWizardAnswers({});
                                                        setWizardReason('');
                                                    }}
                                                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 dark:border-slate-700 dark:text-slate-300"
                                                >
                                                    닫기
                                                </button>
                                            </div>

                                            <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 p-3 dark:border-sky-800/50 dark:bg-sky-900/20">
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                    <div>
                                                        <p className="text-xs font-black text-sky-800 dark:text-sky-200">이 공종에서 먼저 확인할 것</p>
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {getTradeDecisionCues(wizardTrade).map((cue) => (
                                                                <span
                                                                    key={cue}
                                                                    className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-black text-sky-700 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-300"
                                                                >
                                                                    {cue}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <p className="max-w-xs text-[10px] font-semibold leading-4 text-sky-600 dark:text-sky-300">
                                                        판단을 돕는 확인 힌트이며 자동 점수에는 사용하지 않습니다.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                                                {[
                                                    {
                                                        title: '1. 사고가 나면 피해가 어느 정도입니까?',
                                                        options: SEVERITY_OPTIONS,
                                                        selected: wizardAnswers.severity,
                                                        select: (value: string) => setWizardAnswers((prev) => ({ ...prev, severity: value as BaselineSeverity })),
                                                    },
                                                    {
                                                        title: '2. 이 작업에 얼마나 자주 노출됩니까?',
                                                        options: EXPOSURE_OPTIONS,
                                                        selected: wizardAnswers.exposure,
                                                        select: (value: string) => setWizardAnswers((prev) => ({ ...prev, exposure: value as BaselineExposure })),
                                                    },
                                                    {
                                                        title: '3. 현재 안전조치가 실제로 작동합니까?',
                                                        options: CONTROL_OPTIONS,
                                                        selected: wizardAnswers.control,
                                                        select: (value: string) => setWizardAnswers((prev) => ({ ...prev, control: value as BaselineControl })),
                                                    },
                                                ].map((question) => (
                                                    <fieldset key={question.title}>
                                                        <legend className="text-xs font-black text-slate-800 dark:text-slate-200">{question.title}</legend>
                                                        <div className="mt-2 grid grid-cols-3 gap-2">
                                                            {question.options.map((option) => (
                                                                <button
                                                                    key={option.value}
                                                                    type="button"
                                                                    onClick={() => question.select(option.value)}
                                                                    aria-pressed={question.selected === option.value}
                                                                    className={`rounded-xl border px-2 py-2.5 text-left transition ${
                                                                        question.selected === option.value
                                                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-200'
                                                                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                    }`}
                                                                >
                                                                    <span className="block text-xs font-black">{option.label}</span>
                                                                    <span className="mt-1 block text-[10px] font-semibold leading-4 opacity-80">{option.description}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </fieldset>
                                                ))}
                                            </div>

                                            <label className="mt-4 block">
                                                <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                    현장 판단 근거 메모
                                                </span>
                                                <span className="ml-2 text-[10px] font-bold text-slate-400">선택 · 최대 500자</span>
                                                <textarea
                                                    value={wizardReason}
                                                    onChange={(event) => setWizardReason(event.target.value.slice(0, 500))}
                                                    rows={2}
                                                    placeholder="예: 금주 타워크레인 인양 작업 집중, 개구부 덮개 일부 보완 필요"
                                                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                />
                                            </label>

                                            <div className={`mt-4 rounded-xl border p-4 ${
                                                wizardRecommendation?.level === '상'
                                                    ? 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20'
                                                    : wizardRecommendation?.level === '하'
                                                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                                                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                                            }`}>
                                                {wizardRecommendation ? (
                                                    <div className="space-y-3">
                                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                                            <div>
                                                                <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                                                                    권고 기준: {wizardRecommendation.level} · {riskLevelToScore(wizardRecommendation.level)}점
                                                                </p>
                                                                <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-600 dark:text-slate-300">
                                                                    {wizardRecommendation.reasons.join(' ')}
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={applyWizardRecommendation}
                                                                disabled={Boolean(savingBaselineKey)}
                                                                className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                                                            >
                                                                이 등급 적용하고 다음
                                                            </button>
                                                        </div>
                                                        <div className="rounded-xl border border-white/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                                <div>
                                                                    <p className="text-xs font-black text-slate-800 dark:text-slate-200">저장 전 체감 비교 미리보기</p>
                                                                    <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                                        근로자 응답은 권고 계산이 끝난 뒤 비교에만 사용합니다.
                                                                    </p>
                                                                </div>
                                                                <span className="text-[10px] font-black text-slate-400">
                                                                    응답 {wizardWorkerReference.responseCount}건
                                                                </span>
                                                            </div>
                                                            {wizardComparison ? (
                                                                <>
                                                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                                                        <div className="rounded-lg bg-rose-50 px-2 py-2 text-center dark:bg-rose-900/20">
                                                                            <span className="block text-[9px] font-bold text-rose-500">관리자 기준</span>
                                                                            <strong className="mt-1 block text-sm text-rose-700 dark:text-rose-300">{formatRiskScore(wizardComparison.managerScore)}</strong>
                                                                        </div>
                                                                        <div className="rounded-lg bg-indigo-50 px-2 py-2 text-center dark:bg-indigo-900/20">
                                                                            <span className="block text-[9px] font-bold text-indigo-500">근로자 체감</span>
                                                                            <strong className="mt-1 block text-sm text-indigo-700 dark:text-indigo-300">{formatRiskScore(wizardComparison.workerScore)}</strong>
                                                                        </div>
                                                                        <div className="rounded-lg bg-slate-100 px-2 py-2 text-center dark:bg-slate-800">
                                                                            <span className="block text-[9px] font-bold text-slate-500">예상 차이</span>
                                                                            <strong className={`mt-1 block text-sm ${gapValueClass(wizardComparison)}`}>{formatGapScore(wizardComparison.signedGap)}</strong>
                                                                        </div>
                                                                    </div>
                                                                    <p className="mt-3 text-[11px] font-black leading-5 text-slate-700 dark:text-slate-200">
                                                                        {getManagerWorkerComparisonAction(wizardComparison)}
                                                                    </p>
                                                                </>
                                                            ) : (
                                                                <p className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                                    근로자 응답이 아직 없어도 관리자 기준은 먼저 등록할 수 있습니다. 이후 응답이 들어오면 자동 비교됩니다.
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">세 문항을 모두 선택하면 권고 등급과 이유가 표시됩니다.</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-xs font-black text-slate-800 dark:text-slate-200">공종별 등록 목록</p>
                                            <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                미등록 공종은 근로자 응답이 많은 순서로 먼저 보여줍니다.
                                            </p>
                                        </div>
                                        <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                                            <button
                                                type="button"
                                                onClick={() => setBaselineListMode('pending')}
                                                aria-pressed={baselineListMode === 'pending'}
                                                className={`rounded-md px-3 py-1.5 text-[11px] font-black ${
                                                    baselineListMode === 'pending'
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'text-slate-500 dark:text-slate-300'
                                                }`}
                                            >
                                                미등록 {baselineProgress.remaining}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setBaselineListMode('all')}
                                                aria-pressed={baselineListMode === 'all'}
                                                className={`rounded-md px-3 py-1.5 text-[11px] font-black ${
                                                    baselineListMode === 'all'
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'text-slate-500 dark:text-slate-300'
                                                }`}
                                            >
                                                전체 {baselineProgress.total}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        {visibleBaselineTrades.map((trade) => {
                                            const key = getManagerRiskBaselineKey(selectedMonth, trade);
                                            const savedBaseline = managerBaselines[key];
                                            const savedLevel = savedBaseline?.level || '';
                                            const previousLevel = managerBaselines[getManagerRiskBaselineKey(previousMonthKey, trade)]?.level;
                                            const tradeRecords = selectedMonthRecordsByTrade.get(trade) || [];
                                            const reference = buildTradeWorkerRiskReference(tradeRecords);
                                            const savedComparison = savedBaseline
                                                ? previewManagerWorkerRiskGap(tradeRecords, selectedMonth, trade, savedBaseline.level)
                                                : null;
                                            return (
                                                <div key={trade} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <p className="text-xs font-black text-slate-800 dark:text-slate-200">{trade}</p>
                                                            <p className="mt-1 text-[10px] font-bold text-slate-400">
                                                                근로자 응답 {reference.responseCount}건 · 상 {reference.levelCounts.상} / 중 {reference.levelCounts.중} / 하 {reference.levelCounts.하}
                                                            </p>
                                                        </div>
                                                        {previousLevel && (
                                                            <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                                전월 {previousLevel}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {reference.topWeakAreas.length > 0 && (
                                                        <p className="mt-2 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400" title={reference.topWeakAreas.join(', ')}>
                                                            참고 취약점: {reference.topWeakAreas.join(', ')}
                                                        </p>
                                                    )}
                                                    {savedBaseline?.basis && (
                                                        <p
                                                            className="mt-2 truncate text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
                                                            title={savedBaseline.basis.reason}
                                                        >
                                                            근거: {BASELINE_SOURCE_LABELS[savedBaseline.basis.source]} · {savedBaseline.basis.updatedBy}
                                                        </p>
                                                    )}
                                                    {savedComparison && (
                                                        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800">
                                                            <div className="flex items-center justify-between gap-2 text-[10px] font-black">
                                                                <span className="text-rose-600 dark:text-rose-300">관리자 {formatRiskScore(savedComparison.managerScore)}</span>
                                                                <span className="text-indigo-600 dark:text-indigo-300">체감 {formatRiskScore(savedComparison.workerScore)}</span>
                                                                <span className={gapValueClass(savedComparison)}>차이 {formatGapScore(savedComparison.signedGap)}</span>
                                                            </div>
                                                            <p className="mt-1.5 text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                                                                {getManagerWorkerComparisonAction(savedComparison)}
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div className="mt-2 flex gap-2">
                                                        <select
                                                            aria-label={`${trade} 관리자 기준 위험도`}
                                                            value={savedLevel}
                                                            onChange={(event) => handleBaselineChange(trade, event.target.value as SurveyRiskLevel | '')}
                                                            disabled={baselineStorageMode === 'loading' || savingBaselineKey === key}
                                                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                        >
                                                            <option value="">기준 미등록</option>
                                                            <option value="상">상 · 100점</option>
                                                            <option value="중">중 · 50점</option>
                                                            <option value="하">하 · 0점</option>
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => openBaselineWizard(trade)}
                                                            className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300"
                                                        >
                                                            도움받기
                                                        </button>
                                                    </div>
                                                    {savingBaselineKey === key && (
                                                        <span className="mt-1 block text-[10px] font-bold text-sky-600 dark:text-sky-300">저장 중…</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {visibleBaselineTrades.length === 0 && (
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
                                            <p className="text-sm font-black text-emerald-800 dark:text-emerald-200">선택한 범위의 기준 등록이 완료됐습니다.</p>
                                            <button
                                                type="button"
                                                onClick={() => setBaselineListMode('all')}
                                                className="mt-2 text-xs font-black text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
                                            >
                                                등록된 전체 공종 확인
                                            </button>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="text-sm font-black text-slate-900 dark:text-slate-100">기준 변경 이력</p>
                                                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                    등급 변경 전후, 판단 방식, 작성자와 근거를 최신 순으로 보존합니다.
                                                </p>
                                            </div>
                                            <span className="text-[11px] font-black text-slate-400">
                                                최근 {Math.min(baselineHistory.length, 10)}건
                                            </span>
                                        </div>
                                        {baselineHistoryWarning && (
                                            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                                {baselineHistoryWarning}
                                            </p>
                                        )}
                                        {baselineHistory.length > 0 ? (
                                            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                                                {baselineHistory.slice(0, 10).map((history) => (
                                                    <div key={history.id} className="grid gap-1 py-3 text-xs sm:grid-cols-[120px_110px_1fr] sm:gap-3">
                                                        <div>
                                                            <p className="font-black text-slate-800 dark:text-slate-200">{history.trade}</p>
                                                            <p className="mt-1 text-[10px] font-semibold text-slate-400">
                                                                {formatBaselineAuditTime(history.changedAt)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-indigo-700 dark:text-indigo-300">
                                                                {history.previousLevel || '미등록'} → {history.nextLevel || '삭제'}
                                                            </p>
                                                            <p className="mt-1 text-[10px] font-semibold text-slate-400">
                                                                {BASELINE_SOURCE_LABELS[history.basis.source]}
                                                            </p>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate font-semibold text-slate-600 dark:text-slate-300" title={history.basis.reason}>
                                                                {history.basis.reason || '근거 메모 없음'}
                                                            </p>
                                                            <p className="mt-1 text-[10px] font-bold text-slate-400">
                                                                작성자 {history.basis.updatedBy} · 판정 기준 {history.basis.ruleVersion}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                선택한 월의 기준 변경 이력이 아직 없습니다.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-900/20 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm font-black text-amber-900 dark:text-amber-200">월을 찾지 말고 이번 달부터 바로 시작하세요.</p>
                                        <p className="mt-1 text-xs font-semibold leading-5 text-amber-700 dark:text-amber-300">
                                            기준은 월별로 보존됩니다. 버튼을 누르면 이번 달과 첫 미등록 공종이 자동 선택됩니다.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={startCurrentMonthBaselineRegistration}
                                        className="shrink-0 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white hover:bg-amber-700"
                                    >
                                        이번 달 기준 등록 시작
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════════════════════════
                    지표 1 : 근로자 체감 위험도 갭 차트
                ══════════════════════════════════════════════════════════ */}
                <SectionCard
                    badge="지표 1"
                    badgeColor="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                    title="관리자 기준 위험도와 근로자 체감 비교"
                    subtitle="관리자: 월·공종별 별도 등록값 / 근로자: Q3 자기평가 / 차이: 관리자점수 - 근로자점수"
                    actionLabel={data.topGapScore === null ? '현재 상태' : '우선 확인 공종'}
                    actionDesc={data.topGapScore === null
                        ? data.gapAvailabilityDescription
                        : `'${data.topGapTrade}' ${data.topGapScore}pt 차이 · ${data.topGapDirection}`}
                >
                    {data.radarData.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 방사형 */}
                        <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
                                공종별 위험 인식 점수 · 100점에 가까울수록 높은 위험
                            </p>
                            <ResponsiveContainer width="100%" height={260}>
                                <RadarChart data={data.radarData}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="trade" tick={{ fontSize: 11, fill: '#64748b' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <Radar name="관리자 기준" dataKey="A" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} strokeWidth={2} />
                                    <Radar name="근로자 체감" dataKey="B" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 막대 갭 */}
                        <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
                                관리자 기준과 근로자 체감 점수 비교
                            </p>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={data.gapData} layout="vertical" margin={{ left: 16, right: 24 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis type="category" dataKey="trade" tick={{ fontSize: 11, fill: '#64748b' }} width={36} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="managerScore" name="관리자 기준" fill="#ef4444" radius={[0, 4, 4, 0]} opacity={0.8} />
                                    <Bar dataKey="workerScore" name="근로자 체감" fill="#6366f1" radius={[0, 4, 4, 0]} opacity={0.8} />
                                    <ReferenceLine x={50} stroke="#cbd5e1" strokeDasharray="4 4" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-6 text-center">
                            <p className="text-sm font-black text-amber-800 dark:text-amber-300">비교 가능한 관리자 기준이 없습니다.</p>
                            <p className="mt-2 text-xs font-semibold leading-5 text-amber-700 dark:text-amber-400">월을 선택하고 공종별 관리자 기준 위험도를 등록하면 차트가 표시됩니다. 기준이 없는 과거 자료를 자동으로 ‘양호’ 처리하지 않습니다.</p>
                        </div>
                    )}

                    {/* 갭 랭킹 테이블 */}
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-700">
                                    <th className="text-left py-2 px-3 font-bold text-slate-500">공종</th>
                                    <th className="text-right py-2 px-3 font-bold text-slate-500">관리자 기준</th>
                                    <th className="text-right py-2 px-3 font-bold text-slate-500">근로자 체감</th>
                                    <th className="text-right py-2 px-3 font-bold text-slate-500">인식 차이</th>
                                    <th className="text-left py-2 px-3 font-bold text-slate-500">해석</th>
                                    <th className="text-right py-2 px-3 font-bold text-slate-500">표본</th>
                                    <th className="text-left py-2 px-3 font-bold text-slate-500">판정</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...data.gapData].sort((a, b) => (b.absoluteGap ?? -1) - (a.absoluteGap ?? -1)).map(row => (
                                    <tr key={row.trade} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                        <td className="py-2 px-3 font-semibold text-slate-700 dark:text-slate-300">
                                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: tradeColor(row.trade) }} />
                                            {row.trade}
                                        </td>
                                        <td className="py-2 px-3 text-right text-rose-600 font-bold">{formatRiskScore(row.managerScore)}</td>
                                        <td className="py-2 px-3 text-right text-indigo-600 font-bold">{formatRiskScore(row.workerScore)}</td>
                                        <td className="py-2 px-3 text-right font-black">
                                            <span className={gapValueClass(row)}>
                                                {formatGapScore(row.signedGap)}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-left text-slate-600 dark:text-slate-300 font-semibold">{getRiskGapDirectionLabel(row.direction)}</td>
                                        <td className="py-2 px-3 text-right text-slate-500 font-bold">{row.comparableCount}/{row.workerResponseCount}</td>
                                        <td className="py-2 px-3">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-black ${gapStatusClass(row.status)}`}>
                                                {getRiskGapStatusLabel(row.status)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-200">판정은 차이의 절댓값으로 봅니다</p>
                            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                                25pt 이상 즉시 확인 · 10~24.9pt 주의 · 10pt 미만 인식 정렬입니다.
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-200">부호는 어느 쪽이 더 높게 봤는지 뜻합니다</p>
                            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                                +는 근로자가 낮게 인식, -는 근로자가 더 높게 체감했다는 뜻입니다.
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-200">표본 3건 미만은 결론을 내리지 않습니다</p>
                            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                                예: 관리자 100점, 근로자 평균 33.3점이면 +66.7pt이며 즉시 확인 대상입니다.
                            </p>
                        </div>
                    </div>
                </SectionCard>

                {/* ══════════════════════════════════════════════════════════
                    지표 2 : 공종별 실질 위협 워드클라우드 및 트렌드
                ══════════════════════════════════════════════════════════ */}
                <SectionCard
                    badge="지표 2"
                    badgeColor="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    title="공종별 실질 위협 워드클라우드 및 트렌드 (Risk Ontology Trend)"
                    subtitle="데이터 출처: Q1(가장 위험한 작업) + Q2(가장 큰 위험요소) 텍스트 빈도 분석"
                    actionLabel="이달 현장 피드백 포인트"
                    actionDesc={`'${data.latestTopKeyword}' 언급 ${data.latestTopKeywordDelta > 0 ? `${data.latestTopKeywordDelta}% 증가` : '안정'} → 비계·추락 방지 설비 긴급 점검 실시`}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 워드클라우드 시뮬레이션 */}
                        <div className="border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 text-center">
                                전체 기간 위험어 빈도 맵
                            </p>
                            <WordCloudSimulated data={data.wordData} />
                            <p className="text-[10px] text-center text-slate-400 mt-2">
                                글자 크기 = 언급 빈도 비례 · 마우스 오버 시 횟수 표시
                            </p>
                        </div>

                        {/* 월별 키워드 추세선 */}
                        <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
                                주요 위험어 월별 언급 추세
                            </p>
                            <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={data.keywordTrend} margin={{ right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    {activeKeywords.map((kw, i) => {
                                        const colors = ['#ef4444', '#f59e0b', '#6366f1', '#10b981'];
                                        return (
                                            <Line
                                                key={kw}
                                                type="monotone"
                                                dataKey={kw}
                                                stroke={colors[i % colors.length]}
                                                strokeWidth={2}
                                                dot={{ r: 4, strokeWidth: 2 }}
                                                activeDot={{ r: 6 }}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 위험어 빈도 순위 */}
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {data.wordData.slice(0, 8).map((item, i) => (
                            <div key={item.word} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 w-4">{i + 1}</span>
                                <span className="font-bold text-sm text-slate-700 dark:text-slate-300 flex-1">{item.word}</span>
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{item.count}회</span>
                            </div>
                        ))}
                    </div>
                </SectionCard>

                {/* ══════════════════════════════════════════════════════════
                    지표 3 : 자기규율 약속 구체성 지수
                ══════════════════════════════════════════════════════════ */}
                <SectionCard
                    badge="지표 3"
                    badgeColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    title="자기규율 약속 구체성 지수 (Self-Discipline Specificity Score)"
                    subtitle="데이터 출처: Q3 이유 + Q4 안전조치 + Q5 실천약속 텍스트 응답품질 판단 (1~5점)"
                    actionLabel="마인드셋 변화 근거"
                    actionDesc={`공종별 구체성 점수 월평균 ${specificityDelta >= 0 ? `+${specificityDelta.toFixed(1)}pt` : `${specificityDelta.toFixed(1)}pt`} 변화 — "서류 작업이 아니라 근로자 사고방식을 능동적으로 변화시키고 있다"는 객관적 증거`}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* 추세선 */}
                        <div className="lg:col-span-2">
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
                                공종별 약속 구체성 점수 월별 추이 (5점 만점)
                            </p>
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={data.specificityTrend} margin={{ right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    {/* 목표선 */}
                                    <ReferenceLine y={3.5} stroke="#10b981" strokeDasharray="4 3" label={{ value: '목표 3.5', position: 'right', fontSize: 10, fill: '#10b981' }} />
                                    {data.specificityTrades.map((trade, i) => {
                                        const colors = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6'];
                                        return (
                                            <Line
                                                key={trade}
                                                type="monotone"
                                                dataKey={trade}
                                                stroke={colors[i % colors.length]}
                                                strokeWidth={2.5}
                                                dot={{ r: 5, strokeWidth: 2 }}
                                                activeDot={{ r: 7 }}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 응답품질 기준 안내 */}
                        <div className="flex flex-col gap-3">
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">AI 응답품질 기준표</p>
                            {[
                                { score: 5, label: '행동+조건+시점 명시', example: '"매일 출근 시 안전벨트 직접 확인하겠다"', color: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' },
                                { score: 4, label: '구체적 행동 명시', example: '"안전벨트 착용 여부를 확인하겠다"', color: 'bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-900/20 dark:text-teal-300' },
                                { score: 3, label: '안전 행동 키워드 포함', example: '"안전모와 장갑을 착용하겠다"', color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' },
                                { score: 2, label: '일반적 주의 표현', example: '"안전에 주의하겠다"', color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' },
                                { score: 1, label: '상투적 표현', example: '"조심하겠다"', color: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:text-rose-300' },
                            ].map(item => (
                                <div key={item.score} className={`rounded-xl border p-3 ${item.color}`}>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-black text-lg leading-none">{item.score}점</span>
                                        <span className="text-[11px] font-bold">{item.label}</span>
                                    </div>
                                    <p className="text-[10px] opacity-70 italic">{item.example}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 경영진 어필 인사이트 박스 */}
                    <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-black text-emerald-800 dark:text-emerald-300 mb-1">
                                    경영진 보고 핵심 메시지
                                </p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                                    점수 우상향 추세는 <strong>한 달에 한 번 자필 응답 행위</strong>가 근로자의 뇌를
                                    <strong> 수동적 상태 → 능동적 분석 사고(System 2)</strong>로 전환시키고 있다는
                                    가장 객관적·과학적 증거입니다. <em>"이 양식은 서류 작업이 아니라 근로자의 마인드셋을 개조하는 도구"</em>입니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                {/* ── 하단 임계값 알림 가이드 ──────────────────────────────── */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        경보 임계값 기준 (자동 조치 트리거)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            {
                                icon: '🔴',
                                condition: '표본 ≥ 3 · |인식 차이| ≥ 25pt',
                                action: '부호 확인 후 집중교육 또는 관리자 기준 재검토',
                                cardClass: 'rounded-xl border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 p-3',
                                titleClass: 'text-xs font-black text-rose-700 dark:text-rose-300',
                                bodyClass: 'text-xs text-rose-600 dark:text-rose-400',
                            },
                            {
                                icon: '🟡',
                                condition: '특정 위험어 2개월 연속 ↑',
                                action: '현장 설비 긴급 점검 + 관리자 보고',
                                cardClass: 'rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 p-3',
                                titleClass: 'text-xs font-black text-amber-700 dark:text-amber-300',
                                bodyClass: 'text-xs text-amber-600 dark:text-amber-400',
                            },
                            {
                                icon: '🟣',
                                condition: '구체성 점수 ≤ 3.5점',
                                action: '해당 협력사 작성 교육 재실시 권고',
                                cardClass: 'rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-900/20 p-3',
                                titleClass: 'text-xs font-black text-indigo-700 dark:text-indigo-300',
                                bodyClass: 'text-xs text-indigo-600 dark:text-indigo-400',
                            },
                        ].map(item => (
                            <div key={item.condition} className={item.cardClass}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">{item.icon}</span>
                                    <span className={item.titleClass}>{item.condition}</span>
                                </div>
                                <p className={item.bodyClass}>→ {item.action}</p>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SurveyIntelligence;
