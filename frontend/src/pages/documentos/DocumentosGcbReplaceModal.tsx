import React, { useEffect, useState } from 'react';

import type { UseMutationResult } from '@tanstack/react-query';

import DocumentosGcbFileDropzone from '@/components/documentos/DocumentosGcbFileDropzone';
import type { DocumentoGcb } from '@/services/documentosGcbService';

export type DocumentosGcbReplaceModalProps = {
    doc: DocumentoGcb | null;
    onClose: () => void;
    replaceMutation: UseMutationResult<DocumentoGcb, Error, { id: number; file: File }>;
    onMutationError?: (error: unknown) => void;
};

const DocumentosGcbReplaceModal: React.FC<DocumentosGcbReplaceModalProps> = ({
    doc,
    onClose,
    replaceMutation,
    onMutationError,
}) => {
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        if (doc) setFile(null);
    }, [doc]);

    if (!doc) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="bg-app-modal-solid border border-app-border rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="doc-gcb-replace-title"
            >
                <div className="flex items-center justify-between gap-4 p-5 border-b border-app-border">
                    <h2 id="doc-gcb-replace-title" className="text-[11px] font-black uppercase tracking-widest text-app-muted">
                        Reemplazar archivo: {doc.codigo}
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
                    className="p-5 flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!file) {
                            window.alert('Seleccione un archivo para reemplazar');
                            return;
                        }
                        replaceMutation.mutate(
                            { id: doc.id, file },
                            {
                                onSuccess: () => onClose(),
                                onError: (err) => onMutationError?.(err),
                            }
                        );
                    }}
                >
                    <p className="text-xs text-app-muted">
                        Archivo actual: <span className="text-app-text font-medium">{doc.archivo_nombre_actual}</span>
                    </p>
                    <DocumentosGcbFileDropzone file={file} onFileChange={setFile} disabled={replaceMutation.isPending} />
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-app-border bg-app-input px-4 py-2 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-surface"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={replaceMutation.isPending}
                            className="rounded-xl bg-teal-500 text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                        >
                            {replaceMutation.isPending ? 'Reemplazando...' : 'Reemplazar archivo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DocumentosGcbReplaceModal;
