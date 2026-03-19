---
name: delivery-refugio
description: Desarrolla y mantiene el módulo Delivery completo: API backend, frontend panel, apps kiosk y runner, WebSocket, estado de pedidos y drivers. Usar al trabajar en delivery, kiosk, runner, matching, Fidelio, o flujo de pedidos.
---

# Módulo Delivery Refugio

Experto en el módulo Delivery end-to-end: API, panel web, kiosk SUNMI, app runner, WebSocket, matching.

## Componentes

| Componente | Ubicación | Rol |
|------------|-----------|-----|
| **API** | `backend/app/api/delivery.py` | Endpoints CRUD, matching, webhook Fidelio |
| **Models** | `backend/app/models/delivery.py` | Order, DriverArrival, etc. |
| **Schemas** | `backend/app/schemas/delivery.py` | Pydantic |
| **Constantes** | `backend/app/core/delivery_constants.py` | Estados, timeouts, umbral fuzzy |
| **Panel Frontend** | `frontend/src/pages/delivery/DeliveryPanel.tsx` | Vista admin |
| **Kiosk** | `mobile/apps/kiosk/` | Registro de drivers |
| **Runner** | `mobile/apps/runner/` | App runners |
| **Packages** | `mobile/packages/delivery-api`, `hooks` | Cliente API, useDeliveryWS |

## Estados de pedido

- LISTO, PENDIENTE_RECOJO, PROCESO_ENTREGA, LISTO_PARA_ENTREGAR, ENTREGADO, DEVOLUCION, CANCELADO

## Estados de driver

- ESPERANDO, EN_MATCH, DESPACHADO, ABANDONO

## Constantes

- `ORDER_TIMEOUT_MINUTES`, `DRIVER_TIMEOUT_MINUTES` (30 min)
- `FUZZY_MATCH_THRESHOLD` (85%)
- `FIDELIO_API_KEY_ENV` para webhook

## Permisos

- `delivery:view` – Ver panel
- `delivery:operate` – Operar
- `delivery:admin` – Admin

## Sincronización

- Constantes en backend (`delivery_constants.py`), frontend (`constants/delivery.ts`), mobile (`packages/constants/src/delivery.ts`) deben estar alineadas

## Buenas prácticas

1. **Estados:** Usar constantes; nunca hardcodear strings
2. **Matching:** Fuzzy matching configurable; respetar umbral
3. **WebSocket:** useDeliveryWS para actualizaciones en tiempo real
4. **Permisos:** Verificar en PrivateRoute y en API
