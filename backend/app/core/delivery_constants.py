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


# Estados de driver (driver_arrivals.estado)
DRIVER_STATUS_ESPERANDO = "ESPERANDO"
DRIVER_STATUS_EN_MATCH = "EN_MATCH"
DRIVER_STATUS_DESPACHADO = "DESPACHADO"
DRIVER_STATUS_ABANDONO = "ABANDONO"


# Seguridad webhook
FIDELIO_API_KEY_ENV = "FIDELIO_API_KEY"


# Defaults / límites operativos
DEFAULT_QUERY_LIMIT = 500
MATCH_CANDIDATES_LIMIT = 200


# Fuzzy matching
# Umbral sugerido por specs: 85% (puedes subirlo a 90% si hay falsos positivos)
FUZZY_MATCH_THRESHOLD = 85


# Timeouts (minutos)
# Según tu ajuste: ambos (pedido y driver) usan 30 min.
ORDER_TIMEOUT_MINUTES = 30
DRIVER_TIMEOUT_MINUTES = 30
