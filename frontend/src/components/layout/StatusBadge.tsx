import React from 'react';

interface StatusBadgeProps {
    active: boolean;
    label: string;
    loading?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ active, label, loading }) => (
    <div
        className={`px-3 sm:px-5 py-2 rounded-2xl border text-[9px] font-black uppercase tracking-widest flex items-center gap-2 sm:gap-3 transition-all ${
            loading ? 'opacity-30' : active ? 'bg-app-success-muted text-app-success border-app-accent-muted' : 'bg-app-danger-muted text-app-danger border-app-danger'
        }`}
    >
        <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                active ? 'bg-app-accent shadow-[0_0_10px_var(--app-accent-muted)]' : 'bg-app-danger'
            }`}
        />
        <span className="hidden lg:block">{label}</span>
        {!active && <span className="lg:hidden">!</span>}
    </div>
);

export default StatusBadge;
