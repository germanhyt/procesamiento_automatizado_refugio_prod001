import axios from 'axios';
import type { DriverStatus, OrderStatus } from '@/constants/delivery';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8080`;

export interface RestaurantNotificationEmail {
    id: number;
    restaurant_id: number;
    email: string;
    created_at: string;
}

export interface RestaurantAdmin {
    id: number;
    fidelio_id: string;
    nombre: string;
    is_active: boolean;
    codigo_negocio?: string | null;
    codigo_comunicacion?: string | null;
    created_at: string;
    notification_emails: RestaurantNotificationEmail[];
}

export interface RestaurantCreateIn {
    fidelio_id: string;
    nombre: string;
    is_active?: boolean;
    codigo_negocio?: string | null;
    codigo_comunicacion?: string | null;
}

export interface RestaurantUpdateIn {
    fidelio_id?: string | null;
    nombre?: string | null;
    is_active?: boolean | null;
    codigo_negocio?: string | null;
    codigo_comunicacion?: string | null;
}

export interface DriverArrival {
    id: number;
    plataforma: string;
    codigo_ingresado: string;
    placa?: string | null;
    alias_conductor?: string | null;
    restaurant_id?: number | null;
    conductor_documento_tipo?: string | null;
    conductor_dni?: string | null;
    conductor_carne_extranjeria?: string | null;
    conductor_nombre_completo?: string | null;
    restaurant_nombre?: string | null;
    foto_path?: string | null;
    foto_mime?: string | null;
    foto_uploaded_at?: string | null;
    estado: DriverStatus;
    matched_order_id?: number | null;
    created_at: string;
    updated_at: string;
    estado_changed_at?: string | null;
    atendido_at?: string | null;
    despachado_at?: string | null;
}

export interface KioskConfigPublic {
    enable_driver_dni_lookup: boolean;
    enable_driver_photo_capture: boolean;
}

/** Respuesta de GET/PATCH admin `/delivery/admin/kiosk-config` (kiosk + flag simular listo Runner). */
export interface AdminDeliveryAppConfig extends KioskConfigPublic {
    enable_runner_simulate_order_ready: boolean;
}

export interface Order {
    id: number;
    restaurant_id: number;
    /** Nombre del local (`delivery_restaurants.nombre`), igual que en la API. */
    restaurant_nombre?: string | null;
    plataforma: string;
    codigo_pedido: string;
    estado: OrderStatus;
    numero_bolsas?: number | null;
    locked_by_runner_id?: number | null;
    /** Usuario que tomó el pedido (runner); viene del backend, no requiere listar /users. */
    locked_by_runner_username?: string | null;
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

    async adminListRestaurants(token: string) {
        const res = await axios.get<RestaurantAdmin[]>(`${API_URL}/delivery/admin/restaurants`, { headers: authHeaders(token) });
        return res.data;
    },

    async adminCreateRestaurant(token: string, payload: RestaurantCreateIn) {
        const res = await axios.post<RestaurantAdmin>(`${API_URL}/delivery/admin/restaurants`, payload, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async adminUpdateRestaurant(token: string, restaurantId: number, payload: RestaurantUpdateIn) {
        const res = await axios.patch<RestaurantAdmin>(`${API_URL}/delivery/admin/restaurants/${restaurantId}`, payload, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async adminAddRestaurantNotificationEmail(token: string, restaurantId: number, email: string) {
        const res = await axios.post<RestaurantNotificationEmail>(
            `${API_URL}/delivery/admin/restaurants/${restaurantId}/notification-emails`,
            { email },
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async adminDeleteRestaurantNotificationEmail(token: string, restaurantId: number, emailRowId: number) {
        await axios.delete(
            `${API_URL}/delivery/admin/restaurants/${restaurantId}/notification-emails/${emailRowId}`,
            { headers: authHeaders(token) }
        );
    },

    async adminGetKioskConfig(token: string) {
        const res = await axios.get<AdminDeliveryAppConfig>(`${API_URL}/delivery/admin/kiosk-config`, { headers: authHeaders(token) });
        return res.data;
    },

    async adminPatchKioskConfig(
        token: string,
        payload: {
            enable_driver_dni_lookup?: boolean;
            enable_driver_photo_capture?: boolean;
            enable_runner_simulate_order_ready?: boolean;
        }
    ) {
        const res = await axios.patch<AdminDeliveryAppConfig>(`${API_URL}/delivery/admin/kiosk-config`, payload, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    /** Foto del conductor (blob autenticado). Revocar con `URL.revokeObjectURL` al cerrar el visor. */
    async adminGetDriverArrivalPhotoObjectUrl(token: string, arrivalId: number): Promise<string> {
        const res = await axios.get<Blob>(`${API_URL}/delivery/admin/driver-arrivals/${arrivalId}/photo-file`, {
            headers: authHeaders(token),
            responseType: 'blob',
        });
        return URL.createObjectURL(res.data);
    },
};

