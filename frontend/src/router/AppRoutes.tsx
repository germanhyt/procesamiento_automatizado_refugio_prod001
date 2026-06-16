import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

import Login from '@/pages/Login';
import PrivateRoute from './PrivateRoute';
import MainLayout from '@/components/layout/MainLayout';

const Welcome = lazy(() => import('@/pages/Welcome'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const LegacyFlow = lazy(() => import('@/pages/flowprocess/LegacyFlow'));
const FuentesDatos = lazy(() => import('@/pages/FuentesDatos'));
const PowerBIDashboard = lazy(() => import('@/pages/PowerBIDashboard'));
const UserManagement = lazy(() => import('@/pages/UserManagement'));
const DeliveryPanel = lazy(() => import('@/pages/delivery/DeliveryPanel'));
const ComercialPanel = lazy(() => import('@/pages/comercial/ComercialPanel'));
const DocumentosGcbPage = lazy(() => import('@/pages/documentos/DocumentosGcbPage'));
const AgendaDeportivaLayout = lazy(() => import('@/pages/agenda_deportiva/AgendaDeportivaLayout'));
const AgendaProgramacionesPage = lazy(() => import('@/pages/agenda_deportiva/AgendaProgramacionesPage'));
const AgendaProgramacionSlidesPage = lazy(() => import('@/pages/agenda_deportiva/AgendaProgramacionSlidesPage'));
const AgendaMusicaPage = lazy(() => import('@/pages/agenda_deportiva/AgendaMusicaPage'));

const BIENVENIDA_PATH = '/bienvenida';

const RouteFallback = () => (
    <div className="h-screen w-screen flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
        <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-app-accent-muted border-t-app-accent rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Cargando módulo…</p>
        </div>
    </div>
);

const AppRoutes: React.FC = () => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-app-accent-muted border-t-app-accent rounded-full animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Cargando Sistema...</p>
                </div>
            </div>
        );
    }

    return (
        <Suspense fallback={<RouteFallback />}>
            <Routes>
                {/* Públicas */}
                <Route
                    path="/login"
                    element={user ? <Navigate to={BIENVENIDA_PATH} replace /> : <Login />}
                />
                <Route path="/fuentes" element={<FuentesDatos />} />

                {/* Redirect raíz */}
                <Route path="/" element={<Navigate to={user ? BIENVENIDA_PATH : '/login'} replace />} />

                {/* Privadas con layout (sidebar + header). path "/*" para que coincida /bienvenida, /legacy, etc. */}
                <Route path="/*" element={<PrivateRoute />}>
                    <Route element={<MainLayout />}>
                        <Route index element={<Navigate to={BIENVENIDA_PATH} replace />} />
                        <Route path="bienvenida" element={<Welcome />} />
                        <Route element={<PrivateRoute permission="legacy:process" />}>
                            <Route path="legacy" element={<LegacyFlow />} />
                        </Route>
                        <Route element={<PrivateRoute permission="dashboard:view" />}>
                            <Route path="powerbi" element={<PowerBIDashboard />} />
                        </Route>
                        <Route element={<PrivateRoute permission="users:manage" />}>
                            <Route path="users" element={<UserManagement />} />
                        </Route>
                        <Route element={<PrivateRoute permission="delivery:view" />}>
                            <Route path="delivery" element={<DeliveryPanel />} />
                        </Route>
                        <Route element={<PrivateRoute permission="comercial:view" />}>
                            <Route path="comercial" element={<ComercialPanel />} />
                        </Route>
                        <Route element={<PrivateRoute permission="documentos_gcb:view" />}>
                            <Route path="documentos-gcb" element={<DocumentosGcbPage />} />
                        </Route>
                        <Route element={<PrivateRoute permission="agenda_deportiva:view" />}>
                            <Route path="agenda-deportiva" element={<AgendaDeportivaLayout />}>
                                <Route index element={<Navigate to="programaciones" replace />} />
                                <Route path="programaciones" element={<AgendaProgramacionesPage />} />
                                <Route path="programaciones/:id" element={<AgendaProgramacionSlidesPage />} />
                                <Route path="musica" element={<AgendaMusicaPage />} />
                            </Route>
                        </Route>
                    </Route>
                </Route>

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </Suspense>
    );
};

export default AppRoutes;
