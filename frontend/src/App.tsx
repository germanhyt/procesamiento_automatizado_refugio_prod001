import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import AppRoutes from '@/router/AppRoutes';
import { useTheme } from '@/hooks/useTheme';

const ThemeBootstrap: React.FC = () => {
    useTheme();
    return null;
};

const App: React.FC = () => (
    <AuthProvider>
        <ThemeBootstrap />
        <AppRoutes />
    </AuthProvider>
);

export default App;
