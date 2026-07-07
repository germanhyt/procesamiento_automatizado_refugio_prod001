import { useMemo, useRef, useState, type RefObject } from 'react';
import type { CSSProperties } from 'react';
import { ResponsiveBar, type BarLayer, type ComputedBarDatum } from '@nivo/bar';
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

type HoverState = {
    period: string;
    x: number;
    y: number;
};

const TOOLTIP_STYLE: CSSProperties = {
    background: '#171412',
    border: '1px solid rgba(231, 212, 198, 0.22)',
    borderRadius: 10,
    padding: '10px 12px',
    minWidth: 180,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
    color: '#f8f3ee',
    fontSize: 11,
    lineHeight: 1.45,
    pointerEvents: 'none',
    zIndex: 20,
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

function uniqueBarsByPeriod(bars: readonly ComputedBarDatum<ChartDatum>[]) {
    const seen = new Set<string>();
    const result: ComputedBarDatum<ChartDatum>[] = [];
    for (const bar of bars) {
        const period = bar.data.data.period;
        if (seen.has(period)) continue;
        seen.add(period);
        result.push(bar);
    }
    return result;
}

function VolumeFloatingTooltip({ data }: { data: ChartDatum }) {
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

function createColumnHitLayer(
    chartWrapRef: RefObject<HTMLDivElement | null>,
    onHover: (state: HoverState | null) => void,
    hoveredPeriod: string | null
): BarLayer<ChartDatum> {
    return ({ bars, innerHeight }) => (
        <g>
            {uniqueBarsByPeriod(bars).map((bar) => {
                const period = bar.data.data.period;
                const active = hoveredPeriod === period;

                const updateHover = (clientX: number, clientY: number) => {
                    const wrap = chartWrapRef.current;
                    if (!wrap) return;
                    const rect = wrap.getBoundingClientRect();
                    onHover({
                        period,
                        x: clientX - rect.left,
                        y: clientY - rect.top,
                    });
                };

                return (
                    <rect
                        key={period}
                        x={bar.x - 10}
                        y={0}
                        width={bar.width + 20}
                        height={innerHeight}
                        fill={active ? 'rgba(20, 184, 166, 0.07)' : 'transparent'}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => updateHover(e.clientX, e.clientY)}
                        onMouseMove={(e) => updateHover(e.clientX, e.clientY)}
                        onMouseLeave={() => onHover(null)}
                    />
                );
            })}
        </g>
    );
}

type DeliveryOrdersVolumeChartProps = {
    series: DeliveryMetricsTimeSeriesRow[];
    granularity: TimeGranularity;
    chartKey: string;
};

export default function DeliveryOrdersVolumeChart({ series, granularity, chartKey }: DeliveryOrdersVolumeChartProps) {
    const chartWrapRef = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState<HoverState | null>(null);
    const data = useMemo(() => toChartData(series, granularity), [series, granularity]);
    const hoveredDatum = useMemo(
        () => data.find((row) => row.period === hover?.period) ?? null,
        [data, hover?.period]
    );
    const hitLayer = useMemo(
        () => createColumnHitLayer(chartWrapRef, setHover, hover?.period ?? null),
        [hover?.period]
    );
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

    const tooltipLeft = hover ? Math.min(Math.max(hover.x + 14, 8), scrollWidth - 200) : 0;
    const tooltipTop = hover ? Math.max(hover.y - 12, 8) : 0;

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
                <div
                    ref={chartWrapRef}
                    className="relative"
                    style={{ height: 300, width: scrollWidth, minWidth: '100%' }}
                    onMouseLeave={() => setHover(null)}
                >
                    {hover && hoveredDatum && (
                        <div
                            className="absolute"
                            style={{
                                left: tooltipLeft,
                                top: tooltipTop,
                                transform: 'translateY(-100%)',
                            }}
                        >
                            <VolumeFloatingTooltip data={hoveredDatum} />
                        </div>
                    )}
                    <ResponsiveBar
                        key={chartKey}
                        data={data}
                        keys={[...STACK_KEYS]}
                        indexBy="period"
                        theme={nivoTheme}
                        margin={{ top: 8, right: 12, bottom: dense ? 58 : 44, left: 44 }}
                        padding={dense ? 0.08 : 0.16}
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
                        isInteractive={false}
                        tooltip={() => null}
                        layers={['grid', 'axes', 'bars', hitLayer, 'markers', 'legends', 'annotations']}
                        role="img"
                        ariaLabel="Gráfico de pedidos por período"
                    />
                </div>
            </div>
        </div>
    );
}
