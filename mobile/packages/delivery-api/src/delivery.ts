import { http } from './client';
import type { DriverArrival, Order } from './types';

export async function listWaitingDrivers() {
  const res = await http.get<DriverArrival[]>('/delivery/drivers/waiting');
  return res.data;
}

export async function kioskListWaitingDrivers() {
  const res = await http.get<DriverArrival[]>('/delivery/kiosk/drivers/waiting');
  return res.data;
}

export async function kioskArrival(payload: { plataforma: string; codigo_ingresado: string; placa?: string | null }) {
  const res = await http.post<{ driver_arrival: DriverArrival; matched: boolean; matched_order?: Order | null }>(
    '/delivery/kiosk/arrivals',
    payload
  );
  return res.data;
}

