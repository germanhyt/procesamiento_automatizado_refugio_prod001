import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { comercialService } from '@/services/comercialService';
import type { EventosAnalytics, ReservasAnalytics } from '@/services/comercialService';
import ReservasTab from '@/pages/comercial/ReservasTab';
import EventosTab from '@/pages/comercial/EventosTab';
import AnalyticsModal from '@/pages/comercial/AnalyticsModal';

type TabId = 'reservas' | 'eventos';

function userHasCodename(
    user: ReturnType<typeof useAuth>['user'],
    codename: string
): boolean {
    if (!user) return false;
    if (user.is_superuser) return true;
    const roles = (user as { roles?: Array<{ permissions?: Array<{ codename: string }> }> }).roles;
    return roles?.some((role) => role.permissions?.some((p) => p.codename === codename)) ?? false;
}

const ComercialPanel: React.FC = () => {
    const { token, user } = useAuth();
    const t = token ?? '';
    const canManage = userHasCodename(user, 'comercial:manage');

    const [tab, setTab] = useState<TabId>('reservas');
    const [analyticsOpen, setAnalyticsOpen] = useState(false);

    const resAnalytics = useQuery({
        queryKey: ['comercial-analytics-reservas'],
        queryFn: () => comercialService.analyticsReservas(t),
        enabled: !!t && analyticsOpen && tab === 'reservas',
    });

    const evtAnalytics = useQuery({
        queryKey: ['comercial-analytics-eventos'],
        queryFn: () => comercialService.analyticsEventos(t),
        enabled: !!t && analyticsOpen && tab === 'eventos',
    });

    const analyticsData: ReservasAnalytics | EventosAnalytics | null =
        tab === 'reservas' ? (resAnalytics.data ?? null) : (evtAnalytics.data ?? null);
    const analyticsLoading =
        tab === 'reservas' ? resAnalytics.isLoading : evtAnalytics.isLoading;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase text-app-text">Comercial</h1>
                    <p className="text-sm text-app-muted mt-1">Reservas y eventos</p>
                </div>
                <button
                    type="button"
                    onClick={() => setAnalyticsOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-app-commercial-muted bg-app-input px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-app-text hover:bg-app-commercial-muted-bg transition-colors"
                >
                    <BarChart3 size={16} className="text-app-commercial" />
                    Analytics
                </button>
            </div>

            <div className="bg-app-card border border-app-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex gap-2 p-1 rounded-2xl w-fit bg-app-input border border-app-border">
                    {(
                        [
                            { id: 'reservas' as const, label: 'Reservas' },
                            { id: 'eventos' as const, label: 'Eventos' },
                        ] as const
                    ).map((x) => (
                        <button
                            key={x.id}
                            type="button"
                            onClick={() => setTab(x.id)}
                            className={`relative px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${tab === x.id ? 'text-black' : 'text-app-muted hover:text-app-text'
                                }`}
                        >
                            {tab === x.id && (
                                <motion.div
                                    layoutId="comercial-tab"
                                    className="absolute inset-0 bg-app-commercial rounded-xl shadow-app-secondary-glow"
                                    transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
                                />
                            )}
                            <span className="relative z-10">{x.label}</span>
                        </button>
                    ))}
                </div>

                <div>
                    <div className={tab === 'reservas' ? 'block' : 'hidden'} aria-hidden={tab !== 'reservas'}>
                        <ReservasTab token={t} canManage={canManage} />
                    </div>
                    <div className={tab === 'eventos' ? 'block' : 'hidden'} aria-hidden={tab !== 'eventos'}>
                        <EventosTab token={t} canManage={canManage} />
                    </div>
                </div>
            </div>

            <AnalyticsModal
                open={analyticsOpen}
                onClose={() => setAnalyticsOpen(false)}
                kind={tab === 'reservas' ? 'reservas' : 'eventos'}
                data={analyticsData}
                loading={analyticsLoading}
            />
        </div>
    );
};

export default ComercialPanel;
