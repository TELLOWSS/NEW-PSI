import type { DashboardAudience } from './roleViewModel';

export type UserRolePreset = 'field-worker' | 'manager' | 'site-chief';

const USER_ROLE_PRESET_KEY = 'psi_user_role_preset_v1';
export const USER_ROLE_PRESET_CHANGED_EVENT = 'psi:userRolePresetChanged';

const parseUserRolePreset = (value: string | null): UserRolePreset => {
    if (value === 'field-worker' || value === 'manager' || value === 'site-chief') {
        return value;
    }
    return 'manager';
};

export const getUserRolePreset = (): UserRolePreset => {
    try {
        return parseUserRolePreset(localStorage.getItem(USER_ROLE_PRESET_KEY));
    } catch {
        return 'manager';
    }
};

export const setUserRolePreset = (preset: UserRolePreset): void => {
    try {
        localStorage.setItem(USER_ROLE_PRESET_KEY, preset);
        window.dispatchEvent(new CustomEvent(USER_ROLE_PRESET_CHANGED_EVENT));
    } catch {
        // ignore storage errors
    }
};

export const cycleUserRolePreset = (): UserRolePreset => {
    const current = getUserRolePreset();
    const next: UserRolePreset = current === 'field-worker'
        ? 'manager'
        : current === 'manager'
            ? 'site-chief'
            : 'field-worker';
    setUserRolePreset(next);
    return next;
};

export const getUserRolePresetLabel = (preset: UserRolePreset): string => {
    if (preset === 'field-worker') return '실무자';
    if (preset === 'site-chief') return '소장';
    return '관리자';
};

export const mapUserRolePresetToDashboardAudience = (preset: UserRolePreset): DashboardAudience => {
    if (preset === 'field-worker') return 'worker';
    if (preset === 'site-chief') return 'executive';
    return 'manager';
};
