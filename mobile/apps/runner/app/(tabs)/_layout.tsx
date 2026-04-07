import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RunnerTabHeader } from '@/components/RunnerTabHeader';
import { space } from '@/constants/runnerLayout';
import { useRunnerTheme } from '@/context/ThemeContext';

export default function TabLayout() {
  const { palette: p } = useRunnerTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabBarBottomPad = Math.max(insets.bottom, space.sm + 2);
  const tabBarTopPad = space.sm;
  /** Altura del área de iconos + padding superior + safe area inferior (evita solaparse con gestos/home) */
  const tabBarHeight = 48 + tabBarTopPad + tabBarBottomPad;

  const tabBarStyleBase = {
    backgroundColor: p.bg,
    borderTopColor: p.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tabBarTopPad,
    // paddingBottom: tabBarBottomPad,
    height: tabBarHeight,
    marginBottom: insets.bottom > 0 ? space.md : space.xxl,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: tabBarStyleBase,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'RefuChasky RUNNER',
          header: () => <RunnerTabHeader mode="dashboard" />,
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'list.bullet.rectangle', android: 'list', web: 'list' }}
              tintColor={color}
              size={width < 380 ? 22 : 24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="two" // Ajustes
        options={{
          title: 'Ajustes',
          header: () => <RunnerTabHeader mode="settings" />,
          /** Aire extra entre la barra de pestañas y el borde físico (gestos / botones del sistema). */
          tabBarStyle: {
            ...tabBarStyleBase,
            marginBottom: insets.bottom > 0 ? space.md : space.xxl,
          },
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              tintColor={color}
              size={width < 380 ? 22 : 24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
