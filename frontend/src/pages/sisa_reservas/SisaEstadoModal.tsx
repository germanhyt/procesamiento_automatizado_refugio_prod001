import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

import { SISA_ESTADOS_RESERVA, sisaEstadoBadgeClass, sisaEstadoLabel, type SisaEstadoReserva } from '@/constants/sisaReservas';

export type SisaEstadoModalProps = {
    open: boolean;
    onClose: () => void;
    current: SisaEstadoReserva;
    onPick: (e: SisaEstadoReserva) => void;
    disabled?: boolean;
};

const SisaEstadoModal: React.FC<SisaEstadoModalProps> = ({ open, onClose, current, onPick, disabled }) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 w-full max-w-sm rounded-2xl border border-app-border bg-app-modal-solid p-5 shadow-2xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-black uppercase tracking-widest text-app-text">Cambiar estado</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={18} />
                    </button>
                </div>
                <p className="text-[10px] text-app-muted mb-3">
                    Actual: <span className={sisaEstadoBadgeClass(current)}>{sisaEstadoLabel(current)}</span>
                </p>
                <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {SISA_ESTADOS_RESERVA.map((e) => (
                        <li key={e}>
                            <button
                                type="button"
                                disabled={disabled || e === current}
                                onClick={() => {
                                    onPick(e);
                                    onClose();
                                }}
                                className={`w-full text-left rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-wide transition-colors disabled:opacity-40 ${
                                    e === current
                                        ? 'border-[var(--app-sisa-reservas-accent-muted)] bg-[var(--app-sisa-reservas-accent-muted-bg)]'
                                        : 'border-app-border hover:bg-app-card-hover'
                                }`}
                            >
                                <span className={sisaEstadoBadgeClass(e)}>{sisaEstadoLabel(e)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </motion.div>
        </div>
    );
};

export default SisaEstadoModal;
