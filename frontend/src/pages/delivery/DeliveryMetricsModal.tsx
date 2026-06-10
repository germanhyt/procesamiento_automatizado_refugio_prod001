import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Lightbulb, RefreshCcw, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import AppSelect from '@/components/ui/AppSelect';
import { DRIVER_STATUS, ORDER_STATUS, ORDER_STATUSES_ADMIN, orderStatusBadgeClass } from '@/constants/delivery';
import type { DriverArrival, Order } from '@/services/deliveryService';

const ALL_VALUE = 'ALL';

type Dimension = 'estado' | 'locatario' | 'plataforma' | 'driver' | 'runner';

type MetricRow = {
    group: string;
    total: number;
    active: number;
    delivered: number;
    canceled: number;
    returned: number;
    matched: number;
    bags: number;
    avgCreateToReady: number | null;
    avgReadyToMatch: number | null;
    avgMatchToPickup: number | null;
    avgPickupToDelivered: number | null;
    avgReadyToDelivered: number | null;
};

type InsightLevel = 'alta' | 'media' | 'oportunidad';

type MetricInsight = {
    id: string;
    level: InsightLevel;
    conclusion: string;
    recommendation: string;
    group?: string;
};

type DeliveryMetricsModalProps = {
    open: boolean;
    onClose: () => void;
    orders: Order[];
    drivers: DriverArrival[];
    isLoading: boolean;
    isError: boolean;
    onRefresh: () => void;
};

const DIMENSION_OPTIONS: Array<{ value: Dimension; label: string }> = [
    { value: 'estado', label: 'Estado' },
    { value: 'locatario', label: 'Locatario' },
    { value: 'plataforma', label: 'Plataforma' },
    { value: 'driver', label: 'Driver' },
    { value: 'runner', label: 'Runner' },
];

const TERMINAL_STATUSES = new Set<string>([
    ORDER_STATUS.ENTREGADO,
    ORDER_STATUS.CANCELADO,
    ORDER_STATUS.DEVOLUCION,
]);

function cleanLabel(value: string | null | undefined, fallback: string) {
    const text = value?.trim();
    return text ? text : fallback;
}

function minutesBetween(from: string | null | undefined, to: string | null | undefined) {
    if (!from || !to) return null;
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    return Math.max(0, Math.floor((end - start) / 60000));
}

function avg(values: Array<number | null>) {
    const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (!valid.length) return null;
    return valid.reduce((acc, value) => acc + value, 0) / valid.length;
}

function formatMinutes(value: number | null) {
    if (value == null) return '—';
    return `${Math.round(value)} min`;
}

function formatPercent(value: number, total: number) {
    if (!total) return '0%';
    return `${Math.round((value / total) * 100)}%`;
}

function percentage(part: number, total: number) {
    if (!total) return 0;
    return (part / total) * 100;
}

function driverLabelFromArrival(driver: DriverArrival | null | undefined) {
    if (!driver) return 'Sin driver';
    const primary = cleanLabel(driver.placa, '');
    const alias = cleanLabel(driver.alias_conductor, '');
    const code = cleanLabel(driver.codigo_ingresado, '');
    const doc = cleanLabel(driver.conductor_dni ?? driver.conductor_carne_extranjeria, '');
    const parts = [primary, alias, code, doc].filter(Boolean);
    return parts.length ? parts.join(' · ') : `Driver #${driver.id}`;
}

function runnerLabel(order: Order) {
    if (order.locked_by_runner_username?.trim()) return order.locked_by_runner_username.trim();
    if (order.locked_by_runner_id != null) return `Runner #${order.locked_by_runner_id}`;
    return 'Sin runner';
}

function groupLabel(order: Order, dimension: Dimension) {
    if (dimension === 'estado') return cleanLabel(order.estado, 'Sin estado');
    if (dimension === 'locatario') return cleanLabel(order.restaurant_nombre, 'Sin locatario');
    if (dimension === 'plataforma') return cleanLabel(order.plataforma, 'Sin plataforma');
    if (dimension === 'driver') return driverLabelFromArrival(order.matched_driver_arrival);
    return runnerLabel(order);
}

