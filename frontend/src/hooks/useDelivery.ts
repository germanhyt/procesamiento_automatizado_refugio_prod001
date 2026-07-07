import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AdminCancelIn,
    AdminForceEntregadoIn,
    AdminOrderUpdateIn,
    AdminOrdersListParams,
    AdminUnlockIn,
    DeliveryMetricsParams,
    RestaurantCreateIn,
    RestaurantUpdateIn,
    deliveryService,
} from '@/services/deliveryService';
import { useAuth } from '@/context/AuthContext';
import { buildLocalControlSnapshotMock, buildLocalControlAuditMock, isControlDemoDefaultEnabled } from '@/pages/delivery/mockControlSnapshot';
import { DELIVERY_AUDIT_SOURCE_CONTROL } from '@/services/deliveryService';

export function useActiveOrders(refetchIntervalMs: number | false = DELIVERY_POLLING_MS) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'orders', 'active'],
        queryFn: async () => deliveryService.listActiveOrders(token as string),
        enabled: !!token,
        refetchInterval: refetchIntervalMs,
    });
}

export function useWaitingDrivers(refetchIntervalMs: number | false = DELIVERY_POLLING_MS) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'drivers', 'waiting'],
        queryFn: async () => deliveryService.listWaitingDrivers(token as string),
        enabled: !!token,
        refetchInterval: refetchIntervalMs,
    });
}

export function useControlSnapshot(
    enabled: boolean,
    refetchIntervalMs: number | false = DELIVERY_POLLING_MS,
    useMock = false
) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'control', 'snapshot', useMock ? 'mock' : 'live'],
        queryFn: async () => {
            if (useMock) {
                if (token) {
                    try {
                        return await deliveryService.getControlSnapshotMock(token);
                    } catch {
                        return buildLocalControlSnapshotMock();
                    }
                }
                return buildLocalControlSnapshotMock();
            }
            return deliveryService.getControlSnapshot(token as string);
        },
        enabled: enabled && (useMock || !!token),
        refetchInterval: useMock ? false : refetchIntervalMs,
    });
}

export function useControlAudit(
    enabled: boolean,
    refetchIntervalMs: number | false = DELIVERY_POLLING_MS,
    useMock = false
) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'control', 'audit', useMock ? 'mock' : 'live'],
        queryFn: async () => {
            if (useMock) {
                if (token) {
                    try {
                        return await deliveryService.getControlAuditMock(token);
                    } catch {
                        return buildLocalControlAuditMock();
                    }
                }
                return buildLocalControlAuditMock();
            }
            return deliveryService.getControlAuditLog(token as string);
        },
        enabled: enabled && (useMock || !!token),
        refetchInterval: useMock ? false : refetchIntervalMs,
    });
}

export function useRunnerActions() {
    const { token } = useAuth();
    const qc = useQueryClient();

    const invalidate = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
            qc.invalidateQueries({ queryKey: ['delivery', 'drivers'] }),
        ]);
    };

    const accept = useMutation({
        mutationFn: async (orderId: number) => deliveryService.acceptOrder(token as string, orderId),
        onSuccess: invalidate,
    });
    const shelf = useMutation({
        mutationFn: async (orderId: number) => deliveryService.shelfOrder(token as string, orderId),
        onSuccess: invalidate,
    });
    const deliver = useMutation({
        mutationFn: async (orderId: number) => deliveryService.deliverOrder(token as string, orderId),
        onSuccess: invalidate,
    });

    return { accept, shelf, deliver };
}

export function useManualMatch(auditSource?: string) {
    const { token } = useAuth();
    const qc = useQueryClient();
    const src = auditSource ?? undefined;

    return useMutation({
        mutationFn: async ({ orderId, driverArrivalId }: { orderId: number; driverArrivalId: number }) =>
            deliveryService.manualMatch(token as string, orderId, { driver_arrival_id: driverArrivalId }, src),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
                qc.invalidateQueries({ queryKey: ['delivery', 'drivers'] }),
                qc.invalidateQueries({ queryKey: ['delivery', 'control', 'snapshot'] }),
                qc.invalidateQueries({ queryKey: ['delivery', 'control', 'audit'] }),
            ]);
        },
    });
}

/** Valor del filtro admin: todos los pedidos (sin filtrar por estado en API). */
export const ADMIN_ORDERS_FILTER_ALL = 'ALL';

export function useAdminOrders(
    status: string,
    refetchIntervalMs: number | false = DELIVERY_POLLING_MS,
    params: AdminOrdersListParams = { skip: 0, limit: 500 }
) {
    const { token } = useAuth();
    const isAll = status === ADMIN_ORDERS_FILTER_ALL;
    return useQuery({
        queryKey: [
            'delivery',
            'admin',
            'orders',
            isAll ? 'all' : 'by-status',
            isAll ? 'all' : status,
            params.skip ?? 0,
            params.limit ?? 500,
            params.codigo ?? '',
            params.plataforma ?? '',
            params.restaurant_nombre ?? '',
            params.fecha_desde ?? '',
            params.fecha_hasta ?? '',
        ],
        queryFn: async () =>
            isAll
                ? deliveryService.adminListAllOrders(token as string, params)
                : deliveryService.adminListOrdersByStatus(token as string, status, params),
        enabled: !!token && !!status,
        refetchInterval: refetchIntervalMs,
    });
}

