import { http } from './client';
  import type { DriverArrival, Order, Restaurant } from './types';

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

export async function kioskListRestaurants() {
  const res = await http.get<Restaurant[]>('/delivery/kiosk/restaurants');
  return res.data;
}

export async function kioskArrival(payload: {
  restaurant_id: number;
  plataforma: string;
  codigo_ingresado: string;
  placa: string;
  alias_conductor: string;
  conductor_dni: string;
}) {
  const res = await http.post<{ driver_arrival: DriverArrival; matched: boolean; matched_order?: Order | null }>(
    '/delivery/kiosk/arrivals',
    payload
  );
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

