import React, { CSSProperties, useEffect, useMemo, useState } from 'react';
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
    CalendarRange,
    ChevronDown,
    ClipboardList,
    LayoutGrid,
    BarChart3,
    Database,
    MonitorPlay,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import logo from '@/assets/logo.png';
import { useTheme } from '@/hooks/useTheme';

type MenuThemeKey =
    | 'users'
    | 'dashboard'
    | 'processing'
    | 'delivery'
    | 'comercial'
    | 'documentos'
    | 'sisa_reservas'
    | 'agenda_deportiva';

interface MenuLeafItem {
    id: string;
    path: string;
    label: string;
    icon: React.ReactNode;
    permission: string;
    themeKey: MenuThemeKey;
    disabled?: boolean;
}

interface MenuGroupItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    permission: string;
    themeKey: MenuThemeKey;
    children: MenuLeafItem[];
}

type TopLevelMenuEntry = MenuLeafItem | MenuGroupItem;

function isMenuGroup(entry: TopLevelMenuEntry): entry is MenuGroupItem {
    return 'children' in entry;
}

const TOP_LEVEL_MENU: TopLevelMenuEntry[] = [
    { id: 'users', path: '/users', label: 'Gestión de Usuarios', icon: <Users size={18} />, permission: 'users:manage', themeKey: 'users' },
    { id: 'documentos-gcb', path: '/documentos-gcb', label: 'Documentos GCB', icon: <FileText size={18} />, permission: 'documentos_gcb:view', themeKey: 'documentos' },
    { id: 'powerbi', path: '/powerbi', label: 'Dashboard Refugio', icon: <LayoutDashboard size={18} />, permission: 'dashboard:view', themeKey: 'dashboard' },
    {
        id: 'procesamiento-data',
        label: 'Procesamiento data',
        icon: <Database size={18} />,
        permission: 'legacy:process',
        themeKey: 'processing',
        children: [
            {
                id: 'legacy',
                path: '/legacy',
                label: 'Procesam. Manual',
                icon: <History size={16} />,
                permission: 'legacy:process',
                themeKey: 'processing',
            },
            {
                id: 'procesamiento-automatico',
                path: '',
                label: 'Procesam. Automático',
                icon: <Zap size={16} />,
                permission: 'legacy:process',
                themeKey: 'processing',
                disabled: true,
            },
        ],
    },
    { id: 'delivery', path: '/delivery', label: 'Delivery', icon: <Truck size={18} />, permission: 'delivery:view', themeKey: 'delivery' },
    { id: 'comercial', path: '/comercial', label: 'Comercial', icon: <Briefcase size={18} />, permission: 'comercial:view', themeKey: 'comercial' },
    {
        id: 'agenda-deportiva',
        label: 'Agenda Deportiva',
        icon: <MonitorPlay size={18} />,
        permission: 'agenda_deportiva:view',
        themeKey: 'agenda_deportiva',
        children: [
            {
                id: 'agenda-programaciones',
                path: '/agenda-deportiva/programaciones',
                label: 'Programaciones',
                icon: <CalendarRange size={16} />,
                permission: 'agenda_deportiva:view',
                themeKey: 'agenda_deportiva',
            },
            {
                id: 'agenda-musica',
                path: '/agenda-deportiva/musica',
                label: 'Música',
                icon: <MonitorPlay size={16} />,
                permission: 'agenda_deportiva:view',
                themeKey: 'agenda_deportiva',
            },
        ],
    },
    {
        id: 'sisa-reservas',
        label: 'Reservas Sisa',
        icon: <CalendarRange size={18} />,
        permission: 'sisa_reservas:view',
        themeKey: 'sisa_reservas',
        children: [
            {
                id: 'sisa-reservas-reservas',
                path: '/sisa-reservas/reservas',
                label: 'Reservas',
                icon: <ClipboardList size={16} />,
                permission: 'sisa_reservas:view',
                themeKey: 'sisa_reservas',
            },
            {
                id: 'sisa-reservas-plano',
                path: '/sisa-reservas/plano',
                label: 'Plano',
                icon: <LayoutGrid size={16} />,
                permission: 'sisa_reservas:view',
                themeKey: 'sisa_reservas',
            },
            {
                id: 'sisa-reservas-dashboard',
                path: '/sisa-reservas/dashboard',
                label: 'Dashboard',
                icon: <BarChart3 size={16} />,
                permission: 'sisa_reservas:view',
                themeKey: 'sisa_reservas',
            },
        ],
    },
];

