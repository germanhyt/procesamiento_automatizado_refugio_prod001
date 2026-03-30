import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone, type FileRejection } from 'react-dropzone';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, FileText, Calendar, Loader2, CheckCircle, FolderArchive } from 'lucide-react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';

import logo from '@/assets/logo.png';
import AppSelect from '@/components/ui/AppSelect';
import { LOCATARIOS, type Locatario } from '@/constants/locatarios';
import { fetchSemanaActual, fetchArchivosCierreCaja, uploadFuentesFile, type LocatarioArchivos } from '@/services/fuentesService';

/** CSV, Excel 2007+ (.xlsx) y Excel 97-2003 (.xls). Nombres tipo `ventas_12345.xls` están permitidos. */
const ACCEPT = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls'],
    'text/csv': ['.csv'],
    'application/csv': ['.csv'],
} as const;

function isFuentesAllowedFileName(name: string): boolean {
    const n = name.toLowerCase();
    return n.endsWith('.csv') || n.endsWith('.xlsx') || n.endsWith('.xls');
}

const FuentesDatos: React.FC = () => {
    const queryClient = useQueryClient();
    const [locatario, setLocatario] = useState<Locatario | null>(null);
    const [uploading, setUploading] = useState(false);

    const { data: semana, isLoading: loadingSemana } = useQuery({
        queryKey: ['fuentes-semana'],
        queryFn: fetchSemanaActual,
    });

    const { data: archivosResp, isLoading: loadingArchivos } = useQuery({
        queryKey: ['fuentes-archivos-cierre'],
        queryFn: fetchArchivosCierreCaja,
    });

    const porLocatario: LocatarioArchivos[] = archivosResp?.por_locatario ?? [];

    const uploadManyFiles = useCallback(
        async (files: File[]) => {
            if (!locatario) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Selecciona locatario',
                    text: 'Elige un locatario antes de subir archivos.',
                    background: '#0a0a0a',
                    color: '#fff',
                    confirmButtonColor: '#14b8a6',
                });
                return;
            }
            const valid = files.filter((f) => isFuentesAllowedFileName(f.name));
            if (!valid.length) {
                Swal.fire({
                    icon: 'error',
                    title: 'Formato no válido',
                    text: 'Solo se permiten archivos .xlsx, .xls (Excel 97-2003) o .csv',
                    background: '#0a0a0a',
                    color: '#fff',
                    confirmButtonColor: '#14b8a6',
                });
                return;
            }

            setUploading(true);
            const ok: string[] = [];
            const fail: string[] = [];
            try {
                for (const file of valid) {
                    try {
                        await uploadFuentesFile(locatario.codigo, file);
                        ok.push(file.name);
                    } catch (err: unknown) {
                        const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : String(err);
                        fail.push(`${file.name}: ${msg}`);
                    }
                }
                await queryClient.invalidateQueries({ queryKey: ['fuentes-archivos-cierre'] });

                if (fail.length === 0) {
                    Swal.fire({
                        icon: 'success',
                        title: `${ok.length} archivo(s) subido(s)`,
                        html: `<div class="text-left text-sm">${ok.map((n) => `• ${n}`).join('<br/>')}</div>`,
                        background: '#0a0a0a',
                        color: '#fff',
                        confirmButtonColor: '#14b8a6',
                    });
                } else {
                    Swal.fire({
                        icon: ok.length ? 'warning' : 'error',
                        title: 'Resultado de carga',
                        html: `<div class="text-left text-xs space-y-2"><p class="text-emerald-400">OK (${ok.length})</p>${ok.map((n) => `• ${n}`).join('<br/>')}<p class="text-rose-400 mt-2">Errores (${fail.length})</p>${fail.join('<br/>')}</div>`,
                        background: '#0a0a0a',
                        color: '#fff',
                        confirmButtonColor: '#14b8a6',
                    });
                }
            } finally {
                setUploading(false);
            }
        },
        [locatario, queryClient]
    );

    const onDrop = useCallback(
        (acceptedFiles: File[], fileRejections: FileRejection[]) => {
            const rescued = fileRejections
                .map((r) => r.file)
                .filter((f) => isFuentesAllowedFileName(f.name));
            const merged = [...acceptedFiles, ...rescued].filter((f) => isFuentesAllowedFileName(f.name));
            if (merged.length) void uploadManyFiles(merged);
        },
        [uploadManyFiles]
    );

    const dropzoneDisabled = uploading || !locatario;

    const { getRootProps, getInputProps, isDragActive, fileRejections, open } = useDropzone({
        onDrop,
        accept: ACCEPT,
        multiple: true,
        disabled: dropzoneDisabled,
        noClick: true,
        noKeyboard: true,
    });

    return (
        <div
            className="min-h-screen w-screen font-sans flex flex-col"
            style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
        >
            <header
                className="border-b px-4 sm:px-10 py-6 flex items-center justify-between backdrop-blur-xl"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
            >
                <Link
                    to="/"
                    className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                >
                    <img src={logo} alt="Refugio" className="w-10 h-10 rounded-full border-2 border-teal-500/50 object-cover" />
                    <div>
                        <h1 className="text-sm font-black uppercase tracking-tighter text-app-text">Refugio Data</h1>
                        <p className="text-[9px] text-teal-500 font-mono tracking-widest">Fuentes de datos</p>
                    </div>
                </Link>
                <Link
                    to="/login"
                    className="text-[10px] font-black uppercase tracking-widest text-refugio-muted hover:text-teal-500 transition-colors"
                >
                    Acceso al sistema
                </Link>
            </header>

            <main className="flex-1 p-6 sm:p-10 max-w-4xl mx-auto w-full">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                    <div className="flex items-center gap-3 text-refugio-muted">
                        {loadingSemana ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Calendar size={18} className="text-teal-500 shrink-0" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {semana
                                ? `Ref. semana ${semana.numero_semana} · ${semana.lunes.slice(0, 10)} – ${semana.domingo.slice(0, 10)} (Lima) · carga → cierre_caja`
                                : 'Cargando...'}
                        </span>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-refugio-muted tracking-widest block mb-2">
                            Locatario
                        </label>
                        <AppSelect<string>
                            options={LOCATARIOS.map((l) => ({ value: l.codigo, label: `${l.name} (${l.codigo})` }))}
                            value={locatario ? { value: locatario.codigo, label: `${locatario.name} (${locatario.codigo})` } : null}
                            onChange={(opt) => setLocatario(opt ? LOCATARIOS.find((l) => l.codigo === opt.value) ?? null : null)}
                            placeholder="— Selecciona locatario —"
                        />
                    </div>

                    <div
                        {...getRootProps({
                            className: `border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 transition-all outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 ${
                                isDragActive ? 'border-teal-500/50 bg-teal-500/5' : 'border-white/10 hover:border-white/20'
                            } ${uploading ? 'opacity-60 pointer-events-none' : ''} ${!locatario && !uploading ? 'opacity-80' : ''}`,
                        })}
                    >
                        <input {...getInputProps({ accept: '.xlsx,.xls,.csv' })} />
                        {uploading ? (
                            <Loader2 size={40} className="text-teal-500 animate-spin" />
                        ) : (
                            <Upload size={40} className="text-refugio-muted" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest text-refugio-muted text-center">
                            {uploading
                                ? 'Subiendo archivos...'
                                : isDragActive
                                  ? 'Suelta los archivos aquí'
                                  : 'Arrastra uno o varios .xlsx, .xls o .csv'}
                        </span>
                        {!locatario && (
                            <span className="text-[9px] text-amber-500/90 font-mono uppercase tracking-wide">
                                Selecciona locatario para activar la zona de carga
                            </span>
                        )}
                        {fileRejections.length > 0 && (
                            <span className="text-[9px] text-rose-400 text-center max-w-md">
                                Algunos archivos no son válidos (.xlsx, .xls o .csv).
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => open()}
                            disabled={dropzoneDisabled}
                            className="inline-block bg-teal-500 text-black px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                            Seleccionar archivos
                        </button>
                    </div>

                    <div className="bg-app-card border border-app-border rounded-[30px] p-6 sm:p-8">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-refugio-muted mb-4">
                            Cierre caja (pendientes y consolidados por locatario)
                        </h3>
                        {loadingArchivos ? (
                            <div className="flex items-center gap-2 text-refugio-muted py-6">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm">Cargando...</span>
                            </div>
                        ) : porLocatario.length ? (
                            <ul className="space-y-6">
                                {porLocatario.map((grupo) => (
                                    <li key={grupo.locatario}>
                                        <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest mb-2">
                                            {grupo.locatario}
                                        </p>
                                        {grupo.pendientes?.length ? (
                                            <div className="mb-3">
                                                <p className="text-[8px] font-bold text-refugio-muted uppercase mb-1">Pendientes</p>
                                                <ul className="space-y-1 pl-2">
                                                    {grupo.pendientes.map((nombre) => (
                                                        <li
                                                            key={`p-${nombre}`}
                                                            className="flex items-center gap-2 text-sm text-app-text"
                                                        >
                                                            {nombre.toLowerCase().endsWith('.xlsx') ||
                                                            nombre.toLowerCase().endsWith('.xls') ? (
                                                                <FileSpreadsheet size={14} className="text-emerald-500 shrink-0" />
                                                            ) : (
                                                                <FileText size={14} className="text-teal-500 shrink-0" />
                                                            )}
                                                            {nombre}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {grupo.consolidados?.length ? (
                                            <div>
                                                <p className="text-[8px] font-bold text-refugio-muted uppercase mb-1 flex items-center gap-1">
                                                    <FolderArchive size={12} /> _consolidados
                                                </p>
                                                <ul className="space-y-1 pl-2">
                                                    {grupo.consolidados.map((nombre) => (
                                                        <li
                                                            key={`c-${nombre}`}
                                                            className="flex items-center gap-2 text-sm text-app-text opacity-90"
                                                        >
                                                            <FileText size={14} className="text-amber-500/90 shrink-0" />
                                                            {nombre}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex items-center gap-2 text-refugio-muted py-6">
                                <CheckCircle size={18} className="shrink-0" />
                                <span className="text-sm">Aún no hay archivos en cierre_caja.</span>
                            </div>
                        )}
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default FuentesDatos;
