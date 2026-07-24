import React from 'react';
import { Badge } from '../common/Badge';

export type StatusBadgeVariant =
    | 'slate'
    | 'slateSoft'
    | 'slateDarkSoft'
    | 'glassDark'
    | 'sky'
    | 'emerald'
    | 'emeraldSoft'
    | 'rose'
    | 'roseSoft'
    | 'amber'
    | 'amberSoft'
    | 'violetSoft';

const STATUS_BADGE_TONE_STYLES: Record<StatusBadgeVariant, string> = {
    slate: 'border-slate-200 bg-white text-slate-700',
    slateSoft: 'border-slate-200 bg-slate-50 text-slate-700',
    slateDarkSoft: 'border-slate-700 bg-slate-800/80 text-slate-400',
    glassDark: 'border-white/10 bg-black/60 text-white backdrop-blur-md',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-200 bg-white text-emerald-700',
    emeraldSoft: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-white text-rose-700',
    roseSoft: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-white text-amber-700',
    amberSoft: 'border-amber-300 bg-amber-100 text-amber-800',
    violetSoft: 'border-violet-200 bg-violet-50 text-violet-700',
};

interface StatusBadgeProps {
    variant?: StatusBadgeVariant;
    className?: string;
    children: React.ReactNode;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
    variant = 'slateSoft',
    className = '',
    children,
}) => {
    return (
        <Badge className={`px-2 py-0.5 text-[10px] font-black ${STATUS_BADGE_TONE_STYLES[variant]}${className ? ` ${className}` : ''}`}>
            {children}
        </Badge>
    );
};