type ModuleTheme = {
    accent: string;
    accentMuted: string;
    accentMutedBg: string;
    accentStrong: string;
    textOnAccent: string;
};

const MODULE_THEMES: Record<MenuThemeKey, ModuleTheme> = {
    users: {
        accent: 'var(--app-users-accent)',
        accentMuted: 'var(--app-users-accent-muted)',
        accentMutedBg: 'var(--app-users-accent-muted-bg)',
        accentStrong: 'var(--app-users-accent-strong)',
        textOnAccent: '#f8f3ee',
    },
    dashboard: {
        accent: 'var(--app-dashboard-accent)',
        accentMuted: 'var(--app-dashboard-accent-muted)',
        accentMutedBg: 'var(--app-dashboard-accent-muted-bg)',
        accentStrong: 'var(--app-dashboard-accent-strong)',
        textOnAccent: '#f8f3ee',
    },
    processing: {
        accent: 'var(--app-processing-accent)',
        accentMuted: 'var(--app-processing-accent-muted)',
        accentMutedBg: 'var(--app-processing-accent-muted-bg)',
        accentStrong: 'var(--app-processing-accent-strong)',
        textOnAccent: '#f8f3ee',
    },
    delivery: {
        accent: 'var(--app-delivery-accent)',
        accentMuted: 'var(--app-delivery-accent-muted)',
        accentMutedBg: 'var(--app-delivery-accent-muted-bg)',
        accentStrong: 'var(--app-delivery-accent-strong)',
        textOnAccent: '#f8f3ee',
    },
    comercial: {
        accent: 'var(--app-commercial-accent)',
        accentMuted: 'var(--app-commercial-accent-muted)',
        accentMutedBg: 'var(--app-commercial-accent-muted-bg)',
        accentStrong: 'var(--app-commercial-accent-strong)',
        textOnAccent: '#f8f3ee',
    },
    documentos: {
        accent: 'var(--app-documentos-accent)',
        accentMuted: 'var(--app-documentos-accent-muted)',
        accentMutedBg: 'var(--app-documentos-accent-muted-bg)',
        accentStrong: 'var(--app-documentos-accent-strong)',
        textOnAccent: '#f8f3ee',
    },
    sisa_reservas: {
        accent: 'var(--app-sisa-reservas-accent)',
        accentMuted: 'var(--app-sisa-reservas-accent-muted)',
        accentMutedBg: 'var(--app-sisa-reservas-accent-muted-bg)',
        accentStrong: 'var(--app-sisa-reservas-accent-strong)',
        textOnAccent: '#f8f3ee',
    },
    agenda_deportiva: {
        accent: 'var(--app-agenda-accent)',
        accentMuted: 'var(--app-agenda-accent-muted)',
        accentMutedBg: 'var(--app-agenda-accent-muted-bg)',
        accentStrong: 'var(--app-agenda-accent-strong)',
        textOnAccent: '#1a1208',
    },
};

