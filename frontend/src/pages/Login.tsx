import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, RefreshCcw, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { useAuth } from '@/context/AuthContext';
import logo from '@/assets/logo.png';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        try {
            const res = await axios.post(`${API_URL}/auth/login`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (res.data.access_token) {
                await login(res.data.access_token);
                Swal.fire({
                    icon: 'success',
                    title: '¡Bienvenido!',
                    text: 'Acceso concedido al motor Refugio.',
                    timer: 2000,
                    showConfirmButton: false,
                    background: 'var(--app-panel)',
                    color: 'var(--app-text)',
                });
                navigate('/bienvenida', { replace: true });
            }
        } catch (err: any) {
            Swal.fire({
                icon: 'error',
                title: 'Error de Acceso',
                text: 'Credenciales inválidas o servidor no responde.',
                background: 'var(--app-panel)',
                color: 'var(--app-text)',
                confirmButtonColor: 'var(--app-accent)',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen flex items-center justify-center overflow-hidden relative bg-app-bg text-app-text">
            {/* Background elements - tema-aware */}
            <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full blur-[120px] [background:var(--app-accent)] opacity-[0.08]"></div>
            <div className="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full blur-[120px] [background:var(--app-accent)] opacity-[0.06]"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-[90%] sm:max-w-md p-6 sm:p-10 backdrop-blur-3xl rounded-[30px] sm:rounded-[40px] shadow-2xl z-10 border border-app-border bg-app-surface"
            >
                <div className="flex flex-col items-center mb-10">
                    {/* <div className="w-16 h-16 bg-teal-500/10 rounded-2xl flex items-center justify-center text-teal-500 border border-teal-500/20 mb-6"> */}
                    <div className="relative shrink-0 my-2">
                        <div className="absolute inset-0 rounded-full blur-2xl [background:var(--app-accent)] opacity-30"></div>
                        <img src={logo} alt="Refugio Logo" className="w-14 h-14 rounded-full border-2 border-app-accent-muted object-cover relative shadow-lg" />
                    </div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-app-text">Refugio Data</h1>
                    {/* <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">Seguridad & Autenticación</p> */}
                    <p className="text-[10px] text-app-muted uppercase tracking-widest mt-2">Login</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-app-muted ml-4 tracking-widest">Usuario</label>
                        <div className="relative group">
                            <User className="absolute left-5 top-1/2 -translate-y-1/2 text-app-muted group-focus-within:text-app-accent transition-colors" size={18} />
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-app-input border border-app-border rounded-2xl py-5 pl-14 pr-6 text-sm text-app-text placeholder:text-app-muted focus:border-app-accent outline-none transition-all hover:border-app-accent-muted"
                                placeholder="Ingresa tu usuario..."
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-refugio-muted ml-4 tracking-widest">Contraseña</label>
                        <div className="relative group">
                            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-app-muted group-focus-within:text-app-accent transition-colors" size={18} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-app-input border border-app-border rounded-2xl py-5 pl-14 pr-14 text-sm text-app-text focus:border-app-accent outline-none transition-all"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-app-muted hover:text-app-accent transition-colors rounded-lg hover:bg-app-card-hover"
                                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-teal-500 hover:bg-teal-400 text-black py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <RefreshCcw className="animate-spin" size={16} />
                        ) : (
                            <>
                                Ingresar
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                {/* <div className="mt-10 text-center">
                    <p className="text-[9px] text-zinc-700 font-mono">v4.5 Secure Tunnel | AES-256 Encryption</p>
                </div> */}
            </motion.div>
        </div>
    );
};

export default Login;
