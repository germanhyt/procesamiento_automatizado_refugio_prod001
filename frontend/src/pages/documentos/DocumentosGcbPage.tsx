import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';
import type { PaginationState, Updater } from '@tanstack/react-table';

import AppSelect from '@/components/ui/AppSelect';
import { useAuth } from '@/context/AuthContext';
import {
    DOCUMENTOS_GCB_PAGE_SIZE,
    useDocumentosGcbFilterMeta,
    useDocumentosGcbList,
    useDocumentosGcbMutations,
} from '@/hooks/useDocumentosGcb';
import type { DocumentoGcb } from '@/services/documentosGcbService';
import { documentosGcbService } from '@/services/documentosGcbService';
import { userHasCodename } from '@/utils/documentosGcbUtils';

import DocumentosGcbEditModal from '@/pages/documentos/DocumentosGcbEditModal';
import DocumentosGcbRegisterModal from '@/pages/documentos/DocumentosGcbRegisterModal';
import DocumentosGcbReplaceModal from '@/pages/documentos/DocumentosGcbReplaceModal';
import DocumentosGcbTable from '@/pages/documentos/DocumentosGcbTable';
import DocumentosGcbViewerModal from '@/pages/documentos/DocumentosGcbViewerModal';

const DocumentosGcbPage: React.FC = () => {
    const { token, user } = useAuth();
    const t = token ?? '';
    const canManage = userHasCodename(user, 'documentos_gcb:manage');

    const [q, setQ] = useState('');
    const [coleccion, setColeccion] = useState('');
    const [categoria, setCategoria] = useState('');
    const [soloActivos, setSoloActivos] = useState(true);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: DOCUMENTOS_GCB_PAGE_SIZE,
    });

    useEffect(() => {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, [q, coleccion, categoria, soloActivos]);

    const onPaginationChange = useCallback((updater: Updater<PaginationState>) => {
        setPagination((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    }, []);

    const docsQuery = useDocumentosGcbList({
        q,
        coleccion,
        categoria,
        soloActivos,
        skip: pagination.pageIndex * pagination.pageSize,
        limit: pagination.pageSize,
    });
    const filterMetaQuery = useDocumentosGcbFilterMeta({ soloActivos });
    const { create, update, replaceFile, deactivate, invalidate } = useDocumentosGcbMutations();

    const docs = docsQuery.data?.items ?? [];
    const docsTotal = docsQuery.data?.total ?? 0;
    const metaDocs = filterMetaQuery.data?.items ?? [];

    const colecciones = useMemo(() => {
        const set = new Set(metaDocs.map((d) => d.coleccion));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [metaDocs]);

    const categorias = useMemo(() => {
        const set = new Set(
            metaDocs.filter((d) => !coleccion || d.coleccion === coleccion).map((d) => d.categoria)
        );
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [metaDocs, coleccion]);

    const [registerOpen, setRegisterOpen] = useState(false);
    const [editDoc, setEditDoc] = useState<DocumentoGcb | null>(null);
    const [replaceDoc, setReplaceDoc] = useState<DocumentoGcb | null>(null);

    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerName, setViewerName] = useState('');
    const [viewerMime, setViewerMime] = useState('');
    const [viewerUrl, setViewerUrl] = useState('');
    const [viewerLoading, setViewerLoading] = useState(false);
    const [bulkDownloadBusy, setBulkDownloadBusy] = useState(false);

    const coleccionOptions = useMemo(
        () => [
            { value: '', label: 'Todas las colecciones' },
            ...colecciones.map((c) => ({ value: c, label: c })),
        ],
        [colecciones]
    );

    const categoriaOptions = useMemo(
        () => [
            { value: '', label: 'Todas las categorías' },
            ...categorias.map((c) => ({ value: c, label: c })),
        ],
        [categorias]
    );

    const inputCls =
        'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';

    const showError = (error: unknown) => {
        const ax = error as { response?: { data?: unknown } };
        const data = ax.response?.data;
        if (data instanceof Blob) {
            void (async () => {
                try {
                    const text = await data.text();
                    let detail = text;
                    try {
                        const j = JSON.parse(text) as { detail?: unknown };
                        if (j && typeof j === 'object' && j.detail != null) {
                            detail = String(j.detail);
                        }
                    } catch {
                        /* usar texto bruto */
                    }
                    window.alert(detail || 'Error');
                } catch {
                    window.alert('Error inesperado');
                }
            })();
            return;
        }
        const detail =
            (data as { detail?: string } | undefined)?.detail ||
            (error as Error).message ||
            'Error inesperado';
        window.alert(detail);
    };

    const closeViewer = () => {
        if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        setViewerOpen(false);
        setViewerName('');
        setViewerMime('');
        setViewerUrl('');
        setViewerLoading(false);
    };

    const handleDownload = async (doc: DocumentoGcb) => {
        try {
            await documentosGcbService.downloadFile(t, doc.id, doc.archivo_nombre_actual);
        } catch (error) {
            showError(error);
        }
    };

    const handleDownloadMany = async (list: DocumentoGcb[]) => {
        if (!list.length) return;
        setBulkDownloadBusy(true);
        try {
            await documentosGcbService.downloadZip(
                t,
                list.map((d) => d.id)
            );
        } catch (error) {
            showError(error);
        } finally {
            setBulkDownloadBusy(false);
        }
    };

    const handleViewFile = async (doc: DocumentoGcb) => {
        if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        setViewerUrl('');
        setViewerOpen(true);
        setViewerLoading(true);
        setViewerName(doc.archivo_nombre_actual);
        setViewerMime(doc.mime_type);
        try {
            const objectUrl = await documentosGcbService.getFileObjectUrl(t, doc.id);
            setViewerUrl(objectUrl);
        } catch (error) {
            showError(error);
            closeViewer();
        } finally {
            setViewerLoading(false);
        }
    };

    const handleDeactivate = async (doc: DocumentoGcb) => {
        const res = await Swal.fire({
            icon: 'warning',
            title: '¿Desactivar este documento?',
            text: `${doc.codigo} — ${doc.nombre}`,
            showCancelButton: true,
            confirmButtonText: 'Desactivar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#14b8a6',
            cancelButtonColor: '#52525b',
            background: '#0a0a0a',
            color: '#fff',
        });
        if (!res.isConfirmed) return;
        deactivate.mutate(doc.id, { onError: showError });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase text-app-text">Documentos GCB</h1>
                    <p className="text-sm text-app-muted mt-1">Gestión documental con visor y reemplazo de archivo</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                    <button
                        type="button"
                        onClick={() => invalidate()}
                        className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-input px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-card-hover transition-colors"
                    >
                        <RefreshCw size={15} className={docsQuery.isFetching ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => setRegisterOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-input px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-card-hover transition-colors"
                            style={{ backgroundColor: 'var(--app-documentos-accent-strong)' }}
                        >
                            <Plus size={15} />
                            Nuevo documento
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-app-card border border-app-border rounded-3xl p-5 sm:p-6 space-y-5">
                <section className="space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Filtros</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:items-end">
                        <div className="md:col-span-1">
                            <label htmlFor="doc-gcb-q" className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1">
                                Búsqueda
                            </label>
                            <input
                                id="doc-gcb-q"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Código, nombre o archivo"
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <span className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1">Colección</span>
                            <AppSelect
                                options={coleccionOptions}
                                value={coleccionOptions.find((o) => o.value === coleccion) ?? null}
                                onChange={(opt) => {
                                    setColeccion(opt?.value ?? '');
                                    setCategoria('');
                                }}
                                placeholder="Todas las colecciones"
                                isClearable={false}
                                size="sm"
                            />
                        </div>
                        <div>
                            <span className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1">Categoría</span>
                            <AppSelect
                                options={categoriaOptions}
                                value={categoriaOptions.find((o) => o.value === categoria) ?? null}
                                onChange={(opt) => setCategoria(opt?.value ?? '')}
                                placeholder="Todas las categorías"
                                isClearable={false}
                                size="sm"
                            />
                        </div>
                        <div className="rounded-xl border border-app-border bg-app-input px-3 py-2.5 flex items-center gap-3 min-h-[42px]">
                            <input
                                id="doc-gcb-solo-activos"
                                type="checkbox"
                                checked={soloActivos}
                                onChange={(e) => setSoloActivos(e.target.checked)}
                                className="size-4 shrink-0 rounded border-app-border bg-app-input accent-(--app-accent)"
                            />
                            <label htmlFor="doc-gcb-solo-activos" className="text-xs text-app-text cursor-pointer select-none font-medium">
                                Solo activos
                            </label>
                        </div>
                    </div>
                </section>

                <DocumentosGcbTable
                    rows={docs}
                    total={docsTotal}
                    pagination={pagination}
                    onPaginationChange={onPaginationChange}
                    isLoading={docsQuery.isLoading}
                    isFetching={docsQuery.isFetching}
                    canManage={canManage}
                    bulkDownloadBusy={bulkDownloadBusy}
                    onView={handleViewFile}
                    onDownload={handleDownload}
                    onDownloadMany={handleDownloadMany}
                    onEdit={(doc) => setEditDoc(doc)}
                    onReplace={(doc) => setReplaceDoc(doc)}
                    onDeactivate={handleDeactivate}
                />
            </div>

            <DocumentosGcbRegisterModal
                open={registerOpen}
                onClose={() => setRegisterOpen(false)}
                createMutation={create}
                onMutationError={showError}
            />

            <DocumentosGcbEditModal
                doc={editDoc}
                onClose={() => setEditDoc(null)}
                updateMutation={update}
                onMutationError={showError}
            />

            <DocumentosGcbReplaceModal
                doc={replaceDoc}
                onClose={() => setReplaceDoc(null)}
                replaceMutation={replaceFile}
                onMutationError={showError}
            />

            <DocumentosGcbViewerModal
                open={viewerOpen}
                title={viewerName}
                mimeType={viewerMime}
                objectUrl={viewerUrl}
                loading={viewerLoading}
                onClose={closeViewer}
            />
        </div>
    );
};

export default DocumentosGcbPage;
