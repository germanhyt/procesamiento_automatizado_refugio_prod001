import React, { useEffect, useState } from 'react';

import type { UseMutationResult } from '@tanstack/react-query';

import type { DocumentoGcb } from '@/services/documentosGcbService';

export type DocumentosGcbEditModalProps = {
    doc: DocumentoGcb | null;
    onClose: () => void;
    updateMutation: UseMutationResult<
        DocumentoGcb,
        Error,
        { id: number; body: { nombre?: string; subcategoria?: string | null; descripcion?: string | null; activo?: boolean } }
    >;
    onMutationError?: (error: unknown) => void;
};

const inputCls =
    'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';
const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1';

const DocumentosGcbEditModal: React.FC<DocumentosGcbEditModalProps> = ({ doc, onClose, updateMutation, onMutationError }) => {
    const [nombre, setNombre] = useState('');
    const [subcategoria, setSubcategoria] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [activo, setActivo] = useState(true);

    useEffect(() => {
        if (!doc) return;
        setNombre(doc.nombre);
        setSubcategoria(doc.subcategoria ?? '');
        setDescripcion(doc.descripcion ?? '');
        setActivo(doc.activo);
    }, [doc]);

    if (!doc) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="bg-app-modal-solid border border-app-border rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="doc-gcb-edit-title"
            >
                <div className="flex items-center justify-between gap-4 p-5 border-b border-app-border">
                    <h2 id="doc-gcb-edit-title" className="text-[11px] font-black uppercase tracking-widest text-app-muted">
                        Editar metadatos: {doc.codigo}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-xl bg-app-input hover:bg-app-surface border border-app-border text-[9px] font-black uppercase tracking-widest text-app-text"
                    >
                        Cerrar
                    </button>
                </div>

                <form
                    className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        updateMutation.mutate(
                            {
                                id: doc.id,
                                body: {
                                    nombre: nombre.trim(),
                                    subcategoria: subcategoria.trim() || null,
                                    descripcion: descripcion.trim() || null,
                                    activo,
                                },
                            },
                            {
                                onSuccess: () => onClose(),
                                onError: (err) => onMutationError?.(err),
                            }
                        );
                    }}
                >
                    <div className="md:col-span-2">
                        <label className={labelCls} htmlFor="doc-gcb-edit-nombre">
                            Nombre
                        </label>
                        <input id="doc-gcb-edit-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls} htmlFor="doc-gcb-edit-sub">
                            Subcategoría
                        </label>
                        <input
                            id="doc-gcb-edit-sub"
                            value={subcategoria}
                            onChange={(e) => setSubcategoria(e.target.value)}
                            className={inputCls}
                        />
                    </div>
                    <div className="rounded-xl border border-app-border bg-app-input px-3 py-2.5 flex items-center gap-3 min-h-[42px] self-end">
                        <input
                            id="doc-gcb-edit-activo"
                            type="checkbox"
                            checked={activo}
                            onChange={(e) => setActivo(e.target.checked)}
                            className="size-4 shrink-0 rounded border-app-border bg-app-modal-solid accent-(--app-accent)"
                        />
                        <label htmlFor="doc-gcb-edit-activo" className="text-xs text-app-text cursor-pointer select-none font-medium">
                            Documento activo
                        </label>
                    </div>
                    <div className="md:col-span-2">
                        <label className={labelCls} htmlFor="doc-gcb-edit-desc">
                            Descripción
                        </label>
                        <textarea id="doc-gcb-edit-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={`${inputCls} min-h-24`} />
                    </div>
                    <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-app-border bg-app-input px-4 py-2 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-surface"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={updateMutation.isPending}
                            className="rounded-xl bg-app-accent text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-app-accent-strong disabled:opacity-60"
                        >
                            {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DocumentosGcbEditModal;
