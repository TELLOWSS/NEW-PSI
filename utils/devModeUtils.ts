/**
 * 개발자 모드 유틸리티
 * - 개발자용 기술 정보(하네스 상태, 저장 연결, 승인 흐름 등)를 일반 사용자 화면에서 숨기고
 *   개발자 모드 ON 시에만 표시하는 글로벌 토글을 관리합니다.
 */

const DEV_MODE_KEY = 'psi_dev_mode_v1';
export const DEV_MODE_CHANGED_EVENT = 'psi:devModeChanged';

export const getIsDevMode = (): boolean => {
    try {
        return localStorage.getItem(DEV_MODE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const setDevMode = (val: boolean): void => {
    try {
        localStorage.setItem(DEV_MODE_KEY, String(val));
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
