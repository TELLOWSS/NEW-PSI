
import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import type { Page } from '../types';
import { API_MODE_CHANGED_EVENT, getIsPaidApiMode } from '../utils/apiModeUtils';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, setCurrentPage }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isPaidApiMode, setIsPaidApiMode] = useState(false);

    const pageTitles: { [key in Page]: string } = {
        'dashboard': '대시보드',
        'ocr-analysis': 'OCR 분석 및 기록 관리',
        'worker-management': '근로자 관리',
        'predictive-analysis': '예측적 안전 관리',
        'performance-analysis': '성과 추이 분석',
        'safety-checks': '안전 이행 점검',
        'site-issue-management': '현장 지적사항 관리',
        'reports': '보고서 생성',
        'feedback': '피드백 및 업데이트',
        'introduction': '소개',
        'individual-report': '개인별 안전 분석 리포트',
        'settings': '시스템 설정 (System Configuration)'
    };

    const handlePageChange = (page: Page) => {
        setCurrentPage(page);
        setIsMobileMenuOpen(false); // Close mobile menu on navigation
    };

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

    return (
        <div className="flex h-screen bg-slate-100 text-slate-800">
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
                <header className="bg-white shadow-sm z-10 shrink-0 no-print">
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
                                   className="relative group/patent shrink-0"
                                   title="특허출원 제10-2026-0039151호 (발명자: 박성훈)"
                                   aria-label="특허출원 상태"
                               >
                                   <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">
                                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                                       </svg>
                                       <span className="hidden md:inline">Pat. Pending</span>
                                   </span>
                                   <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-200 group-hover/patent:translate-y-0 group-hover/patent:opacity-100 translate-y-1">
                                       특허출원 제10-2026-0039151호 (발명자: 박성훈)
                                   </div>
                               </div>
                           </div>
                           <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] sm:text-xs font-black ${isPaidApiMode ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                               <span className="sm:hidden">{isPaidApiMode ? '유료' : '무료'}</span>
                               <span className="hidden sm:inline">{isPaidApiMode ? '유료 API' : '무료 API'}</span>
                           </span>
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
