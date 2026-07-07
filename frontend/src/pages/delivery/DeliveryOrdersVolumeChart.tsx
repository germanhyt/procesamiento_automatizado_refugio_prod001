import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ResponsiveBar, type BarTooltipProps } from '@nivo/bar';
import type { DeliveryMetricsTimeSeriesRow } from '@/services/deliveryService';
import { chartAxisLabel, type TimeGranularity } from '@/utils/deliveryMetricsTimeSeries';

const STACK_KEYS = ['entregados', 'activos', 'cancelados', 'devoluciones'] as const;

const SEGMENT_COLORS: Record<(typeof STACK_KEYS)[number], string> = {
    entregados: '#14b8a6',
    activos: '#fbbc00',
    cancelados: '#b80f0f',
    devoluciones: '#8543b1',
};

const SEGMENT_LABELS: Record<(typeof STACK_KEYS)[number], string> = {
    entregados: 'Entregados',
    activos: 'Activos',
    cancelados: 'Cancelados',
    devoluciones: 'Devoluciones',
};

type ChartDatum = {
    period: string;
    shortLabel: string;
    fullLabel: string;
    entregados: number;
    activos: number;
    cancelados: number;
    devoluciones: number;
    total: number;
};

const TOOLTIP_STYLE: CSSProperties = {
    background: '#171412',
    border: '1px solid rgba(231, 212, 198, 0.22)',
    borderRadius: 12,
    padding: '12px 14px',
    minWidth: 196,
    boxShadow: '0 14px 36px rgba(0, 0, 0, 0.55)',
    color: '#f8f3ee',
    fontSize: 11,
    lineHeight: 1.45,
    pointerEvents: 'none',
};

const nivoTheme = {
    background: 'transparent',
    text: { fill: '#b8a79a', fontSize: 10, fontFamily: 'ui-monospace, monospace' },
    axis: {
        domain: { line: { stroke: 'rgba(231, 212, 198, 0.14)', strokeWidth: 1 } },
        ticks: {
            line: { stroke: 'rgba(231, 212, 198, 0.14)', strokeWidth: 1 },
            text: { fill: '#b8a79a', fontSize: 9, fontFamily: 'ui-monospace, monospace' },
        },
    },
    grid: { line: { stroke: 'rgba(231, 212, 198, 0.14)', strokeWidth: 1, strokeOpacity: 0.28 } },
    tooltip: { container: { background: 'transparent', boxShadow: 'none', padding: 0 } },
};

function toChartData(series: DeliveryMetricsTimeSeriesRow[], granularity: TimeGranularity): ChartDatum[] {
    return series.map((row) => ({
        period: row.period,
        shortLabel: chartAxisLabel(row, granularity),
        fullLabel: row.label,
        entregados: row.delivered,
        activos: row.active,
        cancelados: row.canceled,
        devoluciones: row.returned,
        total: row.total,
    }));
}

function VolumeTooltip({ data }: BarTooltipProps<ChartDatum>) {
    if (!data) return null;

    const rows = STACK_KEYS.filter((key) => data[key] > 0);

    return (
        <div style={TOOLTIP_STYLE}>
            <div
                style={{
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    color: '#f8f3ee',
                }}
            >
                {data.fullLabel}
            </div>
            {rows.length === 0 ? (
                <div style={{ color: '#b8a79a', fontFamily: 'ui-monospace, monospace' }}>Sin pedidos</div>
            ) : (
                rows.map((key) => (
                    <div
                        key={key}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                            marginTop: 4,
                        }}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#d8c8bc' }}>
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 2,
                                    backgroundColor: SEGMENT_COLORS[key],
                                    flexShrink: 0,
                                }}
                            />
                            {SEGMENT_LABELS[key]}
                        </span>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#f8f3ee' }}>
                            {data[key]}
                        </span>
                    </div>
                ))
            )}
            <div
                style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid rgba(231, 212, 198, 0.16)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                }}
            >
                <span style={{ color: '#b8a79a', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.06em' }}>
                    Total período
                </span>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#14b8a6', fontSize: 12 }}>
                    {data.total}
                </span>
            </div>
        </div>
    );
}

type DeliveryOrdersVolumeChartProps = {
    series: DeliveryMetricsTimeSeriesRow[];
    granularity: TimeGranularity;
    chartKey: string;
};

export default function DeliveryOrdersVolumeChart({ series, granularity, chartKey }: DeliveryOrdersVolumeChartProps) {
    const data = useMemo(() => toChartData(series, granularity), [series, granularity]);
    const scrollWidth = Math.max(data.length * 34, 680);
    const dense = data.length > 18;
    const tickStride = dense ? Math.ceil(data.length / 16) : 1;
    const tickValues = useMemo(
        () => data.filter((_, index) => index % tickStride === 0 || index === data.length - 1).map((row) => row.period),
        [data, tickStride]
    );

    if (data.length === 0) {
        return <p className="text-sm text-app-muted">Sin datos para graficar en este rango.</p>;
    }

    return (
        <div className="rounded-2xl border border-app-border bg-app-input/20 p-3">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {STACK_KEYS.map((key) => (
                    <span
                        key={key}
                        className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-app-muted"
                    >
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS[key] }} />
                        {SEGMENT_LABELS[key]}
                    </span>
                ))}
            </div>
            <div className="overflow-x-auto rounded-xl">
                <div style={{ height: 300, width: scrollWidth, minWidth: '100%' }}>
                    <ResponsiveBar
                        key={chartKey}
                        data={data}
                        keys={[...STACK_KEYS]}
                        indexBy="period"
                        theme={nivoTheme}
                        margin={{ top: 8, right: 12, bottom: dense ? 58 : 44, left: 44 }}
                        padding={dense ? 0.14 : 0.28}
                        innerPadding={2}
                        groupMode="stacked"
                        colors={({ id }) => SEGMENT_COLORS[id as (typeof STACK_KEYS)[number]]}
                        borderRadius={3}
                        valueScale={{ type: 'linear', min: 0 }}
                        axisBottom={{
                            tickSize: 0,
                            tickPadding: 10,
                            tickRotation: dense ? -42 : 0,
                            tickValues,
                            format: (value) => data.find((row) => row.period === value)?.shortLabel ?? String(value),
                        }}
                        axisLeft={{
                            tickSize: 0,
                            tickPadding: 8,
                        }}
                        enableGridY
                        enableLabel={false}
                        animate={false}
                        isInteractive
                        tooltip={VolumeTooltip}
                        role="img"
                        ariaLabel="Gráfico de pedidos por período"
                    />
                </div>
            </div>
        </div>
    );
}
