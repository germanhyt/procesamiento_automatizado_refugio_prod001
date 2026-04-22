import React, { useEffect, useMemo, useState } from 'react';
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
    Truck,
    Briefcase,
    FileText,
    Sun,
    Moon,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import StatusBadge from './StatusBadge';
import logo from '@/assets/logo.png';
import { useTheme } from '@/hooks/useTheme';

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
    { id: 'users', path: '/users', label: 'Gestión de Usuarios', icon: <Users size={18} />, permission: 'users:manage' },
    { id: 'powerbi', path: '/powerbi', label: 'Dashboard Refugio', icon: <LayoutDashboard size={18} />, permission: 'dashboard:view' },
    { id: 'legacy', path: '/legacy', label: 'Procesam. Manual (Legacy)', icon: <History size={18} />, permission: 'legacy:process' },
    { id: 'dashboard', path: '', label: 'Procesam. Automático', icon: <Zap size={18} />, permission: 'dashboard:view', disabled: true },
    { id: 'delivery', path: '/delivery', label: 'Delivery', icon: <Truck size={18} />, permission: 'delivery:view' },
    { id: 'comercial', path: '/comercial', label: 'Comercial', icon: <Briefcase size={18} />, permission: 'comercial:view' },
    { id: 'documentos-gcb', path: '/documentos-gcb', label: 'Documentos GCB', icon: <FileText size={18} />, permission: 'documentos_gcb:view' },
];


