import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { bosqueMagicoEstadoBadgeClass, bosqueMagicoEstadoBadgeInnerStyle } from '@/constants/bosqueMagico';
import { useAuth } from '@/context/AuthContext';
import { bosqueMagicoService } from '@/services/bosqueMagicoService';

import {
    BosqueMagicoLeadDataFields,
    BosqueMagicoLeadManageSection,
    BosqueMagicoLeadSnapshotSection,
} from './BosqueMagicoLeadDetailSections';

export type BosqueMagicoLeadDetailModalProps = {
    open: boolean;
    leadId: number | null;
    onClose: () => void;
};

const BosqueMagicoLeadDetailModal: React.FC<BosqueMagicoLeadDetailModalProps> = ({ open, leadId, onClose }) => {
    const { token } = useAuth();
    const enabled = open && leadId != null && Number.isFinite(leadId) && !!token;

    const { data, isLoading, isError } = useQuery({
        queryKey: ['bosque-magico-lead', token, leadId],
        queryFn: () => bosqueMagicoService.getLead(token!, leadId!),
        enabled,
    });

    if (!open || leadId == null) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="bm-lead-modal-title"
                className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-app-border bg-app-modal-solid shadow-2xl overflow-hidden"
            >
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-app-border shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted font-mono">
                            ID #{leadId}
                        </p>
                        <h2 id="bm-lead-modal-title" className="text-lg font-black tracking-tight uppercase text-app-text mt-1 truncate">
                            {data?.contact_name ?? (isLoading ? 'Cargando…' : 'Lead')}
                        </h2>
                        {data && (
                            <span
                                className={`inline-block mt-2 ${bosqueMagicoEstadoBadgeClass(data.status)}`}
                                style={bosqueMagicoEstadoBadgeInnerStyle()}
                            >
                                {data.status}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {data && (
                            <Link
                                to={`/bosque-magico/leads/${data.id}`}
                                onClick={onClose}
                                title="Abrir ficha completa"
                                className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover inline-flex"
                            >
                                <ExternalLink size={18} />
                            </Link>
                        )}
                        <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1 min-h-0">
                    {isError && <p className="text-sm text-app-danger">No se pudo cargar el lead.</p>}
                    {isLoading && (
                        <div className="flex justify-center py-12">
                            <div className="w-9 h-9 border-4 rounded-full animate-spin border-[var(--app-bosque-magico-accent-muted)] border-t-[var(--app-bosque-magico-accent)]" />
                        </div>
                    )}
                    {data && (
                        <>
                            <BosqueMagicoLeadDataFields data={data} />
                            <BosqueMagicoLeadSnapshotSection payload_snapshot={data.payload_snapshot} mode="expandable" />
                            <BosqueMagicoLeadManageSection
                                leadId={data.id}
                                initial={{ status: data.status, notes: data.notes }}
                                queryKeyPrefix={['bosque-magico-lead', token, leadId]}
                            />
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default BosqueMagicoLeadDetailModal;
