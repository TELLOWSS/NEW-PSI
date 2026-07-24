import React, { useEffect, useMemo } from 'react';
import type { Page } from '../types';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { isPageVisibleByOperationalMode } from '../utils/operationalModeUtils';
import {
    applySidebarComposition,
    reorderSidebarPage,
    setSidebarPageVisible,
    writeSidebarVisibilityDebug,
    type UiCompositionConfig,
} from '../utils/uiCompositionConfig';
import {
    getProductGroupLabel,
    getRouteLabel,
    getRouteMeta,
    isRouteVisibleInMode,
    type ProductGroup,
    type UiAudienceMode,
} from '../config/routeMeta';

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    uiMode?: UiAudienceMode;
    compositionConfig: UiCompositionConfig;
    compositionEditMode?: boolean;
    onCompositionConfigChange?: (next: UiCompositionConfig) => void;
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
        id: 'survey-intelligence',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2" /></svg>,
    },
    {
        id: 'education-return',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h11m0 0l-3-3m3 3l-3 3M20 17H9m0 0l3 3m-3-3l3-3" /></svg>,
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
        id: 'safety-compliance-hub',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5-4.5A11.9 11.9 0 0112 3 11.9 11.9 0 014 5.5V11c0 5 3.4 8.2 8 10 4.6-1.8 8-5 8-10V5.5z" /></svg>,
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
        id: 'monthly-guidance-report',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 4h8M8 13h8M8 17h5" /></svg>,
    },
    {
        id: 'a4-education-material',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 3h7l4 4v14H7z" /></svg>,
    },
    {
        id: 'admin-training',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253" /></svg>,
    },
    {
        id: 'ocr-analysis',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V4a2 2 0 00-2-2H9z" /><path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H4z" /></svg>,
    },
    {
        id: 'settings',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
        id: 'feedback',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m7-2a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>,
    },
];

const SIDEBAR_GROUP_ORDER: ProductGroup[] = [
    'dashboard',
    'tbm',
    'risk-assessment',
    'analytics',
    'reports',
    'worker',
    'archive',
];

