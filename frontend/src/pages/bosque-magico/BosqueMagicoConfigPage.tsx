import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';

import { PERMISSION_BOSQUE_MAGICO_MANAGE } from '@/constants/bosqueMagico';
import { useAuth } from '@/context/AuthContext';
import { bosqueMagicoService } from '@/services/bosqueMagicoService';
import { userHasCodename } from '@/utils/documentosGcbUtils';

const BosqueMagicoConfigPage: React.FC = () => {
    const { token, user } = useAuth();
    const qc = useQueryClient();
    const canManage = userHasCodename(user, PERMISSION_BOSQUE_MAGICO_MANAGE);

    const { data, isLoading, error } = useQuery({
        queryKey: ['bosque-magico-config', token],
        queryFn: () => bosqueMagicoService.listConfig(token!),
        enabled: !!token,
    });

    const [drafts, setDrafts] = useState<Record<string, string>>({});

    React.useEffect(() => {
        if (!data) return;
        const next: Record<string, string> = {};
        for (const row of data) {
            next[row.config_key] = JSON.stringify(row.value, null, 2);
        }
        setDrafts(next);
    }, [data]);

    const mutation = useMutation({
        mutationFn: (items: { config_key: string; value: unknown }[]) =>
            bosqueMagicoService.patchConfig(token!, items),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bosque-magico-config', token] });
        },
    });

    const handleSaveRow = (configKey: string) => {
        const raw = drafts[configKey];
        if (raw === undefined) return;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            alert('JSON inválido en el valor.');
            return;
        }
        mutation.mutate([{ config_key: configKey, value: parsed }]);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase text-app-text">
                        Configuración Bosque Mágico
                    </h1>
                    <p className="text-sm text-app-muted mt-1">
                        Precios de referencia y tunables públicos (sin secretos: tokens SMTP/Meta solo en servidor).
                    </p>
                </div>
                <Settings size={28} className="shrink-0 text-[var(--app-bosque-magico-accent)] hidden sm:block" />
            </div>

            <div className="bg-app-card border border-app-border rounded-3xl p-5 sm:p-6 space-y-5">
                {error && (
                    <p className="text-sm text-app-danger">No se pudo cargar la configuración.</p>
                )}
                {isLoading && (
                    <div className="flex justify-center py-16">
                        <div className="w-10 h-10 border-4 rounded-full animate-spin border-[var(--app-bosque-magico-accent-muted)] border-t-[var(--app-bosque-magico-accent)]" />
                    </div>
                )}

                {data && (
                    <div className="space-y-4">
                        {data.map((row) => (
                            <div
                                key={row.id}
                                className="rounded-2xl border border-app-border p-4 space-y-2 bg-app-input/25"
                            >
                                <div className="flex flex-wrap justify-between gap-2">
                                    <code className="text-sm font-mono text-[var(--app-bosque-magico-accent)]">
                                        {row.config_key}
                                    </code>
                                    {row.description && (
                                        <span className="text-xs text-app-muted max-w-md">{row.description}</span>
                                    )}
                                </div>
                                <textarea
                                    value={drafts[row.config_key] ?? ''}
                                    onChange={(e) =>
                                        setDrafts((p) => ({
                                            ...p,
                                            [row.config_key]: e.target.value,
                                        }))
                                    }
                                    rows={4}
                                    readOnly={!canManage}
                                    className="w-full rounded-xl px-3 py-2 text-sm font-mono border border-app-border bg-app-input text-app-text"
                                />
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => handleSaveRow(row.config_key)}
                                        disabled={mutation.isPending}
                                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:opacity-95 disabled:opacity-50"
                                        style={{ backgroundColor: 'var(--app-bosque-magico-accent-strong)' }}
                                    >
                                        Guardar clave
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BosqueMagicoConfigPage;
