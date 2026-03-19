---
name: frontend-refugio
description: Desarrolla y mantiene el SPA React + Vite + TypeScript del sistema Refugio Data. Usar al trabajar en frontend/, componentes, páginas, rutas, servicios HTTP, AuthContext, o integración con la API.
---

# Frontend Refugio Data

Experto en el SPA React + Vite + TypeScript. Respetar arquitectura, estilos y patrones del proyecto.

## Arquitectura

| Elemento | Ubicación | Descripción |
|----------|-----------|-------------|
| **Componentes** | `src/components/layout/` | MainLayout, StatCard, StatusBadge |
| **UI** | `src/components/ui/` | AppSelect (react-select tema-aware) |
| **Páginas** | `src/pages/` | Login, Welcome, FuentesDatos, LegacyFlow, PowerBIDashboard, UserManagement, DeliveryPanel |
| **Rutas** | `src/router/AppRoutes.tsx` | React Router; rutas públicas/privadas con MainLayout |
| **Servicios** | `src/services/` | Cliente HTTP para API (ej. deliveryService.ts) |
| **Constantes** | `src/constants/` | locatarios.ts, delivery.ts (alineados con backend) |
| **Context** | `src/context/AuthContext.tsx` | Autenticación global |
| **Hooks** | `src/hooks/` | useDelivery, useDeliveryWS |

## Rutas

- `/login` – Público
- `/fuentes` – Público
- `/bienvenida`, `/legacy`, `/powerbi`, `/users` – Privadas con layout
- `/delivery` – Privada con permiso `delivery:view`

## Convenciones

- **Layout:** MainLayout (sidebar + header); rutas privadas con PrivateRoute
- **Auth:** AuthContext + useAuth; verificación de permisos en PrivateRoute
- **Constantes:** Usar `constants/locatarios.ts` y `constants/delivery.ts`; sincronizar con backend
- **Variables:** `VITE_API_URL`, `VITE_WS_URL` en `.env`; build arg en Docker

## Estilos (ver skill ui-ux-refugio)

- Variables: `--color-refugio-*` en `index.css`
- Clases: `text-refugio-muted`, fondos oscuros `bg-[#050505]`, `bg-zinc-950`
- Badges: `orderStatusBadgeClass()` en `constants/delivery.ts`

## Buenas prácticas

1. **Sin hardcodeos:** Constantes en `constants/`
2. **Componentes:** Reutilizables; props tipadas con TypeScript
3. **Servicios:** Centralizar llamadas HTTP; manejo de errores consistente
4. **React Query:** Usar `@tanstack/react-query` para fetching y cache
5. **Diseño:** UX/UI minimalista, intuitivo, acorde al logo (ver ui-ux-refugio)
