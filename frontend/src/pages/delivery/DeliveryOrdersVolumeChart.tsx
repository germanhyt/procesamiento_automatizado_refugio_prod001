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

const nivoTheme = {
    background: 'transparent',
    text: { fill: 'var(--app-muted)', fontSize: 10, fontFamily: 'ui-monospace, monospace' },
    axis: {
        domain: { line: { stroke: 'var(--app-border)', strokeWidth: 1 } },
        ticks: {
            line: { stroke: 'var(--app-border)', strokeWidth: 1 },
            text: { fill: 'var(--app-muted)', fontSize: 9, fontFamily: 'ui-monospace, monospace' },
        },
    },
    grid: { line: { stroke: 'var(--app-border)', strokeWidth: 1, strokeOpacity: 0.28 } },
    tooltip: {
        container: {
            background: 'var(--app-modal-solid)',
            color: 'var(--app-text)',
            fontSize: 11,
            borderRadius: 12,
            border: '1px solid var(--app-border)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
            padding: '10px 12px',
        },
    },
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

function VolumeTooltip({ id, value, color, data }: BarTooltipProps<ChartDatum>) {
    const segment = SEGMENT_LABELS[id as (typeof STACK_KEYS)[number]] ?? String(id);
    return (
        <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-app-text">{data.fullLabel}</p>
            <p className="text-[10px] font-mono text-app-muted">
                <span className="inline-block h-2 w-2 rounded-full align-middle mr-1.5" style={{ backgroundColor: color }} />
                {segment}: <span className="text-app-text">{value}</span>
            </p>
            <p className="text-[10px] font-mono text-app-muted">
                Total período: <span className="text-app-text">{data.total}</span>
            </p>
        </div>
    );
}

type DeliveryOrdersVolumeChartProps = {
    series: DeliveryMetricsTimeSeriesRow[];
    granularity: TimeGranularity;
};

export default function DeliveryOrdersVolumeChart({ series, granularity }: DeliveryOrdersVolumeChartProps) {
    const data = toChartData(series, granularity);
    const scrollWidth = Math.max(data.length * 34, 680);
    const dense = data.length > 18;
    const tickStride = dense ? Math.ceil(data.length / 16) : 1;
    const tickValues = data.filter((_, index) => index % tickStride === 0 || index === data.length - 1).map((row) => row.period);

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
                        tooltip={VolumeTooltip}
                        role="img"
                        ariaLabel="Gráfico de pedidos por período"
                        motionConfig="gentle"
                    />
                </div>
            </div>
        </div>
    );
}
