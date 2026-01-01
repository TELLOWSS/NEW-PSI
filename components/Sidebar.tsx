
import React from 'react';
import type { Page } from '../types';

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
    { id: 'feedback', name: '피드백 및 업데이트', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { id: 'introduction', name: '소개', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
    return (
        <div className="w-64 bg-white shadow-lg flex flex-col shrink-0">
            <div className="p-4 text-center border-b border-slate-200">
                {/* New Asymmetric Logo with Electric Indigo Theme */}
                <svg className="h-14 w-14 mx-auto drop-shadow-md" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="sidebarLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#6366f1" /> {/* Indigo-500 */}
                            <stop offset="100%" stopColor="#4338ca" /> {/* Indigo-700 */}
                        </linearGradient>
                    </defs>
                    {/* Dynamic Slope Shield */}
                    <path d="M8 14 L40 6 V22 C40 34 33 42 24 44 C15 42 8 34 8 22 Z" fill="url(#sidebarLogoGradient)"/>
                    <circle cx="24" cy="25" r="7" stroke="white" strokeWidth="2.5" fill="none"/>
                    <circle cx="24" cy="25" r="3" fill="white"/>
                    <path d="M24 6 V16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                </svg>
                
                <h1 className="text-base font-bold text-slate-800 mt-2">PSI</h1>
                <p className="text-xs text-slate-500">Proactive Safety Intelligence</p>
                <div className="bg-slate-100 rounded-md p-2 mt-4">
                     <p className="text-xs font-semibold text-slate-700">용인 푸르지오 원클러스터 2,3단지 현장</p>
                </div>
            </div>
            <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
                {navItems.map(item => (
                    <a
                        key={item.id}
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(item.id);
                        }}
                        className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 ${currentPage === item.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                    >
                        <span className="w-5 h-5">{item.icon}</span>
                        <span className="ml-3">{item.name}</span>
                    </a>
                ))}
            </nav>
            <div className="px-4 py-3 border-t border-slate-200">
                 <div className="p-4 bg-slate-100 rounded-lg text-center">
                    <h2 className="font-bold text-indigo-600 text-sm">PSI</h2>
                    <h3 className="text-sm font-semibold text-slate-800 mt-1">안전예측 AI 시스템</h3>
                    <p className="text-xs text-slate-500 mt-2">제작: (주)휘강건설 박성훈 부장</p>
                    <p className="text-xs text-slate-400 mt-2">v2.0.0 | © 2026 All rights reserved.</p>
                 </div>
            </div>
        </div>
    );
};
