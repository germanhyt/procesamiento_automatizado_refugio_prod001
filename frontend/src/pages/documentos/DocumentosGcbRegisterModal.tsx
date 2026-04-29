import React, { useEffect, useState } from 'react';

import type { UseMutationResult } from '@tanstack/react-query';

import DocumentosGcbFileDropzone from '@/components/documentos/DocumentosGcbFileDropzone';
import type { DocumentoGcb, DocumentosGcbCreatePayload } from '@/services/documentosGcbService';

export type DocumentosGcbRegisterModalProps = {
    open: boolean;
    onClose: () => void;
    createMutation: UseMutationResult<DocumentoGcb, Error, DocumentosGcbCreatePayload>;
    onMutationError?: (error: unknown) => void;
};

const inputCls =
    'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';
const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1';

const DocumentosGcbRegisterModal: React.FC<DocumentosGcbRegisterModalProps> = ({
    open,
    onClose,
    createMutation,
    onMutationError,
}) => {
    const [codigo, setCodigo] = useState('');
    const [nombre, setNombre] = useState('');
    const [coleccion, setColeccion] = useState('GCB');
    const [categoria, setCategoria] = useState('');
    const [subcategoria, setSubcategoria] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        if (!open) return;
        setCodigo('');
        setNombre('');
        setColeccion('GCB');
        setCategoria('');
        setSubcategoria('');
        setDescripcion('');
        setFile(null);
    }, [open]);

    if (!open) return null;

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
                aria-labelledby="doc-gcb-register-title"
            >
                <div className="flex items-center justify-between gap-4 p-5 border-b border-app-border">
                    <h2 id="doc-gcb-register-title" className="text-[11px] font-black uppercase tracking-widest text-app-muted">
                        Registrar documento
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
                        if (!file) {
                            window.alert('Seleccione un archivo');
                            return;
                        }
                        createMutation.mutate(
                            {
                                codigo: codigo.trim(),
                                nombre: nombre.trim(),
                                coleccion: coleccion.trim(),
                                categoria: categoria.trim(),
                                subcategoria: subcategoria.trim() || undefined,
                                descripcion: descripcion.trim() || undefined,
                                file,
                            },
                            {
                                onSuccess: () => onClose(),
                                onError: (err) => onMutationError?.(err),
                            }
                        );
                    }}
                >
                    <div>
                        <label className={labelCls} htmlFor="doc-gcb-reg-codigo">
                            Código
                        </label>
                        <input
                            id="doc-gcb-reg-codigo"
                            value={codigo}
                            onChange={(e) => setCodigo(e.target.value)}
                            required
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls} htmlFor="doc-gcb-reg-nombre">
                            Nombre
                        </label>
                        <input
                            id="doc-gcb-reg-nombre"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            required
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls} htmlFor="doc-gcb-reg-coleccion">
                            Colección
                        </label>
                        <input
                            id="doc-gcb-reg-coleccion"
                            value={coleccion}
                            onChange={(e) => setColeccion(e.target.value)}
                            placeholder="ej: GCB"
                            required
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls} htmlFor="doc-gcb-reg-categoria">
                            Categoría
                        </label>
                        <input
                            id="doc-gcb-reg-categoria"
                            value={categoria}
                            onChange={(e) => setCategoria(e.target.value)}
                            required
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className={labelCls} htmlFor="doc-gcb-reg-sub">
                            Subcategoría
                        </label>
                        <input
                            id="doc-gcb-reg-sub"
                            value={subcategoria}
                            onChange={(e) => setSubcategoria(e.target.value)}
                            placeholder="Opcional"
                            className={inputCls}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <span className={labelCls}>Archivo</span>
                        <DocumentosGcbFileDropzone
                            file={file}
                            onFileChange={setFile}
                            disabled={createMutation.isPending}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className={labelCls} htmlFor="doc-gcb-reg-desc">
                            Descripción
                        </label>
                        <textarea
                            id="doc-gcb-reg-desc"
                            value={descripcion}
                            onChange={(e) => setDescripcion(e.target.value)}
                            placeholder="Opcional"
                            className={`${inputCls} min-h-24`}
                        />
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
                            disabled={createMutation.isPending}
                            className="rounded-xl bg-app-accent text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-app-accent-strong disabled:opacity-60"
                        >
                            {createMutation.isPending ? 'Registrando...' : 'Registrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DocumentosGcbRegisterModal;
