import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { AppShell } from './shell/AppShell';
import { TopBar } from './shell/TopBar';
import { PageHeader } from './shell/PageHeader';
import { ConnectedPageDecisionBanner } from './shell/ConnectedPageDecisionBanner';
import { PsiUniversalInspectorDrawer } from './shell/PsiUniversalInspectorDrawer';
import { PsiGlobalQuickJump } from './shell/PsiGlobalQuickJump';
import { ShellBackground } from './shell/ShellBackground';
import type { Page, SafetyCheckRecord, WorkerRecord } from '../types';
import { readActiveNexusAuthority } from '../utils/psiPageDecisionBrief';
import { API_MODE_CHANGED_EVENT, getIsPaidApiMode } from '../utils/apiModeUtils';
import { BestPracticeSyncBadge } from './shared/BestPracticeSyncBadge';
import {
    BEST_PRACTICE_SYNC_STATUS_EVENT,
    getBestPracticeSyncFailureLogs,
    getBestPracticeSyncState,
    type BestPracticeSyncFailureLog,
    type BestPracticeSyncState,
} from '../utils/bestPracticeSyncStatus';
import {
    getStoredTheme,
    getResolvedTheme,
    toggleTheme,
    applyTheme,
    watchSystemThemeChange,
    THEME_CHANGED_EVENT,
    getSunlightMode,
    setSunlightMode as setGlobalSunlightMode,
    SUNLIGHT_MODE_CHANGED_EVENT,
    getMotionPaused,
    setMotionPaused as setGlobalMotionPaused,
    applyMotionPaused,
    MOTION_PAUSED_CHANGED_EVENT,
    type ThemeMode,
} from '../utils/themeUtils';
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
import { useAssessmentCycle } from '../hooks/useAssessmentCycle';
import { getCycleAwareRouteDescription, getCycleAwareRouteLabel } from '../utils/assessmentCycle';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    onAdminLogout: () => void | Promise<void>;
    workerRecords?: readonly WorkerRecord[];
    safetyCheckRecords?: readonly SafetyCheckRecord[];
    onOpenWorkerRecord?: (record: WorkerRecord) => void;
}

type MobileTabId = 'home' | 'alerts' | 'inspector' | 'predictive' | 'more';

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

