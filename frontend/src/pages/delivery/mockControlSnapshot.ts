/**
 * Mock del centro de control (UI + fallback offline).
 * Mantener alineado con backend/app/services/delivery_control_mock.py
 */
import type { ControlAuditList, ControlSnapshot } from '@/services/deliveryService';

const now = () => new Date().toISOString();
const ts = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const operationalDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/** Solo en desarrollo y solo si se fuerza con VITE_DELIVERY_CONTROL_USE_MOCK=true. */
export function isControlDemoDefaultEnabled(): boolean {
    if (import.meta.env.PROD) return false;
    return import.meta.env.VITE_DELIVERY_CONTROL_USE_MOCK === 'true';
}

/** Checkbox «Datos de prueba» solo en desarrollo local. */
export function isControlDemoUiVisible(): boolean {
    return import.meta.env.DEV && import.meta.env.VITE_DELIVERY_CONTROL_USE_MOCK !== 'false';
}

function buildDrivers() {
    const driverWaiting = {
        id: 901,
        plataforma: 'RAPPI',
        codigo_ingresado: 'MOCK901',
        placa: 'ABC-123',
        alias_conductor: 'Juan P.',
        estado: 'ESPERANDO' as const,
        matched_order_id: null,
        restaurant_id: 1,
        restaurant_nombre: 'Barrio Máncora',
        conductor_documento_tipo: 'DNI',
        conductor_dni: '12345678',
        conductor_carne_extranjeria: null,
        conductor_nombre_completo: 'Juan Pérez Mock',
        foto_path: null,
        foto_mime: null,
        foto_uploaded_at: null,
        created_at: ts(18),
        updated_at: ts(18),
        estado_changed_at: ts(18),
        atendido_at: null,
        despachado_at: null,
    };

    const driverMatched = {
        ...driverWaiting,
        id: 902,
        codigo_ingresado: 'MOCK902',
        placa: 'XYZ-999',
        alias_conductor: 'María L.',
        estado: 'EN_MATCH' as const,
        matched_order_id: 102,
        conductor_nombre_completo: 'María López Mock',
        created_at: ts(12),
        updated_at: ts(8),
        estado_changed_at: ts(8),
        atendido_at: ts(8),
    };

    return { driverWaiting, driverMatched };
}

