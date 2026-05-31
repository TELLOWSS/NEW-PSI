import React from 'react';

type EmptyStateTone = 'neutral' | 'info' | 'warning';

interface EmptyStateProps {
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    tone?: EmptyStateTone;
    icon?: React.ReactNode;
    className?: string;
}

const toneClassMap: Record<EmptyStateTone, string> = {
    neutral: 'border-slate-700/60 bg-slate-900/60 text-slate-100',
    info: 'border-sky-500/35 bg-sky-500/10 text-slate-100',
    warning: 'border-orange-500/40 bg-orange-500/10 text-slate-100',
};

export const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    actionLabel,
    onAction,
    tone = 'neutral',
    icon,
    className = '',
}) => {
    const showAction = Boolean(actionLabel && onAction);

    return (
        <section
            className={`rounded-2xl border px-5 py-6 text-center shadow-sm shadow-slate-950/20 sm:px-6 ${toneClassMap[tone]} ${className}`}
            aria-label={title}
        >
            {icon ? (
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200">
                    {icon}
                </div>
            ) : null}

            <h3 className="text-base font-extrabold tracking-tight sm:text-lg">{title}</h3>
            {description ? <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-300">{description}</p> : null}

            {showAction ? (
                <button
                    type="button"
                    onClick={onAction}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-500 bg-slate-800 px-4 text-sm font-bold text-slate-100 transition-colors hover:bg-slate-700"
                >
                    {actionLabel}
                </button>
            ) : null}
        </section>
    );
};
