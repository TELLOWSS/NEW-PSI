import { useState, useEffect } from 'react';
import type { UiAudienceMode } from '../config/routeMeta';
import { getUserRolePreset, USER_ROLE_PRESET_CHANGED_EVENT } from '../utils/userRolePresetUtils';
import { getOperationalMode, OPERATIONAL_MODE_CHANGED_EVENT } from '../utils/operationalModeUtils';
import { DEV_MODE_CHANGED_EVENT } from '../utils/devModeUtils';
import {
    canUseDevDiagnostics,
    hasExplicitDevDiagnosticsPermission,
    isDevDiagnosticsHiddenToggleEnabled,
    isLocalDevelopmentEnvironment,
} from '../config/devDiagnosticsGate';

export const useUiAudienceMode = (): UiAudienceMode => {
    const calculateMode = (): UiAudienceMode => {
        const userRolePreset = getUserRolePreset();
        const operationalMode = getOperationalMode();
        const explicitDiagnosticsPermission = hasExplicitDevDiagnosticsPermission();
        const devDiagnosticsHiddenToggleEnabled = isDevDiagnosticsHiddenToggleEnabled();
        
        const diagnosticsAvailable = canUseDevDiagnostics({
            explicitPermission: explicitDiagnosticsPermission,
            hiddenToggleEnabled: devDiagnosticsHiddenToggleEnabled,
            isLocalDevelopment: isLocalDevelopmentEnvironment(),
        });
        
        return diagnosticsAvailable && operationalMode === 'developer'
            ? 'developer'
            : userRolePreset === 'field-worker'
                ? 'worker'
                : 'practitioner';
    };

    const [mode, setMode] = useState<UiAudienceMode>(() => calculateMode());

    useEffect(() => {
        const sync = () => {
            setMode(calculateMode());
        };

        window.addEventListener(USER_ROLE_PRESET_CHANGED_EVENT, sync);
        window.addEventListener(OPERATIONAL_MODE_CHANGED_EVENT, sync);
        window.addEventListener(DEV_MODE_CHANGED_EVENT, sync);
        window.addEventListener('storage', sync);

        return () => {
            window.removeEventListener(USER_ROLE_PRESET_CHANGED_EVENT, sync);
            window.removeEventListener(OPERATIONAL_MODE_CHANGED_EVENT, sync);
            window.removeEventListener(DEV_MODE_CHANGED_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    return mode;
};