export function buildLocalControlSnapshotMock(): ControlSnapshot {
    const { driverWaiting, driverMatched } = buildDrivers();

    const orders: ControlSnapshot['orders'] = [
        {
            id: 101,
            restaurant_id: 1,
            restaurant_nombre: 'Barrio Máncora',
            plataforma: 'RAPPI',
            codigo_pedido: 'R-4401',
            estado: 'LISTO',
            numero_bolsas: 2,
            locked_by_runner_id: null,
            locked_by_runner_username: null,
            matched_driver_arrival_id: null,
            matched_driver_arrival: null,
            created_at: ts(22),
            updated_at: ts(22),
            estado_changed_at: ts(22),
            listo_at: ts(22),
            match_at: null,
            recogido_at: null,
            entregado_at: null,
            cancelado_at: null,
            devolucion_at: null,
        },
        {
            id: 102,
            restaurant_id: 1,
            restaurant_nombre: 'Barrio Máncora',
            plataforma: 'PEDIDOSYA',
            codigo_pedido: 'PY-7788',
            estado: 'LISTO_PARA_ENTREGAR',
            numero_bolsas: 1,
            locked_by_runner_id: 3,
            locked_by_runner_username: 'runner.demo',
            matched_driver_arrival_id: 902,
            matched_driver_arrival: driverMatched,
            created_at: ts(40),
            updated_at: ts(8),
            estado_changed_at: ts(8),
            listo_at: ts(35),
            match_at: ts(8),
            recogido_at: ts(15),
            entregado_at: null,
            cancelado_at: null,
            devolucion_at: null,
        },
        {
            id: 103,
            restaurant_id: 2,
            restaurant_nombre: 'Sushi Lab',
            plataforma: 'RAPPI',
            codigo_pedido: 'R-9912',
            estado: 'PENDIENTE_RECOJO',
            numero_bolsas: 3,
            locked_by_runner_id: 4,
            locked_by_runner_username: 'runner.b',
            matched_driver_arrival_id: null,
            matched_driver_arrival: null,
            created_at: ts(50),
            updated_at: ts(16),
            estado_changed_at: ts(16),
            listo_at: ts(45),
            match_at: null,
            recogido_at: null,
            entregado_at: null,
            cancelado_at: null,
            devolucion_at: null,
        },
        {
            id: 104,
            restaurant_id: 2,
            restaurant_nombre: 'Sushi Lab',
            plataforma: 'CIRCUIT',
            codigo_pedido: 'C-2200',
            estado: 'PROCESO_ENTREGA',
            numero_bolsas: 1,
            locked_by_runner_id: 3,
            locked_by_runner_username: 'runner.demo',
            matched_driver_arrival_id: null,
            matched_driver_arrival: null,
            created_at: ts(28),
            updated_at: ts(5),
            estado_changed_at: ts(5),
            listo_at: ts(25),
            match_at: null,
            recogido_at: ts(6),
            entregado_at: null,
            cancelado_at: null,
            devolucion_at: null,
        },
    ];

    const alerts: ControlSnapshot['alerts'] = [
        {
            type: 'ORDER_NO_RUNNER',
            order_id: 101,
            driver_arrival_id: null,
            minutes: 22,
            severity: 'critical',
            message: 'Pedido #101 sin runner asignado (22 min en LISTO)',
        },
        {
            type: 'ORDER_LISTO_NO_MATCH',
            order_id: 101,
            driver_arrival_id: null,
            minutes: 22,
            severity: 'critical',
            message: 'Pedido #101 LISTO sin match (22 min)',
        },
        {
            type: 'MATCH_NO_DELIVERY',
            order_id: 102,
            driver_arrival_id: 902,
            minutes: 28,
            severity: 'critical',
            message: 'Pedido #102 con match sin entrega (28 min)',
        },
        {
            type: 'DRIVER_WAITING_LONG',
            order_id: null,
            driver_arrival_id: 901,
            minutes: 18,
            severity: 'warning',
            message: 'Driver #901 en ESPERANDO (18 min)',
        },
    ];

    const orderIdsWithAlerts = new Set(alerts.map((a) => a.order_id).filter((id): id is number => id != null));

    return {
        operational_day: operationalDay(),
        orders,
        drivers: [driverWaiting, driverMatched],
        alerts,
        counts: {
            orders_active: orders.length,
            orders_with_runner: orders.filter((o) => o.locked_by_runner_id != null).length,
            orders_matched: orders.filter((o) => o.matched_driver_arrival_id != null).length,
            orders_with_alerts: orderIdsWithAlerts.size,
            drivers_esperando: 1,
            drivers_en_match: 1,
            drivers_total: 2,
            alerts_total: alerts.length,
        },
        generated_at: now(),
        mock: true,
    };
}

export function buildLocalControlAuditMock(): ControlAuditList {
    const items: ControlAuditList['items'] = [
        {
            id: 9001,
            user_id: 1,
            username: 'admin.demo',
            action: 'UNLOCK',
            source: 'control_center',
            order_id: 103,
            driver_arrival_id: null,
            detail: 'Runner no respondía — mock',
            created_at: ts(45),
        },
        {
            id: 9002,
            user_id: 1,
            username: 'admin.demo',
            action: 'MANUAL_MATCH',
            source: 'control_center',
            order_id: 102,
            driver_arrival_id: 902,
            detail: 'manual_match driver=902',
            created_at: ts(120),
        },
        {
            id: 9003,
            user_id: 2,
            username: 'supervisor.demo',
            action: 'FORCE_ENTREGADO',
            source: 'admin_panel',
            order_id: 99,
            driver_arrival_id: null,
            detail: 'Cliente retiró en mostrador | mock',
            created_at: ts(180),
        },
    ];
    return { items, total: items.length };
}
