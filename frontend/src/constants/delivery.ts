/**
 * Constantes del módulo Delivery (frontend).
 * Mantener alineadas con backend/app/core/delivery_constants.py.
 */

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
    /** Cambiar flags de producto en `delivery_config` (kiosk RENIEC/foto, simular listo vía operador). */
    SETTINGS_UPDATE: 'delivery:settings:update',
    /** Simular webhook Fidelio "pedido listo" desde la app Runner. */
    SIMULATE_ORDER_READY: 'delivery:simulate_order_ready',
} as const;

export function orderStatusBadgeClass(status: string) {
    const base = 'px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest';
    const map: Record<string, string> = {
        [ORDER_STATUS.LISTO]: 'bg-app-success-muted text-app-success border-app-accent-muted',
        [ORDER_STATUS.PENDIENTE_RECOJO]: 'bg-app-warning-muted text-app-warning border-app-warning',
        [ORDER_STATUS.PROCESO_ENTREGA]: 'bg-blue-500/5 text-blue-400 border-blue-500/10',
        [ORDER_STATUS.LISTO_PARA_ENTREGAR]: 'bg-app-accent-muted-bg text-app-accent border-app-accent-muted',
        [ORDER_STATUS.ENTREGADO]: 'bg-zinc-500/5 text-zinc-300 border-zinc-500/10',
        [ORDER_STATUS.DEVOLUCION]: 'bg-orange-500/5 text-orange-300 border-orange-500/10',
        [ORDER_STATUS.CANCELADO]: 'bg-app-danger-muted text-app-danger border-app-danger',
    };
    return `${base} ${map[status] ?? 'bg-white/5 text-zinc-300 border-white/10'}`;
}

