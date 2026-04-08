import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { BarChart3, X } from 'lucide-react';
import type { EventosAnalytics, MonthlyCount, ReservasAnalytics } from '@/services/comercialService';

type AnalyticsModalProps = {
    open: boolean;
    onClose: () => void;
    kind: 'reservas' | 'eventos';
    data: ReservasAnalytics | EventosAnalytics | null;
    loading: boolean;
};

const teal = '#14b8a6';
const amber = '#f59e0b';
const slate = '#64748b';

const MESES_ES = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
] as const;

/** Etiqueta "Enero 2026" en español (coherente aunque el API envíe otro formato). */
function labelMesEspanol(year: number, month: number, serverLabel: string): string {
    if (month >= 1 && month <= 12) {
        const nombre = MESES_ES[month - 1];
        return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${year}`;
    }
    return serverLabel;
}

function formatearEstado(estado: string): string {
    if (estado === 'atendido') return 'Atendido';
    if (estado === 'pendiente') return 'Pendiente';
    return estado;
}

type TooltipPayload = {
    x: number;
    y: number;
    title: string;
    lines: string[];
};

function AnalyticsTooltipPortal({ tip }: { tip: TooltipPayload | null }) {
    if (!tip) return null;
    const pad = 14;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    return createPortal(
        <div
            className="pointer-events-none max-w-[220px] rounded-xl border px-3 py-2 shadow-xl backdrop-blur-sm"
            style={{
                position: 'fixed',
                left: Math.min(tip.x + pad, vw - 216),
                top: tip.y + pad,
                zIndex: 200_000,
                backgroundColor: 'var(--app-panel)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
            }}
        >
            <div className="text-[10px] font-black uppercase tracking-wide text-teal-400 leading-tight">{tip.title}</div>
            {tip.lines.map((line, i) => (
                <div key={i} className="text-[11px] text-app-muted mt-1 font-mono tabular-nums">
                    {line}
                </div>
            ))}
        </div>,
        document.body
    );
}

function LineTrend({ points }: { points: { label: string; count: number }[] }) {
    const [tip, setTip] = useState<TooltipPayload | null>(null);

    if (!points.length) {
        return <p className="text-[10px] text-app-muted">Sin datos aún.</p>;
    }
    const max = Math.max(...points.map((p) => p.count), 1);
    const w = 320;
    const h = 120;
    const pad = 8;
    const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
    const coords = points.map((p, i) => {
        const x = pad + i * step;
        const y = h - pad - (p.count / max) * (h - pad * 2);
        return `${x},${y}`;
    });
    const poly = coords.join(' ');

    const showTip = (e: React.MouseEvent, p: { label: string; count: number }) => {
        setTip({
            x: e.clientX,
            y: e.clientY,
            title: p.label,
            lines: [`Registros: ${p.count}`],
        });
    };

    const moveTip = (e: React.MouseEvent) => {
        setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null));
    };

    const hideTip = () => setTip(null);

    return (
        <>
            <AnalyticsTooltipPortal tip={tip} />
            <svg
                viewBox={`0 0 ${w} ${h}`}
                className="w-full max-w-md h-32 text-teal-400"
                onMouseLeave={hideTip}
                role="img"
                aria-label="Tendencia de registros por mes"
            >
                <polyline fill="none" stroke={teal} strokeWidth="2" points={poly} pointerEvents="none" />
                {points.map((p, i) => {
                    const cx = pad + i * step;
                    const cy = h - pad - (p.count / max) * (h - pad * 2);
                    return (
                        <g key={`${p.label}-${i}`}>
                            <title>
                                {p.label}: {p.count} registros
                            </title>
                            <circle
                                cx={cx}
                                cy={cy}
                                r="12"
                                fill="transparent"
                                className="cursor-crosshair"
                                onMouseEnter={(e) => showTip(e, p)}
                                onMouseMove={moveTip}
                            />
                            <circle cx={cx} cy={cy} r="4" fill={teal} pointerEvents="none" className="drop-shadow-sm" />
                        </g>
                    );
                })}
            </svg>
        </>
    );
}

function HorizBars({
    items,
    valueLabel = 'Cantidad',
}: {
    items: { label: string; count: number; color?: string }[];
    valueLabel?: string;
}) {
    const [tip, setTip] = useState<TooltipPayload | null>(null);
    const max = items.length === 0 ? 1 : Math.max(...items.map((i) => i.count), 1);

    const showTip = (e: React.MouseEvent, title: string, count: number) => {
        setTip({
            x: e.clientX,
            y: e.clientY,
            title,
            lines: [`${valueLabel}: ${count}`],
        });
    };

    const moveTip = (e: React.MouseEvent) => {
        setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null));
    };

    const hideTip = () => setTip(null);

    return (
        <>
            <AnalyticsTooltipPortal tip={tip} />
            <div className="space-y-2" onMouseLeave={hideTip}>
                {items.map((it) => (
                    <div key={it.label}>
                        <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-app-muted">{it.label}</span>
                            <span className="font-mono text-app-text">{it.count}</span>
                        </div>
                        <div
                            className="h-2 rounded-full bg-white/5 overflow-hidden cursor-pointer"
                            onMouseEnter={(e) => showTip(e, it.label, it.count)}
                            onMouseMove={moveTip}
                        >
                            <div
                                className="h-full rounded-full transition-all pointer-events-none"
                                style={{
                                    width: `${(it.count / max) * 100}%`,
                                    backgroundColor: it.color ?? teal,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

function mapMonthPoints(byMonth: MonthlyCount[]) {
    return byMonth.map((m) => ({
        label: labelMesEspanol(m.year, m.month, m.label),
        count: m.count,
    }));
}

const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ open, onClose, kind, data, loading }) => {
    const [avgTipoTip, setAvgTipoTip] = useState<TooltipPayload | null>(null);

    useEffect(() => {
        if (!open) setAvgTipoTip(null);
    }, [open]);

    if (!open) return null;

    const monthPoints = data ? mapMonthPoints(data.by_month) : [];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <AnalyticsTooltipPortal tip={avgTipoTip} />
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 w-full max-w-2xl rounded-2xl border p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
                style={{ backgroundColor: 'var(--app-panel)', borderColor: 'var(--app-border)' }}
            >
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                            <BarChart3 size={22} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-tight">Analytics</h2>
                            <p className="text-[10px] text-app-muted">{kind === 'reservas' ? 'Reservas' : 'Eventos'}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={20} />
                    </button>
                </div>

                {loading && (
                    <div className="flex justify-center py-16">
                        <div className="w-10 h-10 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
                    </div>
                )}

                {!loading && data && (
                    <div className="space-y-8">
                        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--app-border)' }}>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-3">
                                Tendencia por mes
                            </h3>
                            <LineTrend points={monthPoints} />
                            <div className="flex flex-wrap gap-2 mt-3">
                                {monthPoints.slice(-6).map((m, i) => (
                                    <span key={i} className="text-[9px] font-mono text-app-muted">
                                        {m.label}: {m.count}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--app-border)' }}>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-3">
                                    Por estado
                                </h3>
                                <HorizBars
                                    items={data.by_estado.map((e) => ({
                                        label: formatearEstado(e.estado),
                                        count: e.count,
                                        color: e.estado === 'atendido' ? teal : amber,
                                    }))}
                                    valueLabel="Registros"
                                />
                            </div>
                            <div className="rounded-xl border p-4 flex flex-col justify-center" style={{ borderColor: 'var(--app-border)' }}>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-2">
                                    Promedio personas
                                </h3>
                                <p className="text-4xl font-black text-teal-400 tabular-nums">{data.avg_personas.toFixed(1)}</p>
                                <p className="text-[10px] text-app-muted mt-1">Total registros: {data.total}</p>
                            </div>
                        </div>

                        {kind === 'reservas' && 'by_personas_rango' in data && (
                            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--app-border)' }}>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-3">
                                    Personas por rango (reservas)
                                </h3>
                                <HorizBars
                                    items={data.by_personas_rango.map((r) => ({
                                        label: `${r.rango} pers.`,
                                        count: r.count,
                                        color: slate,
                                    }))}
                                    valueLabel="Reservas"
                                />
                            </div>
                        )}

                        {kind === 'eventos' && 'by_tipo_evento' in data && (
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--app-border)' }}>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-3">
                                        Por tipo de evento
                                    </h3>
                                    <HorizBars
                                        items={data.by_tipo_evento.map((t) => ({
                                            label: t.tipo_evento,
                                            count: t.count,
                                        }))}
                                        valueLabel="Eventos"
                                    />
                                </div>
                                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--app-border)' }}>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-3">
                                        Promedio personas por tipo
                                    </h3>
                                    <div className="space-y-2">
                                        {data.avg_personas_por_tipo.map((t) => (
                                            <div
                                                key={t.tipo_evento}
                                                className="flex justify-between text-sm rounded-lg px-2 py-1.5 cursor-default hover:bg-app-card-hover/50 transition-colors"
                                                title={`${t.tipo_evento}: promedio ${t.avg_personas.toFixed(1)} personas`}
                                                onMouseEnter={(e) =>
                                                    setAvgTipoTip({
                                                        x: e.clientX,
                                                        y: e.clientY,
                                                        title: t.tipo_evento,
                                                        lines: [`Promedio: ${t.avg_personas.toFixed(1)} personas`],
                                                    })
                                                }
                                                onMouseMove={(e) =>
                                                    setAvgTipoTip((tip) =>
                                                        tip
                                                            ? {
                                                                  ...tip,
                                                                  x: e.clientX,
                                                                  y: e.clientY,
                                                              }
                                                            : null
                                                    )
                                                }
                                                onMouseLeave={() => setAvgTipoTip(null)}
                                            >
                                                <span className="text-app-muted">{t.tipo_evento}</span>
                                                <span className="font-mono text-teal-400">{t.avg_personas.toFixed(1)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default AnalyticsModal;