export function useDeliveryMetrics(
    open: boolean,
    params: DeliveryMetricsParams
) {
    const { token } = useAuth();
    return useQuery({
        queryKey: [
            'delivery',
            'admin',
            'metrics',
            params.fecha_desde,
            params.fecha_hasta,
            params.dimension ?? 'estado',
            params.estado ?? '',
            params.locatario ?? '',
            params.plataforma ?? '',
            params.driver ?? '',
            params.runner ?? '',
            params.time_granularity ?? 'day',
        ],
        queryFn: () => deliveryService.adminGetMetrics(token as string, params),
        enabled: !!token && open && !!params.fecha_desde && !!params.fecha_hasta,
        staleTime: 30_000,
    });
}

export function useAdminActions(auditSource?: string) {
    const { token } = useAuth();
    const qc = useQueryClient();
    const src = auditSource ?? undefined;

    const invalidate = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
            qc.invalidateQueries({ queryKey: ['delivery', 'drivers'] }),
            qc.invalidateQueries({ queryKey: ['delivery', 'admin'] }),
            qc.invalidateQueries({ queryKey: ['delivery', 'control', 'snapshot'] }),
            qc.invalidateQueries({ queryKey: ['delivery', 'control', 'audit'] }),
        ]);
    };

    const markDevolucion = useMutation({
        mutationFn: async (orderId: number) => deliveryService.adminMarkDevolucion(token as string, orderId, src),
        onSuccess: invalidate,
    });

    const forceEntregado = useMutation({
        mutationFn: async ({ orderId, payload }: { orderId: number; payload: AdminForceEntregadoIn }) =>
            deliveryService.adminForceEntregado(token as string, orderId, payload, src),
        onSuccess: invalidate,
    });

    const cancel = useMutation({
        mutationFn: async ({ orderId, payload }: { orderId: number; payload: AdminCancelIn }) =>
            deliveryService.adminCancelOrder(token as string, orderId, payload, src),
        onSuccess: invalidate,
    });

    const unlock = useMutation({
        mutationFn: async ({ orderId, payload }: { orderId: number; payload: AdminUnlockIn }) =>
            deliveryService.adminUnlockOrder(token as string, orderId, payload, src),
        onSuccess: invalidate,
    });

    return { markDevolucion, forceEntregado, cancel, unlock };
}

export function useAdminOrderUpdate() {
    const { token } = useAuth();
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ orderId, payload }: { orderId: number; payload: AdminOrderUpdateIn }) =>
            deliveryService.adminUpdateOrder(token as string, orderId, payload),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['delivery', 'admin'] }),
                qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
                qc.invalidateQueries({ queryKey: ['delivery', 'control', 'snapshot'] }),
            ]);
        },
    });
}

/** Acciones admin desde centro de control (auditoría con source control_center). */
export function useControlAdminActions() {
    return useAdminActions(DELIVERY_AUDIT_SOURCE_CONTROL);
}

export function useControlManualMatch() {
    return useManualMatch(DELIVERY_AUDIT_SOURCE_CONTROL);
}

export function useAdminRestaurants(open: boolean) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'admin', 'restaurants'],
        queryFn: async () => deliveryService.adminListRestaurants(token as string),
        enabled: !!token && open,
    });
}

export function useAdminRestaurantMutations() {
    const { token } = useAuth();
    const qc = useQueryClient();

    const invalidate = async () => {
        await qc.invalidateQueries({ queryKey: ['delivery', 'admin', 'restaurants'] });
    };

    const createRestaurant = useMutation({
        mutationFn: async (payload: RestaurantCreateIn) => deliveryService.adminCreateRestaurant(token as string, payload),
        onSuccess: invalidate,
    });

    const updateRestaurant = useMutation({
        mutationFn: async ({ id, payload }: { id: number; payload: RestaurantUpdateIn }) =>
            deliveryService.adminUpdateRestaurant(token as string, id, payload),
        onSuccess: invalidate,
    });

    const addNotificationEmail = useMutation({
        mutationFn: async ({ restaurantId, email }: { restaurantId: number; email: string }) =>
            deliveryService.adminAddRestaurantNotificationEmail(token as string, restaurantId, email),
        onSuccess: invalidate,
    });

    const deleteNotificationEmail = useMutation({
        mutationFn: async ({ restaurantId, emailRowId }: { restaurantId: number; emailRowId: number }) =>
            deliveryService.adminDeleteRestaurantNotificationEmail(token as string, restaurantId, emailRowId),
        onSuccess: invalidate,
    });

    return { createRestaurant, updateRestaurant, addNotificationEmail, deleteNotificationEmail };
}

export function useAdminKioskConfig(enabled: boolean) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'admin', 'kiosk-config'],
        queryFn: async () => deliveryService.adminGetKioskConfig(token as string),
        enabled: !!token && enabled,
    });
}

export function useAdminKioskConfigPatch() {
    const { token } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            enable_driver_dni_lookup?: boolean;
            enable_driver_photo_capture?: boolean;
            enable_runner_simulate_order_ready?: boolean;
        }) => deliveryService.adminPatchKioskConfig(token as string, payload),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['delivery', 'admin', 'kiosk-config'] });
        },
    });
}

