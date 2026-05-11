/** Estados de lead (alineados al CRM prototipo; subset MVP). */
import type { CSSProperties } from 'react';
export const BOSQUE_MAGICO_LEAD_STATUS = [
    'Nuevo',
    'Por asignar',
    'Asignado',
    'Contactado',
    'Interesado',
    'Cotización enviada',
    'Seguimiento',
    'Convertido',
    'Perdido',
] as const;

export type BosqueMagicoLeadStatus = (typeof BOSQUE_MAGICO_LEAD_STATUS)[number];

export const BOSQUE_MAGICO_CHANNELS = [
    'landing',
    'manual',
    'redes_sociales',
    'whatsapp',
    'referido_parque',
    'otro',
] as const;

/** Permiso de escritura panel (PATCH leads, PATCH config). */
export const PERMISSION_BOSQUE_MAGICO_MANAGE = 'bosque_magico:manage';

export const BOSQUE_LIST_STALE_MS = 30_000;

const CHANNEL_LABELS: Record<string, string> = {
    landing: 'Landing web',
    manual: 'Manual (panel)',
    redes_sociales: 'Redes sociales',
    whatsapp: 'WhatsApp',
    referido_parque: 'Referido parque',
    otro: 'Otro',
};

export function bosqueMagicoChannelLabel(code: string): string {
    return CHANNEL_LABELS[code] ?? code;
}

/** Badge de estado (pill), tono bosque mágico. */
export function bosqueMagicoEstadoBadgeClass(_status: string): string {
    return 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide border whitespace-nowrap';
}

export function bosqueMagicoEstadoBadgeInnerStyle(): CSSProperties {
    return {
        borderColor: 'var(--app-bosque-magico-accent-muted)',
        backgroundColor: 'var(--app-bosque-magico-accent-muted-bg)',
        color: 'var(--app-bosque-magico-accent)',
    };
}
