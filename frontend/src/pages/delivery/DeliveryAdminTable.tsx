import React, { useMemo, useState } from 'react';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import AppSelect from '@/components/ui/AppSelect';
import type { AdminCancelIn, Order } from '@/services/deliveryService';
import { orderStatusBadgeClass } from '@/constants/delivery';

function diffMinutes(from: string | null | undefined, to: string | null | undefined): string {
    if (!from || !to) return '—';
    const a = Date.parse(from);
    const b = Date.parse(to);
    if (Number.isNaN(a) || Number.isNaN(b)) return '—';
    return String(Math.max(0, Math.floor((b - a) / 60000)));
}

/** Desde registro en kiosk hasta atención/match; si falta `atendido_at`, usa ahora (caso borde / refresco). */
function kioskWaitMinutes(o: Order): string {
    const da = o.matched_driver_arrival;
    if (!da?.created_at) return '—';
    const end = da.atendido_at ?? new Date().toISOString();
    return diffMinutes(da.created_at, end);
}

function driverLabel(o: Order): string {
    const da = o.matched_driver_arrival;
    if (!da) return '—';
    const parts = [da.placa?.trim(), da.alias_conductor?.trim()].filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
}

/** Hasta entrega desde el instante más temprano entre alta del pedido y llegada al kiosk; incluye espera del driver antes del LISTO (early bird). Sin driver matcheado equivale a crea→entrega. */
function totalE2EIncludingKioskStart(o: Order): string {
    if (!o.entregado_at) return '—';
    const end = Date.parse(o.entregado_at);
    if (Number.isNaN(end)) return '—';
    const crea = Date.parse(o.created_at);
    if (Number.isNaN(crea)) return '—';
    let start = crea;
    const da = o.matched_driver_arrival;
    if (da?.created_at) {
        const kiosk = Date.parse(da.created_at);
        if (!Number.isNaN(kiosk)) start = Math.min(start, kiosk);
    }
    return String(Math.max(0, Math.floor((end - start) / 60000)));
}

const columnHelper = createColumnHelper<Order>();

export type DeliveryAdminTableProps = {
    orders: Order[];
    isLoading: boolean;
    isError: boolean;
    adminStatus: string;
    onAdminStatusChange: (status: string) => void;
    adminStatusOptions: Array<{ value: string; label: string }>;
    admin: {
        markDevolucion: {
            mutate: (id: number, opts?: { onSuccess?: () => void; onError?: () => void }) => void;
            isPending: boolean;
        };
        cancel: {
            mutate: (
                args: { orderId: number; payload: AdminCancelIn },
                opts?: { onSuccess?: () => void; onError?: () => void }
            ) => void;
            isPending: boolean;
        };
        unlock: {
            mutate: (
                args: { orderId: number; payload: { note?: string } },
                opts?: { onSuccess?: () => void; onError?: () => void }
            ) => void;
            isPending: boolean;
        };
    };
    confirm: (opts: { title: string; text: string; confirmText: string; confirmColor?: string }) => Promise<boolean>;
    promptText: (opts: { title: string; label: string; placeholder?: string; required?: boolean }) => Promise<string | null>;
    toast: (opts: { icon: 'success' | 'error' | 'warning' | 'info'; title: string; text?: string }) => Promise<void>;
};

