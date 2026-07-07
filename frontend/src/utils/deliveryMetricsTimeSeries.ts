import type { DeliveryMetricsTimeSeriesRow } from '@/services/deliveryService';

export type TimeGranularity = 'day' | 'week' | 'month';

function parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function formatDateInputValue(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function mondayOf(date: Date): Date {
    const copy = new Date(date);
    const weekday = copy.getDay();
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    copy.setDate(copy.getDate() - daysFromMonday);
    return copy;
}

function periodLabel(periodKey: string, granularity: TimeGranularity): string {
    if (granularity === 'day') return periodKey;
    if (granularity === 'week') {
        const monday = parseDate(periodKey);
        const friday = new Date(monday);
        friday.setDate(friday.getDate() + 4);
        const fmt = (d: Date) =>
            `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const year = friday.getFullYear();
        return `${fmt(monday)} – ${fmt(friday)}/${year}`;
    }
    const [year, month] = periodKey.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${months[Number(month) - 1]} ${year}`;
}

export function buildPeriodKeys(
    fechaDesde: string,
    fechaHasta: string,
    granularity: TimeGranularity
): string[] {
    const start = parseDate(fechaDesde);
    const end = parseDate(fechaHasta);
    const keys: string[] = [];

    if (granularity === 'day') {
        const cursor = new Date(start);
        while (cursor <= end) {
            keys.push(formatDateInputValue(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        return keys;
    }

    if (granularity === 'week') {
        const cursor = mondayOf(start);
        const endMonday = mondayOf(end);
        while (cursor <= endMonday) {
            keys.push(formatDateInputValue(cursor));
            cursor.setDate(cursor.getDate() + 7);
        }
        return keys;
    }

    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
        keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
}

function emptyRow(period: string, granularity: TimeGranularity): DeliveryMetricsTimeSeriesRow {
    return {
        period,
        label: periodLabel(period, granularity),
        total: 0,
        active: 0,
        delivered: 0,
        canceled: 0,
        returned: 0,
    };
}

export function resolveDeliveryTimeSeries(
    fechaDesde: string,
    fechaHasta: string,
    granularity: TimeGranularity,
    apiSeries: DeliveryMetricsTimeSeriesRow[] | undefined,
    summary: {
        total: number;
        active: number;
        delivered: number;
        canceled: number;
        returned: number;
    }
): { series: DeliveryMetricsTimeSeriesRow[]; needsBackendUpdate: boolean } {
    if (apiSeries && apiSeries.length > 0) {
        return { series: apiSeries, needsBackendUpdate: false };
    }

    if (!fechaDesde || !fechaHasta) {
        return { series: [], needsBackendUpdate: false };
    }

    if (summary.total > 0) {
        return {
            series: [
                {
                    period: `${fechaDesde}_${fechaHasta}`,
                    label: `${fechaDesde} → ${fechaHasta}`,
                    total: summary.total,
                    active: summary.active,
                    delivered: summary.delivered,
                    canceled: summary.canceled,
                    returned: summary.returned,
                },
            ],
            needsBackendUpdate: true,
        };
    }

    return {
        series: buildPeriodKeys(fechaDesde, fechaHasta, granularity).map((period) =>
            emptyRow(period, granularity)
        ),
        needsBackendUpdate: true,
    };
}

export function chartAxisLabel(row: DeliveryMetricsTimeSeriesRow, granularity: TimeGranularity): string {
    if (granularity === 'week') {
        const parts = row.period.split('-');
        if (parts.length >= 3) {
            const monday = parseDate(row.period);
            const friday = new Date(monday);
            friday.setDate(friday.getDate() + 4);
            const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            return `${fmt(monday)}–${fmt(friday)}`;
        }
    }
    if (granularity === 'day') {
        const parts = row.period.split('-');
        if (parts.length >= 3) {
            return `${parts[2]}/${parts[1]}`;
        }
    }
    return row.label;
}
