/** React Query: listas comercial — evita refetch al volver a la pestaña si los datos siguen frescos. */
export const COMERCIAL_LIST_STALE_MS = 60_000;

export const COMERCIAL_ESTADOS = ['pendiente', 'atendido'] as const;

export type ComercialEstadoUi = (typeof COMERCIAL_ESTADOS)[number];

export const TIPOS_EVENTO = ['Social', 'Corporativo', 'Fiestas Infantiles'] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Campos mínimos para plantilla WhatsApp (reserva). */
export type ReservaWhatsFields = {
    nombres: string;
    cantidad_personas: number;
    fecha_reserva: string;
    hora_reserva: string;
    estado: string;
};

/** Campos mínimos para plantilla WhatsApp (evento). */
export type EventoWhatsFields = {
    nombres: string;
    tipo_evento: string;
    cantidad_personas: number;
    fecha_tentativa: string;
    estado: string;
};

export function estadoLabel(e: string): string {
    return e === 'atendido' ? 'Atendido' : 'Pendiente';
}

export function buildWhatsDefaultReserva(r: ReservaWhatsFields): string {
    const est = estadoLabel(r.estado);
    return (
        `¡Hola ${r.nombres}! 🌿 Te saludamos de Refugio Gastronómico.\n` +
        `Tu reserva para ${r.cantidad_personas} personas el ${r.fecha_reserva} a las ${r.hora_reserva} ` +
        `está ${est}. ¡Te esperamos!\n` +
        `Más info: https://www.instagram.com/refugiogastronomico.pe`
    );
}

export function buildWhatsDefaultEvento(r: EventoWhatsFields): string {
    const est = estadoLabel(r.estado);
    return (
        `¡Hola ${r.nombres}! 🌿 Te saludamos de Refugio Gastronómico.\n` +
        `Tu evento tipo ${r.tipo_evento} para ${r.cantidad_personas} personas ` +
        `el ${r.fecha_tentativa} está ${est}.\n` +
        `Conoce nuestro portafolio: https://bit.ly/4jD52Qk`
    );
}

export function estadoBadgeClass(estado: string): string {
    if (estado === 'atendido') return 'rounded-lg px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400';
    return 'rounded-lg px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400';
}
