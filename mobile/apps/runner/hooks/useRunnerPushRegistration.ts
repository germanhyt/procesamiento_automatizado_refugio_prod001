import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { registerRunnerPushToken, unregisterRunnerPushToken } from '@refugio/delivery-api';
import { useAuth } from '@/context/AuthContext';

const ANDROID_CHANNEL_ID = 'delivery-runner';
/** Clave arbitraria en SecureStore para recordar el último Expo token y poder hacer unregister al logout. No la “generas” en ningún servicio. */
const STORED_EXPO_TOKEN_KEY = 'runner_expo_push_token_last';

const LOG_PREFIX = '[RunnerPush]';

/**
 * Desde SDK 53, Expo Go en Android ya no incluye push remoto: cargar `expo-notifications`
 * en ese entorno lanza y rompe el root layout. En development build no aplica.
 */
function mustSkipExpoNotificationsNativeModule(): boolean {
  return Constants.appOwnership === 'expo' && Platform.OS === 'android';
}

function getEasProjectId(): string | undefined {
  // EAS Build / dev client: lo más fiable suele ser easConfig (no siempre está en expoConfig.extra en runtime).
  const fromEas = (Constants.easConfig as { projectId?: string } | null)?.projectId?.trim();
  if (fromEas) {
    return fromEas;
  }
  const fromConfig = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId?.trim();
  if (fromConfig) {
    return fromConfig;
  }
  const m = Constants.manifest as { extra?: { eas?: { projectId?: string } } } | null | undefined;
  return m?.extra?.eas?.projectId?.trim() || undefined;
}

let notificationHandlerInstalled = false;

export function useRunnerPushRegistration() {
  const { token: authToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' || mustSkipExpoNotificationsNativeModule()) {
      if (mustSkipExpoNotificationsNativeModule()) {
        console.warn(
          LOG_PREFIX,
          'Push remoto no está disponible en Expo Go para Android (SDK 53+). Instala un development / preview build (EAS).',
        );
      }
      return;
    }

    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (cancelled) return;

        if (!notificationHandlerInstalled) {
          notificationHandlerInstalled = true;
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
        }

        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as Record<string, string> | undefined;
          const orderId = data?.order_id ? Number(data.order_id) : NaN;
          if (Number.isFinite(orderId) && orderId > 0) {
            router.push(`/order/${orderId}` as any);
            return;
          }
          router.replace('/(tabs)' as any);
        });
      } catch (err) {
        console.warn(LOG_PREFIX, 'No se pudo inicializar listeners de notificaciones:', err);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let cancelled = false;

    async function run() {
      if (!authToken) {
        const stored = await SecureStore.getItemAsync(STORED_EXPO_TOKEN_KEY);
        if (stored) {
          try {
            await unregisterRunnerPushToken(stored);
          } catch {
            try {
              await unregisterRunnerPushToken();
            } catch {
              /* ignore */
            }
          }
          await SecureStore.deleteItemAsync(STORED_EXPO_TOKEN_KEY);
        }
        return;
      }

      if (mustSkipExpoNotificationsNativeModule()) {
        return;
      }

      try {
        const Notifications = await import('expo-notifications');
        const Device = await import('expo-device');
        if (cancelled) return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
            name: 'Delivery Runner',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#00cc99',
            sound: 'default',
          });
        }

        const { status: exist } = await Notifications.getPermissionsAsync();
        let finalStatus = exist;
        if (exist !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          finalStatus = req.status;
        }
        if (finalStatus !== 'granted') {
          console.warn(LOG_PREFIX, 'Permiso de notificaciones denegado; no habrá push en segundo plano.');
          return;
        }

        if (!Device.isDevice) {
          console.warn(
            LOG_PREFIX,
            'No es dispositivo físico (simulador); Expo no registrará push útil para pruebas.',
          );
          return;
        }

        const projectId = getEasProjectId();
        if (!projectId) {
          console.warn(
            LOG_PREFIX,
            'Falta EAS projectId (extra.eas.projectId en app.json). getExpoPushTokenAsync fallará en build real.',
          );
          return;
        }

        const expoToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (!expoToken || cancelled) {
          console.warn(LOG_PREFIX, 'No se obtuvo expo push token.');
          return;
        }

        const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown';
        await registerRunnerPushToken(expoToken, platform);
        if (!cancelled) {
          await SecureStore.setItemAsync(STORED_EXPO_TOKEN_KEY, expoToken);
          console.info(LOG_PREFIX, 'Token registrado en API correctamente.');
        }
      } catch (err) {
        console.warn(LOG_PREFIX, 'Registro push falló (no bloquea login):', err);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [authToken]);
}
