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
}) => {
    const themeLabel =
        themeMode === 'system'
            ? `시스템/${isDark ? '다크' : '라이트'}`
            : themeMode === 'dark'
                ? '다크'
                : '라이트';

    return (
        <header className="z-10 shrink-0 border-b border-slate-200 bg-white/95 text-slate-900 shadow-sm backdrop-blur transition-colors dark:border-slate-700/70 dark:bg-slate-950/95 dark:text-slate-100 no-print">
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

                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">{siteName}</p>
                        <h2 className="truncate text-sm font-extrabold sm:text-base">{currentPageTitle}</h2>
                    </div>

                    <div className="hidden items-center gap-2 xl:flex">
                        <span className="inline-flex h-8 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200">
                            {todayLabel}
                        </span>
                        <StatusPill variant="normal" label={statusLabel} size="md" />
                        <span className="inline-flex h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-200">
                            {analysisModeLabel}
                        </span>
                    </div>

                    {patentBadge}

                    <button
                        type="button"
                        onClick={onToggleTheme}
                        className="ml-1 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 text-slate-700 transition-colors hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
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
