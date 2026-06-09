export const AGENDA_MODO_DAY = 'DAY' as const;
export const AGENDA_MODO_WEEK = 'WEEK' as const;
export const AGENDA_MODO_MONTH = 'MONTH' as const;

export type AgendaModo = typeof AGENDA_MODO_DAY | typeof AGENDA_MODO_WEEK | typeof AGENDA_MODO_MONTH;

export const AGENDA_MODO_OPTIONS: { value: AgendaModo; label: string }[] = [
    { value: AGENDA_MODO_DAY, label: 'Por día' },
    { value: AGENDA_MODO_WEEK, label: 'Por semana' },
    { value: AGENDA_MODO_MONTH, label: 'Por mes' },
];

export const AGENDA_CATEGORIA_LUGAR_PLAY_BAR = 'play bar' as const;
export const AGENDA_CATEGORIA_LUGAR_BOSQUE_MAGICO = 'bosque mágico' as const;

export type AgendaCategoriaLugar =
    | typeof AGENDA_CATEGORIA_LUGAR_PLAY_BAR
    | typeof AGENDA_CATEGORIA_LUGAR_BOSQUE_MAGICO;

export const AGENDA_CATEGORIA_LUGAR_OPTIONS: { value: AgendaCategoriaLugar; label: string }[] = [
    { value: AGENDA_CATEGORIA_LUGAR_PLAY_BAR, label: 'Play Bar' },
    { value: AGENDA_CATEGORIA_LUGAR_BOSQUE_MAGICO, label: 'Bosque Mágico' },
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

export function monthStart(isoDate: string): string {
    const { y, m } = parseIsoParts(isoDate);
    return formatIsoParts(y, m, 1);
}

export function monthEndFromStart(monthStartIso: string): string {
    const { y, m } = parseIsoParts(monthStartIso);
    const firstNextMonth = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(firstNextMonth.getTime() - 24 * 60 * 60 * 1000);
    return formatIsoParts(lastDay.getUTCFullYear(), lastDay.getUTCMonth() + 1, lastDay.getUTCDate());
}

export function formatAgendaRango(inicio: string, fin: string): string {
    if (inicio === fin) return inicio;
    return `${inicio} → ${fin}`;
}

export function agendaModoLabel(modo: AgendaModo): string {
    if (modo === AGENDA_MODO_DAY) return 'Día';
    if (modo === AGENDA_MODO_WEEK) return 'Semana';
    return 'Mes';
}