const MainLayout: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const [sidebarOpen, setSidebarOpen] = useState(true); // desktop collapse/expand
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false); // mobile drawer
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)'); // <sm
        const onChange = () => setIsMobile(mq.matches);
        onChange();
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);

    const hasPermission = (codename: string) => {
        if (!user) return false;
        if (user.is_superuser) return true;
        const roles = (user as { roles?: Array<{ permissions?: Array<{ codename: string }> }> }).roles;
        return roles?.some((role) => role.permissions?.some((p) => p.codename === codename)) ?? false;
    };

    const menuItems = MENU_ITEMS_CONFIG.filter((item) => hasPermission(item.permission));
    const breadcrumbLabel = useMemo(() => {
        const currentItem = menuItems.find((m) => m.path && location.pathname === m.path);
        return currentItem?.label ?? 'Bienvenida';
    }, [location.pathname, menuItems]);

    const { data: status, isLoading: isStatusLoading } = useQuery({
        queryKey: ['drive-status'],
        queryFn: async () => {
            const response = await axios.get(`${API_URL}/procesamiento/status-drive`);
            return response.data;
        },
        refetchInterval: 5000,
        enabled: !!user,
    });

    const handleNavigate = (path?: string) => {
        if (!path) return;
        navigate(path);
        setMobileSidebarOpen(false);
    };

    return (
        <div className="h-screen w-screen font-sans flex overflow-hidden" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
            {/* Overlay (mobile) */}
            {mobileSidebarOpen && (
                <button
                    type="button"
                    aria-label="Cerrar menú"
                    onClick={() => setMobileSidebarOpen(false)}
                    className="fixed inset-0 z-40 bg-black/60 sm:hidden"
                />
            )}

            {/* Mobile drawer */}
            <motion.aside
                initial={false}
                animate={{ x: mobileSidebarOpen ? 0 : -320 }}
                transition={{ type: 'tween', duration: 0.22 }}
                className="fixed top-0 left-0 bottom-0 w-80 z-50 sm:hidden flex flex-col shadow-2xl border-r"
                style={{ backgroundColor: 'var(--app-panel)', borderColor: 'var(--app-border)' }}
            >
                <div className="flex items-center justify-between p-6">
                    <button
                        type="button"
                        onClick={() => handleNavigate('/bienvenida')}
                        className="relative shrink-0 flex items-center gap-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    >
                        <div className="absolute inset-0 bg-teal-500/30 blur-2xl rounded-full" />
                        <img
                            src={logo}
                            alt="Refugio Logo"
                            className="w-12 h-12 rounded-full border-2 border-teal-500/50 object-cover relative shadow-inner shadow-teal-500/20"
                        />
                        <div className="overflow-hidden text-left relative">
                            <h2 className="text-sm font-black tracking-tighter uppercase leading-none">Refugio</h2>
                            <p className="text-[10px] text-teal-500 font-mono tracking-[0.2em] mt-1">Data</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setMobileSidebarOpen(false)}
                        className="p-2 rounded-xl text-app-muted hover:text-app-accent hover:bg-app-card-hover transition-colors"
                        aria-label="Cerrar menú"
                    >
                        <X size={18} />
                    </button>
                </div>

                <nav className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
                    {menuItems.map((item) => {
                        const isActive = item.path && location.pathname === item.path;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => !item.disabled && item.path && handleNavigate(item.path)}
                                className={`w-full flex items-center transition-all duration-200 group relative overflow-hidden rounded-2xl px-6 py-4 gap-4 ${isActive
                                        ? 'bg-teal-500 text-black shadow-[0_0_30px_rgba(20,184,166,0.3)]'
                                        : item.disabled
                                            ? 'opacity-40 cursor-not-allowed grayscale'
                                            : 'text-app-muted hover:bg-app-card-hover hover:text-app-accent'
                                    }`}
                            >
                                <span className="shrink-0 relative z-10">{item.icon}</span>
                                <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                                    {item.label}
                                </span>
                                {isActive && <motion.div layoutId="active-pill-mobile" className="absolute inset-0 bg-teal-500" />}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t" style={{ borderColor: 'var(--app-border)' }}>
                    <button
                        type="button"
                        onClick={logout}
                        className="w-full flex items-center rounded-2xl text-red-500 hover:bg-red-500/5 transition-all p-4 gap-5"
                    >
                        <LogOut size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cerrar Sesión</span>
                    </button>
                </div>
            </motion.aside>

            {/* Desktop sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: sidebarOpen ? 300 : 80 }}
                className="hidden sm:flex flex-col relative z-30 h-full transition-all duration-300 ease-in-out shadow-2xl border-r"
                style={{ backgroundColor: 'var(--app-panel)', borderColor: 'var(--app-border)' }}
            >
                <div
                    className={`flex items-center gap-5 transition-all duration-300 ${sidebarOpen ? 'p-8 mb-4' : 'p-0 h-24 mb-4 justify-center'
                        }`}
                >
                    <button
                        type="button"
                        onClick={() => handleNavigate('/bienvenida')}
                        className="relative shrink-0 flex items-center gap-5 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    >
                        <div className="absolute inset-0 bg-teal-500/30 blur-2xl rounded-full" />
                        <img
                            src={logo}
                            alt="Refugio Logo"
                            className="w-14 h-14 rounded-full border-2 border-teal-500/50 object-cover relative shadow-inner shadow-teal-500/20"
                        />
                        {sidebarOpen && (
                            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="overflow-hidden text-left relative">
                                <h2 className="text-sm font-black tracking-tighter uppercase leading-none">Refugio</h2>
                                <p className="text-[10px] text-teal-500 font-mono tracking-[0.2em] mt-1">Data</p>
                            </motion.div>
                        )}
                    </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
                    {menuItems.map((item) => {
                        const isActive = item.path && location.pathname === item.path;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => !item.disabled && item.path && handleNavigate(item.path)}
                                className={`w-full flex items-center transition-all duration-300 group relative overflow-hidden rounded-2xl
                                    ${sidebarOpen ? 'px-6 py-4 gap-4' : 'p-0 h-16 justify-center'}
                                    ${isActive
                                        ? 'bg-teal-500 text-black shadow-[0_0_30px_rgba(20,184,166,0.3)]'
                                        : item.disabled
                                            ? 'opacity-40 cursor-not-allowed grayscale'
                                            : 'text-app-muted hover:bg-app-card-hover hover:text-app-accent'
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
                    className="p-6 border-t text-app-muted hover:text-app-accent flex justify-center transition-all group"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    <div className="bg-white/5 p-2 rounded-lg group-hover:bg-teal-500/10">
                        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                    </div>
                </button>
            </motion.aside>

            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <header
                    className="h-20 border-b px-4 sm:px-10 flex items-center justify-between backdrop-blur-3xl shrink-0 overflow-hidden"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
                >
                    <div className="flex items-center gap-4 min-w-0">
                        {/* Mobile menu button */}
                        <button
                            type="button"
                            onClick={() => setMobileSidebarOpen(true)}
                            className="sm:hidden p-2 rounded-xl text-app-muted hover:text-app-accent hover:bg-app-card-hover transition-colors"
                            aria-label="Abrir menú"
                        >
                            <Menu size={18} />
                        </button>
                        <div className="flex items-center gap-2 font-black text-[10px] truncate text-app-muted">
                            <Home size={14} className="shrink-0" />
                            <span className="opacity-40 select-none">/</span>
                            <span className="uppercase tracking-widest text-app-accent truncate">{breadcrumbLabel}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="p-2 rounded-xl border text-app-muted hover:text-app-text hover:bg-app-surface transition-colors"
                            style={{ borderColor: 'var(--app-border)' }}
                            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <div className="flex gap-2 sm:gap-4">
                            <StatusBadge active={status?.drive_connected} label="Drive" loading={isStatusLoading} />
                            <StatusBadge active={status?.config_exists} label="Config" loading={isStatusLoading} />
                        </div>
                        <div className="h-6 w-px hidden sm:block" style={{ backgroundColor: 'var(--app-border)' }} />
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden md:block">
                                <p className="text-[9px] font-black text-app-text uppercase tracking-tighter">{user?.username}</p>
                                <p className="text-[8px] text-app-muted font-mono truncate max-w-[100px]">
                                    {user?.roles?.map((x: { name: string }) => x.name).join(', ')}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-xl border flex items-center justify-center text-teal-500 shrink-0 shadow-lg shadow-black/20" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-panel)' }}>
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
