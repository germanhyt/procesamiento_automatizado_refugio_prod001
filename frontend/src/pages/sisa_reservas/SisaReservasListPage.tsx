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
import { CalendarRange, LayoutGrid, MessageCircle, Pencil, Plus, Trash2, Webhook } from 'lucide-react';
import Swal from 'sweetalert2';

import { useAuth } from '@/context/AuthContext';
import AppSelect, { type AppSelectOption } from '@/components/ui/AppSelect';
import {
    PERMISSION_SISA_RESERVAS_MANAGE,
    buildSisaWhatsDefaultMessage,
    sisaEstadoBadgeClass,
    sisaEstadoLabel,
    type SisaEstadoReserva,
} from '@/constants/sisaReservas';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    SISA_LIST_STALE_MS,
    createSisaReserva,
    deleteSisaReserva,
    listSisaMesas,
    listSisaReservas,
    listSisaZonas,
    patchSisaReservaEstado,
    updateSisaReserva,
    type SisaMesa,
    type SisaReservaPayload,
    type SisaReservaRegistro,
    type SisaZona,
} from '@/services/sisaReservasService';
import { userHasCodename } from '@/utils/documentosGcbUtils';

import SisaEstadoModal from '@/pages/sisa_reservas/SisaEstadoModal';
import SisaNotificacionesModal from '@/pages/sisa_reservas/SisaNotificacionesModal';
import SisaReservaFormModal from '@/pages/sisa_reservas/SisaReservaFormModal';
import SisaWhatsAppModal from '@/pages/sisa_reservas/SisaWhatsAppModal';
import SisaZonaMesaModal from '@/pages/sisa_reservas/SisaZonaMesaModal';
import { sisaAxiosDetail, sisaSwalError, sisaSwalSuccess } from '@/pages/sisa_reservas/sisaReservasSwal';

/** Referencia estable cuando la query aún no tiene datos (evita reinicios del formulario en cada render). */
const EMPTY_SISA_ZONAS: SisaZona[] = [];
const EMPTY_SISA_MESAS: SisaMesa[] = [];

const PAGE_SIZE = 15;
const columnHelper = createColumnHelper<SisaReservaRegistro>();

