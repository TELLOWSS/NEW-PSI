import React from 'react';

type StatusVariant = 'normal' | 'warning' | 'critical' | 'offline';
type StatusSize = 'sm' | 'md';

interface StatusPillProps {
    variant?: StatusVariant;
    label?: string;
    size?: StatusSize;
    className?: string;
}

const variantClassMap: Record<StatusVariant, string> = {
    normal: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
    warning: 'border-orange-400/40 bg-orange-500/15 text-orange-200',
    critical: 'border-rose-400/40 bg-rose-500/15 text-rose-200',
    offline: 'border-slate-400/40 bg-slate-500/15 text-slate-200',
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
        <span
            className={`inline-flex items-center rounded-full border font-bold tracking-wide ${variantClassMap[variant]} ${sizeClassMap[size]} ${className}`}
            aria-label={`운영 상태: ${text}`}
            title={`운영 상태: ${text}`}
        >
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {text}
        </span>
    );
};
