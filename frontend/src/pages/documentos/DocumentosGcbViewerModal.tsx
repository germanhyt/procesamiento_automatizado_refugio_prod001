import React from 'react';

export type DocumentosGcbViewerModalProps = {
    open: boolean;
    title: string;
    mimeType: string;
    objectUrl: string;
    loading: boolean;
    onClose: () => void;
};

const DocumentosGcbViewerModal: React.FC<DocumentosGcbViewerModalProps> = ({
    open,
    title,
    mimeType,
    objectUrl,
    loading,
    onClose,
}) => {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="w-full max-w-6xl max-h-[90vh] rounded-3xl border border-app-border overflow-hidden flex flex-col shadow-xl bg-app-modal-solid"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="doc-gcb-viewer-title"
            >
                <div className="px-4 py-3 border-b border-app-border flex items-center justify-between gap-3 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Visor</p>
                        <p id="doc-gcb-viewer-title" className="text-sm truncate text-app-text">
                            {title}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-xl border border-app-border bg-app-input px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-surface"
                    >
                        Cerrar
                    </button>
                </div>

                <div className="flex-1 p-3 sm:p-5 min-h-0 overflow-auto">
                    {loading && (
                        <div className="h-[50vh] w-full flex items-center justify-center text-sm text-app-muted">Cargando archivo...</div>
                    )}
                    {!loading && objectUrl && (
                        <div className="h-[min(70vh,720px)] w-full rounded-xl overflow-hidden bg-app-bg border border-app-border">
                            {mimeType.includes('pdf') ? (
                                <iframe title="visor-pdf" src={objectUrl} className="h-full w-full min-h-[50vh]" />
                            ) : (
                                <img src={objectUrl} alt={title} className="h-full w-full object-contain max-h-[70vh]" />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DocumentosGcbViewerModal;
