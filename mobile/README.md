# Refugio Mobile (Expo)

Apps móviles del módulo **Delivery** (kiosk público y app de runners). Repositorio compartido con el sistema web de procesamiento y Big Query documentado en el [README principal](../README.md); la API que consumen estas apps es la que definas en `EXPO_PUBLIC_API_URL` (puede ser la misma instancia FastAPI u otra).

---

## Contenido

1. [Estructura](#estructura)
2. [Requisitos](#requisitos)
3. [Variables de entorno](#variables-de-entorno)
4. [Ejecución](#ejecución)

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

## Variables de entorno

Expo expone variables con prefijo `EXPO_PUBLIC_`.

Archivos por app (ejemplo):

- `apps/kiosk/.env`
- `apps/runner/.env`

Ejemplo de contenido:

```
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_WS_URL=ws://localhost:8080
```

Ajustar URLs al entorno (desarrollo, staging, producción).

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

*Ver [README principal](../README.md) para arquitectura del sistema web, Docker y Big Query.*
