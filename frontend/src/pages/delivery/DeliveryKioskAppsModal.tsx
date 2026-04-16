import React from 'react';
import { useAdminKioskConfig, useAdminKioskConfigPatch } from '@/hooks/useDelivery';
import { DELIVERY_PERMISSIONS } from '@/constants/delivery';

export interface DeliveryKioskAppsModalProps {
    open: boolean;
    onClose: () => void;
    canUpdateKioskSettings: boolean;
    toast: (opts: { icon: 'success' | 'error' | 'warning' | 'info'; title: string; text?: string }) => void | Promise<void>;
}

const DeliveryKioskAppsModal: React.FC<DeliveryKioskAppsModalProps> = ({
    open,
    onClose,
    canUpdateKioskSettings,
    toast,
}) => {
    const kioskConfig = useAdminKioskConfig(open);
    const kioskPatch = useAdminKioskConfigPatch();

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="bg-app-panel border border-app-border rounded-3xl p-6 w-full max-w-md shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="kiosk-apps-modal-title"
            >
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 id="kiosk-apps-modal-title" className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                            Configuración de apps (Permisos)
                        </h2>
                        {/* <p className="text-sm text-app-text mt-1 font-semibold">Permisos a apps</p> */}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-app-input hover:bg-app-surface border border-app-border text-[10px] font-black uppercase tracking-widest text-app-text"
                    >
                        Cerrar
                    </button>
                </div>

                {kioskConfig.isLoading ? (
                    <p className="text-sm text-app-muted">Cargando configuración…</p>
                ) : kioskConfig.isError ? (
                    <p className="text-sm text-red-400">No se pudo cargar la configuración del kiosk.</p>
                ) : (
                    <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">APP Kiosk</p>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                className="rounded border-app-border"
                                checked={!!kioskConfig.data?.enable_driver_dni_lookup}
                                disabled={!canUpdateKioskSettings || kioskPatch.isPending}
                                onChange={(e) => {
                                    if (!canUpdateKioskSettings) return;
                                    kioskPatch.mutate(
                                        { enable_driver_dni_lookup: e.target.checked },
                                        {
                                            onSuccess: () => void toast({ icon: 'success', title: 'Configuración actualizada' }),
                                            onError: () => void toast({ icon: 'error', title: 'No se pudo guardar' }),
                                        }
                                    );
                                }}
                            />
                            <span className="text-sm text-app-text">
                                Consulta RENIEC / DNI en kiosk
                                {!canUpdateKioskSettings ? (
                                    <span className="text-app-muted text-xs ml-2">(solo lectura)</span>
                                ) : null}
                            </span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                className="rounded border-app-border"
                                checked={!!kioskConfig.data?.enable_driver_photo_capture}
                                disabled={!canUpdateKioskSettings || kioskPatch.isPending}
                                onChange={(e) => {
                                    if (!canUpdateKioskSettings) return;
                                    kioskPatch.mutate(
                                        { enable_driver_photo_capture: e.target.checked },
                                        {
                                            onSuccess: () => void toast({ icon: 'success', title: 'Configuración actualizada' }),
                                            onError: () => void toast({ icon: 'error', title: 'No se pudo guardar' }),
                                        }
                                    );
                                }}
                            />
                            <span className="text-sm text-app-text">
                                Captura de foto del conductor
                                {!canUpdateKioskSettings ? (
                                    <span className="text-app-muted text-xs ml-2">(solo lectura)</span>
                                ) : null}
                            </span>
                        </label>
                        <p className="text-[10px] font-black uppercase tracking-widest text-app-muted pt-2">App Runner</p>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                className="rounded border-app-border"
                                checked={!!kioskConfig.data?.enable_runner_simulate_order_ready}
                                disabled={!canUpdateKioskSettings || kioskPatch.isPending}
                                onChange={(e) => {
                                    if (!canUpdateKioskSettings) return;
                                    kioskPatch.mutate(
                                        { enable_runner_simulate_order_ready: e.target.checked },
                                        {
                                            onSuccess: () => void toast({ icon: 'success', title: 'Configuración actualizada' }),
                                            onError: () => void toast({ icon: 'error', title: 'No se pudo guardar' }),
                                        }
                                    );
                                }}
                            />
                            <span className="text-sm text-app-text">
                                Simular pedido listo en Runner
                                {/* (
                                <code className="text-xs">{DELIVERY_PERMISSIONS.SIMULATE_ORDER_READY}</code> siempre;{' '}
                                <code className="text-xs">{DELIVERY_PERMISSIONS.OPERATE}</code> solo si esta opción está
                                activa
                                ) */}
                                {!canUpdateKioskSettings ? (
                                    <span className="text-app-muted text-xs ml-2">(solo lectura)</span>
                                ) : null}
                            </span>
                        </label>
                        {/* <p className="text-[10px] text-app-muted pl-9 -mt-1">
                            Misma tabla de config que el kiosk. Si está activo, quien tenga{' '}
                            <code className="text-app-text">{DELIVERY_PERMISSIONS.OPERATE}</code> puede simular; quien tenga{' '}
                            <code className="text-app-text">{DELIVERY_PERMISSIONS.SIMULATE_ORDER_READY}</code> siempre puede,
                            aunque esto esté desactivado.
                        </p> */}
                        {!canUpdateKioskSettings ? (
                            <p className="text-[10px] text-app-muted pt-1">
                                Para editar se requiere el permiso{' '}
                                <code className="text-app-text">{DELIVERY_PERMISSIONS.SETTINGS_UPDATE}</code>
                            </p>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeliveryKioskAppsModal;
