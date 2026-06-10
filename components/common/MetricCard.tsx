import React from 'react';

type MetricCardTone = 'neutral' | 'safe' | 'warn' | 'risk';

interface MetricCardProps {
    title: string;
    value: React.ReactNode;
    unit?: string;
    deltaText?: string;
    tone?: MetricCardTone;
    footer?: React.ReactNode;
    icon?: React.ReactNode;
    className?: string;
}

const toneClassMap: Record<MetricCardTone, string> = {
    neutral: 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
    safe: 'border-emerald-200 bg-emerald-50 text-slate-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-slate-100',
    warn: 'border-amber-200 bg-amber-50 text-slate-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-slate-100',
    risk: 'border-rose-200 bg-rose-50 text-slate-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-slate-100',
};

const deltaToneClassMap: Record<MetricCardTone, string> = {
    neutral: 'text-blue-700 dark:text-blue-200',
    safe: 'text-emerald-700 dark:text-emerald-200',
    warn: 'text-amber-700 dark:text-amber-200',
    risk: 'text-rose-700 dark:text-rose-200',
};

export const MetricCard: React.FC<MetricCardProps> = ({
    title,
    value,
    unit,
    deltaText,
    tone = 'neutral',
    footer,
    icon,
    className = '',
}) => {
    return (
        <section
            className={`min-h-[128px] rounded-2xl border px-4 py-4 shadow-sm transition-colors sm:px-5 ${toneClassMap[tone]} ${className}`}
            aria-label={`${title} 지표`}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold tracking-wide text-slate-600 dark:text-slate-300 sm:text-sm">{title}</p>
                {icon ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                        {icon}
                    </span>
                ) : null}
            </div>

            <div className="mt-3 flex items-end gap-1.5">
                <strong className="text-2xl font-black leading-none tracking-tight sm:text-3xl">{value}</strong>
                {unit ? <span className="pb-0.5 text-sm font-bold text-slate-500 dark:text-slate-300">{unit}</span> : null}
            </div>

            {deltaText ? (
                <p className={`mt-2 text-xs font-semibold sm:text-sm ${deltaToneClassMap[tone]}`}>
                    {deltaText}
                </p>
            ) : null}

            {footer ? <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-300">{footer}</div> : null}
        </section>
    );
};
