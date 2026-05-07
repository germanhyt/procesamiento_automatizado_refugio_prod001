/** Alineado con backend `app/core/sisa_reservas_constants.py` */

/** Sitio público corporativo — https://sisacoffee.pe/ */
export const SISA_SITE_URL = 'https://sisacoffee.pe/';

/** Calendario de negocio para límites de fecha y texto de ayuda. */
export const SISA_BUSINESS_TIMEZONE = 'America/Lima';

export function calendarDateYYYYMMDDInSisaTZ(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: SISA_BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

export function fechaReservaEsHoyOFuturaSisaTZ(yyyyMmDd: string): boolean {
    const today = calendarDateYYYYMMDDInSisaTZ();
    return yyyyMmDd >= today;
}

export const SISA_MOTIVOS_RESERVA = [
    'Desayuno',
    'Almuerzo',
    'Cena',
    'Corporativo',
    'Experiencia especial',
] as const;

export const SISA_ESTADOS_RESERVA = [
    'pendiente',
    'confirmado',
    'en_proceso_atencion',
    'atendido',
    'finalizado',
    'cancelado',
] as const;

export type SisaMotivoReserva = (typeof SISA_MOTIVOS_RESERVA)[number];
export type SisaEstadoReserva = (typeof SISA_ESTADOS_RESERVA)[number];

const ESTADO_LABELS: Record<SisaEstadoReserva, string> = {
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    en_proceso_atencion: 'En atención',
    atendido: 'Atendido',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
};

export function sisaEstadoLabel(e: string): string {
    return ESTADO_LABELS[e as SisaEstadoReserva] ?? e;
}

export function sisaEstadoBadgeClass(estado: string): string {
    const base = 'inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide';
    switch (estado) {
        case 'pendiente':
            return `${base} bg-app-warning-muted text-app-warning-strong`;
        case 'confirmado':
            return `${base} bg-[var(--app-sisa-reservas-accent-muted-bg)] text-[var(--app-sisa-reservas-accent)]`;
        case 'en_proceso_atencion':
            return `${base} bg-app-secondary-muted-bg text-app-secondary`;
        case 'atendido':
            return `${base} bg-app-success-muted text-app-success`;
        case 'finalizado':
            return `${base} bg-app-input text-app-muted`;
        case 'cancelado':
            return `${base} bg-app-danger-muted text-app-danger`;
        default:
            return `${base} bg-app-input text-app-muted`;
    }
}

export function buildSisaWhatsDefaultMessage(r: {
    nombre_completo: string;
    fecha_reserva: string;
    hora_reserva: string;
    motivo_reserva: string;
    numero_personas: number;
    estado: string;
}): string {
    const fecha = r.fecha_reserva;
    const hora = r.hora_reserva?.slice(0, 5) ?? r.hora_reserva;
    return (
        `Hola ${r.nombre_completo}, le escribimos de Sisa Café respecto a su reserva ` +
        `(${r.motivo_reserva}) el ${fecha} a las ${hora} para ${r.numero_personas} persona(s). ` +
        `Estado: ${sisaEstadoLabel(r.estado)}. ¿Podemos confirmar su asistencia?`
    );
}

export const SISA_DEFAULT_CODIGO_TELEFONICO = '+51';

export const PERMISSION_SISA_RESERVAS_VIEW = 'sisa_reservas:view';
export const PERMISSION_SISA_RESERVAS_MANAGE = 'sisa_reservas:manage';
