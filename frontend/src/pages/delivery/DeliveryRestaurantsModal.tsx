import React, { useEffect, useState } from 'react';
import axios from 'axios';
import type { RestaurantAdmin } from '@/services/deliveryService';
import { useAdminRestaurantMutations, useAdminRestaurants } from '@/hooks/useDelivery';

function apiDetail(e: unknown): string {
    if (axios.isAxiosError(e)) {
        const d = e.response?.data as { detail?: unknown } | undefined;
        const detail = d?.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join('; ');
        }
    }
    return 'No se pudo completar la operación';
}

export interface DeliveryRestaurantsModalProps {
    open: boolean;
    onClose: () => void;
    toast: (opts: { icon: 'success' | 'error' | 'warning' | 'info'; title: string; text?: string }) => void | Promise<void>;
}

type DraftState = null | { mode: 'create' } | { mode: 'edit'; row: RestaurantAdmin };

const DeliveryRestaurantsModal: React.FC<DeliveryRestaurantsModalProps> = ({ open, onClose, toast }) => {
    const listQ = useAdminRestaurants(open);
    const mut = useAdminRestaurantMutations();

    const [draft, setDraft] = useState<DraftState>(null);
    const [emailTarget, setEmailTarget] = useState<RestaurantAdmin | null>(null);
    const [newEmail, setNewEmail] = useState('');

    const [fidelioId, setFidelioId] = useState('');
    const [nombre, setNombre] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [codigoNegocio, setCodigoNegocio] = useState('');
    const [codigoComunicacion, setCodigoComunicacion] = useState('');

    useEffect(() => {
        if (!draft) return;
        if (draft.mode === 'create') {
            setFidelioId('');
            setNombre('');
            setIsActive(true);
            setCodigoNegocio('');
            setCodigoComunicacion('');
        } else {
            const r = draft.row;
            setFidelioId(r.fidelio_id);
            setNombre(r.nombre);
            setIsActive(r.is_active);
            setCodigoNegocio(r.codigo_negocio ?? '');
            setCodigoComunicacion(r.codigo_comunicacion ?? '');
        }
    }, [draft]);

    useEffect(() => {
        if (!open) {
            setDraft(null);
            setEmailTarget(null);
            setNewEmail('');
        }
    }, [open]);

    const emailRestaurant =
        emailTarget && listQ.data ? listQ.data.find((r) => r.id === emailTarget.id) ?? emailTarget : null;

    const closeMain = () => {
        setDraft(null);
        onClose();
    };

    const saveDraft = async () => {
        if (!draft) return;
        const cn = codigoNegocio.trim() || null;
        const cc = codigoComunicacion.trim() || null;
        try {
            if (draft.mode === 'create') {
                await mut.createRestaurant.mutateAsync({
                    fidelio_id: fidelioId.trim(),
                    nombre: nombre.trim(),
                    is_active: isActive,
                    codigo_negocio: cn,
                    codigo_comunicacion: cc,
                });
                void toast({ icon: 'success', title: 'Restaurante creado' });
            } else {
                await mut.updateRestaurant.mutateAsync({
                    id: draft.row.id,
                    payload: {
                        fidelio_id: fidelioId.trim(),
                        nombre: nombre.trim(),
                        is_active: isActive,
                        codigo_negocio: cn,
                        codigo_comunicacion: cc,
                    },
                });
                void toast({ icon: 'success', title: 'Restaurante actualizado' });
            }
            setDraft(null);
        } catch (e) {
            void toast({ icon: 'error', title: apiDetail(e) });
        }
    };

    const addEmail = async () => {
        if (!emailRestaurant) return;
        const em = newEmail.trim();
        if (!em) {
            void toast({ icon: 'warning', title: 'Ingresa un correo' });
            return;
        }
        try {
            await mut.addNotificationEmail.mutateAsync({ restaurantId: emailRestaurant.id, email: em });
            setNewEmail('');
            void toast({ icon: 'success', title: 'Correo agregado' });
        } catch (e) {
            void toast({ icon: 'error', title: apiDetail(e) });
        }
    };

    const removeEmail = async (emailRowId: number) => {
        if (!emailRestaurant) return;
        try {
            await mut.deleteNotificationEmail.mutateAsync({
                restaurantId: emailRestaurant.id,
                emailRowId,
            });
            void toast({ icon: 'success', title: 'Correo eliminado' });
        } catch (e) {
            void toast({ icon: 'error', title: apiDetail(e) });
        }
    };

    if (!open) return null;

    const inputCls =
        'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';
    const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1';

    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                onClick={closeMain}
                role="presentation"
            >
                <div
                    className="bg-app-panel border border-app-border rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delivery-restaurants-title"
                >
                    <div className="flex items-center justify-between gap-3 p-5 border-b border-app-border shrink-0">
                        <h2 id="delivery-restaurants-title" className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                            Restaurantes (Delivery)
                        </h2>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setDraft({ mode: 'create' })}
                                disabled={!!draft}
                                className="px-3 py-1.5 rounded-xl bg-app-delivery-muted-bg text-app-delivery border border-app-delivery-muted text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                            >
                                Nuevo
                            </button>
                            <button
                                type="button"
                                onClick={() => listQ.refetch()}
                                className="px-3 py-1.5 rounded-xl bg-app-input border border-app-border text-[9px] font-black uppercase tracking-widest text-app-text"
                            >
                                Recargar
                            </button>
                            <button
                                type="button"
                                onClick={closeMain}
                                className="px-3 py-1.5 rounded-xl bg-app-input hover:bg-app-surface border border-app-border text-[9px] font-black uppercase tracking-widest text-app-text"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-5 space-y-5">
                        {draft && (
                            <div className="rounded-2xl border border-app-border bg-app-card p-4 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                    {draft.mode === 'create' ? 'Crear restaurante' : 'Editar restaurante'}
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelCls}>fidelio_id</label>
                                        <input className={inputCls} value={fidelioId} onChange={(e) => setFidelioId(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>nombre</label>
                                        <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>codigo_negocio</label>
                                        <input className={inputCls} value={codigoNegocio} onChange={(e) => setCodigoNegocio(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>codigo_comunicacion</label>
                                        <input
                                            className={inputCls}
                                            value={codigoComunicacion}
                                            onChange={(e) => setCodigoComunicacion(e.target.value)}
                                        />
                                    </div>
                                    <div className="md:col-span-2 flex items-center gap-2">
                                        <input
                                            id="rest-is-active"
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={(e) => setIsActive(e.target.checked)}
                                            className="rounded border-app-border"
                                        />
                                        <label htmlFor="rest-is-active" className="text-xs text-app-text cursor-pointer">
                                            Activo
                                        </label>
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setDraft(null)}
                                        className="px-4 py-2 rounded-xl bg-app-input border border-app-border text-[10px] font-black uppercase tracking-widest text-app-text"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void saveDraft()}
                                        disabled={mut.createRestaurant.isPending || mut.updateRestaurant.isPending}
                                        className="px-4 py-2 rounded-xl bg-app-delivery text-white text-[10px] font-black uppercase tracking-widest hover:bg-app-delivery-strong disabled:opacity-50"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        )}

                        {listQ.isLoading ? (
                            <p className="text-sm text-app-muted">Cargando…</p>
                        ) : listQ.isError ? (
                            <p className="text-sm text-app-danger">Error al cargar restaurantes.</p>
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-app-border">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-app-input text-app-table-head uppercase tracking-wider">
                                        <tr>
                                            <th className="p-3 font-black">Nombre</th>
                                            <th className="p-3 font-black">fidelio_id</th>
                                            <th className="p-3 font-black">Códigos</th>
                                            <th className="p-3 font-black">Activo</th>
                                            <th className="p-3 font-black">Correos</th>
                                            <th className="p-3 font-black text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(listQ.data ?? []).map((r) => (
                                            <tr key={r.id} className="border-t border-app-border hover:bg-app-input/40">
                                                <td className="p-3 text-app-text font-medium">{r.nombre}</td>
                                                <td className="p-3 font-mono text-app-muted">{r.fidelio_id}</td>
                                                <td className="p-3 font-mono text-app-muted">
                                                    {r.codigo_negocio ?? '—'} /{' '}
                                                    {r.codigo_comunicacion
                                                        ? r.codigo_comunicacion.length > 24
                                                            ? `${r.codigo_comunicacion.slice(0, 24)}…`
                                                            : r.codigo_comunicacion
                                                        : '—'}
                                                </td>
                                                <td className="p-3">{r.is_active ? 'Sí' : 'No'}</td>
                                                <td className="p-3 font-mono text-app-muted">{r.notification_emails?.length ?? 0}</td>
                                                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEmailTarget(r)}
                                                        className="px-2 py-1 rounded-lg bg-app-input border border-app-border text-[9px] font-black uppercase"
                                                    >
                                                        Correos
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDraft({ mode: 'edit', row: r })}
                                                        disabled={!!draft}
                                                        className="px-2 py-1 rounded-lg bg-app-delivery-muted-bg text-app-delivery border border-app-delivery-muted text-[9px] font-black uppercase disabled:opacity-40"
                                                    >
                                                        Editar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {(listQ.data ?? []).length === 0 && (
                                    <p className="p-6 text-sm text-app-muted text-center">Sin restaurantes.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {emailRestaurant && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
                    onClick={() => setEmailTarget(null)}
                    role="presentation"
                >
                    <div
                        className="bg-app-panel border border-app-border rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rest-emails-title"
                    >
                        <div className="p-5 border-b border-app-border flex justify-between items-start gap-2">
                            <div>
                                <h3 id="rest-emails-title" className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                    Correos notificación
                                </h3>
                                <p className="text-sm font-bold text-app-text mt-1">{emailRestaurant.nombre}</p>
                                <p className="text-[10px] font-mono text-app-muted">{emailRestaurant.fidelio_id}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEmailTarget(null)}
                                className="shrink-0 px-3 py-1.5 rounded-xl bg-app-input border border-app-border text-[9px] font-black uppercase"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            <div className="flex gap-2">
                                <input
                                    className={`${inputCls} flex-1`}
                                    placeholder="correo@ejemplo.com"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && void addEmail()}
                                />
                                <button
                                    type="button"
                                    onClick={() => void addEmail()}
                                    disabled={mut.addNotificationEmail.isPending}
                                    className="px-4 py-2 rounded-xl bg-app-delivery text-white text-[10px] font-black uppercase shrink-0 hover:bg-app-delivery-strong disabled:opacity-50"
                                >
                                    Añadir
                                </button>
                            </div>
                            <ul className="space-y-2">
                                {(emailRestaurant.notification_emails ?? []).length === 0 ? (
                                    <li className="text-sm text-app-muted">Sin correos aún.</li>
                                ) : (
                                    (emailRestaurant.notification_emails ?? []).map((row) => (
                                        <li
                                            key={row.id}
                                            className="flex items-center justify-between gap-2 rounded-xl bg-app-input border border-app-border px-3 py-2"
                                        >
                                            <span className="font-mono text-xs text-app-text break-all">{row.email}</span>
                                            <button
                                                type="button"
                                                onClick={() => void removeEmail(row.id)}
                                                disabled={mut.deleteNotificationEmail.isPending}
                                                className="text-app-danger text-[9px] font-black uppercase shrink-0"
                                            >
                                                Quitar
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DeliveryRestaurantsModal;
