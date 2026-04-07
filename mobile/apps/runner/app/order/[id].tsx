import React from 'react';
import { ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOrder, useRunnerActions } from '@refugio/hooks';
import {
  ORDER_STATUS_PENDIENTE_RECOJO,
  ORDER_STATUSES_RUNNER_ACCEPT,
  ORDER_STATUSES_RUNNER_CAN_DELIVER,
  orderStatusIn,
} from '@/constants/runnerOrderStatus';
import { useRunnerTheme } from '@/context/ThemeContext';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams();
  const orderId = parseInt(id as string, 10);
  const router = useRouter();
  const { palette: p } = useRunnerTheme();
  const { data: o, isLoading, error } = useOrder(orderId);
  const { accept, shelf, deliver } = useRunnerActions();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: p.bg }]}>
        <ActivityIndicator size="large" color={p.accent} />
      </View>
    );
  }

  if (error || !o) {
    return (
      <View style={[styles.center, { backgroundColor: p.bg }]}>
        <Text style={[styles.errorText, { color: p.error }]}>Error al cargar el pedido</Text>
      </View>
    );
  }

  const handleAction = async (action: 'accept' | 'shelf' | 'deliver') => {
    try {
      if (action === 'accept') {
        await accept.mutateAsync(orderId);
        Alert.alert('Éxito', 'Has tomado el pedido');
      } else if (action === 'shelf') {
        await shelf.mutateAsync(orderId);
        Alert.alert('Éxito', 'Pedido puesto en estante');
      } else if (action === 'deliver') {
        await deliver.mutateAsync(orderId);
        Alert.alert('Éxito', 'Pedido entregado al conductor');
        router.back();
      }
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'No se pudo realizar la acción';
      Alert.alert('Error', msg);
    }
  };

  const hasMatch = !!o.matched_driver_arrival_id;
  const canDeliver = hasMatch && orderStatusIn(o.estado, ORDER_STATUSES_RUNNER_CAN_DELIVER);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: p.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Tarjeta principal del pedido */}
      <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
        <View style={styles.cardHead}>
          <Text style={[styles.platform, { color: p.muted }]}>{o.plataforma}</Text>
          <View style={[styles.statusBadge, { backgroundColor: p.infoBg, borderColor: p.infoBorder }]}>
            <Text style={[styles.statusText, { color: p.accent }]}>{o.estado.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <Text style={[styles.code, { color: p.text }]}>{o.codigo_pedido}</Text>
        <Text style={[styles.bags, { color: p.muted }]}>{o.numero_bolsas ?? 1} bolsa(s)</Text>

        <View style={[styles.divider, { borderTopColor: p.border }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: p.muted }]}>Registro</Text>
          <Text style={[styles.infoValue, { color: p.text }]}>
            {new Date(o.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        {/* Estado del match */}
        <View style={[
          styles.matchBox,
          hasMatch
            ? { backgroundColor: p.successBg, borderColor: p.successBorder }
            : { backgroundColor: p.dangerBg, borderColor: p.dangerBorder },
          { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 16 },
        ]}>
          <Text style={[styles.matchTitle, { color: hasMatch ? p.accent : p.error }]}>
            {hasMatch ? '✓ Driver en espera' : '⏳ Sin driver asignado'}
          </Text>
          <Text style={[styles.matchSub, { color: p.muted }]}>
            {hasMatch
              ? 'El conductor ya está registrado en el kiosk.'
              : 'La entrega sólo es posible cuando haya match.'}
          </Text>
        </View>
      </View>

      {/* Acciones */}
      <View style={styles.actions}>
        {orderStatusIn(o.estado, ORDER_STATUSES_RUNNER_ACCEPT) && (
          <TouchableOpacity
            style={[styles.btnSecondary, { borderColor: p.border, backgroundColor: p.cardBg }]}
            onPress={() => handleAction('accept')}
            disabled={accept.isPending}
          >
            <Text style={[styles.btnSecondaryText, { color: p.text }]}>
              {accept.isPending ? 'PROCESANDO…' : 'TOMAR PEDIDO'}
            </Text>
          </TouchableOpacity>
        )}

        {o.estado === ORDER_STATUS_PENDIENTE_RECOJO && (
          <TouchableOpacity
            style={[styles.btnSecondary, { borderColor: p.border, backgroundColor: p.cardBg }]}
            onPress={() => handleAction('shelf')}
            disabled={shelf.isPending}
          >
            <Text style={[styles.btnSecondaryText, { color: p.text }]}>
              {shelf.isPending ? 'PROCESANDO…' : 'PONER EN ESTANTE'}
            </Text>
          </TouchableOpacity>
        )}

        {orderStatusIn(o.estado, ORDER_STATUSES_RUNNER_CAN_DELIVER) && (
          <TouchableOpacity
            style={[styles.btnDeliver, { backgroundColor: p.accent }, !canDeliver && styles.btnDisabled]}
            onPress={() => handleAction('deliver')}
            disabled={deliver.isPending || !canDeliver}
          >
            <Text style={[styles.btnDeliverText, { color: p.accentText }]}>
              {deliver.isPending ? 'PROCESANDO…' : 'ENTREGAR AL DRIVER'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, fontWeight: 'bold' },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  platform: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  code: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  bags: { fontSize: 18, fontWeight: '700', marginBottom: 24 },
  divider: { borderTopWidth: 1, marginVertical: 16 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  infoValue: { fontSize: 16, fontWeight: '700' },
  matchBox: {},
  matchTitle: { fontSize: 14, fontWeight: '900', marginBottom: 4 },
  matchSub: { fontSize: 12, fontWeight: '600' },
  actions: { gap: 14 },
  btnSecondary: {
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  btnDeliver: {
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDeliverText: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  btnDisabled: { opacity: 0.2 },
});
