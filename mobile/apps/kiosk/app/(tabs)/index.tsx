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
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kioskArrival, kioskListDeliveredOrdersToday, kioskListWaitingDrivers } from '@refugio/delivery-api';
import { DRIVER_STATUS } from '@refugio/constants';
import {
  KIOSK_CODE_MAX_LEN,
  KIOSK_DRIVER_POLLING_MS,
  KIOSK_PLATFORM_OPTIONS,
  KIOSK_PLACA_MAX_LEN,
  type KioskPlatform,
} from '@/constants/kiosk';
import { cardShadow, modalCardShadow, motion, radius, space, topBarShadow } from '@/constants/kioskLayout';
import { useKioskTheme } from '@/components/useKioskTheme';
import type { KioskPalette } from '@/constants/kioskTheme';

const QUEUE_GRID_GAP = 10;
const QUEUE_CARD_MIN_W = 140;
const QUEUE_MAX_ITEMS = 24;
const DELIVERED_PREVIEW_ITEMS = 12;
const MODAL_SUCCESS_CLOSE_MS = 1400;
/** Padding horizontal interno del bloque de cola (cada lado) — alinear con `styles.queueBlock.padding` */
const QUEUE_BLOCK_PAD_H = space.lg;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  try {
    return new Intl.DateTimeFormat('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Lima',
    }).format(d);
  } catch {
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}

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
  isDark,
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
  isDark: boolean;
}) {
  const { cardWidth } = queueGridMetrics(layoutWidth);
  const themeMode = isDark ? 'dark' : 'light';

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.normal)}
      layout={Layout.duration(motion.fast)}
      style={[
        styles.queueBlock,
        { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
        cardShadow(themeMode),
        variant === 'esperando' && styles.queueBlockWaiting,
        variant === 'en_match' && styles.queueBlockMatch,
      ]}
    >
      <Text style={[styles.queueBlockTitle, { color: palette.text }]}>{title}</Text>
      {drivers.length === 0 ? (
        <Text style={[styles.queueEmpty, { color: palette.muted }]}>Sin registros</Text>
      ) : (
        <View style={styles.gridWrap}>
          {drivers.map((d, index) => (
            <Animated.View
              key={d.id}
              entering={FadeIn.delay(Math.min(index * 48, 280)).duration(motion.normal)}
              style={[
                layoutWidth > 0 && cardWidth > 0 ? { width: cardWidth } : styles.driverCardFlex,
              ]}
            >
              <View
                style={[
                  styles.driverCard,
                  { backgroundColor: palette.bg, borderColor: palette.border },
                  cardShadow(themeMode),
                  variant === 'esperando' ? styles.driverCardWaiting : styles.driverCardMatch,
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
            </Animated.View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

export default function KioskScreen() {
  const { theme, palette, toggleTheme } = useKioskTheme();
  const isDark = theme === 'dark';
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompactHeader = windowWidth < 380;
  const contentPadH = windowWidth < 360 ? space.lg : space.xl;
  const logoSize = isCompactHeader ? 40 : 50;
  const titleFontSize = isCompactHeader ? 16 : 20;
  const subtitleFontSize = isCompactHeader ? 12 : 14;

  const [queuePanelWidth, setQueuePanelWidth] = useState(0);
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [modalAnimKey, setModalAnimKey] = useState(0);
  const [deliveredExpanded, setDeliveredExpanded] = useState(false);
  const [plataforma, setPlataforma] = useState<KioskPlatform>(KIOSK_PLATFORM_OPTIONS[0]);
  const [codigo, setCodigo] = useState('');
  const [placa, setPlaca] = useState('');
  const [alias, setAlias] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const successCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chevronRotation = useSharedValue(0);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  useEffect(() => {
    chevronRotation.value = withTiming(deliveredExpanded ? 180 : 0, { duration: motion.fast });
  }, [deliveredExpanded, chevronRotation]);

  const canSubmit = useMemo(
    () =>
      codigo.trim().length > 0 &&
      placa.trim().length > 0 &&
      alias.trim().length > 0 &&
      !isSubmitting,
    [codigo, placa, alias, isSubmitting],
  );
  const qc = useQueryClient();

  const driversQuery = useQuery({
    queryKey: ['delivery', 'drivers', 'waiting'],
    queryFn: kioskListWaitingDrivers,
    refetchInterval: KIOSK_DRIVER_POLLING_MS,
  });

  const deliveredQuery = useQuery({
    queryKey: ['delivery', 'kiosk', 'orders', 'delivered-today'],
    queryFn: kioskListDeliveredOrdersToday,
    refetchInterval: KIOSK_DRIVER_POLLING_MS,
  });

  const arrivalMutation = useMutation({
    mutationFn: async (payload: {
      plataforma: string;
      codigo_ingresado: string;
      placa: string;
      alias_conductor: string;
    }) => kioskArrival(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['delivery', 'drivers', 'waiting'] });
      await qc.invalidateQueries({ queryKey: ['delivery', 'kiosk', 'orders', 'delivered-today'] });
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
    if (!placa.trim()) {
      setFieldError('Ingresa la placa.');
      return;
    }
    if (!alias.trim()) {
      setFieldError('Ingresa el nombre o alias del conductor.');
      return;
    }
    if (!canSubmit) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const data = await arrivalMutation.mutateAsync({
        plataforma,
        codigo_ingresado: codigo.trim(),
        placa: placa.trim().toUpperCase(),
        alias_conductor: alias.trim(),
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
  const deliveredToday = useMemo(() => deliveredQuery.data ?? [], [deliveredQuery.data]);
  const deliveredPreview = useMemo(
    () => deliveredToday.slice(0, deliveredExpanded ? deliveredToday.length : DELIVERED_PREVIEW_ITEMS),
    [deliveredToday, deliveredExpanded],
  );

  const gridInnerW =
    queuePanelWidth > 0
      ? Math.max(0, queuePanelWidth - contentPadH * 2 - QUEUE_BLOCK_PAD_H * 2)
      : Math.max(0, windowWidth - contentPadH * 2 - QUEUE_BLOCK_PAD_H * 2);

  const openRegisterModal = () => {
    clearSuccessTimer();
    resetForm();
    setModalAnimKey((k) => k + 1);
    setRegisterModalVisible(true);
  };

  const onBackdropPress = () => {
    if (isSubmitting) return;
    closeRegisterModal();
  };

  const ripple = (color: string) =>
    Platform.OS === 'android' ? { color, borderless: false } : undefined;

  const topBarDynamic = useMemo(
    () => ({
      paddingTop: Math.max(insets.top, space.sm + 2),
      paddingHorizontal: contentPadH,
      ...topBarShadow(isDark ? 'dark' : 'light'),
    }),
    [insets.top, contentPadH, isDark],
  );

  const registerBtnLabel = 'REGISTRATE';

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      <Animated.View
        entering={FadeInDown.duration(motion.slow)}
        style={[
          styles.topBar, isCompactHeader && styles.topBarCompact, { backgroundColor: palette.topBarBg, borderBottomColor: palette.topBarBorder }, topBarDynamic]}
      >
        {isCompactHeader ? (
          <>
            <View style={styles.topBarUpperRowCompact}>
              <View style={styles.topBarBrand}>
                <Image
                  source={require('@/assets/images/logo-refugio.png')}
                  style={{ width: logoSize, height: logoSize }}
                />
                <View style={styles.topBarBrandText}>
                  <Text
                    style={[styles.title, { color: palette.text, fontSize: titleFontSize }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    RefuChasky KIOSK
                  </Text>
                  <Text style={[styles.subtitle, { color: palette.muted, fontSize: subtitleFontSize }]}>Drivers</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.themeToggleBtn,
                  styles.themeToggleBtnCompact,
                  { backgroundColor: palette.themeToggleBg, borderColor: palette.themeToggleBorder },
                  pressed && styles.pressedSubtle,
                ]}
                onPress={toggleTheme}
                android_ripple={ripple(isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')}
                accessibilityLabel={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
              >
                <Ionicons name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={18} color={palette.text} />
              </Pressable>
            </View>

          </>
        ) : (
          <View style={styles.topBarWideRow}>
            <View style={styles.topBarBrand}>
              <Image
                source={require('@/assets/images/logo-refugio.png')}
                style={{ width: logoSize, height: logoSize }}
              />
              <View style={styles.topBarBrandText}>
                <Text
                  style={[styles.title, { color: palette.text, fontSize: titleFontSize }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  RefuChasky KIOSK
                </Text>
                <Text style={[styles.subtitle, { color: palette.muted, fontSize: subtitleFontSize }]}>Drivers</Text>
              </View>
            </View>
            <View style={styles.topBarActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.themeToggleBtn,
                  { backgroundColor: palette.themeToggleBg, borderColor: palette.themeToggleBorder },
                  pressed && styles.pressedSubtle,
                ]}
                onPress={toggleTheme}
                android_ripple={ripple(isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')}
                accessibilityLabel={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
              >
                <Ionicons name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color={palette.text} />
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>

      <View
        style={[styles.main, { paddingHorizontal: contentPadH, paddingTop: space.lg, paddingBottom: space.lg }]}
        onLayout={(e) => setQueuePanelWidth(e.nativeEvent.layout.width)}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable
            style={({ pressed }) => [
              styles.openModalBtn,
              styles.openModalBtnFull,
              { backgroundColor: palette.accent },
              pressed && styles.pressedPrimary,
            ]}
            onPress={openRegisterModal}
            android_ripple={ripple('rgba(0,0,0,0.2)')}
          >
            <Text style={[styles.openModalBtnText, { color: palette.accentText }]}>{registerBtnLabel}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.queueScroll}
          contentContainerStyle={styles.queueScrollContent}
          showsVerticalScrollIndicator
        >
          <Animated.View entering={FadeIn.delay(80).duration(motion.normal)}>
            <View style={styles.queueHeader}>
              <Text style={[styles.queueTitle, { color: palette.text }]}>Cola de drivers</Text>
            </View>
          </Animated.View>
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
                isDark={isDark}
              />
              <DriverQueueGrid
                title="EN_MATCH (Coincidencias)"
                drivers={enMatch}
                variant="en_match"
                layoutWidth={gridInnerW}
                palette={palette}
                isDark={isDark}
              />

              <Animated.View
                layout={Layout.springify().damping(17).stiffness(200)}
                style={[
                  styles.deliveredBlock,
                  { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                  cardShadow(isDark ? 'dark' : 'light'),
                ]}
              >
                <Pressable
                  style={({ pressed }) => [styles.deliveredHeader, pressed && { opacity: 0.92 }]}
                  onPress={() => setDeliveredExpanded((v) => !v)}
                  android_ripple={ripple(isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)')}
                >
                  <View style={styles.deliveredHeaderText}>
                    <Text style={[styles.deliveredTitle, { color: palette.text }]}>Entregados hoy</Text>
                    <Text style={[styles.deliveredCount, { color: palette.muted }]}>
                      {deliveredToday.length} pedidos
                    </Text>
                  </View>
                  <Animated.View style={chevronStyle}>
                    <Ionicons name="chevron-down" size={20} color={palette.muted} />
                  </Animated.View>
                </Pressable>

                {deliveredExpanded ? (
                  <Animated.View
                    entering={FadeIn.duration(motion.normal)}
                    layout={Layout.springify()}
                    style={styles.deliveredList}
                  >
                    {deliveredQuery.isLoading ? (
                      <Text style={[styles.queueHint, { color: palette.muted }]}>Cargando entregados…</Text>
                    ) : deliveredQuery.isError ? (
                      <Text style={[styles.queueHint, { color: palette.error }]}>No se pudo cargar entregados.</Text>
                    ) : deliveredPreview.length === 0 ? (
                      <Text style={[styles.queueHint, { color: palette.muted }]}>Sin entregados hoy.</Text>
                    ) : (
                      deliveredPreview.map((o, i) => (
                        <Animated.View key={o.id} entering={FadeIn.delay(Math.min(i * 40, 200)).duration(motion.fast)}>
                          <View
                            style={[
                              styles.deliveredItem,
                              { borderColor: palette.border, backgroundColor: palette.bg },
                              cardShadow(isDark ? 'dark' : 'light'),
                            ]}
                          >
                            <View style={styles.deliveredTopRow}>
                              <Text style={[styles.deliveredCode, { color: palette.text }]} numberOfLines={1}>
                                {o.codigo_pedido}
                              </Text>
                              <Text style={[styles.deliveredTime, { color: palette.muted }]}>
                                {formatTime(o.updated_at)}
                              </Text>
                            </View>
                            <Text style={[styles.deliveredMeta, { color: palette.muted }]} numberOfLines={1}>
                              {o.plataforma} · bolsas: {o.numero_bolsas ?? 0}
                            </Text>
                          </View>
                        </Animated.View>
                      ))
                    )}
                  </Animated.View>
                ) : null}
              </Animated.View>
            </View>
          )}
        </ScrollView>
      </View>

      <Modal visible={registerModalVisible} transparent animationType="fade" onRequestClose={closeRegisterModal}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: palette.modalOverlay }]} onPress={onBackdropPress} />
          <Animated.View
            key={modalAnimKey}
            entering={ZoomIn.duration(motion.normal)}
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.modalBg,
                borderColor: palette.modalBorder,
              },
              modalCardShadow(),
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Registro de driver</Text>
              <Pressable
                onPress={closeRegisterModal}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                hitSlop={12}
              >
                <Text style={[styles.modalCloseText, { color: palette.muted }]}>Cerrar</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Plataforma</Text>
              <View style={styles.platformRow}>
                {KIOSK_PLATFORM_OPTIONS.map((plat) => (
                  <Pressable
                    key={plat}
                    onPress={() => setPlataforma(plat)}
                    style={({ pressed }) => [
                      styles.platformBtn,
                      { borderColor: palette.border, backgroundColor: palette.cardBg },
                      plataforma === plat && { borderColor: palette.accent, backgroundColor: palette.topBarBg },
                      pressed && styles.pressedSubtle,
                    ]}
                  >
                    <Text style={[styles.platformText, { color: plataforma === plat ? palette.accent : palette.text }]}>
                      {plat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Código de pedido *</Text>
              <TextInput
                value={codigo}
                onChangeText={(t) => setCodigo(t.toUpperCase())}
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

              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Placa *</Text>
              <TextInput
                value={placa}
                onChangeText={(t) => setPlaca(t.toUpperCase())}
                placeholder="Placa…"
                placeholderTextColor={palette.placeholder}
                style={[
                  styles.input,
                  { color: palette.inputText, backgroundColor: palette.inputBg, borderColor: palette.inputBorder },
                ]}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={KIOSK_PLACA_MAX_LEN}
              />

              <Text style={[styles.fieldLabel, { color: palette.muted }]}>Nombre / alias *</Text>
              <TextInput
                value={alias}
                onChangeText={setAlias}
                placeholder="Nombre / alias…"
                placeholderTextColor={palette.placeholder}
                style={[
                  styles.input,
                  { color: palette.inputText, backgroundColor: palette.inputBg, borderColor: palette.inputBorder },
                ]}
                autoCapitalize="words"
                autoCorrect={false}
              />

              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.submitBtn,
                  { backgroundColor: palette.accent },
                  !canSubmit && styles.submitBtnDisabled,
                  canSubmit && pressed && styles.pressedPrimary,
                ]}
                android_ripple={canSubmit ? ripple('rgba(0,0,0,0.15)') : undefined}
              >
                <Text style={[styles.submitText, { color: palette.accentText }]}>
                  {isSubmitting ? 'ENVIANDO…' : 'REGISTRAR'}
                </Text>
              </Pressable>

              {feedback ? (
                <Animated.View
                  entering={FadeIn.duration(240)}
                  style={[
                    styles.feedback,
                    feedback.kind === 'ok' && { backgroundColor: palette.successBg, borderColor: palette.successBorder },
                    feedback.kind === 'err' && { backgroundColor: palette.dangerBg, borderColor: palette.dangerBorder },
                    feedback.kind === 'info' && { backgroundColor: palette.infoBg, borderColor: palette.infoBorder },
                  ]}
                >
                  <Text style={[styles.feedbackText, { color: palette.text }]}>{feedback.msg}</Text>
                </Animated.View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {

    // paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.sm + 2,

    paddingTop: 24,
    paddingBottom: 10,
  },
  topBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',

    paddingTop: 24,
    paddingBottom: 10,
  },
  topBarWideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,

    paddingTop: 24,
    paddingBottom: 10,
  },
  topBarUpperRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm + 2,

    paddingTop: 24,
    paddingBottom: 10,
  },
  topBarBrand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minWidth: 0,
  },
  topBarBrandText: {
    flex: 1,
    minWidth: 0,
  },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, flexShrink: 0 },
  themeToggleBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleBtnCompact: {
    width: 40,
    height: 40,
  },
  openModalBtn: {
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  openModalBtnFull: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md + 2,
  },
  openModalBtnText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  pressedSubtle: { opacity: 0.88 },
  pressedPrimary: { opacity: 0.94, transform: [{ scale: 0.98 }] },
  main: { flex: 1, minHeight: 0 },
  queueScroll: { flex: 1 },
  queueScrollContent: { paddingBottom: space.xxl, flexGrow: 1 },
  title: { fontWeight: '900', letterSpacing: 0.8 },
  subtitle: { marginTop: space.xs, fontWeight: '600' },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  queueSections: { gap: space.md + 2, marginTop: space.sm + 2 },
  deliveredBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
  },
  deliveredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: -space.xs,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  deliveredHeaderText: { flex: 1, minWidth: 0 },
  deliveredTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  deliveredCount: {
    marginTop: space.xs + 1,
    fontSize: 11,
    fontWeight: '700',
  },
  deliveredList: {
    marginTop: space.md,
    gap: space.sm,
  },
  deliveredItem: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  deliveredTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  deliveredCode: {
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  deliveredTime: {
    fontSize: 11,
    fontWeight: '700',
  },
  deliveredMeta: {
    marginTop: space.xs + 1,
    fontSize: 10,
    fontWeight: '700',
  },
  queueTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 0.8 },
  queueHint: { marginTop: space.sm, fontSize: 12, lineHeight: 18 },
  queueBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
  },
  queueBlockWaiting: {
    borderColor: 'rgba(245,158,11,0.35)',
  },
  queueBlockMatch: {
    borderColor: 'rgba(20,184,166,0.35)',
  },
  queueBlockTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: space.sm },
  queueEmpty: { fontSize: 12, fontWeight: '600' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: QUEUE_GRID_GAP },
  driverCard: {
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  driverCardFlex: { flexGrow: 1, flexBasis: '100%', maxWidth: '100%' },
  driverCardWaiting: { borderColor: 'rgba(245,158,11,0.45)' },
  driverCardMatch: { borderColor: 'rgba(20,184,166,0.45)' },
  driverCode: { fontSize: 14, fontWeight: '900' },
  driverMeta: { fontSize: 11, marginTop: space.xs, fontWeight: '700', lineHeight: 16 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: space.xl },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: space.lg + 2,
    paddingVertical: space.md + 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm + 2,
    rowGap: space.sm,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', flex: 1, minWidth: 120 },
  modalCloseText: { fontSize: 13, fontWeight: '700' },
  modalBody: { paddingHorizontal: space.lg + 2, paddingTop: space.xs, paddingBottom: space.xxl },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: space.xs + 2, marginTop: space.sm + 2 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2, marginBottom: space.xs },
  platformBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  platformText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  input: {
    height: 52,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  fieldError: { marginTop: space.xs + 2, fontSize: 12, fontWeight: '600' },
  submitBtn: {
    marginTop: space.md + 2,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  feedback: { marginTop: space.md + 2, padding: space.md + 2, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  feedbackText: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
});