export const Layout: React.FC<LayoutProps> = ({
    children,
    currentPage,
    setCurrentPage,
    onAdminLogout,
    workerRecords = [],
    safetyCheckRecords = [],
    onOpenWorkerRecord,
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isPaidApiMode, setIsPaidApiMode] = useState(false);
    const [bestPracticeSyncState, setBestPracticeSyncState] = useState<BestPracticeSyncState>(() => getBestPracticeSyncState());
    const [bestPracticeFailureLogs, setBestPracticeFailureLogs] = useState<BestPracticeSyncFailureLog[]>(() => getBestPracticeSyncFailureLogs());
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
    const [isDark, setIsDark] = useState(() => getResolvedTheme(getStoredTheme()) === 'dark');
    const [sunlightMode, setSunlightMode] = useState<boolean>(() => getSunlightMode());
    const [motionPaused, setMotionPaused] = useState<boolean>(() => getMotionPaused());
    const [isInspectorDrawerOpen, setIsInspectorDrawerOpen] = useState(false);
    const [isQuickJumpOpen, setIsQuickJumpOpen] = useState(false);
    const [nexusAuthority, setNexusAuthority] = useState(() => readActiveNexusAuthority());
    const [showScrollTop, setShowScrollTop] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const navigationScroll = useRef(new Map<Page, number>());
    const restoringScroll = useRef(false);
    const operatorMenuRef = useRef<HTMLDetailsElement>(null);
    const mobileMenuDialogRef = useRef<HTMLDivElement>(null);
    const mobileMenuPreviousFocusRef = useRef<HTMLElement | null>(null);
    const { isDevMode, toggle: toggleDevMode } = useDevMode();
    const { mode: operationalMode, cycleMode: cycleOperationalMode } = useOperationalMode();
    const { copy: assessmentCycleCopy } = useAssessmentCycle();
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
        diagnosticsAvailable && isDevMode && operationalMode === 'developer'
            ? 'developer'
            : 'practitioner';
    const showDiagnosticsControls = diagnosticsAvailable && currentPage === 'settings';
    const isSettingsPage = currentPage === 'settings';
    const currentRouteMeta = getRouteMeta(currentPage);
    const resolvePageLabel = (page: Page) => getCycleAwareRouteLabel(
        page,
        getRouteLabel(page, uiAudienceMode),
        assessmentCycleCopy,
    );
    const currentPageTitle = resolvePageLabel(currentPage);
    const currentPageDescription = getCycleAwareRouteDescription(
        currentPage,
        currentRouteMeta.description,
        assessmentCycleCopy,
    );
    const currentProductGroupLabel = getProductGroupLabel(currentRouteMeta.productGroup);
    const showCommonPageHeader = shouldShowPageHeader(currentPage);
    const siteTitle = resolveSiteTitle();
    const todayLabel = formatTodayLabel();
    const analysisModeLabel = isPaidApiMode ? '고급 분석 사용' : '기본 분석 사용';

    const mobilePageGroupsBase: Record<MobileTabId, Page[]> = {
        home: ['dashboard', 'safety-nexus'],
        alerts: ['ocr-analysis', 'accident-bigdata'],
        inspector: ['safety-inspector', 'site-issue-management'],
        predictive: ['education-return', 'a4-education-material', 'monthly-guidance-report', 'reports', 'admin-training'],
        more: ['performance-analysis', 'worker-management', 'settings'],
    };

    const isMobilePageVisible = (page: Page) =>
        isPageVisibleByOperationalMode(page, operationalMode)
        && !uiCompositionConfig.hiddenSidebarPages.includes(page);

    const filteredMobilePageGroups: Record<MobileTabId, Page[]> = {
        home: mobilePageGroupsBase.home.filter(isMobilePageVisible),
        alerts: mobilePageGroupsBase.alerts.filter(isMobilePageVisible),
        inspector: mobilePageGroupsBase.inspector.filter(isMobilePageVisible),
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
            page: filteredMobilePageGroups.alerts[0] || 'ocr-analysis',
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m8 5H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2z" /></svg>,
        },
        {
            id: 'inspector',
            label: '사진점검',
            page: filteredMobilePageGroups.inspector[0] || 'safety-inspector',
            icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h2.5l1.5-2h6l1.5 2H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" strokeWidth={2} /></svg>,
        },
        {
            id: 'predictive',
            label: '교육자료',
            page: filteredMobilePageGroups.predictive[0] || 'education-return',
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

    const handlePageChange = (page: Page) => {
        if (currentPage === 'dashboard' || currentPage === 'safety-nexus') {
            navigationScroll.current.set(currentPage, mainRef.current?.scrollTop || 0);
        }
        setCurrentPage(page);
        setIsMobileMenuOpen(false); // Close mobile menu on navigation
    };

    const handleOpenMobileMenu = useCallback(() => {
        mobileMenuPreviousFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setIsMobileMenuOpen(true);
    }, []);

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
            } catch { }
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
        setSunlightMode(getSunlightMode());
    };

    const handleToggleSunlightMode = () => {
        const next = setGlobalSunlightMode(!sunlightMode);
        setSunlightMode(next);
        const mode = getStoredTheme();
        setThemeMode(mode);
        setIsDark(getResolvedTheme(mode) === 'dark');
    };

    const handleToggleMotionPaused = () => {
        const next = setGlobalMotionPaused(!motionPaused);
        setMotionPaused(next);
    };

    const handleCompositionConfigChange = (next: UiCompositionConfig) => {
        const saved = saveUiCompositionConfig(next);
        setUiCompositionConfig(saved);
    };

    // 앱 로드 시 저장된 테마·야외고대비·모션상태 동기화
    useEffect(() => {
        const initialMode = getStoredTheme();
        applyTheme(initialMode);
        applyMotionPaused(getMotionPaused());
        setThemeMode(initialMode);
        setIsDark(getResolvedTheme(initialMode) === 'dark');

        const sync = () => {
            const mode = getStoredTheme();
            setThemeMode(mode);
            setIsDark(getResolvedTheme(mode) === 'dark');
            setSunlightMode(getSunlightMode());
        };
        const syncSun = () => setSunlightMode(getSunlightMode());
        const syncMotion = () => setMotionPaused(getMotionPaused());
        const syncAuth = () => setNexusAuthority(readActiveNexusAuthority());
        window.addEventListener(THEME_CHANGED_EVENT, sync);
        window.addEventListener(SUNLIGHT_MODE_CHANGED_EVENT, syncSun);
        window.addEventListener(MOTION_PAUSED_CHANGED_EVENT, syncMotion);
        window.addEventListener('psi-nexus-authority-updated', syncAuth);
        window.addEventListener('storage', syncAuth);
        const unwatch = watchSystemThemeChange(sync);
        return () => {
            window.removeEventListener(THEME_CHANGED_EVENT, sync);
            window.removeEventListener(SUNLIGHT_MODE_CHANGED_EVENT, syncSun);
            window.removeEventListener(MOTION_PAUSED_CHANGED_EVENT, syncMotion);
            window.removeEventListener('psi-nexus-authority-updated', syncAuth);
            window.removeEventListener('storage', syncAuth);
            unwatch();
        };
    }, []);

    useEffect(() => {
        const handleGlobalQuickJumpShortcut = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                if (currentPage === 'safety-nexus') return;
                event.preventDefault();
                setIsQuickJumpOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleGlobalQuickJumpShortcut);
        return () => window.removeEventListener('keydown', handleGlobalQuickJumpShortcut);
    }, [currentPage]);

    // Keep keyboard focus inside the modal navigation and restore it when closed.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isMobileMenuOpen) {
                setIsMobileMenuOpen(false);
                return;
            }

            if (event.key === 'Tab' && isMobileMenuOpen) {
                const dialog = mobileMenuDialogRef.current;
                if (!dialog) return;
                const focusable = Array.from(dialog.querySelectorAll(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                )) as HTMLElement[];
                const visibleFocusable = focusable.filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
                if (visibleFocusable.length === 0) {
                    event.preventDefault();
                    dialog.focus();
                    return;
                }

                const first = visibleFocusable[0];
                const last = visibleFocusable[visibleFocusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };

        if (isMobileMenuOpen) {
            document.addEventListener('keydown', handleKeyDown);
            // Prevent body scroll when menu is open
            document.body.style.overflow = 'hidden';
            window.requestAnimationFrame(() => {
                const dialog = mobileMenuDialogRef.current;
                const firstFocusable = dialog?.querySelector<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
                (firstFocusable || dialog)?.focus();
            });
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
            if (isMobileMenuOpen) {
                mobileMenuPreviousFocusRef.current?.focus();
            }
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
        const onScroll = () => {
            setShowScrollTop(el.scrollTop > 250);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [currentPage]);

    useEffect(() => {
        const main = mainRef.current;
        if (!main) return;
        const target = navigationScroll.current.get(currentPage) || 0;
        restoringScroll.current = true;
        // Lazy page content may arrive after the shell. Retry on DOM arrival, never in a draw loop.
        let observer: MutationObserver | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = () => { restoringScroll.current = false; observer?.disconnect(); if (timer) clearTimeout(timer); };
        const restore = () => {
            if (main.scrollHeight - main.clientHeight < target) return;
            main.scrollTo({ top: target, behavior: 'instant' });
            finish();
        };
        observer = new MutationObserver(restore);
        observer.observe(main, { childList: true, subtree: true });
        timer = setTimeout(() => { main.scrollTo({ top: target, behavior: 'instant' }); finish(); }, 3000);
        restore();
        main.focus({ preventScroll: true });
        const cancel = () => finish();
        main.addEventListener('wheel', cancel, { passive: true });
        main.addEventListener('touchstart', cancel, { passive: true });
        main.addEventListener('keydown', cancel);
        return () => { finish(); main.removeEventListener('wheel', cancel); main.removeEventListener('touchstart', cancel); main.removeEventListener('keydown', cancel); };
    }, [currentPage]);

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
                    getPageLabel={resolvePageLabel}
                />
            }
            mobileSidebarOverlay={
                isMobileMenuOpen ? (
                    <div
                        ref={mobileMenuDialogRef}
                        className="fixed inset-0 z-50 no-print lg:hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-label="전체 메뉴"
                        tabIndex={-1}
                    >
                        <div
                            className="fixed inset-0 bg-black/60"
                            onClick={() => setIsMobileMenuOpen(false)}
                            aria-hidden="true"
                        />
                        <div className="fixed inset-y-0 left-0 w-[248px] animate-fade-in">
                            <button
                                type="button"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-600 bg-slate-900/90 text-xl font-bold text-white shadow-lg transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                                aria-label="전체 메뉴 닫기"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                            <Sidebar
                                currentPage={currentPage}
                                setCurrentPage={handlePageChange}
                                uiMode={uiAudienceMode}
                                compositionConfig={uiCompositionConfig}
                                compositionEditMode={isCompositionEditMode}
                                onCompositionConfigChange={handleCompositionConfigChange}
                                getPageLabel={resolvePageLabel}
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
                    statusLabel="관리자 확인 기준"
                    analysisModeLabel={analysisModeLabel}
                    isMobileMenuOpen={isMobileMenuOpen}
                    onOpenMobileMenu={handleOpenMobileMenu}
                    isDark={isDark}
                    themeMode={themeMode}
                    onToggleTheme={handleToggleTheme}
                    sunlightMode={sunlightMode}
                    onToggleSunlightMode={handleToggleSunlightMode}
                    motionPaused={motionPaused}
                    onToggleMotionPaused={handleToggleMotionPaused}
                    onOpenQuickJump={currentPage !== 'safety-nexus' ? () => setIsQuickJumpOpen(true) : undefined}
                    onGoToDashboard={currentPage !== 'dashboard' ? handleGoToDashboard : undefined}
                    controls={
                        <div className="flex items-center gap-1">
                            {isSettingsPage && (
                                <button
                                    type="button"
                                    onClick={() => setIsCompositionEditMode((prev) => !prev)}
                                    className={`hidden min-h-10 rounded-xl border px-3 text-xs font-bold transition-colors md:inline-flex md:items-center ${isCompositionEditMode
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
                                    className="ml-1 min-h-11 rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2 text-[10px] font-bold text-indigo-200 transition-colors hover:bg-indigo-500/25"
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
                                    className={`ml-1 flex min-h-11 items-center justify-center rounded-lg border px-2 text-[10px] font-bold transition-colors ${isDevMode
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
                                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-950 text-[11px] font-bold text-white dark:bg-blue-500">PSI</span>
                                    <span className="hidden text-left md:block">
                                        <b className="block text-xs leading-none">{getUserRolePresetLabel(userRolePreset)}</b>
                                        <small className="psi-small-note mt-1 block leading-none">운영자 메뉴</small>
                                    </span>
                                    <svg className="hidden h-3.5 w-3.5 md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                                    </svg>
                                </summary>
                                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                                    <div className="px-3 py-2">
                                        <p className="psi-item-title">현장 관리자</p>
                                        <p className="psi-small-note mt-1">안전 운영 계정</p>
                                    </div>
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
                                            <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">가치와 운영 원리</span>
                                        </span>
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-950 text-[11px] font-bold text-white dark:bg-blue-500">PSI</span>
                                    </button>
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
                <main
                    id="psi-main-content"
                    ref={mainRef}
                    onClickCapture={() => {
                        if (currentPage === 'dashboard' || currentPage === 'safety-nexus') {
                            navigationScroll.current.set(currentPage, mainRef.current?.scrollTop || 0);
                        }
                    }}
                    tabIndex={-1}
                    className={`relative flex-1 overflow-y-auto p-3 outline-none ${currentPage === 'dashboard' ? 'pb-24 sm:p-4 sm:pb-24 md:p-4 lg:px-6 lg:py-4 lg:pb-12' : 'pb-24 sm:p-4 md:p-6 lg:p-8 lg:pb-12'}`}
                >
                    <ShellBackground isDark={isDark} />
                    <div key={currentPage} className="mx-auto w-full max-w-[1520px] animate-fade-in-up">
                        {showOnePointProofReturn && (
                            <section data-one-point-proof-return="banner" className="mb-3 rounded-2xl border border-indigo-200 bg-white px-3 py-3 shadow-sm dark:border-indigo-400/20 dark:bg-slate-900/95">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white dark:bg-indigo-500">2분 증명모드</span>
                                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
                                                현재 확인: {activeOnePointProofStage?.shortTitle || '기능 화면'}
                                            </span>
                                        </div>
                                        <p className="psi-body-compact mt-1 break-keep dark:text-slate-200">
                                            이 화면을 확인한 뒤 원포인트 증명 화면으로 돌아가면 {nextOnePointProofStage ? `${nextOnePointProofStage.title} 단계가 다음 순서로 표시됩니다.` : '전체 시연 완료 상태가 표시됩니다.'}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold sm:min-w-[240px]">
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
                        {currentPage === 'safety-inspector' && (
                            <nav
                                aria-label="사진점검 빠른 화면 이동"
                                className="mb-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 px-2.5 py-2 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900/95 no-print"
                            >
                                <button
                                    type="button"
                                    onClick={() => handlePageChange('dashboard')}
                                    className="min-h-[40px] flex-1 rounded-xl bg-slate-100 px-2.5 text-xs font-extrabold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    ← 홈
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePageChange('ocr-analysis')}
                                    className="min-h-[40px] flex-1 rounded-xl bg-slate-100 px-2.5 text-xs font-extrabold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    위험분석
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePageChange('accident-bigdata')}
                                    className="min-h-[40px] flex-1 rounded-xl bg-slate-100 px-2.5 text-xs font-extrabold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    사고 빅데이터
                                </button>
                                <button
                                    type="button"
                                    onClick={handleOpenMobileMenu}
                                    className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                >
                                    전체 메뉴
                                </button>
                            </nav>
                        )}
                        <PageHeader
                            key={currentPage}
                            show={showCommonPageHeader}
                            groupLabel={currentProductGroupLabel}
                            title={currentPageTitle}
                            description={currentPageDescription}
                        />
                        {currentPage !== 'safety-nexus' &&
                            currentPage !== 'introduction' &&
                            currentPage !== 'worker-training' && (
                                <ConnectedPageDecisionBanner
                                    currentPage={currentPage}
                                    workerRecords={workerRecords}
                                    safetyCheckRecords={safetyCheckRecords}
                                    onNavigateToPage={handlePageChange}
                                    onOpenInspectorDrawer={() => setIsInspectorDrawerOpen(true)}
                                />
                            )}
                        {children}
                    </div>
                </main>
            }
            mobileBottomNav={currentPage === 'safety-inspector' ? undefined :
                <nav className="psi-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 backdrop-blur transition-colors lg:hidden no-print" aria-label="모바일 하단 탐색">
                    <div className="grid grid-cols-5 gap-1">
                        {mobileBottomTabs.map((tab) => {
                            const isActive = tab.id === activeMobileTab;
                            const handleClick = () => {
                                if (tab.id === 'more') {
                                    setIsMobileMenuOpen(true);
                                    return;
                                }
                                if (tab.page) {
                                    handlePageChange(tab.page);
                                }
                            };

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={handleClick}
                                    className={`relative flex min-h-[60px] flex-col items-center justify-center rounded-xl px-1 py-2 text-[11px] font-bold transition-colors ${isActive
                                        ? 'bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200'
                                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                                        }`}
                                    aria-current={isActive ? 'page' : undefined}
                                    aria-haspopup={tab.id === 'more' ? 'dialog' : undefined}
                                    aria-expanded={tab.id === 'more' ? isMobileMenuOpen : undefined}
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
                <>
                    {showScrollTop && currentPage !== 'safety-inspector' ? (
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
                    ) : null}
                    <PsiUniversalInspectorDrawer
                        open={isInspectorDrawerOpen}
                        onClose={() => setIsInspectorDrawerOpen(false)}
                        authority={nexusAuthority}
                        onNavigateToPage={handlePageChange}
                    />
                    <PsiGlobalQuickJump
                        open={isQuickJumpOpen}
                        onClose={() => setIsQuickJumpOpen(false)}
                        currentPage={currentPage}
                        workerRecords={workerRecords}
                        onNavigateToPage={handlePageChange}
                        onOpenWorkerRecord={onOpenWorkerRecord}
                        onOpenInspector={() => setIsInspectorDrawerOpen(true)}
                        onToggleSunlight={handleToggleSunlightMode}
                        onToggleMotion={handleToggleMotionPaused}
                        onToggleTheme={handleToggleTheme}
                    />
                </>
            }
            footer={<Footer />}
        />
    );
};
