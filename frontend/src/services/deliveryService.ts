import axios from 'axios';
import type { DriverStatus, OrderStatus } from '@/constants/delivery';
import { API_URL, WS_URL } from '@/config/api';

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

export interface AdminForceEntregadoIn {
    reason: string;
    note?: string | null;
}

export interface AdminOrderUpdateIn {
    codigo_pedido?: string;
    plataforma?: string;
    restaurant_id?: number;
    numero_bolsas?: number | null;
}

export type ControlAlertSeverity = 'warning' | 'critical';

export type ControlAlertType =
    | 'ORDER_NO_RUNNER'
    | 'ORDER_LISTO_NO_MATCH'
    | 'MATCH_NO_DELIVERY'
    | 'DRIVER_WAITING_LONG';

export interface ControlAlert {
    type: ControlAlertType | string;
    order_id?: number | null;
    driver_arrival_id?: number | null;
    minutes: number;
    severity: ControlAlertSeverity;
    message: string;
}

export interface ControlCounts {
    orders_active: number;
    orders_with_runner: number;
    orders_matched: number;
    orders_with_alerts: number;
    drivers_esperando: number;
    drivers_en_match: number;
    drivers_total: number;
    alerts_total: number;
}

export interface ControlSnapshot {
    operational_day: string;
    orders: Order[];
    drivers: DriverArrival[];
    alerts: ControlAlert[];
    counts: ControlCounts;
    generated_at: string;
    mock?: boolean;
}

export interface ControlAuditEntry {
    id: number;
    user_id?: number | null;
    username?: string | null;
    action: string;
    source: string;
    order_id?: number | null;
    driver_arrival_id?: number | null;
    detail?: string | null;
    created_at: string;
}

export interface ControlAuditList {
    items: ControlAuditEntry[];
    total: number;
}

export const DELIVERY_AUDIT_SOURCE_CONTROL = 'control_center';
export const DELIVERY_AUDIT_HEADER = 'X-Delivery-Audit-Source';

export interface PaginatedOrders {
    items: Order[];
    total: number;
    skip: number;
    limit: number;
}

export interface AdminOrdersListParams {
    skip?: number;
    limit?: number;
    codigo?: string;
    plataforma?: string;
    restaurant_nombre?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
}

export interface DeliveryMetricsRowApi {
    group: string;
    total: number;
    active: number;
    delivered: number;
    canceled: number;
    returned: number;
    matched: number;
    bags: number;
    avg_create_to_ready: number | null;
    avg_ready_to_match: number | null;
    avg_match_to_pickup: number | null;
    avg_pickup_to_delivered: number | null;
    avg_ready_to_delivered: number | null;
}

export interface DeliveryMetricsResponse {
    fecha_desde: string;
    fecha_hasta: string;
    total_orders_in_range: number;
    total_filtered: number;
    summary: DeliveryMetricsRowApi;
    rows: DeliveryMetricsRowApi[];
    filter_options: {
        estado: string[];
        locatario: string[];
        plataforma: string[];
        driver: string[];
        runner: string[];
    };
    drivers_live: {
        esperando: number;
        en_match: number;
        total: number;
    };
}

export interface DeliveryMetricsParams {
    fecha_desde: string;
    fecha_hasta: string;
    dimension?: string;
    estado?: string;
    locatario?: string;
    plataforma?: string;
    driver?: string;
    runner?: string;
}

function authHeaders(token: string | null, auditSource?: string) {
    const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    if (auditSource) h[DELIVERY_AUDIT_HEADER] = auditSource;
    return h;
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

    async getControlSnapshot(token: string) {
        const res = await axios.get<ControlSnapshot>(`${API_URL}/delivery/control/snapshot`, { headers: authHeaders(token) });
        return res.data;
    },

    async getControlSnapshotMock(token: string) {
        const res = await axios.get<ControlSnapshot>(`${API_URL}/delivery/control/snapshot/mock`, { headers: authHeaders(token) });
        return res.data;
    },

    async getControlAuditLog(token: string, limit = 50) {
        const res = await axios.get<ControlAuditList>(`${API_URL}/delivery/control/audit`, {
            headers: authHeaders(token),
            params: { limit },
        });
        return res.data;
    },

    async getControlAuditMock(token: string) {
        const res = await axios.get<ControlAuditList>(`${API_URL}/delivery/control/audit/mock`, {
            headers: authHeaders(token),
        });
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

    async manualMatch(token: string, orderId: number, payload: ManualMatchIn, auditSource?: string) {
        const res = await axios.post(`${API_URL}/delivery/orders/${orderId}/manual-match`, payload, {
            headers: authHeaders(token, auditSource),
        });
        return res.data;
    },

    async adminListAllOrders(token: string, params: AdminOrdersListParams = {}) {
        const res = await axios.get<PaginatedOrders>(`${API_URL}/delivery/admin/orders`, {
            headers: authHeaders(token),
            params,
        });
        return res.data;
    },

    async adminListOrdersByStatus(token: string, status: string, params: AdminOrdersListParams = {}) {
        const res = await axios.get<PaginatedOrders>(
            `${API_URL}/delivery/admin/orders/by-status/${encodeURIComponent(status)}`,
            {
                headers: authHeaders(token),
                params,
            }
        );
        return res.data;
    },

    /** Métricas agregadas en servidor (Dashboard Delivery; sin traer pedidos al cliente). */
    async adminGetMetrics(token: string, params: DeliveryMetricsParams) {
        const query: Record<string, string> = {
            fecha_desde: params.fecha_desde,
            fecha_hasta: params.fecha_hasta,
            dimension: params.dimension ?? 'estado',
        };
        if (params.estado) query.estado = params.estado;
        if (params.locatario) query.locatario = params.locatario;
        if (params.plataforma) query.plataforma = params.plataforma;
        if (params.driver) query.driver = params.driver;
        if (params.runner) query.runner = params.runner;
        const res = await axios.get<DeliveryMetricsResponse>(`${API_URL}/delivery/admin/metrics`, {
            headers: authHeaders(token),
            params: query,
        });
        return res.data;
    },

    async adminMarkDevolucion(token: string, orderId: number, auditSource?: string) {
        const res = await axios.post<Order>(`${API_URL}/delivery/admin/orders/${orderId}/mark-devolucion`, null, {
            headers: authHeaders(token, auditSource),
        });
        return res.data;
    },

    async adminForceEntregado(token: string, orderId: number, payload: AdminForceEntregadoIn, auditSource?: string) {
        const res = await axios.post<Order>(
            `${API_URL}/delivery/admin/orders/${orderId}/force-entregado`,
            payload,
            { headers: authHeaders(token, auditSource) }
        );
        return res.data;
    },

    async adminCancelOrder(token: string, orderId: number, payload: AdminCancelIn, auditSource?: string) {
        const res = await axios.post<Order>(`${API_URL}/delivery/admin/orders/${orderId}/cancel`, payload, {
            headers: authHeaders(token, auditSource),
        });
        return res.data;
    },

    async adminUnlockOrder(token: string, orderId: number, payload: AdminUnlockIn, auditSource?: string) {
        const res = await axios.post<Order>(`${API_URL}/delivery/admin/orders/${orderId}/unlock`, payload, {
            headers: authHeaders(token, auditSource),
        });
        return res.data;
    },

    async adminUpdateOrder(token: string, orderId: number, payload: AdminOrderUpdateIn, auditSource?: string) {
        const res = await axios.patch<Order>(`${API_URL}/delivery/admin/orders/${orderId}`, payload, {
            headers: authHeaders(token, auditSource),
        });
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

