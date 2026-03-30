# Notificaciones push — app Runner (interna)

## Alcance

- **Disparador actual**: driver en kiosko **sin match** inmediato (misma lógica que el evento WebSocket `NUEVO_DRIVER_ESPERANDO`).
- **Canal Android**: `delivery-runner` (debe coincidir con `RUNNER_PUSH_ANDROID_CHANNEL_ID` en backend).
- **Expo Push**: el backend envía a `https://exp.host/--/api/v2/push/send` con tokens registrados en `delivery_runner_push_tokens`.

## Requisitos

1. **Build de desarrollo o preview con EAS** (no cuenta Expo Go para producción real de FCM/APNs vía Expo).
2. **`extra.eas.projectId`** en `app.json` del Runner (ya configurado) — necesario para `getExpoPushTokenAsync`.
3. **Permisos** concedidos en el dispositivo (el hook solicita permiso tras login).
4. Usuario con permiso **`delivery:view`** (mismo criterio que el resto de endpoints Runner).

## Base de datos

Tras desplegar backend, ejecutar parche de tablas delivery (crea `delivery_runner_push_tokens` si no existe):

```bash
cd backend && python patch_db_delivery.py
```

## API

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/delivery/push/register` | Body: `expo_push_token`, `platform` (`android` / `ios`), `app_slug`: `runner` |
| POST | `/api/delivery/push/unregister` | Body opcional: `expo_push_token`; si se omite, desactiva todos los tokens del usuario |

## Cliente (Runner)

- Tras login, `useRunnerPushRegistration` registra el token y guarda el último en SecureStore.
- En **logout** se llama a unregister con ese token (y fallback sin token).
- Al tocar la notificación: si `data.order_id` existe, abre `/order/[id]`; si no, vuelve a `/(tabs)`.

## Prueba manual

1. Instalar APK/preview en dispositivo físico, iniciar sesión como operador con `delivery:view`.
2. Verificar en red/API que `POST .../push/register` responde 200.
3. Desde kiosk o `test_delivery_flow`, crear llegada **sin** pedido que matchee → debe llegar notificación y sonido (canal Android).
4. Cerrar sesión en Runner y comprobar que no quedan tokens activos esperados (opcional: inspección en BD).

## Límites y coste

- **Expo Push Service** no cobra por envío típico; aplican límites de tasa y buenas prácticas de la documentación de Expo.
- **EAS** puede tener límites según plan (builds, no el envío push en sí).



