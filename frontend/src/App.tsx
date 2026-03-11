import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    History, Settings, Zap, Menu, X,
    LayoutDashboard, Database, BarChart3, Shield, Play,
    LogOut, Users, Home, User as UserIcon
} from 'lucide-react';

import logo from './assets/logo.png';
import LegacyFlow from './LegacyFlow';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import PowerBIDashboard from './pages/PowerBIDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

const AppContent: React.FC = () => {
    const { user, logout, isLoading: authLoading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<'legacy' | 'dashboard' | 'config' | 'users' | 'powerbi'>('legacy');

    // Helper para verificar permisos dinámicamente
    const hasPermission = (codename: string) => {
        if (!user) return false;
        if (user.is_superuser) return true;
        return user.roles.some((role: any) =>
            role.permissions?.some((p: any) => p.codename === codename)
        );
    };

    const { data: status, isLoading: isStatusLoading } = useQuery({
        queryKey: ['drive-status'],
        queryFn: async () => {
            const response = await axios.get(`${API_URL}/procesamiento/status-drive`);
            return response.data;
        },
        refetchInterval: 5000,
        enabled: !!user
    });

    if (authLoading) {
        return (
            <div className="h-screen w-screen bg-[#050505] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cargando Sistema...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Login />;
    }

    const menuItems = [
        { id: 'powerbi', label: 'Dashboard Refugio', icon: <LayoutDashboard size={18} />, permission: 'dashboard:view' },
        { id: 'legacy', label: 'Flujo Diario Manual (Legacy)', icon: <History size={18} />, permission: 'legacy:process' },
        { id: 'dashboard', label: 'Procesamiento Automático', icon: <Zap size={18} />, disabled: true, permission: 'dashboard:view' },
        { id: 'users', label: 'Gestión de Usuarios', icon: <Users size={18} />, permission: 'users:manage' }
        // { id: 'config', label: 'Configuración Sistema', icon: <Settings size={18} />, permission: 'system:config' },
    ].filter(item => hasPermission(item.permission));

    return (
        <div className="h-screen w-screen bg-[#050505] text-zinc-100 font-sans flex overflow-hidden">
            <motion.aside
                initial={false}
                animate={{ width: sidebarOpen ? 300 : 80 }}
                className="bg-[#080808] border-r border-white/5 flex flex-col relative z-50 h-full transition-all duration-300 ease-in-out shadow-2xl"
            >
                <div className="p-8 mb-4 flex items-center gap-5">
                    <div className="relative shrink-0">
                        <div className="absolute inset-0 bg-teal-500/30 blur-2xl rounded-full"></div>
                        <img src={logo} alt="Refugio Logo" className="w-14 h-14 rounded-full border-2 border-teal-500/50 object-cover relative shadow-inner shadow-teal-500/20" />
                    </div>
                    {sidebarOpen && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="overflow-hidden">
                            <h2 className="text-sm font-black tracking-tighter uppercase text-white leading-none">Refugio</h2>
                            <p className="text-[10px] text-teal-500 font-mono tracking-[0.2em] mt-1">Data</p>
                        </motion.div>
                    )}
                </div>

                <nav className="flex-1 px-4 py-4 space-y-3">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => !item.disabled && setActiveTab(item.id as any)}
                            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden
                                ${activeTab === item.id ? 'bg-teal-500 text-black shadow-[0_0_30px_rgba(20,184,166,0.3)]' : item.disabled ? 'opacity-40 cursor-not-allowed grayscale' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}
                            `}
                        >
                            <span className="shrink-0 relative z-10">{item.icon}</span>
                            {sidebarOpen && <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">{item.label}</span>}
                            {activeTab === item.id && <motion.div layoutId="active-pill" className="absolute inset-0 bg-teal-500" />}
                        </button>
                    ))}
                </nav>

                <div className="p-4">
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-5 p-4 rounded-2xl text-red-500 hover:bg-red-500/5 transition-all"
                    >
                        <LogOut size={18} />
                        {sidebarOpen && <span className="text-[10px] font-black uppercase tracking-widest">Cerrar Sesión</span>}
                    </button>
                </div>

                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-6 border-t border-white/5 text-zinc-600 hover:text-teal-500 flex justify-center transition-all group">
                    <div className="bg-white/5 p-2 rounded-lg group-hover:bg-teal-500/10">
                        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                    </div>
                </button>
            </motion.aside>

            <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-[radial-gradient(circle_at_top_right,_#111,_#050505)]">
                <header className="h-20 border-b border-white/5 px-10 flex items-center justify-between bg-[#050505]/40 backdrop-blur-3xl shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-zinc-600 font-black text-[10px]">
                            <Home size={14} />
                            <span>/</span>
                            <span className="uppercase tracking-widest text-teal-500">
                                {menuItems.find(m => m.id === activeTab)?.label}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex gap-4">
                            <StatusBadge active={status?.drive_connected} label="G-Drive" loading={isStatusLoading} />
                            <StatusBadge active={status?.config_exists} label="MasterConfig" loading={isStatusLoading} />
                        </div>
                        <div className="h-6 w-[1px] bg-white/10"></div>
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                                <p className="text-[9px] font-black text-white uppercase tracking-tighter">{user.username}</p>
                                {/* <p className="text-[8px] text-zinc-500 font-mono">{user.is_superuser ? 'Super Admin' : 'Admin Operador'}</p> */}
                                <p className="text-[8px] text-zinc-500 font-mono">{user.roles?.map((x) => x.name + " ")}</p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center text-teal-500">
                                <UserIcon size={18} />
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
                    <AnimatePresence mode="wait">
                        {activeTab === 'legacy' && (
                            <motion.div key="legacy" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="h-full">
                                <LegacyFlow />
                            </motion.div>
                        )}
                        {activeTab === 'dashboard' && (
                            <motion.div key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto space-y-10 py-10">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <StatCard icon={<Database className="w-5 h-5" />} title="Dataset" value="BQ_SALES" subtitle="Google Cloud Platform" />
                                    <StatCard icon={<BarChart3 className="w-5 h-5" />} title="Performance" value="99.2%" subtitle="Efficiency Rate" />
                                    <StatCard icon={<Shield className="w-5 h-5" />} title="Security" value="RBAC ACTIVE" subtitle="Access Control" />
                                </div>
                                <div className="bg-zinc-900/40 border border-white/5 p-20 rounded-[60px] relative overflow-hidden text-center">
                                    <div className="absolute top-0 right-0 p-10 opacity-[0.02] rotate-12"><Zap size={300} /></div>
                                    <div className="relative z-10 flex flex-col items-center">
                                        <div className="w-24 h-24 bg-teal-500/10 rounded-full flex items-center justify-center text-teal-500 border border-teal-500/20 mb-10"><Play size={40} fill="currentColor" className="ml-1" /></div>
                                        <h2 className="text-4xl font-black tracking-tighter mb-6 uppercase">Protocolo Automatizado</h2>
                                        <p className="text-zinc-500 text-sm max-w-xl mb-12 leading-relaxed">Sistema de orquestación inteligente. Ejecuta la lógica de normalización, asociación y carga directa a BigQuery sin intervención humana.</p>
                                        <button className="bg-teal-500 text-black px-16 py-6 rounded-3xl font-black uppercase tracking-widest text-xs hover:shadow-[0_0_40px_rgba(20,184,166,0.3)] transition-all">Ejecutar Motor</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {activeTab === 'powerbi' && (
                            <motion.div key="powerbi" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="h-full">
                                <PowerBIDashboard />
                            </motion.div>
                        )}
                        {activeTab === 'users' && user.is_superuser && (
                            <motion.div key="users" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="h-full">
                                <UserManagement />
                            </motion.div>
                        )}
                        {activeTab === 'config' && user.is_superuser && (
                            <motion.div key="config" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                                <div className="bg-zinc-900/40 p-10 rounded-[40px] border border-white/5">
                                    <h2 className="text-xl font-black uppercase tracking-widest mb-6">Configuración del Sistema</h2>
                                    <p className="text-zinc-500 text-sm">Próximamente: Ajustes avanzados.</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

const App: React.FC = () => (
    <AuthProvider>
        <AppContent />
    </AuthProvider>
);

const StatusBadge = ({ active, label, loading }: any) => (
    <div className={`px-5 py-2 rounded-2xl border text-[9px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${loading ? 'opacity-30' : active ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10' : 'bg-red-500/5 text-red-500 border-red-500/10'}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`}></div>
        {label}
    </div>
);

const StatCard = ({ icon, title, value, subtitle }: any) => (
    <div className="bg-zinc-900/40 p-10 rounded-[40px] border border-white/5 hover:border-teal-500/20 transition-all group">
        <div className="text-teal-500 mb-8 group-hover:scale-110 transition-transform duration-300">{icon}</div>
        <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">{title}</h4>
        <div className="text-3xl font-black text-white tracking-tighter">{value}</div>
        <p className="text-[10px] text-zinc-500 mt-2 font-mono">{subtitle}</p>
    </div>
);

export default App;
