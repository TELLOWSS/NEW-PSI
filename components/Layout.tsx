
import React, { useState, useEffect } from 'react';
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
import { getStoredTheme, toggleTheme, applyTheme, THEME_CHANGED_EVENT } from '../utils/themeUtils';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, setCurrentPage }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isPaidApiMode, setIsPaidApiMode] = useState(false);
    const [bestPracticeSyncState, setBestPracticeSyncState] = useState<BestPracticeSyncState>(() => getBestPracticeSyncState());
    const [bestPracticeFailureLogs, setBestPracticeFailureLogs] = useState<BestPracticeSyncFailureLog[]>(() => getBestPracticeSyncFailureLogs());
    const [isDark, setIsDark] = useState(() => getStoredTheme() === 'dark');

    const pageTitles: { [key in Page]: string } = {
        'dashboard': '대시보드',
        'ocr-analysis': 'OCR 분석 및 기록 관리',
        'worker-management': '근로자 관리',
        'predictive-analysis': '예측적 안전 관리',
        'performance-analysis': '성과 추이 분석',
        'safety-checks': '안전 이행 점검',
        'site-issue-management': '현장 지적사항',
        'safety-behavior-management': '행동관찰·코칭',
        'safety-compliance-hub': '현장 안전이행 종합관리',
        'reports': '보고서 생성',
        'feedback': '피드백 및 업데이트',
        'introduction': '소개',
        'individual-report': '개인별 안전 분석 리포트',
        'admin-training': '관리자 다국어 음성 안내 생성',
        'worker-training': '근로자 전자서명 제출',
        'settings': '시스템 설정 (System Configuration)'
    };

    const handlePageChange = (page: Page) => {
        setCurrentPage(page);
        setIsMobileMenuOpen(false); // Close mobile menu on navigation
    };

    const handleToggleTheme = () => {
        const next = toggleTheme();
        setIsDark(next === 'dark');
    };

    // 앱 로드 시 저장된 테마 적용
    useEffect(() => {
        applyTheme(getStoredTheme());
        setIsDark(getStoredTheme() === 'dark');

        const sync = () => setIsDark(getStoredTheme() === 'dark');
        window.addEventListener(THEME_CHANGED_EVENT, sync);
        return () => window.removeEventListener(THEME_CHANGED_EVENT, sync);
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
                               className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors mr-3"
                               aria-label="메뉴 열기"
                               aria-expanded={isMobileMenuOpen}
                           >
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                               </svg>
                           </button>
                           
                           <div className="flex items-center gap-2 flex-1 min-w-0">
                               <h1 className="text-sm sm:text-lg lg:text-xl font-bold text-slate-900 truncate">
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
                           <BestPracticeSyncBadge state={bestPracticeSyncState} failureLogs={bestPracticeFailureLogs} />
                           {/* 다크모드 토글 */}
                           <button
                               type="button"
                               onClick={handleToggleTheme}
                               className="ml-1 flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                               aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
                               title={isDark ? '라이트 모드' : '다크 모드'}
                           >
                               {isDark ? (
                                   /* 홄 */
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                       <circle cx="12" cy="12" r="5" strokeWidth={2} />
                                       <path strokeLinecap="round" strokeWidth={2} d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                                   </svg>
                               ) : (
                                   /* 달 */
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                   </svg>
                               )}
                           </button>
                       </div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 pb-10">
                    <div key={currentPage} className="mx-auto max-w-7xl animate-fade-in-up">
                        {children}
                    </div>
                </main>
            </div>
            <Footer />
        </div>
    );
};
