import React from 'react';
import { ScrollView, TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useRunnerTheme } from '@/context/ThemeContext';

export default function SettingsScreen() {
  const { logout } = useAuth();
  const { palette: p, theme, toggleTheme } = useRunnerTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: p.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Sección cuenta */}
      <Text style={[styles.sectionTitle, { color: p.muted }]}>CUENTA</Text>
      <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
        <TouchableOpacity style={[styles.row, { borderBottomColor: p.border }]} onPress={logout}>
          <Text style={[styles.rowLabel, { color: p.error }]}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>

      {/* Sección apariencia */}
      <Text style={[styles.sectionTitle, { color: p.muted, marginTop: 28 }]}>APARIENCIA</Text>
      <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
        <TouchableOpacity style={styles.row} onPress={toggleTheme}>
          <Text style={[styles.rowLabel, { color: p.text }]}>
            {theme === 'dark' ? '☀️  Cambiar a tema claro' : '🌙  Cambiar a tema oscuro'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Versión */}
      <Text style={[styles.versionText, { color: p.muted }]}>RefuChasky v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    padding: 20,
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 40,
    opacity: 0.5,
  },
});
