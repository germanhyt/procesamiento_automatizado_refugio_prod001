import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { PERMISSION_BOSQUE_MAGICO_MANAGE } from '@/constants/bosqueMagico';
import { useAuth } from '@/context/AuthContext';
import { bosqueMagicoService } from '@/services/bosqueMagicoService';
import { userHasCodename } from '@/utils/documentosGcbUtils';

import {
    BosqueMagicoLeadDataFields,
    BosqueMagicoLeadManageSection,
    BosqueMagicoLeadSnapshotSection,
} from './BosqueMagicoLeadDetailSections';

const BosqueMagicoLeadDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const leadId = Number(id);
    const { token, user } = useAuth();
    const canManage = userHasCodename(user, PERMISSION_BOSQUE_MAGICO_MANAGE);

    const { data, isLoading, error } = useQuery({
        queryKey: ['bosque-magico-lead', token, leadId],
        queryFn: () => bosqueMagicoService.getLead(token!, leadId),
        enabled: !!token && Number.isFinite(leadId),
    });

    if (!Number.isFinite(leadId)) {
        return <p className="text-app-muted text-sm px-2">ID inválido.</p>;
    }

    return (
        <div className="space-y-6">
            <Link
                to="/bosque-magico/leads"
                className="inline-flex text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-[var(--app-bosque-magico-accent)]"
            >
                ← Volver al listado
            </Link>

            {error && <p className="text-sm text-app-danger px-2">No se pudo cargar el lead.</p>}
            {isLoading && (
                <div className="flex justify-center py-16">
                    <div className="w-10 h-10 border-4 rounded-full animate-spin border-[var(--app-bosque-magico-accent-muted)] border-t-[var(--app-bosque-magico-accent)]" />
                </div>
            )}

            {data && (
                <>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted font-mono">
                            ID #{data.id}
                        </p>
                        <h1 className="text-2xl font-black tracking-tight uppercase text-app-text mt-1">{data.contact_name}</h1>
                        <p className="text-sm text-app-muted mt-1">Detalle del lead · gestión estado y notas</p>
                    </div>

                    <div className="bg-app-card border border-app-border rounded-3xl p-5 sm:p-6 space-y-4">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted border-b border-app-border pb-2">
                            Datos
                        </h2>
                        <BosqueMagicoLeadDataFields data={data} />
                        {canManage && (
                            <BosqueMagicoLeadManageSection
                                leadId={data.id}
                                initial={{ status: data.status, notes: data.notes }}
                                queryKeyPrefix={['bosque-magico-lead', token, leadId]}
                            />
                        )}
                    </div>

                    <BosqueMagicoLeadSnapshotSection payload_snapshot={data.payload_snapshot} mode="full" />
                </>
            )}
        </div>
    );
};

export default BosqueMagicoLeadDetailPage;
