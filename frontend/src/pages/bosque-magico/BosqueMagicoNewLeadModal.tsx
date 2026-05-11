import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
    BOSQUE_MAGICO_CHANNELS,
    BOSQUE_MAGICO_LEAD_STATUS,
    bosqueMagicoChannelLabel,
} from '@/constants/bosqueMagico';
import { useAuth } from '@/context/AuthContext';
import { bosqueMagicoService } from '@/services/bosqueMagicoService';

export type BosqueMagicoNewLeadModalProps = {
    open: boolean;
    onClose: () => void;
};

const BosqueMagicoNewLeadModal: React.FC<BosqueMagicoNewLeadModalProps> = ({ open, onClose }) => {
    const { token } = useAuth();
    const qc = useQueryClient();
    const [contactName, setContactName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [channel, setChannel] = useState('manual');
    const [sourceDetail, setSourceDetail] = useState('');
    const [status, setStatus] = useState('Nuevo');
    const [notes, setNotes] = useState('');

    const mutation = useMutation({
        mutationFn: () =>
            bosqueMagicoService.createLeadManual(token!, {
                contact_name: contactName.trim(),
                phone: phone.trim(),
                email: email.trim() || null,
                channel: channel || 'manual',
                source_detail: sourceDetail.trim() || null,
                status,
                notes: notes.trim() || null,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bosque-magico-leads'] });
            onClose();
            setContactName('');
            setPhone('');
            setEmail('');
            setChannel('manual');
            setSourceDetail('');
            setStatus('Nuevo');
            setNotes('');
        },
    });

    if (!open) return null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!contactName.trim() || !phone.trim()) return;
        mutation.mutate();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="bm-new-lead-title"
                className="relative z-10 w-full max-w-md rounded-2xl border border-app-border bg-app-modal-solid p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 id="bm-new-lead-title" className="text-xs font-black uppercase tracking-widest text-app-text">
                        Nuevo lead
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={submit} className="space-y-3 text-sm">
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Contacto *</span>
                        <input
                            required
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Teléfono *</span>
                        <input
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text font-mono text-xs"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Correo</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Canal</span>
                        <select
                            value={channel}
                            onChange={(e) => setChannel(e.target.value)}
                            className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text"
                        >
                            {BOSQUE_MAGICO_CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                    {bosqueMagicoChannelLabel(c)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Detalle origen</span>
                        <input
                            value={sourceDetail}
                            onChange={(e) => setSourceDetail(e.target.value)}
                            placeholder="Ej. llamada entrante, feria…"
                            className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Estado inicial</span>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text"
                        >
                            {BOSQUE_MAGICO_LEAD_STATUS.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Notas</span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text"
                        />
                    </label>
                    {mutation.isError && <p className="text-sm text-app-danger">No se pudo crear el lead. Verifique permisos.</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl border border-app-border text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={mutation.isPending}
                            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                            style={{ backgroundColor: 'var(--app-bosque-magico-accent-strong)' }}
                        >
                            {mutation.isPending ? 'Guardando…' : 'Crear lead'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default BosqueMagicoNewLeadModal;
