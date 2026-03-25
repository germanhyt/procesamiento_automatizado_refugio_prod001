import { Platform, type ViewStyle } from 'react-native';

/** Escala de espaciado 4pt — consistente en toda la pantalla Kiosk */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 22,
} as const;

/** Duraciones de animación (ms) */
export const motion = {
  fast: 180,
  normal: 280,
  slow: 420,
} as const;

export function cardShadow(theme: 'dark' | 'light'): ViewStyle {
  const isDark = theme === 'dark';
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.45 : 0.09,
      shadowRadius: 14,
    },
    android: {
      elevation: isDark ? 5 : 3,
    },
    default: {},
  }) ?? {};
}

export function topBarShadow(theme: 'dark' | 'light'): ViewStyle {
  const isDark = theme === 'dark';
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.35 : 0.06,
      shadowRadius: 8,
    },
    android: { elevation: isDark ? 3 : 2 },
    default: {},
  }) ?? {};
}

export function modalCardShadow(): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
    },
    android: { elevation: 12 },
    default: {},
  }) ?? {};
}