function buildOptionList(values: string[], allLabel = 'Todos') {
    const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return [{ value: ALL_VALUE, label: allLabel }, ...unique.map((value) => ({ value, label: value }))];
}

function summarizeOrders(orders: Order[]) {
    return {
        total: orders.length,
        active: orders.filter((order) => !TERMINAL_STATUSES.has(order.estado)).length,
        delivered: orders.filter((order) => order.estado === ORDER_STATUS.ENTREGADO).length,
        canceled: orders.filter((order) => order.estado === ORDER_STATUS.CANCELADO).length,
        returned: orders.filter((order) => order.estado === ORDER_STATUS.DEVOLUCION).length,
        matched: orders.filter((order) => Boolean(order.matched_driver_arrival_id || order.matched_driver_arrival)).length,
        bags: orders.reduce((acc, order) => acc + (order.numero_bolsas ?? 0), 0),
        avgCreateToReady: avg(orders.map((order) => minutesBetween(order.created_at, order.listo_at))),
        avgReadyToMatch: avg(orders.map((order) => minutesBetween(order.listo_at, order.match_at))),
        avgMatchToPickup: avg(orders.map((order) => minutesBetween(order.match_at, order.recogido_at))),
        avgPickupToDelivered: avg(orders.map((order) => minutesBetween(order.recogido_at, order.entregado_at))),
        avgReadyToDelivered: avg(orders.map((order) => minutesBetween(order.listo_at, order.entregado_at))),
    };
}

