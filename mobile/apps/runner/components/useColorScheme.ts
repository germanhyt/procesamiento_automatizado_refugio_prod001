import { useRunnerTheme } from '@/context/ThemeContext';

export function useColorScheme() {
  const { theme } = useRunnerTheme();
  return theme;
}
