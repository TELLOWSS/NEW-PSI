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
}) => {
    const themeLabel =
        themeMode === 'system'
            ? `시스템/${isDark ? '다크' : '라이트'}`
            : themeMode === 'dark'
                ? '다크'
                : '라이트';
    const mobileTitleMap: Record<string, string> = {
        'PSI 브랜드 스토리 / 상품 소개': 'PSI 소개',
        '근로자 리포트 (관리자 분석)': '리포트',
        '위험성평가 교육자료': '교육자료',
        '근로자 안전 프로파일': '근로자 프로파일',
        '선행 위험신호 분석': '위험신호 분석',
        '현장 위험 이슈 관리': '현장 이슈',
        '월별 계도 리포트': '월별 계도',
    };
    const mobilePageTitle = mobileTitleMap[currentPageTitle] || currentPageTitle;

    return (
        <header className="psi-topbar z-10 shrink-0 border-b text-slate-900 backdrop-blur transition-colors dark:text-slate-100 no-print">
            <div className="mx-auto px-3 sm:px-6 lg:px-8">
                <div className="flex min-h-16 items-center gap-1.5 py-2 sm:gap-2">
                    {!onGoToDashboard ? (
                        <button
                            onClick={onOpenMobileMenu}
                            className="mr-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white sm:mr-2 lg:hidden"
                            aria-label="메뉴 열기"
                            aria-expanded={isMobileMenuOpen}
                        >
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    ) : null}

                    <div className="min-w-0 flex-1 flex items-center gap-2 sm:gap-3">
                        {onGoToDashboard && (
                            <button
                                type="button"
                                onClick={onGoToDashboard}
                                className="group flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:bg-sky-500/10 dark:hover:text-sky-300 lg:hidden"
                                aria-label="메인 화면으로 돌아가기"
                                title="메인 화면(대시보드)으로 돌아가기"
                            >
                                <svg className="h-4.5 w-4.5 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>
                        )}
                        <div className="min-w-0">
                            <p className="psi-meta-label hidden truncate dark:text-slate-300 sm:block">{siteName}</p>
                            <h2 className="psi-card-title whitespace-normal break-keep text-[0.92rem] leading-tight sm:truncate sm:text-base sm:leading-[1.38]">
                                <span className="sm:hidden">{mobilePageTitle}</span>
                                <span className="hidden sm:inline">{currentPageTitle}</span>
                            </h2>
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
                        className="ml-1 flex min-h-11 w-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-0 text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10 sm:min-h-10 sm:w-auto sm:min-w-10 sm:px-3"
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
                        <span className="hidden text-[11px] font-bold md:inline">{themeLabel}</span>
                    </button>

                    {controls}
                </div>
            </div>
        </header>
    );
};
