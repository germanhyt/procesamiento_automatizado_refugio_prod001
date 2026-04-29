import React from 'react';
import { motion } from 'framer-motion';
import { Home, Database, Hand, Handshake } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const Welcome: React.FC = () => {
    const { user } = useAuth();

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto py-10"
        >
            <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-app-accent-muted-bg border border-app-accent-muted flex items-center justify-center text-app-accent">
                    <Handshake size={28} />
                </div>
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-app-text">
                        Bienvenido, {user?.username ?? 'Usuario'}
                    </h1>
                    <p className="text-[10px] text-refugio-muted uppercase tracking-widest mt-1">
                        Al Motor de Datos de Refugio
                    </p>
                </div>
            </div>

            {/* <div className="bg-zinc-900/40 border border-white/5 rounded-[30px] p-8 sm:p-12">
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                    Usa el menú lateral para acceder al Dashboard Refugio
                    al Flujo Diario Manual (Legacy) o a la Gestión de Usuarios según tus permisos.
                </p>
                <div className="flex items-center gap-3 text-[10px] font-mono text-refugio-muted">
                    <ul>
                        <li>1 Procesamiento y carga de datos a BigQuery</li>
                        <li>2.Visualización de dashboard</li>
                        <li>3. Gestión de usuarios, roles y permisos</li>
                    </ul>
                </div>
            </div> */}
        </motion.div>
    );
};

export default Welcome;
