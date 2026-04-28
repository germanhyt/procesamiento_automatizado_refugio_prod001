import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  LayoutChangeEvent,
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
import Animated, { FadeIn, FadeInDown, Layout, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dropdown } from 'react-native-element-dropdown';
import {
  kioskArrival,
  kioskDniLookup,
  kioskListRestaurants,
  kioskListWaitingDrivers,
  kioskPublicConfig,
  kioskUploadDriverPhoto,
} from '@refugio/delivery-api';
import { DRIVER_STATUS } from '@refugio/constants';
import {
  KIOSK_CE_MAX_LEN,
  KIOSK_CE_MIN_LEN,
  KIOSK_CODE_MAX_LEN,
  KIOSK_CONTENT_FONT_SCALE,
  KIOSK_DNI_MAX_LEN,
  KIOSK_DNI_MIN_LEN,
  KIOSK_DOCUMENTO_TIPOS,
  KIOSK_DRIVER_POLLING_MS,
  KIOSK_PLATFORM_OPTIONS,
  KIOSK_PLACA_MAX_LEN,
  type KioskDocumentoTipo,
  type KioskPlatform,
} from '@/constants/kiosk';
import { cardShadow, modalCardShadow, motion, radius, space, topBarShadow } from '@/constants/kioskLayout';
import { RegisterCtaPointingHand } from '@/components/RegisterCtaPointingHand';
import { useKioskTheme } from '@/components/useKioskTheme';
import type { KioskPalette } from '@/constants/kioskTheme';

const QUEUE_GRID_GAP = 8;
/** Ancho mínimo por tarjeta para 2 columnas (web móvil + nativo). */
const QUEUE_CARD_MIN_WIDTH = 80;
const QUEUE_MAX_ITEMS = 30;
const MODAL_SUCCESS_CLOSE_MS = 1400;
/** Altura máxima de la lista del dropdown (evita pantalla completa; `mode="auto"` aplica maxHeight en el modal). */
const DROPDOWN_LIST_MAX_H = 240;

/** Mapa de colores por estado del driver en la cola */
const STATUS_CONFIG = {
  ESPERANDO: {
    label: 'Esperando',
    borderColor: 'rgba(245,158,11,0.65)',
    bgColorDark: 'rgba(245,158,11,0.11)',
    bgColorLight: 'rgba(245,158,11,0.07)',
    dot: '#F59E0B',
  },
  EN_MATCH: {
    label: 'Por despachar',
    borderColor: 'rgba(20,184,166,0.65)',
    bgColorDark: 'rgba(20,184,166,0.13)',
    bgColorLight: 'rgba(20,184,166,0.07)',
    // verde
    dot: '#16a34a',
  },
  DESPACHADO: {
    label: 'Despachado',
    borderColor: 'rgba(100,116,139,0.40)',
    bgColorDark: 'rgba(100,116,139,0.08)',
    bgColorLight: 'rgba(100,116,139,0.05)',
    dot: '#64748B',
  },
  ABANDONO: {
    label: 'Abandono',
    borderColor: 'rgba(239,68,68,0.65)',
    bgColorDark: 'rgba(239,68,68,0.13)',
    bgColorLight: 'rgba(239,68,68,0.07)',
    dot: '#EF4444',
  },
} as const;

type KioskDriverStatus = keyof typeof STATUS_CONFIG;

function getStatusCfg(estado: string) {
  return STATUS_CONFIG[estado as KioskDriverStatus] ?? STATUS_CONFIG.ESPERANDO;
}

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

/** Leyenda visual de estados activos en la cola */
function QueueLegend({ palette }: { palette: KioskPalette }) {
  const items = [
    STATUS_CONFIG.ESPERANDO,
    STATUS_CONFIG.EN_MATCH,
    STATUS_CONFIG.ABANDONO,
  ] as const;
  return (
    <View style={legendStyles.row}>
      {items.map((cfg) => (
        <View key={cfg.label} style={legendStyles.item}>
          <View style={[legendStyles.dot, { backgroundColor: cfg.dot }]} />
          <Text style={[legendStyles.lbl, { color: palette.muted }]}>{cfg.label}</Text>
        </View>
      ))}
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12, marginTop: 4, paddingHorizontal: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  lbl: { fontSize: 13, fontWeight: '700' },
});

/** Colores sólidos pie de tarjeta (estado), inspirados en bloque “Listo” de cocina. */
const QUEUE_CARD_FOOTER = {
  ESPERANDO: '#d97706',
  EN_MATCH: '#16a34a',
  DESPACHADO: '#64748b',
  ABANDONO: '#dc2626',
} as const;

function queueFooterColor(estado: string): string {
  const e = estado.toUpperCase();
  if (e === 'EN_MATCH') return QUEUE_CARD_FOOTER.EN_MATCH;
  if (e === 'DESPACHADO') return QUEUE_CARD_FOOTER.DESPACHADO;
  if (e === 'ABANDONO') return QUEUE_CARD_FOOTER.ABANDONO;
  return QUEUE_CARD_FOOTER.ESPERANDO;
}

