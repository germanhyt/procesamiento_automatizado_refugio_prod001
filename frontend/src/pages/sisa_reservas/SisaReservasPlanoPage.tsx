import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Map, Move } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { PERMISSION_SISA_RESERVAS_MANAGE, sisaEstadoLabel } from '@/constants/sisaReservas';
import {
    getSisaPlano,
    SISA_LIST_STALE_MS,
    updateSisaMesa,
    updateSisaZona,
    type SisaMesa,
    type SisaZona,
} from '@/services/sisaReservasService';
import { userHasCodename } from '@/utils/documentosGcbUtils';

import { MESA_EMPTY_FILL, MESA_STROKE, mesaFillForEstado } from '@/pages/sisa_reservas/sisaPlanoColors';
import { computeViewBox, PLANO_NODE_R } from '@/pages/sisa_reservas/sisaPlanoView';
import { sisaAxiosDetail, sisaSwalError, sisaSwalToastOk } from '@/pages/sisa_reservas/sisaReservasSwal';

/** Modo de interacción en el plano: ver, arrastrar mesas dentro de la zona o mover el rectángulo de zona. */
type PlanoLayoutMode = 'view' | 'mesas' | 'zonas';

const PLANO_LAYOUT_MODE_LABEL: Record<PlanoLayoutMode, string> = {
    view: 'Solo ver',
    mesas: 'Mover mesas',
    zonas: 'Mover zonas',
};

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
}

function clampMesaPos(z: SisaZona, posX: number, posY: number, nodeR: number): { x: number; y: number } {
    const w = z.width > 0 ? z.width : 160;
    const h = z.height > 0 ? z.height : 100;
    const maxX = Math.max(0, w - 2 * nodeR);
    const maxY = Math.max(0, h - 2 * nodeR);
    return {
        x: Math.min(maxX, Math.max(0, posX)),
        y: Math.min(maxY, Math.max(0, posY)),
    };
}

