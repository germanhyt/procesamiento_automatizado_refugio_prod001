import React, { useMemo, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

import type { ConsolidacionResponse, ConsolidacionLocatarioDetalle } from '@/services/consolidacionTypes';
import { legibleMotivoArchivo } from '@/services/consolidacionTypes';

interface Props {
    open: boolean;
    data: ConsolidacionResponse | null;
    onClose: () => void;
}

const ESTADO_ICON: Record<string, React.ReactNode> = {
    ok: <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />,
    parcial: <AlertTriangle size={14} className="text-amber-500 shrink-0" />,
    omitido: <XCircle size={14} className="text-rose-400 shrink-0" />,
    sin_carpeta: <HelpCircle size={14} className="text-app-muted shrink-0" />,
};

function filterLocatarios(
    list: ConsolidacionLocatarioDetalle[],
    tab: 'todos' | 'ok' | 'alerta' | 'sin_carpeta',
): ConsolidacionLocatarioDetalle[] {
    if (tab === 'ok') return list.filter((l) => l.estado === 'ok');
    if (tab === 'sin_carpeta') return list.filter((l) => l.estado === 'sin_carpeta');
    if (tab === 'alerta') return list.filter((l) => l.estado === 'omitido' || l.estado === 'parcial');
    return list;
}

const ConsolidacionResultModal: React.FC<Props> = ({ open, data, onClose }) => {
    const [tab, setTab] = useState<'todos' | 'ok' | 'alerta' | 'sin_carpeta'>('todos');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const locatarios = data?.locatarios ?? [];
    const filtered = useMemo(() => filterLocatarios(locatarios, tab), [locatarios, tab]);

    if (!open || !data?.success) return null;

    const resumen = data.resumen ?? { ok: 0, omitidos: 0, parciales: 0, sin_carpeta: 0 };

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/80">
            <div
                className="bg-app-card border border-app-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
                role="dialog"
                aria-labelledby="consolidacion-result-title"
            >
                <div className="flex items-start justify-between gap-4 p-5 border-b border-app-border">
                    <div>
                        <h2 id="consolidacion-result-title" className="text-sm font-black uppercase tracking-widest text-app-accent">
                            {data.dry_run ? 'Simulación de consolidación' : 'Resultado de consolidación'}
                        </h2>
                        <p className="text-[10px] text-app-muted mt-1">
                            {data.rango_inicio} → {data.rango_fin}
                            {data.etiqueta ? ` · ${data.etiqueta}` : ''}
                            {data.dry_run ? ' · no se escribieron archivos' : ''}
                        </p>
                        <p className="text-[11px] text-app-text mt-2">
                            <strong>{data.registros_total ?? 0}</strong> registros en consolidados
                            {resumen.ok > 0 && (
                                <span className="text-emerald-500 ml-2">
                                    {resumen.ok} local(es) OK
                                </span>
                            )}
                            {(resumen.omitidos + resumen.parciales) > 0 && (
                                <span className="text-amber-500 ml-2">
                                    {resumen.omitidos + resumen.parciales} con observaciones
                                </span>
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg text-app-muted hover:bg-app-input"
                        aria-label="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 px-5 pt-3">
                    {(
                        [
                            ['todos', `Todos (${locatarios.length})`],
                            ['ok', `OK (${resumen.ok})`],
                            ['alerta', `Observaciones (${resumen.omitidos + resumen.parciales})`],
                            ['sin_carpeta', `Sin carpeta (${resumen.sin_carpeta})`],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors ${
                                tab === key
                                    ? 'border-app-accent-muted bg-app-accent-muted-bg text-app-accent'
                                    : 'border-app-border text-app-muted hover:text-app-text'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {filtered.length === 0 ? (
                        <p className="text-sm text-app-muted text-center py-8">Ningún local en este filtro.</p>
                    ) : (
                        filtered.map((loc) => {
                            const key = loc.locatario;
                            const isOpen = expanded[key];
                            return (
                                <div key={key} className="rounded-xl border border-app-border bg-app-input/50 overflow-hidden">
                                    <button
                                        type="button"
                                        className="w-full flex items-start gap-2 p-3 text-left hover:bg-app-surface/50"
                                        onClick={() => setExpanded((p) => ({ ...p, [key]: !p[key] }))}
                                    >
                                        {ESTADO_ICON[loc.estado] ?? ESTADO_ICON.omitido}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[11px] font-bold text-app-text truncate">
                                                {loc.nombre || loc.locatario}
                                                <span className="text-app-muted font-medium ml-1">{loc.codigo_bc}</span>
                                            </div>
                                            <p className="text-[10px] text-app-muted mt-0.5 leading-snug">{loc.motivo}</p>
                                            {loc.registros > 0 && (
                                                <p className="text-[10px] text-emerald-600/90 mt-1">
                                                    {loc.registros} registro(s)
                                                    {loc.archivos_ok != null && loc.archivos > 0
                                                        ? ` · ${loc.archivos_ok}/${loc.archivos} archivo(s)`
                                                        : ''}
                                                    {loc.fechas_en_consolidado_min && loc.fechas_en_consolidado_max
                                                        ? ` · fechas ${loc.fechas_en_consolidado_min} – ${loc.fechas_en_consolidado_max}`
                                                        : ''}
                                                </p>
                                            )}
                                            {loc.skip === 'sin_registros_en_rango_fecha' &&
                                                loc.fechas_detectadas_min &&
                                                loc.fechas_detectadas_max && (
                                                    <p className="text-[10px] text-amber-400 mt-1">
                                                        Ventas en archivos: {loc.fechas_detectadas_min} – {loc.fechas_detectadas_max}
                                                        (fuera del rango {loc.rango_inicio} – {loc.rango_fin})
                                                    </p>
                                                )}
                                            {loc.consolidados_previos?.length ? (
                                                <p className="text-[10px] text-sky-400/90 mt-1 truncate">
                                                    Consolidados previos: {loc.consolidados_previos.join(', ')}
                                                </p>
                                            ) : null}
                                        </div>
                                        <span className="text-[9px] font-black uppercase text-app-muted shrink-0">
                                            {isOpen ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {isOpen && (loc.archivos_detalle?.length ?? 0) > 0 ? (
                                        <ul className="border-t border-app-border px-3 py-2 space-y-1.5">
                                            {loc.archivos_detalle!.map((a) => (
                                                <li
                                                    key={a.nombre}
                                                    className="flex items-start gap-2 text-[10px] py-1 border-b border-app-border/40 last:border-0"
                                                >
                                                    {a.estado === 'ok' ? (
                                                        <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                                                    ) : (
                                                        <XCircle size={12} className="text-rose-400 shrink-0 mt-0.5" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <span className="font-mono text-app-text break-all">{a.nombre}</span>
                                                        <span className="text-app-muted block">
                                                            {legibleMotivoArchivo(a.motivo)}
                                                            {a.filas ? ` · ${a.filas} filas` : ''}
                                                            {a.layout_fallback ? ' · layout auto' : ''}
                                                            {(a.montos_anomalos ?? 0) > 0
                                                                ? ` · ${a.montos_anomalos} monto(s) >50k descartados`
                                                                : ''}
                                                        </span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : isOpen ? (
                                        <p className="text-[10px] text-app-muted px-3 py-2 border-t border-app-border">
                                            Sin detalle por archivo.
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-5 border-t border-app-border flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 bg-teal-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConsolidacionResultModal;
