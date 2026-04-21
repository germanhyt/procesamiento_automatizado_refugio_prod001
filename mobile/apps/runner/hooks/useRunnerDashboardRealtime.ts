import { useCallback, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useDeliveryWS } from '@refugio/hooks';

import { KIOSK_DRIVER_ALERTS_MAX } from '@/constants/runnerDeliveryRealtime';
import { useRunnerAlertAudio } from '@/context/RunnerAlertAudioContext';
import { useRunnerNotificationInbox } from '@/context/RunnerNotificationInboxContext';
import { parseFidelioListoFromWs, parseNuevoDriverEsperando } from '@/lib/deliveryWsMessages';
import type { KioskDriverAlert } from '@/types/kioskDriverAlert';

type Params = {
  token: string | null | undefined;
  queryClient: QueryClient;
};

/**
 * Orquesta WebSocket de delivery + bandeja de notificaciones + cola UI de kiosko + chime.
 * Mantiene la pantalla principal declarativa y permite testear parsers por separado.
 */
export function useRunnerDashboardRealtime({ token, queryClient }: Params) {
  const { addOrderListoFromWs, addDriverWaitingFromWs, syncInboxFromApi } = useRunnerNotificationInbox();
  const lastInboxSyncRef = useRef(0);
  const { playLoopingAlert } = useRunnerAlertAudio();
  const [kioskDriverAlerts, setKioskDriverAlerts] = useState<KioskDriverAlert[]>([]);
  const seenKioskDriverArrivalIdsRef = useRef<Set<number>>(new Set());

  const dismissKioskAlert = useCallback((id: string) => {
    setKioskDriverAlerts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clearKioskAlerts = useCallback(() => {
    setKioskDriverAlerts([]);
  }, []);

  const ws = useDeliveryWS({
    token: token ?? undefined,
    onEvent: (msg) => {
      void queryClient.invalidateQueries({ queryKey: ['delivery', 'orders'] });

      const inboxSyncNow = Date.now();
      if (inboxSyncNow - lastInboxSyncRef.current > 8000) {
        lastInboxSyncRef.current = inboxSyncNow;
        void syncInboxFromApi();
      }

      const listo = parseFidelioListoFromWs(msg);
      if (listo != null && addOrderListoFromWs(listo.orderId, listo.restaurantNombre)) {
        playLoopingAlert();
      }

      const driverPayload = parseNuevoDriverEsperando(msg);
      if (!driverPayload) return;

      const { driverArrivalId, plat, code, restaurantNombre } = driverPayload;
      if (seenKioskDriverArrivalIdsRef.current.has(driverArrivalId)) {
        return;
      }
      seenKioskDriverArrivalIdsRef.current.add(driverArrivalId);

      const now = Date.now();
      let appended = false;
      setKioskDriverAlerts((prev) => {
        if (prev.some((x) => x.driverArrivalId === driverArrivalId)) {
          return prev;
        }
        appended = true;
        const row: KioskDriverAlert = {
          id: `da-${driverArrivalId}`,
          driverArrivalId,
          plat,
          code,
          restaurantNombre: restaurantNombre ?? undefined,
          receivedAt: now,
        };
        return [row, ...prev].slice(0, KIOSK_DRIVER_ALERTS_MAX);
      });

      if (!appended) return;
      addDriverWaitingFromWs(driverArrivalId, plat, code, restaurantNombre);
      playLoopingAlert();
    },
  });

  return {
    ws,
    kioskDriverAlerts,
    dismissKioskAlert,
    clearKioskAlerts,
  };
}
