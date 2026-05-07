import type { SisaEstadoReserva } from '@/constants/sisaReservas';

/** Relleno SVG por estado de reserva (mesa ocupada). */
export function mesaFillForEstado(estado: SisaEstadoReserva | string): string {
    switch (estado) {
        case 'pendiente':
            return 'rgba(251, 188, 0, 0.92)';
        case 'confirmado':
            return 'rgba(40, 130, 72, 0.9)';
        case 'en_proceso_atencion':
            return 'rgba(133, 67, 177, 0.88)';
        case 'atendido':
            return 'rgba(18, 81, 40, 0.88)';
        case 'finalizado':
            return 'rgba(120, 120, 120, 0.65)';
        case 'cancelado':
            return 'rgba(132, 9, 9, 0.75)';
        default:
            return 'rgba(80, 80, 80, 0.5)';
    }
}

export const MESA_EMPTY_FILL = 'rgba(59, 53, 46, 0.25)';
export const MESA_STROKE = 'rgba(231, 212, 198, 0.35)';
