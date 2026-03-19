# Build de APK (Kiosk / Runner) e instalación interna

Guía para generar APK de las apps **Expo** del módulo Delivery (`mobile/apps/kiosk`, `mobile/apps/runner`), configurar **iconos**, y **distribuir entre compañeros** sin publicar en Play Store.

---

## 1. Requisitos previos

| Requisito | Notas |
|-----------|--------|
| Node.js LTS (20+) y Yarn v1 | Ya usados en el monorepo |
| Cuenta [Expo](https://expo.dev) (gratuita) | Necesaria si usas **EAS Build** (recomendado) |
| Android Studio + JDK 17 | Solo si haces **build local** con Gradle |
| `.env` de producción por app | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL` apuntando a la API real (HTTPS/WSS) |

Trabajar siempre desde la carpeta del monorepo móvil:

```bash
cd mobile
yarn install
```

---

## 2. Icono y recursos visuales

Las rutas están en `app.json` de cada app (kiosk y runner por separado).

### 2.1 Icono principal (`icon`)

- **Archivo:** `apps/<kiosk|runner>/assets/images/icon.png`
- **Recomendado:** PNG cuadrado **1024×1024 px**, sin transparencia (iOS no la usa bien en el icono principal).

Sustituye el archivo manteniendo el **mismo nombre** o actualiza la ruta en `expo.icon` dentro de `app.json`.

### 2.2 Icono adaptativo Android (`adaptiveIcon`)

En `app.json` → `expo.android.adaptiveIcon`:

| Campo | Archivo actual (ejemplo) | Uso |
|--------|---------------------------|-----|
| `foregroundImage` | `android-icon-foreground.png` | Logo/símbolo (zona segura ~66% del círculo) |
| `backgroundImage` | `android-icon-background.png` | Fondo (opcional si usas solo `backgroundColor`) |
| `backgroundColor` | `#E6F4FE` | Color de fondo si no hay imagen de fondo |
| `monochromeImage` | `android-icon-monochrome.png` | Temas monocromáticos en Android 13+ (opcional) |

**Foreground:** típicamente **1024×1024** con el dibujo centrado y margen. **Background:** puede ser color sólido o imagen.

### 2.3 Splash y favicon (web)

- Splash: `assets/images/splash-icon.png` + `splash.backgroundColor` en `app.json`
- Web: `assets/images/favicon.png`

Tras cambiar imágenes, en el siguiente build nativo los iconos se regeneran solos (EAS o `prebuild`).

---

## 3. Identificador de app y versión (obligatorio antes de distribuir)

Cada APK debe tener un **package Android único** para poder instalar kiosk y runner en el mismo dispositivo y evitar conflictos.

En `apps/kiosk/app.json` y `apps/runner/app.json`, dentro de `expo`, añade o revisa:

```json
"android": {
  "package": "com.tuorg.refugio.delivery.kiosk",
  "versionCode": 1
}
```

y en runner, por ejemplo:

```json
"android": {
  "package": "com.tuorg.refugio.delivery.runner",
  "versionCode": 1
}
```

- Sustituye `com.tuorg.refugio...` por el dominio invertido de tu organización.
- **`version`:** string visible al usuario (ej. `"1.0.0"`).
- **`versionCode`:** entero que **debe subir** en cada APK nueva que quieras que Android reconozca como actualización.

---

## 4. Variables de entorno en el APK

Los valores de `apps/kiosk/.env` y `apps/runner/.env` se **incrustan en el bundle en tiempo de build** (`EXPO_PUBLIC_*`).

Antes de generar el APK de producción:

1. Pon la URL **pública** de la API, por ejemplo:
   - `EXPO_PUBLIC_API_URL=https://api.tudominio.com`
   - `EXPO_PUBLIC_WS_URL=wss://api.tudominio.com`  
   (ajusta rutas si tu backend usa prefijos distintos.)

2. Vuelve a ejecutar el build después de cualquier cambio en `.env`.

---

## 5. Opción A — Build en la nube con EAS (recomendado)

No necesitas Android Studio en tu PC para obtener el APK.

### 5.1 Instalar CLI e iniciar sesión

```bash
npm install -g eas-cli
eas login
```

### 5.2 Configurar el proyecto por app

Desde la raíz de **cada** app (kiosk y runner):

```bash
cd mobile/apps/kiosk
eas build:configure
```

Repite:

```bash
cd mobile/apps/runner
eas build:configure
```

Esto crea `eas.json`. Para **APK** (instalación directa), usa un perfil con `buildType: "apk"`.

Ejemplo de `eas.json`:

```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### 5.3 Lanzar el build

```bash
# Kiosk
cd mobile/apps/kiosk
eas build -p android --profile preview

# Runner
cd mobile/apps/runner
eas build -p android --profile preview
```

Al terminar, Expo muestra un **enlace de descarga** del `.apk`. También lo encuentras en [expo.dev](https://expo.dev) → tu proyecto → Builds.

### 5.4 Credenciales de firma

La primera vez, EAS puede generar y guardar un **keystore** en la nube (opción habitual). Eso firma el APK para que Android permita instalaciones y actualizaciones coherentes. **Respalda** lo que Expo te indique respecto a credenciales si piensas mantener la misma app años.

---

## 6. Opción B — Build local (Gradle)

Útil si debes compilar sin subir código a Expo o para depurar el proyecto nativo.

### 6.1 Generar carpeta `android/`

```bash
cd mobile/apps/kiosk
npx expo prebuild --platform android
```

(En runner, el mismo comando desde `mobile/apps/runner`.)

### 6.2 Compilar release

**Linux / macOS / Git Bash:**

```bash
cd android
./gradlew assembleRelease
```

**Windows (CMD/PowerShell desde `android/`):**

```cmd
gradlew.bat assembleRelease
```

El APK suele quedar en:

`android/app/build/outputs/apk/release/app-release.apk`

Para firma de release local necesitas configurar **signing** en Gradle (keystore propio). Si no, usa EAS para evitar ese paso.

---

## 7. Distribución a compañeros (sin Play Store)

### 7.1 Quién prepara el paquete

1. Genera el APK con el perfil y `.env` correctos (secciones 4–6).
2. Renombra el archivo para que sea claro, por ejemplo:  
   `Refugio-Kiosk-1.0.0.apk`, `Refugio-Runner-1.0.0.apk`.
3. Opcional: sube el SHA-256 del archivo a un canal interno para que puedan comprobar integridad.

### 7.2 Compartir el archivo

Elige un canal **privado** de la empresa:

- Drive / SharePoint / Teams (enlace solo a personas autorizadas)
- Repositorio interno o artefactos de CI
- **No** uses enlaces públicos sin contraseña si la app accede a datos sensibles

### 7.3 Instrucciones para el compañero (paso a paso)

1. **Descargar** el APK al teléfono (o pasarlo por USB).
2. Abrir el archivo desde el gestor de descargas o de archivos.
3. Si Android bloquea la instalación:
   - **Ajustes → Seguridad / Apps especiales → Instalar apps desconocidas** (el nombre varía según marca/Android).
   - Permitir el navegador o la app desde la que abrió el APK (Chrome, Files, etc.).
4. Aceptar **Instalar**.
5. Si ya existía una versión anterior **con el mismo `package` y un `versionCode` mayor**, Android ofrecerá **Actualizar**; si cambiaste el package, se instalará como otra app.
6. Abrir la app y comprobar que llega a la API (Wi‑Fi/datos y URL correctas en el build).

### 7.4 SUNMI / kiosco

En dispositivos tipo **SUNMI**, el flujo es el mismo: permitir instalación desde la fuente que uses (navegador, gestor de archivos o MDM interno). Si la empresa usa **MDM**, suele ser mejor subir el APK al MDM e instalar de forma remota en lugar de “orígenes desconocidos” manual.

### 7.5 Actualizaciones

- Sube **`versionCode`** (y opcionalmente `version`) en `app.json` en cada entrega.
- Comunica en el canal interno: *qué cambió* y *obligatorio actualizar o no*.
- Conserva copias de APK anteriores por si hay que revertir.

---

## 8. Checklist rápido antes de un release interno

- [ ] Iconos y splash actualizados en `assets/images/`
- [ ] `android.package` distinto entre kiosk y runner
- [ ] `version` y `versionCode` actualizados
- [ ] `.env` con URLs de producción (HTTPS/WSS)
- [ ] Build ejecutado después de cambiar `.env` o `app.json`
- [ ] APK probado en al menos un dispositivo físico
- [ ] Instrucciones de instalación compartidas con el equipo

---

## Referencias en el repo

- Comandos de desarrollo: [COMMANDS.md](./COMMANDS.md) → *Aplicación móvil*
- Iteraciones delivery: [ITERATIONS_DELIVERY.md](./ITERATIONS_DELIVERY.md)
