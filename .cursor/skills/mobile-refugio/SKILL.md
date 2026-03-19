---
name: mobile-refugio
description: Desarrolla y mantiene las apps móviles Expo del módulo Delivery (kiosk SUNMI y runner). Usar al trabajar en mobile/, apps/kiosk, apps/runner, packages compartidos, o integración con la API delivery.
---

# Mobile Refugio (Expo)

Experto en el monorepo Expo del módulo Delivery. Respetar estructura de apps y packages compartidos.

## Estructura

| Ruta | Descripción |
|------|-------------|
| `apps/kiosk` | APK para dispositivo público SUNMI K2: registro de drivers |
| `apps/runner` | APK privada para runners (acceso por PIN) |
| `packages/constants` | Estados de pedido/driver, permisos |
| `packages/delivery-api` | Cliente HTTP y funciones de API |
| `packages/hooks` | useDeliveryWS |
| `packages/ui` | Componentes compartidos |

## Apps

- **Kiosk:** Registro de drivers (código, placa, plataforma); NumPad, constantes en `constants/kiosk.ts`
- **Runner:** Acceso por PIN; flujo de pedidos para runners

## Comandos

```bash
# Desde mobile/
yarn kiosk        # Desarrollo kiosk
yarn runner       # Desarrollo runner
yarn kiosk:web    # Kiosk en navegador
yarn runner:web   # Runner en navegador
```

## Variables de entorno

- `EXPO_PUBLIC_API_URL` – URL de la API
- `EXPO_PUBLIC_WS_URL` – WebSocket
- Archivos: `apps/kiosk/.env`, `apps/runner/.env`

## Convenciones

- **Workspaces:** Yarn workspaces (`apps/*`, `packages/*`)
- **Constantes:** `packages/constants/src/delivery.ts` alineado con backend
- **API:** Usar `@refugio/delivery-api` para llamadas HTTP
- **Hooks:** `@refugio/hooks` para useDeliveryWS
- **Colores:** `constants/Colors.ts` (light/dark, tint, text, background)

## Buenas prácticas

1. **Código compartido:** Evitar duplicación; usar packages
2. **Constantes:** Sincronizar con backend y frontend
3. **Diseño:** UX/UI minimalista, intuitivo, acorde al logo
4. **Manejo de errores:** Modular y claro para el usuario
