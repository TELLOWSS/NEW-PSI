import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
    DEV_MODE_CHANGED_EVENT,
    getIsDevMode,
    toggleDevMode as utilToggleDevMode,
} from '../utils/devModeUtils';

interface DevModeContextValue {
    isDevMode: boolean;
    toggle: () => void;
}

const DevModeContext = createContext<DevModeContextValue>({
    isDevMode: false,
    toggle: () => {},
});

export const DevModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isDevMode, setIsDevMode] = useState(() => getIsDevMode());

    useEffect(() => {
        const sync = () => setIsDevMode(getIsDevMode());
        window.addEventListener(DEV_MODE_CHANGED_EVENT, sync);
        return () => window.removeEventListener(DEV_MODE_CHANGED_EVENT, sync);
    }, []);

    const toggle = useCallback(() => {
        utilToggleDevMode();
        setIsDevMode(getIsDevMode());
    }, []);

    return (
        <DevModeContext.Provider value={{ isDevMode, toggle }}>
            {children}
        </DevModeContext.Provider>
    );
};

/** 어느 컴포넌트에서든 `const { isDevMode } = useDevMode();` 로 사용 */
export const useDevMode = () => useContext(DevModeContext);
