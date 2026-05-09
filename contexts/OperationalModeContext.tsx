import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
    cycleOperationalMode,
    getOperationalMode,
    OPERATIONAL_MODE_CHANGED_EVENT,
    setOperationalMode as setOperationalModeValue,
    type OperationalMode,
} from '../utils/operationalModeUtils';

interface OperationalModeContextValue {
    mode: OperationalMode;
    setMode: (mode: OperationalMode) => void;
    cycleMode: () => void;
}

const OperationalModeContext = createContext<OperationalModeContextValue>({
    mode: 'immediate',
    setMode: () => {},
    cycleMode: () => {},
});

export const OperationalModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setModeState] = useState<OperationalMode>(() => getOperationalMode());

    useEffect(() => {
        const sync = () => setModeState(getOperationalMode());
        window.addEventListener(OPERATIONAL_MODE_CHANGED_EVENT, sync);
        return () => window.removeEventListener(OPERATIONAL_MODE_CHANGED_EVENT, sync);
    }, []);

    const setMode = useCallback((nextMode: OperationalMode) => {
        setOperationalModeValue(nextMode);
        setModeState(getOperationalMode());
    }, []);

    const cycleMode = useCallback(() => {
        cycleOperationalMode();
        setModeState(getOperationalMode());
    }, []);

    return (
        <OperationalModeContext.Provider value={{ mode, setMode, cycleMode }}>
            {children}
        </OperationalModeContext.Provider>
    );
};

export const useOperationalMode = () => useContext(OperationalModeContext);
