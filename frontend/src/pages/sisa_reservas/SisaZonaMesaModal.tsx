import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';

import {
    createSisaMesa,
    createSisaZona,
    deleteSisaMesa,
    deleteSisaZona,
    listSisaMesas,
    listSisaZonas,
    updateSisaMesa,
    updateSisaZona,
} from '@/services/sisaReservasService';
import type { SisaMesa, SisaZona } from '@/services/sisaReservasService';
import { sisaAxiosDetail, sisaSwalError, sisaSwalSuccess } from '@/pages/sisa_reservas/sisaReservasSwal';

const EMPTY_SISA_ZONAS_MODAL: SisaZona[] = [];

const DEFAULT_ZONA_W = 200;
const DEFAULT_ZONA_H = 120;

/** Evita que zonas nuevas queden todas en (0,0): se colocan en fila o bajan a la siguiente. */
function computeNextZonaPlacement(zonas: SisaZona[]): {
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
} {
    const GAP = 32;
    const WRAP_AT = 920;
    if (!zonas.length) {
        return { pos_x: 0, pos_y: 0, width: DEFAULT_ZONA_W, height: DEFAULT_ZONA_H };
    }
    let maxRight = 0;
    let maxBottom = 0;
    let minTop = Infinity;
    for (const z of zonas) {
        const w = z.width > 0 ? z.width : DEFAULT_ZONA_W;
        const h = z.height > 0 ? z.height : DEFAULT_ZONA_H;
        maxRight = Math.max(maxRight, z.pos_x + w);
        maxBottom = Math.max(maxBottom, z.pos_y + h);
        minTop = Math.min(minTop, z.pos_y);
    }
    const topAligned = Number.isFinite(minTop) ? minTop : 0;
    const nextX = maxRight + GAP;
    if (nextX + DEFAULT_ZONA_W <= WRAP_AT) {
        return { pos_x: nextX, pos_y: topAligned, width: DEFAULT_ZONA_W, height: DEFAULT_ZONA_H };
    }
    return { pos_x: 0, pos_y: maxBottom + GAP, width: DEFAULT_ZONA_W, height: DEFAULT_ZONA_H };
}

export type SisaZonaMesaModalProps = {
    open: boolean;
    onClose: () => void;
    token: string;
};

