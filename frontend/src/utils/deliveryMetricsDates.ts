/** Fecha local en YYYY-MM-DD (inputs type="date"). */
export function formatDateInputValue(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Lunes a viernes de la semana actual (hasta hoy o viernes, lo que ocurra antes). */
export function thisWeekDeliveryMetricsDateRange(): { fecha_desde: string; fecha_hasta: string } {
    const today = new Date();
    const desde = new Date(today);
    const weekday = desde.getDay();
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    desde.setDate(desde.getDate() - daysFromMonday);
    const friday = new Date(desde);
    friday.setDate(friday.getDate() + 4);
    const hasta = today < friday ? today : friday;
    return {
        fecha_desde: formatDateInputValue(desde),
        fecha_hasta: formatDateInputValue(hasta),
    };
}

/** Primer día del mes actual hasta hoy (inclusive). */
export function thisMonthDeliveryMetricsDateRange(): { fecha_desde: string; fecha_hasta: string } {
    const hasta = new Date();
    const desde = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
    return {
        fecha_desde: formatDateInputValue(desde),
        fecha_hasta: formatDateInputValue(hasta),
    };
}

/** Últimos 30 días hasta hoy (inclusive). */
export function lastMonthDeliveryMetricsDateRange(): { fecha_desde: string; fecha_hasta: string } {
    const hasta = new Date();
    const desde = new Date(hasta);
    desde.setMonth(desde.getMonth() - 1);
    return {
        fecha_desde: formatDateInputValue(desde),
        fecha_hasta: formatDateInputValue(hasta),
    };
}

/** Default del dashboard: mes en curso. */
export function defaultDeliveryMetricsDateRange(): { fecha_desde: string; fecha_hasta: string } {
    return thisMonthDeliveryMetricsDateRange();
}

/** Alineado con backend (ADMIN_ORDERS_MAX_DATE_RANGE_DAYS). */
export const MAX_METRICS_DATE_RANGE_DAYS = 366;

export function compareDateStrings(a: string, b: string): number {
    return a.localeCompare(b);
}

export function daysBetweenInclusive(desde: string, hasta: string): number {
    const [y0, m0, d0] = desde.split('-').map(Number);
    const [y1, m1, d1] = hasta.split('-').map(Number);
    const start = new Date(y0, m0 - 1, d0);
    const end = new Date(y1, m1 - 1, d1);
    return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function validateMetricsDateRange(desde: string, hasta: string): string | null {
    if (!desde || !hasta) return 'Indica fecha desde y hasta.';
    if (compareDateStrings(desde, hasta) > 0) return 'La fecha desde no puede ser posterior a hasta.';
    if (daysBetweenInclusive(desde, hasta) > MAX_METRICS_DATE_RANGE_DAYS) {
        return `El rango no puede superar ${MAX_METRICS_DATE_RANGE_DAYS} días.`;
    }
    return null;
}

/** Ajusta hasta si desde queda después, o desde si hasta queda antes. */
export function coerceMetricsDateRange(
    desde: string,
    hasta: string,
    changed: 'desde' | 'hasta'
): { fecha_desde: string; fecha_hasta: string } {
    if (!desde || !hasta) return { fecha_desde: desde, fecha_hasta: hasta };
    if (compareDateStrings(desde, hasta) <= 0) {
        return { fecha_desde: desde, fecha_hasta: hasta };
    }
    if (changed === 'desde') {
        return { fecha_desde: desde, fecha_hasta: desde };
    }
    return { fecha_desde: hasta, fecha_hasta: hasta };
}
