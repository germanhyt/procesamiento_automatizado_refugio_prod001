import React, { createContext, useContext, useCallback, useEffect, useState, useMemo } from 'react';
import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { RUNNER_PALETTE, type RunnerThemeMode, type RunnerPalette } from '@/constants/runnerTheme';

interface ThemeContextType {
  theme: RunnerThemeMode;
  palette: RunnerPalette;
  toggleTheme: () => void;
  isReady: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const STORAGE_KEY = 'runner.theme';

function getSystemTheme(): RunnerThemeMode {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<RunnerThemeMode>('light');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function loadTheme() {
      try {
        let stored: string | null = null;
        if (Platform.OS === 'web') {
          stored = window.localStorage.getItem(STORAGE_KEY);
        } else {
          stored = await SecureStore.getItemAsync(STORAGE_KEY);
        }

        if (stored === 'light' || stored === 'dark') {
          setThemeState(stored as RunnerThemeMode);
        } else {
          setThemeState('light');
        }
      } catch (e) {
        setThemeState('light');
      } finally {
        setIsReady(true);
      }
    }
    loadTheme();
  }, []);

  const toggleTheme = useCallback(async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(nextTheme);
    try {
      if (Platform.OS === 'web') {
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
      } else {
        await SecureStore.setItemAsync(STORAGE_KEY, nextTheme);
      }
    } catch (e) {}
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    palette: RUNNER_PALETTE[theme],
    toggleTheme,
    isReady
  }), [theme, toggleTheme, isReady]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useRunnerTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useRunnerTheme must be used within ThemeProvider');
  return context;
};
