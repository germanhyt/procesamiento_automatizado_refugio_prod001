import React from 'react';

interface StatCardProps {
    icon: React.ReactNode;
    title: string;
    value: string;
    subtitle: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, title, value, subtitle }) => (
    <div className="bg-zinc-900/40 p-6 sm:p-10 rounded-[30px] sm:rounded-[40px] border border-white/5 hover:border-teal-500/20 transition-all group">
        <div className="text-teal-500 mb-8 group-hover:scale-110 transition-transform duration-300">{icon}</div>
        <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">{title}</h4>
        <div className="text-3xl font-black text-white tracking-tighter">{value}</div>
        <p className="text-[10px] text-zinc-500 mt-2 font-mono">{subtitle}</p>
    </div>
);

export default StatCard;
