import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { AppShell } from './shell/AppShell';
import { TopBar } from './shell/TopBar';
import { PageHeader } from './shell/PageHeader';
import { ShellBackground } from './shell/ShellBackground';
import type { Page } from '../types';
import { API_MODE_CHANGED_EVENT, getIsPaidApiMode } from '../utils/apiModeUtils';
import { BestPracticeSyncBadge } from './shared/BestPracticeSyncBadge';
import {
    BEST_PRACTICE_SYNC_STATUS_EVENT,
    getBestPracticeSyncFailureLogs,
    getBestPracticeSyncState,
    type BestPracticeSyncFailureLog,
    type BestPracticeSyncState,
} from '../utils/bestPracticeSyncStatus';
import { getStoredTheme, getResolvedTheme, toggleTheme, applyTheme, watchSystemThemeChange, THEME_CHANGED_EVENT, type ThemeMode } from '../utils/themeUtils';
import { useDevMode } from '../contexts/DevModeContext';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { getOperationalModeLabel, isPageVisibleByOperationalMode } from '../utils/operationalModeUtils';
import {
    clearOnePointProofSession,
    getNextOnePointProofStage,
    getOnePointProofStage,
    markOnePointProofReturned,
    ONE_POINT_PROOF_SESSION_EVENT,
    readOnePointProofSession,
    type OnePointProofSession,
} from '../utils/onePointProofSession';
import { cycleUserRolePreset, getUserRolePreset, getUserRolePresetLabel, USER_ROLE_PRESET_CHANGED_EVENT, type UserRolePreset } from '../utils/userRolePresetUtils';
import {
    loadUiCompositionConfig,
    saveUiCompositionConfig,
    UI_COMPOSITION_STORAGE_KEY,
    UI_COMPOSITION_SYNC_EVENT,
    type UiCompositionConfig,
} from '../utils/uiCompositionConfig';
import {
    canUseDevDiagnostics,
    canUseDevDiagnosticsShortcut,
    hasExplicitDevDiagnosticsPermission,
    isDevDiagnosticsHiddenToggleEnabled,
    isLocalDevelopmentEnvironment,
    toggleDevDiagnosticsHiddenToggle,
} from '../config/devDiagnosticsGate';
import {
    getProductGroupLabel,
    getRouteLabel,
    getRouteMeta,
    shouldShowPageHeader,
    type UiAudienceMode,
} from '../config/routeMeta';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    onAdminLogout: () => void | Promise<void>;
}

type MobileTabId = 'home' | 'alerts' | 'profile' | 'predictive' | 'more';

const resolveSiteTitle = (): string => {
    if (typeof window === 'undefined') return '현장 안전관리';

    try {
        const raw = localStorage.getItem('psi_app_settings');
        if (!raw) return '현장 안전관리';
        const parsed = JSON.parse(raw) as { siteName?: unknown };
        const siteName = typeof parsed?.siteName === 'string' ? parsed.siteName.trim() : '';
        return siteName || '현장 안전관리';
    } catch {
        return 'PSI 안전관리';
    }
};

