
import React, { useEffect, useState } from 'react';
import type { Page, AppSettings } from '../types';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
}

const navItems: { id: Page, name: string, icon: React.ReactNode }[] = [
    { id: 'dashboard', name: '대시보드', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
    { id: 'ocr-analysis', name: 'OCR 분석', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V4a2 2 0 00-2-2H9z" /><path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H4z" /></svg> },
    { id: 'worker-management', name: '근로자 관리', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { id: 'predictive-analysis', name: '예측적 안전 관리', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>},
    { id: 'performance-analysis', name: '성과 추이 분석', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
    { id: 'safety-checks', name: '안전 이행 점검', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { id: 'site-issue-management', name: '현장 지적사항 관리', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>},
    { id: 'reports', name: '보고서', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    { id: 'settings', name: '시스템 설정', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { id: 'feedback', name: '피드백', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { id: 'introduction', name: '소개', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
    const [siteName, setSiteName] = useState('용인 푸르지오 원클러스터 2,3단지');

    useEffect(() => {
        const savedSettings = localStorage.getItem('psi_app_settings');
        if (savedSettings) {
            try {
                const parsed: AppSettings = JSON.parse(savedSettings);
                if (parsed.siteName) setSiteName(parsed.siteName);
            } catch(e) {}
        }
    }, []);

    return (
        <div className="w-64 bg-white shadow-lg flex flex-col shrink-0 h-full">
            <div className="p-3 sm:p-4 text-center border-b border-slate-200">
                <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center shadow-md">
                    <BrandPhilosophyLogo className="w-7 h-7 sm:w-8 sm:h-8" />
                </div>

                <h1 className="text-base sm:text-lg font-black text-slate-800 mt-2 tracking-tight">PSI SAFETY</h1>
                <p className="text-[11px] sm:text-xs text-slate-500 font-bold">Proactive Safety Intelligence</p>
                <div className="bg-slate-100 rounded-md p-1.5 sm:p-2 mt-3 sm:mt-4">
                     <p className="text-[10px] sm:text-xs font-semibold text-slate-700 truncate px-1">{siteName} 현장</p>
                </div>
            </div>
            <nav className="flex-1 px-2 py-3 sm:py-4 space-y-0.5 sm:space-y-1 overflow-y-auto custom-scrollbar">
                {navItems.map(item => (
                    <a
                        key={item.id}
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(item.id);
                        }}
                        className={`flex items-center px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md transition-colors duration-150 ${currentPage === item.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                    >
                        <span className="w-4 h-4 sm:w-5 sm:h-5">{item.icon}</span>
                        <span className="ml-2 sm:ml-3">{item.name}</span>
                    </a>
                ))}
            </nav>
            {/* Developer Credit Footer */}
            <div className="p-3 sm:p-5 border-t border-slate-200 bg-slate-50/50">
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-700 text-white flex items-center justify-center border border-indigo-800 shadow-sm">
                        <span className="text-xs sm:text-sm font-black tracking-wide">HG</span>
                    </div>

                    <div className="flex flex-col min-w-0">
                        <span className="text-[8px] sm:text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Developed By</span>
                        <span className="text-xs sm:text-sm font-black text-slate-800 truncate tracking-tight">박성훈 부장</span>
                        <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold truncate">(주)휘강건설 · Hwigang Const.</span>
                    </div>
                </div>
                <div className="mt-3 sm:mt-4 text-center">
                    <p className="text-[8px] sm:text-[9px] text-slate-300 font-medium tracking-wide">© 2026 Hwigang Const. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
};
