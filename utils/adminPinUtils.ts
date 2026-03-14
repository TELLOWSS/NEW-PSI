const ADMIN_PIN_STORAGE_KEY = 'psi_admin_pin';
const LEGACY_ADMIN_PIN_STORAGE_KEY = 'adminPin';

export const getAdminPin = (): string => {
    try {
        const saved = localStorage.getItem(ADMIN_PIN_STORAGE_KEY);
        if (saved && saved.trim() !== '') {
            return saved;
        }

        const legacy = localStorage.getItem(LEGACY_ADMIN_PIN_STORAGE_KEY);
        if (legacy && legacy.trim() !== '') {
            localStorage.setItem(ADMIN_PIN_STORAGE_KEY, legacy);
            return legacy;
        }
    } catch {
        // ignore storage read error and fallback to env
    }

    return import.meta.env.VITE_ADMIN_PIN || '1234';
};

export const setAdminPin = (pin: string): void => {
    localStorage.setItem(ADMIN_PIN_STORAGE_KEY, pin);
    localStorage.setItem(LEGACY_ADMIN_PIN_STORAGE_KEY, pin);
};