const SisaZonaMesaModal: React.FC<SisaZonaMesaModalProps> = ({ open, onClose, token }) => {
    const qc = useQueryClient();
    const [selectedZonaId, setSelectedZonaId] = useState<number | null>(null);

    const { data: zonasData, isLoading: loadingZonas } = useQuery({
        queryKey: ['sisa-zonas'],
        queryFn: () => listSisaZonas(token),
        enabled: open && !!token,
    });
    const zonas = zonasData ?? EMPTY_SISA_ZONAS_MODAL;

    const { data: mesas = [], isLoading: loadingMesas } = useQuery({
        queryKey: ['sisa-mesas', selectedZonaId],
        queryFn: () => listSisaMesas(token, selectedZonaId!),
        enabled: open && !!token && selectedZonaId != null,
    });

    useEffect(() => {
        if (!open) return;
        if (zonas.length && selectedZonaId == null) {
            setSelectedZonaId(zonas[0].id);
        }
        if (selectedZonaId != null && !zonas.some((z) => z.id === selectedZonaId)) {
            setSelectedZonaId(zonas[0]?.id ?? null);
        }
    }, [open, zonas, selectedZonaId]);

    const invalidateZonas = () => void qc.invalidateQueries({ queryKey: ['sisa-zonas'] });
    const invalidateMesas = () => void qc.invalidateQueries({ queryKey: ['sisa-mesas', selectedZonaId] });

    const createZonaMut = useMutation({
        mutationFn: (placement: ReturnType<typeof computeNextZonaPlacement>) =>
            createSisaZona(token, {
                nombre: `Zona ${zonas.length + 1}`,
                color: '#288248',
                ...placement,
                sort_order: zonas.length,
            }),
        onSuccess: () => {
            invalidateZonas();
            void sisaSwalSuccess('Zona creada');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const deleteZonaMut = useMutation({
        mutationFn: (id: number) => deleteSisaZona(token, id),
        onSuccess: () => {
            invalidateZonas();
            setSelectedZonaId(null);
            void sisaSwalSuccess('Zona eliminada');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const createMesaMut = useMutation({
        mutationFn: () =>
            createSisaMesa(token, {
                zona_id: selectedZonaId!,
                numero: String((mesas?.length ?? 0) + 1),
                pos_x: 0,
                pos_y: 0,
                capacidad: 4,
                is_active: true,
            }),
        onSuccess: () => {
            invalidateMesas();
            void sisaSwalSuccess('Mesa creada');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const deleteMesaMut = useMutation({
        mutationFn: (id: number) => deleteSisaMesa(token, id),
        onSuccess: () => {
            invalidateMesas();
            void sisaSwalSuccess('Mesa eliminada');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const [editZona, setEditZona] = useState<SisaZona | null>(null);
    const [editMesa, setEditMesa] = useState<SisaMesa | null>(null);

    if (!open) return null;

    const selectedZona = zonas.find((z) => z.id === selectedZonaId) ?? null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 w-full max-w-3xl max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl border border-app-border bg-app-modal-solid p-6 shadow-2xl my-6 min-h-0 overflow-y-auto"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-tight text-[var(--app-sisa-reservas-accent)]">
                        Zonas y mesas
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={20} />
                    </button>
                </div>

                <div className="grid md:grid-cols-2 gap-4 shrink-0">
                    <div className="rounded-xl border border-app-border p-3 space-y-2" style={{ backgroundColor: 'var(--app-surface)' }}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase text-app-muted">Zonas</span>
                            <button
                                type="button"
                                disabled={createZonaMut.isPending}
                                onClick={() => createZonaMut.mutate(computeNextZonaPlacement(zonas))}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase text-white disabled:opacity-40"
                                style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                            >
                                <Plus size={14} /> Nueva
                            </button>
                        </div>
                        {loadingZonas ? (
                            <p className="text-xs text-app-muted">Cargando…</p>
                        ) : (
                            <ul className="space-y-1 max-h-48 overflow-y-auto">
                                {zonas.map((z) => (
                                    <li key={z.id}>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedZonaId(z.id)}
                                                className={`flex-1 text-left rounded-lg px-2 py-2 text-[10px] font-bold uppercase border ${
                                                    selectedZonaId === z.id
                                                        ? 'border-[var(--app-sisa-reservas-accent-muted)] bg-[var(--app-sisa-reservas-accent-muted-bg)]'
                                                        : 'border-transparent hover:bg-app-card-hover'
                                                }`}
                                            >
                                                {z.nombre}
                                            </button>
                                            <button
                                                type="button"
                                                title="Editar"
                                                className="p-1.5 rounded-lg text-app-muted hover:bg-app-card-hover"
                                                onClick={() => setEditZona(z)}
                                            >
                                                ✎
                                            </button>
                                            <button
                                                type="button"
                                                title="Eliminar"
                                                className="p-1.5 rounded-lg text-app-danger hover:bg-app-danger-muted"
                                                onClick={async () => {
                                                    const ok = await Swal.fire({
                                                        title: '¿Eliminar zona y sus mesas?',
                                                        icon: 'warning',
                                                        showCancelButton: true,
                                                        confirmButtonColor: 'var(--app-danger)',
                                                        background: 'var(--app-panel)',
                                                        color: 'var(--app-text)',
                                                    });
                                                    if (ok.isConfirmed) deleteZonaMut.mutate(z.id);
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="rounded-xl border border-app-border p-3 space-y-2" style={{ backgroundColor: 'var(--app-surface)' }}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase text-app-muted">
                                Mesas {selectedZona ? `· ${selectedZona.nombre}` : ''}
                            </span>
                            <button
                                type="button"
                                disabled={selectedZonaId == null || createMesaMut.isPending}
                                onClick={() => createMesaMut.mutate()}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase text-white disabled:opacity-40"
                                style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                            >
                                <Plus size={14} /> Nueva
                            </button>
                        </div>
                        {selectedZonaId == null ? (
                            <p className="text-xs text-app-muted">Seleccione una zona.</p>
                        ) : loadingMesas ? (
                            <p className="text-xs text-app-muted">Cargando…</p>
                        ) : (
                            <ul className="space-y-1 max-h-48 overflow-y-auto">
                                {mesas.map((m) => (
                                    <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-app-border px-2 py-1.5">
                                        <span className="text-[10px] font-mono">
                                            #{m.numero}
                                            {m.capacidad != null ? ` · hasta ${m.capacidad} pers.` : ''}{' '}
                                            {!m.is_active ? '(inactiva)' : ''}
                                        </span>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                className="p-1 text-app-muted hover:bg-app-card-hover rounded"
                                                onClick={() => setEditMesa(m)}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="p-1 text-app-danger hover:bg-app-danger-muted rounded"
                                                onClick={async () => {
                                                    const ok = await Swal.fire({
                                                        title: '¿Eliminar mesa?',
                                                        icon: 'warning',
                                                        showCancelButton: true,
                                                        background: 'var(--app-panel)',
                                                        color: 'var(--app-text)',
                                                    });
                                                    if (ok.isConfirmed) deleteMesaMut.mutate(m.id);
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {(editZona || editMesa) && (
                    <div
                        className="mt-4 rounded-xl border border-app-border p-4 space-y-4 max-h-[min(48vh,380px)] overflow-y-auto overflow-x-hidden overscroll-contain"
                        style={{ backgroundColor: 'var(--app-input-bg)' }}
                    >
                        {editZona && (
                            <ZonaInlineEditor
                                token={token}
                                z={editZona}
                                onCancel={() => setEditZona(null)}
                                onSaved={() => {
                                    setEditZona(null);
                                    invalidateZonas();
                                }}
                            />
                        )}
                        {editMesa && (
                            <div className={editZona ? 'pt-4 border-t border-app-border' : ''}>
                                <MesaInlineEditor
                                    token={token}
                                    m={editMesa}
                                    onCancel={() => setEditMesa(null)}
                                    onSaved={() => {
                                        setEditMesa(null);
                                        invalidateMesas();
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* <p className="mt-3 text-[9px] text-app-muted leading-relaxed">
                    Las zonas nuevas se colocan automáticamente en el plano para no superponerse. Ajuste posición y tamaño
                    aquí o en <strong className="text-app-text">Reservas Sisa → Plano</strong> con «Mover zonas». Las mesas se
                    mueven dentro de su zona; al mover la zona, sus mesas la siguen.
                </p> */}
            </motion.div>
        </div>
    );
};

function ZonaInlineEditor({
    token,
    z,
    onCancel,
    onSaved,
}: {
    token: string;
    z: SisaZona;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [nombre, setNombre] = useState(z.nombre);
    const [color, setColor] = useState(z.color ?? '#288248');
    const [sortOrder, setSortOrder] = useState(z.sort_order);
    const [posX, setPosX] = useState(z.pos_x);
    const [posY, setPosY] = useState(z.pos_y);
    const [w, setW] = useState(z.width);
    const [h, setH] = useState(z.height);
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            await updateSisaZona(token, z.id, {
                nombre,
                color,
                sort_order: sortOrder,
                pos_x: posX,
                pos_y: posY,
                width: w,
                height: h,
            });
            await sisaSwalSuccess('Zona actualizada');
            onSaved();
        } catch (e) {
            await sisaSwalError(sisaAxiosDetail(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Editar zona</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Nombre</span>
                    <input
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        autoComplete="off"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Color del borde</span>
                    <input type="color" className="h-9 w-full rounded-lg border border-app-border cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Orden en lista</span>
                    <input
                        type="number"
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(Number(e.target.value))}
                    />
                </label>
                <p className="sm:col-span-2 text-[9px] text-app-muted -mt-1">
                    Plano (unidades SVG, origen arriba-izquierda del lienzo del plano):
                </p>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Posición X</span>
                    <input
                        type="number"
                        step="1"
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs font-mono"
                        value={posX}
                        onChange={(e) => setPosX(Number(e.target.value))}
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Posición Y</span>
                    <input
                        type="number"
                        step="1"
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs font-mono"
                        value={posY}
                        onChange={(e) => setPosY(Number(e.target.value))}
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Ancho</span>
                    <input
                        type="number"
                        min={40}
                        step="1"
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs font-mono"
                        value={w}
                        onChange={(e) => setW(Number(e.target.value))}
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Alto</span>
                    <input
                        type="number"
                        min={40}
                        step="1"
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs font-mono"
                        value={h}
                        onChange={(e) => setH(Number(e.target.value))}
                    />
                </label>
            </div>
            <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={onCancel} className="text-[10px] uppercase font-black text-app-muted px-3 py-1">
                    Cerrar
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="text-[10px] uppercase font-black text-white px-3 py-1 rounded-lg disabled:opacity-40"
                    style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                >
                    Guardar zona
                </button>
            </div>
        </div>
    );
}

function MesaInlineEditor({
    token,
    m,
    onCancel,
    onSaved,
}: {
    token: string;
    m: SisaMesa;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [numero, setNumero] = useState(m.numero);
    const [cap, setCap] = useState(m.capacidad ?? 4);
    const [active, setActive] = useState(m.is_active);
    const [px, setPx] = useState(m.pos_x);
    const [py, setPy] = useState(m.pos_y);
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            await updateSisaMesa(token, m.id, {
                numero,
                capacidad: cap,
                is_active: active,
                pos_x: px,
                pos_y: py,
            });
            await sisaSwalSuccess('Mesa actualizada');
            onSaved();
        } catch (e) {
            await sisaSwalError(sisaAxiosDetail(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Editar mesa</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Número / nombre</span>
                    <input
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        autoComplete="off"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Capacidad (personas)</span>
                    <input
                        type="number"
                        min={1}
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs"
                        value={cap}
                        onChange={(e) => setCap(Number(e.target.value))}
                    />
                </label>
                <p className="sm:col-span-2 text-[9px] text-app-muted -mt-1">
                    Capacidad = máximo de comensales en la mesa (no es el tamaño de una reserva concreta).
                </p>
                <label className="flex items-center gap-2 text-[10px] sm:col-span-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-app-border" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Mesa activa (visible en reservas)</span>
                </label>
                <p className="sm:col-span-2 text-[9px] text-app-muted">Posición dentro de la zona (plano):</p>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Desplazamiento X</span>
                    <input
                        type="number"
                        step="1"
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs font-mono"
                        value={px}
                        onChange={(e) => setPx(Number(e.target.value))}
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted">Desplazamiento Y</span>
                    <input
                        type="number"
                        step="1"
                        className="rounded-lg border border-app-border bg-app-input px-2 py-1.5 text-xs font-mono"
                        value={py}
                        onChange={(e) => setPy(Number(e.target.value))}
                    />
                </label>
            </div>
            <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={onCancel} className="text-[10px] uppercase font-black text-app-muted px-3 py-1">
                    Cerrar
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="text-[10px] uppercase font-black text-white px-3 py-1 rounded-lg disabled:opacity-40"
                    style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                >
                    Guardar mesa
                </button>
            </div>
        </div>
    );
}

export default SisaZonaMesaModal;
