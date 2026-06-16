import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import type { PaginationState, Updater } from '@tanstack/react-table';
import { Cake, MessageCircle, Pencil, Plus, Trash2, ToggleLeft } from 'lucide-react';
import Swal from 'sweetalert2';

import AppSelect, { type AppSelectOption } from '@/components/ui/AppSelect';
import { buildWhatsDefaultEvento, COMERCIAL_LIST_STALE_MS, estadoBadgeClass, TIPOS_EVENTO } from '@/constants/comercial';
import { comercialService } from '@/services/comercialService';
import type { ComercialEvento, ComercialEstado } from '@/services/comercialService';
import ComercialDateFilterPopover, { DATE_FILTER_HINT_EVENTOS } from '@/pages/comercial/ComercialDateFilterPopover';
import CrudModal from '@/pages/comercial/CrudModal';
import WhatsAppModal from '@/pages/comercial/WhatsAppModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatRegistrationDateTime } from '@/utils/formatDateTime';

const PAGE_SIZE = 15;
const columnHelper = createColumnHelper<ComercialEvento>();

const ESTADO_FILTER_OPTIONS: AppSelectOption<string>[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'atendido', label: 'Atendido' },
];

const TIPO_EVENTO_FILTER_OPTIONS: AppSelectOption<string>[] = [
    { value: '', label: 'Todos los tipos' },
    ...TIPOS_EVENTO.map((t) => ({ value: t, label: t })),
];

export type EventosTabProps = {
    token: string;
    canManage: boolean;
};

