import { http } from './client';
import type { DriverArrival, KioskPublicConfig, Order, Restaurant } from './types';

export async function listWaitingDrivers() {
  const res = await http.get<DriverArrival[]>('/delivery/drivers/waiting');
  return res.data;
}

export async function kioskListWaitingDrivers() {
  const res = await http.get<DriverArrival[]>('/delivery/kiosk/drivers/waiting');
  return res.data;
}

export async function kioskListDeliveredOrdersToday() {
  const res = await http.get<Order[]>('/delivery/kiosk/orders/delivered/today');
  return res.data;
}

/**
 * Pedidos entregados para una fecha específica (Lima, YYYY-MM-DD).
 * Si `date` es hoy, el backend devuelve los mismos datos que `/today`.
 */
export async function kioskListDeliveredOrdersByDate(date: string) {
  const res = await http.get<Order[]>('/delivery/kiosk/orders/delivered', { params: { date } });
  return res.data;
}

export async function kioskListRestaurants() {
  const res = await http.get<Restaurant[]>('/delivery/kiosk/restaurants');
  return res.data;
}

export async function kioskPublicConfig() {
  const res = await http.get<KioskPublicConfig>('/delivery/kiosk/config');
  return res.data;
}

export interface DniLookupResult {
  first_name: string;
  first_last_name: string;
  second_last_name: string;
  full_name: string;
  document_number: string;
  _raw?: Record<string, unknown>;
}

/**
 * Consulta RENIEC vía proxy del backend (la API key se mantiene server-side).
 * @param numero DNI de 8 dígitos
 */
export async function kioskDniLookup(numero: string): Promise<DniLookupResult> {
  const res = await http.get<DniLookupResult>('/delivery/kiosk/dni-lookup', {
    params: { numero },
  });
  return res.data;
}

export interface RunnerFeatureFlags {
  enable_runner_simulate_order_ready: boolean;
}

export async function fetchRunnerFeatureFlags() {
  const res = await http.get<RunnerFeatureFlags>('/delivery/runner/feature-flags');
  return res.data;
}

export async function simulateRunnerOrderReady(payload: {
  restaurant_fidelio_id: string;
  plataforma: string;
  codigo_pedido: string;
  numero_bolsas?: number;
}) {
  const res = await http.post<Order>('/delivery/runner/simulate/order-ready', payload);
  return res.data;
}

export async function kioskArrival(payload: {
  restaurant_id: number;
  plataforma: string;
  codigo_ingresado: string;
  placa: string;
  alias_conductor: string;
  conductor_dni?: string | null;
}) {
  const res = await http.post<{ driver_arrival: DriverArrival; matched: boolean; matched_order?: Order | null }>(
    '/delivery/kiosk/arrivals',
    payload
  );
  return res.data;
}

/**
 * Sube foto del conductor tras el alta (multipart). Requiere el mismo DNI persistido en el arribo.
 */
export async function kioskUploadDriverPhoto(arrivalId: number, conductorDni: string, fileUri: string) {
  const form = new FormData();
  form.append('conductor_dni', conductorDni.replace(/[\s-]/g, ''));
  const name = fileUri.toLowerCase().endsWith('.png') ? 'photo.png' : 'photo.jpg';
  const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
  form.append('file', { uri: fileUri, name, type: mime } as unknown as Blob);
  const res = await http.post<DriverArrival>(`/delivery/kiosk/arrivals/${arrivalId}/photo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function listActiveOrders() {
  const res = await http.get<Order[]>('/delivery/orders/active');
  return res.data;
}

export async function getOrder(id: number) {
  const res = await http.get<Order>(`/delivery/orders/${id}`);
  return res.data;
}

export async function acceptOrder(orderId: number) {
  const res = await http.post<Order>(`/delivery/orders/${orderId}/accept`);
  return res.data;
}

export async function shelfOrder(orderId: number) {
  const res = await http.post<Order>(`/delivery/orders/${orderId}/shelf`);
  return res.data;
}

export async function deliverOrder(orderId: number) {
  const res = await http.post<Order>(`/delivery/orders/${orderId}/deliver`);
  return res.data;
}

