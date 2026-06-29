import React, { useEffect, useMemo, useState } from 'react';
import AppSelect from '@/components/ui/AppSelect';
import { ORDER_STATUS, orderStatusBadgeClass } from '@/constants/delivery';
import { useControlAudit, useControlSnapshot } from '@/hooks/useDelivery';
import { isControlDemoDefaultEnabled, isControlDemoUiVisible } from '@/pages/delivery/mockControlSnapshot';
import {
    alertFriendlyMessage,
    AUDIT_ACTION_LABEL,
    AUDIT_SOURCE_LABEL,
    driverStatusLabel,
    formatElapsedMinutes,
    orderStatusLabel,
} from '@/pages/delivery/controlCenterLabels';
import type { AdminCancelIn, ControlAlert, DriverArrival, Order } from '@/services/deliveryService';
import { deliveryService } from '@/services/deliveryService';
import { formatRegistrationDateTime } from '@/utils/formatDateTime';

/** Recalcula cada 30 s para que el tiempo en estado se actualice en pantalla (complementa WS/polling). */
const LIVE_CLOCK_MS = 30_000;

const orderCellLayoutClass = 'flex items-start gap-2 min-w-[160px]';

function OrderColumnHeader() {
    return (
        <div className={orderCellLayoutClass}>
            <span className="w-2 shrink-0" aria-hidden />
            <span>Pedido</span>
        </div>
    );
}

