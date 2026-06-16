import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Shield, Key, Search, UserPlus,
    MoreVertical, Trash2, Edit3, X, Check,
    AlertCircle, RefreshCcw, Plus, Save, Wand2, Eye, EyeOff
} from 'lucide-react';
import Swal from 'sweetalert2';
import { API_URL } from '@/config/api';

const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [permissions, setPermissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);

    const fetchData = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const [u, r, p] = await Promise.all([
                axios.get(`${API_URL}/users-roles/users`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/users-roles/roles`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/users-roles/permissions`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setUsers(u.data);
            setRoles(r.data);
            setPermissions(p.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleToggleStatus = async (user: any) => {
        const token = localStorage.getItem('token');
        try {
            await axios.patch(`${API_URL}/users-roles/users/${user.id}/status`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch (err) {
            Swal.fire("Error", "No se pudo cambiar el estado", "error");
        }
    };

    const handleDeleteUser = async (user: any) => {
        const result = await Swal.fire({
            title: '¿Eliminar usuario?',
            text: `Esta acción borrará a ${user.username} permanentemente.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--app-danger)',
            cancelButtonColor: 'var(--app-muted)',
            confirmButtonText: 'Sí, eliminar',
            background: 'var(--app-panel)',
            color: 'var(--app-text)'
        });

        if (result.isConfirmed) {
            const token = localStorage.getItem('token');
            try {
                await axios.delete(`${API_URL}/users-roles/users/${user.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                Swal.fire("Eliminado", "Usuario borrado con éxito", "success");
                fetchData();
            } catch (err) {
                Swal.fire("Error", "No se pudo eliminar el usuario", "error");
            }
        }
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-8 h-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-app-text">Gestión de Usuarios</h2>
                    <p className="text-[10px] text-app-muted uppercase tracking-widest mt-1">Control de Acceso & RBAC</p>
                </div>

                <div className="flex gap-4 w-full sm:w-auto">
                    <button onClick={() => setIsRoleModalOpen(true)} className="flex-1 sm:flex-none px-6 py-3 bg-app-input hover:bg-app-surface border border-app-border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 text-app-muted hover:text-app-text">
                        <Shield size={14} className="text-current" />
                        Gestionar Roles
                    </button>
                    <button onClick={() => setIsRegisterModalOpen(true)} className="flex-1 sm:flex-none px-6 py-3 bg-app-users text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-app-users-strong hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3">
                        <UserPlus size={14} />
                        Nuevo Usuario
                    </button>
                </div>
            </div>

            <div className="relative group max-w-xl">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-app-muted group-focus-within:text-app-users transition-colors" size={18} />
                <input type="text" placeholder="Buscar por usuario o correo..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-app-input border border-app-border rounded-2xl py-5 pl-16 pr-6 text-sm text-app-text focus:border-app-users-muted outline-none transition-all" />
            </div>

            <div className="bg-app-card border border-app-border rounded-[40px] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead className="bg-app-input text-app-table-head uppercase text-[9px] font-black tracking-widest">
                            <tr>
                                <th className="p-8">Usuario</th>
                                <th className="p-8">Email</th>
                                <th className="p-8">Roles</th>
                                <th className="p-8">Estado</th>
                                <th className="p-8">Creado</th>
                                <th className="p-8 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px] text-app-muted">
                            {loading ? (
                                <tr><td colSpan={6} className="p-20 text-center"><RefreshCcw className="animate-spin text-app-users mx-auto mb-4" size={32} /><span className="uppercase font-black text-app-muted">Sincronizando...</span></td></tr>
                            ) : filteredUsers.map(user => (
                                <tr key={user.id} className="border-b border-app-border hover:bg-app-surface transition-colors">
                                    <td className="p-8 flex items-center gap-4">
                                        <div
                                            aria-hidden
                                            className="w-10 h-10 shrink-0 rounded-xl bg-app-users-muted-bg flex items-center justify-center border border-app-users-muted font-black text-app-text-secondary"
                                        >
                                            {user.username.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-app-text font-black uppercase text-xs">{user.username}</div>
                                            <div className="text-[9px] font-mono text-app-text-secondary/95">ID: {user.id.toString().padStart(4, '0')}</div>
                                        </div>
                                    </td>
                                    <td className="p-8 font-medium italic">{user.email}</td>
                                    <td className="p-8">
                                        <div className="flex flex-wrap gap-2">
                                            {user.roles.map((r: any) => (
                                                <span key={r.id} className="px-3 py-1 bg-app-surface border border-app-border rounded-lg text-[8px] font-black uppercase text-app-text">{r.name}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-8">
                                        <button onClick={() => handleToggleStatus(user)} className={`px-4 py-1.5 rounded-full border text-[8px] font-black uppercase w-fit cursor-pointer transition-all hover:scale-105 ${user.is_active ? 'bg-app-success-muted border-app-success text-app-success' : 'bg-app-danger-muted border-app-danger text-app-danger'}`}>{user.is_active ? 'Activo' : 'Baja'}</button>
                                    </td>
                                    <td className="p-8 font-mono text-app-text-secondary/90">{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td className="p-8 text-right flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditingUser(user)}
                                            className="p-3 text-app-text-secondary hover:text-app-users transition-colors"
                                            aria-label={`Editar ${user.username}`}
                                        >
                                            <Edit3 size={16} className="shrink-0" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteUser(user)}
                                            className="p-3 text-app-text-secondary hover:text-app-danger transition-colors"
                                            aria-label={`Eliminar ${user.username}`}
                                        >
                                            <Trash2 size={16} className="shrink-0" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <AnimatePresence>
                {isRoleModalOpen && <RoleModal onClose={() => setIsRoleModalOpen(false)} roles={roles} permissions={permissions} onSuccess={fetchData} />}
                {isRegisterModalOpen && <RegisterModal onClose={() => setIsRegisterModalOpen(false)} roles={roles} onSuccess={fetchData} />}
                {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} roles={roles} onSuccess={fetchData} />}
            </AnimatePresence>
        </div>
    );
};

const MODULE_LABELS: Record<string, string> = {
    core: 'Núcleo',
    legacy: 'Procesamiento',
    users: 'Usuarios',
    comercial: 'Comercial',
    documentos_gcb: 'Documentos GCB',
    agenda_deportiva: 'Agenda Deportiva',
    delivery: 'Delivery',
};

const RoleModal = ({ onClose, roles, permissions, onSuccess }: any) => {
    const [selectedRole, setSelectedRole] = useState<any>(roles[0] || null);
    const [searchPerm, setSearchPerm] = useState('');
    const [selectedPermIds, setSelectedPermIds] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newRoleData, setNewRoleData] = useState({ name: '', description: '' });

    useEffect(() => {
        if (selectedRole && !isCreating) {
            setSelectedPermIds(selectedRole.permissions?.map((p: any) => p.id) || []);
        }
    }, [selectedRole, isCreating]);

    const groupedPermissions = useMemo(() => {
        const q = searchPerm.trim().toLowerCase();
        const groups: Record<string, any[]> = {};
        for (const p of permissions || []) {
            if (q && !p.name.toLowerCase().includes(q) && !p.codename.toLowerCase().includes(q)) {
                continue;
            }
            const mod = p.module || 'otros';
            if (!groups[mod]) groups[mod] = [];
            groups[mod].push(p);
        }
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [permissions, searchPerm]);

    const handleSaveRole = async () => {
        setIsSaving(true);
        const token = localStorage.getItem('token');
        try {
            if (isCreating) {
                await axios.post(`${API_URL}/users-roles/roles`, {
                    ...newRoleData,
                    permission_ids: selectedPermIds
                }, { headers: { Authorization: `Bearer ${token}` } });
            } else {
                await axios.put(`${API_URL}/users-roles/roles/${selectedRole.id}`, {
                    name: selectedRole.name,
                    description: selectedRole.description,
                    permission_ids: selectedPermIds
                }, { headers: { Authorization: `Bearer ${token}` } });
            }
            onSuccess();
            setIsCreating(false);
            Swal.fire("Éxito", "Rol guardado", "success");
        } catch (err) {
            Swal.fire("Error", "No se pudo guardar", "error");
        } finally { setIsSaving(false); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl">
        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-app-modal-solid border border-app-border w-full max-w-6xl h-[90vh] sm:h-[85vh] rounded-[30px] sm:rounded-[40px] flex overflow-hidden flex-col sm:flex-row shadow-2xl text-app-text">
                <div className="w-full sm:w-80 bg-app-surface border-r border-app-border flex flex-col">
                    <div className="p-8 border-b border-app-border flex justify-between items-center bg-app-input">
                        <span className="uppercase tracking-widest text-[10px] font-black text-app-users">Roles</span>
                        <button onClick={() => { setIsCreating(true); setSelectedRole(null); setSelectedPermIds([]); }} className="p-2 hover:bg-app-users-muted-bg text-app-users rounded-lg transition-all"><Plus size={16} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {roles.map((r: any) => (
                            <button key={r.id} onClick={() => { setSelectedRole(r); setIsCreating(false); }} className={`w-full p-6 rounded-2xl text-left transition-all border ${selectedRole?.id === r.id ? 'bg-app-users text-white border-app-users' : 'bg-transparent text-app-muted border-transparent hover:bg-app-card-hover hover:text-app-text'}`}>
                                <div className="text-[11px] font-black uppercase tracking-tight">{r.name}</div>
                            </button>
                        ))}
                    </div>
                    <button onClick={onClose} className="p-8 border-t border-app-border text-[9px] font-black uppercase text-app-muted hover:text-app-text transition-all">Cerrar</button>
                </div>
                <div className="flex-1 flex flex-col min-w-0 bg-app-panel">
                    <div className="p-8 border-b border-app-border flex flex-col sm:flex-row gap-6 justify-between items-center bg-app-surface">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-app-users-muted-bg text-app-users rounded-xl"><Key size={20} /></div>
                            <div>
                                <h4 className="text-[12px] font-black uppercase text-app-text">Configurar Permisos</h4>
                                <p className="text-[9px] text-app-muted mt-1 uppercase leading-none">{isCreating ? 'Nuevo Rol' : `Editando: ${selectedRole?.name}`}</p>
                            </div>
                        </div>
                        <input type="text" placeholder="Buscar permiso..." value={searchPerm} onChange={e => setSearchPerm(e.target.value)} className="bg-app-input border border-app-border rounded-xl py-3 px-6 text-[11px] text-app-text outline-none focus:border-app-users-muted w-full sm:w-64" />
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 sm:p-12 space-y-6 sm:space-y-8 scrollbar-hide">
                        {isCreating && (
                            <div className="grid grid-cols-2 gap-6 p-8 bg-app-users-muted-bg rounded-3xl border border-app-users-muted">
                                <input placeholder="Nombre del Rol" className="bg-app-input border border-app-border rounded-2xl p-4 text-xs text-app-text outline-none" value={newRoleData.name} onChange={e => setNewRoleData({ ...newRoleData, name: e.target.value })} />
                                <input placeholder="Descripción" className="bg-app-input border border-app-border rounded-2xl p-4 text-xs text-app-text outline-none" value={newRoleData.description} onChange={e => setNewRoleData({ ...newRoleData, description: e.target.value })} />
                            </div>
                        )}
                        <div className="space-y-8">
                            {groupedPermissions.map(([moduleKey, modulePerms]) => (
                                <div key={moduleKey} className="space-y-4">
                                    <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-app-muted">
                                        {MODULE_LABELS[moduleKey] || moduleKey}
                                    </h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {modulePerms.map((p: any) => {
                                            const isChecked = selectedPermIds.includes(p.id);
                                            return (
                                                <div key={p.id} onClick={() => setSelectedPermIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} className={`p-6 rounded-2xl border transition-all flex items-start gap-4 cursor-pointer ${isChecked ? 'bg-app-users-muted-bg border-app-users-muted' : 'bg-app-surface border-app-border hover:border-app-users-muted'}`}>
                                                    <div className={`mt-1 h-5 w-5 rounded-md border flex items-center justify-center ${isChecked ? 'bg-app-users border-app-users text-white' : 'bg-app-input border-app-border'}`}>{isChecked && <Check size={12} strokeWidth={4} />}</div>
                                                    <div className="min-w-0">
                                                        <div className="text-[11px] font-black uppercase text-app-text truncate">{p.name}</div>
                                                        <div className="text-[9px] text-app-muted font-mono mt-0.5">{p.codename}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-6 sm:p-10 border-t border-app-border flex flex-col sm:flex-row gap-4 justify-between items-center px-8 sm:px-12 bg-app-surface">
                        <span className="text-[10px] font-black text-app-muted uppercase tracking-widest">{selectedPermIds.length} Asignados</span>
                        <button onClick={handleSaveRole} disabled={isSaving || (!selectedRole && !isCreating)} className="w-full sm:w-auto px-12 py-4 bg-app-users text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-app-users-strong disabled:opacity-50">{isSaving ? <RefreshCcw className="animate-spin" size={16} /> : <Save size={16} />}{isCreating ? 'Guardar Rol' : 'Actualizar'}</button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

const RegisterModal = ({ onClose, roles, onSuccess }: any) => {
    const [formData, setFormData] = useState({ username: '', email: '', password: '', role_ids: [] as number[] });
    const [loading, setLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`${API_URL}/auth/register`, formData, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            Swal.fire("Éxito", "Usuario creado", "success");
            onSuccess(); onClose();
        } catch (err: any) { Swal.fire("Error", "No se pudo registrar", "error"); }
        finally { setLoading(false); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-app-modal-solid border border-app-border w-full max-w-lg rounded-[30px] sm:rounded-[40px] p-6 sm:p-12 shadow-2xl space-y-6 sm:space-y-8 text-app-text">
                <div className="flex justify-between items-center border-b border-app-border pb-6 sm:pb-8"><h3 className="text-lg sm:text-xl font-black uppercase tracking-widest text-app-text">Nuevo Usuario</h3><button onClick={onClose} className="text-app-muted hover:text-app-text"><X size={20} /></button></div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><label className="text-[9px] font-black text-app-muted ml-2 uppercase">Usuario</label><input className="w-full bg-app-input border border-app-border rounded-2xl p-4 text-sm text-app-text outline-none" required value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} /></div>
                        <div className="space-y-2"><label className="text-[9px] font-black text-app-muted ml-2 uppercase">Email</label><input type="email" className="w-full bg-app-input border border-app-border rounded-2xl p-4 text-sm text-app-text outline-none" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
                    </div>
                    <div className="space-y-2 relative"><label className="text-[9px] font-black text-app-muted ml-2 uppercase">Password</label>
                        <div className="relative"><input type={showPass ? "text" : "password"} className="w-full bg-app-input border border-app-border rounded-2xl p-4 pr-32 text-sm text-app-text outline-none" required value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
                                <button type="button" onClick={() => setShowPass(!showPass)} className="p-2 text-app-muted hover:text-app-text transition-colors" aria-label={showPass ? 'Ocultar contraseña' : 'Ver contraseña'}>
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setFormData({ ...formData, password: generatePassword() }); setShowPass(true); }}
                                    className="p-2 rounded-lg border border-app-border bg-app-input text-app-text-secondary hover:text-app-accent hover:border-app-accent hover:bg-app-accent-muted-bg transition-colors"
                                    title="Generar contraseña"
                                    aria-label="Generar contraseña"
                                >
                                    <Wand2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3"><label className="text-[9px] font-black text-app-muted ml-2 uppercase">Roles</label><div className="flex flex-wrap gap-2">{roles.map((r: any) => (<button key={r.id} type="button" onClick={() => setFormData({ ...formData, role_ids: formData.role_ids.includes(r.id) ? formData.role_ids.filter(x => x !== r.id) : [...formData.role_ids, r.id] })} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${formData.role_ids.includes(r.id) ? 'bg-app-users text-white border-app-users' : 'bg-app-surface text-app-muted border-app-border'}`}>{r.name}</button>))}</div></div>
                    <div className="pt-8 flex gap-4"><button type="button" onClick={onClose} className="flex-1 py-4 bg-app-surface rounded-2xl text-[10px] font-black uppercase tracking-widest text-app-muted border border-app-border">Cancelar</button><button disabled={loading} className="flex-1 py-4 bg-app-users text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-app-users-strong">{loading ? <RefreshCcw className="animate-spin mx-auto" size={18} /> : 'Registrar'}</button></div>
                </form>
            </motion.div>
        </motion.div>
    );
};

const EditUserModal = ({ user, onClose, roles, onSuccess }: any) => {
    const [formData, setFormData] = useState({ username: user.username, email: user.email, password: '', role_ids: user.roles.map((r: any) => r.id) });
    const [loading, setLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);

    const handleUpdate = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            await axios.patch(`${API_URL}/users-roles/users/${user.id}/roles`, formData.role_ids, { headers: { Authorization: `Bearer ${token}` } });
            if (formData.password) await axios.patch(`${API_URL}/users-roles/users/${user.id}/password`, { password: formData.password }, { headers: { Authorization: `Bearer ${token}` } });
            Swal.fire("Éxito", "Actualizado", "success");
            onSuccess(); onClose();
        } catch (err) { Swal.fire("Error", "No se pudo actualizar", "error"); }
        finally { setLoading(false); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-app-modal-solid border border-app-border w-full max-w-md rounded-[30px] sm:rounded-[40px] p-6 sm:p-12 shadow-2xl space-y-6 sm:space-y-8 text-app-text">
                <div className="flex justify-between items-center border-b border-app-border pb-6 sm:pb-8"><h3 className="text-lg sm:text-xl font-black uppercase tracking-widest text-app-text">Editar Usuario</h3><button onClick={onClose} className="text-app-muted hover:text-app-text"><X size={20} /></button></div>
                <div className="space-y-6">
                    <div className="space-y-2"><label className="text-[9px] font-black text-app-muted ml-2 uppercase">Password (Opcional)</label>
                        <div className="relative"><input type={showPass ? "text" : "password"} className="w-full bg-app-input border border-app-border rounded-2xl p-4 text-sm text-app-text outline-none" placeholder="Vacío para no cambiar" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
                                <button type="button" onClick={() => setShowPass(!showPass)} className="p-2 text-app-muted hover:text-app-text transition-colors" aria-label={showPass ? 'Ocultar contraseña' : 'Ver contraseña'}>
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setFormData({ ...formData, password: generatePassword() }); setShowPass(true); }}
                                    className="p-2 rounded-lg border border-app-border bg-app-input text-app-text-secondary hover:text-app-accent hover:border-app-accent hover:bg-app-accent-muted-bg transition-colors"
                                    title="Generar contraseña"
                                    aria-label="Generar contraseña"
                                >
                                    <Wand2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <label className="text-[10px] font-black text-app-muted ml-4 uppercase">Roles</label>
                    <div className="flex flex-col gap-2">{roles.map((r: any) => (
                        <button key={r.id} onClick={() => setFormData({ ...formData, role_ids: formData.role_ids.includes(r.id) ? formData.role_ids.filter((x: any) => x !== r.id) : [...formData.role_ids, r.id] })} className={`w-full p-4 rounded-2xl text-left border transition-all flex items-center justify-between ${formData.role_ids.includes(r.id) ? 'bg-app-users-muted-bg border-app-users text-app-users' : 'bg-transparent border-app-border text-app-muted'}`}>
                            <span className="text-[11px] font-black uppercase">{r.name}</span>{formData.role_ids.includes(r.id) && <Check size={16} />}
                        </button>
                    ))}</div>
                </div>
                <button disabled={loading} onClick={handleUpdate} className="w-full py-5 bg-app-users text-white rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-app-users-strong">{loading ? <RefreshCcw className="animate-spin mx-auto" size={20} /> : 'Guardar'}</button>
            </motion.div>
        </motion.div>
    );
};

export default UserManagement;
