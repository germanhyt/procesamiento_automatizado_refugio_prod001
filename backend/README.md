# Backend Refugio Data

API **FastAPI** del sistema documentado en el [README del repositorio](../README.md).

---

## Desarrollo local

Requiere PostgreSQL accesible y variables de entorno (base de datos, JWT, integraciones según módulos activos).

```bash
# Desde backend/
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
python main.py
```

Por defecto el servicio escucha en `http://0.0.0.0:8080`. La raíz responde con estado; las rutas de negocio van bajo `/api/*`.

---

## Routers principales

Ver tabla en el [README principal](../README.md) (auth, fuentes, procesamiento, users, powerbi, delivery).

## Pipeline legacy (procesamiento de ventas)

Documentación detallada en `docs/`:

- [PROCESAMIENTO_FLUJO_ACTUAL.md](../docs/PROCESAMIENTO_FLUJO_ACTUAL.md) — pasos 1–4, staging, API
- [PROCESAMIENTO_CAMBIOS_REFACTOR.md](../docs/PROCESAMIENTO_CAMBIOS_REFACTOR.md) — fases 1–5 del refactor
- [PROCESAMIENTO_OPERACION.md](../docs/PROCESAMIENTO_OPERACION.md) — scripts, `.env`, tests

---

## Docker

Imagen y volúmenes definidos en el `Dockerfile` de este directorio y en `docker-compose.yml` en la raíz del repositorio.
