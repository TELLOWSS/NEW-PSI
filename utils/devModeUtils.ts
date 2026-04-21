/**
 * 개발자 모드 유틸리티
 * - 개발자용 기술 정보를 일반 사용자 화면에서 숨기고
 *   개발자 모드 ON 시에만 표시하는 글로벌 토글을 관리합니다.
 * - sessionStorage 사용: 탭을 닫거나 새로고침하면 OFF로 초기화됩니다.
 */

const DEV_MODE_KEY = 'psi_dev_mode_v1';
export const DEV_MODE_CHANGED_EVENT = 'psi:devModeChanged';

export const getIsDevMode = (): boolean => {
    try {
        return sessionStorage.getItem(DEV_MODE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const setDevMode = (val: boolean): void => {
    try {
        // localStorage에 남아있을 수 있는 이전 값 제거
        try { localStorage.removeItem(DEV_MODE_KEY); } catch { /* ignore */ }
        sessionStorage.setItem(DEV_MODE_KEY, String(val));
        window.dispatchEvent(new CustomEvent(DEV_MODE_CHANGED_EVENT));
    } catch {
        /* storage unavailable */
    }
};

export const toggleDevMode = (): boolean => {
    const next = !getIsDevMode();
    setDevMode(next);
    return next;
};
