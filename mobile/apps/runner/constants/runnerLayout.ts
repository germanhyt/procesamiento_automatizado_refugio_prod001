import { Platform, type ViewStyle } from 'react-native';

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
  sm: 10,
  md: 14,
  lg: 16,
} as const;

export function topBarShadow(theme: 'dark' | 'light'): ViewStyle {
  const isDark = theme === 'dark';
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.06,
      shadowRadius: 8,
    },
    android: { elevation: isDark ? 3 : 2 },
    default: {},
  }) ?? {};
}
