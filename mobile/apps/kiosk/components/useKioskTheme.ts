import { useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { KIOSK_PALETTE, type KioskThemeMode } from '@/constants/kioskTheme';

const STORAGE_KEY = 'refugio.theme';

function systemTheme(): KioskThemeMode {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

async function getStoredTheme(): Promise<KioskThemeMode | null> {
  try {
    if (Platform.OS === 'web') {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    }
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

async function setStoredTheme(theme: KioskThemeMode): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(STORAGE_KEY, theme);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, theme);
  } catch {
    // ignore storage errors to avoid blocking UI
  }
}

export function useKioskTheme() {
  const [theme, setThemeState] = useState<KioskThemeMode>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getStoredTheme();
      if (!mounted) return;
      setThemeState(stored ?? systemTheme());
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void setStoredTheme(theme);
  }, [theme, ready]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return useMemo(
    () => ({ theme, palette: KIOSK_PALETTE[theme], toggleTheme, ready }),
    [theme, toggleTheme, ready],
  );
}
