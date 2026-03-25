import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveOrders, useDeliveryWS, type WsState } from '@refugio/hooks';
import { useRouter } from 'expo-router';
import { Order } from '@refugio/delivery-api';
import { useRunnerTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

const DRIVER_WAITING_SOUND = require('@/assets/sounds/driver-alert.wav');
const KIOSK_ALERTS_MAX = 30;

type KioskDriverAlert = {
  id: string;
  driverArrivalId: number;
  plat: string;
  code: string;
  receivedAt: number;
};

function formatKioskTime(ts: number): string {
  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

type RunnerPalette = ReturnType<typeof useRunnerTheme>['palette'];

function kioskConnectionLabel(isApiOk: boolean, hasToken: boolean, wsState: WsState): { dot: string; text: string } {
  if (!isApiOk) return { dot: '#ef4444', text: 'Sin conexión' };
  if (!hasToken) return { dot: '#f59e0b', text: 'Sesión' };
  switch (wsState) {
    case 'open':
      return { dot: '#22c55e', text: 'Activo' };
    case 'connecting':
      return { dot: '#f59e0b', text: 'Conectando…' };
    case 'closed':
      return { dot: '#f59e0b', text: 'Reconectando…' };
    case 'error':
      return { dot: '#f59e0b', text: 'Tiempo real…' };
    default:
      return { dot: '#f59e0b', text: 'Iniciando…' };
  }
}

function KioskConnectionStatus({
  isApiOk,
  wsState,
  hasToken,
  labelColor,
}: {
  isApiOk: boolean;
  wsState: WsState;
  hasToken: boolean;
  labelColor: string;
}) {
  const { dot, text } = kioskConnectionLabel(isApiOk, hasToken, wsState);
  return (
    <View style={styles.connectionStatusRow} accessibilityRole="text" accessibilityLabel={`Estado: ${text}`}>
      <View style={[styles.connectionStatusDot, { backgroundColor: dot }]} />
      <Text style={[styles.connectionStatusLabel, { color: labelColor }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function KioskAlertsQueueSection({
  alerts,
  palette: p,
  onDismiss,
  onClearAll,
  connection,
}: {
  alerts: KioskDriverAlert[];
  palette: RunnerPalette;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  connection: { isApiOk: boolean; wsState: WsState; hasToken: boolean };
}) {
  return (
    <View style={styles.kioskQueueSection}>
      <View style={styles.kioskQueueTitleRow}>
        <View style={styles.kioskQueueTitleBlock}>
          <Text style={[styles.kioskQueueTitle, { color: p.text }]}>Driver en kiosko</Text>
          <KioskConnectionStatus
            isApiOk={connection.isApiOk}
            wsState={connection.wsState}
            hasToken={connection.hasToken}
            labelColor={p.muted}
          />
        </View>
        {alerts.length > 0 ? (
          <View style={styles.kioskQueueTitleRight}>
            <Text style={[styles.kioskQueueCount, { color: p.muted }]}>{alerts.length} en cola</Text>
            <TouchableOpacity onPress={onClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.kioskQueueClearAll, { color: p.accent }]}>Limpiar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {alerts.length === 0 ? (
        <Text style={[styles.kioskQueueEmpty, { color: p.muted }]}>
          Ningún aviso en esta sesión.
          {/* Cuando un driver se registre en el SUNMI sin pedido matcheado, aparecerá aquí. */}
        </Text>
      ) : (
        <View style={styles.kioskQueueList}>
          {alerts.map((a) => (
            <View key={a.id} style={[styles.kioskQueueRow, { backgroundColor: p.cardBg, borderColor: p.accent }]}>
              <Ionicons name="notifications-outline" size={18} color={p.accent} style={styles.kioskQueueRowIcon} />
              <View style={styles.kioskQueueRowText}>
                <Text style={[styles.kioskQueueRowCode, { color: p.text }]} numberOfLines={1}>
                  {a.plat} · {a.code}
                </Text>
                <Text style={[styles.kioskQueueRowMeta, { color: p.muted }]}>
                  Sin match aún · {formatKioskTime(a.receivedAt)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onDismiss(a.id)}
                accessibilityLabel="Quitar aviso de la lista"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.kioskQueueRowClose}
              >
                <Ionicons name="close-circle-outline" size={22} color={p.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  const { token, logout } = useAuth();
  const qc = useQueryClient();
  const { data: orders, isLoading, refetch, isError, error } = useActiveOrders();
  const { palette: p } = useRunnerTheme();
  const router = useRouter();
  const driverAlertPlayer = useAudioPlayer(DRIVER_WAITING_SOUND);
  const [kioskDriverAlerts, setKioskDriverAlerts] = useState<KioskDriverAlert[]>([]);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  /** Un mismo `driver_arrival_id` no debe generar dos filas (WS duplicado / doble cliente). */
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
      void qc.invalidateQueries({ queryKey: ['delivery', 'orders'] });
      const payload = msg?.payload as Record<string, unknown> | undefined;
      if (msg?.type === 'DRIVER_UPDATED' && payload?.kind === 'NUEVO_DRIVER_ESPERANDO') {
        const rawAid = payload.driver_arrival_id;
        const driverArrivalId =
          typeof rawAid === 'number' ? rawAid : rawAid != null ? Number(rawAid) : NaN;
        if (!Number.isFinite(driverArrivalId)) {
          return;
        }
        if (seenKioskDriverArrivalIdsRef.current.has(driverArrivalId)) {
          return;
        }
        seenKioskDriverArrivalIdsRef.current.add(driverArrivalId);

        const code = String(payload.codigo_ingresado ?? '');
        const plat = String(payload.plataforma ?? '');
        const now = Date.now();
        let added = false;
        setKioskDriverAlerts((prev) => {
          if (prev.some((x) => x.driverArrivalId === driverArrivalId)) {
            return prev;
          }
          added = true;
          const row: KioskDriverAlert = {
            id: `da-${driverArrivalId}`,
            driverArrivalId,
            plat,
            code,
            receivedAt: now,
          };
          return [row, ...prev]
            .slice(0, KIOSK_ALERTS_MAX);
        });
        if (!added) {
          return;
        }
        try {
          driverAlertPlayer.seekTo(0);
          const p = driverAlertPlayer.play();
          if (p != null && typeof (p as Promise<void>).then === 'function') {
            void (p as Promise<void>).catch(() => { });
          }
        } catch {
          /* entorno sin audio */
        }
      }
    },
  });

  const onPullRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsPullRefreshing(false);
    }
  }, [refetch]);

  const errorMessage =
    (error as { response?: { data?: { detail?: string }; status?: number }; message?: string } | null)?.response?.data
      ?.detail ||
    (error as { response?: { status?: number }; message?: string } | null)?.message ||
    'No se pudo cargar pedidos.';
  const errorStatus =
    (error as { response?: { status?: number } } | null)?.response?.status;
  const isAuthError =
    errorStatus === 401 || /credencial|token|autorizad|unauthorized/i.test(errorMessage);

  useEffect(() => {
    if (!isAuthError) return;
    // Si el token expiró o quedó inválido, forzamos logout para volver a login limpio.
    void logout();
  }, [isAuthError, logout]);

  if (isLoading && !orders) {
    return (
      <View style={[styles.center, { backgroundColor: p.bg }]}>
        <ActivityIndicator size="large" color={p.accent} />
      </View>
    );
  }

  const renderOrder = ({ item: o }: { item: Order }) => {
    const isMatched = !!o.matched_driver_arrival_id;
    const isPriority = o.estado === 'LISTO_PARA_ENTREGAR';

    return (
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: p.cardBg, borderColor: isPriority ? p.accent : p.cardBorder },
          isPriority && { borderWidth: 2 },
        ]}
        onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } } as any)}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.platformText, { color: p.muted }]}>{o.plataforma}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusBadgeBg(o.estado) }]}>
            <Text style={[styles.badgeText, { color: '#fff' }]}>{formatStatus(o.estado)}</Text>
          </View>
        </View>

        <Text style={[styles.codeText, { color: p.text }]}>{o.codigo_pedido}</Text>

        <View style={[styles.cardFooter, { borderTopColor: p.border }]}>
          <Text style={[styles.bagsText, { color: p.muted }]}>
            {o.numero_bolsas ?? 1} bolsa(s)
          </Text>
          {isMatched && (
            <Text style={[styles.matchBadge, { color: p.accent }]}>✓ Driver en espera</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderOrder}
        ListHeaderComponent={

          <KioskAlertsQueueSection
            connection={{
              isApiOk: !isError,
              wsState: ws.state,
              hasToken: !!token,
            }}
            alerts={kioskDriverAlerts}
            palette={p}
            onDismiss={dismissKioskAlert}
            onClearAll={clearKioskAlerts}
          />
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isPullRefreshing} onRefresh={onPullRefresh} tintColor={p.accent} />
        }
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: p.bg }]}>
            <Text style={[styles.emptyText, { color: p.muted }]}>No hay pedidos activos</Text>
          </View>
        }
      />
    </View>
  );
}

