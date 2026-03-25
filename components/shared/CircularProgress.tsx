import React from 'react';

interface CircularProgressProps {
    score: number;
    level: '초급' | '중급' | '고급';
}

const getSafetyLevelClass = (level: '초급' | '중급' | '고급') => {
    switch (level) {
        case '고급': return { text: 'text-green-700', progress: 'stroke-green-500' };
        case '중급': return { text: 'text-yellow-700', progress: 'stroke-yellow-500' };
        case '초급': return { text: 'text-red-700', progress: 'stroke-red-500' };
        default: return { text: 'text-slate-700', progress: 'stroke-slate-500' };
    }
};

export const CircularProgress: React.FC<CircularProgressProps> = ({ score, level }) => {
    const levelClass = getSafetyLevelClass(level);
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (safeScore / 100) * circumference;

    return (
        <div className="relative w-28 h-28 shrink-0">
            <svg className="w-full h-full" viewBox="0 0 80 80">
                <circle
                    className="stroke-current text-slate-200"
                    strokeWidth="8"
                    fill="transparent"
                    r={radius}
                    cx="40"
                    cy="40"
                />
                <circle
                    className={`transform -rotate-90 origin-center stroke-current ${levelClass.progress}`}
                    strokeWidth="8"
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
                <span className="text-3xl font-bold text-slate-800">{safeScore}</span>
                <span className={`text-sm font-bold ${levelClass.text}`}>{level}</span>
            </div>
        </div>
    );
};