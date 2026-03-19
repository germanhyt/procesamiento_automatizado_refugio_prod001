import React from 'react';

interface StatCardProps {
    icon: React.ReactNode;
    title: string;
    value: string;
    subtitle: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, title, value, subtitle }) => (
    <div className="bg-app-card p-6 sm:p-10 rounded-[30px] sm:rounded-[40px] border border-app-border hover:border-app-accent-muted transition-all group">
        <div className="text-app-accent mb-8 group-hover:scale-110 transition-transform duration-300">{icon}</div>
        <h4 className="text-[10px] font-black text-app-muted uppercase tracking-widest mb-2">{title}</h4>
        <div className="text-3xl font-black text-app-text tracking-tighter">{value}</div>
        <p className="text-[10px] text-app-muted mt-2 font-mono">{subtitle}</p>
    </div>
);

export default StatCard;
