/**
 * Estados de pedido delivery (API / UI runner).
 * Alineados con `backend/app/core/delivery_constants.py` — ampliar aquí si el backend añade estados.
 */

import {
  RUNNER_BRAND_ACCENT_HEX,
  SEMANTIC_AMBER_500,
  SEMANTIC_BLUE_500,
  SEMANTIC_EMERALD_500,
  SEMANTIC_ZINC_500,
} from '@/constants/runnerSemantic';

export const ORDER_STATUS_LISTO = 'LISTO' as const;
export const ORDER_STATUS_PENDIENTE_RECOJO = 'PENDIENTE_RECOJO' as const;
export const ORDER_STATUS_PROCESO_ENTREGA = 'PROCESO_ENTREGA' as const;
export const ORDER_STATUS_LISTO_PARA_ENTREGAR = 'LISTO_PARA_ENTREGAR' as const;

/** Pedidos donde el runner puede marcar entrega al driver (con match). */
export const ORDER_STATUSES_RUNNER_CAN_DELIVER = [
  ORDER_STATUS_PROCESO_ENTREGA,
  ORDER_STATUS_PENDIENTE_RECOJO,
  ORDER_STATUS_LISTO_PARA_ENTREGAR,
] as const;

/** Pedidos desde los que tiene sentido “tomar” en la app. */
export const ORDER_STATUSES_RUNNER_ACCEPT = [ORDER_STATUS_LISTO, ORDER_STATUS_LISTO_PARA_ENTREGAR] as const;

/** Color de chapa de estado en listas (dashboard). */
/** Comprueba si `estado` está en una lista proveniente de constantes `as const`. */
export function orderStatusIn(estado: string, statuses: readonly string[]): boolean {
  return statuses.includes(estado);
}

export function getOrderStatusBadgeBackground(estado: string): string {
  switch (estado) {
    case ORDER_STATUS_LISTO:
      return SEMANTIC_EMERALD_500;
    case ORDER_STATUS_PENDIENTE_RECOJO:
      return SEMANTIC_AMBER_500;
    case ORDER_STATUS_PROCESO_ENTREGA:
      return SEMANTIC_BLUE_500;
    case ORDER_STATUS_LISTO_PARA_ENTREGAR:
      return RUNNER_BRAND_ACCENT_HEX;
    default:
      return SEMANTIC_ZINC_500;
  }
}
