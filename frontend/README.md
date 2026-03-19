# Frontend Refugio Data

SPA **React + Vite + TypeScript** del sistema descrito en el [README del repositorio](../README.md).

---

## Desarrollo local

```bash
yarn install
yarn dev
```

Variables: crear `.env` con `VITE_API_URL` apuntando al backend (p. ej. `http://localhost:8000/api`).

---

## Build de producción

```bash
yarn build
```

En Docker, la URL de la API se inyecta en build time vía `VITE_API_URL` (ver `Dockerfile` y `docker-compose.yml` en la raíz).

---

## Enlaces

- Arquitectura, rutas y despliegue: [README principal](../README.md)
- Plantilla base Vite: [documentación Vite](https://vite.dev) y [React](https://react.dev)
