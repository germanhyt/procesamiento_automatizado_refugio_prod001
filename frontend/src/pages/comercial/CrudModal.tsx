import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { COMERCIAL_ESTADOS, TIPOS_EVENTO } from '@/constants/comercial';
import type { ComercialEstado, ComercialEvento, ComercialReserva } from '@/services/comercialService';

export type CrudMode = 'create' | 'edit';

export type CrudModalProps = {
    open: boolean;
    onClose: () => void;
    kind: 'reserva' | 'evento';
    mode: CrudMode;
    initialReserva?: ComercialReserva | null;
    initialEvento?: ComercialEvento | null;
    canSubmit: boolean;
    onSaveReserva: (payload: Omit<ComercialReserva, 'id' | 'fecha_creacion' | 'created_at' | 'updated_at'>) => Promise<void>;
    onSaveEvento: (payload: Omit<ComercialEvento, 'id' | 'fecha_creacion' | 'created_at' | 'updated_at'>) => Promise<void>;
};

const inputClass =
    'w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/40 transition-colors';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-app-muted block mb-2';

const CrudModal: React.FC<CrudModalProps> = ({
    open,
    onClose,
    kind,
    mode,
    initialReserva,
    initialEvento,
    canSubmit,
    onSaveReserva,
    onSaveEvento,
}) => {
    const [loading, setLoading] = useState(false);
    const [rNombres, setRNombres] = useState('');
    const [rCel, setRCel] = useState('');
    const [rPersonas, setRPersonas] = useState(2);
    const [rFecha, setRFecha] = useState('');
    const [rHora, setRHora] = useState('');
    const [rEstado, setREstado] = useState<ComercialEstado>('pendiente');

    const [eNombres, setENombres] = useState('');
    const [eRazon, setERazon] = useState('');
    const [eCel, setECel] = useState('');
    const [eTipo, setETipo] = useState<string>('Social');
    const [ePersonas, setEPersonas] = useState(10);
    const [eFecha, setEFecha] = useState('');
    const [eEstado, setEEstado] = useState<ComercialEstado>('pendiente');

    useEffect(() => {
        if (!open) return;
        if (kind === 'reserva') {
            if (mode === 'edit' && initialReserva) {
                setRNombres(initialReserva.nombres);
                setRCel(initialReserva.celular);
                setRPersonas(initialReserva.cantidad_personas);
                setRFecha(initialReserva.fecha_reserva);
                setRHora(initialReserva.hora_reserva);
                setREstado(initialReserva.estado);
            } else {
                setRNombres('');
                setRCel('');
                setRPersonas(2);
                setRFecha('');
                setRHora('');
                setREstado('pendiente');
            }
        } else {
            if (mode === 'edit' && initialEvento) {
                setENombres(initialEvento.nombres);
                setERazon(initialEvento.razon_social ?? '');
                setECel(initialEvento.celular);
                setETipo(initialEvento.tipo_evento);
                setEPersonas(initialEvento.cantidad_personas);
                setEFecha(initialEvento.fecha_tentativa);
                setEEstado(initialEvento.estado);
            } else {
                setENombres('');
                setERazon('');
                setECel('');
                setETipo('Social');
                setEPersonas(10);
                setEFecha('');
                setEEstado('pendiente');
            }
        }
    }, [open, kind, mode, initialReserva, initialEvento]);

    if (!open) return null;

    const title =
        kind === 'reserva'
            ? mode === 'create'
                ? 'Nueva reserva'
                : 'Editar reserva'
            : mode === 'create'
              ? 'Nuevo evento'
              : 'Editar evento';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        try {
            if (kind === 'reserva') {
                await onSaveReserva({
                    nombres: rNombres.trim(),
                    celular: rCel.trim(),
                    cantidad_personas: rPersonas,
                    fecha_reserva: rFecha.trim(),
                    hora_reserva: rHora.trim(),
                    estado: rEstado,
                });
            } else {
                await onSaveEvento({
                    nombres: eNombres.trim(),
                    razon_social: eRazon.trim() || null,
                    celular: eCel.trim(),
                    tipo_evento: eTipo,
                    cantidad_personas: ePersonas,
                    fecha_tentativa: eFecha.trim(),
                    estado: eEstado,
                });
            }
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 w-full max-w-lg rounded-2xl border p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
                style={{ backgroundColor: 'var(--app-panel)', borderColor: 'var(--app-border)' }}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-black uppercase tracking-tight">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl text-app-muted hover:text-app-text hover:bg-app-card-hover"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {kind === 'reserva' ? (
                        <>
                            <div>
                                <label className={labelClass}>Nombres</label>
                                <input
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={rNombres}
                                    onChange={(ev) => setRNombres(ev.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Celular</label>
                                <input
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={rCel}
                                    onChange={(ev) => setRCel(ev.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Cantidad personas</label>
                                <input
                                    type="number"
                                    min={1}
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={rPersonas}
                                    onChange={(ev) => setRPersonas(parseInt(ev.target.value, 10) || 1)}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Fecha (DD/MM/YYYY)</label>
                                    <input
                                        className={inputClass}
                                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                        value={rFecha}
                                        onChange={(ev) => setRFecha(ev.target.value)}
                                        placeholder="15/04/2026"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Hora</label>
                                    <input
                                        className={inputClass}
                                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                        value={rHora}
                                        onChange={(ev) => setRHora(ev.target.value)}
                                        placeholder="20:00"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Estado</label>
                                <select
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={rEstado}
                                    onChange={(ev) => setREstado(ev.target.value as ComercialEstado)}
                                >
                                    {COMERCIAL_ESTADOS.map((st) => (
                                        <option key={st} value={st}>
                                            {st}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className={labelClass}>Nombres</label>
                                <input
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={eNombres}
                                    onChange={(ev) => setENombres(ev.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Razón social (opcional)</label>
                                <input
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={eRazon}
                                    onChange={(ev) => setERazon(ev.target.value)}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Celular</label>
                                <input
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={eCel}
                                    onChange={(ev) => setECel(ev.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Tipo de evento</label>
                                <select
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={eTipo}
                                    onChange={(ev) => setETipo(ev.target.value)}
                                >
                                    {TIPOS_EVENTO.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Cantidad personas</label>
                                <input
                                    type="number"
                                    min={1}
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={ePersonas}
                                    onChange={(ev) => setEPersonas(parseInt(ev.target.value, 10) || 1)}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Fecha tentativa (DD/MM/YYYY)</label>
                                <input
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={eFecha}
                                    onChange={(ev) => setEFecha(ev.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Estado</label>
                                <select
                                    className={inputClass}
                                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                                    value={eEstado}
                                    onChange={(ev) => setEEstado(ev.target.value as ComercialEstado)}
                                >
                                    {COMERCIAL_ESTADOS.map((st) => (
                                        <option key={st} value={st}>
                                            {st}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!canSubmit || loading}
                            className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-teal-500 text-black disabled:opacity-40"
                        >
                            {loading ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default CrudModal;
