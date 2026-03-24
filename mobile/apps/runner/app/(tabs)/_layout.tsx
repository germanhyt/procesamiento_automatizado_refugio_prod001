import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';

import { useRunnerTheme } from '@/context/ThemeContext';

export default function TabLayout() {
  const { theme, palette: p, toggleTheme } = useRunnerTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: {
          backgroundColor: p.bg,
          borderTopColor: p.border,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 10,
          paddingTop: 6,
        },
        headerShown: true,
        headerStyle: { backgroundColor: p.topBarBg },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: p.text,
          fontWeight: '900',
          fontSize: 20,
          letterSpacing: 0.5,
        },
        headerRight: () => (
          <TouchableOpacity
            onPress={toggleTheme}
            accessibilityLabel={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            style={{
              marginRight: 20,
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: p.themeToggleBg,
              borderWidth: 1,
              borderColor: p.themeToggleBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'}
              size={20}
              color={p.text}
            />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'RefuChasky Pedidos',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'list.bullet.rectangle', android: 'list', web: 'list' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
