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
        <div className="w-72 bg-[linear-gradient(180deg,#0b1220_0%,#111827_58%,#0f172a_100%)] text-slate-100 shadow-xl shadow-slate-950/30 flex flex-col shrink-0 h-full border-r border-slate-800/80">
            <div className="px-5 pt-6 pb-5 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center p-1.5">
                        <BrandPhilosophyLogo className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-2xl font-black tracking-tight leading-none">psi</p>
                        <p className="text-[11px] text-slate-300 mt-1">건설현장 안전관리</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-3 py-4 overflow-y-auto custom-scrollbar">
                {compositionEditMode && onCompositionConfigChange && (
                    <section className="mb-4 rounded-xl border border-slate-700/80 bg-slate-900/70 p-3">
                        <h3 className="text-xs font-black tracking-[0.08em] text-slate-200">메뉴 구성 편집</h3>
                        <p className="mt-1 text-[11px] text-slate-400">표시 여부와 순서를 저장합니다. 문서 분석 관리는 보호 규칙으로 항상 유지됩니다.</p>
                        <div className="mt-3 space-y-2">
                            {editRows.map((item, index) => {
                                const isHidden = hiddenSet.has(item.id);
                                const isFirst = index === 0;
                                const isLast = index === editRows.length - 1;
                                return (
                                    <div key={`edit-${item.id}`} className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-950/40 px-2 py-2">
                                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={!isHidden}
                                                onChange={(event) =>
                                                    onCompositionConfigChange(
                                                        setSidebarPageVisible(compositionConfig, item.id, event.target.checked),
                                                    )
                                                }
                                                className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-800 text-orange-500 focus:ring-orange-500"
                                            />
                                            <span>{getRouteLabel(item.id, resolvedUiMode)}</span>
                                        </label>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                disabled={isFirst}
                                                onClick={() => onCompositionConfigChange(reorderSidebarPage(compositionConfig, item.id, 'up'))}
                                                className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                                                aria-label={`${getRouteLabel(item.id, resolvedUiMode)} 위로 이동`}
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isLast}
                                                onClick={() => onCompositionConfigChange(reorderSidebarPage(compositionConfig, item.id, 'down'))}
                                                className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
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
                        <h3 className="px-3 pb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
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
                                        className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                                            isActive
                                                ? 'bg-orange-500/90 text-white shadow-sm shadow-orange-700/30'
                                                : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
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

            <div className="p-4 border-t border-slate-800/80">
                <div className="flex items-center gap-3 rounded-xl bg-slate-900/80 border border-slate-700 px-3 py-3">
                    <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A11.955 11.955 0 0112 16c2.5 0 4.824.76 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-100">현장 관리자</p>
                        <p className="text-xs text-slate-400">안전 운영 계정</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
