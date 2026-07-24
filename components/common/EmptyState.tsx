import React from 'react';

type EmptyStateTone = 'neutral' | 'info' | 'warning';

interface EmptyStateProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    tone?: EmptyStateTone;
    icon?: React.ReactNode;
    className?: string;
    titleClassName?: string;
    descriptionClassName?: string;
    unstyled?: boolean;
}

const toneClassMap: Record<EmptyStateTone, string> = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100',
    info: 'border-sky-200 bg-sky-50/50 text-slate-800 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-slate-100',
    warning: 'border-orange-200 bg-orange-50/50 text-slate-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-slate-100',
};

export const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    actionLabel,
    onAction,
    tone = 'neutral',
    icon,
    className = '',
    titleClassName = 'text-base font-extrabold tracking-tight sm:text-lg',
    descriptionClassName = 'mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500 dark:text-slate-300',
    unstyled = false,
}) => {
    const showAction = Boolean(actionLabel && onAction);
    const containerClassName = unstyled
        ? className
        : `rounded-2xl border px-5 py-6 text-center shadow-sm dark:shadow-slate-950/20 sm:px-6 ${toneClassMap[tone]} ${className}`;

    return (
        <section
            className={containerClassName}
            aria-label={typeof title === 'string' ? title : undefined}
        >
            {icon ? (
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-650 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                    {icon}
                </div>
            ) : null}

            <h3 className={titleClassName}>{title}</h3>
            {description ? <p className={descriptionClassName}>{description}</p> : null}

            {showAction ? (
                <button
                    type="button"
                    onClick={onAction}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-850 dark:text-slate-100 dark:hover:bg-slate-750 transition-colors"
                >
                    {actionLabel}
                </button>
            ) : null}
        </section>
    );
};
