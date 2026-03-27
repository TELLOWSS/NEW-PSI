import React, { useEffect, useRef, useState } from 'react';
import type { BestPracticeSyncFailureLog, BestPracticeSyncState } from '../../utils/bestPracticeSyncStatus';

type BestPracticeSyncBadgeProps = {
    state: BestPracticeSyncState;
    failureLogs: BestPracticeSyncFailureLog[];
};

const formatKoreanTime = (iso?: string) => {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

export const BestPracticeSyncBadge: React.FC<BestPracticeSyncBadgeProps> = ({ state, failureLogs }) => {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const toneClass = state.status === 'success'
        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : state.status === 'failed'
            ? 'bg-rose-100 text-rose-700 border-rose-200'
            : state.status === 'pending'
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200';

    const label = state.status === 'success'
        ? '우수사례 동기화 성공'
        : state.status === 'failed'
            ? '우수사례 동기화 실패'
            : state.status === 'pending'
                ? '우수사례 동기화 중'
                : '우수사례 동기화 대기';

    const lastText = state.status === 'success'
        ? `최근 성공: ${formatKoreanTime(state.lastSuccessAt)}`
        : `최근 시도: ${formatKoreanTime(state.lastAttemptAt)}`;

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] sm:text-xs font-black ${toneClass}`}
                title={state.message || label}
            >
                {state.status === 'pending' ? (
                    <span className="h-2 w-2 rounded-full border border-current border-t-transparent animate-spin" />
                ) : (
                    <span className="h-2 w-2 rounded-full bg-current opacity-80" />
                )}
                <span className="hidden xl:inline">{label}</span>
                <span className="xl:hidden">동기화</span>
                <span className="hidden 2xl:inline opacity-80">· {lastText}</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-[min(92vw,380px)] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl z-50">
                    <p className="text-xs font-black text-slate-800">우수사례 동기화 상태</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-600">{label}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{state.message || lastText}</p>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-[11px] font-black text-slate-700">최근 실패 원인 (최대 5건)</p>
                        {failureLogs.length === 0 ? (
                            <p className="mt-2 text-[11px] text-slate-500">실패 이력이 없습니다.</p>
                        ) : (
                            <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                                {failureLogs.map((entry, index) => (
                                    <li key={`${entry.at}-${index}`} className="rounded-lg border border-rose-100 bg-rose-50/50 px-2 py-2">
                                        <p className="text-[10px] font-bold text-rose-700">{formatKoreanTime(entry.at)}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-700 leading-snug">{entry.message}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
