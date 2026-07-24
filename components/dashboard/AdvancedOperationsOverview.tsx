import React from 'react';

interface AdvancedOperationsOverviewProps {
    appVersion: string;
    dateLabel: string;
    totalWorkers: number;
    averageScore: number;
    protectionPriorityCount: number;
    approvalBacklogCount: number;
    onBackToBoard: () => void;
    onOpenReports: () => void;
    onOpenDetailedAnalysis: () => void;
    onOpenTeamComparison: () => void;
    onOpenPredictiveAnalysis: () => void;
}

const metricCards = [
    {
        key: 'workers',
        label: '활동 근로자',
        getValue: (props: AdvancedOperationsOverviewProps) => `${props.totalWorkers}명`,
        tone: 'border-slate-700 bg-slate-900 text-white',
    },
    {
        key: 'score',
        label: '안전 인지 지수',
        getValue: (props: AdvancedOperationsOverviewProps) => `${props.averageScore.toFixed(1)}점`,
        tone: 'border-slate-700 bg-slate-900 text-white',
    },
    {
        key: 'priority',
        label: '보호 우선',
        getValue: (props: AdvancedOperationsOverviewProps) => `${props.protectionPriorityCount}명`,
        tone: 'border-rose-900/80 bg-rose-950/35 text-rose-100',
    },
    {
        key: 'approval',
        label: '승인 대기',
        getValue: (props: AdvancedOperationsOverviewProps) => `${props.approvalBacklogCount}건`,
        tone: 'border-amber-900/80 bg-amber-950/35 text-amber-100',
    },
] as const;

export function AdvancedOperationsOverview(props: AdvancedOperationsOverviewProps) {
    const hasAttentionItem = props.protectionPriorityCount > 0 || props.approvalBacklogCount > 0;

    return (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
            <header className="border-b border-slate-800 px-4 py-4 sm:px-5 lg:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
                                Precision Operations
                            </span>
                            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-black text-slate-300">
                                {props.appVersion}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-black ${
                                hasAttentionItem
                                    ? 'border-amber-800 bg-amber-950/50 text-amber-200'
                                    : 'border-emerald-800 bg-emerald-950/50 text-emerald-200'
                            }`}>
                                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${hasAttentionItem ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                {hasAttentionItem ? '확인 항목 있음' : '자동 분석 정상'}
                            </span>
                        </div>
                        <h2 className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl">
                            상세 안전 분석 콘솔
                        </h2>
                        <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-300 sm:text-sm">
                            현황 판단, 교차 분석, 팀 비교 순서로 근거를 좁혀 조치 대상을 확인합니다.
                            <span className="ml-2 whitespace-nowrap text-slate-400">{props.dateLabel}</span>
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={props.onBackToBoard}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-black text-white transition-colors hover:border-slate-500 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        통합 보드로 돌아가기
                    </button>
                </div>

                <nav aria-label="상세 분석 주요 영역" className="mt-4 flex gap-2 overflow-x-auto border-t border-slate-800 pt-3">
                    <a
                        href="#advanced-overview"
                        className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        1. 운영 현황
                    </a>
                    <button
                        type="button"
                        onClick={props.onOpenDetailedAnalysis}
                        className="shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        2. 상세 분석
                    </button>
                    <button
                        type="button"
                        onClick={props.onOpenTeamComparison}
                        className="shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        3. 팀 비교
                    </button>
                </nav>
            </header>

            <section aria-label="상세 분석 핵심 현황" className="px-4 py-4 sm:px-5 lg:px-6">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {metricCards.map((metric) => (
                        <div key={metric.key} className={`rounded-lg border px-3 py-3 ${metric.tone}`}>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                            <p className="mt-1 text-xl font-black">{metric.getValue(props)}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                        type="button"
                        onClick={props.onOpenReports}
                        className="min-h-11 rounded-lg bg-white px-4 py-2.5 text-sm font-black text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        리포트 확인
                    </button>
                    <button
                        type="button"
                        onClick={props.onOpenTeamComparison}
                        className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        팀 비교 분석
                    </button>
                    <button
                        type="button"
                        onClick={props.onOpenPredictiveAnalysis}
                        className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        위험신호 분석
                    </button>
                </div>
            </section>
        </div>
    );
}
