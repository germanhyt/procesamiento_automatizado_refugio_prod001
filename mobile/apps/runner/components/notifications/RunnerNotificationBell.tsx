import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { RunnerNotificationInboxModal } from '@/components/RunnerNotificationInboxModal';
import { radius, space } from '@/constants/runnerLayout';
import { useRunnerAlertAudio } from '@/context/RunnerAlertAudioContext';
import { useRunnerNotificationInbox } from '@/context/RunnerNotificationInboxContext';
import { useRunnerTheme } from '@/context/ThemeContext';

type Props = {
  iconSize: number;
  toggleSize: number;
};

/**
 * Campana + badge + hoja de inbox. Separado del header para poder reutilizarlo (p. ej. otra pantalla o shell).
 */
export function RunnerNotificationBell({ iconSize, toggleSize }: Props) {
  const router = useRouter();
  const { theme, palette: p } = useRunnerTheme();
  const isDark = theme === 'dark';
  const { items, unreadCount, markAllRead, clearAll, syncInboxFromApi } = useRunnerNotificationInbox();
  const { stopAlertLoop } = useRunnerAlertAudio();
  const [inboxOpen, setInboxOpen] = useState(false);

  const ripple = (hex: string) =>
    Platform.OS === 'android' ? { color: hex, borderless: false } : undefined;

  return (
    <>
      <Pressable
        onPress={() => {
          stopAlertLoop();
          markAllRead();
          setInboxOpen(true);
          void syncInboxFromApi();
        }}
        accessibilityLabel={
          unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'
        }
        android_ripple={ripple(isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')}
        style={({ pressed }) => [
          styles.hit,
          {
            width: toggleSize,
            height: toggleSize,
            borderRadius: radius.sm + 2,
            backgroundColor: p.themeToggleBg,
            borderColor: p.themeToggleBorder,
            marginRight: space.sm,
          },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.bellWrap}>
          <Ionicons name="notifications-outline" size={iconSize} color={p.text} />
          {unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: p.error, borderColor: p.topBarBg }]}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <RunnerNotificationInboxModal
        visible={inboxOpen}
        onClose={() => setInboxOpen(false)}
        items={items}
        onClearAll={clearAll}
        onPressItem={(item) => {
          setInboxOpen(false);
          if (item.orderId != null && item.orderId > 0) {
            router.push(`/order/${item.orderId}` as any);
            return;
          }
          router.replace('/(tabs)' as any);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hit: {
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88 },
  bellWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
});
