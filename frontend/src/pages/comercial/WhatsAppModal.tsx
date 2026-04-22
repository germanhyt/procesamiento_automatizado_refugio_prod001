import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { comercialService } from '@/services/comercialService';
import type { ComercialEvento, ComercialReserva } from '@/services/comercialService';

export type WhatsAppModalProps = {
    open: boolean;
    onClose: () => void;
    token: string;
    kind: 'reserva' | 'evento';
    record: ComercialReserva | ComercialEvento | null;
    defaultMessage: string;
};

const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ open, onClose, token, kind, record, defaultMessage }) => {
    const [message, setMessage] = useState(defaultMessage);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) setMessage(defaultMessage);
    }, [open, defaultMessage]);

    if (!open || !record) return null;

    const celular = record.celular;

    const openWa = async () => {
        setLoading(true);
        try {
            const { wa_url } = await comercialService.whatsappSend(token, celular, message);
            window.open(wa_url, '_blank', 'noopener,noreferrer');
            onClose();
        } catch (e) {
            console.error(e);
            const digits = celular.replace(/\D/g, '');
            const phone = digits.length === 9 ? `51${digits}` : digits;
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
                        <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                            <MessageCircle size={22} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-tight">WhatsApp</h2>
                            <p className="text-[10px] text-app-muted font-mono">{record.nombres}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={20} />
                    </button>
                </div>

                <p className="text-[10px] font-mono text-app-muted mb-2">
                    {kind === 'reserva' ? 'Reserva' : 'Evento'} · {celular}
                </p>

                <label className="text-[10px] font-black uppercase tracking-widest text-app-muted block mb-2">Mensaje</label>
                <textarea
                    className="w-full min-h-[160px] rounded-xl border border-app-border bg-app-input px-4 py-3 text-sm text-app-text outline-none focus:ring-2 focus:ring-teal-500/40 mb-6"
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
                        className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-teal-500 text-black disabled:opacity-40"
                    >
                        {loading ? 'Abriendo…' : 'Abrir WhatsApp'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default WhatsAppModal;