function buildMetricRows(orders: Order[], dimension: Dimension) {
    const groups = new Map<string, Order[]>();
    for (const order of orders) {
        const key = groupLabel(order, dimension);
        groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return Array.from(groups.entries())
        .map(([group, groupOrders]): MetricRow => ({ group, ...summarizeOrders(groupOrders) }))
        .sort((a, b) => b.total - a.total || a.group.localeCompare(b.group));
}

function insightLevelLabel(level: InsightLevel) {
    if (level === 'alta') return 'ALTA';
    if (level === 'media') return 'MEDIA';
    return 'OPORTUNIDAD';
}

function buildInsights(summary: MetricRow, rows: MetricRow[], dimensionLabel: string): MetricInsight[] {
    if (summary.total === 0) {
        return [
            {
                id: 'sin-datos',
                level: 'media',
                conclusion: 'No hay pedidos que coincidan con los filtros actuales.',
                recommendation: 'Amplía filtros o usa un rango operativo estándar para evaluar el flujo.',
            },
        ];
    }

    const insights: MetricInsight[] = [];
    const deliveredRate = percentage(summary.delivered, summary.total);
    const cancelRate = percentage(summary.canceled, summary.total);
    const returnRate = percentage(summary.returned, summary.total);
    const matchRate = percentage(summary.matched, summary.total);

    if (deliveredRate < 70) {
        insights.push({
            id: 'entregas-bajas',
            level: 'alta',
            conclusion: `La tasa de entrega está en ${Math.round(deliveredRate)}%, por debajo del objetivo operativo.`,
            recommendation: 'Revisar cuellos entre preparación y asignación de driver; priorizar órdenes con mayor antigüedad.',
        });
    } else if (deliveredRate >= 90) {
        insights.push({
            id: 'entregas-altas',
            level: 'oportunidad',
            conclusion: `La tasa de entrega es sólida (${Math.round(deliveredRate)}%).`,
            recommendation: 'Documentar el flujo actual y replicarlo en turnos/locales con menor desempeño.',
        });
    }

    if (cancelRate >= 12) {
        insights.push({
            id: 'cancelaciones-criticas',
            level: 'alta',
            conclusion: `Las cancelaciones alcanzan ${Math.round(cancelRate)}% del volumen.`,
            recommendation: 'Auditar motivos de cancelación y aplicar checklist de validación antes de despachar.',
        });
    } else if (cancelRate >= 7) {
        insights.push({
            id: 'cancelaciones-media',
            level: 'media',
            conclusion: `El ratio de cancelaciones (${Math.round(cancelRate)}%) muestra oportunidad de mejora.`,
            recommendation: 'Monitorear causas por plataforma/locatario y reforzar confirmaciones tempranas.',
        });
    }

    if (returnRate >= 6) {
        insights.push({
            id: 'devoluciones',
            level: 'media',
            conclusion: `La devolución representa ${Math.round(returnRate)}% del total.`,
            recommendation: 'Fortalecer control de entrega y trazabilidad de incidencias por runner/driver.',
        });
    }

    if (matchRate < 75) {
        insights.push({
            id: 'match-bajo',
            level: 'alta',
            conclusion: `Solo ${Math.round(matchRate)}% de pedidos logró match con driver.`,
            recommendation: 'Aumentar disponibilidad de drivers en horas pico y acelerar la toma desde kiosk.',
        });
    } else if (matchRate < 90) {
        insights.push({
            id: 'match-medio',
            level: 'media',
            conclusion: `El match con driver está en ${Math.round(matchRate)}%.`,
            recommendation: 'Optimizar reglas de asignación y alertas para órdenes listas sin match.',
        });
    }

    if (summary.avgReadyToMatch != null && summary.avgReadyToMatch > 12) {
        insights.push({
            id: 'sla-ready-match',
            level: 'alta',
            conclusion: `El SLA listo->match promedia ${Math.round(summary.avgReadyToMatch)} min, alto para operación ágil.`,
            recommendation: 'Asignar seguimiento en tiempo real a pedidos LISTO para reducir espera de asignación.',
        });
    }

    if (summary.avgReadyToDelivered != null && summary.avgReadyToDelivered > 30) {
        insights.push({
            id: 'sla-ready-delivered',
            level: 'media',
            conclusion: `El ciclo listo->entrega promedia ${Math.round(summary.avgReadyToDelivered)} min.`,
            recommendation: 'Separar backlog por antigüedad y ejecutar despachos por prioridad temporal.',
        });
    }

    if (summary.active > summary.delivered && summary.total >= 15) {
        insights.push({
            id: 'backlog-activo',
            level: 'media',
            conclusion: `Hay más pedidos activos (${summary.active}) que entregados (${summary.delivered}) en el corte.`,
            recommendation: 'Aplicar barridos operativos cada 10-15 minutos para reducir cola activa.',
        });
    }

    const comparableRows = rows.filter((row) => row.total >= 5);
    if (comparableRows.length > 0) {
        const worstCancel = comparableRows.reduce((best, current) => {
            const bestRate = percentage(best.canceled, best.total);
            const currentRate = percentage(current.canceled, current.total);
            return currentRate > bestRate ? current : best;
        }, comparableRows[0]);
        const worstCancelRate = percentage(worstCancel.canceled, worstCancel.total);
        if (worstCancelRate >= 15) {
            insights.push({
                id: 'grupo-cancelaciones',
                level: 'alta',
                group: worstCancel.group,
                conclusion: `${dimensionLabel} con mayor cancelación: ${worstCancel.group} (${Math.round(worstCancelRate)}%).`,
                recommendation: 'Revisar causas específicas de ese grupo y aplicar plan correctivo focalizado.',
            });
        }

        const slowestDelivery = comparableRows
            .filter((row) => row.avgReadyToDelivered != null)
            .sort((a, b) => (b.avgReadyToDelivered ?? 0) - (a.avgReadyToDelivered ?? 0))[0];
        if (slowestDelivery && (slowestDelivery.avgReadyToDelivered ?? 0) > 35) {
            insights.push({
                id: 'grupo-lento',
                level: 'media',
                group: slowestDelivery.group,
                conclusion: `${dimensionLabel} más lento en listo->entrega: ${slowestDelivery.group} (${Math.round(
                    slowestDelivery.avgReadyToDelivered ?? 0
                )} min).`,
                recommendation: 'Priorizar seguimiento de preparación y retiro en ese grupo durante horas críticas.',
            });
        }

        const bestDelivery = comparableRows.reduce((best, current) => {
            const bestRate = percentage(best.delivered, best.total);
            const currentRate = percentage(current.delivered, current.total);
            return currentRate > bestRate ? current : best;
        }, comparableRows[0]);
        const bestRate = percentage(bestDelivery.delivered, bestDelivery.total);
        if (bestRate >= 90) {
            insights.push({
                id: 'grupo-benchmark',
                level: 'oportunidad',
                group: bestDelivery.group,
                conclusion: `${dimensionLabel} benchmark: ${bestDelivery.group} con ${Math.round(bestRate)}% de entregas.`,
                recommendation: 'Tomar ese flujo como referencia de mejores prácticas para estandarizar operación.',
            });
        }
    }

    const rank: Record<InsightLevel, number> = { alta: 0, media: 1, oportunidad: 2 };
    return insights
        .sort((a, b) => rank[a.level] - rank[b.level])
        .slice(0, 7);
}

function reportFilename(extension: 'pdf' | 'xlsx') {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    return `delivery-metricas-${stamp}.${extension}`;
}

function downloadPdfReport(
    summary: MetricRow,
    rows: MetricRow[],
    dimensionLabel: string,
    filtersLabel: string,
    insights: MetricInsight[]
) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedAt = new Date().toLocaleString();

    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, pageWidth, 74, 'F');
    doc.setTextColor(243, 244, 246);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Delivery - Dashboard de métricas y resultados', 36, 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generado: ${generatedAt}`, 36, 52);
    doc.text(`Agrupado por: ${dimensionLabel}`, 220, 52);

    autoTable(doc, {
        startY: 86,
        margin: { left: 36, right: 36 },
        head: [['Indicador', 'Valor']],
        body: [
            ['Filtros', filtersLabel],
            ['Pedidos', String(summary.total)],
            ['Activos', String(summary.active)],
            ['Entregados', String(summary.delivered)],
            ['Cancelados', String(summary.canceled)],
            ['Devoluciones', String(summary.returned)],
            ['Match driver', String(summary.matched)],
            ['Bolsas', String(summary.bags)],
            ['Promedio listo -> entrega', formatMinutes(summary.avgReadyToDelivered)],
        ],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 5, textColor: [31, 41, 55], lineColor: [226, 232, 240] },
        headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
    });

    const detailRows = rows.map((row) => [
        row.group,
        String(row.total),
        String(row.active),
        String(row.delivered),
        String(row.canceled),
        String(row.returned),
        String(row.matched),
        String(row.bags),
        formatMinutes(row.avgReadyToDelivered),
    ]);

    autoTable(doc, {
        startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
            ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 18
            : 290,
        margin: { left: 36, right: 36 },
        head: [['Grupo', 'Total', 'Activos', 'Entregados', 'Cancel.', 'Dev.', 'Match', 'Bolsas', 'Listo->entrega']],
        body: detailRows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4, textColor: [17, 24, 39], lineColor: [226, 232, 240] },
        headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 230 },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'right' },
        },
    });

    const lastDetailY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 280;
    const insightStartY = lastDetailY > 430 ? 70 : lastDetailY + 18;
    if (lastDetailY > 430) doc.addPage();

    autoTable(doc, {
        startY: insightStartY,
        margin: { left: 36, right: 36 },
        head: [['Prioridad', 'Conclusión clave', 'Recomendación']],
        body: insights.map((item) => [
            insightLevelLabel(item.level),
            item.group ? `${item.conclusion} (${dimensionLabel}: ${item.group})` : item.conclusion,
            item.recommendation,
        ]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 80, fontStyle: 'bold' },
            1: { cellWidth: 260 },
            2: { cellWidth: 'auto' },
        },
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(`Página ${page} de ${pageCount}`, pageWidth - 90, doc.internal.pageSize.getHeight() - 14);
    }

    doc.save(reportFilename('pdf'));
}

