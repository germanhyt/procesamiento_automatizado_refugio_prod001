import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';

import BosqueMagicoLandingSnapshotCard from './BosqueMagicoLandingSnapshotCard';
import { BOSQUE_MAGICO_LEAD_STATUS, bosqueMagicoChannelLabel, PERMISSION_BOSQUE_MAGICO_MANAGE } from '@/constants/bosqueMagico';
import { useAuth } from '@/context/AuthContext';
import { bosqueMagicoService, type BosqueMagicoLead } from '@/services/bosqueMagicoService';
import { userHasCodename } from '@/utils/documentosGcbUtils';

/** Grid de datos de contacto y evento (sin envoltorio card). */
export const BosqueMagicoLeadDataFields: React.FC<{ data: BosqueMagicoLead }> = ({ data }) => (
    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-app-text">
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Teléfono</span>
            <span className="font-mono text-xs">{data.phone}</span>
        </p>
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Correo</span>
            {data.email || '—'}
        </p>
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Canal</span>
            {bosqueMagicoChannelLabel(data.channel)}
        </p>
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Origen detalle</span>
            {data.source_detail || '—'}
        </p>
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Fecha tentativa</span>
            {data.tentative_event_date || '—'}
        </p>
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Turno</span>
            {data.shift || '—'}
        </p>
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Niños estimados</span>
            {data.estimated_children ?? '—'}
        </p>
        <p>
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Alta</span>
            <span className="text-[11px] text-app-muted">{new Date(data.created_at).toLocaleString()}</span>
        </p>
        <p className="sm:col-span-2">
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Estado</span>
            {data.status}
        </p>
        <p className="sm:col-span-2">
            <span className="text-app-muted text-[11px] font-black uppercase tracking-wider block mb-0.5">Notas</span>
            <span className="text-app-text-secondary whitespace-pre-wrap">{data.notes?.trim() ? data.notes : '—'}</span>
        </p>
    </div>
);

type SnapshotProps = {
    payload_snapshot: Record<string, unknown> | null;
    /** En ficha completa el JSON se muestra siempre; en modal va detrás de “Ver más”. */
    mode: 'expandable' | 'full';
};

export const BosqueMagicoLeadSnapshotSection: React.FC<SnapshotProps> = ({ payload_snapshot, mode }) => {
    const [jsonOpen, setJsonOpen] = useState(false);
    const pretty = useMemo(() => {
        if (!payload_snapshot) return '';
        try {
            return JSON.stringify(payload_snapshot, null, 2);
        } catch {
            return String(payload_snapshot);
        }
    }, [payload_snapshot]);

    if (!pretty) return null;

    const compact = mode === 'expandable';

    const jsonBlock = (
        <div className={`${compact ? 'rounded-b-2xl' : 'rounded-2xl'} border border-app-border overflow-hidden bg-app-input/15`}>
            <button
                type="button"
                onClick={() => setJsonOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover transition-colors"
                aria-expanded={jsonOpen}
            >
                Datos técnicos (JSON)
                <ChevronDown size={16} className={`shrink-0 transition-transform ${jsonOpen ? 'rotate-180' : ''}`} />
            </button>
            {jsonOpen && (
                <pre className="text-xs overflow-x-auto text-app-text-secondary whitespace-pre-wrap px-4 pb-4 max-h-[40vh] overflow-y-auto border-t border-app-border/80 bg-app-input/20">
                    {pretty}
                </pre>
            )}
        </div>
    );

    if (mode === 'full') {
        return (
            <div className="space-y-4">
                <BosqueMagicoLandingSnapshotCard payload_snapshot={payload_snapshot} compact={false} />
                {jsonBlock}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <BosqueMagicoLandingSnapshotCard payload_snapshot={payload_snapshot} compact />
            {jsonBlock}
        </div>
    );
};

type ManageProps = {
    leadId: number;
    initial: Pick<BosqueMagicoLead, 'status' | 'notes'>;
    queryKeyPrefix: readonly unknown[];
};

/** Estado + notas + guardar (solo si el usuario tiene manage). */
export const BosqueMagicoLeadManageSection: React.FC<ManageProps> = ({ leadId, initial, queryKeyPrefix }) => {
    const { token, user } = useAuth();
    const qc = useQueryClient();
    const canManage = userHasCodename(user, PERMISSION_BOSQUE_MAGICO_MANAGE);
    const [notesDraft, setNotesDraft] = React.useState(initial.notes || '');
    const [statusDraft, setStatusDraft] = React.useState(initial.status);

    React.useEffect(() => {
        setNotesDraft(initial.notes || '');
        setStatusDraft(initial.status);
    }, [initial.notes, initial.status]);

    const mutation = useMutation({
        mutationFn: () =>
            bosqueMagicoService.patchLead(token!, leadId, {
                status: statusDraft,
                notes: notesDraft || null,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeyPrefix });
            qc.invalidateQueries({ queryKey: ['bosque-magico-leads'] });
        },
    });

    if (!canManage || !token) return null;

    return (
        <div className="pt-5 border-t border-app-border space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Operación</h2>
            <label className="text-sm flex flex-col gap-1 max-w-xs">
                <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Estado</span>
                <select
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                    className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text text-sm"
                >
                    {BOSQUE_MAGICO_LEAD_STATUS.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            </label>
            <label className="text-sm flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Notas</span>
                <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={4}
                    className="rounded-xl px-3 py-2 border border-app-border bg-app-input text-app-text text-sm"
                />
            </label>
            <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:opacity-95 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: 'var(--app-bosque-magico-accent-strong)' }}
            >
                {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {mutation.isError && <p className="text-sm text-app-danger">Error al guardar. Verifique permisos.</p>}
        </div>
    );
};
