
import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import type { Page } from '../types';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, setCurrentPage }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

    return (
        <div className="flex h-screen bg-slate-100 text-slate-800">
            {/* Desktop Sidebar - Hidden on mobile */}
            <div className="no-print hidden lg:block h-full">
                <Sidebar currentPage={currentPage} setCurrentPage={handlePageChange} />
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-50 no-print">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
                        onClick={() => setIsMobileMenuOpen(false)}
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
                       <div className="flex items-center justify-between h-14 sm:h-16">
                           {/* Mobile Menu Button */}
                           <button
                               onClick={() => setIsMobileMenuOpen(true)}
                               className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                               aria-label="메뉴 열기"
                           >
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                               </svg>
                           </button>
                           
                           <h1 className="text-sm sm:text-lg lg:text-xl font-bold text-slate-900 truncate">
                               {pageTitles[currentPage]}
                           </h1>

                           {/* Spacer for mobile to center title */}
                           <div className="lg:hidden w-10"></div>
                       </div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8">
                    <div key={currentPage} className="mx-auto max-w-7xl animate-fade-in-up">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