const DeliveryAdminTable: React.FC<DeliveryAdminTableProps> = ({
    orders,
    isLoading,
    isError,
    adminStatus,
    onAdminStatusChange,
    adminStatusOptions,
    admin,
    confirm,
    promptText,
    toast,
}) => {
    const [codigoFilter, setCodigoFilter] = useState('');

    const filtered = useMemo(() => {
        const q = codigoFilter.trim().toLowerCase();
        if (!q) return orders;
        return orders.filter((o) => o.codigo_pedido.toLowerCase().includes(q));
    }, [orders, codigoFilter]);

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: 'ID',
                cell: (info) => <span className="font-mono text-app-muted">{info.getValue()}</span>,
                size: 56,
            }),
            columnHelper.accessor('codigo_pedido', {
                header: 'Código',
                cell: (info) => <span className="font-bold text-app-text truncate max-w-[140px] block">{info.getValue()}</span>,
            }),
            columnHelper.accessor('plataforma', {
                header: 'Plataforma',
                cell: (info) => <span className="text-[10px] font-mono text-app-muted">{info.getValue()}</span>,
            }),
            columnHelper.accessor('estado', {
                header: 'Estado',
                cell: (info) => (
                    <span className={orderStatusBadgeClass(info.getValue())}>{info.getValue()}</span>
                ),
            }),
            columnHelper.display({
                id: 'driver_label',
                header: 'Driver',
                cell: ({ row }) => (
                    <span className="text-[10px] text-app-muted truncate max-w-[120px] block" title={driverLabel(row.original)}>
                        {driverLabel(row.original)}
                    </span>
                ),
            }),
            columnHelper.display({
                id: 'sla_crea_listo',
                header: 'Crea→listo (min)',
                cell: ({ row }) => diffMinutes(row.original.created_at, row.original.listo_at),
            }),
            // columnHelper.accessor('locked_by_runner_id', {
            //     header: 'Lock (Bloqueado)',
            //     cell: (info) => {
            //         const v = info.getValue();
            //         return <span className="text-[10px] font-mono text-app-muted">{v != null ? String(v) : '—'}</span>;
            //     },
            // }),
            columnHelper.display({
                id: 'sla_match',
                header: 'Listo→match (min)',
                cell: ({ row }) => diffMinutes(row.original.listo_at, row.original.match_at),
            }),
            columnHelper.display({
                id: 'sla_kiosk',
                header: 'Driver espera (min)',
                cell: ({ row }) => kioskWaitMinutes(row.original),
            }),
            columnHelper.display({
                id: 'sla_match_recogido',
                header: 'Match→recogido (min)',
                cell: ({ row }) => diffMinutes(row.original.match_at, row.original.recogido_at),
            }),
            columnHelper.display({
                id: 'sla_recogido_entrega',
                header: 'Recogido→entrega (min)',
                cell: ({ row }) => diffMinutes(row.original.recogido_at, row.original.entregado_at),
            }),
            columnHelper.display({
                id: 'sla_entrega',
                header: 'Listo→entrega (min)',
                cell: ({ row }) => diffMinutes(row.original.listo_at, row.original.entregado_at),
            }),
            // columnHelper.display({
            //     id: 'sla_total',
            //     header: 'Total crea→entrega (min)',
            //     cell: ({ row }) => diffMinutes(row.original.created_at, row.original.entregado_at),
            // }),
            columnHelper.display({
                id: 'sla_total_incl_kiosk',
                header: 'Total mín(crea,driver-espera)→entrega (min)',
                cell: ({ row }) => totalE2EIncludingKioskStart(row.original),
            }),
            columnHelper.display({
                id: 'acciones',
                header: () => <span className="block w-full text-center">Acciones</span>,
                cell: ({ row }) => {
                    const o = row.original;
                    return (
                        <div className="flex flex-wrap gap-1 justify-center">
                            <button
                                type="button"
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: 'Marcar devolución',
                                        text: `¿Confirmas marcar DEVOLUCIÓN para ${o.codigo_pedido}?`,
                                        confirmText: 'Marcar',
                                        confirmColor: '#f97316',
                                    });
                                    if (!ok) return;
                                    admin.markDevolucion.mutate(o.id, {
                                        onSuccess: () => void toast({ icon: 'success', title: 'Marcado como devolución' }),
                                        onError: () => void toast({ icon: 'error', title: 'No se pudo marcar' }),
                                    });
                                }}
                                disabled={admin.markDevolucion.isPending}
                                className="px-2 py-1 rounded-lg bg-teal-500 text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                            >
                                Devol.
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const reason = await promptText({
                                        title: 'Cancelar pedido',
                                        label: 'Motivo (reason)',
                                        placeholder: 'Ej: cliente se retiró / error de pedido / duplicado…',
                                        required: true,
                                    });
                                    if (!reason) return;
                                    const note = await promptText({
                                        title: 'Cancelar pedido',
                                        label: 'Nota (opcional)',
                                        placeholder: 'Detalle adicional para auditoría…',
                                        required: false,
                                    });
                                    const ok = await confirm({
                                        title: 'Confirmar cancelación',
                                        text: `¿Confirmas CANCELAR el pedido ${o.codigo_pedido}?`,
                                        confirmText: 'Cancelar',
                                        confirmColor: '#ef4444',
                                    });
                                    if (!ok) return;
                                    admin.cancel.mutate(
                                        { orderId: o.id, payload: { reason, note: note || undefined } },
                                        {
                                            onSuccess: () => void toast({ icon: 'success', title: 'Pedido cancelado' }),
                                            onError: () => void toast({ icon: 'error', title: 'No se pudo cancelar' }),
                                        }
                                    );
                                }}
                                disabled={admin.cancel.isPending}
                                className="px-2 py-1 rounded-lg bg-red-500 text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                            >
                                Cancel.
                            </button>
                            {/* <button
                                type="button"
                                onClick={async () => {
                                    const note = await promptText({
                                        title: 'Unlock pedido',
                                        label: 'Nota (opcional)',
                                        placeholder: 'Motivo del unlock…',
                                    });
                                    const ok = await confirm({
                                        title: 'Confirmar unlock',
                                        text: `¿Confirmas desbloquear el pedido ${o.codigo_pedido}?`,
                                        confirmText: 'Unlock',
                                    });
                                    if (!ok) return;
                                    admin.unlock.mutate(
                                        { orderId: o.id, payload: { note: note || undefined } },
                                        {
                                            onSuccess: () => void toast({ icon: 'success', title: 'Pedido desbloqueado' }),
                                            onError: () => void toast({ icon: 'error', title: 'No se pudo desbloquear' }),
                                        }
                                    );
                                }}
                                disabled={admin.unlock.isPending}
                                className="px-2 py-1 rounded-lg bg-teal-500 text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                            >
                                Unlock (Desbloquear)
                            </button> */}
                        </div>
                    );
                },
            }),
        ],
        [admin, confirm, promptText, toast]
    );

    const table = useReactTable({
        data: filtered,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: { pageSize: 20 },
            sorting: [{ id: 'id', desc: true }],
        },
    });

    return (
        <div className="bg-app-card border border-app-border rounded-3xl p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between flex-wrap">
                <div>
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Admin</h2>
                    {/* <p className="text-[10px] font-mono text-app-muted">Registros con paginación · orden descendente · trazabilidad</p> */}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted shrink-0">Estado</label>
                        <AppSelect
                            options={adminStatusOptions}
                            value={adminStatusOptions.find((o) => o.value === adminStatus) ?? adminStatusOptions[0]}
                            onChange={(opt) => opt && onAdminStatusChange(opt.value)}
                            size="sm"
                            className="min-w-[160px]"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-app-muted shrink-0">Código</label>
                        <input
                            type="search"
                            value={codigoFilter}
                            onChange={(e) => setCodigoFilter(e.target.value)}
                            placeholder="Filtrar…"
                            className="min-w-[140px] rounded-xl border border-app-border bg-app-input px-3 py-2 text-xs text-app-text placeholder:text-app-muted"
                        />
                    </div>
                </div>
            </div>

            {isLoading ? (
                <p className="text-sm text-app-muted">Cargando…</p>
            ) : isError ? (
                <p className="text-sm text-red-400">Error cargando órdenes.</p>
            ) : filtered.length === 0 ? (
                <p className="text-sm text-app-muted">Sin registros que coincidan con los filtros.</p>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-2xl border border-app-border">
                        <table className="w-full text-left text-xs">
                            <thead>
                                {table.getHeaderGroups().map((hg) => (
                                    <tr key={hg.id} className="border-b border-app-border bg-app-input/40">
                                        {hg.headers.map((h) => (
                                            <th
                                                key={h.id}
                                                className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-muted whitespace-nowrap ${h.column.id === 'acciones' ? 'text-center' : ''
                                                    }`}
                                            >
                                                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                                            </th>
                                        ))}
                                    </tr>
                                ))}
                            </thead>
                            <tbody>
                                {table.getRowModel().rows.map((row) => (
                                    <tr key={row.id} className="border-b border-app-border/80 hover:bg-app-input/20">
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className={`px-3 py-2 align-middle text-app-text ${cell.column.id === 'acciones' ? 'text-center' : ''
                                                    }`}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap text-[10px] text-app-muted font-mono">
                        <span>
                            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1} · {filtered.length}{' '}
                            filas
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                                className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-app-text disabled:opacity-40 text-[9px] font-black uppercase tracking-widest"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                                className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-app-text disabled:opacity-40 text-[9px] font-black uppercase tracking-widest"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default DeliveryAdminTable;
