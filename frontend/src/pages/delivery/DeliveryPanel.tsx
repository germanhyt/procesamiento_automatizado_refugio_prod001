import React, { useMemo, useState } from 'react';
import AppSelect from '@/components/ui/AppSelect';
import DeliveryAdminTable from '@/pages/delivery/DeliveryAdminTable';
import DeliveryKioskAppsModal from '@/pages/delivery/DeliveryKioskAppsModal';
import DeliveryMetricsModal from '@/pages/delivery/DeliveryMetricsModal';
import DeliveryRestaurantsModal from '@/pages/delivery/DeliveryRestaurantsModal';
import { useDeliveryWS } from '@/hooks/useDeliveryWS';
import {
    useActiveOrders,
    useAdminActions,
    useAdminOrders,
    ADMIN_ORDERS_FILTER_ALL,
    useManualMatch,
    useRunnerActions,
    useWaitingDrivers,
} from '@/hooks/useDelivery';
import { useAuth } from '@/context/AuthContext';
import Swal from 'sweetalert2';
import {
    DELIVERY_PERMISSIONS,
    ORDER_STATUSES_ADMIN,
    ORDER_STATUSES_RUNNER,
    orderStatusBadgeClass,
} from '@/constants/delivery';
import type { DriverArrival, Order } from '@/services/deliveryService';

function hasPermission(user: any, codename: string): boolean {
    if (!user) return false;
    if (user.is_superuser) return true;
    const roles = (user as { roles?: Array<{ permissions?: Array<{ codename: string }> }> }).roles;
    return roles?.some((role) => role.permissions?.some((p) => p.codename === codename)) ?? false;
}

function minutesSince(iso: string | null | undefined) {
    if (!iso) return null;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return null;
    return Math.max(0, Math.floor((Date.now() - ts) / 60000));
}

function formatRegistrationDateTime(iso: string | null | undefined) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

function runnerAssignedLabel(order: Pick<Order, 'locked_by_runner_id' | 'locked_by_runner_username'>) {
    if (order.locked_by_runner_username?.trim()) return order.locked_by_runner_username.trim();
    if (order.locked_by_runner_id != null) return `Runner #${order.locked_by_runner_id}`;
    return 'Sin asignar';
}

function formatDriverDocumentSuffix(d: DriverArrival): string {
    const tipo = (d.conductor_documento_tipo || 'DNI').toUpperCase();
    if (tipo === 'CE' && d.conductor_carne_extranjeria) {
        return ` · CE ${d.conductor_carne_extranjeria}`;
    }
    if (d.conductor_dni) return ` · DNI ${d.conductor_dni}`;
    return '';
}

