export const ORDER_STATUS = {
  LISTO: 'LISTO',
  PENDIENTE_RECOJO: 'PENDIENTE_RECOJO',
  PROCESO_ENTREGA: 'PROCESO_ENTREGA',
  LISTO_PARA_ENTREGAR: 'LISTO_PARA_ENTREGAR',
  ENTREGADO: 'ENTREGADO',
  DEVOLUCION: 'DEVOLUCION',
  CANCELADO: 'CANCELADO',
} as const;

export const DRIVER_STATUS = {
  ESPERANDO: 'ESPERANDO',
  EN_MATCH: 'EN_MATCH',
  DESPACHADO: 'DESPACHADO',
  ABANDONO: 'ABANDONO',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type DriverStatus = (typeof DRIVER_STATUS)[keyof typeof DRIVER_STATUS];

export const ORDER_STATUSES_RUNNER: readonly OrderStatus[] = [
  ORDER_STATUS.LISTO,
  ORDER_STATUS.PENDIENTE_RECOJO,
  ORDER_STATUS.PROCESO_ENTREGA,
  ORDER_STATUS.LISTO_PARA_ENTREGAR,
] as const;

export const ORDER_STATUSES_ADMIN: readonly OrderStatus[] = [
  ORDER_STATUS.LISTO,
  ORDER_STATUS.PENDIENTE_RECOJO,
  ORDER_STATUS.PROCESO_ENTREGA,
  ORDER_STATUS.LISTO_PARA_ENTREGAR,
  ORDER_STATUS.ENTREGADO,
  ORDER_STATUS.DEVOLUCION,
  ORDER_STATUS.CANCELADO,
] as const;

export const DELIVERY_PERMISSIONS = {
  VIEW: 'delivery:view',
  OPERATE: 'delivery:operate',
  ADMIN: 'delivery:admin',
  /** Simular pedido listo (Runner → POST /delivery/runner/simulate/order-ready). */
  SIMULATE_ORDER_READY: 'delivery:simulate_order_ready',
} as const;

