import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, topBarShadow } from '@/constants/runnerLayout';
import { useRunnerTheme } from '@/context/ThemeContext';

export type RunnerTabHeaderMode = 'dashboard' | 'settings';

type Props = {
  mode: RunnerTabHeaderMode;
};

/**
 * Header de tabs alineado al Kiosk: safe area arriba, padding vertical generoso,
 * marca + toggle en una sola fila (sin headerRight de React Navigation).
 */
export function RunnerTabHeader({ mode }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme, palette: p, toggleTheme } = useRunnerTheme();
  const isDark = theme === 'dark';

  const compact = width < 380;
  const padH = width < 360 ? space.lg : space.xl;
  /** Tamaños de tipografía cercanos al Kiosk, ligeramente mayores para legibilidad */
  const logoSize = compact ? 40 : 50;
  const titleSize = compact ? 16 : 20;
  const subtitleSize = compact ? 12 : 14;
  const settingsTitleSize = compact ? 18 : 21;
  const iconSize = compact ? 19 : 21;
  const toggleSize = 42;

  const ripple = (hex: string) =>
    Platform.OS === 'android' ? { color: hex, borderless: false } : undefined;

  return (
    <View
      style={[
        styles.shell,
        {
          // paddingTop: Math.max(insets.top, space.sm + 2),
          paddingTop: 42,
          paddingBottom: 20,
          paddingHorizontal: padH,
          backgroundColor: p.topBarBg,
          borderBottomColor: p.topBarBorder,
          // marginTop: 20,
          // marginBottom: 10,
          ...topBarShadow(isDark ? 'dark' : 'light'),
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.brand}>
          {mode === 'dashboard' ? (
            <>
              <Image
                source={require('@/assets/images/logo-refugio.png')}
                style={{ width: logoSize, height: logoSize, borderRadius: radius.sm }}
              />
              <View style={styles.brandText}>
                <Text
                  accessibilityRole="header"
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  style={[styles.title, { color: p.text, fontSize: titleSize }]}
                >
                  RefuChasky RUNNER
                </Text>
                <Text style={[styles.subtitle, { color: p.muted, fontSize: subtitleSize }]}>Pedidos</Text>
              </View>
            </>
          ) : (
            <View style={[styles.brandText, styles.brandTextSolo]}>
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: p.text, fontSize: settingsTitleSize }]}
                numberOfLines={1}
              >
                Ajustes
              </Text>
              <Text style={[styles.subtitle, { color: p.muted, fontSize: subtitleSize }]}>
                Cuenta
              </Text>
            </View>
          )}
        </View>

        <View style={styles.spacerBetween} />

        <Pressable
          onPress={toggleTheme}
          accessibilityLabel={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          android_ripple={ripple(isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')}
          style={({ pressed }) => [
            styles.themeToggle,
            {
              width: toggleSize,
              height: toggleSize,
              borderRadius: radius.sm + 2,
              backgroundColor: p.themeToggleBg,
              borderColor: p.themeToggleBorder,
            },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={iconSize}
            color={p.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 0,
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minWidth: 0,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  brandTextSolo: {
    flex: 1,
    minWidth: 0,
  },
  /** Espacio explícito entre bloque de títulos y el toggle (no usar headerRight) */
  spacerBetween: {
    width: space.md + 4,
    flexShrink: 0,
  },
  title: {
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: space.xs + 1,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  themeToggle: {
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88 },
});
