import React from 'react';
import { Badge } from './Badge';

type StatusVariant = 'normal' | 'warning' | 'critical' | 'offline';
type StatusSize = 'sm' | 'md';

interface StatusPillProps {
    variant?: StatusVariant;
    label?: string;
    size?: StatusSize;
    className?: string;
}

const variantClassMap: Record<StatusVariant, string> = {
    normal: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200',
    warning: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-200',
    critical: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200',
    offline: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-400/40 dark:bg-slate-500/15 dark:text-slate-200',
};

const variantLabelMap: Record<StatusVariant, string> = {
    normal: '정상 운영',
    warning: '주의',
    critical: '긴급',
    offline: '오프라인',
};

const sizeClassMap: Record<StatusSize, string> = {
    sm: 'h-7 px-2.5 text-[11px]',
    md: 'h-8 px-3 text-xs',
};

export const StatusPill: React.FC<StatusPillProps> = ({
    variant = 'normal',
    label,
    size = 'sm',
    className = '',
}) => {
    const text = label || variantLabelMap[variant];

    return (
        <Badge
            className={`font-bold tracking-wide ${variantClassMap[variant]} ${sizeClassMap[size]} ${className}`}
            ariaLabel={`운영 상태: ${text}`}
            title={`운영 상태: ${text}`}
            showDot
        >
            {text}
        </Badge>
    );
};
