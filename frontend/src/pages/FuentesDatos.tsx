import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, FileText, Calendar, Loader2, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';

import logo from '@/assets/logo.png';
import { LOCATARIOS, type Locatario } from '@/constants/locatarios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;
const FUENTES_BASE = `${API_URL}/fuentes`;

interface SemanaActual {
    carpeta: string;
    numero_semana: number;
    lunes: string;
    domingo: string;
}

interface ArchivoGrupo {
    semana: string;
    locatario: string;
    archivos: string[];
}

const FuentesDatos: React.FC = () => {
    const queryClient = useQueryClient();
    const [locatario, setLocatario] = useState<Locatario | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const { data: semana, isLoading: loadingSemana } = useQuery<SemanaActual>({
        queryKey: ['fuentes-semana'],
        queryFn: async () => {
            const res = await axios.get(`${FUENTES_BASE}/semana-actual`);
            return res.data;
        },
    });

    const { data: archivosData, isLoading: loadingArchivos } = useQuery<{ semana: string; archivos: ArchivoGrupo[] }>({
        queryKey: ['fuentes-archivos', semana?.carpeta],
        queryFn: async () => {
            const res = await axios.get(`${FUENTES_BASE}/archivos`, {
                params: semana?.carpeta ? { semana: semana.carpeta } : undefined,
            });
            return res.data;
        },
        enabled: !!semana?.carpeta,
    });

    const uploadFile = useCallback(
        async (file: File) => {
            if (!locatario) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Selecciona locatario',
                    text: 'Elige un locatario antes de subir el archivo.',
                    background: '#0a0a0a',
                    color: '#fff',
                    confirmButtonColor: '#14b8a6',
                });
                return;
            }
            const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
            if (ext !== '.xlsx' && ext !== '.csv') {
                Swal.fire({
                    icon: 'error',
                    title: 'Formato no válido',
                    text: 'Solo se permiten archivos .xlsx o .csv',
                    background: '#0a0a0a',
                    color: '#fff',
                    confirmButtonColor: '#14b8a6',
                });
                return;
            }
            setUploading(true);
            try {
                const formData = new FormData();
                formData.append('file', file);
                await axios.post(
                    `${FUENTES_BASE}/upload?locatario_codigo=${encodeURIComponent(locatario.codigo)}`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } }
                );
                await queryClient.invalidateQueries({ queryKey: ['fuentes-archivos'] });
                Swal.fire({
                    icon: 'success',
                    title: 'Archivo subido',
                    text: `Guardado en ${semana?.carpeta ?? ''} / ${locatario.name}`,
                    timer: 2500,
                    showConfirmButton: false,
                    background: '#0a0a0a',
                    color: '#fff',
                });
            } catch (err: unknown) {
                const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : String(err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error al subir',
                    text: msg,
                    background: '#0a0a0a',
                    color: '#fff',
                    confirmButtonColor: '#14b8a6',
                });
            } finally {
                setUploading(false);
            }
        },
        [locatario, queryClient, semana?.carpeta]
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) uploadFile(file);
        },
        [uploadFile]
    );

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    }, []);

    const onSelectFile = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = '';
        },
        [uploadFile]
    );

    return (
        <div className="min-h-screen w-screen bg-[#050505] text-zinc-100 font-sans flex flex-col">
            <header className="border-b border-white/5 px-4 sm:px-10 py-6 flex items-center justify-between bg-[#050505]/80 backdrop-blur-xl">
                <Link
                    to="/"
                    className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                >
                    <img src={logo} alt="Refugio" className="w-10 h-10 rounded-full border-2 border-teal-500/50 object-cover" />
                    <div>
                        <h1 className="text-sm font-black uppercase tracking-tighter text-white">Refugio Data</h1>
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
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                >
                    {/* Semana actual */}
                    <div className="flex items-center gap-3 text-refugio-muted">
                        {loadingSemana ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Calendar size={18} className="text-teal-500 shrink-0" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {semana
                                ? `Semana ${semana.numero_semana} · ${semana.lunes.slice(0, 10)} – ${semana.domingo.slice(0, 10)} (Lima)`
                                : 'Cargando semana...'}
                        </span>
                    </div>

                    {/* Selector locatario */}
                    <div>
                        <label className="text-[10px] font-black uppercase text-refugio-muted tracking-widest block mb-2">
                            Locatario
                        </label>
                        <select
                            value={locatario?.codigo ?? ''}
                            onChange={(e) => {
                                const codigo = e.target.value;
                                setLocatario(LOCATARIOS.find((l) => l.codigo === codigo) ?? null);
                            }}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-5 text-sm text-white focus:border-teal-500/50 outline-none"
                        >
                            <option value="">— Selecciona locatario —</option>
                            {LOCATARIOS.map((l) => (
                                <option key={l.codigo} value={l.codigo}>
                                    {l.name} ({l.codigo})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Zona de carga */}
                    <div
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 transition-all ${
                            dragOver ? 'border-teal-500/50 bg-teal-500/5' : 'border-white/10 hover:border-white/20'
                        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                    >
                        {uploading ? (
                            <Loader2 size={40} className="text-teal-500 animate-spin" />
                        ) : (
                            <Upload size={40} className="text-refugio-muted" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest text-refugio-muted">
                            {uploading ? 'Subiendo...' : 'Arrastra aquí un archivo .xlsx o .csv'}
                        </span>
                        <label className="cursor-pointer">
                            <span className="inline-block bg-teal-500 text-black px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-400 transition-colors">
                                Seleccionar archivo
                            </span>
                            <input
                                type="file"
                                accept=".xlsx,.csv"
                                className="hidden"
                                onChange={onSelectFile}
                                disabled={uploading}
                            />
                        </label>
                    </div>

                    {/* Lista de archivos de la semana */}
                    <div className="bg-zinc-900/40 border border-white/5 rounded-[30px] p-6 sm:p-8">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-refugio-muted mb-4">
                            Archivos cargados esta semana
                        </h3>
                        {loadingArchivos ? (
                            <div className="flex items-center gap-2 text-refugio-muted py-6">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm">Cargando...</span>
                            </div>
                        ) : archivosData?.archivos?.length ? (
                            <ul className="space-y-4">
                                {archivosData.archivos.map((grupo) => (
                                    <li key={`${grupo.semana}-${grupo.locatario}`}>
                                        <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest mb-2">
                                            {grupo.locatario}
                                        </p>
                                        <ul className="space-y-1 pl-2">
                                            {grupo.archivos.map((nombre) => (
                                                <li
                                                    key={nombre}
                                                    className="flex items-center gap-2 text-sm text-zinc-300"
                                                >
                                                    {nombre.toLowerCase().endsWith('.xlsx') ? (
                                                        <FileSpreadsheet size={14} className="text-emerald-500 shrink-0" />
                                                    ) : (
                                                        <FileText size={14} className="text-teal-500 shrink-0" />
                                                    )}
                                                    {nombre}
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex items-center gap-2 text-refugio-muted py-6">
                                <CheckCircle size={18} className="shrink-0" />
                                <span className="text-sm">Aún no hay archivos cargados para esta semana.</span>
                            </div>
                        )}
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default FuentesDatos;
