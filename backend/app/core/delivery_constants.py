"""
Constantes del módulo delivery.
Centraliza estados, headers y defaults para evitar hardcodeos en routers/servicios.
"""

# Estados de pedido (orders.estado)
ORDER_STATUS_LISTO = "LISTO"
ORDER_STATUS_PENDIENTE_RECOJO = "PENDIENTE_RECOJO"
ORDER_STATUS_PROCESO_ENTREGA = "PROCESO_ENTREGA"
ORDER_STATUS_LISTO_PARA_ENTREGAR = "LISTO_PARA_ENTREGAR"
ORDER_STATUS_ENTREGADO = "ENTREGADO"
ORDER_STATUS_DEVOLUCION = "DEVOLUCION"
ORDER_STATUS_CANCELADO = "CANCELADO"

# Pedido terminal: permite nuevo ciclo con la misma tripleta (webhook Fidelio).
ORDER_TERMINAL_STATUSES = (
    ORDER_STATUS_ENTREGADO,
    ORDER_STATUS_CANCELADO,
    ORDER_STATUS_DEVOLUCION,
)

# reception.tipo en respuesta webhook Fidelio (español)
FIDELIO_RECEPTION_KIND_CREATED = "creado"
FIDELIO_RECEPTION_KIND_DUPLICATE = "duplicado"
FIDELIO_RECEPTION_KIND_NEW_CYCLE = "nuevo_ciclo"


# Estados de driver (driver_arrivals.estado)
DRIVER_STATUS_ESPERANDO = "ESPERANDO"
DRIVER_STATUS_EN_MATCH = "EN_MATCH"
DRIVER_STATUS_DESPACHADO = "DESPACHADO"
DRIVER_STATUS_ABANDONO = "ABANDONO"

# Documento conductor (kiosk)
DRIVER_DOCUMENTO_TIPO_DNI = "DNI"
DRIVER_DOCUMENTO_TIPO_CE = "CE"


# Seguridad webhook
FIDELIO_API_KEY_ENV = "FIDELIO_API_KEY"


# Defaults / límites operativos
DEFAULT_QUERY_LIMIT = 500
ADMIN_ORDERS_MAX_DATE_RANGE_DAYS = 366
MATCH_CANDIDATES_LIMIT = 200


# Fuzzy matching
# Umbral sugerido por specs: 85% (puedes subirlo a 90% si hay falsos positivos)
FUZZY_MATCH_THRESHOLD = 85


# Timeouts (minutos)
# Según tu ajuste: ambos (pedido y driver) usan 30 min.
ORDER_TIMEOUT_MINUTES = 30
DRIVER_TIMEOUT_MINUTES = 30

# Push (Expo) — app móvil Runner
RUNNER_PUSH_APP_SLUG = "runner"
# URL pública fija del Push API v2 de Expo (no sale del .env). Documentación:
# https://docs.expo.dev/push-notifications/sending-notifications/
EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"
RUNNER_PUSH_ANDROID_CHANNEL_ID = "delivery-runner"
# `data.type` en el payload Expo (el Runner puede filtrar por esto además de `order_id`).
RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO = "PEDIDO_LISTO"
RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO = "NUEVO_DRIVER_ESPERANDO"
# Pedido enlazado con driver en kiosko (match automático o manual).
RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH = "KIOSK_MATCH"

# Permisos delivery (tabla `permissions.codename`; alineados con patch_db_delivery).
# Kiosk DNI/foto: sin codename de uso en dispositivo; solo flags en `delivery_config` y
# admin `delivery:admin` / `delivery:settings:update` (ver tests test_delivery_kiosk_runner_permissions).
PERMISSION_DELIVERY_OPERATE = "delivery:operate"
PERMISSION_DELIVERY_SIMULATE_ORDER_READY = "delivery:simulate_order_ready"
