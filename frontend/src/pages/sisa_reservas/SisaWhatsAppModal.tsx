import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';

import { sisaWhatsappSend } from '@/services/sisaReservasService';
import type { SisaReservaRegistro } from '@/services/sisaReservasService';

export type SisaWhatsAppModalProps = {
    open: boolean;
    onClose: () => void;
    token: string;
    record: SisaReservaRegistro | null;
    defaultMessage: string;
};

const SisaWhatsAppModal: React.FC<SisaWhatsAppModalProps> = ({ open, onClose, token, record, defaultMessage }) => {
    const [message, setMessage] = useState(defaultMessage);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) setMessage(defaultMessage);
    }, [open, defaultMessage]);

    if (!open || !record) return null;

    const openWa = async () => {
        setLoading(true);
        try {
            const { wa_url } = await sisaWhatsappSend(token, record.codigo_telefonico, record.numero_telefono, message);
            window.open(wa_url, '_blank', 'noopener,noreferrer');
            onClose();
        } catch (e) {
            console.error(e);
            const cc = record.codigo_telefonico.replace(/\D/g, '');
            const nd = record.numero_telefono.replace(/\D/g, '');
            const phone = cc + nd;
            const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
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
                className="relative z-10 w-full max-w-lg rounded-2xl border border-app-border bg-app-modal-solid p-6 shadow-2xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="p-2 rounded-xl text-[var(--app-sisa-reservas-accent)]"
                            style={{ backgroundColor: 'var(--app-sisa-reservas-accent-muted-bg)' }}
                        >
                            <MessageCircle size={22} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-tight">WhatsApp</h2>
                            <p className="text-[10px] text-app-muted font-mono">{record.nombre_completo}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={20} />
                    </button>
                </div>

                <p className="text-[10px] font-mono text-app-muted mb-2">
                    {record.codigo_telefonico} {record.numero_telefono}
                </p>

                <label className="text-[10px] font-black uppercase tracking-widest text-app-muted block mb-2">Mensaje</label>
                <textarea
                    className="w-full min-h-[160px] rounded-xl border border-app-border bg-app-input px-4 py-3 text-sm text-app-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 mb-6"
                    style={
                        {
                            ['--tw-outline-color' as string]: 'var(--app-sisa-reservas-accent-muted)',
                        } as React.CSSProperties
                    }
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                />

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover"
                    >
                        Cerrar
                    </button>
                    <button
                        type="button"
                        disabled={loading || !message.trim()}
                        onClick={() => void openWa()}
                        className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40 hover:opacity-95"
                        style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                    >
                        {loading ? 'Abriendo…' : 'Abrir WhatsApp'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SisaWhatsAppModal;
