import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space } from '@/constants/runnerLayout';
import {
  RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
  RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
} from '@/constants/runnerPush';
import {
  RUNNER_INBOX_ICON_BG,
  SEMANTIC_AMBER_500,
  SEMANTIC_EMERALD_500,
} from '@/constants/runnerSemantic';
import { useRunnerTheme } from '@/context/ThemeContext';
import type { RunnerInboxItem } from '@/types/runnerInbox';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: RunnerInboxItem[];
  onPressItem: (item: RunnerInboxItem) => void;
  onClearAll: () => void;
};

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

export function RunnerNotificationInboxModal({ visible, onClose, items, onPressItem, onClearAll }: Props) {
  const { theme, palette: p } = useRunnerTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxH = Math.min(height * 0.72, 520);
  /** `p.cardBg` en oscuro es casi transparente; aquí hace falta superficie opaca para que no se mezcle con el scrim. */
  const sheetBg = theme === 'dark' ? '#1a1a1a' : p.cardBg;
  const rowSurfaceBg = theme === 'dark' ? '#242424' : p.bg;
  const rowSurfacePressedBg = theme === 'dark' ? '#2e2e2e' : '#e8eaed';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              borderColor: p.border,
              paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
              maxHeight: maxH,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.grabberZone, { borderBottomColor: p.border }]}>
            <View style={[styles.grabber, { backgroundColor: p.muted }]} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: p.text }]}>Notificaciones</Text>
            {items.length > 0 ? (
              <Pressable onPress={onClearAll} hitSlop={12} style={styles.clearBtn}>
                <Text style={[styles.clearBtnText, { color: p.accent }]}>Vaciar</Text>
              </Pressable>
            ) : null}
          </View>
          {items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={40} color={p.muted} />
              <Text style={[styles.emptyText, { color: p.muted }]}>
                Sin avisos aún. Llegarán cuando Fidelio marque un pedido listo o
                un driver espere en kiosko.
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(it) => it.id}
              style={{ maxHeight: maxH - 100 }}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onPressItem(item)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: pressed ? rowSurfacePressedBg : rowSurfaceBg,
                      borderColor: item.read ? p.border : p.accent,
                      opacity: item.read ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.rowIconWrap,
                      {
                        backgroundColor:
                          item.kind === RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO
                            ? RUNNER_INBOX_ICON_BG.listo
                            : RUNNER_INBOX_ICON_BG.driver,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        item.kind === RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO
                          ? 'restaurant-outline'
                          : 'bicycle-outline'
                      }
                      size={22}
                      color={
                        item.kind === RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO
                          ? SEMANTIC_EMERALD_500
                          : SEMANTIC_AMBER_500
                      }
                    />
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.rowTitleRow}>
                      <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {!item.read ? <View style={[styles.unreadDot, { backgroundColor: p.accent }]} /> : null}
                    </View>
                    <Text style={[styles.rowSub, { color: p.muted }]} numberOfLines={2}>
                      {item.subtitle}
                    </Text>
                    <Text style={[styles.rowMeta, { color: p.muted }]}>
                      {formatTime(item.createdAt)} · {item.sourceChannel === 'push' ? 'Push' : 'Tiempo real'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={p.muted} style={styles.rowChev} />
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
    }),
  },
  grabberZone: {
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  clearBtn: { paddingVertical: 4 },
  clearBtnText: { fontSize: 14, fontWeight: '800' },
  emptyWrap: {
    paddingHorizontal: space.xl,
    paddingVertical: space.xl * 1.5,
    alignItems: 'center',
    gap: space.md,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    maxWidth: 320,
  },
  listContent: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    marginBottom: space.sm,
  },
  rowIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '900', flexShrink: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  rowSub: { fontSize: 13, fontWeight: '600', marginTop: 4, lineHeight: 18 },
  rowMeta: { fontSize: 11, fontWeight: '600', marginTop: 6, opacity: 0.9 },
  rowChev: { marginLeft: 6 },
});
