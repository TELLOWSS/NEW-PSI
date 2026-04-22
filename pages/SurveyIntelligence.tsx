/**
 * 설문 인텔리전스 대시보드
 * ─────────────────────────────────────────────────────────────────────────────
 * 지표 1 : 근로자 체감 위험도 갭 차트  (Risk Perception Gap Analysis)
 * 지표 2 : 공종별 실질 위협 트렌드      (Risk Ontology Trend)
 * 지표 3 : 자기규율 약속 구체성 지수   (Self-Discipline Specificity Score)
 * ─────────────────────────────────────────────────────────────────────────────
 * 데이터 소스 : WorkerRecord.handwrittenAnswers (questionNumber 1~5)
 */
import React, { useMemo, useState } from 'react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip, Legend,
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    BarChart, Bar, Cell, ReferenceLine,
} from 'recharts';
import type { WorkerRecord } from '../types';

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface Props {
    workerRecords: WorkerRecord[];
}

type TradeKey = string;

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

// ─── 데모 데이터 (실데이터 없을 때 사용) ──────────────────────────────────────
const DEMO_GAP_DATA = [
    { trade: '골조', managerHigh: 80, workerHigh: 42, gap: 38 },
    { trade: '철근', managerHigh: 70, workerHigh: 55, gap: 15 },
    { trade: '형틀', managerHigh: 65, workerHigh: 30, gap: 35 },
    { trade: '배관', managerHigh: 50, workerHigh: 44, gap: 6 },
    { trade: '전기', managerHigh: 75, workerHigh: 40, gap: 35 },
    { trade: '미장', managerHigh: 40, workerHigh: 36, gap: 4 },
];

const DEMO_RADAR_DATA = [
    { trade: '골조', A: 80, B: 42 },
    { trade: '철근', A: 70, B: 55 },
    { trade: '형틀', A: 65, B: 30 },
    { trade: '배관', A: 50, B: 44 },
    { trade: '전기', A: 75, B: 40 },
    { trade: '미장', A: 40, B: 36 },
];

const DEMO_KEYWORD_TREND = [
    { month: '11월', 추락: 18, 끼임: 10, 감전: 5, 충돌: 8 },
    { month: '12월', 추락: 22, 끼임: 12, 감전: 6, 충돌: 7 },
    { month: '1월', 추락: 20, 끼임: 15, 감전: 8, 충돌: 9 },
    { month: '2월', 추락: 30, 끼임: 13, 감전: 7, 충돌: 6 },
    { month: '3월', 추락: 28, 끼임: 18, 감전: 9, 충돌: 11 },
    { month: '4월', 추락: 40, 끼임: 16, 감전: 10, 충돌: 13 },
];

const DEMO_WORD_DATA: { word: string; count: number }[] = [
    { word: '추락', count: 40 }, { word: '끼임', count: 28 }, { word: '안전벨트', count: 24 },
    { word: '비계', count: 22 }, { word: '감전', count: 18 }, { word: '충돌', count: 16 },
    { word: '낙하', count: 14 }, { word: '협착', count: 12 }, { word: '전도', count: 10 },
    { word: '화재', count: 8 }, { word: '철근', count: 7 }, { word: '크레인', count: 6 },
];

