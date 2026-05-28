import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
        'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border',
        isActive
            ? 'border-[var(--app-agenda-accent-muted)] bg-[var(--app-agenda-accent-muted-bg)] text-[var(--app-agenda-accent)]'
            : 'border-transparent text-app-muted hover:text-app-text hover:bg-app-card-hover',
    ].join(' ');

const AgendaDeportivaLayout: React.FC = () => {
    return (
        <div className="space-y-6">
            <div
                className="flex flex-wrap gap-2 p-1 rounded-2xl border"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
            >
                <NavLink to="/agenda-deportiva/programaciones" className={linkClass} end>
                    Programaciones
                </NavLink>
                <NavLink to="/agenda-deportiva/musica" className={linkClass}>
                    Música
                </NavLink>
            </div>
            <Outlet />
        </div>
    );
};

export default AgendaDeportivaLayout;
