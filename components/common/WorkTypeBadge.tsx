import React from 'react';

type WorkTypeBadgeEmphasis = 'default' | 'strong';

interface WorkTypeBadgeProps {
    workType: string;
    emphasis?: WorkTypeBadgeEmphasis;
    icon?: React.ReactNode;
    className?: string;
}

const emphasisClassMap: Record<WorkTypeBadgeEmphasis, string> = {
    default: 'border-slate-600/70 bg-slate-800/70 text-slate-200',
    strong: 'border-sky-400/45 bg-sky-500/20 text-sky-100',
};

export const WorkTypeBadge: React.FC<WorkTypeBadgeProps> = ({
    workType,
    emphasis = 'default',
    icon,
    className = '',
}) => {
    return (
        <span
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${emphasisClassMap[emphasis]} ${className}`}
            aria-label={`공종: ${workType}`}
            title={`공종: ${workType}`}
        >
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <span className="truncate">{workType}</span>
        </span>
    );
};
