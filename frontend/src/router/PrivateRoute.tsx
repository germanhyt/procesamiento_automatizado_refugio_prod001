import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const LOGIN_PATH = '/login';
const BIENVENIDA_PATH = '/bienvenida';

interface PrivateRouteProps {
    /** Si se indica, solo usuarios con este permiso pueden acceder. */
    permission?: string;
    /** Si true, solo superuser puede acceder. */
    requireSuperuser?: boolean;
}

/**
 * Protege rutas: requiere usuario autenticado y opcionalmente permiso o superuser.
 * Redirige a /login si no hay usuario; a /bienvenida si no cumple permiso/superuser.
 */
const PrivateRoute: React.FC<PrivateRouteProps> = ({ permission, requireSuperuser }) => {
    const { user, isLoading } = useAuth();
    const location = useLocation();

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

    if (!user) {
        return <Navigate to={LOGIN_PATH} state={{ from: location }} replace />;
    }

    if (requireSuperuser && !user.is_superuser) {
        return <Navigate to={BIENVENIDA_PATH} replace />;
    }

    if (permission) {
        const hasPermission =
            user.is_superuser ||
            (user as { roles?: Array<{ permissions?: Array<{ codename: string }> }> }).roles?.some((role) =>
                role.permissions?.some((p) => p.codename === permission)
            );
        if (!hasPermission) {
            return <Navigate to={BIENVENIDA_PATH} replace />;
        }
    }

    return <Outlet />;
};

export default PrivateRoute;
