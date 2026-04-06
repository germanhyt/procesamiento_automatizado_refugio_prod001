# Refugio Mobile (Expo)

Apps móviles del módulo **Delivery** (kiosk público y app de runners). Repositorio compartido con el sistema web de procesamiento y Big Query documentado en el [README principal](../README.md); la API que consumen estas apps es la que definas en `EXPO_PUBLIC_API_URL` (puede ser la misma instancia FastAPI u otra).

---

## Contenido

1. [Estructura](#estructura)
2. [Requisitos](#requisitos)
3. [Variables de entorno y perfiles EAS](#variables-de-entorno-y-perfiles-eas)
4. [Ejecución](#ejecución)
5. [EAS Build (referencia rápida)](#eas-build-referencia-rápida)

---

## Estructura

| Ruta | Descripción |
|------|-------------|
| `apps/kiosk` | APK orientada a dispositivo público (SUNMI K2): registro de drivers. |
| `apps/runner` | APK privada para runners (acceso por PIN). |
| `packages/*` | Código compartido: constants, tipos, hooks, UI. |

---

## Requisitos

- Node.js LTS
- Yarn v1
- Android Studio, emulador o dispositivo Android (para builds nativos)

---

## Variables de entorno y perfiles EAS

Dos canales independientes (no se mezclan):

| Canal | Qué lee | Uso |
|--------|---------|-----|
| **Metro / Expo Go** | `apps/kiosk/.env` o `apps/runner/.env` | `yarn kiosk`, `yarn runner`, Expo Go / emulador |
| **EAS Build** | `apps/<app>/eas.json` → `build.<perfil>.env` | APK/AAB generados en la nube; **no** usan tu `.env` local |

En código (`@refugio/delivery-api`), si faltan `EXPO_PUBLIC_*`, el fallback es `localhost:8080`. En un móvil o emulador, **localhost es el propio dispositivo**; por eso para API en tu PC se usa **`10.0.2.2`** (emulador Android) o **IP LAN** (físico).

### Expo Go o emulador con API local

1. `cp apps/runner/.env.example apps/runner/.env` (y/o la misma ruta en `kiosk`).
2. Activa el bloque **A** (`10.0.2.2:8080`) para AVD, o **B** (IP de tu PC) para físico en la misma Wi‑Fi.
3. Backend con `host 0.0.0.0` y puerto `8080`.
4. `yarn runner` o `yarn kiosk` y abrir el proyecto en **Expo Go**. Las variables vienen solo del `.env`.

### Perfiles EAS (kiosk y runner — mismos nombres en ambos)

| Perfil | Artefacto | API embebida | Cuándo usarlo |
|--------|-----------|--------------|----------------|
| `development-emulator` | APK interno | `http://10.0.2.2:8080` | APK instalado **solo en emulador**; apunta al backend del host |
| `development-device` | APK interno | `http://192.168.1.50:8080` | APK en **móvil físico**; **edita** IP/puerto en `eas.json` antes del build |
| `preview` | APK interno | HTTPS producción | Entrega interna con API real (igual que antes) |
| `production` | **App Bundle (.aab)** | HTTPS producción | **Solo** subir a Play Console con `eas submit`; **no** se instala el `.aab` a mano |
| `production-apk` | APK interno | HTTPS producción | Mismo entorno que `production`, pero **APK** para instalar sin Play Store |

**Por qué `production` “no funcionaba” y `preview` sí:** `production` genera **.aab** (obligatorio para Play Store), no un APK instalable con un toque. Para un paquete “de producción” que quieras pasar por Drive/MDM, usa **`production-apk`** o sigue usando **`preview`** (mismas URLs en este repo).

Archivos de apoyo: `apps/*/eas.json`, `apps/*/.env.example`.

### Notificaciones push (Runner)

- **Expo Go + `.env`**: útil para iterar si el dispositivo alcanza tu API; el token depende del proyecto Expo / desarrollo.
- **APK** (`preview`, `production-apk`, `development-*`): comportamiento más cercano a despliegue real y canal `expo-notifications`.

---

## Ejecución

Desde el directorio `mobile/`:

```bash
yarn kiosk
# o
yarn runner
```

Iteración en navegador:

```bash
yarn kiosk:web
yarn runner:web
```

---

## EAS Build (referencia rápida)

Desde `mobile/` (cambia `runner` por `kiosk` si aplica):

| Objetivo | Comando |
|----------|---------|
| APK desarrollo (emulador → API en tu PC) | `yarn eas:runner:development-emulator` |
| APK desarrollo (editar IP en `eas.json` antes) | `yarn eas:runner:development-device` |
| APK interno, API producción | `yarn eas:runner:preview` |
| AAB para Play Store | `yarn eas:runner:production` luego `eas submit` desde la app |
| APK con API producción (sin Store) | `yarn eas:runner:production-apk` |

Equivalente manual: `cd apps/runner && eas build --platform android --profile <perfil>`.

---

*Ver [README principal](../README.md) para arquitectura del sistema web, Docker y Big Query.*
