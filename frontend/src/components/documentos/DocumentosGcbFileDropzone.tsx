import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X } from 'lucide-react';

const ACCEPT_DOC_GCB = {
    'application/pdf': ['.pdf'],
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
} as const;

export type DocumentosGcbFileDropzoneProps = {
    file: File | null;
    onFileChange: (file: File | null) => void;
    disabled?: boolean;
    className?: string;
};

const DocumentosGcbFileDropzone: React.FC<DocumentosGcbFileDropzoneProps> = ({
    file,
    onFileChange,
    disabled = false,
    className = '',
}) => {
    const onDrop = useCallback(
        (accepted: File[]) => {
            if (accepted[0]) onFileChange(accepted[0]);
        },
        [onFileChange]
    );

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: ACCEPT_DOC_GCB,
        multiple: false,
        disabled,
        noClick: true,
        noKeyboard: true,
    });

    return (
        <div className={className}>
            <div
                {...getRootProps({
                    className: [
                        'border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center gap-2 transition-all outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--app-accent-muted)',
                        isDragActive ? 'border-app-accent-muted bg-app-accent-muted-bg' : 'border-app-border hover:border-app-accent-muted',
                        disabled ? 'opacity-50 pointer-events-none' : '',
                    ].join(' '),
                })}
            >
                <input {...getInputProps()} />
                <Upload className="text-app-muted shrink-0" size={28} aria-hidden />
                <span className="text-[10px] font-black uppercase tracking-widest text-app-muted text-center">
                    {isDragActive ? 'Suelta el archivo aquí' : 'PDF o imagen · arrastra o elige archivo'}
                </span>
                {file && (
                    <span className="text-xs text-app-text font-medium text-center break-all max-w-full">{file.name}</span>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    <button
                        type="button"
                        onClick={() => open()}
                        disabled={disabled}
                        className="bg-app-accent text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-app-accent-strong transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                        Seleccionar archivo
                    </button>
                    {file && (
                        <button
                            type="button"
                            onClick={() => onFileChange(null)}
                            disabled={disabled}
                            className="inline-flex items-center gap-1 rounded-xl border border-app-border bg-app-input px-3 py-2 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-surface disabled:opacity-40"
                        >
                            <X size={14} aria-hidden />
                            Quitar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DocumentosGcbFileDropzone;
