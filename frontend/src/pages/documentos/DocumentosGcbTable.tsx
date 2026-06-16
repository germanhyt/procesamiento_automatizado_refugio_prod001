import React, { useMemo, useState } from 'react';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type PaginationState,
    type RowSelectionState,
    type Updater,
} from '@tanstack/react-table';
import { Download, Eye, FilePenLine, FileUp, ShieldOff } from 'lucide-react';

import type { DocumentoGcb } from '@/services/documentosGcbService';
import { formatDocumentSize } from '@/utils/documentosGcbUtils';
import { formatRegistrationDateTime } from '@/utils/formatDateTime';

const columnHelper = createColumnHelper<DocumentoGcb>();

export type DocumentosGcbTableProps = {
    rows: DocumentoGcb[];
    total: number;
    pagination: PaginationState;
    onPaginationChange: (updater: Updater<PaginationState>) => void;
    isLoading: boolean;
    isFetching?: boolean;
    canManage: boolean;
    bulkDownloadBusy?: boolean;
    onView: (doc: DocumentoGcb) => void;
    onDownload: (doc: DocumentoGcb) => void;
    onDownloadMany: (docs: DocumentoGcb[]) => Promise<void>;
    onEdit: (doc: DocumentoGcb) => void;
    onReplace: (doc: DocumentoGcb) => void;
    onDeactivate: (doc: DocumentoGcb) => void;
};

