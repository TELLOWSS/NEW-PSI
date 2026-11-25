export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'psi_theme_mode';
export const THEME_CHANGED_EVENT = 'psi-theme-changed';
export const SUNLIGHT_MODE_STORAGE_KEY = 'psi_nexus_sunlight_mode_v1';
export const SUNLIGHT_MODE_CHANGED_EVENT = 'psi-sunlight-mode-changed';
export const MOTION_PAUSED_STORAGE_KEY = 'psi_global_motion_paused_v1';
export const MOTION_PAUSED_CHANGED_EVENT = 'psi-motion-paused-changed';

export function getMotionPaused(): boolean {
    try {
        return localStorage.getItem(MOTION_PAUSED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function applyMotionPaused(paused: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.psiMotionPaused = paused ? 'true' : 'false';
}

export function setMotionPaused(paused: boolean): boolean {
    try {
        localStorage.setItem(MOTION_PAUSED_STORAGE_KEY, paused ? 'true' : 'false');
    } catch {
    }
    applyMotionPaused(paused);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(MOTION_PAUSED_CHANGED_EVENT));
    }
    return paused;
}

export function getSunlightMode(): boolean {
    try {
        return localStorage.getItem(SUNLIGHT_MODE_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function applySunlightMode(enabled: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.psiSunlight = enabled ? 'true' : 'false';
}

export function setSunlightMode(enabled: boolean): boolean {
    try {
        localStorage.setItem(SUNLIGHT_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
    }
    if (enabled && getResolvedTheme() !== 'light') {
        setTheme('light');
    }
    applySunlightMode(enabled);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(SUNLIGHT_MODE_CHANGED_EVENT));
    }
    return enabled;
}

export function getStoredTheme(): ThemeMode {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    } catch {
    }
    return 'system';
}

export function setStoredTheme(mode: ThemeMode): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
    }
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

export function applyTheme(mode: ThemeMode): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const resolved = resolveTheme(mode);
    if (resolved === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }

    root.dataset.themeMode = mode;
    root.dataset.themeResolved = resolved;
    root.style.colorScheme = resolved;
}

export function setTheme(mode: ThemeMode): ThemeMode {
    setStoredTheme(mode);
    applyTheme(mode);
    if (resolveTheme(mode) === 'dark') {
        try {
            localStorage.setItem(SUNLIGHT_MODE_STORAGE_KEY, 'false');
        } catch {
        }
        applySunlightMode(false);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(SUNLIGHT_MODE_CHANGED_EVENT));
        }
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    }
    return mode;
}

export function toggleTheme(): ThemeMode {
    const current = getStoredTheme();
    const next: ThemeMode = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    setTheme(next);
    return next;
}

export function getResolvedTheme(mode: ThemeMode = getStoredTheme()): ResolvedTheme {
    return resolveTheme(mode);
}

export function watchSystemThemeChange(onChange: () => void): () => void {
    if (typeof window === 'undefined' || !window.matchMedia) {
        return () => {};
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
        if (getStoredTheme() === 'system') {
            applyTheme('system');
            window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
        }
        onChange();
    };

    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }

    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
}

/** FOUC 방지용 — <head>에 인라인 호출 */
export function initThemeEarly(): void {
    applyTheme(getStoredTheme());
    applySunlightMode(getSunlightMode());
    applyMotionPaused(getMotionPaused());
}
