const DEV_DIAGNOSTICS_HIDDEN_TOGGLE_KEY = 'psi_dev_diagnostics_hidden_toggle_v1';
const DEV_DIAGNOSTICS_EXPLICIT_PERMISSION_KEY = 'psi_dev_diagnostics_explicit_permission_v1';

const normalizeEnvFlag = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    return value.trim().toLowerCase() === 'true';
};

export const isDevDiagnosticsEnvEnabled = (): boolean =>
    normalizeEnvFlag(import.meta.env.VITE_ENABLE_DEV_DIAGNOSTICS);

export const isLocalDevelopmentEnvironment = (): boolean => Boolean(import.meta.env.DEV);

export const hasExplicitDevDiagnosticsPermission = (): boolean => {
    if (typeof window === 'undefined') return false;
    const localValue = localStorage.getItem(DEV_DIAGNOSTICS_EXPLICIT_PERMISSION_KEY);
    const sessionValue = sessionStorage.getItem(DEV_DIAGNOSTICS_EXPLICIT_PERMISSION_KEY);
    return localValue === '1' || localValue === 'true' || sessionValue === '1' || sessionValue === 'true';
};

export const isDevDiagnosticsHiddenToggleEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DEV_DIAGNOSTICS_HIDDEN_TOGGLE_KEY) === '1';
};

export const toggleDevDiagnosticsHiddenToggle = (): boolean => {
    if (typeof window === 'undefined') return false;
    const next = !isDevDiagnosticsHiddenToggleEnabled();
    localStorage.setItem(DEV_DIAGNOSTICS_HIDDEN_TOGGLE_KEY, next ? '1' : '0');
    return next;
};

export const canUseDevDiagnosticsShortcut = (): boolean => isDevDiagnosticsEnvEnabled();

export const canUseDevDiagnostics = (options: {
    explicitPermission: boolean;
    hiddenToggleEnabled?: boolean;
    isLocalDevelopment?: boolean;
    envEnabled?: boolean;
}): boolean => {
    const envEnabled = options.envEnabled ?? isDevDiagnosticsEnvEnabled();
    if (!envEnabled) return false;

    return (
        options.explicitPermission ||
        Boolean(options.hiddenToggleEnabled) ||
        Boolean(options.isLocalDevelopment ?? isLocalDevelopmentEnvironment())
    );
};
