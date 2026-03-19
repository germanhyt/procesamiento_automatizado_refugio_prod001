import React from 'react';
import { FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, View, Text } from 'react-native';
import { useActiveOrders } from '@refugio/hooks';
import { useRouter } from 'expo-router';
import { Order } from '@refugio/delivery-api';
import { useRunnerTheme } from '@/context/ThemeContext';

export default function DashboardScreen() {
  const { data: orders, isLoading, refetch, isRefetching } = useActiveOrders();
  const { palette: p } = useRunnerTheme();
  const router = useRouter();

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
        {/* Header */}
        <View style={styles.cardHeader}>
          <Text style={[styles.platformText, { color: p.muted }]}>{o.plataforma}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusBadgeBg(o.estado) }]}>
            <Text style={[styles.badgeText, { color: '#fff' }]}>{formatStatus(o.estado)}</Text>
          </View>
        </View>

        {/* Código */}
        <Text style={[styles.codeText, { color: p.text }]}>{o.codigo_pedido}</Text>

        {/* Footer */}
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
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={p.accent} />
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
  listContent: { padding: 16, paddingTop: 10 },
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
