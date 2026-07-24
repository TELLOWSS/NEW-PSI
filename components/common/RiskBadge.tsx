import React from 'react';
import { Badge } from './Badge';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type RiskBadgeSize = 'sm' | 'md';

interface RiskBadgeProps {
    level: RiskLevel;
    labelOverride?: string;
    size?: RiskBadgeSize;
    className?: string;
}

const levelLabelMap: Record<RiskLevel, string> = {
    low: '낮음',
    medium: '보통',
    high: '높음',
    critical: '긴급',
};

const levelClassMap: Record<RiskLevel, string> = {
    low: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
    medium: 'border-sky-400/40 bg-sky-500/15 text-sky-200',
    high: 'border-orange-400/45 bg-orange-500/20 text-orange-100',
    critical: 'border-rose-400/50 bg-rose-500/20 text-rose-100',
};

const sizeClassMap: Record<RiskBadgeSize, string> = {
    sm: 'h-7 px-2.5 text-[11px]',
    md: 'h-8 px-3 text-xs',
};

export const RiskBadge: React.FC<RiskBadgeProps> = ({
    level,
    labelOverride,
    size = 'sm',
    className = '',
}) => {
    const label = labelOverride || levelLabelMap[level];

    return (
        <Badge
            className={`font-bold tracking-wide ${levelClassMap[level]} ${sizeClassMap[size]} ${className}`}
            ariaLabel={`위험도: ${label}`}
            title={`위험도: ${label}`}
            showDot
        >
            {label}
        </Badge>
    );
};
