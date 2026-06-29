import type { ControlAlert } from '@/services/deliveryService';
import { DRIVER_STATUS, ORDER_STATUS } from '@/constants/delivery';

/** Etiquetas de estado de pedido para operadores (sin códigos técnicos). */
export const ORDER_STATUS_LABEL: Record<string, string> = {
    [ORDER_STATUS.LISTO]: 'Listo en cocina',
    [ORDER_STATUS.PENDIENTE_RECOJO]: 'Pendiente de recojo',
    [ORDER_STATUS.PROCESO_ENTREGA]: 'En reparto',
    [ORDER_STATUS.LISTO_PARA_ENTREGAR]: 'Listo para entregar',
    [ORDER_STATUS.ENTREGADO]: 'Entregado',
    [ORDER_STATUS.DEVOLUCION]: 'Devolución',
    [ORDER_STATUS.CANCELADO]: 'Cancelado',
};

export const DRIVER_STATUS_LABEL: Record<string, string> = {
    [DRIVER_STATUS.ESPERANDO]: 'En espera',
    [DRIVER_STATUS.EN_MATCH]: 'Vinculado a pedido',
    [DRIVER_STATUS.DESPACHADO]: 'Despachado',
    [DRIVER_STATUS.ABANDONO]: 'Abandonó',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
    UNLOCK: 'Liberó pedido',
    CANCEL: 'Canceló pedido',
    FORCE_ENTREGADO: 'Marcó entregado',
    MARK_DEVOLUCION: 'Marcó devolución',
    MANUAL_MATCH: 'Vinculó conductor',
    UPDATE_ORDER: 'Editó datos del pedido',
};

export const AUDIT_SOURCE_LABEL: Record<string, string> = {
    control_center: 'Centro de control',
    admin_panel: 'Panel administración',
};

export function orderStatusLabel(status: string): string {
    return ORDER_STATUS_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

export function driverStatusLabel(status: string): string {
    return DRIVER_STATUS_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

export function formatElapsedMinutes(minutes: number | null): string {
    if (minutes == null) return '—';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

export function alertFriendlyMessage(a: ControlAlert): string {
    const min = formatElapsedMinutes(a.minutes);
    switch (a.type) {
        case 'ORDER_NO_RUNNER':
            return `Pedido sin repartidor asignado · ${min} en este estado`;
        case 'ORDER_LISTO_NO_MATCH':
            return `Pedido listo sin conductor vinculado · ${min}`;
        case 'MATCH_NO_DELIVERY':
            return `Conductor vinculado pero pedido sin entregar · ${min}`;
        case 'DRIVER_WAITING_LONG':
            return `Conductor en espera en el kiosko · ${min}`;
        default:
            return (a.message ?? '')
                .replace(/\brunner\b/gi, 'repartidor')
                .replace(/\bdriver\b/gi, 'conductor')
                .replace(/\bmatch\b/gi, 'vinculación');
    }
}
