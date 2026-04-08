import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AdminCancelIn,
    AdminUnlockIn,
    RestaurantCreateIn,
    RestaurantUpdateIn,
    deliveryService,
} from '@/services/deliveryService';
import { useAuth } from '@/context/AuthContext';

export function useActiveOrders(refetchIntervalMs: number | false = 5000) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'orders', 'active'],
        queryFn: async () => deliveryService.listActiveOrders(token as string),
        enabled: !!token,
        refetchInterval: refetchIntervalMs,
    });
}

export function useWaitingDrivers(refetchIntervalMs: number | false = 5000) {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['delivery', 'drivers', 'waiting'],
        queryFn: async () => deliveryService.listWaitingDrivers(token as string),
        enabled: !!token,
        refetchInterval: refetchIntervalMs,
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

export function useManualMatch() {
    const { token } = useAuth();
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ orderId, driverArrivalId }: { orderId: number; driverArrivalId: number }) =>
            deliveryService.manualMatch(token as string, orderId, { driver_arrival_id: driverArrivalId }),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
                qc.invalidateQueries({ queryKey: ['delivery', 'drivers'] }),
            ]);
        },
    });
}

/** Valor del filtro admin: todos los pedidos (sin filtrar por estado en API). */
export const ADMIN_ORDERS_FILTER_ALL = 'ALL';

export function useAdminOrders(status: string, refetchIntervalMs: number | false = 5000) {
    const { token } = useAuth();
    const isAll = status === ADMIN_ORDERS_FILTER_ALL;
    return useQuery({
        queryKey: ['delivery', 'admin', 'orders', isAll ? 'all' : 'by-status', isAll ? 'all' : status],
        queryFn: async () =>
            isAll
                ? deliveryService.adminListAllOrders(token as string)
                : deliveryService.adminListOrdersByStatus(token as string, status),
        enabled: !!token && !!status,
        refetchInterval: refetchIntervalMs,
    });
}

export function useAdminActions() {
    const { token } = useAuth();
    const qc = useQueryClient();

    const invalidate = async () => {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
            qc.invalidateQueries({ queryKey: ['delivery', 'drivers'] }),
            qc.invalidateQueries({ queryKey: ['delivery', 'admin'] }),
        ]);
    };

    const markDevolucion = useMutation({
        mutationFn: async (orderId: number) => deliveryService.adminMarkDevolucion(token as string, orderId),
        onSuccess: invalidate,
    });

    const cancel = useMutation({
        mutationFn: async ({ orderId, payload }: { orderId: number; payload: AdminCancelIn }) =>
            deliveryService.adminCancelOrder(token as string, orderId, payload),
        onSuccess: invalidate,
    });

    const unlock = useMutation({
        mutationFn: async ({ orderId, payload }: { orderId: number; payload: AdminUnlockIn }) =>
            deliveryService.adminUnlockOrder(token as string, orderId, payload),
        onSuccess: invalidate,
    });

    return { markDevolucion, cancel, unlock };
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