function downloadExcelReport(
    summary: MetricRow,
    rows: MetricRow[],
    dimensionLabel: string,
    filtersLabel: string,
    insights: MetricInsight[]
) {
    const generatedAt = new Date().toLocaleString();
    const workbook = XLSX.utils.book_new();

    const summaryRows = [
        ['Dashboard Delivery - Métricas y resultados'],
        ['Generado', generatedAt],
        ['Agrupado por', dimensionLabel],
        ['Filtros', filtersLabel],
        [],
        ['Indicador', 'Valor'],
        ['Pedidos', summary.total],
        ['Activos', summary.active],
        ['Entregados', summary.delivered],
        ['Cancelados', summary.canceled],
        ['Devoluciones', summary.returned],
        ['Match driver', summary.matched],
        ['Bolsas', summary.bags],
        ['Promedio crea -> listo', summary.avgCreateToReady == null ? '-' : Number(summary.avgCreateToReady.toFixed(1))],
        ['Promedio listo -> match', summary.avgReadyToMatch == null ? '-' : Number(summary.avgReadyToMatch.toFixed(1))],
        ['Promedio match -> recogido', summary.avgMatchToPickup == null ? '-' : Number(summary.avgMatchToPickup.toFixed(1))],
        ['Promedio recogido -> entrega', summary.avgPickupToDelivered == null ? '-' : Number(summary.avgPickupToDelivered.toFixed(1))],
        ['Promedio listo -> entrega', summary.avgReadyToDelivered == null ? '-' : Number(summary.avgReadyToDelivered.toFixed(1))],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 38 }, { wch: 100 }];
    summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

    const detailRows = [
        ['Grupo', 'Total', 'Activos', 'Entregados', 'Cancelados', 'Devoluciones', 'Match', 'Bolsas', 'Listo->entrega (min)'],
        ...rows.map((row) => [
            row.group,
            row.total,
            row.active,
            row.delivered,
            row.canceled,
            row.returned,
            row.matched,
            row.bags,
            row.avgReadyToDelivered == null ? '-' : Number(row.avgReadyToDelivered.toFixed(1)),
        ]),
    ];
    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    detailSheet['!cols'] = [
        { wch: 52 },
        { wch: 10 },
        { wch: 10 },
        { wch: 11 },
        { wch: 12 },
        { wch: 13 },
        { wch: 10 },
        { wch: 9 },
        { wch: 20 },
    ];
    detailSheet['!autofilter'] = { ref: `A1:I${Math.max(detailRows.length, 2)}` };

    const insightRows = [
        ['Prioridad', 'Conclusión', 'Recomendación', 'Referencia grupo'],
        ...insights.map((item) => [
            insightLevelLabel(item.level),
            item.conclusion,
            item.recommendation,
            item.group ?? '-',
        ]),
    ];
    const insightSheet = XLSX.utils.aoa_to_sheet(insightRows);
    insightSheet['!cols'] = [{ wch: 14 }, { wch: 70 }, { wch: 88 }, { wch: 40 }];
    insightSheet['!autofilter'] = { ref: `A1:D${Math.max(insightRows.length, 2)}` };

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle');
    XLSX.utils.book_append_sheet(workbook, insightSheet, 'Conclusiones');
    XLSX.writeFile(workbook, reportFilename('xlsx'), { compression: true });
}

