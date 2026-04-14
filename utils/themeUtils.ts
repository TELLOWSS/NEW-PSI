export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'psi_theme_mode';
export const THEME_CHANGED_EVENT = 'psi-theme-changed';

export function getStoredTheme(): ThemeMode {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') return saved;
    } catch {
    }
    // OS 기본값 따르기
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

export function setStoredTheme(mode: ThemeMode): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
    }
}

export function applyTheme(mode: ThemeMode): void {
    const root = document.documentElement;
    if (mode === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

export function toggleTheme(): ThemeMode {
    const current = getStoredTheme();
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
    setStoredTheme(next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    return next;
}

/** FOUC 방지용 — <head>에 인라인 호출 */
export function initThemeEarly(): void {
    applyTheme(getStoredTheme());
}
