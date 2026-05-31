import React from 'react';

interface SectionCardProps {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    compact?: boolean;
    className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
    title,
    subtitle,
    action,
    children,
    compact = false,
    className = '',
}) => {
    return (
        <section
            className={`rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/70 shadow-sm dark:shadow-slate-950/25 ${compact ? 'p-4' : 'p-5 sm:p-6'} ${className}`}
            aria-label={title}
        >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-lg">{title}</h3>
                    {subtitle ? <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">{subtitle}</p> : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            <div>{children}</div>
        </section>
    );
};
