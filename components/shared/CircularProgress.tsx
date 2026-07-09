import React from 'react';
import { getSafetyLevelDisplayLabel } from '../../utils/safetyLevelUtils';

interface CircularProgressProps {
    score: number;
    level: '초급' | '중급' | '고급';
}

const getSafetyLevelClass = (level: '초급' | '중급' | '고급') => {
    switch (level) {
        case '고급': return { text: 'text-emerald-700 dark:text-emerald-400', progress: 'stroke-emerald-500', bg: 'text-emerald-50 dark:text-emerald-950/20' };
        case '중급': return { text: 'text-amber-700 dark:text-amber-400', progress: 'stroke-amber-500', bg: 'text-amber-50 dark:text-amber-950/20' };
        case '초급': return { text: 'text-rose-700 dark:text-rose-400', progress: 'stroke-rose-500', bg: 'text-rose-50 dark:text-rose-950/20' };
        default: return { text: 'text-slate-700 dark:text-slate-400', progress: 'stroke-slate-500', bg: 'text-slate-50' };
    }
};

export const CircularProgress: React.FC<CircularProgressProps> = ({ score, level }) => {
    const levelClass = getSafetyLevelClass(level);
    const levelLabel = getSafetyLevelDisplayLabel(level);
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (safeScore / 100) * circumference;

    return (
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center bg-white dark:bg-slate-900 rounded-full shadow-lg shadow-slate-100 dark:shadow-none border border-slate-100 dark:border-slate-800">
            <svg className="w-24 h-24 transform -rotate-90 origin-center" viewBox="0 0 80 80">
                <circle
                    className={`stroke-current ${levelClass.bg}`}
                    strokeWidth="7"
                    fill="transparent"
                    r={radius}
                    cx="40"
                    cy="40"
                />
                <circle
                    className={`stroke-current transition-all duration-500 ease-out ${levelClass.progress}`}
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    fill="transparent"
                    r={radius}
                    cx="40"
                    cy="40"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter leading-none">{safeScore}</span>
                <span className={`text-[11px] font-black mt-1.5 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 ${levelClass.text}`}>{levelLabel}</span>
            </div>
        </div>
    );
};