const DocumentosGcbTable: React.FC<DocumentosGcbTableProps> = ({
    rows,
    total,
    pagination,
    onPaginationChange,
    isLoading,
    isFetching = false,
    canManage,
    bulkDownloadBusy = false,
    onView,
    onDownload,
    onDownloadMany,
    onEdit,
    onReplace,
    onDeactivate,
}) => {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const selectedDocs = useMemo(
        () => rows.filter((r) => rowSelection[String(r.id)]),
        [rows, rowSelection]
    );
    const selectedCount = selectedDocs.length;
    const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

    const columns = useMemo(
        () => [
            columnHelper.display({
                id: 'select',
                header: ({ table }) => (
                    <input
                        type="checkbox"
                        aria-label="Seleccionar filas de esta página"
                        checked={table.getIsAllPageRowsSelected()}
                        ref={(el) => {
                            if (el) {
                                el.indeterminate =
                                    table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
                            }
                        }}
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                        className="size-4 shrink-0 rounded border-app-border bg-app-input accent-(--app-accent)"
                    />
                ),
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        aria-label={`Seleccionar ${row.original.codigo}`}
                        checked={row.getIsSelected()}
                        disabled={!row.getCanSelect()}
                        onChange={row.getToggleSelectedHandler()}
                        className="size-4 shrink-0 rounded border-app-border bg-app-input accent-(--app-accent)"
                    />
                ),
            }),
            columnHelper.accessor('codigo', {
                header: 'Código',
                cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
            }),
            columnHelper.accessor('created_at', {
                header: 'Registro',
                cell: (info) => (
                    <span className="text-[10px] font-mono text-app-muted whitespace-nowrap">
                        {formatRegistrationDateTime(info.getValue())}
                    </span>
                ),
            }),
            columnHelper.accessor('nombre', {
                header: 'Documento',
                cell: (info) => {
                    const row = info.row.original;
                    return (
                        <div>
                            <div className="font-semibold">{info.getValue()}</div>
                            <div className="text-xs text-app-muted">{row.subcategoria || '—'}</div>
                        </div>
                    );
                },
            }),
            columnHelper.display({
                id: 'coleccion_categoria',
                header: 'Colección / Categoría',
                cell: ({ row }) => (
                    <span className="text-xs">
                        {row.original.coleccion} / {row.original.categoria}
                    </span>
                ),
            }),
            columnHelper.display({
                id: 'archivo',
                header: 'Archivo',
                cell: ({ row }) => (
                    <div className="text-xs">
                        <div>{row.original.archivo_nombre_actual}</div>
                        <div className="text-app-muted">{formatDocumentSize(row.original.tamano_bytes)}</div>
                    </div>
                ),
            }),
            columnHelper.accessor('activo', {
                header: 'Estado',
                cell: (info) => {
                    const activo = info.getValue();
                    return (
                        <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                activo ? 'doc-gcb-estado--activo' : 'doc-gcb-estado--inactivo'
                            }`}
                        >
                            {activo ? 'Activo' : 'Inactivo'}
                        </span>
                    );
                },
            }),
            columnHelper.display({
                id: 'acciones',
                header: '',
                cell: ({ row }) => {
                    const doc = row.original;
                    return (
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                            <button
                                type="button"
                                title="Ver"
                                aria-label="Ver"
                                onClick={() => onView(doc)}
                                className="p-2 rounded-lg hover:bg-app-card-hover text-app-muted hover:text-app-accent"
                            >
                                <Eye size={16} />
                            </button>
                            <button
                                type="button"
                                title="Descargar"
                                aria-label="Descargar"
                                onClick={() => onDownload(doc)}
                                className="p-2 rounded-lg hover:bg-app-card-hover text-app-accent"
                            >
                                <Download size={16} />
                            </button>
                            {canManage && (
                                <>
                                    <button
                                        type="button"
                                        title="Editar"
                                        aria-label="Editar"
                                        onClick={() => onEdit(doc)}
                                        className="p-2 rounded-lg hover:bg-app-card-hover text-app-muted"
                                    >
                                        <FilePenLine size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        title="Reemplazar archivo"
                                        aria-label="Reemplazar archivo"
                                        onClick={() => onReplace(doc)}
                                        className="p-2 rounded-lg hover:bg-app-card-hover text-app-muted"
                                    >
                                        <FileUp size={16} />
                                    </button>
                                    {doc.activo && (
                                        <button
                                            type="button"
                                            title="Desactivar"
                                            aria-label="Desactivar"
                                            onClick={() => onDeactivate(doc)}
                                            className="p-2 rounded-lg hover:bg-app-danger-muted text-app-danger"
                                        >
                                            <ShieldOff size={16} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    );
                },
            }),
        ],
        [canManage, onDeactivate, onDownload, onEdit, onReplace, onView]
    );

    const table = useReactTable({
        data: rows,
        columns,
        getRowId: (row) => String(row.id),
        state: { pagination, rowSelection },
        onPaginationChange,
        onRowSelectionChange: setRowSelection,
        enableRowSelection: true,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        manualPagination: true,
        pageCount,
    });

    return (
        <div className="space-y-4">
            <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Documentos</h2>
                    {total > 0 && selectedCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                            <button
                                type="button"
                                disabled={bulkDownloadBusy}
                                onClick={() => onDownloadMany(selectedDocs)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-app-border bg-app-input px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-accent hover:bg-app-card-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
                            >
                                <Download size={14} />
                                ZIP selección ({selectedCount})
                            </button>
                        </div>
                    )}
                </div>
                <div className="overflow-x-auto rounded-2xl border border-app-border relative">
                    {isFetching && !isLoading && (
                        <div className="absolute top-2 right-3 z-10 flex items-center gap-2 rounded-lg border border-app-border bg-app-input px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-app-muted">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-app-accent-muted border-t-app-accent" />
                            Actualizando…
                        </div>
                    )}
                    <table className="min-w-full text-left text-xs">
                        <thead>
                            {table.getHeaderGroups().map((hg) => (
                                <tr key={hg.id} className="border-b border-app-border bg-app-input/40">
                                    {hg.headers.map((h) => (
                                        <th
                                            key={h.id}
                                            className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-table-head whitespace-nowrap"
                                        >
                                            {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-app-muted">
                                        Cargando documentos...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-app-muted">
                                        No hay documentos para los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <tr key={row.id} className="border-b border-app-border/80 hover:bg-app-input/20">
                                        {row.getVisibleCells().map((cell) => (
                                            <td key={cell.id} className="px-3 py-2 align-top text-app-text">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {total > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap text-[10px] text-app-muted font-mono">
                    <span>
                        {total} documentos (pág. {pagination.pageIndex + 1} / {pageCount})
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
            )}
        </div>
    );
};

export default DocumentosGcbTable;