export const Sidebar: React.FC<SidebarProps> = ({
    currentPage,
    setCurrentPage,
    uiMode = 'practitioner',
    compositionConfig,
    compositionEditMode = false,
    onCompositionConfigChange,
}) => {
    const { mode } = useOperationalMode();
    const resolvedUiMode: UiAudienceMode = uiMode === 'worker' || uiMode === 'developer' ? uiMode : 'practitioner';

    const modeVisibleMenuItems = useMemo(
        () =>
            sidebarMenuItems.filter(
                (item) => isPageVisibleByOperationalMode(item.id, mode) && isRouteVisibleInMode(item.id, resolvedUiMode),
            ),
        [mode, resolvedUiMode],
    );

    const visibleMenuItems = useMemo(
        () => applySidebarComposition(modeVisibleMenuItems, compositionConfig),
        [modeVisibleMenuItems, compositionConfig],
    );

    const editRows = useMemo(
        () =>
            applySidebarComposition(modeVisibleMenuItems, {
                ...compositionConfig,
                hiddenSidebarPages: [],
            }),
        [modeVisibleMenuItems, compositionConfig],
    );

    const hiddenSet = useMemo(() => new Set(compositionConfig.hiddenSidebarPages), [compositionConfig.hiddenSidebarPages]);

    useEffect(() => {
        const entries = sidebarMenuItems.map((item) => {
            const modeVisible = isPageVisibleByOperationalMode(item.id, mode);
            const roleVisible = isRouteVisibleInMode(item.id, resolvedUiMode);
            const userHidden = hiddenSet.has(item.id);

            if (!modeVisible) {
                return { page: item.id, reason: 'operational-mode' as const };
            }
            if (!roleVisible) {
                return { page: item.id, reason: 'role-visibility' as const };
            }
            if (userHidden) {
                return { page: item.id, reason: 'user-hidden' as const };
            }
            return { page: item.id, reason: 'visible' as const };
        });

        writeSidebarVisibilityDebug(mode, resolvedUiMode, entries);
    }, [hiddenSet, mode, resolvedUiMode]);

    const groupedMenuItems = useMemo(() => {
        const groups = SIDEBAR_GROUP_ORDER
            .map((group) => ({
                id: group,
                label: getProductGroupLabel(group),
                items: visibleMenuItems.filter((item) => getRouteMeta(item.id).productGroup === group),
            }))
            .filter((group) => group.items.length > 0);

        return groups;
    }, [visibleMenuItems]);

    return (
        <div className="psi-sidebar psi-sidebar-surface flex h-full w-[248px] shrink-0 flex-col border-r text-slate-800 transition-colors dark:text-slate-100">
            <div className="border-b border-slate-200 px-5 pb-4 pt-5 dark:border-slate-800/80">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-900 bg-[#102a43] p-1.5 text-white dark:border-sky-300/20 dark:bg-sky-400/15">
                        <BrandPhilosophyLogo className="h-7 w-7" />
                    </div>
                    <div>
                        <p className="text-xl font-extrabold leading-none tracking-tight">psi</p>
                        <p className="psi-small-note mt-1">건설현장 안전관리</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-3 py-4 overflow-y-auto custom-scrollbar">
                {compositionEditMode && onCompositionConfigChange && (
                    <section className="mb-4 rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700/80 dark:bg-slate-900/70">
                        <h3 className="psi-meta-label text-slate-700 dark:text-slate-200">메뉴 구성 편집</h3>
                        <p className="psi-small-note mt-1 dark:text-slate-400">표시 여부와 순서를 저장합니다. 문서 분석 관리는 보호 규칙으로 항상 유지됩니다.</p>
                        <div className="mt-3 space-y-2">
                            {editRows.map((item, index) => {
                                const isHidden = hiddenSet.has(item.id);
                                const isFirst = index === 0;
                                const isLast = index === editRows.length - 1;
                                return (
                                    <div key={`edit-${item.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700/70 dark:bg-slate-950/40">
                                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={!isHidden}
                                                onChange={(event) =>
                                                    onCompositionConfigChange(
                                                        setSidebarPageVisible(compositionConfig, item.id, event.target.checked),
                                                    )
                                                }
                                                className="h-3.5 w-3.5 rounded border-slate-350 dark:border-slate-500 bg-white dark:bg-slate-800 text-orange-500 focus:ring-orange-500"
                                            />
                                            <span>{getRouteLabel(item.id, resolvedUiMode)}</span>
                                        </label>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                disabled={isFirst}
                                                onClick={() => onCompositionConfigChange(reorderSidebarPage(compositionConfig, item.id, 'up'))}
                                                className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-650 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                                                aria-label={`${getRouteLabel(item.id, resolvedUiMode)} 위로 이동`}
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isLast}
                                                onClick={() => onCompositionConfigChange(reorderSidebarPage(compositionConfig, item.id, 'down'))}
                                                className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-650 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                                                aria-label={`${getRouteLabel(item.id, resolvedUiMode)} 아래로 이동`}
                                            >
                                                ▼
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
                {groupedMenuItems.map((group) => (
                    <section key={group.id} className="mb-3 last:mb-0">
                        <h3 className="psi-meta-label px-3 pb-1.5 dark:text-slate-400">
                            {group.label}
                        </h3>
                        <div className="space-y-1">
                            {group.items.map((item) => {
                                const isActive = currentPage === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setCurrentPage(item.id)}
                                        className={`psi-sidebar-item w-full flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                                            isActive
                                                ? 'is-active border-blue-200 bg-blue-50 text-[#102a43] dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-100'
                                                : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/70 dark:hover:text-white'
                                        }`}
                                        aria-current={isActive ? 'page' : undefined}
                                    >
                                        <span className="shrink-0">{item.icon}</span>
                                        <span className="truncate text-left">{getRouteLabel(item.id, resolvedUiMode)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </nav>

            <div className="border-t border-slate-200 p-4 dark:border-slate-800/80">
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/80">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A11.955 11.955 0 0112 16c2.5 0 4.824.76 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div>
                        <p className="psi-item-title text-slate-800 dark:text-slate-100">현장 관리자</p>
                        <p className="psi-small-note">안전 운영 계정</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
