
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import type { Page } from '../types';
import { API_MODE_CHANGED_EVENT, getIsPaidApiMode } from '../utils/apiModeUtils';
import { BestPracticeSyncBadge } from './shared/BestPracticeSyncBadge';
import { StatusBadge } from './shared/StatusBadge';
import {
    BEST_PRACTICE_SYNC_STATUS_EVENT,
    getBestPracticeSyncFailureLogs,
    getBestPracticeSyncState,
    type BestPracticeSyncFailureLog,
    type BestPracticeSyncState,
} from '../utils/bestPracticeSyncStatus';
import { getStoredTheme, getResolvedTheme, toggleTheme, applyTheme, watchSystemThemeChange, THEME_CHANGED_EVENT, type ThemeMode } from '../utils/themeUtils';
import { useDevMode } from '../contexts/DevModeContext';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { getOperationalModeLabel, isPageVisibleByOperationalMode } from '../utils/operationalModeUtils';
import { cycleUserRolePreset, getUserRolePreset, getUserRolePresetLabel, USER_ROLE_PRESET_CHANGED_EVENT, type UserRolePreset } from '../utils/userRolePresetUtils';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

type MobileTabId = 'home' | 'alerts' | 'profile' | 'predictive' | 'more';

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, setCurrentPage }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isPaidApiMode, setIsPaidApiMode] = useState(false);
    const [bestPracticeSyncState, setBestPracticeSyncState] = useState<BestPracticeSyncState>(() => getBestPracticeSyncState());
    const [bestPracticeFailureLogs, setBestPracticeFailureLogs] = useState<BestPracticeSyncFailureLog[]>(() => getBestPracticeSyncFailureLogs());
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
    const [isDark, setIsDark] = useState(() => getResolvedTheme(getStoredTheme()) === 'dark');
    const [showScrollTop, setShowScrollTop] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const { isDevMode, toggle: toggleDevMode } = useDevMode();
    const { mode: operationalMode, cycleMode: cycleOperationalMode } = useOperationalMode();
    const [userRolePreset, setUserRolePreset] = useState<UserRolePreset>(() => getUserRolePreset());

    const handleScrollToTop = useCallback(() => {
        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const pageTitles: { [key in Page]: string } = {
        'dashboard': '홈 대시보드',
        'ocr-analysis': '태깅 검증',
        'worker-management': '개인지 인지 프로파일',
        'predictive-analysis': '위험 예측',
        'performance-analysis': '성과 추이 분석',
        'safety-checks': '위험인지 진단',
        'site-issue-management': '경보 알림',
        'safety-behavior-management': '개입 추천',
        'safety-compliance-hub': '현장 컨텍스트',
        'reports': '분석 리포트',
        'feedback': '피드백 및 업데이트',
        'introduction': '소개',
        'individual-report': '위험인지 진단 리포트',
        'admin-training': '관리자 다국어 음성 안내 생성',
        'worker-training': '수기 데이터 입력',
        'survey-intelligence': '행동 패턴 분석',
        'settings': '시스템 설정 (System Configuration)'
    };

    const mobilePageGroupsBase: Record<MobileTabId, Page[]> = {
        home: ['dashboard'],
        alerts: ['site-issue-management'],
        profile: ['worker-management'],
        predictive: ['predictive-analysis', 'intervention-coaching'],
        more: ['reports', 'judgment-tagging-input', 'settings'],
    };

    const filteredMobilePageGroups: Record<MobileTabId, Page[]> = {
        home: mobilePageGroupsBase.home.filter((page) => isPageVisibleByOperationalMode(page, operationalMode)),
        alerts: mobilePageGroupsBase.alerts.filter((page) => isPageVisibleByOperationalMode(page, operationalMode)),
        profile: mobilePageGroupsBase.profile.filter((page) => isPageVisibleByOperationalMode(page, operationalMode)),
        predictive: mobilePageGroupsBase.predictive.filter((page) => isPageVisibleByOperationalMode(page, operationalMode)),
        more: mobilePageGroupsBase.more.filter((page) => isPageVisibleByOperationalMode(page, operationalMode)),
    };

    const mobileBottomTabs: Array<{ id: MobileTabId; label: string; page?: Page; icon: React.ReactNode }> = [
        {
            id: 'home',
            label: '홈',
            page: filteredMobilePageGroups.home[0] || 'dashboard',
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
        },
        {
            id: 'alerts',
            label: '알림',
            page: filteredMobilePageGroups.alerts[0],
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5" /></svg>,
        },
        {
            id: 'profile',
            label: '프로파일',
            page: filteredMobilePageGroups.profile[0],
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m4 6V7m4 10v-3M5 19h14" /></svg>,
        },
        {
            id: 'predictive',
            label: '예측',
            page: filteredMobilePageGroups.predictive[0],
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3a1 1 0 011 1v1.07a7.002 7.002 0 015.932 5.932H19a1 1 0 110 2h-1.068A7.002 7.002 0 0112 18.93V20a1 1 0 11-2 0v-1.07a7.002 7.002 0 01-5.932-5.93H3a1 1 0 110-2h1.068A7.002 7.002 0 0110 5.07V4a1 1 0 011-1zm0 4a5 5 0 100 10 5 5 0 000-10z" /></svg>,
        },
        {
            id: 'more',
            label: '더보기',
            page: filteredMobilePageGroups.more[0] || 'reports',
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6h.01M12 12h.01M12 18h.01" /></svg>,
        },
    ];

    const activeMobileTab = (Object.entries(filteredMobilePageGroups).find(([, pages]) => pages.includes(currentPage))?.[0] as MobileTabId | undefined) ?? 'home';

    const mobileQuickLinksRaw: Array<{ page: Page; label: string }> =
        activeMobileTab === 'home'
            ? [
                { page: 'dashboard', label: '홈 대시보드' },
            ]
            : activeMobileTab === 'alerts'
                ? [
                    { page: 'site-issue-management', label: '알림 현황' },
                ]
                : activeMobileTab === 'profile'
                ? [
                    { page: 'worker-management', label: '작업자 프로파일' },
                ]
                : activeMobileTab === 'predictive'
                    ? [
                        { page: 'predictive-analysis', label: '위험 예측' },
                        { page: 'intervention-coaching', label: '개입 관리' },
                    ]
                    : activeMobileTab === 'more'
                        ? [
                            { page: 'reports', label: '분석 리포트' },
                            { page: 'judgment-tagging-input', label: '데이터 입력' },
                            { page: 'settings', label: '설정' },
                        ]
                        : [
                            { page: 'reports', label: '분석 리포트' },
                        ];

    const mobileQuickLinks = mobileQuickLinksRaw.filter((item) => isPageVisibleByOperationalMode(item.page, operationalMode));

    const handlePageChange = (page: Page) => {
        setCurrentPage(page);
        setIsMobileMenuOpen(false); // Close mobile menu on navigation
    };

    const handleToggleTheme = () => {
        const next = toggleTheme();
        setThemeMode(next);
        setIsDark(getResolvedTheme(next) === 'dark');
    };

    // 앱 로드 시 저장된 테마 적용
    useEffect(() => {
        const initialMode = getStoredTheme();
        applyTheme(initialMode);
        setThemeMode(initialMode);
        setIsDark(getResolvedTheme(initialMode) === 'dark');

        const sync = () => {
            const mode = getStoredTheme();
            setThemeMode(mode);
            setIsDark(getResolvedTheme(mode) === 'dark');
        };
        window.addEventListener(THEME_CHANGED_EVENT, sync);
        const unwatch = watchSystemThemeChange(sync);
        return () => {
            window.removeEventListener(THEME_CHANGED_EVENT, sync);
            unwatch();
        };
    }, []);

    // Handle Escape key to close mobile menu
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isMobileMenuOpen) {
                setIsMobileMenuOpen(false);
            }
        };

        if (isMobileMenuOpen) {
            document.addEventListener('keydown', handleKeyDown);
            // Prevent body scroll when menu is open
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isMobileMenuOpen]);

    useEffect(() => {
        const syncApiMode = () => setIsPaidApiMode(getIsPaidApiMode());
        syncApiMode();

        window.addEventListener('storage', syncApiMode);
        window.addEventListener(API_MODE_CHANGED_EVENT, syncApiMode);

        return () => {
            window.removeEventListener('storage', syncApiMode);
            window.removeEventListener(API_MODE_CHANGED_EVENT, syncApiMode);
        };
    }, []);

    useEffect(() => {
        const syncRolePreset = () => setUserRolePreset(getUserRolePreset());
        window.addEventListener(USER_ROLE_PRESET_CHANGED_EVENT, syncRolePreset);
        return () => window.removeEventListener(USER_ROLE_PRESET_CHANGED_EVENT, syncRolePreset);
    }, []);

    useEffect(() => {
        const syncState = () => {
            setBestPracticeSyncState(getBestPracticeSyncState());
            setBestPracticeFailureLogs(getBestPracticeSyncFailureLogs());
        };

        const handleCustom = () => {
            syncState();
        };

        syncState();
        window.addEventListener('storage', syncState);
        window.addEventListener(BEST_PRACTICE_SYNC_STATUS_EVENT, handleCustom as EventListener);

        return () => {
            window.removeEventListener('storage', syncState);
            window.removeEventListener(BEST_PRACTICE_SYNC_STATUS_EVENT, handleCustom as EventListener);
        };
    }, []);

    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;
        const onScroll = () => setShowScrollTop(el.scrollTop > 250);
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="flex h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors duration-200">
            {/* Desktop Sidebar - Hidden on mobile */}
            <div className="no-print hidden lg:block h-full">
                <Sidebar currentPage={currentPage} setCurrentPage={handlePageChange} />
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-50 no-print" role="dialog" aria-modal="true" aria-label="Navigation menu">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
                        onClick={() => setIsMobileMenuOpen(false)}
                        aria-hidden="true"
                    />
                    {/* Sidebar */}
                    <div className="fixed inset-y-0 left-0 w-64 animate-fade-in">
                        <Sidebar currentPage={currentPage} setCurrentPage={handlePageChange} />
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col overflow-hidden w-full">
                {/* Header with mobile hamburger */}
                <header className="bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50 z-10 shrink-0 no-print">
                    <div className="mx-auto px-4 sm:px-6 lg:px-8">
                       <div className="flex items-center h-14 sm:h-16 gap-2">
                           {/* Mobile Menu Button */}
                           <button
                               onClick={() => setIsMobileMenuOpen(true)}
                               className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors mr-3"
                               aria-label="메뉴 열기"
                               aria-expanded={isMobileMenuOpen}
                           >
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                               </svg>
                           </button>
                           
                           <div className="flex items-center gap-2 flex-1 min-w-0">
                               <h1 className="text-sm sm:text-lg lg:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                                   {pageTitles[currentPage]}
                               </h1>
                               <div
                                   className="relative group/patent shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                                   title="특허출원 제10-2026-0039151호 (발명자: 박성훈)"
                                   aria-label="특허출원 상태"
                                   tabIndex={0}
                                   onKeyDown={(e) => {
                                       if (e.key === 'Escape') {
                                           (e.currentTarget as HTMLDivElement).blur();
                                       }
                                   }}
                               >
                                   <StatusBadge variant="sky" className="gap-1 text-xs font-bold">
                                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                                       </svg>
                                       <span className="hidden md:inline">Pat. Pending</span>
                                   </StatusBadge>
                                   <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 max-w-[min(260px,calc(100vw-2rem))] rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-200 group-hover/patent:translate-y-0 group-hover/patent:opacity-100 group-focus-within/patent:translate-y-0 group-focus-within/patent:opacity-100 translate-y-1 sm:left-1/2 sm:w-max sm:max-w-none sm:-translate-x-1/2">
                                       특허출원 제10-2026-0039151호 (발명자: 박성훈)
                                   </div>
                               </div>
                           </div>
                           <StatusBadge variant={isPaidApiMode ? 'roseSoft' : 'emeraldSoft'} className="px-2 py-1 text-[10px] sm:text-xs">
                               <span className="sm:hidden">{isPaidApiMode ? '유료' : '무료'}</span>
                               <span className="hidden sm:inline">{isPaidApiMode ? '유료 API' : '무료 API'}</span>
                           </StatusBadge>
                           <button
                               type="button"
                               onClick={() => setUserRolePreset(cycleUserRolePreset())}
                               className="ml-1 rounded-lg border border-emerald-200 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/20 px-2 h-8 text-[10px] font-black text-emerald-700 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 transition-colors"
                               title="사용자군 프리셋 순환: 실무자 → 관리자 → 소장"
                               aria-label="사용자군 프리셋 변경"
                           >
                               {getUserRolePresetLabel(userRolePreset)}
                           </button>
                           <button
                               type="button"
                               onClick={cycleOperationalMode}
                               className="ml-1 rounded-lg border border-indigo-200 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/20 px-2 h-8 text-[10px] font-black text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors"
                               title="운영 모드 순환: 실무 즉시 → 표준 운영 → 개발 확장"
                               aria-label="운영 모드 변경"
                           >
                               {getOperationalModeLabel(operationalMode)}
                           </button>
                           {isDevMode && <BestPracticeSyncBadge state={bestPracticeSyncState} failureLogs={bestPracticeFailureLogs} />}
                           {/* 개발자 모드 토글 */}
                           <button
                               type="button"
                               onClick={toggleDevMode}
                               className={`ml-1 flex items-center justify-center rounded-lg border px-2 h-8 text-[10px] font-black tracking-wider transition-colors ${
                                   isDevMode
                                       ? 'border-violet-400 bg-violet-600 text-white hover:bg-violet-500'
                                       : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600'
                               }`}
                               aria-label={isDevMode ? '개발자 모드 끄기' : '개발자 모드 켜기'}
                               title={isDevMode ? '개발자 모드 ON – 클릭하면 꺼짐 (탭 닫으면 자동 OFF)' : '개발자 모드 OFF – 클릭하면 켜짐'}
                           >
                               {isDevMode ? 'DEV ON' : 'DEV OFF'}
                           </button>
                           {/* 다크모드 토글 */}
                           <button
                               type="button"
                               onClick={handleToggleTheme}
                               className="ml-1 flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                               aria-label={`테마 전환 (현재: ${themeMode === 'system' ? `시스템/${isDark ? '다크' : '라이트'}` : themeMode === 'dark' ? '다크' : '라이트'})`}
                               title={`테마: ${themeMode === 'system' ? `시스템/${isDark ? '다크' : '라이트'}` : themeMode === 'dark' ? '다크' : '라이트'} (클릭: 라이트→다크→시스템 순환)`}
                           >
                               {isDark ? (
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                       <circle cx="12" cy="12" r="5" strokeWidth={2} />
                                       <path strokeLinecap="round" strokeWidth={2} d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                                   </svg>
                               ) : (
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                   </svg>
                               )}
                           </button>
                       </div>
                       <div className="lg:hidden pb-3 -mt-1 flex gap-2 overflow-x-auto no-scrollbar">
                           {mobileQuickLinks.map((item) => {
                               const isActive = currentPage === item.page;
                               return (
                                   <button
                                       key={item.page}
                                       type="button"
                                       onClick={() => handlePageChange(item.page)}
                                       className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${isActive ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}
                                   >
                                       {item.label}
                                   </button>
                               );
                           })}
                       </div>
                    </div>
                </header>
                <main ref={mainRef} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 pb-24 lg:pb-10">
                    <div key={currentPage} className="mx-auto max-w-7xl animate-fade-in-up">
                        {children}
                    </div>
                </main>
                <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 no-print" aria-label="모바일 하단 탐색">
                    <div className="grid grid-cols-5 gap-1">
                        {mobileBottomTabs.map((tab) => {
                            const isActive = tab.id === activeMobileTab;
                            const handleClick = () => {
                                if (tab.page) {
                                    handlePageChange(tab.page);
                                }
                            };

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={handleClick}
                                    className={`flex min-h-[60px] flex-col items-center justify-center rounded-2xl px-1 py-2 text-[11px] font-bold transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    <span>{tab.icon}</span>
                                    <span className="mt-1">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
                {/* 최상단으로 이동 버튼 */}
                {showScrollTop && (
                    <button
                        type="button"
                        onClick={handleScrollToTop}
                        className="fixed bottom-24 right-5 z-[300] flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-700 transition-all duration-200 hover:bg-indigo-500 active:scale-95 lg:bottom-6 no-print"
                        aria-label="최상단으로 이동"
                        title="최상단으로 이동"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                )}
            </div>
            <Footer />
        </div>
    );
};
