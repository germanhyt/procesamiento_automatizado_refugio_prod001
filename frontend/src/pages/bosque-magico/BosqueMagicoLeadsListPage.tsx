import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import type { PaginationState, Updater } from '@tanstack/react-table';
import { Eye, Plus, Trees } from 'lucide-react';

import AppSelect, { type AppSelectOption } from '@/components/ui/AppSelect';
import {
    BOSQUE_LIST_STALE_MS,
    BOSQUE_MAGICO_CHANNELS,
    BOSQUE_MAGICO_LEAD_STATUS,
    bosqueMagicoChannelLabel,
    bosqueMagicoEstadoBadgeClass,
    bosqueMagicoEstadoBadgeInnerStyle,
    PERMISSION_BOSQUE_MAGICO_MANAGE,
} from '@/constants/bosqueMagico';
import { useAuth } from '@/context/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { bosqueMagicoService, type BosqueMagicoLead } from '@/services/bosqueMagicoService';
import { userHasCodename } from '@/utils/documentosGcbUtils';

import BosqueMagicoLeadDetailModal from './BosqueMagicoLeadDetailModal';
import BosqueMagicoNewLeadModal from './BosqueMagicoNewLeadModal';

const PAGE_SIZE = 15;
const FETCH_LIMIT = 500;
const columnHelper = createColumnHelper<BosqueMagicoLead>();

function formatLeadsLoadError(err: unknown): string {
    if (!err) return 'No se pudieron cargar los leads. Intente de nuevo.';
    if (!axios.isAxiosError(err)) return 'No se pudieron cargar los leads. Intente de nuevo.';
    const status = err.response?.status;
    const raw = err.response?.data as { detail?: unknown } | undefined;
    const detail = raw?.detail;
    const detailStr =
        typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: string }).msg) : JSON.stringify(d))).join('; ')
              : detail != null
                ? JSON.stringify(detail)
                : '';

    if (status === 403) {
        return detailStr || 'No tiene permisos para ver leads Bosque Mágico (bosque_magico:view).';
    }
    if (status === 401) {
        return detailStr || 'Sesión no válida o expirada. Vuelva a iniciar sesión.';
    }
    if (status === 422) {
        return detailStr ? `Solicitud inválida: ${detailStr}` : 'Solicitud inválida (parámetros). Revise la consola de red.';
    }
    if (detailStr) return detailStr;
    return err.message || 'Error de red o del servidor al cargar leads.';
}