function DriverQueueGrid({
  drivers,
  palette,
  isDark,
  contentWidth,
}: {
  drivers: Array<{
    id: number;
    plataforma: string;
    estado: string;
    codigo_ingresado: string;
    alias_conductor?: string | null;
    restaurant_nombre?: string | null;
    created_at: string;
  }>;
  palette: KioskPalette;
  isDark: boolean;
  /** Ancho de la banda que envuelve el bloque (coincide con el contenedor scroll). */
  contentWidth: number;
}) {
  const themeMode = isDark ? 'dark' : 'light';
  const bandW = Math.max(0, contentWidth);
  /** Área útil de la grilla: el bloque tiene padding horizontal (ver `styles.queueBlock`). */
  const gridInnerW = Math.max(0, bandW - 2 * space.lg);
  const pairMin = QUEUE_CARD_MIN_WIDTH * 2 + QUEUE_GRID_GAP;
  const useTwoColumns = gridInnerW >= pairMin;

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.normal)}
      layout={Layout.duration(motion.fast)}
      style={[
        styles.queueBlock,
        { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
        cardShadow(themeMode),
      ]}
    >
      <View style={styles.queueBlockHeader}>
        <Text style={[styles.queueBlockTitle, { color: palette.text }]}>Cola de drivers</Text>
        <Text style={[styles.queueBlockCount, { color: palette.muted }]}>
          {drivers.length} {drivers.length === 1 ? 'driver' : 'drivers'}
        </Text>
      </View>
      <QueueLegend palette={palette} />
      {drivers.length === 0 ? (
        <Text style={[styles.queueEmpty, { color: palette.muted }]}>Sin drivers en espera</Text>
      ) : (
        <View style={styles.gridWrap}>
          {drivers.map((d, index) => {
            const cfg = getStatusCfg(d.estado);
            const footerHex = queueFooterColor(d.estado);
            const headerBg = isDark ? '#0a0f1a' : '#0f172a';
            const bodyBg = isDark ? '#1a2332' : '#ffffff';
            const bodyMainColor = isDark ? palette.text : '#0f172a';
            const bodyMuted = isDark ? palette.muted : '#64748b';
            const subline = [d.alias_conductor?.trim(), d.plataforma].filter(Boolean).join(' · ') || d.plataforma;
            // const bodyLeft = [d.restaurant_nombre?.trim(), cfg.label].filter(Boolean).join(' · ') || cfg.label;
            const bodyLeft = d.restaurant_nombre?.trim() || cfg.label;

            return (
              <Animated.View
                key={d.id}
                entering={
                  FadeIn.delay(Math.min(index * 48, 280)).duration(motion.normal)
                }
                style={[
                  styles.driverCardCell,
                  useTwoColumns
                    ? {
                      flexGrow: 1,
                      flexShrink: 1,
                      flexBasis: 0,
                      minWidth: QUEUE_CARD_MIN_WIDTH,
                    }
                    : { width: '100%' as const, flexGrow: 0, flexShrink: 0 },
                ]}
              >
                <View
                  style={[
                    styles.driverCardShell,
                    cardShadow(themeMode),
                    { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' },
                  ]}
                >
                  <View style={[styles.driverCardHeader, { backgroundColor: headerBg }]}>
                    <Text style={styles.driverCardCode} numberOfLines={1}>
                      №{d.codigo_ingresado}
                    </Text>
                    <Text style={styles.driverCardSubline} numberOfLines={2}>
                      {subline}
                    </Text>
                  </View>
                  <View style={[styles.driverCardBody, { backgroundColor: bodyBg }]}>
                    <View style={styles.driverCardBodyRow}>
                      <Text style={[styles.driverCardBodyMain, { color: bodyMainColor }]} numberOfLines={2}>
                        {bodyLeft}
                      </Text>
                      <Text style={[styles.driverCardBodyTime, { color: bodyMuted }]}>
                        {formatTime(d.created_at)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.driverCardFooter, { backgroundColor: footerHex }]}>
                    <Text style={styles.driverCardFooterText}>{cfg.label.toUpperCase()}</Text>
                  </View>
                </View>
              </Animated.View>
            );
          })}
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
  const titleFontSize = Math.round((isCompactHeader ? 16 : 20) * KIOSK_CONTENT_FONT_SCALE);
  const subtitleFontSize = Math.round((isCompactHeader ? 12 : 14) * KIOSK_CONTENT_FONT_SCALE);
  const queueContentWidthFallback = Math.max(0, windowWidth - 2 * contentPadH);

  const [queueBandWidth, setQueueBandWidth] = useState(0);
  const onQueueBandLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setQueueBandWidth((prev) => (w > 0 && w !== prev ? w : prev));
  }, []);

  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [modalAnimKey, setModalAnimKey] = useState(0);
  const [plataforma, setPlataforma] = useState<KioskPlatform>(KIOSK_PLATFORM_OPTIONS[0]);
  const [codigo, setCodigo] = useState('');
  const [placa, setPlaca] = useState('');
  const [alias, setAlias] = useState('');
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const [dni, setDni] = useState('');
  const [documentoTipo, setDocumentoTipo] = useState<KioskDocumentoTipo>('DNI');
  const [carneExtranjeria, setCarneExtranjeria] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const successCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Registration flow ──
  const [registrationStep, setRegistrationStep] = useState<'form' | 'confirm'>('form');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [dniLookupName, setDniLookupName] = useState<string | null>(null);
  const [dniLookupLoading, setDniLookupLoading] = useState(false);
  const [lastArrivalMatched, setLastArrivalMatched] = useState(false);
  const [lastMatchedCode, setLastMatchedCode] = useState<string | null>(null);
  const lastPhotoDocRef = useRef<{ tipo: KioskDocumentoTipo; dni: string; ce: string }>({
    tipo: 'DNI',
    dni: '',
    ce: '',
  });
  const lastArrivalIdRef = useRef<number | null>(null);
  const lastAliasRef = useRef('');
  const photoUploadedRef = useRef(false);
  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraCountdown, setCameraCountdown] = useState<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraCaptured, setCameraCaptured] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Pre-fetch DNI: stores the last fetched DNI to avoid duplicate requests
  const prefetchedDniRef = useRef<string>('');

  const qc = useQueryClient();

  const restaurantsQuery = useQuery({
    queryKey: ['delivery', 'kiosk', 'restaurants'],
    queryFn: kioskListRestaurants,
    staleTime: 60_000,
  });

  const kioskConfigQuery = useQuery({
    queryKey: ['delivery', 'kiosk', 'config'],
    queryFn: kioskPublicConfig,
    staleTime: 30_000,
  });

  const enableDriverDni = kioskConfigQuery.data?.enable_driver_dni_lookup ?? false;
  const enableDriverPhoto = kioskConfigQuery.data?.enable_driver_photo_capture ?? false;

  const dniDigits = useMemo(() => dni.replace(/[\s-]/g, ''), [dni]);
  const ceNorm = useMemo(() => carneExtranjeria.replace(/[\s-]/g, '').toUpperCase(), [carneExtranjeria]);
  const docFieldsOk = useMemo(() => {
    if (!enableDriverDni) return true;
    if (documentoTipo === 'DNI') {
      return (
        dniDigits.length >= KIOSK_DNI_MIN_LEN &&
        dniDigits.length <= KIOSK_DNI_MAX_LEN &&
        /^\d+$/.test(dniDigits)
      );
    }
    return (
      ceNorm.length >= KIOSK_CE_MIN_LEN &&
      ceNorm.length <= KIOSK_CE_MAX_LEN &&
      /^[A-Z0-9]+$/.test(ceNorm)
    );
  }, [enableDriverDni, documentoTipo, dniDigits, ceNorm]);
  const canSubmit = useMemo(
    () =>
      restaurantId != null &&
      codigo.trim().length > 0 &&
      placa.trim().length > 0 &&
      alias.trim().length > 0 &&
      docFieldsOk &&
      !isSubmitting,
    [restaurantId, codigo, placa, alias, docFieldsOk, isSubmitting],
  );

  const restaurantOptions = useMemo(
    () => (restaurantsQuery.data ?? []).map((r) => ({ label: r.nombre, value: r.id })),
    [restaurantsQuery.data],
  );

  const driversQuery = useQuery({
    queryKey: ['delivery', 'drivers', 'waiting'],
    queryFn: kioskListWaitingDrivers,
    refetchInterval: KIOSK_DRIVER_POLLING_MS,
  });



  const arrivalMutation = useMutation({
    mutationFn: async (payload: {
      restaurant_id: number;
      plataforma: string;
      codigo_ingresado: string;
      placa: string;
      alias_conductor: string;
      conductor_documento_tipo?: string | null;
      conductor_dni?: string | null;
      conductor_carne_extranjeria?: string | null;
    }) => kioskArrival(payload),
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
    setRestaurantId(null);
    setDni('');
    setDocumentoTipo('DNI');
    setCarneExtranjeria('');
    setFeedback(null);
    setFieldError(null);
    setRegistrationStep('form');
    setCapturedPhotoUri(null);
    setDniLookupName(null);
    setDniLookupLoading(false);
    setLastArrivalMatched(false);
    setLastMatchedCode(null);
    lastPhotoDocRef.current = { tipo: 'DNI', dni: '', ce: '' };
    lastArrivalIdRef.current = null;
    lastAliasRef.current = '';
    photoUploadedRef.current = false;
    setCameraCountdown(null);
    setCameraReady(false);
    setCameraCaptured(false);
    prefetchedDniRef.current = '';
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const closeRegisterModal = useCallback(() => {
    clearSuccessTimer();
    setRegisterModalVisible(false);
    resetForm();
  }, [clearSuccessTimer, resetForm]);

  useEffect(() => {
    return () => {
      clearSuccessTimer();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [clearSuccessTimer]);

  useEffect(() => {
    setFieldError(null);
    if (documentoTipo !== 'DNI') {
      setDniLookupName(null);
      setDniLookupLoading(false);
      prefetchedDniRef.current = '';
      setDni('');
    } else {
      setCarneExtranjeria('');
    }
  }, [documentoTipo]);

  // ── Pre-fetch DNI while user is still on the form ──
  useEffect(() => {
    if (
      !enableDriverDni ||
      documentoTipo !== 'DNI' ||
      registrationStep !== 'form' ||
      dniDigits.length < KIOSK_DNI_MIN_LEN ||
      dniDigits.length > KIOSK_DNI_MAX_LEN ||
      !/^\d+$/.test(dniDigits) ||
      prefetchedDniRef.current === dniDigits
    ) return;
    prefetchedDniRef.current = dniDigits;
    setDniLookupLoading(true);
    setDniLookupName(null);
    kioskDniLookup(dniDigits)
      .then((res) => setDniLookupName(res.full_name ?? null))
      .catch(() => setDniLookupName(null))
      .finally(() => setDniLookupLoading(false));
  }, [dniDigits, registrationStep, enableDriverDni, documentoTipo]);

  // ── Auto-capture countdown ──
  const startCameraCountdown = useCallback(() => {
    setCameraCountdown(3);
    setCameraCaptured(false);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setCameraCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Trigger capture when countdown finishes and camera is ready
  useEffect(() => {
    if (!enableDriverPhoto) return;
    if (cameraCountdown !== null || !cameraReady || cameraCaptured || registrationStep !== 'confirm') return;
    setCameraCaptured(true);
    cameraRef.current
      ?.takePictureAsync({ quality: 0.75, skipProcessing: true })
      .then((photo) => { if (photo?.uri) setCapturedPhotoUri(photo.uri); })
      .catch(() => {/* continue without photo */ });
  }, [cameraCountdown, cameraReady, cameraCaptured, registrationStep, enableDriverPhoto]);

  useEffect(() => {
    if (!enableDriverPhoto || !capturedPhotoUri) return;
    const id = lastArrivalIdRef.current;
    if (!id || photoUploadedRef.current) return;
    const { dni: docDni, ce: docCe } = lastPhotoDocRef.current;
    if (enableDriverDni && !docDni && !docCe) return;
    photoUploadedRef.current = true;
    kioskUploadDriverPhoto(id, { conductorDni: docDni, conductorCarneExtranjeria: docCe }, capturedPhotoUri).catch(
      (err) => {
        photoUploadedRef.current = false;
        console.warn('[kiosk] Falló subida de foto del conductor', err);
      },
    );
  }, [capturedPhotoUri, enableDriverPhoto, enableDriverDni]);

  const submit = async () => {
    setFieldError(null);
    if (!codigo.trim()) { setFieldError('Ingresa el código del pedido.'); return; }
    if (!placa.trim()) { setFieldError('Ingresa la placa.'); return; }
    if (!alias.trim()) { setFieldError('Ingresa el nombre o alias del conductor.'); return; }
    if (restaurantId == null) { setFieldError('Selecciona el restaurante.'); return; }
    let dniNorm = '';
    let ceSubmit = '';
    if (enableDriverDni) {
      if (documentoTipo === 'DNI') {
        dniNorm = dni.replace(/[\s-]/g, '');
        if (!/^\d+$/.test(dniNorm) || dniNorm.length < KIOSK_DNI_MIN_LEN || dniNorm.length > KIOSK_DNI_MAX_LEN) {
          setFieldError(`DNI: ${KIOSK_DNI_MIN_LEN} a ${KIOSK_DNI_MAX_LEN} dígitos.`);
          return;
        }
      } else {
        ceSubmit = ceNorm;
        if (
          ceSubmit.length < KIOSK_CE_MIN_LEN ||
          ceSubmit.length > KIOSK_CE_MAX_LEN ||
          !/^[A-Z0-9]+$/.test(ceSubmit)
        ) {
          setFieldError(
            `Carné extranjería: ${KIOSK_CE_MIN_LEN} a ${KIOSK_CE_MAX_LEN} caracteres alfanuméricos.`,
          );
          return;
        }
      }
    }
    if (!canSubmit) return;
    setIsSubmitting(true);
    setFeedback(null);

    // If name wasn't pre-fetched yet, start it now (non-blocking)
    if (
      enableDriverDni &&
      documentoTipo === 'DNI' &&
      dniNorm &&
      !dniLookupName &&
      prefetchedDniRef.current !== dniNorm
    ) {
      prefetchedDniRef.current = dniNorm;
      setDniLookupLoading(true);
      kioskDniLookup(dniNorm)
        .then((res) => setDniLookupName(res.full_name ?? null))
        .catch(() => setDniLookupName(null))
        .finally(() => setDniLookupLoading(false));
    }

    try {
      lastAliasRef.current = alias.trim();
      const documentoPayload = !enableDriverDni
        ? {}
        : documentoTipo === 'DNI'
          ? {
            conductor_documento_tipo: 'DNI' as const,
            conductor_dni: dniNorm,
            conductor_carne_extranjeria: null as string | null,
          }
          : {
            conductor_documento_tipo: 'CE' as const,
            conductor_dni: null as string | null,
            conductor_carne_extranjeria: ceSubmit,
          };

      const data = await arrivalMutation.mutateAsync({
        restaurant_id: restaurantId!,
        plataforma,
        codigo_ingresado: codigo.trim(),
        placa: placa.trim().toUpperCase(),
        alias_conductor: alias.trim(),
        ...documentoPayload,
      });

      setLastArrivalMatched(data?.matched ?? false);
      setLastMatchedCode(data?.matched_order?.codigo_pedido ?? null);
      lastPhotoDocRef.current = enableDriverDni
        ? documentoTipo === 'DNI'
          ? { tipo: 'DNI', dni: dniNorm, ce: '' }
          : { tipo: 'CE', dni: '', ce: ceSubmit }
        : { tipo: 'DNI', dni: '', ce: '' };
      lastArrivalIdRef.current = data.driver_arrival.id;
      photoUploadedRef.current = false;
      const serverName = data.driver_arrival.conductor_nombre_completo?.trim();
      if (serverName) setDniLookupName(serverName);

      setCodigo(''); setPlaca(''); setAlias(''); setDni(''); setCarneExtranjeria('');
      setFieldError(null);

      // Request camera permission and go directly to confirm (with embedded camera)
      if (enableDriverPhoto && cameraPermission && !cameraPermission.granted) {
        await requestCameraPermission();
      }
      setCameraReady(false);
      setCapturedPhotoUri(null);
      setCameraCaptured(false);
      setRegistrationStep('confirm');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'No se pudo registrar. Verifica la conexión con el backend.';
      setFeedback({ kind: 'err', msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Cola unificada: todos los estados excepto DESPACHADO (entregados se sacan de la cola) */
  const queueDrivers = useMemo(
    () =>
      (driversQuery.data ?? [])
        .filter((d) => d.estado !== DRIVER_STATUS.DESPACHADO)
        .slice(0, QUEUE_MAX_ITEMS),
    [driversQuery.data],
  );

  const openRegisterModal = () => {
    clearSuccessTimer();
    resetForm();
    setModalAnimKey((k) => k + 1);
    setRegisterModalVisible(true);
  };

  const onBackdropPress = () => {
    if (isSubmitting) return;
    if (registrationStep === 'confirm') return;
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

      <View style={[styles.main, { paddingHorizontal: contentPadH, paddingTop: space.lg, paddingBottom: space.lg }]}>
        <View style={styles.registerBtnRow}>
          <Pressable
            style={({ pressed }) => [
              styles.openModalBtn,
              styles.openModalBtnFull,
              { backgroundColor: palette.accent },
              pressed && styles.pressedPrimary,
            ]}
            onPress={openRegisterModal}
            android_ripple={ripple('rgba(0,0,0,0.2)')}
            accessibilityRole="button"
            accessibilityLabel={registerBtnLabel}
          >
            <View style={styles.registerCtaRow}>
              <Text style={[styles.openModalBtnText, { color: palette.accentText }]}>{registerBtnLabel}</Text>
              <RegisterCtaPointingHand color={palette.accentText} paused={registerModalVisible} />
            </View>
          </Pressable>
        </View>

        <ScrollView
          style={styles.queueScroll}
          contentContainerStyle={[styles.queueScrollContent, styles.queueScrollContentWidth]}
          showsVerticalScrollIndicator
        >
          {driversQuery.isLoading ? (
            <Text style={[styles.queueHint, { color: palette.muted }]}>Cargando…</Text>
          ) : driversQuery.isError ? (
            <Text style={[styles.queueHint, { color: palette.error }]}>Error cargando drivers.</Text>
          ) : (
            <View style={styles.queueSections}>
              <View style={styles.queueMeasureBand} onLayout={onQueueBandLayout}>
                <DriverQueueGrid
                  drivers={queueDrivers}
                  palette={palette}
                  isDark={isDark}
                  contentWidth={queueBandWidth > 0 ? queueBandWidth : queueContentWidthFallback}
                />
              </View>
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
            {/* ───── HEADER ───── */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>
                {registrationStep === 'form' ? 'Registro de driver' : '¡Registrado!'}
              </Text>
              <Pressable
                onPress={closeRegisterModal}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                hitSlop={12}
              >
                <Text style={[styles.modalCloseText, { color: palette.muted }]}>Cerrar</Text>
              </Pressable>
            </View>

            {/* ───── STEP 1: FORM ───── */}
            {registrationStep === 'form' && (
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

                <Text style={[styles.fieldLabel, { color: palette.muted }]}>Restaurante *</Text>
                {restaurantsQuery.isError ? (
                  <Text style={[styles.fieldError, { color: palette.error, marginBottom: space.sm }]}>
                    No se pudieron cargar restaurantes. Revise la API.
                  </Text>
                ) : null}
                <Dropdown
                  mode="auto"
                  style={[
                    styles.dropdown,
                    {
                      borderColor:
                        fieldError && restaurantId == null ? palette.error : palette.inputBorder,
                      backgroundColor: palette.inputBg,
                    },
                  ]}
                  containerStyle={[
                    styles.dropdownListContainer,
                    {
                      backgroundColor: palette.modalBg,
                      borderColor: palette.border,
                      maxHeight: DROPDOWN_LIST_MAX_H,
                    },
                  ]}
                  placeholderStyle={[styles.dropdownPlaceholder, { color: palette.placeholder }]}
                  selectedTextStyle={[styles.dropdownSelected, { color: palette.inputText }]}
                  itemTextStyle={{ color: palette.inputText }}
                  activeColor={isDark ? 'rgba(45,212,191,0.15)' : 'rgba(13,148,136,0.12)'}
                  data={restaurantOptions}
                  maxHeight={DROPDOWN_LIST_MAX_H}
                  labelField="label"
                  valueField="value"
                  placeholder={restaurantsQuery.isLoading ? 'Cargando locales…' : 'Elegir restaurante…'}
                  value={restaurantId}
                  onChange={(item) => {
                    setRestaurantId(item.value as number);
                    setFieldError(null);
                  }}
                  disable={restaurantsQuery.isLoading || restaurantOptions.length === 0}
                  search
                  searchPlaceholder="Buscar restaurante…"
                  renderInputSearch={(onSearch) => (
                    <View
                      style={[
                        styles.dropdownSearchOuter,
                        {
                          borderColor: palette.border,
                          backgroundColor: palette.inputBg,
                        },
                      ]}
                    >
                      <TextInput
                        style={[styles.dropdownSearchInput, { color: palette.inputText }]}
                        placeholder="Buscar restaurante…"
                        placeholderTextColor={palette.placeholder}
                        onChangeText={onSearch}
                        autoCorrect={false}
                        autoCapitalize="none"
                        underlineColorAndroid="transparent"
                      />
                    </View>
                  )}
                />



                <Text style={[styles.fieldLabel, { color: palette.muted }]}>Código de pedido *</Text>
                <TextInput
                  value={codigo}
                  onChangeText={(t) => setCodigo(t.toUpperCase())}
                  placeholder="Código pedido…"
                  placeholderTextColor={palette.placeholder}
                  style={[
                    styles.input,
                    {
                      color: palette.inputText, backgroundColor: palette.inputBg,
                      borderColor: fieldError ? palette.error : palette.inputBorder
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

                {enableDriverDni ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: palette.muted }]}>Documento del conductor *</Text>
                    <View style={styles.docTipoRow}>
                      {KIOSK_DOCUMENTO_TIPOS.map((t) => {
                        const active = documentoTipo === t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => {
                              if (t !== documentoTipo) setDocumentoTipo(t);
                            }}
                            style={({ pressed }) => [
                              styles.docTipoChip,
                              {
                                backgroundColor: active ? palette.accent : palette.inputBg,
                                borderColor: active ? palette.accent : palette.inputBorder,
                              },
                              pressed && !active && styles.pressedSubtle,
                            ]}
                            android_ripple={ripple('rgba(0,0,0,0.08)')}
                          >
                            <Text
                              style={[
                                styles.docTipoChipText,
                                { color: active ? palette.accentText : palette.text },
                              ]}
                            >
                              {t === 'DNI' ? 'DNI' : 'Carné extranjería'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {documentoTipo === 'DNI' ? (
                      <>
                        <Text style={[styles.fieldLabel, { color: palette.muted }]}>Número DNI *</Text>
                        <TextInput
                          value={dni}
                          onChangeText={(txt) => setDni(txt.replace(/[^\d\s-]/g, ''))}
                          placeholder="DNI…"
                          placeholderTextColor={palette.placeholder}
                          style={[
                            styles.input,
                            {
                              color: palette.inputText,
                              backgroundColor: palette.inputBg,
                              borderColor: palette.inputBorder,
                            },
                          ]}
                          keyboardType="number-pad"
                          maxLength={KIOSK_DNI_MAX_LEN + 2}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={[styles.fieldLabel, { color: palette.muted }]}>Número carné *</Text>
                        <TextInput
                          value={carneExtranjeria}
                          onChangeText={(txt) =>
                            setCarneExtranjeria(txt.replace(/[^a-zA-Z0-9\s-]/g, '').toUpperCase())
                          }
                          placeholder="Carné de extranjería…"
                          placeholderTextColor={palette.placeholder}
                          style={[
                            styles.input,
                            {
                              color: palette.inputText,
                              backgroundColor: palette.inputBg,
                              borderColor: palette.inputBorder,
                            },
                          ]}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          maxLength={KIOSK_CE_MAX_LEN + 2}
                        />
                      </>
                    )}
                  </>
                ) : null}

                <Text style={[styles.fieldLabel, { color: palette.muted }]}>Nombre del conductor *</Text>
                <TextInput
                  value={alias}
                  onChangeText={setAlias}
                  placeholder="Escribe aquí..."
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
                      feedback.kind === 'err' && { backgroundColor: palette.dangerBg, borderColor: palette.dangerBorder },
                    ]}
                  >
                    <Text style={[styles.feedbackText, { color: palette.text }]}>{feedback.msg}</Text>
                  </Animated.View>
                ) : null}
              </ScrollView>
            )}

            {/* ───── STEP 2: CONFIRM ───── */}
            {registrationStep === 'confirm' && (
              <Animated.View entering={FadeIn.duration(300)} style={styles.confirmStep}>
                {/* Success header */}
                <View style={styles.confirmSuccessRow}>
                  <Ionicons name="checkmark-circle" size={28} color={palette.successBorder} />
                  <Text style={[styles.confirmSuccessTitle, { color: palette.successBorder }]}>
                    ¡Registro exitoso!
                  </Text>
                </View>

                {/* Camera or captured photo */}
                {enableDriverPhoto ? (
                  capturedPhotoUri ? (
                    <Animated.View entering={ZoomIn.duration(300)}>
                      <Image source={{ uri: capturedPhotoUri }} style={[styles.driverPhoto, { borderColor: palette.accent }]} />
                    </Animated.View>
                  ) : cameraPermission?.granted ? (
                    <View style={styles.cameraContainer}>
                      <CameraView
                        ref={cameraRef}
                        style={styles.cameraPreview}
                        facing="front"
                        onCameraReady={() => {
                          setCameraReady(true);
                          startCameraCountdown();
                        }}
                      />
                      {cameraCountdown !== null && (
                        <View style={styles.countdownOverlay}>
                          <Text style={styles.countdownText}>{cameraCountdown}</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={[styles.driverPhotoPlaceholder, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                      <Ionicons name="videocam-off-outline" size={42} color={palette.muted} />
                      <Text style={[styles.noPermText, { color: palette.muted }]}>Sin acceso a cámara</Text>
                    </View>
                  )
                ) : null}

                {/* Nombre RENIEC (DNI), carné (CE) o alias (modo básico) */}
                {enableDriverDni ? (
                  lastPhotoDocRef.current.tipo === 'CE' ? (
                    <Text style={[styles.confirmName, { color: palette.text }]} numberOfLines={1}>
                      Carné {lastPhotoDocRef.current.ce}
                    </Text>
                  ) : dniLookupLoading ? (
                    <View style={styles.confirmNameLoadingRow}>
                      <Ionicons name="hourglass-outline" size={14} color={palette.muted} />
                      <Text style={[styles.confirmNameLoading, { color: palette.muted }]}>Consultando RENIEC…</Text>
                    </View>
                  ) : dniLookupName ? (
                    <Text style={[styles.confirmName, { color: palette.text }]} numberOfLines={2}>
                      {dniLookupName}
                    </Text>
                  ) : (
                    <Text style={[styles.confirmName, { color: palette.muted }]} numberOfLines={1}>
                      {lastPhotoDocRef.current.dni || 'Driver'}
                    </Text>
                  )
                ) : (
                  <Text style={[styles.confirmName, { color: palette.text }]} numberOfLines={2}>
                    {lastAliasRef.current || 'Conductor'}
                  </Text>
                )}

                {/* Match status badge */}
                <View
                  style={[
                    styles.confirmBadge,
                    {
                      backgroundColor: lastArrivalMatched ? palette.successBg : palette.infoBg,
                      borderColor: lastArrivalMatched ? palette.successBorder : palette.infoBorder,
                    },
                  ]}
                >
                  <Ionicons
                    name={lastArrivalMatched ? 'flash' : 'time-outline'}
                    size={16}
                    color={lastArrivalMatched ? palette.successBorder : palette.infoBorder}
                  />
                  <Text style={[styles.confirmBadgeTxt, { color: lastArrivalMatched ? palette.successBorder : palette.infoBorder }]}>
                    {lastArrivalMatched
                      ? `Pedido ${lastMatchedCode ?? ''} asignado`
                      : 'En espera de pedido'}
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.submitBtn,
                    {
                      backgroundColor: palette.accent,
                      marginTop: space.lg
                    },
                    pressed && styles.pressedPrimary,
                  ]}
                  onPress={closeRegisterModal}
                >
                  <Text style={[styles.submitText, { color: palette.accentText }]}>CERRAR</Text>
                </Pressable>
              </Animated.View>
            )}
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

    paddingTop: 32,
    paddingBottom: 10,
  },
  topBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',

    paddingTop: 32,
    paddingBottom: 10,
  },
  topBarWideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,

    paddingTop: 32,
    paddingBottom: 10,
  },
  topBarUpperRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm + 2,

    paddingTop: 32,
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
  registerBtnRow: {
    width: '100%',
    marginBottom: space.md,
  },
  registerCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  openModalBtn: {
    marginTop: space.md,
    borderRadius: radius.xl,
    paddingHorizontal: space.xxl + 4,
    paddingVertical: space.xl + 2,
    minHeight: 68,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      web: {
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
      },
    }),
  },
  openModalBtnFull: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  openModalBtnText: { fontSize: 20, fontWeight: '900', letterSpacing: 2.4 },
  pressedSubtle: { opacity: 0.88 },
  pressedPrimary: { opacity: 0.94, transform: [{ scale: 0.98 }] },
  main: { flex: 1, minHeight: 0 },
  queueScroll: { flex: 1 },
  queueScrollContent: { paddingBottom: space.xxl, flexGrow: 1 },
  /** En web, sin esto el contenido del ScrollView suele medir solo el ancho intrínseco y la grilla hace wrap a 1 columna. */
  queueScrollContentWidth: { width: '100%' },
  title: { fontWeight: '900', letterSpacing: 0.8 },
  subtitle: { marginTop: space.xs, fontWeight: '600' },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  queueSections: { gap: space.md + 1, marginTop: space.sm + 1 },
  queueMeasureBand: { width: '100%' },
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
  deliveredRestaurant: {
    marginTop: space.xs + 1,
    fontSize: 11,
    fontWeight: '800',
  },
  deliveredMeta: {
    marginTop: space.xs + 1,
    fontSize: 10,
    fontWeight: '700',
  },
  queueTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 0.8 },
  queueHint: { marginTop: space.sm, fontSize: 14, lineHeight: 21 },
  queueBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
  },
  queueBlockHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  queueBlockTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 0.6 },
  queueBlockCount: { fontSize: 13, fontWeight: '700' },
  queueEmpty: { fontSize: 15, fontWeight: '600', marginTop: space.sm },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: QUEUE_GRID_GAP,
    marginTop: space.xs,
    alignContent: 'flex-start',
    width: '100%',
    alignSelf: 'stretch',
  },
  driverCardCell: {
    minWidth: 0,

  },
  driverCardShell: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  driverCardHeader: {
    paddingVertical: space.md + 2,
    paddingHorizontal: space.md + 2,
  },
  driverCardCode: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  driverCardSubline: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: space.xs + 2,
    lineHeight: 20,
  },
  driverCardBody: {
    paddingVertical: space.md + 2,
    paddingHorizontal: space.md + 2,
  },
  driverCardBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 40
  },
  driverCardBodyMain: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    minWidth: 0,
  },
  driverCardBodyTime: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 0,
    paddingTop: 1,
  },
  driverCardFooter: {
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverCardFooterText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
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
  modalTitle: { fontSize: 17, fontWeight: '900', flex: 1, minWidth: 120 },
  modalCloseText: { fontSize: 14, fontWeight: '700' },
  modalBody: { paddingHorizontal: space.lg + 2, paddingTop: space.xs, paddingBottom: space.xxl },
  fieldLabel: { fontSize: 12, fontWeight: '800', marginBottom: space.xs + 2, marginTop: space.sm + 2 },
  docTipoRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.xs },
  docTipoChip: {
    flex: 1,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  docTipoChipText: { fontSize: 13, fontWeight: '800' },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2, marginBottom: space.xs },
  platformBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  platformText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  dropdown: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  dropdownPlaceholder: { fontSize: 16, fontWeight: '600' },
  dropdownSelected: { fontSize: 17, fontWeight: '700' },
  /** Un solo borde: la librería aplica inputSearchStyle al View y al TextInput → doble marco si usamos inputSearchStyle con border. */
  dropdownSearchOuter: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginHorizontal: 6,
    marginTop: 6,
    marginBottom: 8,
    minHeight: 45,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  dropdownSearchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 0,
    borderWidth: 0,
    fontSize: 17,
    fontWeight: '600',
  },
  dropdownListContainer: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    height: 52,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  fieldError: { marginTop: space.xs + 2, fontSize: 13, fontWeight: '600' },
  submitBtn: {
    marginTop: space.md + 2,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  feedback: { marginTop: space.md + 2, padding: space.md + 2, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  feedbackText: { fontSize: 13, fontWeight: '700', lineHeight: 20 },

  // ── Step 2: Confirm + Camera ──
  cameraContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraPreview: {
    width: 160,
    height: 160,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  countdownText: {
    fontSize: 56,
    fontWeight: '900',
    color: '#ffffff',
  },
  noPermText: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  confirmStep: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.xl + 8,
    gap: 14,
  },
  confirmSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  confirmSuccessTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  driverPhoto: {
    width: 140,
    height: 140,
    borderRadius: 70,
    resizeMode: 'cover',
    borderWidth: 3,
  },
  driverPhotoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmName: { fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: 0.2 },
  confirmNameLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmNameLoading: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  confirmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 99,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  confirmBadgeTxt: { fontSize: 13, fontWeight: '700' },
});
