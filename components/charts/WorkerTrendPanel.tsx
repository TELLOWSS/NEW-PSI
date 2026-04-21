/**
 * 개인별 평가 기록 추적 패널 + 상세 모달
 * - 선택된 타겟 그룹(공종+국적) 근로자 목록
 * - 검색/페이지네이션으로 스크롤 압박 완화
 * - 모바일에서는 카드형 목록으로 최적화
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
    type TradeNationalityGroupData,
    type WorkerTrendData,
} from '../../utils/dashboardDataTransformer';
import { ActionButton } from '../shared/ActionButton';
import { EmptyStatePanel } from '../shared/EmptyStatePanel';
import { StatusBadge } from '../shared/StatusBadge';
import { SummaryMetricGrid } from '../shared/SummaryMetricGrid';

interface Props {
    targetGroup: TradeNationalityGroupData | null;
}

type TrendFilter = 'all' | 'high-risk' | 'improving' | 'declining';

const PAGE_SIZE = 6;

const SCORE_COLOR = (score: number) =>
    score >= 75 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const score = payload[0]?.value as number;
    return (
        <div className="bg-slate-900/95 text-white text-xs rounded-xl shadow-2xl p-3 border border-white/10">
            <p className="font-bold text-indigo-300 mb-1">{label}</p>
            <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SCORE_COLOR(score) }} />
                <span>종합 점수</span>
                <span className="font-black ml-1">{score}점</span>
            </div>
        </div>
    );
};

const MiniTrendSparkline: React.FC<{ worker: WorkerTrendData }> = ({ worker }) => {
    const trendData = worker.trend.slice(-6);

    if (trendData.length < 2) {
        return <span className="text-[10px] text-slate-400">기록 부족</span>;
    }

    return (
        <div className="h-10 w-24 sm:w-28">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
                    <Line
                        type="monotone"
                        dataKey="score"
                        stroke={SCORE_COLOR(worker.latestScore)}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

interface TrendModalProps {
    worker: WorkerTrendData;
    onClose: () => void;
}

const TrendModal: React.FC<TrendModalProps> = ({ worker, onClose }) => {
    const first = worker.trend[0]?.score ?? 0;
    const last = worker.trend[worker.trend.length - 1]?.score ?? 0;
    const delta = last - first;
    const avg = parseFloat((worker.trend.reduce((s, t) => s + t.score, 0) / worker.trend.length).toFixed(1));
    const modalSummaryItems = [
        {
            key: 'latest',
            label: '최신 점수',
            value: `${last}점`,
            tone: 'bg-white',
            labelClassName: 'text-[10px] sm:text-xs text-slate-500',
            valueClassName: 'text-lg sm:text-2xl font-black',
        },
        {
            key: 'average',
            label: '6개월 평균',
            value: `${avg}점`,
            tone: 'bg-white',
            labelClassName: 'text-[10px] sm:text-xs text-slate-500',
            valueClassName: 'text-lg sm:text-2xl font-black',
        },
        {
            key: 'delta',
            label: '변화',
            value: `${delta >= 0 ? '+' : ''}${delta}점`,
            tone: 'bg-white',
            labelClassName: 'text-[10px] sm:text-xs text-slate-500',
            valueClassName: 'text-lg sm:text-2xl font-black',
        },
    ];

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-start sm:items-center justify-center overflow-y-auto px-4 py-4 sm:py-6"
            style={{ background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg sm:max-w-2xl mx-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto animate-[fadeInScale_0.2s_ease-out]">
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-5 py-4 text-white flex justify-between items-start">
                    <div>
                        <h4 className="font-bold text-base sm:text-lg">{worker.name}</h4>
                        <p className="text-indigo-200 text-xs mt-0.5">
                            {worker.trade} 공종 · {worker.nationality} · 평가 기록 추이
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                        aria-label="닫기"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-4 sm:p-6">
                    {worker.trend.length < 2 ? (
                        <EmptyStatePanel
                            title="추이 분석을 위한 기록이 부족합니다."
                            description="최소 2건 이상 평가가 쌓이면 선형 추이가 표시됩니다."
                            variant="slate"
                            className="flex h-[220px] flex-col items-center justify-center text-center"
                            titleClassName="text-sm font-semibold text-slate-400"
                            descriptionClassName="mt-1 text-xs text-slate-400"
                        />
                    ) : (
                        <>
                            <div className="h-[240px] sm:h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={worker.trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: '#64748b' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(v) => `${v}`}
                                            width={32}
                                        />
                                        <Tooltip content={<TrendTooltip />} />
                                        <ReferenceLine y={75} stroke="#10b981" strokeDasharray="4 4" label={{ value: '양호', fontSize: 9, fill: '#10b981', position: 'right' }} />
                                        <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '주의', fontSize: 9, fill: '#f59e0b', position: 'right' }} />
                                        <Line
                                            type="monotone"
                                            dataKey="score"
                                            name="종합 점수"
                                            stroke="#6366f1"
                                            strokeWidth={2.5}
                                            dot={(props) => {
                                                const { cx, cy, payload } = props;
                                                return (
                                                    <circle
                                                        key={payload.date}
                                                        cx={cx}
                                                        cy={cy}
                                                        r={5}
                                                        fill={SCORE_COLOR(payload.score)}
                                                        stroke="#fff"
                                                        strokeWidth={2}
                                                    />
                                                );
                                            }}
                                            activeDot={{ r: 7, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-right text-[10px] text-slate-400 mt-1">
                                ※ 초록 75점 이상 양호 / 노랑 60~75점 주의 / 빨강 60점 미만 고위험
                            </p>
                        </>
                    )}
                </div>

                <SummaryMetricGrid
                    items={modalSummaryItems.map((item) => ({
                        ...item,
                        value: (
                            <span
                                style={{
                                    color: item.key === 'delta'
                                        ? (delta >= 0 ? '#10b981' : '#ef4444')
                                        : item.key === 'average'
                                            ? SCORE_COLOR(avg)
                                            : SCORE_COLOR(last),
                                }}
                            >
                                {item.value}
                            </span>
                        ),
                    }))}
                    className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100"
                    cardClassName="p-3 text-center sm:p-4 border-0 rounded-none"
                />
            </div>
        </div>
    );
};

export const WorkerTrendPanel: React.FC<Props> = ({ targetGroup }) => {
    const [selectedWorker, setSelectedWorker] = useState<WorkerTrendData | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [activeFilter, setActiveFilter] = useState<TrendFilter>('all');

    useEffect(() => {
        setSearchQuery('');
        setCurrentPage(1);
        setSelectedWorker(null);
        setActiveFilter('all');
    }, [targetGroup?.trade, targetGroup?.nationality]);

    const workers = [...(targetGroup?.workers || [])].sort((a, b) => {
        if (a.latestScore !== b.latestScore) return a.latestScore - b.latestScore;
        return a.averageScore - b.averageScore;
    });
    const latestAvg = targetGroup?.compositeScore ?? 0;
    const isIntegratedNationality = targetGroup?.nationality === '전체 국적';
    const normalizedSearch = searchQuery.trim().toLowerCase();

    const searchFilteredWorkers = useMemo(() => {
        if (!normalizedSearch) return workers;
        return workers.filter(worker =>
            worker.name.toLowerCase().includes(normalizedSearch)
            || worker.trade.toLowerCase().includes(normalizedSearch)
            || worker.nationality.toLowerCase().includes(normalizedSearch)
        );
    }, [workers, normalizedSearch]);

    const filteredWorkers = useMemo(() => {
        switch (activeFilter) {
            case 'high-risk':
                return searchFilteredWorkers.filter(worker => worker.latestScore < 60);
            case 'improving':
                return searchFilteredWorkers.filter(worker => worker.deltaScore > 0);
            case 'declining':
                return searchFilteredWorkers.filter(worker => worker.deltaScore < 0);
            default:
                return searchFilteredWorkers;
        }
    }, [activeFilter, searchFilteredWorkers]);

    const totalPages = Math.max(1, Math.ceil(filteredWorkers.length / PAGE_SIZE));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const pagedWorkers = filteredWorkers.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    if (!targetGroup) {
        return (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex items-center justify-center min-h-[100px]">
                <p className="text-xs text-slate-400 font-medium">작업조를 선택하면 개인별 평가 기록 목록이 활성화됩니다.</p>
            </div>
        );
    }

    const riskCount = filteredWorkers.filter(worker => worker.latestScore < 60).length;
    const cautionCount = filteredWorkers.filter(worker => worker.latestScore >= 60 && worker.latestScore < 75).length;
    const goodCount = filteredWorkers.filter(worker => worker.latestScore >= 75).length;
    const summaryItems = [
        {
            key: 'total',
            label: '대상 인원',
            value: `${filteredWorkers.length}명`,
            tone: 'bg-slate-50 border-slate-100',
            labelClassName: 'text-[10px] uppercase tracking-wide font-bold text-slate-400',
            valueClassName: 'mt-1 text-lg font-black text-slate-800',
        },
        {
            key: 'risk',
            label: '고위험',
            value: `${riskCount}명`,
            tone: 'bg-rose-50 border-rose-100',
            labelClassName: 'text-[10px] uppercase tracking-wide font-bold text-rose-400',
            valueClassName: 'mt-1 text-lg font-black text-rose-600',
        },
        {
            key: 'caution',
            label: '주의',
            value: `${cautionCount}명`,
            tone: 'bg-amber-50 border-amber-100',
            labelClassName: 'text-[10px] uppercase tracking-wide font-bold text-amber-500',
            valueClassName: 'mt-1 text-lg font-black text-amber-600',
        },
        {
            key: 'good',
            label: '양호',
            value: `${goodCount}명`,
            tone: 'bg-emerald-50 border-emerald-100',
            labelClassName: 'text-[10px] uppercase tracking-wide font-bold text-emerald-500',
            valueClassName: 'mt-1 text-lg font-black text-emerald-600',
        },
    ];

    const quickFilters: Array<{ key: TrendFilter; label: string; count: number }> = [
        { key: 'all', label: '전체', count: searchFilteredWorkers.length },
        { key: 'high-risk', label: '고위험자', count: searchFilteredWorkers.filter(worker => worker.latestScore < 60).length },
        { key: 'improving', label: '상승자', count: searchFilteredWorkers.filter(worker => worker.deltaScore > 0).length },
        { key: 'declining', label: '하락자', count: searchFilteredWorkers.filter(worker => worker.deltaScore < 0).length },
    ];

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4 sm:p-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-800">
                        팀 내부 개인별 평가 기록
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {isIntegratedNationality
                            ? '선택 팀의 국적 통합 기준 개인별 평가 기록을 보여줍니다. 필요 시 국적 세부 기준으로 내려가 차이를 확인할 수 있습니다.'
                            : `선택 팀 내부 ${targetGroup?.nationality} 세부 기준 개인별 평가 기록을 보여줍니다.`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge variant="violetSoft" className="rounded-lg px-3 py-1.5 text-xs whitespace-nowrap">
                        {targetGroup.trade} 팀 · {isIntegratedNationality ? '국적 통합' : targetGroup.nationality}
                    </StatusBadge>
                    <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                        그룹 평균: <strong>{latestAvg}점</strong>
                    </span>
                </div>
            </div>

            <SummaryMetricGrid
                items={summaryItems}
                className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
                cardClassName="rounded-xl border p-3"
            />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                <div className="relative w-full lg:max-w-sm">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        placeholder="이름/공종/국적으로 검색"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-between lg:justify-end text-xs">
                    <StatusBadge variant="slateSoft" className="rounded-lg px-2.5 py-1 text-xs font-semibold">
                        {safeCurrentPage}/{totalPages} 페이지
                    </StatusBadge>
                    <StatusBadge variant="sky" className="rounded-lg px-2.5 py-1 text-xs font-semibold">
                        페이지당 {PAGE_SIZE}명
                    </StatusBadge>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
                {quickFilters.map(filter => (
                    <ActionButton
                        key={filter.key}
                        type="button"
                        onClick={() => {
                            setActiveFilter(filter.key);
                            setCurrentPage(1);
                        }}
                        variant={activeFilter === filter.key ? 'indigo' : 'slate'}
                        className="shrink-0 px-3 py-2 text-xs font-bold"
                    >
                        {filter.label} <span className="ml-1">{filter.count}</span>
                    </ActionButton>
                ))}
            </div>

            {workers.length === 0 ? (
                <EmptyStatePanel
                    title="해당 그룹의 개인 데이터가 없습니다."
                    variant="slate"
                    className="flex h-32 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 px-4 py-8"
                    titleClassName="text-sm font-semibold text-slate-400"
                />
            ) : filteredWorkers.length === 0 ? (
                <EmptyStatePanel
                    title="검색 결과가 없습니다."
                    description="다른 이름 또는 공종 키워드로 다시 검색해 주세요."
                    variant="slate"
                    className="flex h-32 flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center"
                    titleClassName="text-sm font-semibold text-slate-400"
                    descriptionClassName="mt-1 text-xs text-slate-400"
                />
            ) : (
                <>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full min-w-[420px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    {['이름', '최신 점수', '6개월 평균', '미니 추이', '추이', '상세'].map(header => (
                                        <th key={header} className="text-left text-[10px] sm:text-xs font-bold text-slate-400 uppercase pb-2 pr-3 whitespace-nowrap tracking-wide">
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {pagedWorkers.map(worker => {
                                    const latest = worker.latestScore;
                                    const avg = worker.averageScore;
                                    const delta = worker.deltaScore;

                                    return (
                                        <tr
                                            key={worker.workerId}
                                            data-worker-id={worker.workerId}
                                            className="hover:bg-indigo-50/60 transition-colors cursor-pointer group"
                                            onClick={() => setSelectedWorker(worker)}
                                        >
                                            <td className="py-2.5 pr-3 font-semibold text-slate-800 text-xs sm:text-sm group-hover:text-indigo-700 transition-colors">
                                                {worker.name}
                                            </td>
                                            <td className="py-2.5 pr-3">
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                                                    style={{
                                                        background: SCORE_COLOR(latest) + '22',
                                                        color: SCORE_COLOR(latest),
                                                    }}
                                                >
                                                    {latest}점
                                                </span>
                                            </td>
                                            <td className="py-2.5 pr-3 text-xs text-slate-600 font-medium">{avg}점</td>
                                            <td className="py-2.5 pr-3">
                                                <MiniTrendSparkline worker={worker} />
                                            </td>
                                            <td className="py-2.5 pr-3">
                                                <span className={`text-xs font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
                                                </span>
                                            </td>
                                            <td className="py-2.5">
                                                <ActionButton variant="indigo" className="px-2 py-1 text-[10px] sm:text-xs">
                                                    차트 보기
                                                </ActionButton>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:hidden">
                        {pagedWorkers.map(worker => {
                            const latest = worker.latestScore;
                            const avg = worker.averageScore;
                            const delta = worker.deltaScore;

                            return (
                                <button
                                    key={worker.workerId}
                                    type="button"
                                    data-worker-id={worker.workerId}
                                    onClick={() => setSelectedWorker(worker)}
                                    className="text-left rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm active:scale-[0.99] transition"
                                >
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div>
                                            <p className="text-sm font-black text-slate-800">{worker.name}</p>
                                            <p className="text-[11px] text-slate-500 mt-1">최근 6개월 평가 추이 보기</p>
                                        </div>
                                        <span
                                            className="px-2.5 py-1 rounded-full text-xs font-bold shrink-0"
                                            style={{
                                                background: SCORE_COLOR(latest) + '22',
                                                color: SCORE_COLOR(latest),
                                            }}
                                        >
                                            {latest}점
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="rounded-xl bg-slate-100/80 p-2.5">
                                            <p className="text-[10px] text-slate-400 font-bold">6개월 평균</p>
                                            <p className="text-sm font-black text-slate-700 mt-1">{avg}점</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-100/80 p-2.5">
                                            <p className="text-[10px] text-slate-400 font-bold">변화폭</p>
                                            <p className={`text-sm font-black mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {delta >= 0 ? '+' : '-'}{Math.abs(delta)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-indigo-50 p-2.5">
                                            <p className="text-[10px] text-indigo-400 font-bold">상세</p>
                                            <p className="text-sm font-black text-indigo-600 mt-1">차트 보기</p>
                                        </div>
                                    </div>

                                    <div className="mt-3 rounded-xl bg-slate-50 px-2 py-2">
                                        <p className="text-[10px] text-slate-400 font-bold mb-1">미니 추이</p>
                                        <MiniTrendSparkline worker={worker} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <p className="text-xs text-slate-500 font-medium">
                            {filteredWorkers.length}명 중 <span className="font-bold text-slate-700">{pagedWorkers.length}명</span> 표시
                        </p>
                        <div className="flex items-center gap-2">
                            <ActionButton
                                type="button"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={safeCurrentPage === 1}
                                variant="slate"
                                className="px-3 py-2 text-xs font-bold disabled:cursor-not-allowed"
                            >
                                이전
                            </ActionButton>
                            <ActionButton
                                type="button"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={safeCurrentPage === totalPages}
                                variant="slate"
                                className="px-3 py-2 text-xs font-bold disabled:cursor-not-allowed"
                            >
                                다음
                            </ActionButton>
                        </div>
                    </div>
                </>
            )}

            {selectedWorker && (
                <TrendModal
                    worker={selectedWorker}
                    onClose={() => setSelectedWorker(null)}
                />
            )}
        </div>
    );
};
