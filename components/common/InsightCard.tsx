import React from 'react';

type InsightPriority = 'low' | 'medium' | 'high';

interface InsightCardProps {
    title: string;
    summary: string;
    evidence?: string;
    priority?: InsightPriority;
    icon?: React.ReactNode;
    className?: string;
}

const priorityClassMap: Record<InsightPriority, string> = {
    low: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-100',
    medium: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/10 dark:text-sky-100',
    high: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/45 dark:bg-orange-500/15 dark:text-orange-100',
};

const priorityLabelMap: Record<InsightPriority, string> = {
    low: '우선 확인 낮음',
    medium: '우선 확인 보통',
    high: '우선 확인 높음',
};

export const InsightCard: React.FC<InsightCardProps> = ({
    title,
    summary,
    evidence,
    priority = 'medium',
    icon,
    className = '',
}) => {
    return (
        <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-slate-950/20 ${className}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-extrabold tracking-tight text-slate-800 dark:text-slate-100 sm:text-base">{title}</p>
                    <span className={`mt-2 inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-bold ${priorityClassMap[priority]}`}>
                        {priorityLabelMap[priority]}
                    </span>
                </div>
                {icon ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                        {icon}
                    </span>
                ) : null}
            </div>

            <p className="mt-3 text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200">분석 결과: {summary}</p>
            {evidence ? <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">근거: {evidence}</p> : null}
        </section>
    );
};
