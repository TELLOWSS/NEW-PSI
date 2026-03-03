const API_MODE_STORAGE_KEY = 'psi_is_paid_api_mode';
export const API_MODE_CHANGED_EVENT = 'psi-api-mode-changed';

export const getIsPaidApiMode = (): boolean => {
    try {
        const saved = localStorage.getItem(API_MODE_STORAGE_KEY);
        if (!saved) return false;

        const parsed = JSON.parse(saved);
        return parsed === true;
    } catch {
        return false;
    }
};

export const setIsPaidApiMode = (isPaidApiMode: boolean): void => {
    localStorage.setItem(API_MODE_STORAGE_KEY, JSON.stringify(isPaidApiMode));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(API_MODE_CHANGED_EVENT));
    }
};

export const API_MODE_WARNING_MESSAGE = "대규모 고속 처리를 위해 유료 API가 사용되며 과금이 발생할 수 있습니다. 켜시겠습니까?";
