import React from 'react';

type LoadingSkeletonVariant = 'card' | 'list' | 'table';

interface LoadingSkeletonProps {
    variant?: LoadingSkeletonVariant;
    rows?: number;
    dense?: boolean;
    className?: string;
}

const RowBlock: React.FC<{ dense: boolean }> = ({ dense }) => (
    <div className={`animate-pulse rounded-xl border border-slate-700/50 bg-slate-900/70 p-3 ${dense ? 'h-12' : 'h-16'}`}>
        <div className="h-2.5 w-1/3 rounded bg-slate-700/80" />
        <div className="mt-3 h-2.5 w-2/3 rounded bg-slate-800/80" />
    </div>
);

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
    variant = 'card',
    rows = 3,
    dense = false,
    className = '',
}) => {
    const safeRows = Math.max(1, Math.min(rows, 8));

    if (variant === 'table') {
        return (
            <div className={`overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 ${className}`} aria-label="로딩 중">
                <div className="animate-pulse border-b border-slate-700/60 bg-slate-800/70 px-4 py-3">
                    <div className="h-3 w-36 rounded bg-slate-700/80" />
                </div>
                <div className="space-y-2 p-3">
                    {Array.from({ length: safeRows }).map((_, idx) => (
                        <div key={idx} className="grid grid-cols-4 gap-2 rounded-lg bg-slate-950/40 p-2">
                            <div className="h-2.5 rounded bg-slate-700/70" />
                            <div className="h-2.5 rounded bg-slate-800/70" />
                            <div className="h-2.5 rounded bg-slate-700/70" />
                            <div className="h-2.5 rounded bg-slate-800/70" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (variant === 'list') {
        return (
            <div className={`space-y-2 ${className}`} aria-label="로딩 중">
                {Array.from({ length: safeRows }).map((_, idx) => (
                    <RowBlock key={idx} dense={dense} />
                ))}
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${className}`} aria-label="로딩 중">
            {Array.from({ length: safeRows }).map((_, idx) => (
                <div key={idx} className="animate-pulse rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4">
                    <div className="h-3 w-1/2 rounded bg-slate-700/80" />
                    <div className="mt-4 h-7 w-1/3 rounded bg-slate-600/80" />
                    <div className="mt-4 h-2.5 w-2/3 rounded bg-slate-800/80" />
                </div>
            ))}
        </div>
    );
};
