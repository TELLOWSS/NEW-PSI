import React from 'react';

type ProgressStatus = 'running' | 'success' | 'error';

interface ReportGenerationProgressProps {
    status: ProgressStatus;
    progress: number;
    phaseLabel: string;
    actionLabel: string;
    errorMessage?: string;
    onRetry?: () => void;
}

const getProgressFillClass = (status: ProgressStatus): string => {
    switch (status) {
        case 'success':
            return 'bg-emerald-600';
        case 'error':
            return 'bg-red-600';
        default:
            return 'bg-indigo-600';
    }
};

export const ReportGenerationProgress: React.FC<ReportGenerationProgressProps> = ({
    status,
    progress,
    phaseLabel,
    actionLabel,
    errorMessage,
    onRetry,
}) => {
    const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));

    return (
        <div className="w-full max-w-[210mm] bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4 mb-2">
                <p className="text-sm font-black text-slate-800">
                    {actionLabel} · {phaseLabel}
                </p>
                <span className="text-sm font-black text-slate-900" aria-live="polite">
                    {clampedProgress}%
                </span>
            </div>
            <div
                className="w-full h-3 bg-slate-200 rounded-full overflow-hidden"
                role="progressbar"
                aria-label={`${actionLabel} 진행률`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={clampedProgress}
                aria-valuetext={`${clampedProgress}%`}
            >
                <div
                    className={`${getProgressFillClass(status)} h-full rounded-full transition-all duration-300`}
                    style={{ width: `${clampedProgress}%` }}
                />
            </div>

            {status === 'success' && (
                <p className="mt-3 text-xs sm:text-sm font-bold text-emerald-700">보고서 생성이 완료되었습니다.</p>
            )}

            {status === 'error' && (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-xs sm:text-sm font-bold text-red-700">
                        {errorMessage || '보고서 생성 중 오류가 발생했습니다. 다시 시도해 주세요.'}
                    </p>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black transition-all"
                        >
                            다시 시도
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
