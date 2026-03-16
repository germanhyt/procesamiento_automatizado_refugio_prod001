import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import Select from 'react-select';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RefreshCcw, Play, CheckCircle,
    FileCode, Link, Database, CloudSync,
    Trash2, ChevronRight, Info, Upload,
    File, Calendar, Store, Plus, Search, Table, X, Eye,
    ShieldCheck, Layers, FolderOpen, Download, FileArchive
} from 'lucide-react';

import { LOCATARIOS } from '@/constants/locatarios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;
const FUENTES_URL = `${API_URL}/fuentes`;

interface CierreCajaFile {
    name: string;
    size: number;
    modified: string;
}

interface Negocio {
    value: string;
    label: string;
}

const customSelectStyles = {
    control: (base: any) => ({
        ...base,
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderColor: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        fontSize: '11px',
        color: '#fff',
        padding: '2px',
        '&:hover': { borderColor: 'rgba(20, 184, 166, 0.5)' }
    }),
    menu: (base: any) => ({ ...base, backgroundColor: '#111', borderRadius: '12px', zIndex: 999 }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isFocused ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
        color: state.isFocused ? '#2dd4bf' : '#999',
        fontSize: '11px'
    }),
    singleValue: (base: any) => ({ ...base, color: '#fff' })
};

const LegacyFlow: React.FC = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [files, setFiles] = useState<CierreCajaFile[]>([]);
    const [negocios, setNegocios] = useState<Negocio[]>([]);

    const [selectedFile, setSelectedFile] = useState('');
    const [selectedNegocio, setSelectedNegocio] = useState<any>(null);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');

    // Preview State
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewType, setPreviewType] = useState<'sales' | 'realizadas'>('sales');
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Modal Gestión Archivos (FileStore por semana)
    const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
    const [semanasList, setSemanasList] = useState<string[]>([]);
    const [selectedSemanaFiles, setSelectedSemanaFiles] = useState<string>('');
    const [archivosFileStore, setArchivosFileStore] = useState<{ semana: string; locatario: string; archivos: string[] }[]>([]);
    const [filesModalLoading, setFilesModalLoading] = useState(false);
    const [bulkLocatario, setBulkLocatario] = useState('');

    useEffect(() => {
        const loadInitialData = async () => {
            console.log("🛠️ Cargando datos iniciales del flujo Legacy...");
            await fetchFiles();
            await fetchNegocios();
        };
        loadInitialData();
    }, []);

    const fetchFiles = async () => {
        try {
            const res = await axios.get(`${API_URL}/procesamiento/legacy/archivos`);
            if (res.data.success) setFiles(res.data.files);
        } catch (e) { console.error(e); }
    };

    const fetchNegocios = async () => {
        try {
            const res = await axios.get(`${API_URL}/procesamiento/legacy/negocios`);
            if (res.data.success) {
                const options = res.data.negocios.map((n: any) => ({
                    value: n.CodigoNegocio,
                    label: `${n.CodigoNegocio} - ${n.Descripcion}`
                }));
                setNegocios(options);
            }
        } catch (e) { console.error(e); }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const filesToUpload = Array.from(e.target.files);
        setLogs(prev => [`📤 Iniciando subida de ${filesToUpload.length} archivos...`, ...prev]);

        for (const file of filesToUpload) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await axios.post(`${API_URL}/procesamiento/legacy/subir`, formData);
                if (res.data.success) {
                    setLogs(prev => [`✅ Subido: ${file.name}`, ...prev]);
                }
            } catch (error: any) {
                setLogs(prev => [`❌ Falló subida de ${file.name}: ${error.message}`, ...prev]);
            }
        }
        fetchFiles(); // Refrescar lista
    };

    const runStep = async (step: string, endpoint: string, params: any = {}) => {
        setIsProcessing(step);
        setLogs(prev => [`⏳ ${step}: Ejecutando protocolo...`, ...prev]);
        try {
            const res = await axios.post(`${API_URL}/procesamiento/legacy/${endpoint}`, null, { params });
            if (res.data.success) {
                setLogs(prev => [`✅ ${step}: ${res.data.message || 'Completado'}`, ...prev]);
                fetchFiles();
                Swal.fire({ title: 'Protocolo Exitoso', text: step, icon: 'success', background: '#111', color: '#fff', confirmButtonColor: '#2dd4bf' });
            } else { throw new Error(res.data.error); }
        } catch (e: any) {
            setLogs(prev => [`❌ ERROR en ${step}: ${e.message}`, ...prev]);
            Swal.fire({ title: 'Error de Protocolo', text: e.message, icon: 'error', background: '#111', color: '#fff' });
        } finally { setIsProcessing(null); }
    };

    const runLimpiezaConfirm = async () => {
        const result = await Swal.fire({
            title: 'Verificación: Limpieza',
            text: '¿Proceder con el siguiente proceso (Consolidación)? Confirma que los archivos en FileStore están listos para consolidar.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#14b8a6',
            cancelButtonColor: '#71717a',
            confirmButtonText: 'Sí, proceder',
            cancelButtonText: 'Cancelar',
            background: '#111',
            color: '#fff',
        });
        if (result.isConfirmed) {
            setLogs(prev => ['✅ Verificación OK. Puede ejecutar Consolidación.', ...prev]);
            Swal.fire({ title: 'Listo', text: 'Ejecute ahora el paso Consolidación.', icon: 'success', background: '#111', color: '#fff', confirmButtonColor: '#2dd4bf' });
        }
    };

    const runConsolidacion = async () => {
        setIsProcessing('Consolidación');
        setLogs(prev => ['⏳ Consolidación: leyendo FileStore y BaseCarga...', ...prev]);
        try {
            const res = await axios.post(`${API_URL}/procesamiento/legacy/consolidar`);
            if (res.data.success) {
                const msg = res.data.registros
                    ? `Registros: ${res.data.registros}, duplicados eliminados: ${res.data.duplicados_eliminados ?? 0}`
                    : (res.data.message || 'Completado');
                setLogs(prev => [`✅ Consolidación: ${msg}`, ...prev]);
                Swal.fire({ title: 'Consolidación OK', text: msg, icon: 'success', background: '#111', color: '#fff', confirmButtonColor: '#2dd4bf' });
            } else throw new Error(res.data.error);
        } catch (e: any) {
            setLogs(prev => [`❌ ERROR Consolidación: ${e.response?.data?.error ?? e.message}`, ...prev]);
            Swal.fire({ title: 'Error', text: e.response?.data?.error ?? e.message, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setIsProcessing(null);
        }
    };

    const runVentasProtocol = async () => {
        const result = await Swal.fire({
            title: 'Confirmar Carga de Ventas',
            text: "¿Deseas limpiar el historial (sales_df y Realizadas) antes de cargar los nuevos archivos?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#2dd4bf',
            confirmButtonText: 'Sí, Limpiar y Cargar',
            cancelButtonText: 'No, Solo Añadir',
            background: '#111',
            color: '#fff'
        });

        if (result.isDismissed) return;

        await runStep('Ventas', 'cargar-ventas', { clear: result.isConfirmed && result.value === true });
    };

    const handleManualLink = async () => {
        if (!selectedFile || !selectedNegocio || !fechaInicio || !fechaFin) {
            Swal.fire("Incompleto", "Favor de llenar todos los campos de asociación", "info");
            return;
        }
        setIsProcessing('Manual');
        try {
            const res = await axios.post(`${API_URL}/procesamiento/legacy/guardar-asociacion`, null, {
                params: { archivo: selectedFile, codigo: selectedNegocio.value, inicio: fechaInicio, fin: fechaFin }
            });
            if (res.data.success) {
                setLogs(prev => [`✅ Vinculación Manual: ${selectedFile} -> ${selectedNegocio.label}`, ...prev]);
                Swal.fire({ title: "Vinculado", text: "Asociación guardada en Activas", icon: "success", background: '#111', color: '#fff' });
            }
        } catch (e: any) { setLogs(prev => [`❌ Error Vinculación: ${e.message}`, ...prev]); }
        finally { setIsProcessing(null); }
    };

    const handleOpenPreview = async (type: 'sales' | 'realizadas') => {
        setIsPreviewOpen(true);
        setPreviewType(type);
        setPreviewLoading(true);
        try {
            const endpoint = type === 'sales' ? 'preview-sales' : 'preview-realizadas';
            const res = await axios.get(`${API_URL}/procesamiento/legacy/${endpoint}`);
            if (res.data.success) {
                setPreviewData(res.data);
            }
        } catch (e: any) {
            Swal.fire("Error", "No se pudo cargar la vista previa", "error");
        } finally {
            setPreviewLoading(false);
        }
    };

    const openFilesModal = async () => {
        setIsFilesModalOpen(true);
        setFilesModalLoading(true);
        try {
            const [semRes, archRes] = await Promise.all([
                axios.get(`${FUENTES_URL}/semanas`),
                axios.get(`${FUENTES_URL}/semana-actual`),
            ]);
            if (semRes.data?.semanas?.length) setSemanasList(semRes.data.semanas);
            const semana = archRes.data?.carpeta || semRes.data?.semanas?.[0] || '';
            setSelectedSemanaFiles(semana);
            if (semana) {
                const listRes = await axios.get(`${FUENTES_URL}/archivos`, { params: { semana } });
                setArchivosFileStore(listRes.data?.archivos || []);
            } else setArchivosFileStore([]);
        } catch (e) { setArchivosFileStore([]); }
        finally { setFilesModalLoading(false); }
    };

    const fetchArchivosForSemana = async (semana: string) => {
        if (!semana) { setArchivosFileStore([]); return; }
        setFilesModalLoading(true);
        try {
            const res = await axios.get(`${FUENTES_URL}/archivos`, { params: { semana } });
            setArchivosFileStore(res.data?.archivos || []);
        } catch (e) { setArchivosFileStore([]); }
        finally { setFilesModalLoading(false); }
    };

    const downloadZip = (semana: string, locatario?: string) => {
        const params = new URLSearchParams({ semana });
        if (locatario) params.set('locatario', locatario);
        window.open(`${FUENTES_URL}/zip?${params.toString()}`, '_blank');
    };

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !bulkLocatario.trim()) {
            Swal.fire({ title: 'Falta locatario', text: 'Selecciona un locatario antes de subir.', icon: 'warning', background: '#111', color: '#fff' });
            return;
        }
        const formData = new FormData();
        Array.from(e.target.files).forEach((f) => formData.append('files', f));
        try {
            const res = await axios.post(`${FUENTES_URL}/upload-bulk?locatario_codigo=${encodeURIComponent(bulkLocatario)}&replace=true`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setLogs(prev => [`✅ Bulk: ${res.data?.results?.filter((r: any) => r.ok).length ?? 0} subidos`, ...prev]);
            if (selectedSemanaFiles) fetchArchivosForSemana(selectedSemanaFiles);
            e.target.value = '';
        } catch (err: any) {
            setLogs(prev => [`❌ Bulk upload: ${err.message}`, ...prev]);
        }
    };

    const deleteFileStoreFile = async (semana: string, locatario: string, filename: string) => {
        const ok = await Swal.fire({
            title: 'Eliminar archivo',
            text: `¿Eliminar ${filename}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            background: '#111',
            color: '#fff',
        });
        if (!ok.isConfirmed) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${FUENTES_URL}/archivo`, {
                params: { semana_folder: semana, locatario_codigo: locatario, filename },
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (selectedSemanaFiles === semana) fetchArchivosForSemana(semana);
        } catch (err: any) {
            Swal.fire({ title: 'Error', text: err.response?.data?.detail ?? err.message, icon: 'error', background: '#111', color: '#fff' });
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-full">
            <div className="xl:col-span-8 space-y-8">
                {/* Pasos Legacy: 0 Limpieza, 1 Consolidación, 2-4 Convertir/Asociar/Ventas/Nube */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 xl:gap-4">
                    <StepButton icon={<ShieldCheck />} title="0. Limpieza" desc="Verificación para consolidar" onClick={runLimpiezaConfirm} loading={false} />
                    <StepButton icon={<Layers />} title="1. Consolidar" desc="FileStore → unir + dedup" onClick={runConsolidacion} loading={isProcessing === 'Consolidación'} />
                    <StepButton icon={<FileCode />} title="2. Convertir" desc="XLSX → CSV (;)" onClick={() => runStep('Conversión', 'convertir')} loading={isProcessing === 'Conversión'} />
                    <StepButton icon={<Link />} title="3. Asociar" desc="Fuzzy Universal" onClick={() => runStep('Asociación', 'asociar')} loading={isProcessing === 'Asociación'} />
                    <StepButton icon={<Database />} title="4. Proces. Ventas" desc="sales_df + Real." onClick={runVentasProtocol} loading={isProcessing === 'Ventas'} />
                    <StepButton icon={<CloudSync />} title="5. Proces. Nube" desc="Sync + Pago + Pred." onClick={() => runStep('BigQuery', 'cargar-bigquery')} loading={isProcessing === 'BigQuery'} />
                </div>

                {/* Explorador y Asociación */}
                <div className="bg-zinc-900/40 p-6 sm:p-10 rounded-[40px] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500 flex items-center gap-3">
                                <Search size={14} /> Explorador CierreCaja
                            </h3>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={openFilesModal} className="bg-zinc-800 hover:bg-teal-500/20 text-zinc-400 hover:text-teal-500 px-3 py-1.5 rounded-xl transition-all flex items-center gap-2 border border-white/5">
                                    <FolderOpen size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Gestionar Archivos</span>
                                </button>
                                <label className="cursor-pointer bg-teal-500/10 hover:bg-teal-500/20 text-teal-500 px-3 py-1.5 rounded-xl transition-all flex items-center gap-2 border border-teal-500/20 group">
                                    <Upload size={12} className="group-hover:scale-110 transition-transform" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Subir</span>
                                    <input type="file" className="hidden" onChange={handleUpload} multiple />
                                </label>
                            </div>
                        </div>
                        <div className="bg-black/40 rounded-3xl border border-white/5 h-64 overflow-y-auto scrollbar-hide">
                            {files.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-20"><File size={32} className="mb-2" /><span className="text-[10px]">Sin archivos pendientes</span></div>
                            ) : (
                                files.map((f, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedFile(f.name)}
                                        className={`w-full p-4 flex items-center justify-between transition-all border-b border-white/5 last:border-0 ${selectedFile === f.name ? 'bg-teal-500/10' : 'hover:bg-white/5'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <FileCode className={`w-5 h-5 ${f.name.endsWith('.xlsx') ? 'text-emerald-500' : 'text-blue-400'}`} />
                                            <div className="text-left">
                                                <div className="text-[10px] font-black truncate max-w-[180px]">{f.name}</div>
                                                <div className="text-[8px] text-zinc-600 font-mono">{f.modified}</div>
                                            </div>
                                        </div>
                                        <div className="text-[8px] font-mono text-zinc-500">{(f.size / 1024).toFixed(1)} KB</div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500 flex items-center gap-3">
                            <Plus size={14} /> Asociación Manual
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-zinc-500 ml-1 uppercase">Negocio Destino</label>
                                <Select
                                    styles={customSelectStyles}
                                    options={negocios}
                                    value={selectedNegocio}
                                    onChange={(val) => setSelectedNegocio(val)}
                                    placeholder="Buscar por código..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-zinc-500 ml-1 uppercase">Inicio</label>
                                    <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-[10px] text-white focus:border-teal-500/50 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-zinc-500 ml-1 uppercase">Fin</label>
                                    <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-[10px] text-white focus:border-teal-500/50 outline-none transition-all" />
                                </div>
                            </div>
                            <button
                                onClick={handleManualLink}
                                disabled={!selectedFile || !selectedNegocio || isProcessing !== null}
                                className="w-full py-4 bg-zinc-800 hover:bg-teal-500 hover:text-black transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-20 flex items-center justify-center gap-3"
                            >
                                Vincular Registro
                            </button>

                            {/* Buttons for dynamic preview as requested */}
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <button
                                    onClick={() => handleOpenPreview('sales')}
                                    className="py-3 bg-zinc-800/40 hover:bg-zinc-700/60 border border-white/5 rounded-xl text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <Table size={12} className="text-teal-500" />
                                    Ver sales_df
                                </button>
                                <button
                                    onClick={() => handleOpenPreview('realizadas')}
                                    className="py-3 bg-zinc-800/40 hover:bg-zinc-700/60 border border-white/5 rounded-xl text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <Database size={12} className="text-blue-400" />
                                    Ver Resumen
                                </button>
                            </div>
                        </div>
                    </div>
                </div>


            </div>

            {/* Consola */}
            <div className="xl:col-span-4 h-full flex flex-col min-h-[300px] sm:min-h-[500px]">
                <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-[40px] flex flex-col overflow-hidden shadow-2xl">
                    <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/20">
                        {/* <h3 className="text-[10px] font-black uppercase tracking-widest text-teal-500">Live Feedback</h3> */}
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-teal-500">
                            {/* Live Feedback */}
                            Flujo procesos
                        </h3>
                        <button onClick={() => setLogs([])} className="text-[8px] font-black uppercase text-zinc-600 hover:text-white transition-colors">Clean</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide font-mono">
                        <AnimatePresence initial={false}>
                            {logs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-10 italic text-[10px]">Awaiting system signals...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-4 rounded-2xl bg-white/5 border border-white/5 text-[10px] flex gap-4 leading-relaxed">
                                        <ChevronRight size={14} className="shrink-0 text-zinc-600 mt-0.5" />
                                        <span className={log.includes('✅') ? 'text-emerald-400' : log.includes('❌') ? 'text-rose-400' : 'text-zinc-400'}>{log}</span>
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Modal Gestión Archivos (FileStore) */}
            <AnimatePresence>
                {isFilesModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
                        onClick={() => setIsFilesModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="bg-zinc-900 border border-white/10 w-full max-w-4xl max-h-[90vh] rounded-[30px] flex flex-col overflow-hidden shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-sm font-black uppercase tracking-widest text-teal-500 flex items-center gap-2">
                                    <FolderOpen size={20} /> Gestionar archivos por semana (FileStore)
                                </h3>
                                <button type="button" onClick={() => setIsFilesModalOpen(false)} className="p-2 hover:bg-white/5 rounded-xl text-zinc-500 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1 space-y-6">
                                <div className="flex flex-wrap items-center gap-4">
                                    <label className="text-[10px] font-black uppercase text-zinc-500">Semana</label>
                                    <select
                                        value={selectedSemanaFiles}
                                        onChange={(e) => {
                                            const s = e.target.value;
                                            setSelectedSemanaFiles(s);
                                            fetchArchivosForSemana(s);
                                        }}
                                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
                                    >
                                        {semanasList.length === 0 && <option value="">Sin semanas</option>}
                                        {semanasList.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => selectedSemanaFiles && downloadZip(selectedSemanaFiles)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/20 text-teal-500 hover:bg-teal-500/30 text-[10px] font-black uppercase"
                                    >
                                        <FileArchive size={14} /> Descargar semana (.zip)
                                    </button>
                                </div>
                                {filesModalLoading ? (
                                    <div className="flex items-center justify-center py-12"><RefreshCcw size={32} className="animate-spin text-teal-500" /></div>
                                ) : (
                                    <div className="space-y-6">
                                        {archivosFileStore.map((grupo) => (
                                            <div key={`${grupo.semana}-${grupo.locatario}`} className="bg-black/30 rounded-2xl border border-white/5 p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[10px] font-black uppercase text-teal-500">{grupo.locatario}</span>
                                                    <div className="flex items-center gap-2">
                                                        <button type="button" onClick={() => downloadZip(grupo.semana, grupo.locatario)} className="text-[9px] font-black uppercase text-zinc-400 hover:text-teal-500 flex items-center gap-1">
                                                            <Download size={12} /> ZIP
                                                        </button>
                                                    </div>
                                                </div>
                                                <ul className="space-y-2">
                                                    {grupo.archivos.map((nombre) => (
                                                        <li key={nombre} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 text-[10px]">
                                                            <span className="flex items-center gap-2 text-zinc-300">
                                                                <FileCode size={14} className="text-emerald-500/80" /> {nombre}
                                                            </span>
                                                            <button type="button" onClick={() => deleteFileStoreFile(grupo.semana, grupo.locatario, nombre)} className="p-1.5 rounded-lg text-zinc-500 hover:bg-red-500/20 hover:text-red-500" title="Eliminar">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                        {archivosFileStore.length === 0 && !filesModalLoading && (
                                            <p className="text-zinc-500 text-sm text-center py-8">No hay archivos en esta semana.</p>
                                        )}
                                    </div>
                                )}
                                <div className="border-t border-white/5 pt-6">
                                    <h4 className="text-[10px] font-black uppercase text-zinc-500 mb-3">Cargar en bloque</h4>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <select
                                            value={bulkLocatario}
                                            onChange={(e) => setBulkLocatario(e.target.value)}
                                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white min-w-[200px]"
                                        >
                                            <option value="">— Locatario —</option>
                                            {LOCATARIOS.map((l) => (
                                                <option key={l.codigo} value={l.codigo}>{l.name}</option>
                                            ))}
                                        </select>
                                        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/20 text-teal-500 hover:bg-teal-500/30 text-[10px] font-black uppercase">
                                            <Upload size={14} /> Seleccionar archivos (reemplaza si existe)
                                            <input type="file" className="hidden" accept=".xlsx,.csv" multiple onChange={handleBulkUpload} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal de Vista Previa */}
            <AnimatePresence>
                {isPreviewOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-zinc-900 border border-white/10 w-full max-w-7xl h-[90vh] sm:h-[80vh] rounded-[30px] sm:rounded-[40px] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(45,212,191,0.1)]"
                        >
                            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/20">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-teal-500 rounded-2xl text-black">
                                        <Table size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest">
                                            Vista Previa: {previewType === 'sales' ? 'sales_df' : 'Realizadas'}
                                        </h3>
                                        <p className="text-[10px] text-zinc-500">Últimos 100 registros detectados en Configuracion.xlsx</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsPreviewOpen(false)}
                                    className="p-3 hover:bg-white/5 rounded-2xl transition-colors text-zinc-500 hover:text-white"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-x-auto p-4 sm:p-8 scrollbar-hide">
                                {previewLoading ? (
                                    <div className="h-full flex flex-col items-center justify-center gap-4 opacity-50">
                                        <RefreshCcw className="animate-spin text-teal-500" size={32} />
                                        <span className="text-[10px] uppercase font-black tracking-widest">Accediendo a Excel...</span>
                                    </div>
                                ) : (
                                    <table className="w-full text-left border-collapse min-w-[1200px]">
                                        <thead className="sticky top-0 bg-black/40 backdrop-blur-md">
                                            <tr>
                                                {previewData?.columns.map((col: string) => (
                                                    <th key={col} className="p-4 text-[9px] font-black uppercase tracking-tighter text-teal-500 border-b border-white/5">{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="text-[10px]">
                                            {previewData?.data.map((row: any, i: number) => (
                                                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                    {previewData.columns.map((col: string) => (
                                                        <td key={`${i}-${col}`} className="p-4 text-zinc-400 font-mono italic">
                                                            {String(row[col])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <div className="p-4 sm:p-6 border-t border-white/5 bg-black/20 flex flex-col sm:flex-row gap-4 justify-between items-center px-6 sm:px-10">
                                <div className="text-[10px] text-zinc-600 font-mono">
                                    Total de filas en base: <span className="text-white">{previewData?.total_rows || 0}</span>
                                </div>
                                <button
                                    onClick={() => setIsPreviewOpen(false)}
                                    className="px-8 py-3 bg-teal-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                                >
                                    Cerrar Vista
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const StepButton = ({ icon, title, desc, onClick, loading, isExtra, fullWidth }: any) => (
    <button
        onClick={onClick}
        disabled={loading}
        className={`group p-8 rounded-[35px] border text-left transition-all relative overflow-hidden h-full flex flex-col ${fullWidth ? 'w-full' : ''} ${loading ? 'bg-teal-500/10 border-teal-500/30' : isExtra ? 'bg-blue-500/5 border-blue-500/10 hover:border-blue-500/40' : 'bg-zinc-900/40 border-white/5 hover:border-teal-500/40'}`}
    >
        <div className={`p-4 rounded-2xl mb-6 w-fit scale-110 ${loading ? 'bg-teal-500 text-black animate-spin' : isExtra ? 'bg-blue-500/20 text-blue-400 group-hover:bg-blue-400 group-hover:text-black transition-all' : 'bg-zinc-800 text-teal-500 group-hover:bg-teal-500 group-hover:text-black transition-all'}`}>
            {loading ? <RefreshCcw size={20} /> : icon}
        </div>
        <h4 className="font-black text-[10px] uppercase tracking-widest mb-1">{title}</h4>
        <p className="text-[9px] text-refugio-muted font-medium leading-tight">{desc}</p>
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className={isExtra ? 'text-blue-400' : 'text-teal-500/50'} />
        </div>
    </button>
);

export default LegacyFlow;
