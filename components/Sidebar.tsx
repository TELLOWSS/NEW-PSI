import React, { useEffect, useMemo, useState } from 'react';
import type { Page } from '../types';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { isPageVisibleByOperationalMode, type OperationalMode } from '../utils/operationalModeUtils';
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
    allowCollapse?: boolean;
    compositionEditMode?: boolean;
    onCompositionConfigChange?: (next: UiCompositionConfig) => void;
    getPageLabel?: (page: Page) => string;
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
        id: 'safety-nexus',
        icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="3" strokeWidth={1.6}/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)" strokeWidth={1.4}/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(35 12 12)" strokeWidth={1.4}/></svg>,
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
        id: 'safety-inspector',
        icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeWidth={2} d="M9 3h6l2 3h3v15H4V6h3l2-3zM8 12h8M8 16h5" /></svg>,
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

// Shared source of truth for both sidebar and quick navigation.
// Never expose pages that are hidden by mode, role or user's menu composition.
export const getSidebarVisibleMenuItems = (
    mode: OperationalMode,
    uiMode: UiAudienceMode,
    compositionConfig: UiCompositionConfig,
): SidebarMenuItem[] => applySidebarComposition(
    sidebarMenuItems.filter((item) =>
        isPageVisibleByOperationalMode(item.id, mode) && isRouteVisibleInMode(item.id, uiMode),
    ),
    compositionConfig,
);

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
    allowCollapse = false,
    compositionEditMode = false,
    onCompositionConfigChange,
    getPageLabel,
}) => {
    const { mode } = useOperationalMode();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const docked = allowCollapse && isCollapsed;

    useEffect(() => {
        if (compositionEditMode) setIsCollapsed(false);
    }, [compositionEditMode]);
    const resolvedUiMode: UiAudienceMode = uiMode === 'worker' || uiMode === 'developer' ? uiMode : 'practitioner';
    const resolvePageLabel = (page: Page) => getPageLabel?.(page) ?? getRouteLabel(page, resolvedUiMode);

    const modeVisibleMenuItems = useMemo(
        () =>
            sidebarMenuItems.filter(
                (item) => isPageVisibleByOperationalMode(item.id, mode) && isRouteVisibleInMode(item.id, resolvedUiMode),
            ),
        [mode, resolvedUiMode],
    );

    const visibleMenuItems = useMemo(
        () => getSidebarVisibleMenuItems(mode, resolvedUiMode, compositionConfig),
        [mode, resolvedUiMode, compositionConfig],
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
        <div className={`psi-sidebar psi-sidebar-surface flex h-full shrink-0 flex-col border-r text-slate-800 transition-colors dark:text-slate-100 ${docked ? 'psi-sidebar--collapsed w-[76px]' : 'w-[248px]'}`}>
            <div className={`psi-sidebar-brand border-b border-slate-200 pb-4 pt-5 dark:border-slate-800/80 ${docked ? 'px-3' : 'px-5'}`}>
                <div className={`flex items-center ${docked ? 'justify-center' : 'gap-3'}`}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-900 bg-[#102a43] p-1.5 text-white dark:border-sky-300/20 dark:bg-sky-400/15">
                        <BrandPhilosophyLogo className="h-7 w-7" />
                    </div>
                    {!docked && <div>
                        <p className="psi-sidebar-brand-eyebrow">SAFETY INTELLIGENCE</p>
                        <p className="psi-sidebar-wordmark">PSI</p>
                        <p className="psi-small-note mt-1">근로자 참여형 안전관리</p>
                    </div>}
                </div>
            </div>

            {allowCollapse && (
                <div className={`flex border-b border-slate-200 px-2 py-2 dark:border-slate-800/80 ${docked ? 'justify-center' : 'justify-end'}`}>
                    <button
                        type="button"
                        className="psi-sidebar-dock-toggle flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--psi-focus)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        onClick={() => setIsCollapsed((prev) => !prev)}
                        aria-label={docked ? '메뉴 펼치기' : '메뉴 접기'}
                        aria-expanded={!docked}
                        title={docked ? '메뉴 펼치기' : '메뉴 접기'}
                    >
                        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={docked ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} /></svg>
                        {!docked && <span>메뉴 접기</span>}
                    </button>
                </div>
            )}

            <nav className={`flex-1 py-4 overflow-y-auto custom-scrollbar ${docked ? 'px-2' : 'px-3'}`}>
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
                                    <div key={`edit-${item.id}`} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700/70 dark:bg-slate-950/40">
                                        <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-md text-xs font-semibold leading-snug text-slate-700 dark:text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={!isHidden}
                                                onChange={(event) =>
                                                    onCompositionConfigChange(
                                                        setSidebarPageVisible(compositionConfig, item.id, event.target.checked),
                                                    )
                                                }
                                                className="h-5 w-5 shrink-0 rounded border-slate-400 bg-white text-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--psi-focus)] dark:border-slate-500 dark:bg-slate-800"
                                            />
                                            <span className="min-w-0 break-words">{resolvePageLabel(item.id)}</span>
                                        </label>
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                disabled={isFirst}
                                                onClick={() => onCompositionConfigChange(reorderSidebarPage(compositionConfig, item.id, 'up'))}
                                                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--psi-focus)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                                aria-label={`${resolvePageLabel(item.id)} 위로 이동`}
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isLast}
                                                onClick={() => onCompositionConfigChange(reorderSidebarPage(compositionConfig, item.id, 'down'))}
                                                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--psi-focus)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                                aria-label={`${resolvePageLabel(item.id)} 아래로 이동`}
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
                        <h3 className={docked ? 'sr-only' : 'psi-meta-label px-3 pb-1.5 dark:text-slate-400'}>
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
                                        className={`psi-sidebar-item w-full flex min-h-[44px] items-center rounded-lg border py-2.5 text-[13px] font-semibold transition-colors ${docked ? 'justify-center gap-0 px-2' : 'gap-3 px-3'} ${
                                            isActive
                                                ? 'is-active border-blue-200 bg-blue-50 text-[#102a43] dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-100'
                                                : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/70 dark:hover:text-white'
                                        }`}
                                        aria-current={isActive ? 'page' : undefined}
                                        aria-label={docked ? resolvePageLabel(item.id) : undefined}
                                        title={docked ? resolvePageLabel(item.id) : undefined}
                                    >
                                        <span className="shrink-0">{item.icon}</span>
                                        <span className={docked ? 'sr-only' : 'truncate text-left'}>{resolvePageLabel(item.id)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </nav>

            <div className={`border-t border-slate-200 dark:border-slate-800/80 ${docked ? 'p-2' : 'p-4'}`}>
                <div className={`flex items-center rounded-lg border border-slate-200 bg-slate-50 py-3 dark:border-slate-700 dark:bg-slate-900/80 ${docked ? 'justify-center px-1' : 'gap-3 px-3'}`} title={docked ? '현장 관리자' : undefined}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A11.955 11.955 0 0112 16c2.5 0 4.824.76 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    {!docked && <div>
                        <p className="psi-item-title text-slate-800 dark:text-slate-100">현장 관리자</p>
                        <p className="psi-small-note">안전 운영 계정</p>
                    </div>}
                </div>
            </div>
        </div>
    );
};
