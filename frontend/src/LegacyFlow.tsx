import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import Select from 'react-select';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RefreshCcw, Play, CheckCircle,
    FileCode, Link, Database, CloudSync,
    Trash2, ChevronRight, Info, Upload,
    File, Calendar, Store, Plus, Search, Table, X, Eye
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

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

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-full">
            <div className="xl:col-span-8 space-y-8">
                {/* Explorador y Asociación */}
                <div className="bg-zinc-900/40 p-10 rounded-[40px] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500 flex items-center gap-3">
                                <Search size={14} /> Explorador CierreCaja
                            </h3>
                            {/* Botón de Subida Restaurado y Mejorado */}
                            <label className="cursor-pointer bg-teal-500/10 hover:bg-teal-500/20 text-teal-500 px-3 py-1.5 rounded-xl transition-all flex items-center gap-2 border border-teal-500/20 group">
                                <Upload size={12} className="group-hover:scale-110 transition-transform" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Subir</span>
                                <input type="file" className="hidden" onChange={handleUpload} multiple />
                            </label>
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

                {/* Pasos Legacy */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StepButton icon={<FileCode />} title="1. Convertir" desc="XLSX → CSV (;)" onClick={() => runStep('Conversión', 'convertir')} loading={isProcessing === 'Conversión'} />
                    <StepButton icon={<Link />} title="2. Asociar" desc="Fuzzy Universal" onClick={() => runStep('Asociación', 'asociar')} loading={isProcessing === 'Asociación'} />
                    <StepButton icon={<Database />} title="3. Proces. Ventas" desc="sales_df + Real." onClick={runVentasProtocol} loading={isProcessing === 'Ventas'} />
                    <StepButton icon={<CloudSync />} title="4. Proces. Nube" desc="Sync + Pago + Pred." onClick={() => runStep('BigQuery', 'cargar-bigquery')} loading={isProcessing === 'BigQuery'} />
                </div>
            </div>

            {/* Consola */}
            <div className="xl:col-span-4 h-full flex flex-col min-h-[500px]">
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
                            className="bg-zinc-900 border border-white/10 w-full max-w-7xl h-[80vh] rounded-[40px] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(45,212,191,0.1)]"
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

                            <div className="flex-1 overflow-x-auto p-8 scrollbar-hide">
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

                            <div className="p-6 border-t border-white/5 bg-black/20 flex justify-between items-center px-10">
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
        <p className="text-[9px] text-zinc-600 font-medium leading-tight">{desc}</p>
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className={isExtra ? 'text-blue-400' : 'text-teal-500/50'} />
        </div>
    </button>
);

export default LegacyFlow;
