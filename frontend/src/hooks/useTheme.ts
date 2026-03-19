import { useCallback, useEffect, useMemo, useState } from 'react';

export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'refugio.theme';

function getInitialTheme(): AppTheme {
    const saved = (localStorage.getItem(STORAGE_KEY) as AppTheme | null) ?? null;
    if (saved === 'dark' || saved === 'light') return saved;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)')?.matches ?? false;
    return prefersLight ? 'light' : 'dark';
}

function applyThemeToDom(theme: AppTheme) {
    document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
    const [theme, setThemeState] = useState<AppTheme>(() => getInitialTheme());

    useEffect(() => {
        applyThemeToDom(theme);
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const setTheme = useCallback((next: AppTheme) => setThemeState(next), []);
    const toggleTheme = useCallback(() => {
        setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
    }, []);

    return useMemo(
        () => ({ theme, setTheme, toggleTheme }),
        [theme, setTheme, toggleTheme]
    );
}

