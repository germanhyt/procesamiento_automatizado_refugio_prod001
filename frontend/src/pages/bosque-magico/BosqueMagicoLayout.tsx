import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
        'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border',
        isActive
            ? 'border-[var(--app-bosque-magico-accent-muted)] bg-[var(--app-bosque-magico-accent-muted-bg)] text-[var(--app-bosque-magico-accent)]'
            : 'border-transparent text-app-muted hover:text-app-text hover:bg-app-card-hover',
    ].join(' ');

const BosqueMagicoLayout: React.FC = () => {
    return (
        <div className="space-y-6">
            <div
                className="flex flex-wrap gap-2 p-1 rounded-2xl border"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
            >
                <NavLink to="/bosque-magico/leads" className={linkClass}>
                    Leads
                </NavLink>
                <NavLink to="/bosque-magico/config" className={linkClass}>
                    Configuración
                </NavLink>
            </div>
            <Outlet />
        </div>
    );
};

export default BosqueMagicoLayout;
