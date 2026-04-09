import type { DriverStatus, OrderStatus } from '@refugio/constants';

export interface Restaurant {
  id: number;
  fidelio_id: string;
  nombre: string;
  is_active: boolean;
  codigo_negocio?: string | null;
  codigo_comunicacion?: string | null;
  created_at: string;
}

export interface DriverArrival {
  id: number;
  plataforma: string;
  codigo_ingresado: string;
  placa?: string | null;
  alias_conductor?: string | null;
  restaurant_id?: number | null;
  conductor_dni?: string | null;
  restaurant_nombre?: string | null;
  estado: DriverStatus;
  matched_order_id?: number | null;
  created_at: string;
  updated_at: string;
  estado_changed_at?: string | null;
  atendido_at?: string | null;
  despachado_at?: string | null;
}

export interface Order {
  id: number;
  restaurant_id: number;
  /** Nombre del local (`delivery_restaurants.nombre`), útil en listas Runner/Kiosk. */
  restaurant_nombre?: string | null;
  plataforma: string;
  codigo_pedido: string;
  estado: OrderStatus;
  numero_bolsas?: number | null;
  locked_by_runner_id?: number | null;
  matched_driver_arrival_id?: number | null;
  matched_driver_arrival?: DriverArrival | null;
  created_at: string;
  updated_at: string;
  estado_changed_at?: string | null;
  listo_at?: string | null;
  match_at?: string | null;
  recogido_at?: string | null;
  entregado_at?: string | null;
  cancelado_at?: string | null;
  devolucion_at?: string | null;
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

