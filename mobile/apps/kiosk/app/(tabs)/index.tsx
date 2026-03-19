import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kioskArrival, kioskListWaitingDrivers } from '@refugio/delivery-api';
import { DRIVER_STATUS } from '@refugio/constants';
import {
  KIOSK_CODE_MAX_LEN,
  KIOSK_DRIVER_POLLING_MS,
  KIOSK_PLATFORM_OPTIONS,
  KIOSK_PLACA_MAX_LEN,
  type KioskPlatform,
} from '@/constants/kiosk';
import { useKioskTheme } from '@/components/useKioskTheme';
import type { KioskPalette } from '@/constants/kioskTheme';

const QUEUE_GRID_GAP = 10;
const QUEUE_CARD_MIN_W = 140;
const QUEUE_MAX_ITEMS = 24;
const MODAL_SUCCESS_CLOSE_MS = 1400;

function queueGridMetrics(innerWidth: number): { cols: number; cardWidth: number } {
  if (innerWidth <= 0) return { cols: 1, cardWidth: 0 };
  const cols = Math.max(
    1,
    Math.min(4, Math.floor((innerWidth + QUEUE_GRID_GAP) / (QUEUE_CARD_MIN_W + QUEUE_GRID_GAP))),
  );
  const cardWidth = (innerWidth - QUEUE_GRID_GAP * (cols - 1)) / cols;
  return { cols, cardWidth };
}

