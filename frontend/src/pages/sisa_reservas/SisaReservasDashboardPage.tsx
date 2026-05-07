import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Layers, PieChart, Users } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { sisaEstadoBadgeClass, sisaEstadoLabel } from '@/constants/sisaReservas';
import { getSisaKpis, SISA_LIST_STALE_MS } from '@/services/sisaReservasService';
import { exportSisaReservasCsv } from '@/utils/sisaExport';

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-app-muted gap-2">
                <span className="truncate">{label}</span>
                <span className="tabular-nums shrink-0">{count}</span>
            </div>
            <div className="h-2 rounded-full bg-app-input overflow-hidden border border-app-border">
                <div
                    className="h-full rounded-full transition-all"
                    style={{
                        width: `${pct}%`,
                        minWidth: count > 0 ? '4px' : 0,
                        backgroundColor: 'var(--app-sisa-reservas-accent)',
                    }}
                />
            </div>
        </div>
    );
}

const SisaReservasDashboardPage: React.FC = () => {
    const { token } = useAuth();
    const authToken = token ?? '';
    const [exporting, setExporting] = useState(false);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['sisa-kpis', authToken],
        queryFn: () => getSisaKpis(authToken),
        enabled: !!authToken,
        staleTime: SISA_LIST_STALE_MS,
    });

    const maxMotivo = Math.max(0, ...(data?.by_motivo.map((x) => x.count) ?? []));
    const maxZona = Math.max(0, ...(data?.by_zona.map((x) => x.count) ?? []));

    const onExport = async () => {
        if (!authToken) return;
        setExporting(true);
        try {
            await exportSisaReservasCsv(authToken);
        } catch (e) {
            console.error(e);
        } finally {
            setExporting(false);
        }
    };

    if (!authToken) {
        return <p className="text-app-muted text-sm">Inicie sesión para ver el dashboard.</p>;
    }

    if (isError) {
        return <p className="text-app-danger text-sm">No se pudieron cargar los KPIs.</p>;
    }

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-24">
                <div
                    className="w-10 h-10 border-4 rounded-full animate-spin border-t-transparent"
                    style={{ borderColor: 'var(--app-sisa-reservas-accent-muted)' }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-app-text-secondary">
                    Resumen operativo de reservas. La exportación CSV incluye el histórico paginado desde la API.
                </p>
                <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void onExport()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border disabled:opacity-50"
                    style={{
                        borderColor: 'var(--app-sisa-reservas-accent-muted)',
                        color: 'var(--app-sisa-reservas-accent)',
                    }}
                >
                    <Download size={16} />
                    {exporting ? 'Generando…' : 'Descargar CSV'}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                    className="rounded-2xl border p-6 border-app-border"
                    style={{ backgroundColor: 'var(--app-card)' }}
                >
                    <div className="flex items-center gap-3 mb-3" style={{ color: 'var(--app-sisa-reservas-accent)' }}>
                        <Users size={22} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Total reservas</span>
                    </div>
                    <div className="text-3xl font-black text-app-text tabular-nums">{data.total_reservas}</div>
                </div>
                <div
                    className="rounded-2xl border p-6 border-app-border"
                    style={{ backgroundColor: 'var(--app-card)' }}
                >
                    <div className="flex items-center gap-3 mb-3 text-app-warning">
                        <PieChart size={22} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Pendientes</span>
                    </div>
                    <div className="text-3xl font-black text-app-text tabular-nums">{data.pendientes}</div>
                </div>
                <div
                    className="rounded-2xl border p-6 border-app-border"
                    style={{ backgroundColor: 'var(--app-card)' }}
                >
                    <div className="flex items-center gap-3 mb-3" style={{ color: 'var(--app-sisa-reservas-accent)' }}>
                        <BarChart3 size={22} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Confirmados</span>
                    </div>
                    <div className="text-3xl font-black text-app-text tabular-nums">{data.confirmados}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div
                    className="rounded-2xl border p-5 border-app-border"
                    style={{ backgroundColor: 'var(--app-card)' }}
                >
                    <div className="flex items-center gap-2 mb-4 text-app-text">
                        <PieChart size={18} style={{ color: 'var(--app-sisa-reservas-accent)' }} />
                        <h3 className="text-xs font-black uppercase tracking-widest">Por motivo</h3>
                    </div>
                    <div className="space-y-3">
                        {data.by_motivo.length === 0 ? (
                            <p className="text-xs text-app-muted">Sin datos.</p>
                        ) : (
                            data.by_motivo.map((row) => <BarRow key={row.label} label={row.label} count={row.count} max={maxMotivo} />)
                        )}
                    </div>
                </div>
                <div
                    className="rounded-2xl border p-5 border-app-border"
                    style={{ backgroundColor: 'var(--app-card)' }}
                >
                    <div className="flex items-center gap-2 mb-4 text-app-text">
                        <Layers size={18} style={{ color: 'var(--app-sisa-reservas-accent)' }} />
                        <h3 className="text-xs font-black uppercase tracking-widest">Por zona</h3>
                    </div>
                    <div className="space-y-3">
                        {data.by_zona.length === 0 ? (
                            <p className="text-xs text-app-muted">Sin datos.</p>
                        ) : (
                            data.by_zona.map((row) => <BarRow key={row.label} label={row.label} count={row.count} max={maxZona} />)
                        )}
                    </div>
                </div>
            </div>

            <div
                className="rounded-2xl border border-app-border overflow-hidden"
                style={{ backgroundColor: 'var(--app-card)' }}
            >
                <div className="px-4 py-3 border-b border-app-border text-xs font-black uppercase tracking-widest text-app-muted">
                    Últimas reservas
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-app-border bg-app-input/30">
                                <th className="px-3 py-2 font-black uppercase text-[9px] text-app-table-head">Cliente</th>
                                <th className="px-3 py-2 font-black uppercase text-[9px] text-app-table-head">Fecha</th>
                                <th className="px-3 py-2 font-black uppercase text-[9px] text-app-table-head">Motivo</th>
                                <th className="px-3 py-2 font-black uppercase text-[9px] text-app-table-head">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.ultimas.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-3 py-6 text-center text-app-muted text-sm">
                                        Sin reservas aún.
                                    </td>
                                </tr>
                            ) : (
                                data.ultimas.map((r) => (
                                    <tr key={r.id} className="border-b border-app-border/70 hover:bg-app-input/15">
                                        <td className="px-3 py-2 font-semibold max-w-[140px] truncate">{r.nombre_completo}</td>
                                        <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">
                                            {r.fecha_reserva} {r.hora_reserva?.slice(0, 5)}
                                        </td>
                                        <td className="px-3 py-2 text-[10px]">{r.motivo_reserva}</td>
                                        <td className="px-3 py-2">
                                            <span className={sisaEstadoBadgeClass(r.estado)}>{sisaEstadoLabel(r.estado)}</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SisaReservasDashboardPage;