function getModuleButtonVars(themeKey: MenuThemeKey): CSSProperties {
    const theme = MODULE_THEMES[themeKey];
    return {
        '--module-bg': 'transparent',
        '--module-border': theme.accentMuted,
        '--module-text': 'var(--app-muted)',
        '--module-hover-bg': theme.accentMutedBg,
        '--module-hover-border': theme.accentMuted,
        '--module-hover-text': theme.accent,
        '--module-active-bg': theme.accent,
        '--module-active-border': theme.accent,
        '--module-active-text': theme.textOnAccent,
        '--module-shadow': theme.accentMuted,
        '--module-icon-bg': theme.accentMutedBg,
        '--module-icon-border': theme.accentMuted,
        '--module-icon-color': theme.accent,
        '--module-active-icon-bg': 'rgba(255, 255, 255, 0.12)',
        '--module-active-icon-border': 'rgba(255, 255, 255, 0.18)',
        '--module-active-icon-color': theme.textOnAccent,
    } as CSSProperties;
}


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

    const visibleMenu = useMemo(() => {
        return TOP_LEVEL_MENU.reduce<TopLevelMenuEntry[]>((acc, e) => {
            if (!isMenuGroup(e)) {
                if (hasPermission(e.permission)) acc.push(e);
                return acc;
            }
            const visChildren = e.children.filter((c) => hasPermission(c.permission));
            if (visChildren.length) acc.push({ ...e, children: visChildren });
            return acc;
        }, []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        'sisa-reservas': true,
        'procesamiento-data': true,
        'agenda-deportiva': true,
    });

    useEffect(() => {
        if (location.pathname.startsWith('/sisa-reservas')) {
            setOpenGroups((p) => ({ ...p, 'sisa-reservas': true }));
        }
        if (location.pathname.startsWith('/agenda-deportiva')) {
            setOpenGroups((p) => ({ ...p, 'agenda-deportiva': true }));
        }
        if (location.pathname === '/legacy') {
            setOpenGroups((p) => ({ ...p, 'procesamiento-data': true }));
        }
    }, [location.pathname]);

    const breadcrumbMeta = useMemo(() => {
        for (const e of visibleMenu) {
            if (!isMenuGroup(e)) {
                if (e.path && location.pathname === e.path) return { label: e.label, themeKey: e.themeKey };
            } else {
                const child = e.children.find(
                    (c) => c.path && (location.pathname === c.path || location.pathname.startsWith(`${c.path}/`))
                );
                if (child) return { label: `${e.label} · ${child.label}`, themeKey: e.themeKey };
            }
        }
        return { label: 'Bienvenida', themeKey: 'dashboard' as MenuThemeKey };
    }, [location.pathname, visibleMenu]);

    const breadcrumbLabel = breadcrumbMeta.label;
    const currentModuleTheme = MODULE_THEMES[breadcrumbMeta.themeKey];

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
                        className="relative shrink-0 flex items-center gap-4 rounded-lg focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--app-accent-muted)"
                    >
                        <div className="absolute inset-0 rounded-full blur-2xl" style={{ backgroundColor: 'var(--app-accent-muted)' }} />
                        <img
                            src={logo}
                            alt="Refugio Logo"
                            className="w-12 h-12 rounded-full border-2 object-cover relative shadow-inner"
                            style={{ borderColor: 'var(--app-accent-muted)', boxShadow: 'inset 0 0 18px var(--app-accent-muted)' }}
                        />
                        <div className="overflow-hidden text-left relative">
                            <h2 className="text-sm font-black tracking-tighter uppercase leading-none">Refugio</h2>
                            <p className="text-[10px] text-app-accent font-mono tracking-[0.2em] mt-1">Data</p>
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
                    {visibleMenu.map((entry) => {
                        if (!isMenuGroup(entry)) {
                            const item = entry;
                            const isActive = item.path && location.pathname === item.path;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => !item.disabled && item.path && handleNavigate(item.path)}
                                    className={`w-full flex items-center transition-all duration-200 group relative overflow-hidden rounded-2xl px-6 py-4 gap-4 sidebar-module-button ${isActive
                                            ? 'sidebar-module-button--active'
                                            : item.disabled
                                                ? 'opacity-40 cursor-not-allowed grayscale'
                                                : ''
                                        }`}
                                    style={getModuleButtonVars(item.themeKey)}
                                >
                                    <span className="sidebar-module-button__icon shrink-0 relative z-10">{item.icon}</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                                        {item.label}
                                    </span>
                                    {isActive && (
                                        <motion.div
                                            layoutId="active-pill-mobile"
                                            className="absolute inset-0 rounded-2xl"
                                            style={{ backgroundColor: MODULE_THEMES[item.themeKey].accent }}
                                        />
                                    )}
                                </button>
                            );
                        }
                        const g = entry;
                        const groupOpen = openGroups[g.id] !== false;
                        return (
                            <div key={g.id} className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenGroups((p) => ({ ...p, [g.id]: !groupOpen }))}
                                    className="w-full flex items-center transition-all duration-200 rounded-2xl px-6 py-4 gap-3 sidebar-module-button border border-transparent"
                                    style={getModuleButtonVars(g.themeKey)}
                                >
                                    <span className="sidebar-module-button__icon shrink-0 relative z-10">{g.icon}</span>
                                    <span className="flex-1 text-left text-[10px] font-black uppercase tracking-widest relative z-10">
                                        {g.label}
                                    </span>
                                    <ChevronDown
                                        size={16}
                                        className={`shrink-0 transition-transform relative z-10 ${groupOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                {groupOpen && (
                                    <div className="pl-3 ml-4 space-y-2 border-l" style={{ borderColor: 'var(--app-border)' }}>
                                        {g.children.map((child) => {
                                            const isActive = Boolean(child.path) && location.pathname === child.path;
                                            return (
                                                <button
                                                    key={child.id}
                                                    type="button"
                                                    disabled={child.disabled}
                                                    title={child.disabled ? 'Próximamente' : undefined}
                                                    onClick={() => !child.disabled && child.path && handleNavigate(child.path)}
                                                    className={`w-full flex items-center rounded-xl px-4 py-3 gap-3 text-left sidebar-module-button relative overflow-hidden ${isActive ? 'sidebar-module-button--active' : ''} ${child.disabled ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}
                                                    style={getModuleButtonVars(child.themeKey)}
                                                >
                                                    <span className="shrink-0 opacity-90">{child.icon}</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap relative z-10">
                                                        {child.label}
                                                    </span>
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="active-pill-mobile-sub"
                                                            className="absolute inset-0 rounded-xl"
                                                            style={{ backgroundColor: MODULE_THEMES[child.themeKey].accent }}
                                                        />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <div className="p-4 border-t" style={{ borderColor: 'var(--app-border)' }}>
                    <button
                        type="button"
                        onClick={logout}
                        className="w-full flex items-center rounded-2xl text-app-danger hover:bg-app-danger-muted transition-all p-4 gap-5"
                    >
                        <LogOut size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cerrar Sesión</span>
                    </button>
                </div>
            </motion.aside>

            {/* Desktop sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: sidebarOpen ? 315 : 80 }}
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
                        className="relative shrink-0 flex items-center gap-5 rounded-lg focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--app-accent-muted)"
                    >
                        <div className="absolute inset-0 rounded-full blur-2xl" style={{ backgroundColor: 'var(--app-accent-muted)' }} />
                        <img
                            src={logo}
                            alt="Refugio Logo"
                            className="w-14 h-14 rounded-full border-2 object-cover relative shadow-inner"
                            style={{ borderColor: 'var(--app-accent-muted)', boxShadow: 'inset 0 0 18px var(--app-accent-muted)' }}
                        />
                        {sidebarOpen && (
                            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="overflow-hidden text-left relative">
                                <h2 className="text-sm font-black tracking-tighter uppercase leading-none">Refugio</h2>
                                <p className="text-[10px] text-app-accent font-mono tracking-[0.2em] mt-1">Data</p>
                            </motion.div>
                        )}
                    </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
                    {visibleMenu.map((entry) => {
                        if (!isMenuGroup(entry)) {
                            const item = entry;
                            const isActive = item.path && location.pathname === item.path;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => !item.disabled && item.path && handleNavigate(item.path)}
                                    className={`w-full flex items-center transition-all duration-300 group relative overflow-hidden rounded-2xl sidebar-module-button
                                        ${sidebarOpen ? 'px-6 py-4 gap-4' : 'p-0 h-16 justify-center'}
                                        ${isActive
                                            ? 'sidebar-module-button--active'
                                            : item.disabled
                                                ? 'opacity-40 cursor-not-allowed grayscale'
                                                : ''
                                        }`}
                                    style={getModuleButtonVars(item.themeKey)}
                                >
                                    <span className="sidebar-module-button__icon shrink-0 relative z-10">{item.icon}</span>
                                    {sidebarOpen && (
                                        <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                                            {item.label}
                                        </span>
                                    )}
                                    {isActive && (
                                        <motion.div
                                            layoutId="active-pill"
                                            className="absolute inset-0 rounded-2xl"
                                            style={{ backgroundColor: MODULE_THEMES[item.themeKey].accent }}
                                        />
                                    )}
                                </button>
                            );
                        }
                        const g = entry;
                        const groupOpen = openGroups[g.id] !== false;
                        const childActive = g.children.some((c) => Boolean(c.path) && location.pathname === c.path);
                        const firstPath = g.children.find((c) => c.path && !c.disabled)?.path;
                        if (!sidebarOpen) {
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => firstPath && handleNavigate(firstPath)}
                                    className={`w-full flex items-center transition-all duration-300 group relative overflow-hidden rounded-2xl sidebar-module-button p-0 h-16 justify-center ${childActive ? 'sidebar-module-button--active' : ''}`}
                                    style={getModuleButtonVars(g.themeKey)}
                                    title={g.label}
                                >
                                    <span className="sidebar-module-button__icon shrink-0 relative z-10">{g.icon}</span>
                                    {childActive && (
                                        <motion.div
                                            layoutId="active-pill"
                                            className="absolute inset-0 rounded-2xl"
                                            style={{ backgroundColor: MODULE_THEMES[g.themeKey].accent }}
                                        />
                                    )}
                                </button>
                            );
                        }
                        return (
                            <div key={g.id} className="space-y-1">
                                <button
                                    type="button"
                                    onClick={() => setOpenGroups((p) => ({ ...p, [g.id]: !groupOpen }))}
                                    className="w-full flex items-center transition-all duration-300 rounded-2xl px-6 py-4 gap-3 sidebar-module-button"
                                    style={getModuleButtonVars(g.themeKey)}
                                >
                                    <span className="sidebar-module-button__icon shrink-0 relative z-10">{g.icon}</span>
                                    <span className="flex-1 text-left text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                                        {g.label}
                                    </span>
                                    <ChevronDown
                                        size={16}
                                        className={`shrink-0 transition-transform relative z-10 ${groupOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                {groupOpen && (
                                    <div className="pl-2 ml-5 space-y-1 border-l" style={{ borderColor: 'var(--app-border)' }}>
                                        {g.children.map((child) => {
                                            const isActive = Boolean(child.path) && location.pathname === child.path;
                                            return (
                                                <button
                                                    key={child.id}
                                                    type="button"
                                                    disabled={child.disabled}
                                                    title={child.disabled ? 'Próximamente' : undefined}
                                                    onClick={() => !child.disabled && child.path && handleNavigate(child.path)}
                                                    className={`w-full flex items-center rounded-xl px-4 py-1 gap-3 sidebar-module-button relative overflow-hidden ${isActive ? 'sidebar-module-button--active' : ''} ${child.disabled ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}
                                                    style={getModuleButtonVars(child.themeKey)}
                                                >
                                                    <span className="sidebar-module-button__icon shrink-0 relative z-10">{child.icon}</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest relative z-10 whitespace-nowrap">
                                                        {child.label}
                                                    </span>
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="active-pill-sub"
                                                            className="absolute inset-0 rounded-xl"
                                                            style={{ backgroundColor: MODULE_THEMES[child.themeKey].accent }}
                                                        />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <div className="p-4">
                    <button
                        type="button"
                        onClick={logout}
                        className={`w-full flex items-center rounded-2xl text-app-danger hover:bg-app-danger-muted transition-all ${sidebarOpen ? 'p-4 gap-5' : 'p-0 h-16 justify-center'}`}
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
                    <div className="bg-white/5 p-2 rounded-lg group-hover:bg-app-accent-muted-bg">
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
                        <div className="flex items-center gap-2 font-black text-[10px] truncate text-app-text-secondary">
                            <Home size={14} className="shrink-0 opacity-90" />
                            <span className="opacity-40 select-none">/</span>
                            <span
                                className="uppercase tracking-widest truncate"
                                style={{
                                    color:
                                        theme === 'dark'
                                            ? `color-mix(in srgb, var(--app-text-secondary) 76%, ${currentModuleTheme.accent} 24%)`
                                            : currentModuleTheme.accent,
                                }}
                            >
                                {breadcrumbLabel}
                            </span>
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
                        <div className="h-6 w-px hidden sm:block" style={{ backgroundColor: 'var(--app-border)' }} />
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden md:block">
                                <p className="text-[9px] font-black text-app-text uppercase tracking-tighter">{user?.username}</p>
                                <p className="text-[8px] text-app-muted font-mono truncate max-w-[100px]">
                                    {user?.roles?.map((x: { name: string }) => x.name).join(', ')}
                                </p>
                            </div>
                            <div
                                className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-lg shadow-black/20"
                                style={{
                                    borderColor: currentModuleTheme.accentMuted,
                                    backgroundColor: currentModuleTheme.accentMutedBg,
                                    color:
                                        theme === 'dark'
                                            ? `color-mix(in srgb, var(--app-text-secondary) 68%, ${currentModuleTheme.accent} 32%)`
                                            : currentModuleTheme.accent,
                                }}
                            >
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
