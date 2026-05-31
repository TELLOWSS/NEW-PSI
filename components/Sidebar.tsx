import React, { useMemo } from 'react';
import type { Page } from '../types';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { isPageVisibleByOperationalMode } from '../utils/operationalModeUtils';
import { getRouteLabel, isRouteVisibleInMode, type UiAudienceMode } from '../config/routeMeta';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    uiMode?: UiAudienceMode;
}

type SidebarMenuItem = {
    id: Page;
    icon: React.ReactNode;
};

const sidebarMenuItems: SidebarMenuItem[] = [
    {
        id: 'dashboard',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
    },
    {
        id: 'site-issue-management',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
        id: 'worker-management',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
        id: 'safety-compliance-hub',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
    },
    {
        id: 'survey-intelligence',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2" /></svg>,
    },
    {
        id: 'predictive-analysis',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
    },
    {
        id: 'safety-behavior-management',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7" /></svg>,
    },
    {
        id: 'performance-analysis',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5" /></svg>,
    },
    {
        id: 'reports',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    },
    {
        id: 'ocr-analysis',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V4a2 2 0 00-2-2H9z" /><path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H4z" /></svg>,
    },
    {
        id: 'settings',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, uiMode = 'practitioner' }) => {
    const { mode } = useOperationalMode();

    const visibleMenuItems = useMemo(
        () =>
            sidebarMenuItems.filter(
                (item) => isPageVisibleByOperationalMode(item.id, mode) && isRouteVisibleInMode(item.id, uiMode),
            ),
        [mode, uiMode],
    );

    return (
        <div className="w-72 bg-slate-950 text-slate-100 shadow-2xl shadow-slate-900/40 flex flex-col shrink-0 h-full">
            <div className="px-5 pt-6 pb-5 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center p-1.5">
                        <BrandPhilosophyLogo className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-2xl font-black tracking-tight leading-none">psi</p>
                        <p className="text-[11px] text-slate-300 mt-1">Human Risk Intelligence</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto custom-scrollbar">
                {visibleMenuItems.map((item) => {
                    const isActive = currentPage === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setCurrentPage(item.id)}
                            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                                isActive
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-700/30'
                                    : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
                            }`}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className="shrink-0">{item.icon}</span>
                            <span className="truncate text-left">{getRouteLabel(item.id, uiMode)}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-slate-800/80">
                <div className="flex items-center gap-3 rounded-xl bg-slate-900 border border-slate-800 px-3 py-3">
                    <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A11.955 11.955 0 0112 16c2.5 0 4.824.76 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-100">휘강준 관리자</p>
                        <p className="text-xs text-slate-400">PSI 관리자</p>
                    </div>
                </div>
            </div>
        </div>
    );
};