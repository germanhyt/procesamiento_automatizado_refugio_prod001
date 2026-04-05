import axios from 'axios';
import type { DriverStatus, OrderStatus } from '@/constants/delivery';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8080`;

export interface DriverArrival {
    id: number;
    plataforma: string;
    codigo_ingresado: string;
    placa?: string | null;
    alias_conductor?: string | null;
    restaurant_id?: number | null;
    conductor_dni?: string | null;
    restaurant_nombre?: string | null;
    estado: DriverStatus;
    matched_order_id?: number | null;
    created_at: string;
    updated_at: string;
    estado_changed_at?: string | null;
    atendido_at?: string | null;
    despachado_at?: string | null;
}

export interface Order {
    id: number;
    restaurant_id: number;
    plataforma: string;
    codigo_pedido: string;
    estado: OrderStatus;
    numero_bolsas?: number | null;
    locked_by_runner_id?: number | null;
    matched_driver_arrival_id?: number | null;
    matched_driver_arrival?: DriverArrival | null;
    created_at: string;
    updated_at: string;
    estado_changed_at?: string | null;
    listo_at?: string | null;
    match_at?: string | null;
    recogido_at?: string | null;
    entregado_at?: string | null;
    cancelado_at?: string | null;
    devolucion_at?: string | null;
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
        const base = WS_URL;
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

    async adminListAllOrders(token: string) {
        const res = await axios.get<Order[]>(`${API_URL}/delivery/admin/orders`, { headers: authHeaders(token) });
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

