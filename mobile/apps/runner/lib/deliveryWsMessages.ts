/**
 * Parsers del broadcast WebSocket de delivery (backend).
 * Centraliza el contrato para poder añadir tipos de evento sin tocar la pantalla.
 */

import {
  WS_DRIVER_KIND_NUEVO_ESPERANDO,
  WS_ORDER_SOURCE_FIDELIO_WEBHOOK,
  WS_ORDER_STATUS_LISTO,
} from '@/constants/runnerDeliveryRealtime';

export type DeliveryWsEnvelope = {
  type?: string;
  payload?: Record<string, unknown>;
};

export type FidelioListoWsPayload = {
  orderId: number;
  restaurantNombre?: string | null;
};

/** Compat: solo devuelve order_id; preferir parseFidelioListoFromWs si hace falta el local. */
export function parseFidelioListoOrderId(msg: DeliveryWsEnvelope): number | null {
  const r = parseFidelioListoFromWs(msg);
  return r?.orderId ?? null;
}

/** ORDER_UPDATED desde webhook Fidelio cuando el pedido pasa a LISTO (tiempo real Runner). */
export function parseFidelioListoFromWs(msg: DeliveryWsEnvelope): FidelioListoWsPayload | null {
  if (msg.type !== 'ORDER_UPDATED') return null;
  const p = msg.payload;
  if (!p) return null;
  const src = String(p.source ?? '');
  const est = String(p.estado ?? '');
  if (est !== WS_ORDER_STATUS_LISTO || src !== WS_ORDER_SOURCE_FIDELIO_WEBHOOK) return null;
  const rawId = p.order_id;
  const oid = typeof rawId === 'number' ? rawId : rawId != null ? Number(rawId) : NaN;
  if (!Number.isFinite(oid) || oid <= 0) return null;
  const rn = p.restaurant_nombre;
  const restaurantNombre =
    rn != null && String(rn).trim() !== '' ? String(rn).trim() : undefined;
  return { orderId: oid, restaurantNombre };
}

export type NuevoDriverEsperandoPayload = {
  driverArrivalId: number;
  plat: string;
  code: string;
  restaurantNombre?: string | null;
};

export function parseNuevoDriverEsperando(msg: DeliveryWsEnvelope): NuevoDriverEsperandoPayload | null {
  if (msg.type !== 'DRIVER_UPDATED') return null;
  const p = msg.payload;
  if (!p || p.kind !== WS_DRIVER_KIND_NUEVO_ESPERANDO) return null;
  const rawAid = p.driver_arrival_id;
  const driverArrivalId =
    typeof rawAid === 'number' ? rawAid : rawAid != null ? Number(rawAid) : NaN;
  if (!Number.isFinite(driverArrivalId)) return null;
  const rn = p.restaurant_nombre;
  const restaurantNombre =
    rn != null && String(rn).trim() !== '' ? String(rn).trim() : undefined;
  return {
    driverArrivalId,
    plat: String(p.plataforma ?? ''),
    code: String(p.codigo_ingresado ?? ''),
    restaurantNombre,
  };
}
