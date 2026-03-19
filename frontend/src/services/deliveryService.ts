import axios from 'axios';
import type { DriverStatus, OrderStatus } from '@/constants/delivery';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

export interface Order {
    id: number;
    restaurant_id: number;
    plataforma: string;
    codigo_pedido: string;
    estado: OrderStatus;
    numero_bolsas?: number | null;
    locked_by_runner_id?: number | null;
    created_at: string;
    updated_at: string;
}

export interface DriverArrival {
    id: number;
    plataforma: string;
    codigo_ingresado: string;
    placa?: string | null;
   alias_conductor?: string | null;
    estado: DriverStatus;
    matched_order_id?: number | null;
    created_at: string;
    updated_at: string;
}

export interface ManualMatchIn {
    driver_arrival_id: number;
}

export interface AdminCancelIn {
    reason?: string | null;
    note?: string | null;
}

export interface AdminUnlockIn {
    note?: string | null;
}

function authHeaders(token: string | null) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const deliveryService = {
    wsUrl(token: string) {
        const base = (import.meta.env.VITE_WS_URL as string | undefined) || `ws://${window.location.hostname}:8080`;
        const url = base.replace(/\/$/, '') + `/api/delivery/ws?token=${encodeURIComponent(token)}`;
        return url;
    },

    async listActiveOrders(token: string) {
        const res = await axios.get<Order[]>(`${API_URL}/delivery/orders/active`, { headers: authHeaders(token) });
        return res.data;
    },

    async listWaitingDrivers(token: string) {
        const res = await axios.get<DriverArrival[]>(`${API_URL}/delivery/drivers/waiting`, { headers: authHeaders(token) });
        return res.data;
    },

    async acceptOrder(token: string, orderId: number) {
        const res = await axios.post<Order>(`${API_URL}/delivery/orders/${orderId}/accept`, null, { headers: authHeaders(token) });
        return res.data;
    },

    async shelfOrder(token: string, orderId: number) {
        const res = await axios.post<Order>(`${API_URL}/delivery/orders/${orderId}/shelf`, null, { headers: authHeaders(token) });
        return res.data;
    },

    async deliverOrder(token: string, orderId: number) {
        const res = await axios.post<Order>(`${API_URL}/delivery/orders/${orderId}/deliver`, null, { headers: authHeaders(token) });
        return res.data;
    },

    async manualMatch(token: string, orderId: number, payload: ManualMatchIn) {
        const res = await axios.post(`${API_URL}/delivery/orders/${orderId}/manual-match`, payload, { headers: authHeaders(token) });
        return res.data;
    },

    async adminListOrdersByStatus(token: string, status: string) {
        const res = await axios.get<Order[]>(`${API_URL}/delivery/admin/orders/by-status/${encodeURIComponent(status)}`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async adminMarkDevolucion(token: string, orderId: number) {
        const res = await axios.post<Order>(`${API_URL}/delivery/admin/orders/${orderId}/mark-devolucion`, null, { headers: authHeaders(token) });
        return res.data;
    },

    async adminCancelOrder(token: string, orderId: number, payload: AdminCancelIn) {
        const res = await axios.post<Order>(`${API_URL}/delivery/admin/orders/${orderId}/cancel`, payload, { headers: authHeaders(token) });
        return res.data;
    },

    async adminUnlockOrder(token: string, orderId: number, payload: AdminUnlockIn) {
        const res = await axios.post<Order>(`${API_URL}/delivery/admin/orders/${orderId}/unlock`, payload, { headers: authHeaders(token) });
        return res.data;
    },
};

