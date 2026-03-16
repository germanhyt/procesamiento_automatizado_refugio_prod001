import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Home } from 'lucide-react';

const NotFound: React.FC = () => (
    <div className="h-screen w-screen bg-[#050505] flex items-center justify-center overflow-hidden relative">
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-teal-500/10 blur-[120px] rounded-full" />
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center z-10 px-6"
        >
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mx-auto mb-8">
                <AlertCircle size={40} />
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-white mb-2">404</h1>
            <p className="text-zinc-500 text-sm uppercase tracking-widest mb-8">Página no encontrada</p>
            <Link
                to="/"
                className="inline-flex items-center gap-2 bg-teal-500 text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-400 transition-all"
            >
                <Home size={16} />
                Ir al inicio
            </Link>
        </motion.div>
    </div>
);

export default NotFound;
