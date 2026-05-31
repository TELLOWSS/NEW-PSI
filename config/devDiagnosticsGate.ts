const DEV_DIAGNOSTICS_HIDDEN_TOGGLE_KEY = 'psi_dev_diagnostics_hidden_toggle_v1';

const normalizeEnvFlag = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    return value.trim().toLowerCase() === 'true';
};

export const isDevDiagnosticsEnvEnabled = (): boolean =>
    normalizeEnvFlag(import.meta.env.VITE_ENABLE_DEV_DIAGNOSTICS);

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

export const canUseDevDiagnostics = (options: {
    isAdvancedAdmin: boolean;
    hiddenToggleEnabled?: boolean;
}): boolean => {
    return (
        isDevDiagnosticsEnvEnabled() ||
        options.isAdvancedAdmin ||
        Boolean(options.hiddenToggleEnabled)
    );
};