function DriverQueueGrid({
  title,
  drivers,
  variant,
  layoutWidth,
  palette,
}: {
  title: string;
  drivers: Array<{
    id: number;
    plataforma: string;
    estado: string;
    codigo_ingresado: string;
    placa?: string | null;
    alias_conductor?: string | null;
  }>;
  variant: 'esperando' | 'en_match';
  layoutWidth: number;
  palette: KioskPalette;
}) {
  const { cardWidth } = queueGridMetrics(layoutWidth);

  return (
    <View
      style={[
        styles.queueBlock,
        { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
        variant === 'esperando' && styles.queueBlockWaiting,
        variant === 'en_match' && styles.queueBlockMatch,
      ]}
    >
      <Text style={[styles.queueBlockTitle, { color: palette.text }]}>{title}</Text>
      {drivers.length === 0 ? (
        <Text style={[styles.queueEmpty, { color: palette.muted }]}>Sin registros</Text>
      ) : (
        <View style={styles.gridWrap}>
          {drivers.map((d) => (
            <View
              key={d.id}
              style={[
                styles.driverCard,
                { backgroundColor: palette.bg, borderColor: palette.border },
                variant === 'esperando' ? styles.driverCardWaiting : styles.driverCardMatch,
                layoutWidth > 0 && cardWidth > 0 ? { width: cardWidth } : styles.driverCardFlex,
              ]}
            >
              <Text style={[styles.driverCode, { color: palette.text }]} numberOfLines={1}>
                {d.codigo_ingresado}
              </Text>
              <Text style={[styles.driverMeta, { color: palette.muted }]} numberOfLines={3}>
                {d.plataforma} · {d.estado}
                {d.placa ? ` · ${d.placa}` : ''}
                {d.alias_conductor ? ` · ${d.alias_conductor}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function KioskScreen() {
  const { theme, palette, toggleTheme } = useKioskTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [queuePanelWidth, setQueuePanelWidth] = useState(0);
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [plataforma, setPlataforma] = useState<KioskPlatform>(KIOSK_PLATFORM_OPTIONS[0]);
  const [codigo, setCodigo] = useState('');
  const [placa, setPlaca] = useState('');
  const [alias, setAlias] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const successCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearSuccessTimer = useCallback(() => {
    if (!successCloseTimer.current) return;
    clearTimeout(successCloseTimer.current);
    successCloseTimer.current = null;
  }, []);

  const resetForm = useCallback(() => {
    setPlataforma(KIOSK_PLATFORM_OPTIONS[0]);
    setCodigo('');
    setPlaca('');
    setAlias('');
    setFeedback(null);
    setFieldError(null);
  }, []);

  const closeRegisterModal = useCallback(() => {
    clearSuccessTimer();
    setRegisterModalVisible(false);
    resetForm();
  }, [clearSuccessTimer, resetForm]);

  useEffect(() => {
    return () => clearSuccessTimer();
  }, [clearSuccessTimer]);

  const submit = async () => {
    setFieldError(null);
    if (!codigo.trim()) {
      setFieldError('Ingresa el código del pedido.');
      return;
    }
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
      const successMsg = data?.matched
        ? `Registrado y matcheado: ${data?.matched_order?.codigo_pedido ?? ''}`.trim()
        : 'Registrado (esperando match)';
      setFeedback({
        kind: 'ok',
        msg: successMsg,
      });
      setCodigo('');
      setPlaca('');
      setAlias('');
      setFieldError(null);
      clearSuccessTimer();
      successCloseTimer.current = setTimeout(() => {
        closeRegisterModal();
      }, MODAL_SUCCESS_CLOSE_MS);
    } catch {
      setFeedback({ kind: 'err', msg: 'No se pudo registrar (ver backend/API URL)' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const esperando = useMemo(
    () =>
      (driversQuery.data ?? [])
        .filter((d) => d.estado === DRIVER_STATUS.ESPERANDO)
        .slice(0, QUEUE_MAX_ITEMS),
    [driversQuery.data],
  );

  const enMatch = useMemo(
    () =>
      (driversQuery.data ?? [])
        .filter((d) => d.estado === DRIVER_STATUS.EN_MATCH)
        .slice(0, QUEUE_MAX_ITEMS),
    [driversQuery.data],
  );

  const gridInnerW =
    queuePanelWidth > 0 ? Math.max(0, queuePanelWidth - 48) : Math.max(0, windowWidth - 48);

  const openRegisterModal = () => {
    clearSuccessTimer();
    resetForm();
    setRegisterModalVisible(true);
  };

  const onBackdropPress = () => {
    if (isSubmitting) return;
    closeRegisterModal();
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.topBar, { backgroundColor: palette.topBarBg, borderBottomColor: palette.topBarBorder }]}>

        {/* view con flex y gap */}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Image
            source={require('@/assets/images/logo-refugio.png')}
            style={{ width: 60, height: 60 }}
          />
          <View>
            <Text style={[styles.title, { color: palette.text }]}>KIOSK REFUGIO</Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>Cola de drivers</Text>
          </View>
        </View>

        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={[styles.themeToggleBtn, { backgroundColor: palette.themeToggleBg, borderColor: palette.themeToggleBorder }]}
            onPress={toggleTheme}
            accessibilityLabel={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            <Ionicons name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.openModalBtn, { backgroundColor: palette.accent }]} onPress={openRegisterModal}>
            <Text style={[styles.openModalBtnText, { color: palette.accentText }]}>REGISTRAR DRIVER</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.main} onLayout={(e) => setQueuePanelWidth(e.nativeEvent.layout.width)}>
        <ScrollView style={styles.queueScroll} contentContainerStyle={styles.queueScrollContent} showsVerticalScrollIndicator>
          <View style={styles.queueHeader}>
            <Text style={[styles.queueTitle, { color: palette.text }]}>Cola de drivers</Text>
            {/* <Text style={[styles.wsHint, { color: palette.muted }]}>WS: n/a</Text> */}
          </View>
          {driversQuery.isLoading ? (
            <Text style={[styles.queueHint, { color: palette.muted }]}>Cargando…</Text>
          ) : driversQuery.isError ? (
            <Text style={[styles.queueHint, { color: palette.error }]}>Error cargando drivers.</Text>
          ) : (
            <View style={styles.queueSections}>
              <DriverQueueGrid
                title="ESPERANDO"
                drivers={esperando}
                variant="esperando"
                layoutWidth={gridInnerW}
                palette={palette}
              />
              <DriverQueueGrid
                title="EN_MATCH (Procesando)"
                drivers={enMatch}
                variant="en_match"
                layoutWidth={gridInnerW}
                palette={palette}
              />
            </View>
          )}
        </ScrollView>
      </View>

      <Modal visible={registerModalVisible} transparent animationType="fade" onRequestClose={closeRegisterModal}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: palette.modalOverlay }]} onPress={onBackdropPress} />
          <View style={[styles.modalCard, { backgroundColor: palette.modalBg, borderColor: palette.modalBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Registro de driver</Text>
              <TouchableOpacity onPress={closeRegisterModal}>
                <Text style={[styles.modalCloseText, { color: palette.muted }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Plataforma</Text>
              <View style={styles.platformRow}>
                {KIOSK_PLATFORM_OPTIONS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPlataforma(p)}
                    style={[
                      styles.platformBtn,
                      { borderColor: palette.border, backgroundColor: palette.cardBg },
                      plataforma === p && { borderColor: palette.accent, backgroundColor: palette.topBarBg },
                    ]}
                  >
                    <Text style={[styles.platformText, { color: plataforma === p ? palette.accent : palette.text }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Código de pedido *</Text>
              <TextInput
                value={codigo}
                onChangeText={setCodigo}
                placeholder="Código pedido…"
                placeholderTextColor={palette.placeholder}
                style={[
                  styles.input,
                  {
                    color: palette.inputText,
                    backgroundColor: palette.inputBg,
                    borderColor: fieldError ? palette.error : palette.inputBorder,
                  },
                ]}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={KIOSK_CODE_MAX_LEN}
              />
              {fieldError ? <Text style={[styles.fieldError, { color: palette.error }]}>{fieldError}</Text> : null}

              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Placa (opcional)</Text>
              <TextInput
                value={placa}
                onChangeText={setPlaca}
                placeholder="Placa…"
                placeholderTextColor={palette.placeholder}
                style={[styles.input, { color: palette.inputText, backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={KIOSK_PLACA_MAX_LEN}
              />

              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Nombre / alias (opcional)</Text>
              <TextInput
                value={alias}
                onChangeText={setAlias}
                placeholder="Nombre / alias…"
                placeholderTextColor={palette.placeholder}
                style={[styles.input, { color: palette.inputText, backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}
                autoCapitalize="words"
                autoCorrect={false}
              />

              <TouchableOpacity onPress={submit} disabled={!canSubmit} style={[styles.submitBtn, { backgroundColor: palette.accent }, !canSubmit && styles.submitBtnDisabled]}>
                <Text style={[styles.submitText, { color: palette.accentText }]}>{isSubmitting ? 'ENVIANDO…' : 'REGISTRAR'}</Text>
              </TouchableOpacity>

              {feedback && (
                <View
                  style={[
                    styles.feedback,
                    feedback.kind === 'ok' && { backgroundColor: palette.successBg, borderColor: palette.successBorder },
                    feedback.kind === 'err' && { backgroundColor: palette.dangerBg, borderColor: palette.dangerBorder },
                    feedback.kind === 'info' && { backgroundColor: palette.infoBg, borderColor: palette.infoBorder },
                  ]}
                >
                  <Text style={[styles.feedbackText, { color: palette.text }]}>{feedback.msg}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  themeToggleBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openModalBtn: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  openModalBtnText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  main: { flex: 1, minHeight: 0, padding: 20 },
  queueScroll: { flex: 1 },
  queueScrollContent: { paddingBottom: 20, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  subtitle: { marginTop: 4, fontSize: 12 },
  queueHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  queueSections: { gap: 12, marginTop: 10 },
  queueTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  queueHint: { marginTop: 8, fontSize: 12 },
  wsHint: { fontSize: 11, fontWeight: '700' },
  queueBlock: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  queueBlockWaiting: {
    borderColor: 'rgba(245,158,11,0.35)',
  },
  queueBlockMatch: {
    borderColor: 'rgba(20,184,166,0.35)',
  },
  queueBlockTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  queueEmpty: { fontSize: 12 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: QUEUE_GRID_GAP },
  driverCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  driverCardFlex: { flexGrow: 1, flexBasis: '100%', maxWidth: '100%' },
  driverCardWaiting: { borderColor: 'rgba(245,158,11,0.45)' },
  driverCardMatch: { borderColor: 'rgba(20,184,166,0.45)' },
  driverCode: { fontSize: 14, fontWeight: '900' },
  driverMeta: { fontSize: 11, marginTop: 4, fontWeight: '700' },
  modalRoot: { flex: 1, justifyContent: 'center', padding: 20 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalCloseText: { fontSize: 13, fontWeight: '700' },
  modalBody: { padding: 18, paddingBottom: 24 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6, marginTop: 8 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  platformBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  platformText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  input: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  fieldError: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  submitBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  feedback: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1 },
  feedbackText: { fontSize: 12, fontWeight: '700' },
});
