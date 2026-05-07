import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Webhook, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { sisaAxiosDetail, sisaSwalError, sisaSwalInfo, sisaSwalSuccess } from '@/pages/sisa_reservas/sisaReservasSwal';
import {
    dispararSisaNotificacionesWebhook,
    getSisaNotificacionesConfig,
    patchSisaNotificacionesConfig,
    SISA_LIST_STALE_MS,
} from '@/services/sisaReservasService';

export type SisaNotificacionesModalProps = {
    open: boolean;
    onClose: () => void;
    token: string;
    canManage: boolean;
};

const SisaNotificacionesModal: React.FC<SisaNotificacionesModalProps> = ({ open, onClose, token, canManage }) => {
    const qc = useQueryClient();
    const { data: cfg, isLoading } = useQuery({
        queryKey: ['sisa-notificaciones-config', token],
        queryFn: () => getSisaNotificacionesConfig(token),
        enabled: open && !!token,
        staleTime: SISA_LIST_STALE_MS,
    });

    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [intervalMin, setIntervalMin] = useState(15);
    const [anticipationMin, setAnticipationMin] = useState(120);
    const [includeConfirmados, setIncludeConfirmados] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [webhookSecret, setWebhookSecret] = useState('');
    const [secretTouched, setSecretTouched] = useState(false);

    useEffect(() => {
        if (!cfg) return;
        setScheduleEnabled(cfg.schedule_enabled);
        setIntervalMin(cfg.schedule_interval_minutes);
        setAnticipationMin(cfg.anticipation_minutes);
        setIncludeConfirmados(cfg.include_confirmados);
        setWebhookUrl(cfg.n8n_webhook_url ?? '');
        setWebhookSecret('');
        setSecretTouched(false);
    }, [cfg, open]);

    const saveMut = useMutation({
        mutationFn: () =>
            patchSisaNotificacionesConfig(token, {
                schedule_enabled: scheduleEnabled,
                schedule_interval_minutes: intervalMin,
                anticipation_minutes: anticipationMin,
                include_confirmados: includeConfirmados,
                n8n_webhook_url: webhookUrl.trim() || null,
                ...(secretTouched ? { n8n_webhook_secret: webhookSecret.trim() || null } : {}),
            }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['sisa-notificaciones-config'] });
            sisaSwalSuccess('Guardado', 'La configuración de notificaciones se actualizó correctamente.');
        },
        onError: (e: unknown) => sisaSwalError(sisaAxiosDetail(e)),
    });

    const disparoMut = useMutation({
        mutationFn: () => dispararSisaNotificacionesWebhook(token),
        onSuccess: (r) => {
            if (r.ok && r.enviado) {
                sisaSwalSuccess(
                    'Disparo enviado',
                    r.items === 1 ? 'Se envió 1 reserva al webhook.' : `Se enviaron ${r.items} reservas al webhook.`
                );
                return;
            }
            if (r.razon === 'sin_reservas_en_ventana' || r.razon === 'sin_reservas_proximas') {
                sisaSwalInfo('Sin reservas', 'No hay reservas próximas que cumplan los criterios para notificar.');
                return;
            }
            if (!r.ok) {
                sisaSwalError(r.error || 'No se pudo disparar el webhook.');
                return;
            }
            sisaSwalInfo('Listo', r.error || 'Operación completada.');
        },
        onError: (e: unknown) => sisaSwalError(sisaAxiosDetail(e)),
    });

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 w-full max-w-lg rounded-2xl border border-app-border bg-app-modal-solid p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between mb-4 gap-2">
                    <h2 className="text-sm font-black uppercase tracking-tight text-[var(--app-sisa-reservas-accent)] flex items-center gap-2">
                        <Webhook size={18} aria-hidden />
                        Notificaciones · reservas próximas
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={20} />
                    </button>
                </div>

                <p className="text-[10px] text-app-muted leading-relaxed mb-4">
                    {/* Envío por <strong className="text-app-text">POST</strong> a n8n con reservas{' '} */}
                    Envío de notificaciones de reservas{' '}
                    <strong className="text-app-text">pendientes</strong> 
                    {includeConfirmados ? ' y confirmadas' : ''} cuya hora cae dentro de la ventana: desde{' '}
                    <strong className="text-app-text">X minutos antes</strong> de la reserva hasta el inicio de la misma. Útil para
                    correos automáticos. Una vez enviada una reserva en esa ventana, no se repite hasta que cambie fecha u hora.
                </p>

                {isLoading ? (
                    <p className="text-xs text-app-muted py-8">Cargando configuración…</p>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-app-muted block">URL webhook n8n (POST)</label>
                            <input
                                type="url"
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://…/webhook/…"
                                disabled={!canManage}
                                className="w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-[11px] text-app-text disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-app-muted block">Secreto (opcional, Bearer)</label>
                            <input
                                type="password"
                                value={webhookSecret}
                                onChange={(e) => {
                                    setWebhookSecret(e.target.value);
                                    setSecretTouched(true);
                                }}
                                placeholder={
                                    cfg?.n8n_webhook_secret_configured
                                        ? 'Vacío = no cambiar; borrar y guardar = quitar'
                                        : 'Bearer para n8n'
                                }
                                disabled={!canManage}
                                autoComplete="new-password"
                                className="w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-[11px] text-app-text disabled:opacity-50"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-black uppercase text-app-muted block mb-1">
                                    Intervalo (min)
                                </label>
                                <input
                                    type="number"
                                    min={5}
                                    max={1440}
                                    value={intervalMin}
                                    onChange={(e) => setIntervalMin(Math.max(5, Math.min(1440, Number(e.target.value) || 15)))}
                                    disabled={!canManage}
                                    className="w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm disabled:opacity-50"
                                />
                                <p className="text-[9px] text-app-muted mt-1">Revisión automática</p>
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase text-app-muted block mb-1">
                                    Anticipación (min)
                                </label>
                                <input
                                    type="number"
                                    min={5}
                                    max={10080}
                                    value={anticipationMin}
                                    onChange={(e) =>
                                        setAnticipationMin(Math.max(5, Math.min(10080, Number(e.target.value) || 120)))
                                    }
                                    disabled={!canManage}
                                    className="w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm disabled:opacity-50"
                                />
                                <p className="text-[9px] text-app-muted mt-1">Avisar desde T − X</p>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-[10px] text-app-text cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeConfirmados}
                                onChange={(e) => setIncludeConfirmados(e.target.checked)}
                                disabled={!canManage}
                                className="accent-[var(--app-sisa-reservas-accent-strong)]"
                            />
                            Incluir reservas confirmadas además de pendientes
                        </label>

                        <label className="flex items-center gap-2 text-[10px] text-app-text cursor-pointer">
                            <input
                                type="checkbox"
                                checked={scheduleEnabled}
                                onChange={(e) => setScheduleEnabled(e.target.checked)}
                                disabled={!canManage}
                                className="accent-[var(--app-sisa-reservas-accent-strong)]"
                            />
                            Activar envío programado (intervalo)
                        </label>

                        {canManage && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                <button
                                    type="button"
                                    disabled={saveMut.isPending}
                                    onClick={() => saveMut.mutate()}
                                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-app-border bg-app-input hover:bg-app-card-hover disabled:opacity-50"
                                >
                                    {saveMut.isPending ? 'Guardando…' : 'Guardar configuración'}
                                </button>
                            </div>
                        )}

                        {saveMut.isError && (
                            <p className="text-xs text-app-danger">No se pudo guardar. Revise permisos de gestión.</p>
                        )}

                        {canManage && (
                            <div className="pt-3 border-t border-app-border space-y-2">
                                <button
                                    type="button"
                                    disabled={disparoMut.isPending || !webhookUrl.trim()}
                                    onClick={() => disparoMut.mutate()}
                                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white disabled:opacity-40"
                                    style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                                >
                                    {disparoMut.isPending ? 'Enviando…' : 'Enviar ahora (ventana actual)'}
                                </button>
                                {/* <p className="text-[10px] text-app-muted leading-snug">
                                    El envío automático no repite la misma reserva mientras siga marcada como enviada. Este botón manual puede
                                    volver a incluir reservas que ya se enviaron si aún están dentro de la ventana (misma anticipación / hora).
                                </p> */}
                                {disparoMut.data && (
                                    <p className="text-[10px] text-app-muted font-mono">
                                        {disparoMut.data.enviado
                                            ? `Enviado: ${disparoMut.data.items} reserva(s).`
                                            : disparoMut.data.razon === 'sin_reservas_en_ventana'
                                              ? 'Sin reservas en la ventana (anticipación / hora).'
                                              : `Sin envío: ${disparoMut.data.razon ?? disparoMut.data.error ?? '—'}`}
                                    </p>
                                )}
                                {disparoMut.isError && (
                                    <p className="text-xs text-app-danger">Error al disparar el webhook.</p>
                                )}
                            </div>
                        )}

                        {!canManage && (
                            <p className="text-[10px] text-app-warning">Solo usuarios con gestión pueden editar o disparar.</p>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default SisaNotificacionesModal;
