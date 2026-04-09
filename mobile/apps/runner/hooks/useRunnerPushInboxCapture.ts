import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { useRunnerNotificationInbox } from '@/context/RunnerNotificationInboxContext';

function mustSkipExpoNotificationsNativeModule(): boolean {
  return Constants.appOwnership === 'expo' && Platform.OS === 'android';
}

/** Expo suele usar `date` en ms; si faltara, no recortamos por antigüedad. */
function notificationAgeMs(notification: { date?: number }): number | null {
  const d = notification.date;
  if (d == null || !Number.isFinite(d)) return null;
  const createdMs = d > 1e12 ? d : d * 1000;
  return Date.now() - createdMs;
}

const COLD_START_RESPONSE_MAX_AGE_MS = 10 * 60 * 1000;
const PUSH_SYNC_DEBOUNCE_MS = 400;

/**
 * Al llegar un push, el backend ya persistió la fila: reconciliamos con GET en lugar
 * de duplicar filas en memoria (fuente de verdad = API).
 */
export function useRunnerPushInboxCapture() {
  const { syncInboxFromApi } = useRunnerNotificationInbox();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSync = useCallback(() => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void syncInboxFromApi();
    }, PUSH_SYNC_DEBOUNCE_MS);
  }, [syncInboxFromApi]);

  useEffect(() => {
    if (Platform.OS === 'web' || mustSkipExpoNotificationsNativeModule()) {
      return;
    }

    let cancelled = false;
    let subReceived: { remove: () => void } | undefined;
    let subResponse: { remove: () => void } | undefined;

    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (cancelled) return;

        subReceived = Notifications.addNotificationReceivedListener(() => {
          scheduleSync();
        });

        subResponse = Notifications.addNotificationResponseReceivedListener(() => {
          scheduleSync();
        });

        const last = await Notifications.getLastNotificationResponseAsync();
        if (cancelled || !last) return;
        const age = notificationAgeMs(last.notification);
        if (age != null && age > COLD_START_RESPONSE_MAX_AGE_MS) return;
        scheduleSync();
      } catch {
        /* expo-notifications no disponible */
      }
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      subReceived?.remove();
      subResponse?.remove();
    };
  }, [scheduleSync]);
}
