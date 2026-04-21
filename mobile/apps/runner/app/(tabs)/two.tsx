import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchAuthMe,
  fetchRunnerFeatureFlags,
  kioskListDeliveredOrdersByDate,
  kioskListRestaurants,
  simulateRunnerOrderReady,
  userHasPermission,
} from '@refugio/delivery-api';
import { DELIVERY_PERMISSIONS } from '@refugio/constants';
import { useAuth } from '@/context/AuthContext';
import { useRunnerTheme } from '@/context/ThemeContext';

const PLATFORM_OPTIONS = ['RAPPI', 'PEDIDOSYA'] as const;
type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

const DELIVERED_PAGE_SIZE = 10;

function formatTimePE(iso: string): string {
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

/** Fecha de hoy en zona horaria Lima (UTC−5), formato YYYY-MM-DD */
function todayLima(): string {
  const now = new Date();
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return lima.toISOString().slice(0, 10);
}

/** Desplaza una fecha YYYY-MM-DD en `days` días */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Formatea YYYY-MM-DD → DD/MM/YYYY */
function formatDateDisplay(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** Parsea "HH:MM" → minutos desde medianoche. Retorna null si inválido. */
function parseHHMM(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export default function SettingsScreen() {
  const { logout, token } = useAuth();
  const { palette: p } = useRunnerTheme();

  // —— Simulation modal state ——
  const [restaurantFidelioId, setRestaurantFidelioId] = useState('');
  const [codigoPedido, setCodigoPedido] = useState('');
  const [plataforma, setPlataforma] = useState<PlatformOption>(PLATFORM_OPTIONS[0]);
  const [numeroBolsas, setNumeroBolsas] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [locatarioSelectOpen, setLocatarioSelectOpen] = useState(false);

  // —— Delivered orders modal state ——
  const [deliveredModalVisible, setDeliveredModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayLima);
  const [deliveredPage, setDeliveredPage] = useState(0);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchAuthMe,
    enabled: !!token,
    staleTime: 60_000,
  });
  const runnerFlagsQuery = useQuery({
    queryKey: ['delivery', 'runner', 'feature-flags'],
    queryFn: fetchRunnerFeatureFlags,
    enabled: !!token,
    staleTime: 30_000,
  });
  const canSimulateOrderReady = useMemo(
    () =>
      userHasPermission(meQuery.data, DELIVERY_PERMISSIONS.SIMULATE_ORDER_READY) ||
      (!!runnerFlagsQuery.data?.enable_runner_simulate_order_ready &&
        userHasPermission(meQuery.data, DELIVERY_PERMISSIONS.OPERATE)),
    [meQuery.data, runnerFlagsQuery.data],
  );

  // ── Queries ──
  const restaurantsQuery = useQuery({
    queryKey: ['delivery', 'kiosk', 'restaurants'],
    queryFn: kioskListRestaurants,
    staleTime: 60_000,
    enabled: canSimulateOrderReady,
  });

  const deliveredQuery = useQuery({
    queryKey: ['delivery', 'kiosk', 'orders', 'delivered', selectedDate],
    queryFn: () => kioskListDeliveredOrdersByDate(selectedDate),
    enabled: deliveredModalVisible,
    staleTime: 30_000,
  });

  // ── Client-side time filter + pagination ──
  const filteredDelivered = useMemo(() => {
    const all = deliveredQuery.data ?? [];
    const fromMin = parseHHMM(timeFrom);
    const toMin = parseHHMM(timeTo);
    if (fromMin === null && toMin === null) return all;
    return all.filter((o) => {
      const ts = o.entregado_at ?? o.updated_at;
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return true;
      // hora Lima = UTC−5
      const limaMin = ((d.getUTCHours() * 60 + d.getUTCMinutes()) - 300 + 1440) % 1440;
      if (fromMin !== null && limaMin < fromMin) return false;
      if (toMin !== null && limaMin > toMin) return false;
      return true;
    });
  }, [deliveredQuery.data, timeFrom, timeTo]);

  const totalPages = Math.max(1, Math.ceil(filteredDelivered.length / DELIVERED_PAGE_SIZE));
  const pageDelivered = filteredDelivered.slice(
    deliveredPage * DELIVERED_PAGE_SIZE,
    (deliveredPage + 1) * DELIVERED_PAGE_SIZE,
  );

  // ── Simulation mutation ──
  const simulateMutation = useMutation({
    mutationFn: simulateRunnerOrderReady,
    onSuccess: (order) => {
      setFormError(null);
      setOkMessage(`Pedido ${order.codigo_pedido} registrado como LISTO (id ${order.id}).`);
      setCodigoPedido('');
      setNumeroBolsas('1');
      setModalVisible(false);
    },
    onError: (error) => {
      setOkMessage(null);
      setFormError(extractApiError(error));
    },
  });

  const selectedLocatarioLabel = useMemo(() => {
    const selected = (restaurantsQuery.data ?? []).find((r) => r.fidelio_id === restaurantFidelioId);
    return selected ? `${selected.fidelio_id} - ${selected.nombre}` : '';
  }, [restaurantsQuery.data, restaurantFidelioId]);

  function onSubmitSimulation() {
    setFormError(null);
    setOkMessage(null);
    const restaurantId = restaurantFidelioId.trim().toUpperCase();
    const code = codigoPedido.trim().toUpperCase();
    const bags = Number.parseInt(numeroBolsas, 10);
    if (!restaurantId) { setFormError('Seleccione locatario.'); return; }
    if (!code) { setFormError('Ingrese código de pedido.'); return; }
    if (!Number.isFinite(bags) || bags < 1 || bags > 99) {
      setFormError('Bolsas debe ser un entero entre 1 y 99.');
      return;
    }
    simulateMutation.mutate({
      restaurant_fidelio_id: restaurantId,
      plataforma,
      codigo_pedido: code,
      numero_bolsas: bags,
    });
  }

  function openSimulationModal() {
    setFormError(null);
    setLocatarioSelectOpen(false);
    setModalVisible(true);
  }

  function closeSimulationModal() {
    if (simulateMutation.isPending) return;
    setLocatarioSelectOpen(false);
    setModalVisible(false);
  }

  function openDeliveredModal() {
    setSelectedDate(todayLima());
    setDeliveredPage(0);
    setTimeFrom('');
    setTimeTo('');
    setDeliveredModalVisible(true);
  }

  function closeDeliveredModal() {
    setDeliveredModalVisible(false);
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: p.bg }]}
        contentContainerStyle={styles.content}
      >
        <View style={{ marginBottom: 10 }}>
          <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
            {/* Ver Pedidos Entregados — opción superior */}
            <TouchableOpacity
              style={[styles.row, styles.rowWithBorder, { borderBottomColor: p.border }]}
              onPress={openDeliveredModal}
            >
              <Text style={[styles.rowLabel, { color: p.text }]}>Ver Pedidos Entregados</Text>
              <Text style={[styles.rowChevron, { color: p.muted }]}>›</Text>
            </TouchableOpacity>

            {canSimulateOrderReady ? (
              <TouchableOpacity style={[styles.row]} onPress={openSimulationModal}>
                <Text style={[styles.rowLabel, { color: p.text }]}>Simular Pedido Listo</Text>
                <Text style={[styles.rowChevron, { color: p.muted }]}>›</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* {okMessage ? (
          <View style={[styles.resultBanner, { borderColor: p.successBorder, backgroundColor: p.successBg }]}>
            <Text style={[styles.resultBannerText, { color: p.text }]}>{okMessage}</Text>
          </View>
        ) : null} */}

        <View style={[styles.card, { backgroundColor: p.cardBg, borderColor: p.cardBorder }]}>
          <TouchableOpacity style={[styles.row, { borderBottomColor: p.border }]} onPress={logout}>
            <Text style={[styles.rowLabel, { color: p.error }]}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.versionText, { color: p.muted }]}>RefuChasky App</Text>
      </ScrollView>

      {/* ══════════════════════════════════════════
          Modal: Ver Pedidos Entregados
      ══════════════════════════════════════════ */}
      <Modal
        visible={deliveredModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeDeliveredModal}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={[styles.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.78)' }]}
            onPress={closeDeliveredModal}
          />
          <View style={[styles.modalCard, { backgroundColor: p.bg, borderColor: p.cardBorder }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: p.text }]}>Pedidos Entregados</Text>
              <TouchableOpacity onPress={closeDeliveredModal}>
                <Text style={[styles.modalClose, { color: p.muted }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            {/* Filtro por fecha */}
            <View style={[styles.dateBar, { borderBottomColor: p.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedDate((d) => shiftDate(d, -1));
                  setDeliveredPage(0);
                }}
                style={[styles.dateNavBtn, { borderColor: p.border }]}
              >
                <Text style={[styles.dateNavText, { color: p.text }]}>‹</Text>
              </TouchableOpacity>

              <View style={styles.dateLabelWrap}>
                <Text style={[styles.dateLabel, { color: p.text }]}>
                  {formatDateDisplay(selectedDate)}
                </Text>
                {selectedDate === todayLima() && (
                  <Text style={[styles.dateBadge, { color: p.accent }]}>Hoy</Text>
                )}
              </View>

              <TouchableOpacity
                onPress={() => {
                  setSelectedDate((d) => shiftDate(d, 1));
                  setDeliveredPage(0);
                }}
                disabled={selectedDate >= todayLima()}
                style={[
                  styles.dateNavBtn,
                  { borderColor: p.border },
                  selectedDate >= todayLima() && styles.pageBtnDisabled,
                ]}
              >
                <Text style={[styles.dateNavText, { color: selectedDate >= todayLima() ? p.muted : p.text }]}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Filtro por hora */}
            <View style={[styles.filterBar, { borderBottomColor: p.border }]}>
              <Text style={[styles.filterLabel, { color: p.muted }]}>Desde</Text>
              <TextInput
                value={timeFrom}
                onChangeText={(t) => { setTimeFrom(t); setDeliveredPage(0); }}
                placeholder="08:00"
                placeholderTextColor={p.placeholder}
                style={[styles.filterInput, { color: p.inputText, backgroundColor: p.inputBg, borderColor: p.inputBorder }]}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
              <Text style={[styles.filterLabel, { color: p.muted }]}>Hasta</Text>
              <TextInput
                value={timeTo}
                onChangeText={(t) => { setTimeTo(t); setDeliveredPage(0); }}
                placeholder="23:00"
                placeholderTextColor={p.placeholder}
                style={[styles.filterInput, { color: p.inputText, backgroundColor: p.inputBg, borderColor: p.inputBorder }]}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>

            {/* Count */}
            <Text style={[styles.filterCount, { color: p.muted }]}>
              {filteredDelivered.length} pedido{filteredDelivered.length !== 1 ? 's' : ''}
              {selectedDate !== todayLima() ? ` · ${formatDateDisplay(selectedDate)}` : ''}
              {(timeFrom || timeTo) ? ' (filtrado por hora)' : ''}
            </Text>

            {/* Lista */}
            <ScrollView style={styles.deliveredList} contentContainerStyle={styles.deliveredListContent}>
              {deliveredQuery.isLoading ? (
                <Text style={[styles.hintText, { color: p.muted }]}>Cargando…</Text>
              ) : deliveredQuery.isError ? (
                <Text style={[styles.hintText, { color: p.error }]}>Error cargando pedidos.</Text>
              ) : pageDelivered.length === 0 ? (
                <Text style={[styles.hintText, { color: p.muted }]}>
                  Sin pedidos entregados{(timeFrom || timeTo) ? ' en el horario indicado' : ' hoy'}.
                </Text>
              ) : (
                pageDelivered.map((o) => (
                  <View
                    key={o.id}
                    style={[styles.deliveredItem, { borderColor: p.border, backgroundColor: p.cardBg }]}
                  >
                    <View style={styles.deliveredItemTop}>
                      <Text style={[styles.deliveredCode, { color: p.text }]} numberOfLines={1}>
                        {o.codigo_pedido}
                      </Text>
                      <Text style={[styles.deliveredTime, { color: p.muted }]}>
                        {formatTimePE(o.entregado_at ?? o.updated_at)}
                      </Text>
                    </View>
                    <Text style={[styles.deliveredMeta, { color: p.muted }]} numberOfLines={1}>
                      {o.plataforma}
                      {o.restaurant_nombre ? ` · ${o.restaurant_nombre}` : ''}
                    </Text>
                    {o.numero_bolsas != null ? (
                      <Text style={[styles.deliveredBags, { color: p.muted }]}>
                        {o.numero_bolsas} bolsa{o.numero_bolsas !== 1 ? 's' : ''}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>

            {/* Paginación */}
            <View style={[styles.pagination, { borderTopColor: p.border }]}>
              <TouchableOpacity
                onPress={() => setDeliveredPage((prev) => Math.max(0, prev - 1))}
                disabled={deliveredPage === 0}
                style={[
                  styles.pageBtn,
                  { borderColor: p.border },
                  deliveredPage === 0 && styles.pageBtnDisabled,
                ]}
              >
                <Text style={[styles.pageBtnText, { color: deliveredPage === 0 ? p.muted : p.text }]}>
                  ‹ Anterior
                </Text>
              </TouchableOpacity>
              <Text style={[styles.pageIndicator, { color: p.muted }]}>
                {deliveredPage + 1} / {totalPages}
              </Text>
              <TouchableOpacity
                onPress={() => setDeliveredPage((prev) => Math.min(totalPages - 1, prev + 1))}
                disabled={deliveredPage >= totalPages - 1}
                style={[
                  styles.pageBtn,
                  { borderColor: p.border },
                  deliveredPage >= totalPages - 1 && styles.pageBtnDisabled,
                ]}
              >
                <Text style={[styles.pageBtnText, { color: deliveredPage >= totalPages - 1 ? p.muted : p.text }]}>
                  Siguiente ›
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════════════════════════════════════
          Modal: Simular Pedido Listo
      ══════════════════════════════════════════ */}
      {canSimulateOrderReady ? (
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeSimulationModal}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={[styles.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.78)' }]} onPress={closeSimulationModal} />
          <View style={[styles.modalCard, { backgroundColor: p.bg, borderColor: p.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: p.text }]}>Simular Pedido Listo</Text>
              <TouchableOpacity onPress={closeSimulationModal} disabled={simulateMutation.isPending}>
                <Text style={[styles.modalClose, { color: p.muted }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.helperText, { color: p.muted }]}>Usar solo para locatarios sin integración completa.</Text>

              <Text style={[styles.fieldLabel, { color: p.muted }]}>Locatario*</Text>
              {restaurantsQuery.isError ? (
                <Text style={[styles.fieldError, { color: p.error }]}>No se pudo cargar lista de locatarios.</Text>
              ) : (
                <>
                  <Pressable
                    onPress={() => setLocatarioSelectOpen((v) => !v)}
                    style={({ pressed }) => [
                      styles.selectTrigger,
                      {
                        borderColor: formError ? p.error : p.inputBorder,
                        backgroundColor: p.inputBg,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.selectTriggerText, { color: selectedLocatarioLabel ? p.inputText : p.placeholder }]}
                    >
                      {selectedLocatarioLabel || (restaurantsQuery.isLoading ? 'Cargando locatarios...' : 'Seleccionar locatario')}
                    </Text>
                    <Text style={[styles.selectChevron, { color: p.muted }]}>{locatarioSelectOpen ? '▲' : '▼'}</Text>
                  </Pressable>

                  {locatarioSelectOpen ? (
                    <View style={[styles.selectMenu, { borderColor: p.border, backgroundColor: p.bg }]}>
                      <ScrollView nestedScrollEnabled style={styles.selectMenuScroll}>
                        {(restaurantsQuery.data ?? []).map((r) => {
                          const selected = r.fidelio_id === restaurantFidelioId;
                          return (
                            <Pressable
                              key={r.id}
                              onPress={() => {
                                setRestaurantFidelioId(r.fidelio_id.toUpperCase());
                                setLocatarioSelectOpen(false);
                                setFormError(null);
                              }}
                              style={({ pressed }) => [
                                styles.selectOption,
                                selected && { backgroundColor: p.topBarBg, borderColor: p.accent },
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={[styles.selectOptionText, { color: p.text }]} numberOfLines={1}>
                                {r.fidelio_id} - {r.nombre}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                </>
              )}

              <Text style={[styles.fieldLabel, { color: p.muted }]}>Código pedido *</Text>
              <TextInput
                value={codigoPedido}
                onChangeText={(t) => setCodigoPedido(t.toUpperCase())}
                placeholder="Código"
                placeholderTextColor={p.placeholder}
                style={[
                  styles.input,
                  { color: p.inputText, backgroundColor: p.inputBg, borderColor: formError ? p.error : p.inputBorder },
                ]}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!simulateMutation.isPending}
              />

              <Text style={[styles.fieldLabel, { color: p.muted }]}>Plataforma *</Text>
              <View style={styles.platformRow}>
                {PLATFORM_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => setPlataforma(opt)}
                    style={({ pressed }) => [
                      styles.platformBtn,
                      { borderColor: p.inputBorder, backgroundColor: p.inputBg },
                      plataforma === opt && { borderColor: p.accent, backgroundColor: p.topBarBg },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.platformText, { color: plataforma === opt ? p.accent : p.text }]}>{opt}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: p.muted }]}>Bolsas</Text>
              <TextInput
                value={numeroBolsas}
                onChangeText={(t) => setNumeroBolsas(t.replace(/[^\d]/g, ''))}
                placeholder="1"
                placeholderTextColor={p.placeholder}
                style={[
                  styles.input,
                  { color: p.inputText, backgroundColor: p.inputBg, borderColor: formError ? p.error : p.inputBorder },
                ]}
                keyboardType="number-pad"
                maxLength={2}
                editable={!simulateMutation.isPending}
              />

              {formError ? <Text style={[styles.fieldError, { color: p.error }]}>{formError}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: p.accent, borderColor: p.accent },
                  simulateMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={onSubmitSimulation}
                disabled={simulateMutation.isPending}
              >
                <Text style={[styles.primaryButtonText, { color: p.accentText }]}>
                  {simulateMutation.isPending ? 'Enviando...' : 'Simular Pedido Listo'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 12 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowWithBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowChevron: {
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 24,
  },
  resultBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    marginBottom: 18,
  },
  resultBannerText: {
    fontSize: 12,
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

  // ── Modals shared ──
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalClose: { fontSize: 13, fontWeight: '700' },
  modalBody: { paddingHorizontal: 16, paddingBottom: 24 },

  // ── Delivered orders modal ──
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  dateNavBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavText: { fontSize: 22, fontWeight: '400', lineHeight: 28, textAlign: 'center' },
  dateLabelWrap: { flex: 1, alignItems: 'center', gap: 2 },
  dateLabel: { fontSize: 15, fontWeight: '800' },
  dateBadge: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterLabel: { fontSize: 12, fontWeight: '700' },
  filterInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 0,
  },
  filterCount: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  deliveredList: { flex: 1 },
  deliveredListContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  hintText: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 24 },
  deliveredItem: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  deliveredItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  deliveredCode: { fontSize: 14, fontWeight: '900', flex: 1 },
  deliveredTime: { fontSize: 12, fontWeight: '700' },
  deliveredMeta: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  deliveredBags: { fontSize: 11, fontWeight: '600', marginTop: 2, opacity: 0.7 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  pageBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnText: { fontSize: 13, fontWeight: '700' },
  pageIndicator: { fontSize: 12, fontWeight: '700' },

  // ── Simulation modal form ──
  helperText: { fontSize: 12, fontWeight: '600', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '800', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
  },
  selectTrigger: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTriggerText: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  selectChevron: { fontSize: 12, fontWeight: '900' },
  selectMenu: { marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 6 },
  selectMenuScroll: { maxHeight: 220 },
  selectOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  selectOptionText: { fontSize: 12, fontWeight: '700' },
  platformRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  platformBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  platformText: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.8 },
  fieldError: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  primaryButton: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 14, fontWeight: '900' },
  buttonDisabled: { opacity: 0.55 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  rowHint: { fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
});

function extractApiError(error: unknown): string {
  const e = error as { response?: { data?: { detail?: string } }; message?: string };
  return e?.response?.data?.detail || e?.message || 'No se pudo registrar el pedido listo.';
}
