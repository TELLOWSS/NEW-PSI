import React from 'react';
import { Badge } from './Badge';

type WorkTypeBadgeEmphasis = 'default' | 'strong';

interface WorkTypeBadgeProps {
    workType: string;
    emphasis?: WorkTypeBadgeEmphasis;
    icon?: React.ReactNode;
    className?: string;
}

const emphasisClassMap: Record<WorkTypeBadgeEmphasis, string> = {
    default: 'border-slate-350 bg-slate-100 text-slate-700 dark:border-slate-600/70 dark:bg-slate-800/70 dark:text-slate-200',
    strong: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/45 dark:bg-sky-500/20 dark:text-sky-100',
};

export const WorkTypeBadge: React.FC<WorkTypeBadgeProps> = ({
    workType,
    emphasis = 'default',
    icon,
    className = '',
}) => {
    return (
        <Badge
            className={`min-h-8 gap-1.5 px-3 text-xs font-bold ${emphasisClassMap[emphasis]} ${className}`}
            ariaLabel={`공종: ${workType}`}
            title={`공종: ${workType}`}
        >
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <span className="truncate">{workType}</span>
        </Badge>
    );
};
