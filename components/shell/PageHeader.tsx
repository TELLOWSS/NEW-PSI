import React from 'react';

interface PageHeaderProps {
    show?: boolean;
    title: string;
    description?: string;
    groupLabel?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    show = true,
    title,
    description,
    groupLabel,
}) => {
    if (!show) return null;

    return (
        <section className="mb-4 rounded-2xl border border-slate-700/40 bg-slate-900/70 px-4 py-3 text-slate-100 shadow-sm backdrop-blur-sm sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-2">
                {groupLabel ? (
                    <span className="inline-flex h-6 items-center rounded-full border border-sky-400/35 bg-sky-500/15 px-2.5 text-[11px] font-bold text-sky-200">
                        {groupLabel}
                    </span>
                ) : null}
                <h1 className="text-base font-extrabold tracking-tight sm:text-lg">{title}</h1>
            </div>
            {description ? (
                <p className="mt-1 text-xs font-medium text-slate-300 sm:text-sm">{description}</p>
            ) : null}
        </section>
    );
};
