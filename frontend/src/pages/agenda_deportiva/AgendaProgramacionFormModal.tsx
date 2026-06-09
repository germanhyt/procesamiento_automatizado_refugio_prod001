import React, { useEffect, useState } from 'react';

import AppSelect from '@/components/ui/AppSelect';
import {
    AGENDA_CATEGORIA_LUGAR_OPTIONS,
    AGENDA_CATEGORIA_LUGAR_PLAY_BAR,
    AGENDA_MODO_DAY,
    AGENDA_MODO_MONTH,
    AGENDA_MODO_OPTIONS,
    AGENDA_MODO_WEEK,
    monthEndFromStart,
    monthStart,
    type AgendaCategoriaLugar,
    type AgendaModo,
    weekMonday,
    weekSundayFromMonday,
} from '@/constants/agendaDeportiva';
import type { AgendaProgramacionCreatePayload } from '@/services/agendaDeportivaService';

type AgendaProgramacionFormInitialData = {
    titulo?: string | null;
    categoria_lugar?: AgendaCategoriaLugar;
    modo?: AgendaModo;
    fecha_inicio?: string;
    fecha_fin?: string;
    activa?: boolean;
};

type Props = {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: AgendaProgramacionCreatePayload) => Promise<void>;
    busy?: boolean;
    initialData?: AgendaProgramacionFormInitialData | null;
    title?: string;
    submitLabel?: string;
};

const inputCls =
    'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';

const AgendaProgramacionFormModal: React.FC<Props> = ({
    open,
    onClose,
    onSubmit,
    busy,
    initialData,
    title = 'Nueva programación',
    submitLabel = 'Crear',
}) => {
    const [titulo, setTitulo] = useState('');
    const [categoriaLugar, setCategoriaLugar] = useState<AgendaCategoriaLugar>(AGENDA_CATEGORIA_LUGAR_PLAY_BAR);
    const [modo, setModo] = useState<AgendaModo>(AGENDA_MODO_WEEK);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');

    useEffect(() => {
        if (!open) return;
        if (initialData) {
            setTitulo(initialData.titulo ?? '');
            setCategoriaLugar(initialData.categoria_lugar ?? AGENDA_CATEGORIA_LUGAR_PLAY_BAR);
            setModo(initialData.modo ?? AGENDA_MODO_WEEK);
            setFechaInicio(initialData.fecha_inicio ?? '');
            setFechaFin(initialData.fecha_fin ?? initialData.fecha_inicio ?? '');
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const monday = weekMonday(today);
        setTitulo('');
        setCategoriaLugar(AGENDA_CATEGORIA_LUGAR_PLAY_BAR);
        setModo(AGENDA_MODO_WEEK);
        setFechaInicio(monday);
        setFechaFin(weekSundayFromMonday(monday));
    }, [open, initialData]);

    const handleModoChange = (value: AgendaModo) => {
        setModo(value);
        if (value === AGENDA_MODO_DAY) {
            const day = fechaInicio || new Date().toISOString().slice(0, 10);
            setFechaInicio(day);
            setFechaFin(day);
        } else if (value === AGENDA_MODO_MONTH) {
            const start = monthStart(fechaInicio || new Date().toISOString().slice(0, 10));
            setFechaInicio(start);
            setFechaFin(monthEndFromStart(start));
        } else {
            const monday = weekMonday(fechaInicio || new Date().toISOString().slice(0, 10));
            setFechaInicio(monday);
            setFechaFin(weekSundayFromMonday(monday));
        }
    };

    const handleFechaChange = (value: string) => {
        if (modo === AGENDA_MODO_DAY) {
            setFechaInicio(value);
            setFechaFin(value);
            return;
        }
        if (modo === AGENDA_MODO_MONTH) {
            const start = monthStart(value);
            setFechaInicio(start);
            setFechaFin(monthEndFromStart(start));
            return;
        }
        const monday = weekMonday(value);
        setFechaInicio(monday);
        setFechaFin(weekSundayFromMonday(monday));
    };

    if (!open) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fechaInicio || !fechaFin) return;
        await onSubmit({
            titulo: titulo.trim() || undefined,
            categoria_lugar: categoriaLugar,
            modo,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            activa: initialData?.activa ?? true,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div
                className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5"
                style={{ backgroundColor: 'var(--app-modal-solid)', borderColor: 'var(--app-border)' }}
            >
                <h2
                    className="text-sm font-black uppercase tracking-tight"
                    style={{ color: 'var(--app-agenda-accent)' }}
                >
                    {title}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Título</span>
                        <input
                            className={inputCls}
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="Ej. Semana 22 — Mayo"
                        />
                    </label>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Modo</span>
                        <AppSelect<AgendaModo>
                            options={AGENDA_MODO_OPTIONS}
                            value={AGENDA_MODO_OPTIONS.find((o) => o.value === modo) ?? AGENDA_MODO_OPTIONS[0]}
                            onChange={(option) => handleModoChange(option?.value ?? AGENDA_MODO_WEEK)}
                            isSearchable={false}
                        />
                    </label>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                            Categoría lugar
                        </span>
                        <AppSelect<AgendaCategoriaLugar>
                            options={AGENDA_CATEGORIA_LUGAR_OPTIONS}
                            value={
                                AGENDA_CATEGORIA_LUGAR_OPTIONS.find((o) => o.value === categoriaLugar) ??
                                AGENDA_CATEGORIA_LUGAR_OPTIONS[0]
                            }
                            onChange={(option) => setCategoriaLugar(option?.value ?? AGENDA_CATEGORIA_LUGAR_PLAY_BAR)}
                            isSearchable={false}
                        />
                    </label>
                    <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                            {modo === AGENDA_MODO_DAY
                                ? 'Fecha'
                                : modo === AGENDA_MODO_MONTH
                                  ? 'Mes de referencia'
                                  : 'Lunes (inicio semana)'}
                        </span>
                        <input
                            type="date"
                            className={inputCls}
                            value={fechaInicio}
                            onChange={(e) => handleFechaChange(e.target.value)}
                            required
                        />
                    </label>
                    {modo === AGENDA_MODO_WEEK && (
                        <p className="text-xs text-app-muted">
                            Rango: {fechaInicio} → {fechaFin} (7 días)
                        </p>
                    )}
                    {modo === AGENDA_MODO_MONTH && (
                        <p className="text-xs text-app-muted">
                            Rango: {fechaInicio} → {fechaFin} (mes completo)
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="rounded-xl border border-app-border px-4 py-2 text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover disabled:opacity-40"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={busy || !fechaInicio || !fechaFin}
                            className="rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40"
                            style={{ backgroundColor: 'var(--app-agenda-accent)' }}
                        >
                            {busy ? 'Guardando…' : submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AgendaProgramacionFormModal;
