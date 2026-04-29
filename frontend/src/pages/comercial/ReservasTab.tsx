import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import type { PaginationState, Updater } from '@tanstack/react-table';
import { CalendarClock, MessageCircle, Pencil, Plus, Trash2, ToggleLeft } from 'lucide-react';
import Swal from 'sweetalert2';

import AppSelect, { type AppSelectOption } from '@/components/ui/AppSelect';
import { buildWhatsDefaultReserva, COMERCIAL_LIST_STALE_MS, estadoBadgeClass } from '@/constants/comercial';
import { comercialService } from '@/services/comercialService';
import type { ComercialReserva, ComercialEstado } from '@/services/comercialService';
import ComercialDateFilterPopover, { DATE_FILTER_HINT_RESERVAS } from '@/pages/comercial/ComercialDateFilterPopover';
import CrudModal from '@/pages/comercial/CrudModal';
import WhatsAppModal from '@/pages/comercial/WhatsAppModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const PAGE_SIZE = 15;
const columnHelper = createColumnHelper<ComercialReserva>();

const ESTADO_FILTER_OPTIONS: AppSelectOption<string>[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'atendido', label: 'Atendido' },
];

export type ReservasTabProps = {
    token: string;
    canManage: boolean;
};

const ReservasTab: React.FC<ReservasTabProps> = ({ token, canManage }) => {
    const qc = useQueryClient();
    const [buscarInput, setBuscarInput] = useState('');
    const buscar = useDebouncedValue(buscarInput, 320);
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: PAGE_SIZE,
    });

    const [crudOpen, setCrudOpen] = useState(false);
    const [crudMode, setCrudMode] = useState<'create' | 'edit'>('create');
    const [editRow, setEditRow] = useState<ComercialReserva | null>(null);

    const [waOpen, setWaOpen] = useState(false);
    const [waRow, setWaRow] = useState<ComercialReserva | null>(null);

    const queryKey = ['comercial-reservas', buscar, estadoFiltro, desde, hasta] as const;

    useEffect(() => {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, [buscar, estadoFiltro, desde, hasta]);

    const { data, isLoading, isFetching, isError } = useQuery({
        queryKey,
        queryFn: () =>
            comercialService.listReservas(token, {
                skip: 0,
                limit: 500,
                buscar: buscar.trim() || undefined,
                estado: estadoFiltro || undefined,
                desde: desde || undefined,
                hasta: hasta || undefined,
            }),
        enabled: !!token,
        staleTime: COMERCIAL_LIST_STALE_MS,
        placeholderData: keepPreviousData,
    });

    const rows = data?.items ?? [];

    const onPaginationChange = useCallback((updater: Updater<PaginationState>) => {
        setPagination((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    }, []);

    const createMut = useMutation({
        mutationFn: (body: Parameters<typeof comercialService.createReserva>[1]) => comercialService.createReserva(token, body),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['comercial-reservas'] });
            void qc.invalidateQueries({ queryKey: ['comercial-analytics-reservas'] });
        },
    });

    const updateMut = useMutation({
        mutationFn: (args: { id: number; body: Partial<ComercialReserva> }) =>
            comercialService.updateReserva(token, args.id, args.body),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['comercial-reservas'] });
            void qc.invalidateQueries({ queryKey: ['comercial-analytics-reservas'] });
        },
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => comercialService.deleteReserva(token, id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['comercial-reservas'] });
            void qc.invalidateQueries({ queryKey: ['comercial-analytics-reservas'] });
        },
    });

    const patchEstadoMut = useMutation({
        mutationFn: (args: { id: number; estado: ComercialEstado }) =>
            comercialService.patchReservaEstado(token, args.id, args.estado),
        onSuccess: () => void qc.invalidateQueries({ queryKey: ['comercial-reservas'] }),
    });

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: 'ID',
                cell: (i) => <span className="font-mono text-app-muted text-xs">{i.getValue()}</span>,
                size: 52,
            }),
            columnHelper.accessor('nombres', {
                header: 'Cliente',
                cell: (i) => <span className="font-semibold truncate max-w-[140px] block">{i.getValue()}</span>,
            }),
            columnHelper.accessor('celular', {
                header: 'Celular',
                cell: (i) => <span className="font-mono text-[10px]">{i.getValue()}</span>,
            }),
            columnHelper.accessor('cantidad_personas', {
                header: 'Pers.',
                cell: (i) => <span className="tabular-nums">{i.getValue()}</span>,
            }),
            columnHelper.accessor('fecha_reserva', {
                header: 'Fecha',
                cell: (i) => <span className="text-[11px]">{i.getValue()}</span>,
            }),
            columnHelper.accessor('hora_reserva', {
                header: 'Hora',
                cell: (i) => <span className="text-[11px] font-mono">{i.getValue()}</span>,
            }),
            columnHelper.accessor('estado', {
                header: 'Estado',
                cell: (i) => <span className={estadoBadgeClass(i.getValue())}>{i.getValue()}</span>,
            }),
            columnHelper.display({
                id: 'acciones',
                header: '',
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-1">
                        {canManage && (
                            <>
                                <button
                                    type="button"
                                    title="Alternar estado"
                                    className="p-2 rounded-lg hover:bg-app-card-hover text-app-muted hover:text-app-commercial"
                                    onClick={() =>
                                        patchEstadoMut.mutate({
                                            id: row.original.id,
                                            estado: row.original.estado === 'pendiente' ? 'atendido' : 'pendiente',
                                        })
                                    }
                                >
                                    <ToggleLeft size={16} />
                                </button>
                                <button
                                    type="button"
                                    title="WhatsApp"
                                    className="p-2 rounded-lg hover:bg-app-card-hover text-app-commercial"
                                    onClick={() => {
                                        setWaRow(row.original);
                                        setWaOpen(true);
                                    }}
                                >
                                    <MessageCircle size={16} />
                                </button>
                                <button
                                    type="button"
                                    title="Editar"
                                    className="p-2 rounded-lg hover:bg-app-card-hover text-app-muted"
                                    onClick={() => {
                                        setEditRow(row.original);
                                        setCrudMode('edit');
                                        setCrudOpen(true);
                                    }}
                                >
                                    <Pencil size={16} />
                                </button>
                                <button
                                    type="button"
                                    title="Eliminar"
                                    className="p-2 rounded-lg hover:bg-app-danger-muted text-app-danger"
                                    onClick={async () => {
                                        const ok = await Swal.fire({
                                            title: '¿Eliminar reserva?',
                                            icon: 'warning',
                                            showCancelButton: true,
                                            confirmButtonColor: 'var(--app-danger)',
                                            background: 'var(--app-panel)',
                                            color: 'var(--app-text)',
                                        });
                                        if (ok.isConfirmed) deleteMut.mutate(row.original.id);
                                    }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                    </div>
                ),
            }),
        ],
        [canManage, deleteMut, patchEstadoMut]
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

    return (
        <div className="space-y-4">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                <div className="flex flex-wrap gap-2 items-center">
                    <CalendarClock size={18} className="text-app-commercial shrink-0" />
                    <input
                        placeholder="Buscar nombre o celular…"
                        className="rounded-xl border border-app-border bg-app-input px-4 py-2 text-sm text-app-text placeholder:text-app-muted min-w-[200px]"
                        value={buscarInput}
                        onChange={(e) => setBuscarInput(e.target.value)}
                        autoComplete="off"
                    />
                    <div className="w-[200px] min-w-[180px]">
                        <AppSelect<string>
                            options={ESTADO_FILTER_OPTIONS}
                            value={ESTADO_FILTER_OPTIONS.find((o) => o.value === estadoFiltro) ?? ESTADO_FILTER_OPTIONS[0]}
                            onChange={(o) => setEstadoFiltro(o?.value ?? '')}
                            isSearchable={false}
                            size="sm"
                        />
                    </div>
                    <ComercialDateFilterPopover
                        id="comercial-reservas-date-filter"
                        desde={desde}
                        hasta={hasta}
                        onDesdeChange={setDesde}
                        onHastaChange={setHasta}
                        hint={DATE_FILTER_HINT_RESERVAS}
                    />
                </div>
                {canManage && (
                    <button
                        type="button"
                        onClick={() => {
                            setEditRow(null);
                            setCrudMode('create');
                            setCrudOpen(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-app-commercial text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-app-commercial-strong"
                    >
                        <Plus size={16} /> Nueva reserva
                    </button>
                )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-app-border relative">
                {isFetching && !isLoading && (
                    <div className="absolute top-2 right-3 z-10 flex items-center gap-2 rounded-lg border border-app-border bg-app-input px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-app-muted">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-app-commercial-muted border-t-app-commercial" />
                        Actualizando…
                    </div>
                )}
                {isError && (
                    <p className="p-6 text-app-danger text-sm">Error cargando reservas. ¿Permiso comercial:view?</p>
                )}
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-10 h-10 border-4 border-app-commercial-muted border-t-app-commercial rounded-full animate-spin" />
                    </div>
                ) : (
                    <table className="w-full text-left text-xs">
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
                            {table.getRowModel().rows.map((r) => (
                                <tr key={r.original.id} className="border-b border-app-border/80 hover:bg-app-input/20">
                                    {r.getVisibleCells().map((c) => (
                                        <td key={c.id} className="px-3 py-2 align-middle text-app-text">
                                            {flexRender(c.column.columnDef.cell, c.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-3 border-t border-app-border text-[10px] text-app-muted font-mono">
                    <span>
                        {data?.total ?? rows.length} registros (pág. {table.getState().pagination.pageIndex + 1} /{' '}
                        {table.getPageCount() || 1})
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

            <CrudModal
                open={crudOpen}
                onClose={() => setCrudOpen(false)}
                kind="reserva"
                mode={crudMode}
                initialReserva={editRow}
                canSubmit={canManage}
                onSaveReserva={async (payload) => {
                    if (crudMode === 'create') await createMut.mutateAsync(payload);
                    else if (editRow) await updateMut.mutateAsync({ id: editRow.id, body: payload });
                }}
                onSaveEvento={async () => { }}
            />

            <WhatsAppModal
                open={waOpen}
                onClose={() => setWaOpen(false)}
                token={token}
                kind="reserva"
                record={waRow}
                defaultMessage={waRow ? buildWhatsDefaultReserva(waRow) : ''}
            />
        </div>
    );
};

export default ReservasTab;
