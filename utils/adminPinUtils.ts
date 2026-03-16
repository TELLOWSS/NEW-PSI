const ADMIN_PIN_STORAGE_KEY = 'psi_admin_pin';

export const getAdminPin = (): string => {
    try {
        const saved = localStorage.getItem(ADMIN_PIN_STORAGE_KEY);
        if (saved && saved.trim() !== '') {
            return saved;
        }
    } catch {
        // ignore storage read error and fallback to env
    }

    return import.meta.env.VITE_ADMIN_PIN || '1234';
};

export const setAdminPin = (pin: string): void => {
    localStorage.setItem(ADMIN_PIN_STORAGE_KEY, pin);
};
