export const AGENDA_MODO_DAY = 'DAY' as const;
export const AGENDA_MODO_WEEK = 'WEEK' as const;

export type AgendaModo = typeof AGENDA_MODO_DAY | typeof AGENDA_MODO_WEEK;

export const AGENDA_MODO_OPTIONS: { value: AgendaModo; label: string }[] = [
    { value: AGENDA_MODO_DAY, label: 'Por día' },
    { value: AGENDA_MODO_WEEK, label: 'Por semana' },
];

export const PERMISSION_AGENDA_VIEW = 'agenda_deportiva:view';
export const PERMISSION_AGENDA_MANAGE = 'agenda_deportiva:manage';

/** Parsea YYYY-MM-DD sin ambigüedad de zona horaria. */
function parseIsoParts(isoDate: string): { y: number; m: number; d: number } {
    const [y, m, d] = isoDate.split('-').map(Number);
    return { y, m, d };
}

function formatIsoParts(y: number, m: number, d: number): string {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDaysIso(isoDate: string, days: number): string {
    const { y, m, d } = parseIsoParts(isoDate);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return formatIsoParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Lunes de la semana ISO que contiene `date` (YYYY-MM-DD). */
export function weekMonday(isoDate: string): string {
    const { y, m, d } = parseIsoParts(isoDate);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const weekday = dt.getUTCDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    return addDaysIso(isoDate, diff);
}

/** Domingo = lunes + 6 días. */
export function weekSundayFromMonday(mondayIso: string): string {
    return addDaysIso(mondayIso, 6);
}

export function formatAgendaRango(inicio: string, fin: string): string {
    if (inicio === fin) return inicio;
    return `${inicio} → ${fin}`;
}
