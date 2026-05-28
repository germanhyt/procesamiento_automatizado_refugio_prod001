import React, { useEffect, useState } from 'react';

import AppSelect from '@/components/ui/AppSelect';
import {
    AGENDA_MODO_DAY,
    AGENDA_MODO_OPTIONS,
    AGENDA_MODO_WEEK,
    type AgendaModo,
    weekMonday,
    weekSundayFromMonday,
} from '@/constants/agendaDeportiva';
import type { AgendaProgramacionCreatePayload } from '@/services/agendaDeportivaService';

type Props = {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: AgendaProgramacionCreatePayload) => Promise<void>;
    busy?: boolean;
};

const inputCls =
    'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';

const AgendaProgramacionFormModal: React.FC<Props> = ({ open, onClose, onSubmit, busy }) => {
    const [titulo, setTitulo] = useState('');
    const [modo, setModo] = useState<AgendaModo>(AGENDA_MODO_WEEK);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');

    useEffect(() => {
        if (!open) return;
        const today = new Date().toISOString().slice(0, 10);
        const monday = weekMonday(today);
        setTitulo('');
        setModo(AGENDA_MODO_WEEK);
        setFechaInicio(monday);
        setFechaFin(weekSundayFromMonday(monday));
    }, [open]);

    const handleModoChange = (value: AgendaModo) => {
        setModo(value);
        if (value === AGENDA_MODO_DAY) {
            const day = fechaInicio || new Date().toISOString().slice(0, 10);
            setFechaInicio(day);
            setFechaFin(day);
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
            modo,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            activa: true,
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
                    Nueva programación
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
                            {modo === AGENDA_MODO_DAY ? 'Fecha' : 'Lunes (inicio semana)'}
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
                            {busy ? 'Guardando…' : 'Crear'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AgendaProgramacionFormModal;
