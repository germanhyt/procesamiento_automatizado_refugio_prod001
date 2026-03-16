import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    History,
    Zap,
    Menu,
    X,
    LayoutDashboard,
    LogOut,
    Users,
    Home,
    User as UserIcon,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import StatusBadge from './StatusBadge';
import logo from '@/assets/logo.png';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

interface MenuItemConfig {
    id: string;
    path: string;
    label: string;
    icon: React.ReactNode;
    permission: string;
    disabled?: boolean;
}

const MENU_ITEMS_CONFIG: MenuItemConfig[] = [
    { id: 'powerbi', path: '/powerbi', label: 'Dashboard Refugio', icon: <LayoutDashboard size={18} />, permission: 'dashboard:view' },
    { id: 'legacy', path: '/legacy', label: 'Flujo Diario Manual (Legacy)', icon: <History size={18} />, permission: 'legacy:process' },
    { id: 'dashboard', path: '', label: 'Procesamiento Automático', icon: <Zap size={18} />, permission: 'dashboard:view', disabled: true },
    { id: 'users', path: '/users', label: 'Gestión de Usuarios', icon: <Users size={18} />, permission: 'users:manage' },
];

const MainLayout: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const hasPermission = (codename: string) => {
        if (!user) return false;
        if (user.is_superuser) return true;
        const roles = (user as { roles?: Array<{ permissions?: Array<{ codename: string }> }> }).roles;
        return roles?.some((role) => role.permissions?.some((p) => p.codename === codename)) ?? false;
    };

    const menuItems = MENU_ITEMS_CONFIG.filter((item) => hasPermission(item.permission));

    const { data: status, isLoading: isStatusLoading } = useQuery({
        queryKey: ['drive-status'],
        queryFn: async () => {
            const response = await axios.get(`${API_URL}/procesamiento/status-drive`);
            return response.data;
        },
        refetchInterval: 5000,
        enabled: !!user,
    });

    const currentItem = menuItems.find((m) => m.path && location.pathname === m.path);
    const breadcrumbLabel = currentItem?.label ?? 'Bienvenida';

    return (
        <div className="h-screen w-screen bg-[#050505] text-zinc-100 font-sans flex overflow-hidden">
            <motion.aside
                initial={false}
                animate={{ width: sidebarOpen ? 300 : 80 }}
                className="bg-[#080808] border-r border-white/5 flex flex-col relative z-50 h-full transition-all duration-300 ease-in-out shadow-2xl"
            >
                <div
                    className={`flex items-center gap-5 transition-all duration-300 ${
                        sidebarOpen ? 'p-8 mb-4' : 'p-0 h-24 mb-4 justify-center'
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => navigate('/bienvenida')}
                        className="relative shrink-0 flex items-center gap-5 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    >
                        <div className="absolute inset-0 bg-teal-500/30 blur-2xl rounded-full" />
                        <img
                            src={logo}
                            alt="Refugio Logo"
                            className="w-14 h-14 rounded-full border-2 border-teal-500/50 object-cover relative shadow-inner shadow-teal-500/20"
                        />
                        {sidebarOpen && (
                            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="overflow-hidden text-left">
                                <h2 className="text-sm font-black tracking-tighter uppercase text-white leading-none">Refugio</h2>
                                <p className="text-[10px] text-teal-500 font-mono tracking-[0.2em] mt-1">Data</p>
                            </motion.div>
                        )}
                    </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-3">
                    {/* <button
                        type="button"
                        onClick={() => navigate('/bienvenida')}
                        className={`w-full flex items-center transition-all duration-300 group relative overflow-hidden rounded-2xl ${
                            sidebarOpen ? 'px-6 py-4 gap-4' : 'p-0 h-16 justify-center'
                        } ${location.pathname === '/bienvenida' ? 'bg-teal-500 text-black shadow-[0_0_30px_rgba(20,184,166,0.3)]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`}
                    >
                        <Home size={18} className="shrink-0 relative z-10" />
                        {sidebarOpen && (
                            <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                                Bienvenida
                            </span>
                        )}
                        {location.pathname === '/bienvenida' && (
                            <motion.div layoutId="active-pill" className="absolute inset-0 bg-teal-500" />
                        )}
                    </button> */}
                    {menuItems.map((item) => {
                        const isActive = item.path && location.pathname === item.path;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => !item.disabled && item.path && navigate(item.path)}
                                className={`w-full flex items-center transition-all duration-300 group relative overflow-hidden rounded-2xl
                                    ${sidebarOpen ? 'px-6 py-4 gap-4' : 'p-0 h-16 justify-center'}
                                    ${
                                        isActive
                                            ? 'bg-teal-500 text-black shadow-[0_0_30px_rgba(20,184,166,0.3)]'
                                            : item.disabled
                                              ? 'opacity-40 cursor-not-allowed grayscale'
                                              : 'text-zinc-500 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <span className="shrink-0 relative z-10">{item.icon}</span>
                                {sidebarOpen && (
                                    <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                                        {item.label}
                                    </span>
                                )}
                                {isActive && <motion.div layoutId="active-pill" className="absolute inset-0 bg-teal-500" />}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4">
                    <button
                        type="button"
                        onClick={logout}
                        className={`w-full flex items-center rounded-2xl text-red-500 hover:bg-red-500/5 transition-all ${sidebarOpen ? 'p-4 gap-5' : 'p-0 h-16 justify-center'}`}
                    >
                        <LogOut size={18} />
                        {sidebarOpen && (
                            <span className="text-[10px] font-black uppercase tracking-widest">Cerrar Sesión</span>
                        )}
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-6 border-t border-white/5 text-zinc-600 hover:text-teal-500 flex justify-center transition-all group"
                >
                    <div className="bg-white/5 p-2 rounded-lg group-hover:bg-teal-500/10">
                        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                    </div>
                </button>
            </motion.aside>

            <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-[radial-gradient(circle_at_top_right,_#111,_#050505)]">
                <header className="h-20 border-b border-white/5 px-4 sm:px-10 flex items-center justify-between bg-[#050505]/40 backdrop-blur-3xl shrink-0 overflow-hidden">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="flex items-center gap-2 text-zinc-600 font-black text-[10px] truncate">
                            <Home size={14} className="shrink-0" />
                            <span className="opacity-40 select-none">/</span>
                            <span className="uppercase tracking-widest text-teal-500 truncate">{breadcrumbLabel}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                        <div className="flex gap-2 sm:gap-4">
                            <StatusBadge active={status?.drive_connected} label="Drive" loading={isStatusLoading} />
                            <StatusBadge active={status?.config_exists} label="Config" loading={isStatusLoading} />
                        </div>
                        <div className="h-6 w-[1px] bg-white/10 hidden xs:block" />
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden md:block">
                                <p className="text-[9px] font-black text-white uppercase tracking-tighter">{user?.username}</p>
                                <p className="text-[8px] text-zinc-500 font-mono truncate max-w-[100px]">
                                    {user?.roles?.map((x: { name: string }) => x.name).join(', ')}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center text-teal-500 shrink-0 shadow-lg shadow-black/20">
                                <UserIcon size={18} />
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 sm:p-10 scrollbar-hide">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