const BosqueMagicoLeadsListPage: React.FC = () => {
    const { token, user } = useAuth();
    const authToken = token ?? '';
    const canManage = userHasCodename(user, PERMISSION_BOSQUE_MAGICO_MANAGE);

    const [nombreInput, setNombreInput] = useState('');
    const buscarDebounced = useDebouncedValue(nombreInput, 320);
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [canalFiltro, setCanalFiltro] = useState('');

    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
    const [detailModalLeadId, setDetailModalLeadId] = useState<number | null>(null);
    const [newLeadOpen, setNewLeadOpen] = useState(false);

    const estadoFilterOptions: AppSelectOption<string>[] = useMemo(
        () => [
            { value: '', label: 'Todos los estados' },
            ...BOSQUE_MAGICO_LEAD_STATUS.map((s) => ({ value: s, label: s })),
        ],
        []
    );

    const canalFilterOptions: AppSelectOption<string>[] = useMemo(
        () => [
            { value: '', label: 'Todos los canales' },
            ...BOSQUE_MAGICO_CHANNELS.map((c) => ({ value: c, label: bosqueMagicoChannelLabel(c) })),
        ],
        []
    );

    const selectedEstado = estadoFilterOptions.find((o) => o.value === estadoFiltro) ?? estadoFilterOptions[0];
    const selectedCanal = canalFilterOptions.find((o) => o.value === canalFiltro) ?? canalFilterOptions[0];

    useEffect(() => {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, [buscarDebounced, estadoFiltro, canalFiltro]);

    const queryKey = ['bosque-magico-leads', buscarDebounced, estadoFiltro, canalFiltro] as const;

    const { data, isLoading, isFetching, isError, error: queryError } = useQuery({
        queryKey,
        queryFn: () =>
            bosqueMagicoService.listLeads(authToken, {
                skip: 0,
                limit: FETCH_LIMIT,
                status: estadoFiltro || undefined,
                channel: canalFiltro || undefined,
                buscar: buscarDebounced.trim() || undefined,
            }),
        enabled: !!authToken,
        staleTime: BOSQUE_LIST_STALE_MS,
        placeholderData: keepPreviousData,
    });

    const rows = data?.items ?? [];

    const onPaginationChange = useCallback((updater: Updater<PaginationState>) => {
        setPagination((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    }, []);

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: 'ID',
                cell: (i) => <span className="font-mono text-app-muted text-xs">{i.getValue()}</span>,
                size: 56,
            }),
            columnHelper.accessor('created_at', {
                header: 'Fecha alta',
                cell: (i) => (
                    <span className="text-[11px] whitespace-nowrap text-app-muted">
                        {new Date(i.getValue()).toLocaleString()}
                    </span>
                ),
                size: 140,
            }),
            columnHelper.accessor('contact_name', {
                header: 'Contacto',
                cell: (i) => <span className="font-semibold truncate max-w-[160px] block">{i.getValue()}</span>,
            }),
            columnHelper.accessor('phone', {
                header: 'Teléfono',
                cell: (i) => <span className="font-mono text-[10px] whitespace-nowrap">{i.getValue()}</span>,
            }),
            columnHelper.accessor('email', {
                header: 'Correo',
                cell: (i) => (
                    <span className="text-[11px] break-all max-w-[160px] block">{i.getValue() || '—'}</span>
                ),
            }),
            columnHelper.accessor('channel', {
                header: 'Canal',
                cell: (i) => (
                    <span className="text-[11px]">{bosqueMagicoChannelLabel(i.getValue())}</span>
                ),
            }),
            columnHelper.accessor('tentative_event_date', {
                header: 'Fecha evt.',
                cell: (i) => <span className="text-[11px]">{i.getValue() || '—'}</span>,
            }),
            columnHelper.accessor('status', {
                header: 'Estado',
                cell: ({ getValue }) => (
                    <span
                        className={bosqueMagicoEstadoBadgeClass(getValue())}
                        style={bosqueMagicoEstadoBadgeInnerStyle()}
                    >
                        {getValue()}
                    </span>
                ),
            }),
            columnHelper.display({
                id: 'acciones',
                header: '',
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                            type="button"
                            title={canManage ? 'Ver más / editar en modal' : 'Ver más'}
                            aria-label="Ver más — detalle en ventana"
                            onClick={() => setDetailModalLeadId(row.original.id)}
                            className="p-2 rounded-lg hover:bg-app-card-hover text-[var(--app-bosque-magico-accent)] inline-flex"
                        >
                            <Eye size={16} />
                        </button>
                    </div>
                ),
            }),
        ],
        [canManage]
    );

    const table = useReactTable({
        data: rows,
        columns,
        getRowId: (row) => String(row.id),
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        state: { pagination },
        onPaginationChange,
    });

    if (!authToken) {
        return <p className="text-app-muted text-sm">Inicie sesión para ver leads.</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase text-app-text">Leads Bosque Mágico</h1>
                    <p className="text-sm text-app-muted mt-1">
                        Captaciones desde landing, panel manual y otros canales (sin correo automático al cliente desde
                        el formulario público).
                    </p>
                </div>
                {canManage && (
                    <button
                        type="button"
                        onClick={() => setNewLeadOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shrink-0"
                        style={{ backgroundColor: 'var(--app-bosque-magico-accent-strong)' }}
                    >
                        <Plus size={16} />
                        Nuevo lead
                    </button>
                )}
            </div>

            <div className="bg-app-card border border-app-border rounded-3xl p-5 sm:p-6 space-y-5">
                <section className="space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Filtros</h2>
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="mb-2">
                            <Trees size={18} className="shrink-0 text-[var(--app-bosque-magico-accent)]" />
                        </div>
                        <input
                            placeholder="Buscar por nombre, teléfono o correo…"
                            className="rounded-xl border border-app-border bg-app-input px-4 py-2 text-sm text-app-text placeholder:text-app-muted min-w-[220px]"
                            value={nombreInput}
                            onChange={(e) => setNombreInput(e.target.value)}
                            autoComplete="off"
                        />
                        <div className="w-[220px] min-w-[180px]">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1">
                                Estado
                            </span>
                            <AppSelect<string>
                                options={estadoFilterOptions}
                                value={selectedEstado}
                                onChange={(o) => setEstadoFiltro(o?.value ?? '')}
                                isSearchable={false}
                                size="sm"
                            />
                        </div>
                        <div className="w-[220px] min-w-[180px]">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1">
                                Canal
                            </span>
                            <AppSelect<string>
                                options={canalFilterOptions}
                                value={selectedCanal}
                                onChange={(o) => setCanalFiltro(o?.value ?? '')}
                                isSearchable={false}
                                size="sm"
                            />
                        </div>
                    </div>
                </section>

                <div className="overflow-x-auto rounded-2xl border border-app-border relative">
                    {isFetching && !isLoading && (
                        <div className="absolute top-2 right-3 z-10 flex items-center gap-2 rounded-lg border border-app-border bg-app-input px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-app-muted">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--app-bosque-magico-accent-muted)] border-t-[var(--app-bosque-magico-accent)]" />
                            Actualizando…
                        </div>
                    )}
                    {isError && (
                        <p className="p-6 text-app-danger text-sm">
                            {formatLeadsLoadError(queryError)}
                        </p>
                    )}
                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <div className="w-10 h-10 border-4 rounded-full animate-spin border-[var(--app-bosque-magico-accent-muted)] border-t-[var(--app-bosque-magico-accent)]" />
                        </div>
                    ) : (
                        <table className="min-w-full text-left text-xs">
                            <thead>
                                {table.getHeaderGroups().map((hg) => (
                                    <tr key={hg.id} className="border-b border-app-border bg-app-input/40">
                                        {hg.headers.map((h) => (
                                            <th
                                                key={h.id}
                                                className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head whitespace-nowrap"
                                                style={{ width: h.getSize() }}
                                            >
                                                {flexRender(h.column.columnDef.header, h.getContext())}
                                            </th>
                                        ))}
                                    </tr>
                                ))}
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-app-muted">
                                            No hay leads para los filtros seleccionados.
                                        </td>
                                    </tr>
                                ) : (
                                    table.getRowModel().rows.map((r) => (
                                        <tr key={r.original.id} className="border-b border-app-border/80 hover:bg-app-input/20">
                                            {r.getVisibleCells().map((c) => (
                                                <td key={c.id} className="px-3 py-2 align-middle text-app-text">
                                                    {flexRender(c.column.columnDef.cell, c.getContext())}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-3 border-t border-app-border text-[10px] text-app-muted font-mono">
                        <span>
                            {data?.total ?? rows.length} registros (mostrados {rows.length}; pág.{' '}
                            {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1})
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={!table.getCanPreviousPage()}
                                onClick={() => table.previousPage()}
                                className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-app-text disabled:opacity-40 text-[9px] font-black uppercase tracking-widest"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                disabled={!table.getCanNextPage()}
                                onClick={() => table.nextPage()}
                                className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-app-text disabled:opacity-40 text-[9px] font-black uppercase tracking-widest"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <BosqueMagicoLeadDetailModal
                open={detailModalLeadId != null}
                leadId={detailModalLeadId}
                onClose={() => setDetailModalLeadId(null)}
            />
            <BosqueMagicoNewLeadModal open={newLeadOpen} onClose={() => setNewLeadOpen(false)} />
        </div>
    );
};

export default BosqueMagicoLeadsListPage;