function OrderAlertDot({ alerts }: { alerts: ControlAlert[] }) {
    return (
        <span
            className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${alerts.length > 0 ? 'bg-app-warning' : 'invisible'}`}
            title={alerts[0] ? alertFriendlyMessage(alerts[0]) : undefined}
            aria-hidden={alerts.length === 0}
        />
    );
}

function minutesSince(iso: string | null | undefined, nowMs: number): number | null {
    if (!iso) return null;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return null;
    return Math.max(0, Math.floor((nowMs - ts) / 60000));
}

function stateAgeMinutes(o: Order, nowMs: number): number | null {
    return minutesSince(o.estado_changed_at ?? o.updated_at ?? o.created_at, nowMs);
}

function ageBadgeClass(mins: number | null): string {
    if (mins == null) return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    if (mins < 10) return 'bg-app-success-muted text-app-success border-app-accent-muted';
    if (mins < 20) return 'bg-app-warning-muted text-app-warning border-app-warning/30';
    return 'bg-app-danger-muted text-app-danger border-app-danger/30';
}

function runnerLabel(o: Order): string {
    if (o.locked_by_runner_username?.trim()) return o.locked_by_runner_username.trim();
    if (o.locked_by_runner_id != null) return `Repartidor #${o.locked_by_runner_id}`;
    return 'Sin asignar';
}

function driverSummary(o: Order): string {
    const d = o.matched_driver_arrival;
    if (!d) return 'Sin conductor';
    const parts = [d.placa?.trim(), d.alias_conductor?.trim(), d.codigo_ingresado?.trim()].filter(Boolean);
    return parts.length ? parts.join(' · ') : `Conductor #${d.id}`;
}

export type DeliveryControlCenterProps = {
    refetchIntervalMs: number | false;
    canControlActions: boolean;
    authToken: string | null;
    admin: {
        markDevolucion: {
            mutate: (id: number, opts?: { onSuccess?: () => void; onError?: () => void }) => void;
            isPending: boolean;
        };
        forceEntregado: {
            mutate: (
                args: { orderId: number; payload: { reason: string; note?: string } },
                opts?: { onSuccess?: () => void; onError?: () => void }
            ) => void;
            isPending: boolean;
        };
        cancel: {
            mutate: (
                args: { orderId: number; payload: AdminCancelIn },
                opts?: { onSuccess?: () => void; onError?: () => void }
            ) => void;
            isPending: boolean;
        };
        unlock: {
            mutate: (
                args: { orderId: number; payload: { note?: string } },
                opts?: { onSuccess?: () => void; onError?: () => void }
            ) => void;
            isPending: boolean;
        };
    };
    manualMatch: {
        mutate: (
            args: { orderId: number; driverArrivalId: number },
            opts?: { onSuccess?: () => void; onError?: () => void }
        ) => void;
        isPending: boolean;
    };
    confirm: (opts: { title: string; text: string; confirmText: string; confirmColor?: string }) => Promise<boolean>;
    promptText: (opts: { title: string; label: string; placeholder?: string; required?: boolean }) => Promise<string | null>;
    toast: (opts: { icon: 'success' | 'error' | 'warning' | 'info'; title: string; text?: string }) => Promise<void>;
};

const DeliveryControlCenter: React.FC<DeliveryControlCenterProps> = ({
    refetchIntervalMs,
    canControlActions,
    authToken,
    admin,
    manualMatch,
    confirm,
    promptText,
    toast,
}) => {
    const [useDemo, setUseDemo] = useState(isControlDemoDefaultEnabled());
    const demoUiVisible = isControlDemoUiVisible();
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [alertsModalOpen, setAlertsModalOpen] = useState(false);
    const [photoViewer, setPhotoViewer] = useState<{ title: string; objectUrl: string } | null>(null);
    const [photoLoading, setPhotoLoading] = useState(false);
    const snapshot = useControlSnapshot(true, refetchIntervalMs, useDemo);
    const audit = useControlAudit(true, refetchIntervalMs, useDemo);
    const [platform, setPlatform] = useState('ALL');
    const [restaurant, setRestaurant] = useState('');
    const [alertsOnly, setAlertsOnly] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [matchDriverId, setMatchDriverId] = useState<number | null>(null);

    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), LIVE_CLOCK_MS);
        return () => window.clearInterval(id);
    }, []);

    const closePhotoViewer = () => {
        setPhotoViewer((prev) => {
            if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
            return null;
        });
    };

    const openPhotoViewer = async (arrivalId: number, title: string) => {
        if (!authToken) {
            void toast({ icon: 'warning', title: 'Sesión requerida' });
            return;
        }
        closePhotoViewer();
        setPhotoLoading(true);
        try {
            const objectUrl = await deliveryService.adminGetDriverArrivalPhotoObjectUrl(authToken, arrivalId);
            setPhotoViewer({ title, objectUrl });
        } catch {
            void toast({ icon: 'error', title: 'No se pudo cargar la foto' });
        } finally {
            setPhotoLoading(false);
        }
    };

    const data = snapshot.data;
    const orders = data?.orders ?? [];
    const drivers = data?.drivers ?? [];
    const alerts = data?.alerts ?? [];
    const counts = data?.counts;

    const alertsByOrderId = useMemo(() => {
        const map = new Map<number, ControlAlert[]>();
        for (const a of alerts) {
            if (a.order_id == null) continue;
            const list = map.get(a.order_id) ?? [];
            list.push(a);
            map.set(a.order_id, list);
        }
        return map;
    }, [alerts]);

    const platformOptions = useMemo(() => {
        const set = new Set<string>();
        for (const o of orders) if (o.plataforma) set.add(o.plataforma);
        for (const d of drivers) if (d.plataforma) set.add(d.plataforma);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [orders, drivers]);

    const filteredOrders = useMemo(() => {
        const rest = restaurant.trim().toLowerCase();
        return orders.filter((o) => {
            if (platform !== 'ALL' && o.plataforma !== platform) return false;
            if (rest && !(o.restaurant_nombre ?? '').toLowerCase().includes(rest)) return false;
            if (alertsOnly && !alertsByOrderId.has(o.id)) return false;
            return true;
        });
    }, [orders, platform, restaurant, alertsOnly, alertsByOrderId]);

    const selected = filteredOrders.find((o) => o.id === selectedId) ?? orders.find((o) => o.id === selectedId) ?? null;

    const matchCandidates = useMemo(
        () => drivers.filter((d) => d.estado === 'ESPERANDO' || d.estado === 'EN_MATCH'),
        [drivers]
    );

    return (
        <>
            <div className="bg-app-card border border-app-border rounded-3xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Centro de control</h2>
                        <p className="text-[10px] text-app-muted mt-0.5">
                            Jornada {data?.operational_day ?? '—'}
                            {data?.generated_at ? ` · Última carga ${formatRegistrationDateTime(data.generated_at)}` : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        {demoUiVisible && (
                            <label className="flex gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useDemo}
                                    onChange={(e) => setUseDemo(e.target.checked)}
                                    className="rounded border-app-border"
                                />
                                <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Datos de prueba</span>
                            </label>
                        )}
                        {!canControlActions && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-app-warning px-2 py-1 rounded-lg border border-app-warning/40">
                                Solo consulta
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setAlertsModalOpen(true)}
                            disabled={alerts.length === 0}
                            className="px-3 py-1.5 rounded-xl bg-app-input hover:bg-app-surface border border-app-border text-[10px] font-black uppercase tracking-widest text-app-text disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        >
                            Ver avisos{alerts.length > 0 ? ` (${alerts.length})` : ''}
                        </button>
                        <button
                            type="button"
                            onClick={() => snapshot.refetch()}
                            disabled={snapshot.isFetching}
                            className="px-3 py-1.5 rounded-xl bg-app-input hover:bg-app-surface border border-app-border text-[10px] font-black uppercase tracking-widest text-app-text disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        >
                            {snapshot.isFetching ? 'Actualizando…' : 'Actualizar ahora'}
                        </button>
                    </div>
                </div>

                {demoUiVisible && useDemo && (
                    <div className="p-3 rounded-xl border border-app-accent-muted bg-app-accent-muted-bg text-sm text-app-accent">
                        Estás viendo datos de ejemplo. Desactiva &quot;Datos de prueba&quot; para la operación real del día.
                    </div>
                )}

                {snapshot.isError && !useDemo && (
                    <div className="p-3 rounded-xl bg-app-danger-muted border border-app-danger/30 text-app-danger text-sm">
                        No se pudo cargar la información del centro de control.
                    </div>
                )}

                {counts && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {[
                            { label: 'Pedidos en curso', value: counts.orders_active },
                            { label: 'Con repartidor', value: counts.orders_with_runner },
                            { label: 'Con conductor', value: counts.orders_matched },
                            { label: 'Requieren atención', value: counts.orders_with_alerts, highlight: counts.orders_with_alerts > 0 },
                            { label: 'Conductores en espera', value: counts.drivers_esperando },
                            { label: 'Conductores vinculados', value: counts.drivers_en_match },
                            { label: 'Avisos activos', value: counts.alerts_total, highlight: counts.alerts_total > 0 },
                        ].map((c) => (
                            <div
                                key={c.label}
                                className={`p-3 rounded-2xl border ${c.highlight ? 'border-app-warning bg-app-warning-muted' : 'border-app-border bg-app-input/40'}`}
                            >
                                <p className="text-[9px] font-black uppercase tracking-widest text-app-muted leading-tight">{c.label}</p>
                                <p className="text-xl font-black text-app-text">{c.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-wrap gap-3 items-end">
                    <div className="min-w-[140px]">
                        <label className="block text-[9px] font-black uppercase tracking-widest text-app-muted mb-1">App de delivery</label>
                        <AppSelect
                            value={{ value: platform, label: platform === 'ALL' ? 'Todas' : platform }}
                            onChange={(opt) => setPlatform(opt?.value ?? 'ALL')}
                            options={[{ value: 'ALL', label: 'Todas' }, ...platformOptions.map((p) => ({ value: p, label: p }))]}
                        />
                    </div>
                    <div className="min-w-[180px]">
                        <label className="block text-[9px] font-black uppercase tracking-widest text-app-muted mb-1">Local / restaurante</label>
                        <input
                            type="text"
                            value={restaurant}
                            onChange={(e) => setRestaurant(e.target.value)}
                            placeholder="Buscar local…"
                            className="w-full px-3 py-2 rounded-xl bg-app-input border border-app-border text-sm text-app-text"
                        />
                    </div>
                    <label className="flex items-center gap-2 pb-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={alertsOnly}
                            onChange={(e) => setAlertsOnly(e.target.checked)}
                            className="rounded border-app-border"
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Solo con avisos</span>
                    </label>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="xl:col-span-2 overflow-x-auto rounded-2xl border border-app-border">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-app-border bg-app-input/40 text-[9px] font-black uppercase tracking-widest text-app-table-head">
                                    <th className="p-3 align-top">
                                        <OrderColumnHeader />
                                    </th>
                                    <th className="p-3">Estado</th>
                                    <th className="p-3">Repartidor</th>
                                    <th className="p-3">Conductor</th>
                                    <th className="p-3">Tiempo en estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredOrders.map((o) => {
                                    const mins = stateAgeMinutes(o, nowMs);
                                    const orderAlerts = alertsByOrderId.get(o.id) ?? [];
                                    const isSelected = selectedId === o.id;
                                    const driver = o.matched_driver_arrival;
                                    return (
                                        <tr
                                            key={o.id}
                                            onClick={() => setSelectedId(o.id)}
                                            className={`border-b border-app-border/80 cursor-pointer hover:bg-app-input/20 ${isSelected ? 'bg-app-delivery-muted-bg' : ''}`}
                                        >
                                            <td className="p-3 align-top">
                                                <div className={orderCellLayoutClass}>
                                                    <OrderAlertDot alerts={orderAlerts} />
                                                    <div className="min-w-0">
                                                        <p className="font-black text-app-text leading-tight">{o.codigo_pedido}</p>
                                                        <p className="text-[10px] text-app-muted truncate">
                                                            {o.restaurant_nombre ?? '—'} · {o.plataforma}
                                                        </p>
                                                        <p className="text-[10px] text-app-muted mt-0.5 whitespace-nowrap">
                                                            {formatRegistrationDateTime(o.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <span className={orderStatusBadgeClass(o.estado)}>{orderStatusLabel(o.estado)}</span>
                                            </td>
                                            <td className="p-3 text-xs text-app-text">{runnerLabel(o)}</td>
                                            <td className="p-3 align-top text-xs">
                                                <p className="text-app-text">{driverSummary(o)}</p>
                                                {driver?.created_at ? (
                                                    <p className="text-[10px] text-app-muted mt-0.5 whitespace-nowrap">
                                                        {formatRegistrationDateTime(driver.created_at)}
                                                    </p>
                                                ) : null}
                                                {driver?.foto_path?.trim() ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void openPhotoViewer(driver.id, o.codigo_pedido);
                                                        }}
                                                        className="text-[10px] font-black uppercase tracking-widest text-app-delivery hover:underline mt-1 cursor-pointer"
                                                    >
                                                        Ver foto
                                                    </button>
                                                ) : null}
                                            </td>
                                            <td className="p-3">
                                                <span className={`inline-block px-2 py-0.5 rounded-lg border text-[10px] font-black ${ageBadgeClass(mins)}`}>
                                                    {formatElapsedMinutes(mins)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredOrders.length === 0 && !snapshot.isLoading && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-app-muted text-sm">
                                            No hay pedidos activos con los filtros seleccionados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="rounded-2xl border border-app-border bg-app-input/40 p-4 space-y-4 min-h-[320px]">
                        {!selected ? (
                            <p className="text-sm text-app-muted">Selecciona un pedido para ver el detalle y las acciones disponibles.</p>
                        ) : (
                            <>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-app-muted">Código {selected.codigo_pedido}</p>
                                    <p className="text-2xl font-black text-app-text">{selected.codigo_pedido}</p>
                                    <p className="text-sm text-app-muted">{selected.restaurant_nombre} · {selected.plataforma}</p>
                                    <p className="text-[10px] text-app-muted mt-1">
                                        Registro pedido: {formatRegistrationDateTime(selected.created_at)}
                                    </p>
                                    <span className={`inline-block mt-2 ${orderStatusBadgeClass(selected.estado)}`}>
                                        {orderStatusLabel(selected.estado)}
                                    </span>
                                    <p className="text-[10px] text-app-muted mt-2">
                                        Tiempo en este estado: {formatElapsedMinutes(stateAgeMinutes(selected, nowMs))}
                                    </p>
                                </div>

                                <div className="space-y-2 text-xs">
                                    <p>
                                        <span className="text-app-muted font-bold">Repartidor:</span> {runnerLabel(selected)}
                                    </p>
                                    <p>
                                        <span className="text-app-muted font-bold">Conductor:</span> {driverSummary(selected)}
                                    </p>
                                    {selected.matched_driver_arrival?.created_at ? (
                                        <p className="text-app-muted">
                                            Registro conductor: {formatRegistrationDateTime(selected.matched_driver_arrival.created_at)}
                                        </p>
                                    ) : null}
                                    {(alertsByOrderId.get(selected.id) ?? []).map((a) => (
                                        <p key={`${a.type}-${a.minutes}`} className={a.severity === 'critical' ? 'text-app-danger' : 'text-app-warning'}>
                                            ⚠ {alertFriendlyMessage(a)}
                                        </p>
                                    ))}
                                </div>

                                {selected.matched_driver_arrival && (
                                    <DriverDetailBlock
                                        driver={selected.matched_driver_arrival}
                                        orderCode={selected.codigo_pedido}
                                        onViewPhoto={
                                            selected.matched_driver_arrival.foto_path?.trim()
                                                ? () => void openPhotoViewer(selected.matched_driver_arrival!.id, selected.codigo_pedido)
                                                : undefined
                                        }
                                    />
                                )}

                                <div className="flex flex-wrap gap-2 pt-2 border-t border-app-border">
                                    {!canControlActions && (
                                        <p className="text-[10px] text-app-muted w-full">
                                            Las acciones de supervisión requieren el permiso de acciones del centro de control.
                                        </p>
                                    )}
                                    {canControlActions && selected.locked_by_runner_id != null && (
                                        <button
                                            type="button"
                                            disabled={admin.unlock.isPending}
                                            onClick={async () => {
                                                const note = await promptText({
                                                    title: 'Liberar pedido',
                                                    label: 'Motivo o nota (opcional)',
                                                });
                                                if (note === null) return;
                                                admin.unlock.mutate(
                                                    { orderId: selected.id, payload: { note: note || undefined } },
                                                    {
                                                        onSuccess: () => void toast({ icon: 'success', title: 'Pedido liberado' }),
                                                        onError: () => void toast({ icon: 'error', title: 'No se pudo liberar' }),
                                                    }
                                                );
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-app-input border border-app-border text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Liberar repartidor
                                        </button>
                                    )}

                                    {canControlActions && !selected.matched_driver_arrival_id && matchCandidates.length > 0 && (
                                        <div className="w-full space-y-2">
                                            <AppSelect
                                                value={
                                                    matchDriverId != null
                                                        ? {
                                                            value: matchDriverId,
                                                            label: `#${matchDriverId} ${matchCandidates.find((d) => d.id === matchDriverId)?.codigo_ingresado ?? ''}`,
                                                        }
                                                        : null
                                                }
                                                onChange={(opt) => setMatchDriverId(opt?.value ?? null)}
                                                options={matchCandidates.map((d) => ({
                                                    value: d.id,
                                                    label: `${d.placa ?? d.codigo_ingresado} · ${d.plataforma}`,
                                                }))}
                                                placeholder="Elegir conductor…"
                                            />
                                            <button
                                                type="button"
                                                disabled={!matchDriverId || manualMatch.isPending}
                                                onClick={async () => {
                                                    if (!matchDriverId) return;
                                                    const ok = await confirm({
                                                        title: 'Vincular conductor',
                                                        text: `¿Vincular el pedido ${selected.codigo_pedido} con el conductor seleccionado?`,
                                                        confirmText: 'Vincular',
                                                    });
                                                    if (!ok) return;
                                                    manualMatch.mutate(
                                                        { orderId: selected.id, driverArrivalId: matchDriverId },
                                                        {
                                                            onSuccess: () => {
                                                                setMatchDriverId(null);
                                                                void toast({ icon: 'success', title: 'Conductor vinculado' });
                                                            },
                                                            onError: () => void toast({ icon: 'error', title: 'No se pudo vincular' }),
                                                        }
                                                    );
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-app-delivery text-white text-[9px] font-black uppercase tracking-widest disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                Vincular conductor
                                            </button>
                                        </div>
                                    )}

                                    {canControlActions &&
                                        selected.estado !== ORDER_STATUS.ENTREGADO &&
                                        selected.estado !== ORDER_STATUS.CANCELADO &&
                                        selected.estado !== ORDER_STATUS.DEVOLUCION && (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={admin.markDevolucion.isPending}
                                                    onClick={async () => {
                                                        const ok = await confirm({
                                                            title: 'Registrar devolución',
                                                            text: `¿Registrar devolución del pedido ${selected.codigo_pedido}?`,
                                                            confirmText: 'Confirmar',
                                                            confirmColor: 'var(--app-warning)',
                                                        });
                                                        if (!ok) return;
                                                        admin.markDevolucion.mutate(selected.id, {
                                                            onSuccess: () => void toast({ icon: 'success', title: 'Devolución registrada' }),
                                                            onError: () => void toast({ icon: 'error', title: 'No se pudo registrar' }),
                                                        });
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg border border-app-warning text-app-warning text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Registrar devolución
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={admin.forceEntregado.isPending}
                                                    onClick={async () => {
                                                        const reason = await promptText({
                                                            title: 'Marcar como entregado',
                                                            label: 'Motivo',
                                                            required: true,
                                                        });
                                                        if (!reason) return;
                                                        admin.forceEntregado.mutate(
                                                            { orderId: selected.id, payload: { reason } },
                                                            {
                                                                onSuccess: () => void toast({ icon: 'success', title: 'Pedido marcado entregado' }),
                                                                onError: () => void toast({ icon: 'error', title: 'No se pudo completar' }),
                                                            }
                                                        );
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg border border-app-success text-app-success text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Marcar entregado
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={admin.cancel.isPending}
                                                    onClick={async () => {
                                                        const reason = await promptText({
                                                            title: 'Cancelar pedido',
                                                            label: 'Motivo',
                                                            required: true,
                                                        });
                                                        if (!reason) return;
                                                        const ok = await confirm({
                                                            title: 'Cancelar pedido',
                                                            text: `¿Cancelar el pedido ${selected.codigo_pedido}?`,
                                                            confirmText: 'Sí, cancelar',
                                                            confirmColor: 'var(--app-danger)',
                                                        });
                                                        if (!ok) return;
                                                        admin.cancel.mutate(
                                                            { orderId: selected.id, payload: { reason } },
                                                            {
                                                                onSuccess: () => void toast({ icon: 'success', title: 'Pedido cancelado' }),
                                                                onError: () => void toast({ icon: 'error', title: 'No se pudo cancelar' }),
                                                            }
                                                        );
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg border border-app-danger text-app-danger text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Cancelar pedido
                                                </button>
                                            </>
                                        )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {drivers.length > 0 && (
                    <div className="rounded-2xl border border-app-border p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-app-muted mb-3">
                            Conductores activos ({drivers.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {drivers.slice(0, 12).map((d) => (
                                <div key={d.id} className="px-3 py-2 rounded-xl bg-app-input border border-app-border text-xs">
                                    <span className="font-black text-app-text">{d.placa ?? d.codigo_ingresado}</span>
                                    <span className="text-app-muted"> · {driverStatusLabel(d.estado)} · {d.plataforma}</span>
                                    <p className="text-[10px] text-app-muted mt-0.5">
                                        Registro: {formatRegistrationDateTime(d.created_at)}
                                    </p>
                                    {d.matched_order_id != null && (
                                        <span className="text-app-delivery text-[10px]">Vinculado al pedido #{d.matched_order_id}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(audit.data?.items.length ?? 0) > 0 && (
                    <div className="rounded-2xl border border-app-border p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-app-muted mb-3">
                            Acciones recientes{useDemo ? ' (ejemplo)' : ''}
                        </p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {audit.data?.items.map((row) => (
                                <div key={row.id} className="text-xs border-b border-app-border/50 pb-2">
                                    <span className="text-app-muted">{formatRegistrationDateTime(row.created_at)}</span>
                                    {' · '}
                                    <span className="font-black text-app-text">
                                        {AUDIT_ACTION_LABEL[row.action] ?? row.action}
                                    </span>
                                    {' · '}
                                    <span className="text-app-muted">
                                        {row.username ?? '—'} · {AUDIT_SOURCE_LABEL[row.source] ?? row.source}
                                    </span>
                                    {row.order_id != null && (
                                        <span className="text-app-delivery"> · pedido #{row.order_id}</span>
                                    )}
                                    {row.detail ? <p className="text-app-muted mt-0.5">{row.detail}</p> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {alertsModalOpen && (
                <div
                    className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4"
                    onClick={() => setAlertsModalOpen(false)}
                    role="presentation"
                >
                    <div
                        className="bg-app-panel border border-app-border rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Avisos activos"
                    >
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-app-border shrink-0">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                Avisos activos ({alerts.length})
                            </h3>
                            <button
                                type="button"
                                onClick={() => setAlertsModalOpen(false)}
                                className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-[9px] font-black uppercase tracking-widest text-app-text cursor-pointer"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="p-4 space-y-2 overflow-y-auto">
                            {alerts.length === 0 ? (
                                <p className="text-sm text-app-muted">No hay avisos activos.</p>
                            ) : (
                                alerts.map((a, i) => (
                                    <button
                                        key={`${a.type}-${a.order_id}-${i}`}
                                        type="button"
                                        onClick={() => {
                                            if (a.order_id != null) setSelectedId(a.order_id);
                                            setAlertsModalOpen(false);
                                        }}
                                        className="block w-full text-left p-3 rounded-xl border border-app-border hover:bg-app-input/40 cursor-pointer"
                                    >
                                        <span className={a.severity === 'critical' ? 'text-app-danger font-bold text-sm' : 'text-app-text text-sm'}>
                                            {alertFriendlyMessage(a)}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {(photoViewer || photoLoading) && (
                <div
                    className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4"
                    onClick={closePhotoViewer}
                    role="presentation"
                >
                    <div
                        className="bg-app-panel border border-app-border rounded-2xl shadow-xl max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Foto del conductor"
                    >
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-app-border shrink-0">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted truncate">
                                Foto conductor · {photoViewer?.title ?? '…'}
                            </h3>
                            <button
                                type="button"
                                onClick={closePhotoViewer}
                                className="px-3 py-1.5 rounded-lg border border-app-border bg-app-input text-[9px] font-black uppercase tracking-widest text-app-text cursor-pointer"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="p-4 flex items-center justify-center min-h-[120px] overflow-auto bg-black/40">
                            {photoLoading ? (
                                <p className="text-sm text-app-muted">Cargando…</p>
                            ) : photoViewer?.objectUrl ? (
                                <img
                                    src={photoViewer.objectUrl}
                                    alt="Foto del conductor"
                                    className="max-w-full max-h-[80vh] w-auto h-auto object-contain"
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

function DriverDetailBlock({
    driver,
    orderCode,
    onViewPhoto,
}: {
    driver: DriverArrival;
    orderCode?: string;
    onViewPhoto?: () => void;
}) {
    return (
        <div className="p-3 rounded-xl bg-app-input border border-app-border text-xs space-y-1">
            <p className="font-black uppercase tracking-widest text-app-muted">Datos del conductor</p>
            <p>{driver.conductor_nombre_completo ?? driver.alias_conductor ?? '—'}</p>
            <p className="text-app-muted">Placa: {driver.placa ?? '—'}</p>
            <p className="text-app-muted">Código en kiosko: {driver.codigo_ingresado}</p>
            <p className="text-app-muted">{formatRegistrationDateTime(driver.created_at)}</p>
            <p className="text-app-muted">Estado: {driverStatusLabel(driver.estado)}</p>
            {onViewPhoto ? (
                <button
                    type="button"
                    onClick={onViewPhoto}
                    className="text-[10px] font-black uppercase tracking-widest text-app-delivery hover:underline mt-1 cursor-pointer"
                >
                    Ver foto{orderCode ? ` · ${orderCode}` : ''}
                </button>
            ) : null}
        </div>
    );
}

export default DeliveryControlCenter;