const DeliveryPanel: React.FC = () => {
    const { user, token } = useAuth();
    const { state, attempts } = useDeliveryWS();
    const isWsOpen = state === 'open';
    const polling = isWsOpen ? false : 5000;

    const orders = useActiveOrders(polling);
    const drivers = useWaitingDrivers(polling);
    const runner = useRunnerActions();
    const admin = useAdminActions();
    const manualMatch = useManualMatch();

    const canOperate = hasPermission(user, DELIVERY_PERMISSIONS.OPERATE);
    const canAdmin = hasPermission(user, DELIVERY_PERMISSIONS.ADMIN);
    const canUpdateKioskSettings = hasPermission(user, DELIVERY_PERMISSIONS.SETTINGS_UPDATE);

    const [tab, setTab] = useState<'runner' | 'admin'>(() => (canAdmin && !canOperate ? 'admin' : 'runner'));
    const [kioskAppsModalOpen, setKioskAppsModalOpen] = useState(false);

    const [adminStatus, setAdminStatus] = useState<string>(ADMIN_ORDERS_FILTER_ALL);
    const adminOrders = useAdminOrders(adminStatus, polling, { skip: 0, limit: 500 });

    const [platform, setPlatform] = useState<string>('ALL');
    const [sortMode, setSortMode] = useState<'oldest' | 'newest'>('oldest');
    const [matchModalOrder, setMatchModalOrder] = useState<Pick<Order, 'id' | 'codigo_pedido' | 'restaurant_nombre'> | null>(null);
    const [selectedMatchDriver, setSelectedMatchDriver] = useState<{ value: number; label: string } | null>(null);
    const [restaurantsModalOpen, setRestaurantsModalOpen] = useState(false);
    const [metricsModalOpen, setMetricsModalOpen] = useState(false);

    const platformOptions = useMemo(() => {
        const set = new Set<string>();
        for (const o of orders.data ?? []) if (o.plataforma) set.add(o.plataforma);
        for (const d of drivers.data ?? []) if (d.plataforma) set.add(d.plataforma);
        for (const o of adminOrders.data?.items ?? []) if (o.plataforma) set.add(o.plataforma);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [orders.data, drivers.data, adminOrders.data]);

    const platformSelectOptions = useMemo(
        () => [{ value: 'ALL', label: 'ALL' }, ...platformOptions.map((p) => ({ value: p, label: p }))],
        [platformOptions]
    );

    const ordersByStatus = useMemo(() => {
        const all = (orders.data ?? [])
            .filter((o) => (platform === 'ALL' ? true : o.plataforma === platform))
            .slice()
            .sort((a, b) => {
                const at = Date.parse(a.created_at);
                const bt = Date.parse(b.created_at);
                const aTs = Number.isNaN(at) ? 0 : at;
                const bTs = Number.isNaN(bt) ? 0 : bt;
                return sortMode === 'oldest' ? aTs - bTs : bTs - aTs;
            });
        const grouped: Record<string, typeof all> = {};
        for (const s of ORDER_STATUSES_RUNNER) grouped[s] = [];
        for (const o of all) {
            if (!grouped[o.estado]) grouped[o.estado] = [];
            grouped[o.estado].push(o);
        }
        return grouped;
    }, [orders.data, platform, sortMode]);

    const visibleDrivers = useMemo(() => {
        return (drivers.data ?? []).filter((d) => (platform === 'ALL' ? true : d.plataforma === platform));
    }, [drivers.data, platform]);

    const driversEsperando = useMemo(() => visibleDrivers.filter((d) => d.estado === 'ESPERANDO'), [visibleDrivers]);
    const driversEnMatch = useMemo(() => visibleDrivers.filter((d) => d.estado === 'EN_MATCH'), [visibleDrivers]);

    const toast = async (opts: { icon: 'success' | 'error' | 'warning' | 'info'; title: string; text?: string }) => {
        await Swal.fire({
            icon: opts.icon,
            title: opts.title,
            text: opts.text,
            timer: 1600,
            showConfirmButton: false,
            background: 'var(--app-panel)',
            color: 'var(--app-text)',
        });
    };

    const confirm = async (opts: { title: string; text: string; confirmText: string; confirmColor?: string }) => {
        const res = await Swal.fire({
            icon: 'warning',
            title: opts.title,
            text: opts.text,
            showCancelButton: true,
            confirmButtonText: opts.confirmText,
            cancelButtonText: 'Cancelar',
            confirmButtonColor: opts.confirmColor ?? 'var(--app-delivery-accent)',
            background: 'var(--app-panel)',
            color: 'var(--app-text)',
        });
        return res.isConfirmed;
    };

    const promptText = async (opts: { title: string; label: string; placeholder?: string; required?: boolean }) => {
        const res = await Swal.fire({
            title: opts.title,
            input: 'text',
            inputLabel: opts.label,
            inputPlaceholder: opts.placeholder,
            inputAttributes: { autocapitalize: 'off' },
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            cancelButtonText: 'Cancelar',
            background: 'var(--app-panel)',
            color: 'var(--app-text)',
            inputValidator: (v) => (opts.required && !String(v ?? '').trim() ? 'Campo requerido' : undefined),
        });
        if (!res.isConfirmed) return null;
        return String(res.value ?? '').trim();
    };

    const openMatchModal = (order: Pick<Order, 'id' | 'codigo_pedido' | 'restaurant_nombre'>) => {
        const list = (drivers.data ?? []).filter((d) => d.estado === 'ESPERANDO' || d.estado === 'EN_MATCH');
        if (list.length === 0) {
            void toast({ icon: 'info', title: 'Sin drivers disponibles', text: 'No hay drivers en ESPERANDO/EN_MATCH.' });
            return;
        }
        setSelectedMatchDriver(null);
        setMatchModalOrder(order);
    };

    const closeMatchModal = () => {
        setMatchModalOrder(null);
        setSelectedMatchDriver(null);
    };

    const confirmMatchFromModal = async () => {
        if (!matchModalOrder || !selectedMatchDriver) return;
        const loc = matchModalOrder.restaurant_nombre?.trim();
        const ok = await confirm({
            title: 'Confirmar match manual',
            text: `¿Confirmas matchear ${matchModalOrder?.codigo_pedido}${loc ? ` · ${loc}` : ''} con driver #${selectedMatchDriver.value}?`,
            confirmText: 'Matchear',
        });
        if (!ok) return;

        closeMatchModal();
        manualMatch.mutate(
            { orderId: matchModalOrder.id, driverArrivalId: selectedMatchDriver.value },
            {
                onSuccess: () => void toast({ icon: 'success', title: 'Match aplicado' }),
                onError: () => void toast({ icon: 'error', title: 'No se pudo matchear' }),
            }
        );
    };

    const matchDriverOptions = useMemo(() => {
        const list = (drivers.data ?? []).filter((d) => d.estado === 'ESPERANDO' || d.estado === 'EN_MATCH');
        return list.map((d) => ({
            value: d.id,
            label: `${d.codigo_ingresado} · ${d.plataforma} · ${d.estado}${d.placa ? ` · ${d.placa}` : ''}${d.restaurant_nombre ? ` · ${d.restaurant_nombre}` : ''
                }${formatDriverDocumentSuffix(d)}`,
        }));
    }, [drivers.data]);

    const sortModeOptions = useMemo(
        () => [
            { value: 'oldest' as const, label: 'Más antiguo primero' },
            { value: 'newest' as const, label: 'Más nuevo primero' },
        ],
        []
    );

    const adminStatusOptions = useMemo(
        () => [{ value: ADMIN_ORDERS_FILTER_ALL, label: 'Todos' }, ...ORDER_STATUSES_ADMIN.map((s) => ({ value: s, label: s }))],
        []
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-black tracking-tighter uppercase text-app-text">Delivery</h1>
                    <p className="text-[10px] text-app-muted font-mono">
                        WS: {state} {attempts ? `(reintentos: ${attempts}/3)` : ''}
                    </p>
                </div>
                <div className="flex gap-2">

                    {canAdmin && (
                        <button
                            type="button"
                            onClick={() => setMetricsModalOpen(true)}
                            className="px-4 py-2 rounded-xl bg-app-delivery text-white hover:bg-app-delivery-strong border border-app-delivery-muted text-[10px] font-black uppercase tracking-widest"
                        >
                            Métricas
                        </button>
                    )}
                    {canAdmin && (
                        <button
                            type="button"
                            onClick={() => setRestaurantsModalOpen(true)}
                            className="px-4 py-2 rounded-xl bg-app-delivery-muted-bg hover:bg-app-card-hover border border-app-delivery-muted text-[10px] font-black uppercase tracking-widest text-app-delivery"
                        >
                            Restaurantes
                        </button>
                    )}
                    {canAdmin && (
                        <button
                            type="button"
                            onClick={() => setKioskAppsModalOpen(true)}
                            className="px-4 py-2 rounded-2xl bg-app-input hover:bg-app-surface border border-app-border text-[10px] font-black uppercase tracking-widest text-app-text"
                        >
                            Permisos a apps
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            orders.refetch();
                            drivers.refetch();
                            adminOrders.refetch();
                        }}
                        className="px-4 py-2 rounded-xl bg-app-input hover:bg-app-surface border border-app-border text-[10px] font-black uppercase tracking-widest text-app-text"
                    >
                        Refrescar
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setTab('runner')}
                        className={`px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'runner'
                            ? 'bg-app-delivery text-white border-app-delivery-muted'
                            : 'bg-app-input hover:bg-app-surface text-app-text border-app-border'
                            }`}
                    >
                        Runner
                    </button>
                    {canAdmin && (
                        <button
                            type="button"
                            onClick={() => setTab('admin')}
                            className={`px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'admin'
                                ? 'bg-app-delivery text-white border-app-delivery-muted'
                                : 'bg-app-input hover:bg-app-surface text-app-text border-app-border'
                                }`}
                        >
                            Admin
                        </button>
                    )}
                </div>

            </div>

            {tab === 'runner' && (
                <div className="space-y-6">
                    <div className="bg-app-card border border-app-border rounded-3xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Plataforma</span>
                            <AppSelect
                                options={platformSelectOptions}
                                value={platformSelectOptions.find((o) => o.value === platform) ?? platformSelectOptions[0]}
                                onChange={(opt) => opt && setPlatform(opt.value)}
                                size="md"
                                className="min-w-[120px]"
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Orden</span>
                            <AppSelect<'oldest' | 'newest'>
                                options={sortModeOptions}
                                value={sortModeOptions.find((o) => o.value === sortMode) ?? sortModeOptions[0]}
                                onChange={(opt) => opt && setSortMode(opt.value)}
                                size="md"
                                className="min-w-[180px]"
                            />
                            <span className="text-[10px] font-mono text-app-muted">
                                {/* {isWsOpen ? 'WS on (sin polling)' : 'Polling 5s'} */}
                            </span>
                        </div>
                    </div>

                    {!canOperate && (
                        <div className="p-4 rounded-2xl bg-app-surface border border-app-border">
                            <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                Solo lectura: no tienes permiso `delivery:operate`
                            </p>
                        </div>
                    )}

                    <div className="bg-app-card border border-app-border rounded-3xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Drivers</h2>
                            <span className="text-[10px] font-mono text-app-muted">{visibleDrivers.length}</span>
                        </div>
                        {drivers.isLoading ? (
                            <p className="text-sm text-app-muted">Cargando…</p>
                        ) : drivers.isError ? (
                            <p className="text-sm text-app-danger">Error cargando drivers.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">ESPERANDO</h3>
                                        <span className="text-[10px] font-mono text-app-muted">{driversEsperando.length}</span>
                                    </div>
                                    {driversEsperando.map((d) => (
                                        <div key={d.id} className="p-4 rounded-2xl bg-app-input border border-app-border">
                                            <p className="text-sm font-bold text-app-text">{d.codigo_ingresado}</p>
                                            <p className="text-[10px] font-mono text-app-muted">
                                                {d.plataforma} · {d.estado}
                                                {d.placa ? ` · ${d.placa}` : ''}
                                                {d.alias_conductor ? ` · ${d.alias_conductor}` : ''}
                                                {d.restaurant_nombre ? ` · ${d.restaurant_nombre}` : ''}
                                                {formatDriverDocumentSuffix(d)}
                                            </p>
                                        </div>
                                    ))}
                                    {driversEsperando.length === 0 && (
                                        <p className="text-sm text-app-muted">Sin drivers esperando.</p>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">EN_MATCH (Coincidencia)</h3>
                                        <span className="text-[10px] font-mono text-app-muted">{driversEnMatch.length}</span>
                                    </div>
                                    {driversEnMatch.map((d) => (
                                        <div key={d.id} className="p-4 rounded-2xl bg-app-input border border-app-border">
                                            <p className="text-sm font-bold text-app-text">{d.codigo_ingresado}</p>
                                            <p className="text-[10px] font-mono text-app-muted">
                                                {d.plataforma} · {d.estado}
                                                {d.placa ? ` · ${d.placa}` : ''}
                                                {d.alias_conductor ? ` · ${d.alias_conductor}` : ''}
                                                {d.restaurant_nombre ? ` · ${d.restaurant_nombre}` : ''}
                                                {formatDriverDocumentSuffix(d)}
                                            </p>
                                        </div>
                                    ))}
                                    {driversEnMatch.length === 0 && (
                                        <p className="text-sm text-app-muted">Sin drivers en match.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                        {ORDER_STATUSES_RUNNER.map((status) => (
                            <div key={status} className="bg-app-card border border-app-border rounded-3xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">{status}</h3>
                                    <span className="text-[10px] font-mono text-app-muted">{ordersByStatus[status]?.length ?? 0}</span>
                                </div>
                                {orders.isLoading ? (
                                    <p className="text-sm text-app-muted">Cargando…</p>
                                ) : orders.isError ? (
                                    <p className="text-sm text-app-danger">Error cargando órdenes.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {(ordersByStatus[status] ?? []).map((o) => (
                                            <div key={o.id} className="p-4 rounded-2xl bg-app-input border border-app-border">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-app-text truncate">{o.codigo_pedido}</p>
                                                        <p className="text-[10px] font-mono text-app-muted">
                                                            {o.plataforma}
                                                            {o.numero_bolsas ? ` · bolsas: ${o.numero_bolsas}` : ''}
                                                            {o?.restaurant_nombre ? ` · ${o?.restaurant_nombre}` : ''}
                                                        </p>
                                                        <p className="text-[10px] font-mono text-app-muted">
                                                            Registro: {formatRegistrationDateTime(o.created_at)}
                                                            {minutesSince(o.created_at) !== null ? ` · ${minutesSince(o.created_at)}m` : ''}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                            <span className={orderStatusBadgeClass(o.estado)}>{o.estado}</span>
                                                            <span
                                                                className="px-2 py-1 rounded-lg border border-app-border bg-app-surface text-[9px] text-zinc-300 max-w-[240px] truncate"
                                                                title={runnerAssignedLabel(o)}
                                                            >
                                                                Runner asignado:{' '}
                                                                <span className="font-semibold text-app-text">{runnerAssignedLabel(o)}</span>
                                                            </span>
                                                            {o.matched_driver_arrival_id ? (
                                                                <span className="px-2 py-1 rounded-lg border border-app-delivery-muted bg-app-delivery-muted-bg text-[9px] font-mono text-app-delivery">
                                                                    DRIVER MATCHEADO ✅
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    {canOperate && (
                                                        <div className="flex flex-col gap-1 shrink-0">
                                                            {/* Match: Siempre disponible para Admin/Operador si no está entregado */}
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openMatchModal({
                                                                        id: o.id,
                                                                        codigo_pedido: o.codigo_pedido,
                                                                        restaurant_nombre: o.restaurant_nombre,
                                                                    })
                                                                }
                                                                disabled={manualMatch.isPending}
                                                                className="px-3 py-1.5 rounded-lg bg-app-delivery text-white text-[9px] font-black uppercase tracking-widest hover:bg-app-delivery-strong disabled:opacity-50"
                                                            >
                                                                Match
                                                            </button>

                                                            {/* Tomar: Solo si LISTO o LISTO_PARA_ENTREGAR y no es mío */}
                                                            {(o.estado === 'LISTO' || o.estado === 'LISTO_PARA_ENTREGAR') && o.locked_by_runner_id !== user?.id && (
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        const ok = await confirm({
                                                                            title: 'Tomar pedido',
                                                                            text: `¿Confirmas tomar el pedido ${o.codigo_pedido}${o.restaurant_nombre?.trim() ? ` · ${o.restaurant_nombre.trim()}` : ''}?`,
                                                                            confirmText: 'Tomar',
                                                                        });
                                                                        if (!ok) return;
                                                                        runner.accept.mutate(o.id, {
                                                                            onSuccess: () => void toast({ icon: 'success', title: 'Pedido tomado' }),
                                                                            onError: () => void toast({ icon: 'error', title: 'No se pudo tomar' }),
                                                                        });
                                                                    }}
                                                                    disabled={runner.accept.isPending}
                                                                    className="px-3 py-1.5 rounded-lg bg-app-delivery text-white text-[9px] font-black uppercase tracking-widest hover:bg-app-delivery-strong disabled:opacity-50"
                                                                >
                                                                    Tomar
                                                                </button>
                                                            )}

                                                            {/* Estante: Solo si yo lo tengo (PENDIENTE_RECOJO) */}
                                                            {o.estado === 'PENDIENTE_RECOJO' && o.locked_by_runner_id === user?.id && (
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        const ok = await confirm({
                                                                            title: 'Marcar en estante',
                                                                            text: `¿Confirmas marcar en estante el pedido ${o.codigo_pedido}${o.restaurant_nombre?.trim() ? ` · ${o.restaurant_nombre.trim()}` : ''}?`,
                                                                            confirmText: 'Marcar',
                                                                        });
                                                                        if (!ok) return;
                                                                        runner.shelf.mutate(o.id, {
                                                                            onSuccess: () => void toast({ icon: 'success', title: 'Marcado en estante' }),
                                                                            onError: () => void toast({ icon: 'error', title: 'No se pudo marcar' }),
                                                                        });
                                                                    }}
                                                                    disabled={runner.shelf.isPending}
                                                                    className="px-3 py-1.5 rounded-lg bg-app-delivery text-white text-[9px] font-black uppercase tracking-widest hover:bg-app-delivery-strong disabled:opacity-50"
                                                                >
                                                                    Estante
                                                                </button>
                                                            )}

                                                            {/* Entregar: Si lo tengo yo (PENDIENTE_RECOJO o PROCESO_ENTREGA) */}
                                                            {(o.estado === 'PENDIENTE_RECOJO' || o.estado === 'PROCESO_ENTREGA' || o.estado === 'LISTO_PARA_ENTREGAR') && o.locked_by_runner_id === user?.id && (
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        const ok = await confirm({
                                                                            title: 'Entregar pedido',
                                                                            text: `¿Confirmas ENTREGAR el pedido ${o.codigo_pedido}${o.restaurant_nombre?.trim() ? ` · ${o.restaurant_nombre.trim()}` : ''}?`,
                                                                            confirmText: 'Entregar',
                                                                            confirmColor: 'var(--app-success)',
                                                                        });
                                                                        if (!ok) return;
                                                                        runner.deliver.mutate(o.id, {
                                                                            onSuccess: () => void toast({ icon: 'success', title: 'Pedido entregado' }),
                                                                            onError: () => void toast({ icon: 'error', title: 'No se pudo entregar' }),
                                                                        });
                                                                    }}
                                                                    disabled={runner.deliver.isPending || !o.matched_driver_arrival_id}
                                                                    title={!o.matched_driver_arrival_id ? "Requiere match con driver para entregar" : ""}
                                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-30 ${o.matched_driver_arrival_id
                                                                        ? 'bg-app-delivery text-white'
                                                                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                                                        }`}
                                                                >
                                                                    Entregar
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {(ordersByStatus[status] ?? []).length === 0 && (
                                            <p className="text-sm text-app-muted">Sin órdenes.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'admin' && canAdmin && (
                <DeliveryAdminTable
                    adminStatus={adminStatus}
                    onAdminStatusChange={setAdminStatus}
                    adminStatusOptions={adminStatusOptions}
                    refetchIntervalMs={polling}
                    admin={admin}
                    confirm={confirm}
                    promptText={promptText}
                    toast={toast}
                    authToken={token}
                />
            )}

            {tab === 'admin' && !canAdmin && (
                <div className="p-4 rounded-2xl bg-app-surface border border-app-border">
                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                        No tienes permiso `delivery:admin`
                    </p>
                </div>
            )}

            {/* Modal Match manual con AppSelect */}
            <DeliveryMetricsModal
                open={metricsModalOpen}
                onClose={() => setMetricsModalOpen(false)}
            />

            <DeliveryRestaurantsModal open={restaurantsModalOpen} onClose={() => setRestaurantsModalOpen(false)} toast={toast} />

            <DeliveryKioskAppsModal
                open={kioskAppsModalOpen}
                onClose={() => setKioskAppsModalOpen(false)}
                canUpdateKioskSettings={canUpdateKioskSettings}
                toast={toast}
            />

            {matchModalOrder && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={closeMatchModal}
                    role="presentation"
                >
                    <div
                        className="bg-app-panel border border-app-border rounded-3xl p-6 w-full max-w-md shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="match-modal-title"
                    >
                        <h2 id="match-modal-title" className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-4">
                            Match manual · {matchModalOrder.codigo_pedido}
                            {matchModalOrder?.restaurant_nombre?.trim()
                                ? ` · ${matchModalOrder.restaurant_nombre.trim()}`
                                : ''}
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-2">
                                    Driver
                                </label>
                                <AppSelect<number>
                                    options={matchDriverOptions}
                                    value={selectedMatchDriver}
                                    onChange={(opt) => setSelectedMatchDriver(opt)}
                                    placeholder="Selecciona un driver…"
                                    size="md"
                                    className="w-full"
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={closeMatchModal}
                                    className="px-4 py-2 rounded-xl bg-app-input hover:bg-app-surface border border-app-border text-[10px] font-black uppercase tracking-widest text-app-text"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmMatchFromModal}
                                    disabled={!selectedMatchDriver || manualMatch.isPending}
                                    className="px-4 py-2 rounded-xl bg-app-delivery text-white text-[10px] font-black uppercase tracking-widest hover:bg-app-delivery-strong disabled:opacity-50"
                                >
                                    {manualMatch.isPending ? 'Matcheando…' : 'Continuar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeliveryPanel;

