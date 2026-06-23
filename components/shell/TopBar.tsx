import React from 'react';
import type { ThemeMode } from '../../utils/themeUtils';
import { StatusPill } from '../common/StatusPill';

interface TopBarProps {
    siteName: string;
    currentPageTitle: string;
    todayLabel: string;
    analysisModeLabel: string;
    isMobileMenuOpen: boolean;
    onOpenMobileMenu: () => void;
    isDark: boolean;
    themeMode: ThemeMode;
    onToggleTheme: () => void;
    patentBadge?: React.ReactNode;
    controls?: React.ReactNode;
    statusLabel?: string;
    onGoToDashboard?: () => void;
    onGoToMobileHub?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    siteName,
    currentPageTitle,
    todayLabel,
    analysisModeLabel,
    isMobileMenuOpen,
    onOpenMobileMenu,
    isDark,
    themeMode,
    onToggleTheme,
    patentBadge,
    controls,
    statusLabel = '정상 운영',
    onGoToDashboard,
    onGoToMobileHub,
}) => {
    const themeLabel =
        themeMode === 'system'
            ? `시스템/${isDark ? '다크' : '라이트'}`
            : themeMode === 'dark'
                ? '다크'
                : '라이트';

    return (
        <header className="psi-topbar z-10 shrink-0 border-b text-slate-900 backdrop-blur transition-colors dark:text-slate-100 no-print">
            <div className="mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex min-h-16 items-center gap-2 py-2">
                    <button
                        onClick={onOpenMobileMenu}
                        className="mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
                        aria-label="메뉴 열기"
                        aria-expanded={isMobileMenuOpen}
                    >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>

                    <div className="min-w-0 flex-1 flex items-center gap-3">
                        {onGoToDashboard && (
                            <button
                                type="button"
                                onClick={onGoToDashboard}
                                className="group flex items-center justify-center h-9 w-9 rounded-xl border border-slate-300 bg-white text-slate-600 transition-all duration-200 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300 shadow-sm"
                                aria-label="메인 화면으로 돌아가기"
                                title="메인 화면(대시보드)으로 돌아가기"
                            >
                                <svg className="h-4.5 w-4.5 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>
                        )}
                        {onGoToMobileHub && (
                            <button
                                type="button"
                                onClick={onGoToMobileHub}
                                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-indigo-200/50 bg-indigo-50/50 text-xs font-black text-indigo-700 transition-all duration-200 hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/30 shadow-sm"
                                title="12채널 모바일 연동 허브로 바로 이동"
                            >
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                                </span>
                                12채널 허브
                            </button>
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">{siteName}</p>
                            <h2 className="truncate text-sm font-extrabold sm:text-base">{currentPageTitle}</h2>
                        </div>
                    </div>

                    <div className="hidden items-center gap-2 xl:flex">
                        <span className="hidden h-8 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200 2xl:inline-flex">
                            {todayLabel}
                        </span>
                        <StatusPill variant="normal" label={statusLabel} size="md" />
                        <span className="hidden h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-200 2xl:inline-flex">
                            {analysisModeLabel}
                        </span>
                    </div>

                    {patentBadge}

                    <button
                        type="button"
                        onClick={onToggleTheme}
                        className="ml-1 flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10"
                        aria-label={`테마 전환 (현재: ${themeLabel})`}
                        title={`테마: ${themeLabel} (클릭: 라이트→다크→시스템 순환)`}
                    >
                        {isDark ? (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="5" strokeWidth={2} />
                                <path strokeLinecap="round" strokeWidth={2} d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                            </svg>
                        ) : (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                            </svg>
                        )}
                        <span className="hidden text-[11px] font-black md:inline">{themeLabel}</span>
                    </button>

                    {controls}
                </div>
            </div>
        </header>
    );
};
