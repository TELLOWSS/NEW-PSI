
import React from 'react';
import { Sidebar } from './Sidebar';
import type { Page } from '../types';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, setCurrentPage }) => {
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
    };

    return (
        <div className="flex h-screen bg-slate-100 text-slate-800">
            {/* 사이드바는 인쇄 시 제외 */}
            <div className="no-print h-full">
                <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* 헤더는 인쇄 시 제외 */}
                <header className="bg-white shadow-sm z-10 shrink-0 no-print">
                    <div className="mx-auto px-4 sm:px-6 lg:px-8">
                       <div className="flex items-center justify-between h-16">
                           <h1 className="text-xl font-bold text-slate-900">
                               {pageTitles[currentPage]}
                           </h1>
                       </div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    <div key={currentPage} className="mx-auto max-w-7xl animate-fade-in-up">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