const EventosTab: React.FC<EventosTabProps> = ({ token, canManage }) => {
    const qc = useQueryClient();
    const [buscarInput, setBuscarInput] = useState('');
    const buscar = useDebouncedValue(buscarInput, 320);
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [tipoFiltro, setTipoFiltro] = useState('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');

    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });

    const [crudOpen, setCrudOpen] = useState(false);
    const [crudMode, setCrudMode] = useState<'create' | 'edit'>('create');
    const [editRow, setEditRow] = useState<ComercialEvento | null>(null);

    const [waOpen, setWaOpen] = useState(false);
    const [waRow, setWaRow] = useState<ComercialEvento | null>(null);

    useEffect(() => {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, [buscar, estadoFiltro, tipoFiltro, desde, hasta]);

    const { data, isLoading, isFetching, isError } = useQuery({
        queryKey: [
            'comercial-eventos',
            buscar,
            estadoFiltro,
            tipoFiltro,
            desde,
            hasta,
            pagination.pageIndex,
            pagination.pageSize,
        ],
        queryFn: () =>
            comercialService.listEventos(token, {
                skip: pagination.pageIndex * pagination.pageSize,
                limit: pagination.pageSize,
                buscar: buscar.trim() || undefined,
                estado: estadoFiltro || undefined,
                tipo_evento: tipoFiltro || undefined,
                desde: desde || undefined,
                hasta: hasta || undefined,
            }),
        enabled: !!token,
        staleTime: COMERCIAL_LIST_STALE_MS,
        placeholderData: keepPreviousData,
    });

    const rows = data?.items ?? [];
    const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pagination.pageSize));

    const onPaginationChange = useCallback((updater: Updater<PaginationState>) => {
        setPagination((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    }, []);

    const createMut = useMutation({
        mutationFn: (body: Parameters<typeof comercialService.createEvento>[1]) => comercialService.createEvento(token, body),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['comercial-eventos'] });
            void qc.invalidateQueries({ queryKey: ['comercial-analytics-eventos'] });
        },
    });

    const updateMut = useMutation({
        mutationFn: (args: { id: number; body: Partial<ComercialEvento> }) =>
            comercialService.updateEvento(token, args.id, args.body),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['comercial-eventos'] });
            void qc.invalidateQueries({ queryKey: ['comercial-analytics-eventos'] });
        },
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => comercialService.deleteEvento(token, id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['comercial-eventos'] });
            void qc.invalidateQueries({ queryKey: ['comercial-analytics-eventos'] });
        },
    });

    const patchEstadoMut = useMutation({
        mutationFn: (args: { id: number; estado: ComercialEstado }) =>
            comercialService.patchEventoEstado(token, args.id, args.estado),
        onSuccess: () => void qc.invalidateQueries({ queryKey: ['comercial-eventos'] }),
    });

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: 'ID',
                cell: (i) => <span className="font-mono text-app-muted text-xs">{i.getValue()}</span>,
                size: 52,
            }),
            columnHelper.accessor('fecha_creacion', {
                header: 'Registro',
                cell: (i) => (
                    <span className="text-[10px] font-mono text-app-muted whitespace-nowrap">
                        {formatRegistrationDateTime(i.getValue())}
                    </span>
                ),
            }),
            columnHelper.accessor('nombres', {
                header: 'Cliente',
                cell: (i) => <span className="font-semibold truncate max-w-[120px] block">{i.getValue()}</span>,
            }),
            columnHelper.accessor('razon_social', {
                header: 'Razón soc.',
                cell: (i) => (
                    <span className="text-[10px] text-app-muted truncate max-w-[100px] block">{i.getValue() || '—'}</span>
                ),
            }),
            columnHelper.accessor('celular', {
                header: 'Celular',
                cell: (i) => <span className="font-mono text-[10px]">{i.getValue()}</span>,
            }),
            columnHelper.accessor('tipo_evento', {
                header: 'Tipo',
                cell: (i) => <span className="text-[10px] font-bold text-app-commercial">{i.getValue()}</span>,
            }),
            columnHelper.accessor('cantidad_personas', {
                header: 'Pers.',
                cell: (i) => <span className="tabular-nums">{i.getValue()}</span>,
            }),
            columnHelper.accessor('fecha_tentativa', {
                header: 'Fecha tent.',
                cell: (i) => <span className="text-[11px]">{i.getValue()}</span>,
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
                                            title: '¿Eliminar evento?',
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
        state: { pagination },
        onPaginationChange,
        manualPagination: true,
        pageCount,
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                <div className="flex flex-wrap gap-2 items-center">
                    <Cake size={18} className="text-app-commercial shrink-0" />
                    <input
                        placeholder="Buscar nombre, celular o razón social…"
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
                    <div className="w-[220px] min-w-[200px]">
                        <AppSelect<string>
                            options={TIPO_EVENTO_FILTER_OPTIONS}
                            value={TIPO_EVENTO_FILTER_OPTIONS.find((o) => o.value === tipoFiltro) ?? TIPO_EVENTO_FILTER_OPTIONS[0]}
                            onChange={(o) => setTipoFiltro(o?.value ?? '')}
                            isSearchable={false}
                            size="sm"
                        />
                    </div>
                    <ComercialDateFilterPopover
                        id="comercial-eventos-date-filter"
                        desde={desde}
                        hasta={hasta}
                        onDesdeChange={setDesde}
                        onHastaChange={setHasta}
                        hint={DATE_FILTER_HINT_EVENTOS}
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
                        <Plus size={16} /> Nuevo evento
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
                    <p className="p-6 text-app-danger text-sm">Error cargando eventos. ¿Permiso comercial:view?</p>
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
                        {data?.total ?? 0} registros (pág. {pagination.pageIndex + 1} / {pageCount})
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={pagination.pageIndex <= 0 || isFetching}
                            onClick={() => table.previousPage()}
                            className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-app-text disabled:opacity-40 text-[9px] font-black uppercase tracking-widest"
                        >
                            Anterior
                        </button>
                        <button
                            type="button"
                            disabled={pagination.pageIndex + 1 >= pageCount || isFetching}
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
                kind="evento"
                mode={crudMode}
                initialEvento={editRow}
                canSubmit={canManage}
                onSaveReserva={async () => { }}
                onSaveEvento={async (payload) => {
                    if (crudMode === 'create') await createMut.mutateAsync(payload);
                    else if (editRow) await updateMut.mutateAsync({ id: editRow.id, body: payload });
                }}
            />

            <WhatsAppModal
                open={waOpen}
                onClose={() => setWaOpen(false)}
                token={token}
                kind="evento"
                record={waRow}
                defaultMessage={waRow ? buildWhatsDefaultEvento(waRow) : ''}
            />
        </div>
    );
};

export default EventosTab;
