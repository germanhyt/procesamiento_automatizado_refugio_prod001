import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WsState } from '@refugio/hooks';

import { RUNNER_WS_DOT } from '@/constants/runnerSemantic';
import { useRunnerTheme } from '@/context/ThemeContext';
import type { KioskDriverAlert } from '@/types/kioskDriverAlert';

type RunnerPalette = ReturnType<typeof useRunnerTheme>['palette'];

function formatKioskTime(ts: number): string {
  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

function kioskConnectionLabel(isApiOk: boolean, hasToken: boolean, wsState: WsState): { dot: string; text: string } {
  if (!isApiOk) return { dot: RUNNER_WS_DOT.error, text: 'Sin conexión' };
  if (!hasToken) return { dot: RUNNER_WS_DOT.warn, text: 'Sesión' };
  switch (wsState) {
    case 'open':
      return { dot: RUNNER_WS_DOT.ok, text: 'Activo' };
    case 'connecting':
      return { dot: RUNNER_WS_DOT.warn, text: 'Conectando…' };
    case 'closed':
      return { dot: RUNNER_WS_DOT.warn, text: 'Reconectando…' };
    case 'error':
      return { dot: RUNNER_WS_DOT.warn, text: 'Tiempo real…' };
    default:
      return { dot: RUNNER_WS_DOT.warn, text: 'Iniciando…' };
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

type Props = {
  alerts: KioskDriverAlert[];
  palette: RunnerPalette;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  connection: { isApiOk: boolean; wsState: WsState; hasToken: boolean };
};

// export function KioskAlertsQueueSection({ alerts, palette: p, onDismiss, onClearAll, connection }: Props) {
//   return (
//     <View style={styles.kioskQueueSection}>
//       <View style={styles.kioskQueueTitleRow}>
//         <View style={styles.kioskQueueTitleBlock}>
//           <Text style={[styles.kioskQueueTitle, { color: p.text }]}>Driver en kiosko</Text>
//           <KioskConnectionStatus
//             isApiOk={connection.isApiOk}
//             wsState={connection.wsState}
//             hasToken={connection.hasToken}
//             labelColor={p.muted}
//           />
//         </View>
//         {alerts.length > 0 ? (
//           <View style={styles.kioskQueueTitleRight}>
//             <Text style={[styles.kioskQueueCount, { color: p.muted }]}>{alerts.length} en cola</Text>
//             <TouchableOpacity onPress={onClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
//               <Text style={[styles.kioskQueueClearAll, { color: p.accent }]}>Limpiar</Text>
//             </TouchableOpacity>
//           </View>
//         ) : null}
//       </View>

//       {alerts.length === 0 ? (
//         <Text style={[styles.kioskQueueEmpty, { color: p.muted }]}>
//           Ningún aviso en esta sesión.
//         </Text>
//       ) : (
//         <View style={styles.kioskQueueList}>
//           {alerts.map((a) => (
//             <View key={a.id} style={[styles.kioskQueueRow, { backgroundColor: p.cardBg, borderColor: p.accent }]}>
//               <Ionicons name="notifications-outline" size={18} color={p.accent} style={styles.kioskQueueRowIcon} />
//               <View style={styles.kioskQueueRowText}>
//                 <Text style={[styles.kioskQueueRowCode, { color: p.text }]} numberOfLines={1}>
//                   {a.plat} · {a.code}
//                 </Text>
//                 <Text style={[styles.kioskQueueRowMeta, { color: p.muted }]}>
//                   Sin match aún · {formatKioskTime(a.receivedAt)}
//                 </Text>
//               </View>
//               <TouchableOpacity
//                 onPress={() => onDismiss(a.id)}
//                 accessibilityLabel="Quitar aviso de la lista"
//                 hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
//                 style={styles.kioskQueueRowClose}
//               >
//                 <Ionicons name="close-circle-outline" size={22} color={p.muted} />
//               </TouchableOpacity>
//             </View>
//           ))}
//         </View>
//       )}
//     </View>
//   );
// }

const styles = StyleSheet.create({
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
});
