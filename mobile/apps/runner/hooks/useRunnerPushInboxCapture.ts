import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import {
  RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
  RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
} from '@/constants/runnerPush';
import { useRunnerNotificationInbox } from '@/context/RunnerNotificationInboxContext';

function mustSkipExpoNotificationsNativeModule(): boolean {
  return Constants.appOwnership === 'expo' && Platform.OS === 'android';
}

/**
 * Añade entradas al Centro de notificaciones cuando llega un push en primer plano
 * (el listener de "tap" sigue en useRunnerPushRegistration).
 */
export function useRunnerPushInboxCapture() {
  const { addFromPush } = useRunnerNotificationInbox();

  useEffect(() => {
    if (Platform.OS === 'web' || mustSkipExpoNotificationsNativeModule()) {
      return;
    }

    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (cancelled) return;

        sub = Notifications.addNotificationReceivedListener((notification) => {
          const content = notification.request.content;
          const data = (content.data ?? {}) as Record<string, unknown>;
          const typeRaw = data.type != null ? String(data.type) : '';
          const title = content.title ?? '';
          const body = content.body ?? '';
          const dedupeId = notification.request.identifier ?? `${title}-${body}-${Date.now()}`;

          if (typeRaw === RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO || data.order_id != null) {
            const oid = data.order_id != null ? Number(data.order_id) : NaN;
            const orderPart = Number.isFinite(oid) && oid > 0 ? ` · Pedido #${oid}` : '';
            addFromPush({
              dedupeKey: Number.isFinite(oid) && oid > 0 ? `listo:${oid}` : `listo-push:${dedupeId}`,
              kind: RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
              title: title || 'Pedido listo',
              subtitle: (body || `Nuevo pedido listo${orderPart}`) as string,
              orderId: Number.isFinite(oid) && oid > 0 ? oid : undefined,
              sourceChannel: 'push',
            });
            return;
          }

          if (
            typeRaw === RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO ||
            data.driver_arrival_id != null
          ) {
            const aid = data.driver_arrival_id != null ? Number(data.driver_arrival_id) : NaN;
            const rName =
              data.restaurant_nombre != null && String(data.restaurant_nombre).trim() !== ''
                ? String(data.restaurant_nombre).trim()
                : '';
            const plat = String(data.plataforma ?? '');
            const cIngr = String(data.codigo_ingresado ?? '');
            const fallbackBody = rName ? `${rName} · ${plat} · ${cIngr}` : `${plat} · ${cIngr}`.trim();
            addFromPush({
              dedupeKey: Number.isFinite(aid) && aid > 0 ? `driver:${aid}` : `driver-push:${dedupeId}`,
              kind: RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
              title: title || 'Driver en kiosko',
              subtitle:
                (body && String(body).trim() !== '' ? String(body) : fallbackBody) || 'Driver esperando',
              driverArrivalId: Number.isFinite(aid) && aid > 0 ? aid : undefined,
              sourceChannel: 'push',
            });
          }
        });
      } catch {
        /* expo-notifications no disponible */
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [addFromPush]);
}
