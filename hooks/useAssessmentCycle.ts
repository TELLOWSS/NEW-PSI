import { useEffect, useMemo, useState } from 'react';
import type { AssessmentCycleSettings } from '../types';
import {
    getAssessmentCycleCopy,
    PSI_APP_SETTINGS_CHANGED_EVENT,
    PSI_APP_SETTINGS_STORAGE_KEY,
    readAssessmentCycleFromStorage,
} from '../utils/assessmentCycle';

export const useAssessmentCycle = () => {
    const [cycle, setCycle] = useState<AssessmentCycleSettings>(() => readAssessmentCycleFromStorage());

    useEffect(() => {
        const syncCycle = () => setCycle(readAssessmentCycleFromStorage());
        const syncStorageCycle = (event: StorageEvent) => {
            if (!event.key || event.key === PSI_APP_SETTINGS_STORAGE_KEY) syncCycle();
        };

        window.addEventListener(PSI_APP_SETTINGS_CHANGED_EVENT, syncCycle);
        window.addEventListener('storage', syncStorageCycle);
        return () => {
            window.removeEventListener(PSI_APP_SETTINGS_CHANGED_EVENT, syncCycle);
            window.removeEventListener('storage', syncStorageCycle);
        };
    }, []);

    const copy = useMemo(() => getAssessmentCycleCopy(cycle), [cycle]);
    return { cycle, copy };
};
