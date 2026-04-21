import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, useWindowDimensions } from 'react-native';
import 'react-native-reanimated';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider as AppThemeProvider, useRunnerTheme } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RunnerAlertAudioProvider } from '@/context/RunnerAlertAudioContext';
import { RunnerNotificationInboxProvider } from '@/context/RunnerNotificationInboxContext';
import { useRunnerPushRegistration } from '@/hooks/useRunnerPushRegistration';
import { useRunnerPushInboxCapture } from '@/hooks/useRunnerPushInboxCapture';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <AuthProvider>
            <RunnerNotificationInboxProvider>
              <RunnerAlertAudioProvider>
                <RootLayoutNav />
              </RunnerAlertAudioProvider>
            </RunnerNotificationInboxProvider>
          </AuthProvider>
        </AppThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RunnerPushBridge() {
  useRunnerPushRegistration();
  useRunnerPushInboxCapture();
  return null;
}

function RootLayoutNav() {
  const { theme, palette: p } = useRunnerTheme();
  const { width } = useWindowDimensions();
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const orderHeaderTitleSize = width < 340 ? 15 : width < 380 ? 16 : 18;
  const orderHeaderTitleMaxW = Math.max(140, width - 130);

  useEffect(() => {
    if (isLoading) return;
    const inProtectedGroup = segments[0] === '(tabs)' || segments[0] === 'order';
    if (!token && inProtectedGroup) {
      router.replace('/login' as any);
    } else if (token && (segments[0] as any) === 'login') {
      router.replace('/(tabs)');
    }
  }, [token, isLoading, segments]);

  // Mapear nuestra paleta al tema de React Navigation
  const navTheme = theme === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: p.bg, card: p.topBarBg, border: p.topBarBorder, text: p.text, primary: p.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: p.bg, card: p.topBarBg, border: p.topBarBorder, text: p.text, primary: p.accent } };

  return (
    <ThemeProvider value={navTheme}>
      <RunnerPushBridge />
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="order/[id]"
          options={{
            title: 'Detalle de Pedido',
            headerBackTitle: 'Atrás',
            headerStyle: { backgroundColor: p.topBarBg },
            headerTitle: () => (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  color: p.text,
                  fontWeight: '900',
                  fontSize: orderHeaderTitleSize,
                  maxWidth: orderHeaderTitleMaxW,
                }}
              >
                Detalle de Pedido
              </Text>
            ),
            headerTintColor: p.accent,
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