const SisaReservasListPage: React.FC = () => {
    const { token, user } = useAuth();
    const authToken = token ?? '';
    const canManage = userHasCodename(user, PERMISSION_SISA_RESERVAS_MANAGE);
    const qc = useQueryClient();

    const [nombreInput, setNombreInput] = useState('');
    const nombre = useDebouncedValue(nombreInput, 320);
    const [fechaFiltro, setFechaFiltro] = useState('');
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [zonaFiltro, setZonaFiltro] = useState<number | ''>('');

    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });

    const [crudOpen, setCrudOpen] = useState(false);
    const [crudMode, setCrudMode] = useState<'create' | 'edit'>('create');
    const [editRow, setEditRow] = useState<SisaReservaRegistro | null>(null);

    const [waOpen, setWaOpen] = useState(false);
    const [waRow, setWaRow] = useState<SisaReservaRegistro | null>(null);

    const [zonaMesaOpen, setZonaMesaOpen] = useState(false);

    const [notifOpen, setNotifOpen] = useState(false);

    const [estadoModalOpen, setEstadoModalOpen] = useState(false);
    const [estadoRow, setEstadoRow] = useState<SisaReservaRegistro | null>(null);

    const { data: zonasData } = useQuery({
        queryKey: ['sisa-zonas'],
        queryFn: () => listSisaZonas(authToken),
        enabled: !!authToken,
        staleTime: SISA_LIST_STALE_MS,
    });
    const zonas = zonasData ?? EMPTY_SISA_ZONAS;

    const { data: mesasData } = useQuery({
        queryKey: ['sisa-mesas-all'],
        queryFn: () => listSisaMesas(authToken),
        enabled: !!authToken,
        staleTime: SISA_LIST_STALE_MS,
    });
    const mesas = mesasData ?? EMPTY_SISA_MESAS;

    const zonaMap = useMemo(() => Object.fromEntries(zonas.map((z) => [z.id, z.nombre])), [zonas]);
    const mesaMap = useMemo(() => Object.fromEntries(mesas.map((m) => [m.id, m.numero])), [mesas]);

    const estadoFilterOptions: AppSelectOption<string>[] = useMemo(
        () => [
            { value: '', label: 'Todos los estados' },
            { value: 'pendiente', label: sisaEstadoLabel('pendiente') },
            { value: 'confirmado', label: sisaEstadoLabel('confirmado') },
            { value: 'en_proceso_atencion', label: sisaEstadoLabel('en_proceso_atencion') },
            { value: 'atendido', label: sisaEstadoLabel('atendido') },
            { value: 'finalizado', label: sisaEstadoLabel('finalizado') },
            { value: 'cancelado', label: sisaEstadoLabel('cancelado') },
        ],
        []
    );

    const zonaFilterOptions: AppSelectOption<number | ''>[] = useMemo(
        () => [{ value: '', label: 'Todas las zonas' }, ...zonas.map((z) => ({ value: z.id, label: z.nombre }))],
        [zonas]
    );

    const selectedZonaFiltro = zonaFilterOptions.find((o) => o.value === zonaFiltro) ?? zonaFilterOptions[0];

    useEffect(() => {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, [nombre, fechaFiltro, estadoFiltro, zonaFiltro]);

    const queryKey = ['sisa-reservas', nombre, fechaFiltro, estadoFiltro, zonaFiltro] as const;

    const { data, isLoading, isFetching, isError } = useQuery({
        queryKey,
        queryFn: () =>
            listSisaReservas(authToken, {
                skip: 0,
                limit: 500,
                nombre: nombre.trim() || undefined,
                fecha: fechaFiltro || undefined,
                estado: estadoFiltro || undefined,
                zona_id: zonaFiltro === '' ? undefined : zonaFiltro,
            }),
        enabled: !!authToken,
        staleTime: SISA_LIST_STALE_MS,
        placeholderData: keepPreviousData,
    });

    const rows = data?.items ?? [];

    const onPaginationChange = useCallback((updater: Updater<PaginationState>) => {
        setPagination((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    }, []);

    const createMut = useMutation({
        mutationFn: (body: SisaReservaPayload) => createSisaReserva(authToken, body),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['sisa-reservas'] });
            void sisaSwalSuccess('Reserva creada');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const updateMut = useMutation({
        mutationFn: (args: { id: number; body: Partial<SisaReservaPayload> }) => updateSisaReserva(authToken, args.id, args.body),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['sisa-reservas'] });
            void sisaSwalSuccess('Reserva actualizada');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => deleteSisaReserva(authToken, id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['sisa-reservas'] });
            void sisaSwalSuccess('Reserva eliminada');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const patchEstadoMut = useMutation({
        mutationFn: (args: { id: number; estado: SisaEstadoReserva }) => patchSisaReservaEstado(authToken, args.id, args.estado),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['sisa-reservas'] });
            void sisaSwalSuccess('Estado actualizado');
        },
        onError: (e) => void sisaSwalError(sisaAxiosDetail(e)),
    });

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: 'ID',
                cell: (i) => <span className="font-mono text-app-muted text-xs">{i.getValue()}</span>,
                size: 52,
            }),
            columnHelper.accessor('nombre_completo', {
                header: 'Cliente',
                cell: (i) => <span className="font-semibold truncate max-w-[140px] block">{i.getValue()}</span>,
            }),
            columnHelper.display({
                id: 'tel',
                header: 'Teléfono',
                cell: ({ row }) => (
                    <span className="font-mono text-[10px] whitespace-nowrap">
                        {row.original.codigo_telefonico} {row.original.numero_telefono}
                    </span>
                ),
            }),
            // correo
            columnHelper.accessor('email', {
                header: 'Correo',
                cell: (i) => <span className="text-[11px] break-all">{i.getValue()}</span>,
            }),
            columnHelper.accessor('fecha_reserva', {
                header: 'Fecha',
                cell: (i) => <span className="text-[11px]">{i.getValue()}</span>,
            }),
            columnHelper.accessor('hora_reserva', {
                header: 'Hora',
                cell: (i) => <span className="text-[11px] font-mono">{(i.getValue() as string).slice(0, 5)}</span>,
            }),
            columnHelper.accessor('motivo_reserva', {
                header: 'Motivo',
                cell: (i) => <span className="text-xs truncate max-w-[120px] block">{i.getValue()}</span>,
            }),
            columnHelper.accessor('numero_personas', {
                header: 'Pers.',
                cell: (i) => <span className="tabular-nums">{i.getValue()}</span>,
            }),
            columnHelper.display({
                id: 'zona',
                header: 'Zona',
                cell: ({ row }) => (
                    <span className="text-xs">{zonaMap[row.original.zona_id] ?? `#${row.original.zona_id}`}</span>
                ),
            }),
            columnHelper.display({
                id: 'mesa',
                header: 'Mesa',
                cell: ({ row }) => (
                    <span className="text-[11px] font-mono">
                        {row.original.mesa_id == null ? '—' : mesaMap[row.original.mesa_id] ?? `#${row.original.mesa_id}`}
                    </span>
                ),
            }),
            columnHelper.accessor('estado', {
                header: 'Estado',
                cell: ({ row, getValue }) => (
                    <button
                        type="button"
                        title={canManage ? 'Cambiar estado' : undefined}
                        disabled={!canManage}
                        onClick={() => {
                            if (!canManage) return;
                            setEstadoRow(row.original);
                            setEstadoModalOpen(true);
                        }}
                        className={`${sisaEstadoBadgeClass(getValue())} ${canManage ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                    >
                        {sisaEstadoLabel(getValue())}
                    </button>
                ),
            }),
            columnHelper.display({
                id: 'acciones',
                header: '',
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                        {canManage && (
                            <>
                                <button
                                    type="button"
                                    title="WhatsApp"
                                    aria-label="WhatsApp"
                                    className="p-2 rounded-lg hover:bg-app-card-hover text-[var(--app-sisa-reservas-accent)]"
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
                                    aria-label="Editar"
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
                                    aria-label="Eliminar"
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
        [canManage, deleteMut, mesaMap, zonaMap]
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
        return <p className="text-app-muted text-sm">Inicie sesión para ver reservas.</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase text-app-text">Reservas Sisa</h1>
                    <p className="text-sm text-app-muted mt-1">Listado con filtros, zonas, mesas y estados de atención</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end shrink-0">
                    <button
                        type="button"
                        onClick={() => setNotifOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-input px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-card-hover transition-colors"
                    >
                        <Webhook size={16} /> Notificaciones
                    </button>
                    {canManage && (
                        <>
                            <button
                                type="button"
                                onClick={() => setZonaMesaOpen(true)}
                                className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-input px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-card-hover transition-colors"
                            >
                                <LayoutGrid size={16} /> Zonas y mesas
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditRow(null);
                                    setCrudMode('create');
                                    setCrudOpen(true);
                                }}
                                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:opacity-95 transition-opacity"
                                style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                            >
                                <Plus size={16} /> Nueva reserva
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="bg-app-card border border-app-border rounded-3xl p-5 sm:p-6 space-y-5">
                <section className="space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Filtros</h2>
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="mb-2">
                            <CalendarRange size={18} className="shrink-0 text-[var(--app-sisa-reservas-accent)]" />
                        </div>
                        <input
                            placeholder="Buscar por nombre…"
                            className="rounded-xl border border-app-border bg-app-input px-4 py-2 text-sm text-app-text placeholder:text-app-muted min-w-[200px]"
                            value={nombreInput}
                            onChange={(e) => setNombreInput(e.target.value)}
                            autoComplete="off"
                        />
                        <div>
                            <label
                                htmlFor="sisa-reserva-fecha-filtro"
                                className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1"
                            >
                                Fecha
                            </label>
                            <input
                                id="sisa-reserva-fecha-filtro"
                                type="date"
                                className="rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm text-app-text min-w-[160px]"
                                value={fechaFiltro}
                                onChange={(e) => setFechaFiltro(e.target.value)}
                            />
                        </div>
                        <div className="w-[200px] min-w-[180px]">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1">
                                Estado
                            </span>
                            <AppSelect<string>
                                options={estadoFilterOptions}
                                value={estadoFilterOptions.find((o) => o.value === estadoFiltro) ?? estadoFilterOptions[0]}
                                onChange={(o) => setEstadoFiltro(o?.value ?? '')}
                                isSearchable={false}
                                size="sm"
                            />
                        </div>
                        <div className="w-[200px] min-w-[180px]">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1">
                                Zona
                            </span>
                            <AppSelect<number | ''>
                                options={zonaFilterOptions}
                                value={selectedZonaFiltro}
                                onChange={(o) => setZonaFiltro(o?.value ?? '')}
                                isSearchable
                                size="sm"
                            />
                        </div>
                    </div>
                </section>

                <div className="overflow-x-auto rounded-2xl border border-app-border relative">
                    {isFetching && !isLoading && (
                        <div className="absolute top-2 right-3 z-10 flex items-center gap-2 rounded-lg border border-app-border bg-app-input px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-app-muted">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--app-sisa-reservas-accent-muted)] border-t-[var(--app-sisa-reservas-accent)]" />
                            Actualizando…
                        </div>
                    )}
                    {isError && (
                        <p className="p-6 text-app-danger text-sm">Error al cargar reservas. Verifique permisos e intente de nuevo.</p>
                    )}
                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <div className="w-10 h-10 border-4 rounded-full animate-spin border-[var(--app-sisa-reservas-accent-muted)] border-t-[var(--app-sisa-reservas-accent)]" />
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
                                            No hay reservas para los filtros seleccionados.
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
            </div>

            <SisaReservaFormModal
                open={crudOpen}
                onClose={() => setCrudOpen(false)}
                token={authToken}
                user={user}
                mode={crudMode}
                initial={editRow}
                zonas={zonas}
                onSave={async (body) => {
                    if (crudMode === 'create') await createMut.mutateAsync(body);
                    else if (editRow) await updateMut.mutateAsync({ id: editRow.id, body });
                }}
            />

            <SisaWhatsAppModal
                open={waOpen}
                onClose={() => setWaOpen(false)}
                token={authToken}
                record={waRow}
                defaultMessage={waRow ? buildSisaWhatsDefaultMessage(waRow) : ''}
            />

            <SisaZonaMesaModal open={zonaMesaOpen} onClose={() => setZonaMesaOpen(false)} token={authToken} />

            <SisaNotificacionesModal
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                token={authToken}
                canManage={canManage}
            />

            <SisaEstadoModal
                open={estadoModalOpen}
                onClose={() => setEstadoModalOpen(false)}
                current={(estadoRow?.estado ?? 'pendiente') as SisaEstadoReserva}
                disabled={patchEstadoMut.isPending}
                onPick={(e) => {
                    if (estadoRow) patchEstadoMut.mutate({ id: estadoRow.id, estado: e });
                }}
            />
        </div>
    );
};

export default SisaReservasListPage;
