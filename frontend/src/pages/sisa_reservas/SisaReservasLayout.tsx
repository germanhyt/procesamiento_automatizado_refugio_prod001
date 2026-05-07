import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
        'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border',
        isActive
            ? 'border-[var(--app-sisa-reservas-accent-muted)] bg-[var(--app-sisa-reservas-accent-muted-bg)] text-[var(--app-sisa-reservas-accent)]'
            : 'border-transparent text-app-muted hover:text-app-text hover:bg-app-card-hover',
    ].join(' ');

const SisaReservasLayout: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2 p-1 rounded-2xl border" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}>
                <NavLink to="/sisa-reservas/reservas" className={linkClass}>
                    Reservas
                </NavLink>
                <NavLink to="/sisa-reservas/plano" className={linkClass}>
                    Plano
                </NavLink>
                <NavLink to="/sisa-reservas/dashboard" className={linkClass}>
                    Dashboard
                </NavLink>
            </div>
            <Outlet />
        </div>
    );
};

export default SisaReservasLayout;
