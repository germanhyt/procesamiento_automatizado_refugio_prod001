import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kioskArrival, kioskListWaitingDrivers } from '@refugio/delivery-api';
import { DRIVER_STATUS } from '@refugio/constants';
import { NumPad } from '@/components/NumPad';
import {
  KIOSK_CODE_MAX_LEN,
  KIOSK_DRIVER_POLLING_MS,
  KIOSK_NUMPAD_KEYS,
  KIOSK_PLATFORM_OPTIONS,
  KIOSK_PLACA_MAX_LEN,
  type KioskPlatform,
} from '@/constants/kiosk';

export default function KioskScreen() {
  const [plataforma, setPlataforma] = useState<KioskPlatform>(KIOSK_PLATFORM_OPTIONS[0]);
  const [codigo, setCodigo] = useState('');
  const [placa, setPlaca] = useState('');
  const [alias, setAlias] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null);

  const canSubmit = useMemo(() => codigo.trim().length > 0 && !isSubmitting, [codigo, isSubmitting]);
  const qc = useQueryClient();

  const driversQuery = useQuery({
    queryKey: ['delivery', 'drivers', 'waiting'],
    queryFn: kioskListWaitingDrivers,
    refetchInterval: KIOSK_DRIVER_POLLING_MS,
  });

  const arrivalMutation = useMutation({
    mutationFn: async (payload: { plataforma: string; codigo_ingresado: string; placa?: string | null; alias_conductor?: string | null }) =>
      kioskArrival(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['delivery', 'drivers', 'waiting'] });
    },
  });

  const onPad = (k: string) => {
    if (k === '⌫') {
      setCodigo((prev) => prev.slice(0, -1));
      return;
    }
    setCodigo((prev) => {
      if (prev.length >= KIOSK_CODE_MAX_LEN) return prev;
      return (prev + k).toUpperCase();
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const data = await arrivalMutation.mutateAsync({
        plataforma,
        codigo_ingresado: codigo.trim(),
        placa: placa.trim() ? placa.trim().toUpperCase() : null,
        alias_conductor: alias.trim() ? alias.trim() : null,
      });
      setFeedback({
        kind: 'ok',
        msg: data?.matched
          ? `Registrado y matcheado: ${data?.matched_order?.codigo_pedido ?? ''}`.trim()
          : 'Registrado (esperando match)',
      });
      setCodigo('');
      setPlaca('');
      setAlias('');
    } catch (e: any) {
      setFeedback({ kind: 'err', msg: 'No se pudo registrar (ver backend/API URL)' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.title}>KIOSK</Text>
        <Text style={styles.subtitle}>Registro de drivers</Text>

        <View style={styles.platformRow}>
          {KIOSK_PLATFORM_OPTIONS.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPlataforma(p)}
              style={[styles.platformBtn, plataforma === p && styles.platformBtnActive]}
            >
              <Text style={[styles.platformText, plataforma === p && styles.platformTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          value={codigo}
          onChangeText={setCodigo}
          placeholder="Código pedido…"
          placeholderTextColor="#666"
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={KIOSK_CODE_MAX_LEN}
        />

        <TextInput
          value={placa}
          onChangeText={setPlaca}
          placeholder="Placa (opcional)…"
          placeholderTextColor="#666"
          style={[styles.input, { marginTop: 10 }]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={KIOSK_PLACA_MAX_LEN}
        />

        <TextInput
          value={alias}
          onChangeText={setAlias}
          placeholder="Nombre / alias (opcional)…"
          placeholderTextColor="#666"
          style={[styles.input, { marginTop: 10 }]}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {/* <NumPad keys={KIOSK_NUMPAD_KEYS} onKeyPress={onPad} disabled={isSubmitting} /> */}

        <TouchableOpacity
          onPress={submit}
          disabled={!canSubmit}
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        >
          <Text style={styles.submitText}>{isSubmitting ? 'ENVIANDO…' : 'REGISTRAR'}</Text>
        </TouchableOpacity>

        {feedback && (
          <View
            style={[
              styles.feedback,
              feedback.kind === 'ok' ? styles.ok : feedback.kind === 'err' ? styles.err : styles.info,
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.msg}</Text>
          </View>
        )}
      </View>

      <View style={styles.right}>
        <View style={styles.queueHeader}>
          <Text style={styles.queueTitle}>Cola de drivers</Text>
          <Text style={styles.wsHint}>WS: n/a</Text>
        </View>
        {driversQuery.isLoading ? (
          <Text style={styles.queueHint}>Cargando…</Text>
        ) : driversQuery.isError ? (
          <Text style={[styles.queueHint, { color: '#ef4444' }]}>Error cargando drivers.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={styles.queueBlock}>
              <Text style={styles.queueBlockTitle}>ESPERANDO</Text>
              {(driversQuery.data ?? [])
                .filter((d) => d.estado === DRIVER_STATUS.ESPERANDO)
                .slice(0, 12)
                .map((d) => (
                  <View key={d.id} style={styles.driverCard}>
                    <Text style={styles.driverCode}>{d.codigo_ingresado}</Text>
                    <Text style={styles.driverMeta}>
                      {d.plataforma} · {d.estado}
                      {d.placa ? ` · ${d.placa}` : ''}
                      {d.alias_conductor ? ` · ${d.alias_conductor}` : ''}
                    </Text>
                  </View>
                ))}
            </View>
            <View style={styles.queueBlock}>
              <Text style={styles.queueBlockTitle}>EN_MATCH</Text>
              {(driversQuery.data ?? [])
                .filter((d) => d.estado === DRIVER_STATUS.EN_MATCH)
                .slice(0, 12)
                .map((d) => (
                  <View key={d.id} style={styles.driverCard}>
                    <Text style={styles.driverCode}>{d.codigo_ingresado}</Text>
                    <Text style={styles.driverMeta}>
                      {d.plataforma} · {d.estado}
                      {d.placa ? ` · ${d.placa}` : ''}
                      {d.alias_conductor ? ` · ${d.alias_conductor}` : ''}
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#050505' },
  left: { flex: 1, padding: 24, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.06)' },
  right: { flex: 1, padding: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: '#6b7280', marginTop: 6, fontSize: 12 },
  platformRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 18 },
  platformBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  platformBtnActive: { backgroundColor: 'rgba(20,184,166,0.18)', borderColor: 'rgba(20,184,166,0.35)' },
  platformText: { color: '#cbd5e1', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  platformTextActive: { color: '#2dd4bf' },
  input: {
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  submitBtn: {
    marginTop: 14,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#14b8a6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: '#000', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  feedback: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1 },
  ok: { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' },
  err: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' },
  info: { backgroundColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.25)' },
  feedbackText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  queueTitle: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  queueHint: { color: '#6b7280', marginTop: 8, fontSize: 12 },
  queueHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  wsHint: { color: '#6b7280', fontSize: 11, fontWeight: '700' },
  queueBlock: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 10,
  },
  queueBlockTitle: { color: '#cbd5e1', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  driverCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  driverCode: { color: '#fff', fontSize: 14, fontWeight: '900' },
  driverMeta: { color: '#6b7280', fontSize: 11, marginTop: 4, fontWeight: '700' },
});