const SisaReservasPlanoPage: React.FC = () => {
    const qc = useQueryClient();
    const { token, user } = useAuth();
    const authToken = token ?? '';
    const canManage = userHasCodename(user, PERMISSION_SISA_RESERVAS_MANAGE);

    const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
    const [hora, setHora] = useState('13:00');
    const [layoutMode, setLayoutMode] = useState<PlanoLayoutMode>('view');
    /** Posiciones locales durante arrastre o hasta persistir (mesas, relativas a zona) */
    const [posOverride, setPosOverride] = useState<Record<number, { x: number; y: number }>>({});
    /** Origen del rectángulo de zona (pos_x / pos_y absolutos en el plano) */
    const [zonaPosOverride, setZonaPosOverride] = useState<Record<number, { x: number; y: number }>>({});
    const dragRef = useRef<{
        mesaId: number;
        zona: SisaZona;
        mesa: SisaMesa;
        pointerId: number;
        lastPos: { x: number; y: number };
        captureEl: SVGCircleElement;
    } | null>(null);
    const zonaDragRef = useRef<{
        zonaId: number;
        pointerId: number;
        grabDx: number;
        grabDy: number;
        lastPos: { x: number; y: number };
        startEffective: { x: number; y: number };
        captureEl: SVGRectElement;
    } | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const { data, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['sisa-plano', authToken, fecha, hora],
        queryFn: () => getSisaPlano(authToken, fecha, hora),
        enabled: !!authToken,
        staleTime: SISA_LIST_STALE_MS,
    });

    const mutPos = useMutation({
        mutationFn: (args: { id: number; pos_x: number; pos_y: number }) =>
            updateSisaMesa(authToken, args.id, { pos_x: args.pos_x, pos_y: args.pos_y }),
        onSuccess: (_, args) => {
            setPosOverride((o) => {
                const { [args.id]: _, ...rest } = o;
                return rest;
            });
            void qc.invalidateQueries({ queryKey: ['sisa-plano'] });
            void qc.invalidateQueries({ queryKey: ['sisa-mesas-all'] });
            void sisaSwalToastOk('Mesa guardada en el plano');
        },
        onError: (e: unknown) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const mutZona = useMutation({
        mutationFn: (args: { id: number; pos_x: number; pos_y: number }) =>
            updateSisaZona(authToken, args.id, { pos_x: args.pos_x, pos_y: args.pos_y }),
        onSuccess: (_, args) => {
            setZonaPosOverride((o) => {
                const { [args.id]: _, ...rest } = o;
                return rest;
            });
            void qc.invalidateQueries({ queryKey: ['sisa-plano'] });
            void qc.invalidateQueries({ queryKey: ['sisa-zonas'] });
            void sisaSwalToastOk('Zona guardada en el plano');
        },
        onError: (e: unknown) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const viewBox = useMemo(() => (data ? computeViewBox(data, PLANO_NODE_R) : '0 0 640 360'), [data]);
    const vb = useMemo(() => viewBox.split(' ').map(Number) as [number, number, number, number], [viewBox]);

    const zonaPos = useCallback(
        (z: SisaZona) => zonaPosOverride[z.id] ?? { x: z.pos_x, y: z.pos_y },
        [zonaPosOverride]
    );

    const mesaPos = useCallback(
        (m: SisaMesa) => posOverride[m.id] ?? { x: m.pos_x, y: m.pos_y },
        [posOverride]
    );

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const d = dragRef.current;
            const svg = svgRef.current;
            if (!d || !svg || e.pointerId !== d.pointerId) return;
            const pt = clientToSvg(svg, e.clientX, e.clientY);
            const z = d.zona;
            const zp = zonaPos(z);
            const rawX = pt.x - zp.x - PLANO_NODE_R;
            const rawY = pt.y - zp.y - PLANO_NODE_R;
            const clamped = clampMesaPos(z, rawX, rawY, PLANO_NODE_R);
            d.lastPos = clamped;
            setPosOverride((prev) => ({ ...prev, [d.mesaId]: clamped }));
        };

        const onUp = (e: PointerEvent) => {
            const d = dragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;
            dragRef.current = null;
            try {
                d.captureEl.releasePointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
            const final = d.lastPos;
            const changed = Math.abs(final.x - d.mesa.pos_x) > 0.5 || Math.abs(final.y - d.mesa.pos_y) > 0.5;
            if (changed) {
                mutPos.mutate({ id: d.mesaId, pos_x: final.x, pos_y: final.y });
            } else {
                setPosOverride((p) => {
                    const { [d.mesaId]: __, ...rest } = p;
                    return rest;
                });
            }
        };

        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerup', onUp, { capture: true });
        window.addEventListener('pointercancel', onUp, { capture: true });
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp, { capture: true });
            window.removeEventListener('pointercancel', onUp, { capture: true });
        };
    }, [mutPos, zonaPos]);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const d = zonaDragRef.current;
            const svg = svgRef.current;
            if (!d || !svg || e.pointerId !== d.pointerId) return;
            const pt = clientToSvg(svg, e.clientX, e.clientY);
            const nx = pt.x - d.grabDx;
            const ny = pt.y - d.grabDy;
            const clamped = { x: Math.max(0, nx), y: Math.max(0, ny) };
            d.lastPos = clamped;
            setZonaPosOverride((prev) => ({ ...prev, [d.zonaId]: clamped }));
        };

        const onUp = (e: PointerEvent) => {
            const d = zonaDragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;
            zonaDragRef.current = null;
            try {
                d.captureEl.releasePointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
            const final = d.lastPos;
            const changed =
                Math.abs(final.x - d.startEffective.x) > 0.5 || Math.abs(final.y - d.startEffective.y) > 0.5;
            if (changed) {
                mutZona.mutate({ id: d.zonaId, pos_x: final.x, pos_y: final.y });
            } else {
                setZonaPosOverride((p) => {
                    const { [d.zonaId]: __, ...rest } = p;
                    return rest;
                });
            }
        };

        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerup', onUp, { capture: true });
        window.addEventListener('pointercancel', onUp, { capture: true });
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp, { capture: true });
            window.removeEventListener('pointercancel', onUp, { capture: true });
        };
    }, [mutZona]);

    if (!authToken) {
        return <p className="text-app-muted text-sm">Inicie sesión para ver el plano.</p>;
    }

    const hasZonas = data && data.zonas.length > 0;

    const layoutBusy = mutPos.isPending || mutZona.isPending;
    const draggableMesa = layoutMode === 'mesas' && canManage && !layoutBusy;
    const draggableZona = layoutMode === 'zonas' && canManage && !layoutBusy;

    return (
        <div className="space-y-6">
            <div className="bg-app-card border border-app-border rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col xl:flex-row xl:flex-wrap gap-4 xl:items-start xl:justify-between">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className='mb-2'>
                            <Map size={20} className="shrink-0 text-[var(--app-sisa-reservas-accent)]" />
                        </div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted flex flex-col gap-1">
                            Fecha
                            <input
                                type="date"
                                className="rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm text-app-text"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                            />
                        </label>
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted flex flex-col gap-1">
                            Hora
                            <input
                                type="time"
                                className="rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm text-app-text"
                                value={hora}
                                onChange={(e) => setHora(e.target.value)}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            disabled={layoutBusy}
                            className="rounded-xl px-4 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
                            style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                        >
                            Actualizar plano
                        </button>
                    </div>

                    {canManage && (
                        <div className="space-y-2 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Modo del lienzo</p>
                            <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-app-input border border-app-border w-fit max-w-full">
                                {(['view', 'mesas', 'zonas'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        disabled={layoutBusy}
                                        onClick={() => {
                                            setLayoutMode(mode);
                                            setPosOverride({});
                                            setZonaPosOverride({});
                                        }}
                                        className={`px-3 sm:px-4 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 ${layoutMode === mode ? 'text-white shadow-sm' : 'text-app-muted hover:text-app-text'
                                            }`}
                                        style={
                                            layoutMode === mode
                                                ? { backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }
                                                : undefined
                                        }
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            {mode !== 'view' && <Move size={12} className="shrink-0 opacity-90" />}
                                            {PLANO_LAYOUT_MODE_LABEL[mode]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="text-[10px] text-app-muted space-y-1 border-t border-app-border pt-4">
                    {/* <p>Se muestran reservas activas en la franja (el servicio excluye cancelado y finalizado).</p>
                    {layoutMode === 'mesas' && canManage && (
                        <p className="text-[var(--app-sisa-reservas-accent)] font-semibold">
                            Arrastre los círculos de mesa; la posición es relativa a su zona y se guarda al soltar.
                        </p>
                    )} */}
                    {layoutMode === 'zonas' && canManage && (
                        <p className="text-[var(--app-sisa-reservas-accent)] font-semibold">
                            Arrastre el rectángulo de cada zona para reubicar el espacio en el plano digital; las mesas se
                            mueven con la zona.
                        </p>
                    )}
                    {layoutMode === 'view' && canManage && (
                        <p>
                            Use <strong className="text-app-text">Mover zonas</strong> para ubicar salones en el lienzo y{' '}
                            <strong className="text-app-text">Mover mesas</strong> para colocar mesas dentro de cada zona.
                        </p>
                    )}
                </div>
            </div>

            {isError && <p className="text-app-danger text-sm">No se pudo cargar el plano.</p>}

            {isLoading ? (
                <div className="flex justify-center py-16 rounded-2xl border border-app-border">
                    <div
                        className="w-10 h-10 border-4 rounded-full animate-spin border-t-transparent"
                        style={{ borderColor: 'var(--app-sisa-reservas-accent-muted)' }}
                    />
                </div>
            ) : !hasZonas ? (
                <div
                    className="rounded-2xl border p-8 text-center text-app-text-secondary text-sm"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-card)' }}
                >
                    No hay zonas definidas. Cree zonas y mesas desde <strong>Reservas → Zonas y mesas</strong>.
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-4 items-stretch  mx-auto">
                    <div
                        className="flex-1 min-w-0 rounded-2xl border overflow-hidden relative"
                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-panel)' }}
                    >
                        {isFetching && (
                            <div className="absolute top-2 right-2 z-10 text-[9px] font-mono uppercase text-app-muted bg-app-input/90 px-2 py-1 rounded-lg border border-app-border">
                                Actualizando…
                            </div>
                        )}
                        <div
                            className="w-full overflow-auto touch-pan-x touch-pan-y"
                            style={{ maxHeight: 'min(65vh, 560px)' }}
                        >
                            <svg
                                ref={svgRef}
                                className="w-full block select-none"
                                style={{ height: 'auto', minHeight: 280, maxHeight: 480 }}
                                viewBox={viewBox}
                                preserveAspectRatio="xMidYMid meet"
                            >
                                <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="rgba(0,0,0,0.12)" />
                                {data!.zonas.map((slot) => {
                                    const z = slot.zona;
                                    const { x: zx, y: zy } = zonaPos(z);
                                    const w = z.width > 0 ? z.width : 160;
                                    const h = z.height > 0 ? z.height : 100;
                                    const stroke = z.color && /^#/.test(z.color) ? z.color : '#288248';
                                    return (
                                        <g key={z.id}>
                                            <rect
                                                x={zx}
                                                y={zy}
                                                width={w}
                                                height={h}
                                                rx={8}
                                                fill="rgba(40, 130, 72, 0.06)"
                                                stroke={stroke}
                                                strokeWidth={2}
                                                strokeOpacity={0.5}
                                                style={{
                                                    cursor: draggableZona ? 'grab' : 'default',
                                                    touchAction: draggableZona ? 'none' : undefined,
                                                }}
                                                onPointerDown={(e) => {
                                                    if (!draggableZona) return;
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const el = e.currentTarget;
                                                    el.setPointerCapture(e.pointerId);
                                                    const svg = svgRef.current;
                                                    if (!svg) return;
                                                    const pt = clientToSvg(svg, e.clientX, e.clientY);
                                                    const start = zonaPos(z);
                                                    zonaDragRef.current = {
                                                        zonaId: z.id,
                                                        pointerId: e.pointerId,
                                                        grabDx: pt.x - start.x,
                                                        grabDy: pt.y - start.y,
                                                        lastPos: { ...start },
                                                        startEffective: { ...start },
                                                        captureEl: el,
                                                    };
                                                }}
                                            />
                                            <text
                                                x={zx + 8}
                                                y={zy + 16}
                                                fill="var(--app-text-secondary)"
                                                pointerEvents="none"
                                                style={{ fontSize: 11, fontWeight: 800 }}
                                            >
                                                {z.nombre}
                                            </text>
                                            {slot.mesas.map(({ mesa: m, reserva: r }) => {
                                                const { x: px, y: py } = mesaPos(m);
                                                const cx = zx + px + PLANO_NODE_R;
                                                const cy = zy + py + PLANO_NODE_R;
                                                const fill = r ? mesaFillForEstado(r.estado) : MESA_EMPTY_FILL;
                                                const title = r
                                                    ? 'nombre_completo' in r
                                                      ? `Mesa ${m.numero} · ${r.nombre_completo} · ${r.numero_personas} personas · ${sisaEstadoLabel(r.estado)}`
                                                      : `Mesa ${m.numero} · ${r.numero_personas} p. · ${sisaEstadoLabel(r.estado)}`
                                                    : `Mesa ${m.numero} · libre`;
                                                return (
                                                    <g key={m.id} style={{ pointerEvents: layoutMode === 'zonas' ? 'none' : undefined }}>
                                                        <title>{title}</title>
                                                        <circle
                                                            role={draggableMesa ? 'button' : undefined}
                                                            tabIndex={draggableMesa ? 0 : undefined}
                                                            cx={cx}
                                                            cy={cy}
                                                            r={PLANO_NODE_R}
                                                            fill={fill}
                                                            stroke={MESA_STROKE}
                                                            strokeWidth={2}
                                                            style={{
                                                                cursor: draggableMesa ? 'grab' : 'default',
                                                                touchAction: 'none',
                                                            }}
                                                            onPointerDown={(e) => {
                                                                if (!draggableMesa) return;
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                const el = e.currentTarget as SVGCircleElement;
                                                                el.setPointerCapture(e.pointerId);
                                                                const start = mesaPos(m);
                                                                dragRef.current = {
                                                                    mesaId: m.id,
                                                                    zona: z,
                                                                    mesa: m,
                                                                    pointerId: e.pointerId,
                                                                    lastPos: start,
                                                                    captureEl: el,
                                                                };
                                                            }}
                                                        />
                                                        <text
                                                            x={cx}
                                                            y={cy + 4}
                                                            textAnchor="middle"
                                                            fill="rgba(248,243,238,0.95)"
                                                            pointerEvents="none"
                                                            style={{ fontSize: 10, fontWeight: 900 }}
                                                        >
                                                            {m.numero}
                                                        </text>
                                                        {r && (
                                                            <text
                                                                x={cx}
                                                                y={cy + PLANO_NODE_R + 12}
                                                                textAnchor="middle"
                                                                fill="var(--app-muted)"
                                                                pointerEvents="none"
                                                                style={{ fontSize: 8, fontWeight: 700 }}
                                                            >
                                                                {r.numero_personas} pers. · {sisaEstadoLabel(r.estado).slice(0, 3)}
                                                            </text>
                                                        )}
                                                    </g>
                                                );
                                            })}
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>

                    <aside className="w-full lg:w-56 xl:w-64 shrink-0 rounded-2xl border border-app-border bg-app-card p-4 space-y-3 lg:sticky lg:top-4 lg:self-start max-h-[min(65vh,560px)] lg:overflow-y-auto">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Leyenda — estado de mesa</p>
                        <div className="flex flex-col gap-2.5 text-[10px] font-bold uppercase tracking-wide text-app-muted">
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="inline-block w-3 h-3 shrink-0 rounded-full" style={{ background: MESA_EMPTY_FILL, border: `1px solid ${MESA_STROKE}` }} />
                                Libre
                            </span>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="inline-block w-3 h-3 shrink-0 rounded-full" style={{ background: mesaFillForEstado('pendiente') }} />
                                Pendiente
                            </span>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="inline-block w-3 h-3 shrink-0 rounded-full" style={{ background: mesaFillForEstado('confirmado') }} />
                                Confirmado
                            </span>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="inline-block w-3 h-3 shrink-0 rounded-full" style={{ background: mesaFillForEstado('en_proceso_atencion') }} />
                                En atención
                            </span>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="inline-block w-3 h-3 shrink-0 rounded-full" style={{ background: mesaFillForEstado('atendido') }} />
                                Atendido
                            </span>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="inline-block w-3 h-3 shrink-0 rounded-full" style={{ background: mesaFillForEstado('finalizado') }} />
                                Finalizado
                            </span>
                            <span className="flex items-center gap-2 min-w-0">
                                <span className="inline-block w-3 h-3 shrink-0 rounded-full" style={{ background: mesaFillForEstado('cancelado') }} />
                                Cancelado
                            </span>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
};

export default SisaReservasPlanoPage;