function getStatusBadgeBg(status: string): string {
  switch (status) {
    case 'LISTO': return '#10b981';
    case 'PENDIENTE_RECOJO': return '#f59e0b';
    case 'PROCESO_ENTREGA': return '#3b82f6';
    case 'LISTO_PARA_ENTREGAR': return '#00cc99';
    default: return '#6b7280';
  }
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingTop: 14 },
  kioskQueueSection: { marginBottom: 18 },
  kioskQueueTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
    rowGap: 6,
  },
  kioskQueueTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  kioskQueueTitle: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    flexShrink: 1,
  },
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  connectionStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionStatusLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  kioskQueueTitleRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kioskQueueCount: { fontSize: 11, fontWeight: '700' },
  kioskQueueClearAll: { fontSize: 12, fontWeight: '900' },
  kioskQueueEmpty: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  kioskQueueList: { gap: 10 },
  kioskQueueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  kioskQueueRowIcon: { marginRight: 8 },
  kioskQueueRowText: { flex: 1, minWidth: 0 },
  kioskQueueRowCode: { fontSize: 17, fontWeight: '900' },
  kioskQueueRowMeta: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  kioskQueueRowClose: { paddingLeft: 4 },
  errorBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorTitle: { fontSize: 13, fontWeight: '900', marginBottom: 4 },
  errorDetail: { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  retryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  platformText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  bagsText: { fontSize: 13, fontWeight: '700' },
  matchBadge: { fontSize: 12, fontWeight: '900' },
  emptyContainer: { paddingVertical: 100, alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '700' },
});
