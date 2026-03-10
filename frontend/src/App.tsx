import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Activity, Database, FolderCheck,
    RefreshCcw, Play, CheckCircle,
    AlertCircle, ChevronRight, FileText, LucideProps
} from 'lucide-react';

const API_URL = 'http://localhost:8000/api';

interface StatusDrive {
    drive_connected: boolean;
    config_exists: boolean;
    locatarios_exists: boolean;
}

const App: React.FC = () => {
    const [status, setStatus] = useState<StatusDrive | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [logs, setLogs] = useState<string[]>([]);

    // Verificar estado al cargar
    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const response = await axios.get<StatusDrive>(`${API_URL}/procesamiento/status-drive`);
            setStatus(response.data);
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    };

    const ejecutarFlujo = async () => {
        setLoading(true);
        setLogs(prev => [...prev, '🚀 Iniciando flujo completo de procesamiento...']);
        try {
            const response = await axios.post(`${API_URL}/procesamiento/flujo-completo`);
            const { data } = response.data;

            const logsToAdd: string[] = [];
            if (data.conversion) {
                logsToAdd.push(`✅ Conversión: ${data.conversion.length} archivos XLSX a CSV.`);
            }
            if (data.asociacion) {
                logsToAdd.push(`✅ Asociados: ${data.asociacion.asociados.length} archivos.`);
            }
            if (data.consolidacion) {
                logsToAdd.push(`✅ Consolidados: ${data.consolidacion.count} negocios con data.`);
            }
            if (data.extraccion) {
                logsToAdd.push(`✅ Extraccion: ${data.extraccion.total} negocios cargados al Excel.`);
            }
            if (data.bigquery && data.bigquery.success) {
                logsToAdd.push(`✅ BigQuery: Sincronización exitosa (${data.bigquery.rows_loaded || 0} filas).`);
            } else if (data.bigquery) {
                logsToAdd.push(`❌ BigQuery: Error - ${data.bigquery.error}`);
            }

            setLogs(prev => [...prev, ...logsToAdd, '🎯 Flujo completo finalizado con éxito.']);
            fetchStatus();
        } catch (error: any) {
            setLogs(prev => [...prev, '❌ Error en el procesamiento: ' + (error.response?.data?.detail || error.message)]);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans p-8">
            {/* Header */}
            <header className="flex justify-between items-center mb-12 max-w-6xl mx-auto">
                <div>
                    <h1 className="text-4xl font-black bg-gradient-to-br from-blue-400 via-indigo-500 to-violet-600 bg-clip-text text-transparent tracking-tight">
                        Refugio Data Insight
                    </h1>
                    <p className="text-zinc-500 mt-2 font-medium">Dashboard de Procesamiento de Datos v1.0</p>
                </div>

                <div className="flex gap-4">
                    <div className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2.5 border transition-all duration-300 ${status?.drive_connected ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${status?.drive_connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}></div>
                        Google Drive: {status?.drive_connected ? 'Conectado' : 'Desconectado'}
                    </div>
                </div>
            </header>

            {/* Grid de Métricas */}
            <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <MetricCard
                    icon={<FolderCheck className="w-6 h-6" />}
                    title="Archivos Procesados"
                    value="1,248"
                    trend="+12 archivos hoy"
                    color="blue"
                />
                <MetricCard
                    icon={<Database className="w-6 h-6" />}
                    title="Registros BigQuery"
                    value="45.2k"
                    trend="Sincronizado"
                    color="indigo"
                />
                <MetricCard
                    icon={<Activity className="w-6 h-6" />}
                    title="Tasa de Asociación"
                    value="96%"
                    trend="99.8% éxito"
                    color="violet"
                />
            </main>

            {/* Panel de Control Central */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Panel Ejecución */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-[#111111] p-8 rounded-[2rem] border border-zinc-800 shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[100px] -z-10"></div>

                        <div className="flex items-center justify-between mb-10">
                            <h2 className="text-xl font-bold flex items-center gap-3">
                                <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                                Panel de Procesamiento Central
                            </h2>
                            <button
                                onClick={ejecutarFlujo}
                                disabled={loading}
                                className={`px-8 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all duration-300 ${loading ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_15px_30px_rgba(37,99,235,0.4)] active:scale-[0.98]'}`}
                            >
                                {loading ? 'Procesando...' : <><Play className="w-5 h-5 fill-current" /> Ejecutar Flujo Diario</>}
                            </button>
                        </div>

                        {/* Pasos de Proceso */}
                        <div className="space-y-4">
                            <ProcessStep
                                number={1}
                                title="Conversión XLSX a CSV"
                                desc="Transformación de reportes de cierre de caja"
                                color="blue"
                                active={loading}
                            />
                            <ProcessStep
                                number={2}
                                title="Fuzzy Matching (Asociación)"
                                desc="Vincular archivos con catálogo de locatarios"
                                color="indigo"
                                disabled
                            />
                            <ProcessStep
                                number={3}
                                title="Sincronización BigQuery"
                                desc="Ingesta masiva a tablas de producción"
                                color="violet"
                                disabled
                            />
                        </div>
                    </div>
                </div>

                {/* Panel de Logs / Actividad */}
                <div className="space-y-6">
                    <div className="bg-[#111111] p-7 rounded-[2rem] border border-zinc-800 h-[520px] flex flex-col shadow-2xl">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 mb-6 flex items-center gap-2.5">
                            <FileText className="w-4 h-4" /> Actividad en Tiempo Real
                        </h2>
                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                            {logs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4 opacity-40">
                                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                        <RefreshCcw className="w-8 h-8 animate-spin" />
                                    </div>
                                    <p className="text-xs font-medium text-center">Esperando ejecución del flujo...</p>
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className={`text-xs p-4 rounded-2xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${log.includes('✅') ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : log.includes('❌') ? 'bg-rose-500/5 border-rose-500/20 text-rose-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                                        <div className="flex gap-3">
                                            <div className="mt-0.5 shrink-0">
                                                {log.includes('✅') ? <CheckCircle className="w-4 h-4" /> : log.includes('❌') ? <AlertCircle className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </div>
                                            <span className="leading-relaxed font-medium">{log}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface MetricCardProps {
    icon: React.ReactNode;
    title: string;
    value: string;
    trend: string;
    color: 'blue' | 'indigo' | 'violet';
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, title, value, trend, color }) => {
    const colorStyles = {
        blue: "bg-blue-500/10 text-blue-500 hover:border-blue-500/50 group-hover:bg-blue-600",
        indigo: "bg-indigo-500/10 text-indigo-500 hover:border-indigo-500/50 group-hover:bg-indigo-600",
        violet: "bg-violet-500/10 text-violet-500 hover:border-violet-500/50 group-hover:bg-violet-600"
    };

    return (
        <div className={`bg-[#111111] p-7 rounded-[2rem] border border-zinc-800 transition-all duration-300 hover:translate-y-[-4px] hover:shadow-2xl group`}>
            <div className="flex justify-between items-start mb-6">
                <div className={`p-4 rounded-2xl transition-all duration-300 ${colorStyles[color].split(' hover:')[0]} group-hover:text-white`}>
                    {icon}
                </div>
                <span className={`text-${color === 'blue' ? 'emerald' : color}-500 text-xs font-bold px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800`}>
                    {trend}
                </span>
            </div>
            <h3 className="text-zinc-500 text-xs font-black uppercase tracking-widest mb-2">{title}</h3>
            <p className="text-3xl font-black tracking-tight">{value}</p>
        </div>
    );
};

interface ProcessStepProps {
    number: number;
    title: string;
    desc: string;
    color: string;
    active?: boolean;
    disabled?: boolean;
}

const ProcessStep: React.FC<ProcessStepProps> = ({ number, title, desc, color, active, disabled }) => {
    return (
        <div className={`flex items-center gap-6 p-6 rounded-3xl transition-all duration-300 ${disabled ? 'opacity-40 grayscale pointer-events-none' : 'bg-zinc-900/50 border border-zinc-800/80 hover:bg-zinc-800/50 hover:border-zinc-700'}`}>
            <div className={`w-12 h-12 rounded-2xl bg-${color}-500/20 text-${color}-500 flex items-center justify-center font-black text-lg border border-${color}-500/20`}>
                {number}
            </div>
            <div className="flex-1">
                <h4 className="font-bold text-sm tracking-tight">{title}</h4>
                <p className="text-zinc-500 text-xs font-medium mt-0.5">{desc}</p>
            </div>
            {active && <div className="w-5 h-5 border-[3px] border-blue-500 border-t-transparent animate-spin rounded-full"></div>}
        </div>
    );
};

export default App;
