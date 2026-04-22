import React, { useMemo, useState } from 'react';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { Eye, FilePenLine, FileUp, ShieldOff } from 'lucide-react';

import type { DocumentoGcb } from '@/services/documentosGcbService';
import { formatDocumentSize } from '@/utils/documentosGcbUtils';

const columnHelper = createColumnHelper<DocumentoGcb>();

export type DocumentosGcbTableProps = {
    rows: DocumentoGcb[];
    isLoading: boolean;
    canManage: boolean;
    onView: (doc: DocumentoGcb) => void;
    onEdit: (doc: DocumentoGcb) => void;
    onReplace: (doc: DocumentoGcb) => void;
    onDeactivate: (doc: DocumentoGcb) => void;
};

const DocumentosGcbTable: React.FC<DocumentosGcbTableProps> = ({
    rows,
    isLoading,
    canManage,
    onView,
    onEdit,
    onReplace,
    onDeactivate,
}) => {
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 15 });

    const columns = useMemo(
        () => [
            columnHelper.accessor('codigo', {
                header: 'Código',
                cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
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
                header: 'Acciones',
                cell: ({ row }) => {
                    const doc = row.original;
                    return (
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => onView(doc)}
                                className="inline-flex items-center gap-1 rounded-lg border border-app-border px-2 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-app-card-hover"
                            >
                                <Eye size={13} />
                                Ver
                            </button>
                            {canManage && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onEdit(doc)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-app-border px-2 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-app-card-hover"
                                    >
                                        <FilePenLine size={13} />
                                        Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onReplace(doc)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-app-border px-2 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-app-card-hover"
                                    >
                                        <FileUp size={13} />
                                        Reemplazar
                                    </button>
                                    {doc.activo && (
                                        <button
                                            type="button"
                                            onClick={() => onDeactivate(doc)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-app-border px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-500 hover:bg-red-500/10"
                                        >
                                            <ShieldOff size={13} />
                                            Desactivar
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    );
                },
            }),
        ],
        [canManage, onDeactivate, onEdit, onReplace, onView]
    );

    const table = useReactTable({
        data: rows,
        columns,
        state: { pagination },
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-3">Documentos</h2>
                <div className="overflow-x-auto rounded-2xl border border-app-border">
                    <table className="min-w-full text-left text-xs">
                        <thead>
                            {table.getHeaderGroups().map((hg) => (
                                <tr key={hg.id} className="border-b border-app-border bg-app-input/40">
                                    {hg.headers.map((h) => (
                                        <th
                                            key={h.id}
                                            className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-muted whitespace-nowrap"
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

            {rows.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap text-[10px] text-app-muted font-mono">
                    <span>
                        Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()} · {rows.length} filas
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
            )}
        </div>
    );
};

export default DocumentosGcbTable;