const DeliveryMetricsModal: React.FC<DeliveryMetricsModalProps> = ({
    open,
    onClose,
    orders,
    drivers,
    isLoading,
    isError,
    onRefresh,
}) => {
    const [dimension, setDimension] = useState<Dimension>('estado');
    const [estado, setEstado] = useState(ALL_VALUE);
    const [locatario, setLocatario] = useState(ALL_VALUE);
    const [plataforma, setPlataforma] = useState(ALL_VALUE);
    const [driver, setDriver] = useState(ALL_VALUE);
    const [runner, setRunner] = useState(ALL_VALUE);
    const [insightsModalOpen, setInsightsModalOpen] = useState(false);

    const options = useMemo(() => {
        const driverValues = orders.map((order) => driverLabelFromArrival(order.matched_driver_arrival));
        const runnerValues = orders.map(runnerLabel);
        return {
            estado: [
                { value: ALL_VALUE, label: 'Todos' },
                ...Array.from(new Set([...ORDER_STATUSES_ADMIN, ...orders.map((order) => order.estado)]))
                    .sort((a, b) => a.localeCompare(b))
                    .map((value) => ({ value, label: value })),
            ],
            locatario: buildOptionList(orders.map((order) => cleanLabel(order.restaurant_nombre, 'Sin locatario'))),
            plataforma: buildOptionList(orders.map((order) => cleanLabel(order.plataforma, 'Sin plataforma'))),
            driver: buildOptionList(driverValues),
            runner: buildOptionList(runnerValues),
        };
    }, [orders]);

    const filteredOrders = useMemo(() => {
        return orders.filter((order) => {
            if (estado !== ALL_VALUE && order.estado !== estado) return false;
            if (locatario !== ALL_VALUE && cleanLabel(order.restaurant_nombre, 'Sin locatario') !== locatario) return false;
            if (plataforma !== ALL_VALUE && cleanLabel(order.plataforma, 'Sin plataforma') !== plataforma) return false;
            if (driver !== ALL_VALUE && driverLabelFromArrival(order.matched_driver_arrival) !== driver) return false;
            if (runner !== ALL_VALUE && runnerLabel(order) !== runner) return false;
            return true;
        });
    }, [orders, estado, locatario, plataforma, driver, runner]);

    const rows = useMemo(() => buildMetricRows(filteredOrders, dimension), [filteredOrders, dimension]);
    const summary = useMemo<MetricRow>(
        () => ({ group: 'Total filtrado', ...summarizeOrders(filteredOrders) }),
        [filteredOrders]
    );

    const maxRowTotal = rows[0]?.total ?? 0;
    const dimensionLabel = DIMENSION_OPTIONS.find((option) => option.value === dimension)?.label ?? 'Estado';
    const filtersLabel = [
        `Estado=${estado === ALL_VALUE ? 'Todos' : estado}`,
        `Locatario=${locatario === ALL_VALUE ? 'Todos' : locatario}`,
        `Plataforma=${plataforma === ALL_VALUE ? 'Todos' : plataforma}`,
        `Driver=${driver === ALL_VALUE ? 'Todos' : driver}`,
        `Runner=${runner === ALL_VALUE ? 'Todos' : runner}`,
    ].join(' · ');

    const driverStatusCounts = useMemo(() => {
        return {
            esperando: drivers.filter((item) => item.estado === DRIVER_STATUS.ESPERANDO).length,
            enMatch: drivers.filter((item) => item.estado === DRIVER_STATUS.EN_MATCH).length,
            total: drivers.length,
        };
    }, [drivers]);

    const insights = useMemo(() => buildInsights(summary, rows, dimensionLabel), [summary, rows, dimensionLabel]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" role="presentation" onClick={onClose}>
            <div
                className="w-full max-w-7xl max-h-[92vh] overflow-hidden rounded-3xl border border-app-border bg-app-panel shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delivery-metrics-title"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex flex-col gap-4 border-b border-app-border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 id="delivery-metrics-title" className="text-sm font-black uppercase tracking-widest text-app-text">
                            Dashboard Delivery
                        </h2>
                        <p className="mt-1 text-[10px] font-mono text-app-muted">
                            Métricas y resultados por estado, locatario, plataforma, driver y runner.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-input px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-text hover:bg-app-surface"
                        >
                            <RefreshCcw size={14} /> Refrescar
                        </button>
                        <button
                            type="button"
                            onClick={() => downloadPdfReport(summary, rows, dimensionLabel, filtersLabel, insights)}
                            disabled={isLoading || rows.length === 0}
                            className="inline-flex items-center gap-2 rounded-xl bg-app-delivery px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white hover:bg-app-delivery-strong disabled:opacity-40"
                        >
                            <FileText size={14} /> PDF
                        </button>
                        <button
                            type="button"
                            onClick={() => downloadExcelReport(summary, rows, dimensionLabel, filtersLabel, insights)}
                            disabled={isLoading || rows.length === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-app-delivery-muted bg-app-delivery-muted-bg px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-delivery hover:bg-app-card-hover disabled:opacity-40"
                        >
                            <FileSpreadsheet size={14} /> Excel
                        </button>
                        <button
                            type="button"
                            onClick={() => setInsightsModalOpen(true)}
                            disabled={isLoading}
                            className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
                        >
                            <Lightbulb size={14} /> Conclusiones
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-app-border bg-app-input p-2 text-app-muted hover:text-app-text"
                            aria-label="Cerrar dashboard Delivery"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="max-h-[calc(92vh-96px)] overflow-y-auto p-4 sm:p-5">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
                        <MetricCard label="Pedidos" value={summary.total} helper={`${summary.active} activos`} />
                        <MetricCard label="Entregados" value={summary.delivered} helper={formatPercent(summary.delivered, summary.total)} />
                        <MetricCard label="Cancelados" value={summary.canceled} helper={formatPercent(summary.canceled, summary.total)} />
                        <MetricCard label="Devoluciones" value={summary.returned} helper={formatPercent(summary.returned, summary.total)} />
                        <MetricCard label="Match driver" value={summary.matched} helper={formatPercent(summary.matched, summary.total)} />
                        <MetricCard label="Drivers live" value={driverStatusCounts.total} helper={`${driverStatusCounts.esperando} esp. · ${driverStatusCounts.enMatch} match`} />
                    </div>

                    <div className="mt-4 rounded-3xl border border-app-border bg-app-card p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                            <FilterSelect
                                label="Agrupar"
                                options={DIMENSION_OPTIONS}
                                value={dimension}
                                onChange={(value) => setDimension(value as Dimension)}
                            />
                            <FilterSelect label="Estado" options={options.estado} value={estado} onChange={setEstado} />
                            <FilterSelect label="Locatario" options={options.locatario} value={locatario} onChange={setLocatario} />
                            <FilterSelect label="Plataforma" options={options.plataforma} value={plataforma} onChange={setPlataforma} />
                            <FilterSelect label="Driver" options={options.driver} value={driver} onChange={setDriver} />
                            <FilterSelect label="Runner" options={options.runner} value={runner} onChange={setRunner} />
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_2fr]">
                        <div className="space-y-4">
                            <div className="rounded-3xl border border-app-border bg-app-card p-4">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">SLA promedio</h3>
                                <div className="mt-4 space-y-3">
                                    <SlaLine label="Crea → listo" value={summary.avgCreateToReady} />
                                    <SlaLine label="Listo → match" value={summary.avgReadyToMatch} />
                                    <SlaLine label="Match → recogido" value={summary.avgMatchToPickup} />
                                    <SlaLine label="Recogido → entrega" value={summary.avgPickupToDelivered} />
                                    <SlaLine label="Listo → entrega" value={summary.avgReadyToDelivered} />
                                </div>
                            </div>
                            <div className="rounded-3xl border border-app-border bg-app-card p-4">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Drivers en espera</h3>
                                <div className="mt-4 space-y-2">
                                    {drivers.slice(0, 8).map((item) => (
                                        <div key={item.id} className="rounded-2xl border border-app-border bg-app-input p-3">
                                            <p className="truncate text-xs font-bold text-app-text">{driverLabelFromArrival(item)}</p>
                                            <p className="mt-1 text-[10px] font-mono text-app-muted">
                                                {item.plataforma} · {item.estado}
                                                {item.restaurant_nombre ? ` · ${item.restaurant_nombre}` : ''}
                                            </p>
                                        </div>
                                    ))}
                                    {drivers.length === 0 && <p className="text-sm text-app-muted">Sin drivers esperando o en match.</p>}
                                    {drivers.length > 8 && (
                                        <p className="text-[10px] font-mono text-app-muted">+{drivers.length - 8} drivers más en el panel operativo.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-app-border bg-app-card p-4">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                        Resultados por {dimensionLabel}
                                    </h3>
                                    <p className="mt-1 text-[10px] font-mono text-app-muted">{filteredOrders.length} pedidos filtrados</p>
                                </div>
                                <span className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-input px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-muted">
                                    <Download size={13} /> PDF / Excel
                                </span>
                            </div>

                            {isLoading ? (
                                <p className="text-sm text-app-muted">Cargando métricas…</p>
                            ) : isError ? (
                                <p className="text-sm text-app-danger">No se pudieron cargar las órdenes de Delivery.</p>
                            ) : rows.length === 0 ? (
                                <p className="text-sm text-app-muted">Sin registros que coincidan con los filtros.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-2xl border border-app-border">
                                    <table className="w-full min-w-[920px] text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-app-border bg-app-input/40">
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Grupo</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Distribución</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Total</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Activos</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Entregados</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Cancel.</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Dev.</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Match</th>
                                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head">Listo→entrega</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row) => (
                                                <tr key={row.group} className="border-b border-app-border/80 hover:bg-app-input/20">
                                                    <td className="max-w-[260px] px-3 py-3 align-middle">
                                                        {dimension === 'estado' ? (
                                                            <span className={orderStatusBadgeClass(row.group)}>{row.group}</span>
                                                        ) : (
                                                            <span className="block truncate font-semibold text-app-text" title={row.group}>
                                                                {row.group}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 align-middle">
                                                        <div className="h-2 w-32 overflow-hidden rounded-full bg-app-input">
                                                            <div
                                                                className="h-full rounded-full bg-app-delivery"
                                                                style={{ width: `${maxRowTotal ? Math.max(6, (row.total / maxRowTotal) * 100) : 0}%` }}
                                                            />
                                                        </div>
                                                        <span className="mt-1 block text-[9px] font-mono text-app-muted">
                                                            {formatPercent(row.total, summary.total)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 font-mono text-app-text">{row.total}</td>
                                                    <td className="px-3 py-3 font-mono text-app-muted">{row.active}</td>
                                                    <td className="px-3 py-3 font-mono text-app-muted">{row.delivered}</td>
                                                    <td className="px-3 py-3 font-mono text-app-muted">{row.canceled}</td>
                                                    <td className="px-3 py-3 font-mono text-app-muted">{row.returned}</td>
                                                    <td className="px-3 py-3 font-mono text-app-muted">{row.matched}</td>
                                                    <td className="px-3 py-3 font-mono text-app-muted">{formatMinutes(row.avgReadyToDelivered)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {insightsModalOpen && (
                <div
                    className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-3 sm:p-6"
                    role="presentation"
                    onClick={() => setInsightsModalOpen(false)}
                >
                    <div
                        className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-app-border bg-app-panel shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delivery-insights-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-app-border p-4">
                            <div>
                                <h3
                                    id="delivery-insights-title"
                                    className="text-sm font-black uppercase tracking-widest text-app-text"
                                >
                                    Conclusiones y recomendaciones clave
                                </h3>
                                <p className="mt-1 text-[10px] font-mono text-app-muted">
                                    {dimensionLabel} · {filteredOrders.length} pedidos filtrados
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setInsightsModalOpen(false)}
                                className="rounded-xl border border-app-border bg-app-input p-2 text-app-muted hover:text-app-text"
                                aria-label="Cerrar recomendaciones"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="max-h-[calc(90vh-76px)] overflow-y-auto p-4">
                            <div className="space-y-3">
                                {insights.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`rounded-2xl border px-4 py-4 ${
                                            item.level === 'alta'
                                                ? 'border-red-500/30 bg-red-500/8'
                                                : item.level === 'media'
                                                    ? 'border-amber-500/30 bg-amber-500/8'
                                                    : 'border-emerald-500/30 bg-emerald-500/8'
                                        }`}
                                    >
                                        <p className="text-[10px] font-black uppercase tracking-widest text-app-text">
                                            {insightLevelLabel(item.level)}
                                            {item.group ? ` · ${item.group}` : ''}
                                        </p>
                                        <p className="mt-2 text-sm text-app-text">{item.conclusion}</p>
                                        <p className="mt-2 text-[11px] font-mono text-app-muted">{item.recommendation}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

type FilterSelectProps = {
    label: string;
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
};

const FilterSelect: React.FC<FilterSelectProps> = ({ label, options, value, onChange }) => (
    <div>
        <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-app-muted">{label}</label>
        <AppSelect
            options={options}
            value={options.find((option) => option.value === value) ?? options[0]}
            onChange={(option) => option && onChange(option.value)}
            size="sm"
            className="min-w-[140px]"
        />
    </div>
);

const MetricCard: React.FC<{ label: string; value: number; helper: string }> = ({ label, value, helper }) => (
    <div className="rounded-3xl border border-app-border bg-app-card p-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-app-muted">{label}</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-app-text">{value}</p>
        <p className="mt-1 text-[10px] font-mono text-app-muted">{helper}</p>
    </div>
);

const SlaLine: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-input px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">{label}</span>
        <span className="font-mono text-xs text-app-text">{formatMinutes(value)}</span>
    </div>
);

export default DeliveryMetricsModal;
