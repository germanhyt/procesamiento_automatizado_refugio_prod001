/** Fecha local en YYYY-MM-DD (inputs type="date"). */
export function formatDateInputValue(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Lunes de la semana actual hasta hoy (inclusive). */
export function thisWeekDeliveryMetricsDateRange(): { fecha_desde: string; fecha_hasta: string } {
    const hasta = new Date();
    const desde = new Date(hasta);
    const weekday = desde.getDay();
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    desde.setDate(desde.getDate() - daysFromMonday);
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
