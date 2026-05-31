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
    low: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
    medium: 'border-sky-400/40 bg-sky-500/10 text-sky-100',
    high: 'border-orange-400/45 bg-orange-500/15 text-orange-100',
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
        <section className={`rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 shadow-sm shadow-slate-950/20 sm:p-5 ${className}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-extrabold tracking-tight text-slate-100 sm:text-base">{title}</p>
                    <span className={`mt-2 inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-bold ${priorityClassMap[priority]}`}>
                        {priorityLabelMap[priority]}
                    </span>
                </div>
                {icon ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200">
                        {icon}
                    </span>
                ) : null}
            </div>

            <p className="mt-3 text-sm font-medium leading-relaxed text-slate-200">분석 결과: {summary}</p>
            {evidence ? <p className="mt-2 text-xs font-medium text-slate-300">근거: {evidence}</p> : null}
        </section>
    );
};