const formatTodayLabel = (): string => {
    try {
        return new Intl.DateTimeFormat('ko-KR', {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
        }).format(new Date());
    } catch {
        return '오늘';
    }
};

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, setCurrentPage, onAdminLogout }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isPaidApiMode, setIsPaidApiMode] = useState(false);
    const [bestPracticeSyncState, setBestPracticeSyncState] = useState<BestPracticeSyncState>(() => getBestPracticeSyncState());
    const [bestPracticeFailureLogs, setBestPracticeFailureLogs] = useState<BestPracticeSyncFailureLog[]>(() => getBestPracticeSyncFailureLogs());
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
    const [isDark, setIsDark] = useState(() => getResolvedTheme(getStoredTheme()) === 'dark');
    const [showScrollTop, setShowScrollTop] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const operatorMenuRef = useRef<HTMLDetailsElement>(null);
    const { isDevMode, toggle: toggleDevMode } = useDevMode();
    const { mode: operationalMode, cycleMode: cycleOperationalMode } = useOperationalMode();
    const [userRolePreset, setUserRolePreset] = useState<UserRolePreset>(() => getUserRolePreset());
    const [devDiagnosticsHiddenToggleEnabled, setDevDiagnosticsHiddenToggleEnabled] = useState<boolean>(() => isDevDiagnosticsHiddenToggleEnabled());
    const [uiCompositionConfig, setUiCompositionConfig] = useState<UiCompositionConfig>(() => loadUiCompositionConfig());
    const [isCompositionEditMode, setIsCompositionEditMode] = useState(false);
    const [onePointProofSession, setOnePointProofSession] = useState<OnePointProofSession | null>(() => readOnePointProofSession());

    const handleScrollToTop = useCallback(() => {
        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const explicitDiagnosticsPermission = hasExplicitDevDiagnosticsPermission();
    const diagnosticsAvailable = canUseDevDiagnostics({
        explicitPermission: explicitDiagnosticsPermission,
        hiddenToggleEnabled: devDiagnosticsHiddenToggleEnabled,
        isLocalDevelopment: isLocalDevelopmentEnvironment(),
    });
    const uiAudienceMode: UiAudienceMode =
        diagnosticsAvailable && operationalMode === 'developer'
            ? 'developer'
            : userRolePreset === 'field-worker'
                ? 'worker'
                : 'practitioner';
    const showDiagnosticsControls = diagnosticsAvailable && currentPage === 'settings';
    const isSettingsPage = currentPage === 'settings';
    const currentRouteMeta = getRouteMeta(currentPage);
    const currentPageTitle = getRouteLabel(currentPage, uiAudienceMode);
    const currentProductGroupLabel = getProductGroupLabel(currentRouteMeta.productGroup);
    const showCommonPageHeader = shouldShowPageHeader(currentPage);
    const siteTitle = resolveSiteTitle();
    const todayLabel = formatTodayLabel();
    const analysisModeLabel = isPaidApiMode ? '고급 분석 사용' : '기본 분석 사용';

    const mobilePageGroupsBase: Record<MobileTabId, Page[]> = {
        home: ['dashboard'],
        alerts: ['ocr-analysis'],
        profile: ['monthly-guidance-report'],
        predictive: ['admin-training'],
        more: ['performance-analysis', 'a4-education-material', 'reports', 'settings'],
    };

    const isMobilePageVisible = (page: Page) =>
        isPageVisibleByOperationalMode(page, operationalMode)
        && !uiCompositionConfig.hiddenSidebarPages.includes(page);

    const filteredMobilePageGroups: Record<MobileTabId, Page[]> = {
        home: mobilePageGroupsBase.home.filter(isMobilePageVisible),
        alerts: mobilePageGroupsBase.alerts.filter(isMobilePageVisible),
        profile: mobilePageGroupsBase.profile.filter(isMobilePageVisible),
        predictive: mobilePageGroupsBase.predictive.filter(isMobilePageVisible),
        more: mobilePageGroupsBase.more.filter(isMobilePageVisible),
    };

    const mobileBottomTabs: Array<{ id: MobileTabId; label: string; page?: Page; icon: React.ReactNode }> = [
        {
            id: 'home',
            label: '홈',
            page: filteredMobilePageGroups.home[0] || 'dashboard',
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
        },
        {
            id: 'alerts',
            label: '위험분석',
            page: filteredMobilePageGroups.alerts[0],
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m8 5H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2z" /></svg>,
        },
        {
            id: 'profile',
            label: '계도',
            page: filteredMobilePageGroups.profile[0],
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" /></svg>,
        },
        {
            id: 'predictive',
            label: '교육/QR',
            page: filteredMobilePageGroups.predictive[0],
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253" /></svg>,
        },
        {
            id: 'more',
            label: '더보기',
            page: filteredMobilePageGroups.more[0] || 'performance-analysis',
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6h.01M12 12h.01M12 18h.01" /></svg>,
        },
    ];
    const activeMobileTab = (Object.entries(filteredMobilePageGroups).find(([, pages]) => pages.includes(currentPage))?.[0] as MobileTabId | undefined) ?? 'home';

    const mobileQuickLinksRaw: Array<{ page: Page; label: string }> =
        activeMobileTab === 'home'
            ? [{ page: 'dashboard', label: getRouteLabel('dashboard', uiAudienceMode) }]
            : activeMobileTab === 'alerts'
                ? [{ page: 'ocr-analysis', label: getRouteLabel('ocr-analysis', uiAudienceMode) }]
                : activeMobileTab === 'profile'
                    ? [{ page: 'monthly-guidance-report', label: getRouteLabel('monthly-guidance-report', uiAudienceMode) }]
                    : activeMobileTab === 'predictive'
                        ? [{ page: 'admin-training', label: getRouteLabel('admin-training', uiAudienceMode) }]
                        : [
                            { page: 'performance-analysis', label: getRouteLabel('performance-analysis', uiAudienceMode) },
                            { page: 'a4-education-material', label: getRouteLabel('a4-education-material', uiAudienceMode) },
                            { page: 'reports', label: getRouteLabel('reports', uiAudienceMode) },
                            { page: 'settings', label: getRouteLabel('settings', uiAudienceMode) },
                        ];

    const mobileQuickLinks = mobileQuickLinksRaw.filter((item) => isMobilePageVisible(item.page));
    const handlePageChange = (page: Page) => {
        setCurrentPage(page);
        setIsMobileMenuOpen(false); // Close mobile menu on navigation
    };

    const activeOnePointProofStage = getOnePointProofStage(onePointProofSession?.currentStageId);
    const nextOnePointProofStage = getNextOnePointProofStage(onePointProofSession?.completedStageIds || []);
    const showOnePointProofReturn = Boolean(onePointProofSession?.active && currentPage !== 'introduction');

    const handleReturnToOnePointProof = () => {
        setOnePointProofSession(markOnePointProofReturned());
        handlePageChange('introduction');
    };

    const handleEndOnePointProof = () => {
        clearOnePointProofSession();
        setOnePointProofSession(null);
    };

    const handleGoToDashboard = () => {
        if (typeof window !== 'undefined') {
            try {
                if (window.history.pushState) {
                    window.history.pushState('', document.title, window.location.pathname + window.location.search);
                } else {
                    window.location.hash = '';
                }
            } catch {}
        }
        handlePageChange('dashboard');
        if (typeof window !== 'undefined') {
            window.setTimeout(() => {
                const mainElement = mainRef.current;
                if (mainElement) {
                    mainElement.scrollTo({
                        top: 0,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    };

    const handleToggleTheme = () => {
        const next = toggleTheme();
        setThemeMode(next);
        setIsDark(getResolvedTheme(next) === 'dark');
    };

    const handleCompositionConfigChange = (next: UiCompositionConfig) => {
        const saved = saveUiCompositionConfig(next);
        setUiCompositionConfig(saved);
    };

    // 앱 로드 시 저장된 테마 적용
    useEffect(() => {
        const initialMode = getStoredTheme();
        applyTheme(initialMode);
        setThemeMode(initialMode);
        setIsDark(getResolvedTheme(initialMode) === 'dark');

        const sync = () => {
            const mode = getStoredTheme();
            setThemeMode(mode);
            setIsDark(getResolvedTheme(mode) === 'dark');
        };
        window.addEventListener(THEME_CHANGED_EVENT, sync);
        const unwatch = watchSystemThemeChange(sync);
        return () => {
            window.removeEventListener(THEME_CHANGED_EVENT, sync);
            unwatch();
        };
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
        const syncOnePointProofSession = () => setOnePointProofSession(readOnePointProofSession());
        syncOnePointProofSession();
        window.addEventListener(ONE_POINT_PROOF_SESSION_EVENT, syncOnePointProofSession);
        window.addEventListener('storage', syncOnePointProofSession);
        return () => {
            window.removeEventListener(ONE_POINT_PROOF_SESSION_EVENT, syncOnePointProofSession);
            window.removeEventListener('storage', syncOnePointProofSession);
        };
    }, []);

    useEffect(() => {
        const syncRolePreset = () => setUserRolePreset(getUserRolePreset());
        window.addEventListener(USER_ROLE_PRESET_CHANGED_EVENT, syncRolePreset);
        return () => window.removeEventListener(USER_ROLE_PRESET_CHANGED_EVENT, syncRolePreset);
    }, []);

    useEffect(() => {
        if (!isSettingsPage) {
            setIsCompositionEditMode(false);
        }
    }, [isSettingsPage]);

    useEffect(() => {
        const syncComposition = () => {
            setUiCompositionConfig(loadUiCompositionConfig());
        };

        const handleStorage = (event: StorageEvent) => {
            if (!event.key || event.key === UI_COMPOSITION_STORAGE_KEY) {
                syncComposition();
            }
        };

        window.addEventListener('storage', handleStorage);
        window.addEventListener(UI_COMPOSITION_SYNC_EVENT, syncComposition as EventListener);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(UI_COMPOSITION_SYNC_EVENT, syncComposition as EventListener);
        };
    }, []);

    useEffect(() => {
        if (currentPage !== 'settings') return;

        const handleSettingsShortcut = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'd') {
                if (!canUseDevDiagnosticsShortcut()) {
                    return;
                }
                const next = toggleDevDiagnosticsHiddenToggle();
                setDevDiagnosticsHiddenToggleEnabled(next);
            }
        };

        window.addEventListener('keydown', handleSettingsShortcut);
        return () => window.removeEventListener('keydown', handleSettingsShortcut);
    }, [currentPage]);

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

    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;
        const onScroll = () => setShowScrollTop(el.scrollTop > 250);
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const closeOperatorMenu = (event: PointerEvent | KeyboardEvent) => {
            const menu = operatorMenuRef.current;
            if (!menu?.open) return;
            if (event instanceof KeyboardEvent && event.key === 'Escape') {
                menu.removeAttribute('open');
                return;
            }
            if (event instanceof PointerEvent && !menu.contains(event.target as Node)) {
                menu.removeAttribute('open');
            }
        };

        document.addEventListener('pointerdown', closeOperatorMenu);
        document.addEventListener('keydown', closeOperatorMenu);
        return () => {
            document.removeEventListener('pointerdown', closeOperatorMenu);
            document.removeEventListener('keydown', closeOperatorMenu);
        };
    }, []);

    return (
        <AppShell
            desktopSidebar={
                <Sidebar
                    currentPage={currentPage}
                    setCurrentPage={handlePageChange}
                    uiMode={uiAudienceMode}
                    compositionConfig={uiCompositionConfig}
                    compositionEditMode={isCompositionEditMode}
                    onCompositionConfigChange={handleCompositionConfigChange}
                />
            }
            mobileSidebarOverlay={
                isMobileMenuOpen ? (
                    <div className="fixed inset-0 z-50 no-print lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
                        <div
                            className="fixed inset-0 bg-black/60"
                            onClick={() => setIsMobileMenuOpen(false)}
                            aria-hidden="true"
                        />
                        <div className="fixed inset-y-0 left-0 w-72 animate-fade-in">
                            <Sidebar
                                currentPage={currentPage}
                                setCurrentPage={handlePageChange}
                                uiMode={uiAudienceMode}
                                compositionConfig={uiCompositionConfig}
                                compositionEditMode={isCompositionEditMode}
                                onCompositionConfigChange={handleCompositionConfigChange}
                            />
                        </div>
                    </div>
                ) : undefined
            }
            topBar={
                <TopBar
                    siteName={siteTitle}
                    currentPageTitle={currentPageTitle}
                    todayLabel={todayLabel}
                    statusLabel="정상 운영"
                    analysisModeLabel={analysisModeLabel}
                    isMobileMenuOpen={isMobileMenuOpen}
                    onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
                    isDark={isDark}
                    themeMode={themeMode}
                    onToggleTheme={handleToggleTheme}
                    onGoToDashboard={currentPage !== 'dashboard' ? handleGoToDashboard : undefined}
                    controls={
                        <div className="flex items-center gap-1">
                            {isSettingsPage && (
                                <button
                                    type="button"
                                    onClick={() => setIsCompositionEditMode((prev) => !prev)}
                                    className={`hidden min-h-10 rounded-xl border px-3 text-[11px] font-black transition-colors md:inline-flex md:items-center ${
                                        isCompositionEditMode
                                            ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700'
                                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                                    }`}
                                    title="설정 페이지에서 메뉴 구성 편집 열기"
                                    aria-label={isCompositionEditMode ? '메뉴 구성 편집 닫기' : '메뉴 구성 편집 열기'}
                                >
                                    {isCompositionEditMode ? '편집 닫기' : '메뉴 구성'}
                                </button>
                            )}
                            {showDiagnosticsControls && (
                                <button
                                    type="button"
                                    onClick={cycleOperationalMode}
                                    className="ml-1 min-h-11 rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2 text-[10px] font-black text-indigo-200 transition-colors hover:bg-indigo-500/25"
                                    title="운영 모드 순환: 실무 즉시 → 표준 운영 → 개발 확장"
                                    aria-label="운영 모드 변경"
                                >
                                    {getOperationalModeLabel(operationalMode)}
                                </button>
                            )}
                            {isDevMode && uiAudienceMode === 'developer' && <BestPracticeSyncBadge state={bestPracticeSyncState} failureLogs={bestPracticeFailureLogs} />}
                            {showDiagnosticsControls && (
                                <button
                                    type="button"
                                    onClick={toggleDevMode}
                                    className={`ml-1 flex min-h-11 items-center justify-center rounded-lg border px-2 text-[10px] font-black tracking-wider transition-colors ${
                                        isDevMode
                                            ? 'border-violet-400 bg-violet-600 text-white hover:bg-violet-500'
                                            : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                                    }`}
                                    aria-label={isDevMode ? '진단 기능 끄기' : '진단 기능 켜기'}
                                    title={isDevMode ? '진단 기능 ON' : '진단 기능 OFF'}
                                >
                                    {isDevMode ? '진단 ON' : '진단 OFF'}
                                </button>
                            )}
                            <details ref={operatorMenuRef} className="psi-operator-menu relative">
                                <summary aria-label="운영자 메뉴 열기" className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10">
                                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-950 text-[10px] font-black text-white dark:bg-blue-500">PSI</span>
                                    <span className="hidden text-left md:block">
                                        <b className="block text-[11px] leading-none">{getUserRolePresetLabel(userRolePreset)}</b>
                                        <small className="mt-1 block text-[9px] font-semibold leading-none psi-copy-subtle">운영자 메뉴</small>
                                    </span>
                                    <svg className="hidden h-3.5 w-3.5 md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                                    </svg>
                                </summary>
                                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                                    <div className="px-3 py-2">
                                        <p className="text-xs font-black">현장 관리자</p>
                                        <p className="mt-1 text-[10px] font-semibold psi-copy-subtle">안전 운영 계정</p>
                                    </div>
                                    {uiAudienceMode !== 'worker' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                operatorMenuRef.current?.removeAttribute('open');
                                                handlePageChange('introduction');
                                            }}
                                            className="mt-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-xs font-bold text-blue-800 hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-500/10"
                                        >
                                            <span>
                                                <span className="block">PSI 브랜드 스토리</span>
                                                <span className="mt-0.5 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">상품 소개</span>
                                            </span>
                                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-950 text-[10px] font-black text-white dark:bg-blue-500">PSI</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUserRolePreset(cycleUserRolePreset());
                                            operatorMenuRef.current?.removeAttribute('open');
                                        }}
                                        className="flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        사용자 화면
                                        <span className="psi-status-badge">{getUserRolePresetLabel(userRolePreset)}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            operatorMenuRef.current?.removeAttribute('open');
                                            void onAdminLogout();
                                        }}
                                        className="mt-1 flex min-h-10 w-full items-center rounded-xl px-3 text-left text-xs font-bold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                    >
                                        관리자 로그아웃
                                    </button>
                                </div>
                            </details>
                        </div>
                    }
                />
            }
            content={
                <main ref={mainRef} className={`relative flex-1 overflow-y-auto p-3 ${currentPage === 'dashboard' ? 'pb-2 sm:p-4 md:p-4 lg:px-6 lg:py-3.5' : 'pb-24 sm:p-4 md:p-6 lg:p-8 lg:pb-10'}`}>
                    <ShellBackground isDark={isDark} />
                    <div key={currentPage} className="mx-auto w-full max-w-[1440px] animate-fade-in-up">
                        {showOnePointProofReturn && (
                            <section data-one-point-proof-return="banner" className="mb-3 rounded-2xl border border-indigo-200 bg-white px-3 py-3 shadow-sm dark:border-indigo-400/20 dark:bg-slate-900/95">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white dark:bg-indigo-500">2분 증명모드</span>
                                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
                                                현재 확인: {activeOnePointProofStage?.shortTitle || '기능 화면'}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs font-bold leading-relaxed text-slate-700 dark:text-slate-200 break-keep">
                                            이 화면을 확인한 뒤 원포인트 증명 화면으로 돌아가면 {nextOnePointProofStage ? `${nextOnePointProofStage.title} 단계가 다음 순서로 표시됩니다.` : '전체 시연 완료 상태가 표시됩니다.'}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-black sm:min-w-[240px]">
                                        <button
                                            type="button"
                                            data-one-point-proof-return="action-return"
                                            onClick={handleReturnToOnePointProof}
                                            className="rounded-xl bg-indigo-600 px-3 py-2 text-white transition-colors hover:bg-indigo-700"
                                        >
                                            증명모드로 돌아가기
                                        </button>
                                        <button
                                            type="button"
                                            data-one-point-proof-return="action-end"
                                            onClick={handleEndOnePointProof}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                        >
                                            시연 종료
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}
                        <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar lg:hidden">
                            {mobileQuickLinks.map((item) => {
                                const isActive = currentPage === item.page;
                                return (
                                    <button
                                        key={item.page}
                                        type="button"
                                        onClick={() => handlePageChange(item.page)}
                                        className={`min-h-11 shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
                                            isActive
                                                ? 'border-blue-600 bg-blue-700 text-white shadow-sm'
                                                : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                        <PageHeader
                            show={showCommonPageHeader}
                            groupLabel={currentProductGroupLabel}
                            title={currentPageTitle}
                            description={currentRouteMeta.description}
                        />
                        {children}
                    </div>
                </main>
            }
            mobileBottomNav={
                <nav className="psi-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 backdrop-blur transition-colors lg:hidden no-print" aria-label="모바일 하단 탐색">
                    <div className="grid grid-cols-5 gap-1">
                        {mobileBottomTabs.map((tab) => {
                            const isActive = tab.id === activeMobileTab;
                            const handleClick = () => {
                                if (tab.page) {
                                    handlePageChange(tab.page);
                                }
                            };

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={handleClick}
                                    className={`relative flex min-h-[60px] flex-col items-center justify-center rounded-xl px-1 py-2 text-[11px] font-bold transition-colors ${
                                        isActive
                                            ? 'bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200'
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                                    }`}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    <span>{tab.icon}</span>
                                    <span className="mt-1">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
            }
            scrollTopButton={
                showScrollTop ? (
                    <button
                        type="button"
                        onClick={handleScrollToTop}
                        className="fixed bottom-24 right-5 z-[300] flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white shadow-lg transition-colors hover:bg-blue-600 active:scale-95 lg:bottom-6 no-print"
                        aria-label="최상단으로 이동"
                        title="최상단으로 이동"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                ) : undefined
            }
            footer={<Footer />}
        />
    );
};
