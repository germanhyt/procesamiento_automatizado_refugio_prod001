import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { RUNNER_INBOX_DEDUPE_MS, RUNNER_INBOX_MAX_ITEMS } from '@/constants/runnerInboxConfig';
import {
  RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
  RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
} from '@/constants/runnerPush';
import type { RunnerInboxItem } from '@/types/runnerInbox';

export type { RunnerInboxItemKind, RunnerInboxItem } from '@/types/runnerInbox';

type Ctx = {
  items: RunnerInboxItem[];
  unreadCount: number;
  addFromPush: (item: Omit<RunnerInboxItem, 'id' | 'read' | 'createdAt'> & { dedupeKey: string }) => void;
  addOrderListoFromWs: (orderId: number) => boolean;
  addDriverWaitingFromWs: (driverArrivalId: number, plat: string, code: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const RunnerNotificationInboxContext = createContext<Ctx | null>(null);

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}


/**
 * Contexto para la bandeja de notificaciones.
 * Mantiene la lista de notificaciones y las funciones para añadir y marcar como leídas.
 */

export function RunnerNotificationInboxProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<RunnerInboxItem[]>([]);
  const dedupeRef = useRef<Map<string, number>>(new Map());

  const pruneDedupe = useCallback(() => {
    const now = Date.now();
    const m = dedupeRef.current;
    for (const [k, t] of m) {
      if (now - t > RUNNER_INBOX_DEDUPE_MS * 4) m.delete(k);
    }
  }, []);

  const shouldSkip = useCallback(
    (key: string) => {
      pruneDedupe();
      const now = Date.now();
      const last = dedupeRef.current.get(key);
      if (last != null && now - last < RUNNER_INBOX_DEDUPE_MS) return true;
      dedupeRef.current.set(key, now);
      return false;
    },
    [pruneDedupe],
  );

  const addFromPush = useCallback(
    (partial: Omit<RunnerInboxItem, 'id' | 'read' | 'createdAt'> & { dedupeKey: string }) => {
      const { dedupeKey, ...rest } = partial;
      if (shouldSkip(`evt:${dedupeKey}`)) return;
      const row: RunnerInboxItem = {
        ...rest,
        id: newId(),
        createdAt: Date.now(),
        read: false,
      };
      setItems((prev) => [row, ...prev].slice(0, RUNNER_INBOX_MAX_ITEMS));
    },
    [shouldSkip],
  );

  const addOrderListoFromWs = useCallback(
    (orderId: number): boolean => {
      if (!Number.isFinite(orderId) || orderId <= 0) return false;
      if (shouldSkip(`evt:listo:${orderId}`)) return false;
      const row: RunnerInboxItem = {
        id: newId(),
        createdAt: Date.now(),
        kind: RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
        title: 'Pedido listo',
        subtitle: `Pedido #${orderId} · Fidelio / cocina`,
        orderId,
        sourceChannel: 'ws',
        read: false,
      };
      setItems((prev) => [row, ...prev].slice(0, RUNNER_INBOX_MAX_ITEMS));
      return true;
    },
    [shouldSkip],
  );

  const addDriverWaitingFromWs = useCallback(
    (driverArrivalId: number, plat: string, code: string) => {
      if (!Number.isFinite(driverArrivalId) || driverArrivalId <= 0) return;
      if (shouldSkip(`evt:driver:${driverArrivalId}`)) return;
      const row: RunnerInboxItem = {
        id: newId(),
        createdAt: Date.now(),
        kind: RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
        title: 'Driver en kiosko',
        subtitle: `${plat} · ${code}`,
        driverArrivalId,
        sourceChannel: 'ws',
        read: false,
      };
      setItems((prev) => [row, ...prev].slice(0, RUNNER_INBOX_MAX_ITEMS));
    },
    [shouldSkip],
  );

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((x) => (x.read ? x : { ...x, read: true })));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const unreadCount = useMemo(() => items.filter((x) => !x.read).length, [items]);

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      addFromPush,
      addOrderListoFromWs,
      addDriverWaitingFromWs,
      markAllRead,
      clearAll,
    }),
    [items, unreadCount, addFromPush, addOrderListoFromWs, addDriverWaitingFromWs, markAllRead, clearAll],
  );

  return (
    <RunnerNotificationInboxContext.Provider value={value}>{children}</RunnerNotificationInboxContext.Provider>
  );
}

export function useRunnerNotificationInbox() {
  const ctx = useContext(RunnerNotificationInboxContext);
  if (!ctx) {
    throw new Error('useRunnerNotificationInbox debe usarse dentro de RunnerNotificationInboxProvider');
  }
  return ctx;
}
