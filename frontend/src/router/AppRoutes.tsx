import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

import Login from '@/pages/Login';
import Welcome from '@/pages/Welcome';
import NotFound from '@/pages/NotFound';
import LegacyFlow from '@/pages/flowprocess/LegacyFlow';
import PowerBIDashboard from '@/pages/PowerBIDashboard';
import UserManagement from '@/pages/UserManagement';
import FuentesDatos from '@/pages/FuentesDatos';
import DeliveryPanel from '@/pages/delivery/DeliveryPanel';
import ComercialPanel from '@/pages/comercial/ComercialPanel';
import DocumentosGcbPage from '@/pages/documentos/DocumentosGcbPage';

import PrivateRoute from './PrivateRoute';
import MainLayout from '@/components/layout/MainLayout';

const BIENVENIDA_PATH = '/bienvenida';

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
                    <Route path="legacy" element={<LegacyFlow />} />
                    <Route path="powerbi" element={<PowerBIDashboard />} />
                    <Route path="users" element={<UserManagement />} />
                    <Route element={<PrivateRoute permission="delivery:view" />}>
                        <Route path="delivery" element={<DeliveryPanel />} />
                    </Route>
                    <Route element={<PrivateRoute permission="comercial:view" />}>
                        <Route path="comercial" element={<ComercialPanel />} />
                    </Route>
                    <Route element={<PrivateRoute permission="documentos_gcb:view" />}>
                        <Route path="documentos-gcb" element={<DocumentosGcbPage />} />
                    </Route>
                </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
};

export default AppRoutes;
