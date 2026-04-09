import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  deleteRunnerNotificationsAll,
  listRunnerNotifications,
  markRunnerNotificationsReadAll,
} from '@refugio/delivery-api';
import type { RunnerNotification } from '@refugio/delivery-api';

import { useAuth } from '@/context/AuthContext';
import {
  RUNNER_INBOX_DEDUPE_MS,
  RUNNER_INBOX_MAX_ITEMS,
} from '@/constants/runnerInboxConfig';
import {
  RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH,
  RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
  RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
} from '@/constants/runnerPush';
import { clearPersistedInbox } from '@/lib/runnerInboxPersistence';
import type { RunnerInboxItem } from '@/types/runnerInbox';

export type { RunnerInboxItemKind, RunnerInboxItem } from '@/types/runnerInbox';

type Ctx = {
  items: RunnerInboxItem[];
  unreadCount: number;
  addOrderListoFromWs: (orderId: number, restaurantNombre?: string | null) => boolean;
  addDriverWaitingFromWs: (
    driverArrivalId: number,
    plat: string,
    code: string,
    restaurantNombre?: string | null,
  ) => void;
  syncInboxFromApi: () => Promise<void>;
  markAllRead: () => void;
  clearAll: () => void;
};

const RunnerNotificationInboxContext = createContext<Ctx | null>(null);

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function apiRowToInboxItem(row: RunnerNotification): RunnerInboxItem {
  const createdAt = Date.parse(row.created_at);
  return {
    id: `api-${row.id}`,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    kind: row.kind as RunnerInboxItem['kind'],
    title: row.title,
    subtitle: row.body,
    orderId: row.order_id ?? undefined,
    driverArrivalId: row.driver_arrival_id ?? undefined,
    read: row.read_at != null && String(row.read_at).trim() !== '',
    sourceChannel: 'api',
  };
}

/**
 * Bandeja Runner: lista canónica vía API; en memoria se mezclan filas WS hasta la próxima sync.
 * Sin caché en AsyncStorage (evita divergencia y filas `api` rechazadas por esquemas viejos).
 */
export function RunnerNotificationInboxProvider({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const [items, setItems] = useState<RunnerInboxItem[]>([]);
  const dedupeRef = useRef<Map<string, number>>(new Map());
  const prevTokenRef = useRef<string | null | undefined>(undefined);

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

  useEffect(() => {
    if (isLoading) return;
    const prev = prevTokenRef.current;
    if (prev === undefined) {
      prevTokenRef.current = token;
      return;
    }
    if (prev != null && token == null) {
      dedupeRef.current.clear();
      setItems([]);
    }
    prevTokenRef.current = token;
  }, [token, isLoading]);

  const mergeWsIntoApiList = useCallback((apiList: RunnerInboxItem[], wsRow: RunnerInboxItem) => {
    const logicalKey = (x: RunnerInboxItem): string => {
      if (x.kind === RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO && x.orderId != null) return `l:${x.orderId}`;
      if (x.kind === RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH && x.orderId != null) return `m:${x.orderId}`;
      if (x.kind === RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO && x.driverArrivalId != null) {
        return `d:${x.driverArrivalId}`;
      }
      return `i:${x.id}`;
    };
    const k = logicalKey(wsRow);
    const filtered = apiList.filter((x) => logicalKey(x) !== k);
    return [wsRow, ...filtered].slice(0, RUNNER_INBOX_MAX_ITEMS);
  }, []);

  const addOrderListoFromWs = useCallback(
    (orderId: number, restaurantNombre?: string | null): boolean => {
      if (!Number.isFinite(orderId) || orderId <= 0) return false;
      if (shouldSkip(`evt:listo:${orderId}`)) return false;
      const rn =
        restaurantNombre != null && String(restaurantNombre).trim() !== ''
          ? String(restaurantNombre).trim()
          : '';
      const row: RunnerInboxItem = {
        id: newId(),
        createdAt: Date.now(),
        kind: RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
        title: 'Pedido listo',
        subtitle: rn ? `${rn} · Pedido #${orderId}` : `Pedido #${orderId} · Fidelio / cocina`,
        orderId,
        sourceChannel: 'ws',
        read: false,
      };
      setItems((prev) => mergeWsIntoApiList(prev, row));
      return true;
    },
    [mergeWsIntoApiList, shouldSkip],
  );

  const addDriverWaitingFromWs = useCallback(
    (driverArrivalId: number, plat: string, code: string, restaurantNombre?: string | null) => {
      if (!Number.isFinite(driverArrivalId) || driverArrivalId <= 0) return;
      if (shouldSkip(`evt:driver:${driverArrivalId}`)) return;
      const rn =
        restaurantNombre != null && String(restaurantNombre).trim() !== ''
          ? String(restaurantNombre).trim()
          : '';
      const row: RunnerInboxItem = {
        id: newId(),
        createdAt: Date.now(),
        kind: RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
        title: 'Driver en kiosko',
        subtitle: rn ? `${rn} · ${plat} · ${code}` : `${plat} · ${code}`,
        driverArrivalId,
        sourceChannel: 'ws',
        read: false,
      };
      setItems((prev) => mergeWsIntoApiList(prev, row));
    },
    [mergeWsIntoApiList, shouldSkip],
  );

  const syncInboxFromApi = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await listRunnerNotifications();
      setItems(rows.map(apiRowToInboxItem));
    } catch {
      /* mantener lo que hay en memoria (p. ej. filas WS recientes) */
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void syncInboxFromApi();
  }, [token, syncInboxFromApi]);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((x) => (x.read ? x : { ...x, read: true })));
    if (token) void markRunnerNotificationsReadAll().catch(() => {});
  }, [token]);

  const clearAll = useCallback(() => {
    dedupeRef.current.clear();
    setItems([]);
    void clearPersistedInbox();
    if (token) void deleteRunnerNotificationsAll().catch(() => {});
  }, [token]);

  const unreadCount = useMemo(() => items.filter((x) => !x.read).length, [items]);

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      addOrderListoFromWs,
      addDriverWaitingFromWs,
      syncInboxFromApi,
      markAllRead,
      clearAll,
    }),
    [items, unreadCount, addOrderListoFromWs, addDriverWaitingFromWs, syncInboxFromApi, markAllRead, clearAll],
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
