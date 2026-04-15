import { useEffect, useRef, useState } from 'react';

const MOBILE_BACK_GUARD_METRICS_KEY = 'psi_mobile_back_guard_metrics_v1';

type MobileBackGuardEventType =
    | 'first_back_warning'
    | 'double_back_exit'
    | 'active_work_confirmed_exit'
    | 'active_work_stay';

type MobileBackGuardMetricsEntry = {
    guardStateKey: string;
    firstBackWarning: number;
    doubleBackExit: number;
    activeWorkConfirmedExit: number;
    activeWorkStay: number;
    lastEventAt: string;
};

const trackMobileBackGuardEvent = (guardStateKey: string, eventType: MobileBackGuardEventType) => {
    if (typeof window === 'undefined') return;

    try {
        const raw = window.localStorage.getItem(MOBILE_BACK_GUARD_METRICS_KEY);
        const parsed = raw ? JSON.parse(raw) as Record<string, MobileBackGuardMetricsEntry> : {};
        const now = new Date().toISOString();

        const current: MobileBackGuardMetricsEntry = parsed[guardStateKey] || {
            guardStateKey,
            firstBackWarning: 0,
            doubleBackExit: 0,
            activeWorkConfirmedExit: 0,
            activeWorkStay: 0,
            lastEventAt: now,
        };

        switch (eventType) {
            case 'first_back_warning':
                current.firstBackWarning += 1;
                break;
            case 'double_back_exit':
                current.doubleBackExit += 1;
                break;
            case 'active_work_confirmed_exit':
                current.activeWorkConfirmedExit += 1;
                break;
            case 'active_work_stay':
                current.activeWorkStay += 1;
                break;
            default:
                break;
        }

        current.lastEventAt = now;
        parsed[guardStateKey] = current;
        window.localStorage.setItem(MOBILE_BACK_GUARD_METRICS_KEY, JSON.stringify(parsed));
    } catch {
        // ignore telemetry storage errors
    }
};

interface UseMobileBackGuardOptions {
    enabled?: boolean;
    hasActiveWork: boolean;
    mobileMaxWidth?: number;
    guardStateKey?: string;
    confirmExitMessage?: string;
    stayMessage?: string;
    idleBackMessage?: string;
    exitMessage?: string;
    guideDurationMs?: number;
}

export const useMobileBackGuard = ({
    enabled = true,
    hasActiveWork,
    mobileMaxWidth = 1024,
    guardStateKey = '__mobileBackGuard',
    confirmExitMessage = '현재 작업이 진행 중입니다. 저장된 범위까지만 유지하고 이전 화면으로 이동하시겠습니까?',
    stayMessage = '현재 화면에서 계속 작업합니다.',
    idleBackMessage = '한 번 더 누르면 이전 화면으로 이동합니다.',
    exitMessage = '이전 화면으로 이동합니다.',
    guideDurationMs = 1800,
}: UseMobileBackGuardOptions) => {
    const [guideMessage, setGuideMessage] = useState('');
    const hasActiveWorkRef = useRef(hasActiveWork);
    const allowBrowserBackRef = useRef(false);
    const backPressTimestampRef = useRef(0);
    const guideTimerRef = useRef<number | null>(null);

    useEffect(() => {
        hasActiveWorkRef.current = hasActiveWork;
    }, [hasActiveWork]);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        const media = window.matchMedia(`(max-width: ${mobileMaxWidth}px)`);
        if (!media.matches) return;

        const showGuide = (message: string) => {
            setGuideMessage(message);
            if (guideTimerRef.current) {
                window.clearTimeout(guideTimerRef.current);
            }
            guideTimerRef.current = window.setTimeout(() => {
                setGuideMessage('');
            }, guideDurationMs);
        };

        window.history.pushState({ ...(window.history.state || {}), [guardStateKey]: true }, '');

        const handlePopState = () => {
            if (allowBrowserBackRef.current) {
                allowBrowserBackRef.current = false;
                return;
            }

            if (hasActiveWorkRef.current) {
                const leaveConfirmed = window.confirm(confirmExitMessage);
                if (!leaveConfirmed) {
                    window.history.pushState({ ...(window.history.state || {}), [guardStateKey]: true }, '');
                    trackMobileBackGuardEvent(guardStateKey, 'active_work_stay');
                    showGuide(stayMessage);
                    return;
                }

                allowBrowserBackRef.current = true;
                trackMobileBackGuardEvent(guardStateKey, 'active_work_confirmed_exit');
                showGuide(exitMessage);
                window.history.back();
                return;
            }

            const now = Date.now();
            if (now - backPressTimestampRef.current < 2000) {
                allowBrowserBackRef.current = true;
                trackMobileBackGuardEvent(guardStateKey, 'double_back_exit');
                showGuide(exitMessage);
                window.history.back();
                return;
            }

            backPressTimestampRef.current = now;
            window.history.pushState({ ...(window.history.state || {}), [guardStateKey]: true }, '');
            trackMobileBackGuardEvent(guardStateKey, 'first_back_warning');
            showGuide(idleBackMessage);
        };

        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
            if (guideTimerRef.current) {
                window.clearTimeout(guideTimerRef.current);
            }
        };
    }, [enabled, mobileMaxWidth, guardStateKey, confirmExitMessage, stayMessage, idleBackMessage, exitMessage, guideDurationMs]);

    return {
        guideMessage,
    };
};
