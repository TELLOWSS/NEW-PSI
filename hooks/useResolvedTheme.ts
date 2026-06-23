import { useState, useEffect } from 'react';
import { THEME_CHANGED_EVENT } from '../utils/themeUtils';

export const useResolvedTheme = (): 'light' | 'dark' => {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        }
        return 'light';
    });

    useEffect(() => {
        const sync = () => {
            const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            setTheme(current);
        };

        window.addEventListener(THEME_CHANGED_EVENT, sync);
        window.addEventListener('storage', sync);

        return () => {
            window.removeEventListener(THEME_CHANGED_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    return theme;
};