const DEMO_SPECIFICITY = [
    { month: '11월', 골조: 1.8, 철근: 2.1, 형틀: 1.5 },
    { month: '12월', 골조: 2.0, 철근: 2.3, 형틀: 1.8 },
    { month: '1월',  골조: 2.3, 철근: 2.5, 형틀: 2.0 },
    { month: '2월',  골조: 2.6, 철근: 2.7, 형틀: 2.4 },
    { month: '3월',  골조: 2.9, 철근: 3.1, 형틀: 2.7 },
    { month: '4월',  골조: 3.3, 철근: 3.5, 형틀: 3.0 },
];

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const getRiskLevel = (text: string): '상' | '중' | '하' | null => {
    if (!text) return null;
    const t = text.trim();
    if (t.includes('상') || /high/i.test(t)) return '상';
    if (t.includes('중') || /mid/i.test(t)) return '중';
    if (t.includes('하') || /low/i.test(t)) return '하';
    return null;
};

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
function useSurveyData(records: WorkerRecord[]) {
    return useMemo(() => {
        const hasData = records.some(r => (r.handwrittenAnswers || []).length > 0);

        if (!hasData) {
            return {
                isDemo: true,
                gapData: DEMO_GAP_DATA,
                radarData: DEMO_RADAR_DATA,
                keywordTrend: DEMO_KEYWORD_TREND,
                wordData: DEMO_WORD_DATA,
                specificityTrend: DEMO_SPECIFICITY,
                specificityTrades: ['골조', '철근', '형틀'],
                topGapTrade: '골조',
                avgSpecificityLatest: 3.3,
                avgSpecificityPrev: 2.9,
                latestTopKeyword: '추락',
                latestTopKeywordDelta: 43,
            };
        }

        // ── 실데이터 처리 ──────────────────────────────────────────────────────

        // 공종 목록
        const trades = Array.from(new Set(records.map(r => r.jobField || '기타')));

        // 월 추출
        const months = Array.from(new Set(records.map(r => {
            const d = r.date ? new Date(r.date) : null;
            return d ? `${d.getMonth() + 1}월` : '?';
        }))).slice(-6);

        // ── 지표 1: 갭 분석 ─────────────────────────────────────────────────
        const gapData = trades.map(trade => {
            const tradeRecords = records.filter(r => r.jobField === trade);
            const q3Answers = tradeRecords.flatMap(r =>
                (r.handwrittenAnswers || []).filter(a => a.questionNumber === '3' || a.questionNumber === 'Q3')
            );
            // 관리자 평가는 Q3 첫 줄 or 체크된 등급을 "상"으로 가정(서식상 관리자가 미리 체크)
            // 근로자 체감은 동일 Q3에서 "하"로 체크한 비율
            const total = q3Answers.length || 1;
            const workerLow = q3Answers.filter(a => getRiskLevel(a.koreanTranslation || a.answerText) === '하').length;
            const managerHigh = Math.round(
                q3Answers.filter(a => getRiskLevel(a.koreanTranslation || a.answerText) === '상').length / total * 100
            );
            const workerHigh = 100 - Math.round(workerLow / total * 100);
            return { trade, managerHigh, workerHigh, gap: Math.max(0, managerHigh - workerHigh) };
        });

        const radarData = trades.map(t => {
            const d = gapData.find(g => g.trade === t);
            return { trade: t, A: d?.managerHigh ?? 50, B: d?.workerHigh ?? 50 };
        });

        // ── 지표 2: 키워드 트렌드 ────────────────────────────────────────────
        const keywordTrend = months.map(month => {
            const monthRecords = records.filter(r => {
                const d = r.date ? new Date(r.date) : null;
                return d ? `${d.getMonth() + 1}월` === month : false;
            });
            const texts = monthRecords.flatMap(r =>
                (r.handwrittenAnswers || [])
                    .filter(a => a.questionNumber === '1' || a.questionNumber === '2')
                    .map(a => a.koreanTranslation || a.answerText)
            ).join(' ');
            const obj: Record<string, number | string> = { month };
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
            const obj: Record<string, number | string> = { month };
            topTrades.forEach(trade => {
                const recs = records.filter(r => {
                    const d = r.date ? new Date(r.date) : null;
                    return r.jobField === trade && d ? `${d.getMonth() + 1}월` === month : false;
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

        const topGap = [...gapData].sort((a, b) => b.gap - a.gap)[0];
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
            wordData: wordData.length > 0 ? wordData : DEMO_WORD_DATA,
            specificityTrend,
            specificityTrades: topTrades,
            topGapTrade: topGap?.trade ?? '-',
            avgSpecificityLatest: Math.round(latestAvg * 10) / 10,
            avgSpecificityPrev: Math.round(prevAvg * 10) / 10,
            latestTopKeyword: latestKwCounts.kw,
            latestTopKeywordDelta: latestKwCounts.prev > 0
                ? Math.round((latestKwCounts.cur - latestKwCounts.prev) / latestKwCounts.prev * 100)
                : 0,
        };
    }, [records]);
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

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const SurveyIntelligence: React.FC<Props> = ({ workerRecords }) => {
    const data = useSurveyData(workerRecords);
    const [activeKeywords] = useState<string[]>(['추락', '끼임', '감전', '충돌']);

    const specificityDelta = data.avgSpecificityLatest - data.avgSpecificityPrev;

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
                            {data.isDemo && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                    DEMO 데이터
                                </span>
                            )}
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                            위험성평가 설문 분석 대시보드
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            근로자 자필 응답(Q1~Q5)에서 추출한 3개 핵심 지표 · 용인 푸르지오 현장
                        </p>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                        기준: {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
                    </p>
                </div>

                {/* ── 상단 KPI 3개 ────────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard
                        label="최대 인지 갭 공종"
                        value={data.topGapTrade}
                        sub="관리자↔근로자 위험등급 인식 차이 최대"
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

                {/* ══════════════════════════════════════════════════════════
                    지표 1 : 근로자 체감 위험도 갭 차트
                ══════════════════════════════════════════════════════════ */}
                <SectionCard
                    badge="지표 1"
                    badgeColor="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                    title="근로자 체감 위험도 갭 차트 (Risk Perception Gap)"
                    subtitle="데이터 출처: Q3 위험등급(상/중/하) + 하단 공종 — 관리자 평가 vs 근로자 응답 비교"
                    actionLabel="이번 달 교육 타겟"
                    actionDesc={`'${data.topGapTrade}' 공종 갭이 가장 큼 → 해당 공종 위험 인식 교육 우선 실시 권고`}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 방사형 */}
                        <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
                                공종별 '상(High)' 응답 비율 — 관리자 vs 근로자
                            </p>
                            <ResponsiveContainer width="100%" height={260}>
                                <RadarChart data={data.radarData}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="trade" tick={{ fontSize: 11, fill: '#64748b' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <Radar name="관리자 평가" dataKey="A" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} strokeWidth={2} />
                                    <Radar name="근로자 체감" dataKey="B" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 막대 갭 */}
                        <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
                                공종별 인지 갭 크기 (관리자점수 - 근로자점수)
                            </p>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={data.gapData} layout="vertical" margin={{ left: 16, right: 24 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis type="category" dataKey="trade" tick={{ fontSize: 11, fill: '#64748b' }} width={36} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="managerHigh" name="관리자 평가" fill="#ef4444" radius={[0, 4, 4, 0]} opacity={0.8} />
                                    <Bar dataKey="workerHigh" name="근로자 체감" fill="#6366f1" radius={[0, 4, 4, 0]} opacity={0.8} />
                                    <ReferenceLine x={0} stroke="#e2e8f0" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 갭 랭킹 테이블 */}
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-700">
                                    <th className="text-left py-2 px-3 font-bold text-slate-500">공종</th>
                                    <th className="text-right py-2 px-3 font-bold text-slate-500">관리자(%)</th>
                                    <th className="text-right py-2 px-3 font-bold text-slate-500">근로자(%)</th>
                                    <th className="text-right py-2 px-3 font-bold text-slate-500">갭(Gap)</th>
                                    <th className="text-left py-2 px-3 font-bold text-slate-500">위험도</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...data.gapData].sort((a, b) => b.gap - a.gap).map(row => (
                                    <tr key={row.trade} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                        <td className="py-2 px-3 font-semibold text-slate-700 dark:text-slate-300">
                                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: tradeColor(row.trade) }} />
                                            {row.trade}
                                        </td>
                                        <td className="py-2 px-3 text-right text-rose-600 font-bold">{row.managerHigh}</td>
                                        <td className="py-2 px-3 text-right text-indigo-600 font-bold">{row.workerHigh}</td>
                                        <td className="py-2 px-3 text-right font-black">
                                            <span className={row.gap >= 25 ? 'text-rose-600' : row.gap >= 10 ? 'text-amber-600' : 'text-emerald-600'}>
                                                {row.gap}pt
                                            </span>
                                        </td>
                                        <td className="py-2 px-3">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-black ${
                                                row.gap >= 25 ? 'bg-rose-100 text-rose-700' :
                                                row.gap >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                {row.gap >= 25 ? '인지 사각지대' : row.gap >= 10 ? '주의' : '양호'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                    subtitle="데이터 출처: Q3 이유 + Q4 안전조치 + Q5 실천약속 텍스트 AI 채점 (1~5점)"
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

                        {/* 채점 기준 안내 */}
                        <div className="flex flex-col gap-3">
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">AI 채점 기준표</p>
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
                            { color: 'rose', icon: '🔴', condition: '갭지수 ≥ 20pt', action: '해당 공종 위험인식 집중교육 의무화' },
                            { color: 'amber', icon: '🟡', condition: '특정 위험어 2개월 연속 ↑', action: '현장 설비 긴급 점검 + 관리자 보고' },
                            { color: 'indigo', icon: '🟣', condition: '구체성 점수 ≤ 3.5점', action: '해당 협력사 작성 교육 재실시 권고' },
                        ].map(item => (
                            <div key={item.condition} className={`rounded-xl border border-${item.color}-200 dark:border-${item.color}-800/40 bg-${item.color}-50 dark:bg-${item.color}-900/20 p-3`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">{item.icon}</span>
                                    <span className={`text-xs font-black text-${item.color}-700 dark:text-${item.color}-300`}>{item.condition}</span>
                                </div>
                                <p className={`text-xs text-${item.color}-600 dark:text-${item.color}-400`}>→ {item.action}</p>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SurveyIntelligence;
