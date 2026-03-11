import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PowerBIEmbed } from 'powerbi-client-react';
import { models } from 'powerbi-client';
import { motion } from 'framer-motion';
import { RefreshCcw, LayoutDashboard, AlertCircle, Maximize2 } from 'lucide-react';
import Swal from 'sweetalert2';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

const PowerBIDashboard: React.FC = () => {
    const [embedParams, setEmbedParams] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<any>(null);

    const fetchEmbedParams = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        try {
            const response = await axios.get(`${API_URL}/powerbi/embed-params`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEmbedParams(response.data);
        } catch (err: any) {
            console.error(err);
            const detail = err.response?.data?.detail || "No se pudo obtener el token de Power BI";
            setError(detail);
            Swal.fire("Error de Conexión", detail, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleFullScreen = () => {
        if (report) {
            report.fullscreen();
        }
    };

    useEffect(() => {
        fetchEmbedParams();
    }, []);

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Análisis de Data</h2>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Dashboard Interactivo | Power BI Service</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleFullScreen}
                        className="px-6 py-3 bg-zinc-800/40 hover:bg-zinc-800 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 text-zinc-400 hover:text-white"
                    >
                        <Maximize2 size={14} />
                        Vista Completa
                    </button>
                    <button
                        onClick={fetchEmbedParams}
                        className="px-6 py-3 bg-zinc-800/40 hover:bg-zinc-800 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 text-zinc-400 hover:text-white"
                    >
                        <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                        Refrescar Datos
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-[40px] overflow-hidden shadow-2xl relative min-h-[500px] sm:min-h-[600px] md:min-h-[700px]">
                {loading && (
                    <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
                        <RefreshCcw className="animate-spin text-teal-500 mb-4" size={40} />
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">Sincronizando Reporte...</span>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-10 text-center">
                        <AlertCircle className="text-red-500 mb-6" size={48} />
                        <h3 className="text-xl font-black uppercase text-white mb-2">Error de Autenticación</h3>
                        <p className="text-zinc-500 text-sm max-w-md mb-8">{error}</p>
                        <button
                            onClick={fetchEmbedParams}
                            className="bg-teal-500 text-black px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all"
                        >
                            Reintentar Conexión
                        </button>
                    </div>
                )}

                {embedParams && (
                    <div className="w-full h-full">
                        <PowerBIEmbed
                            embedConfig={{
                                type: 'report',
                                id: embedParams.reportId,
                                embedUrl: embedParams.embedUrl,
                                accessToken: embedParams.accessToken,
                                tokenType: models.TokenType.Embed,
                                settings: {
                                    panes: {
                                        filters: { visible: false },
                                        pageNavigation: { visible: true }
                                    },
                                    background: models.BackgroundType.Default,
                                }
                            }}
                            cssClassName="w-full h-full border-none"
                            getEmbeddedComponent={(embeddedReport) => {
                                setReport(embeddedReport);
                            }}
                        />
                    </div>
                )}

                {!loading && !error && !embedParams && (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                        <LayoutDashboard size={64} className="mb-6 opacity-20" />
                        <p className="uppercase font-black tracking-widest text-[10px]">Esperando Inicialización</p>
                    </div>
                )}
            </div>

            {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 bg-black/20 border border-white/5 rounded-3xl flex items-center gap-4">
                    <div className="p-3 bg-teal-500/10 text-teal-500 rounded-xl"><Maximize2 size={20} /></div>
                    <div>
                        <h4 className="text-[9px] font-black uppercase text-white mb-0.5">Control Total</h4>
                        <p className="text-[8px] text-zinc-500 uppercase leading-relaxed">Usa la barra inferior para navegar entre páginas.</p>
                    </div>
                </div>
            </div> */}
        </div>
    );
};

export default PowerBIDashboard;
