import type { DriverStatus, OrderStatus } from '@refugio/constants';

export interface Order {
  id: number;
  restaurant_id: number;
  plataforma: string;
  codigo_pedido: string;
  estado: OrderStatus;
  numero_bolsas?: number | null;
  locked_by_runner_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface DriverArrival {
  id: number;
  plataforma: string;
  codigo_ingresado: string;
  placa?: string | null;
  alias_conductor?: string | null;
  estado: DriverStatus;
  matched_order_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ManualMatchIn {
  driver_arrival_id: number;
}

export interface AdminCancelIn {
  reason?: string | null;
  note?: string | null;
}

export interface AdminUnlockIn {
  note?: string | null;
}

