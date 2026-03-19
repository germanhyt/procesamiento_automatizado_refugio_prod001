---
name: backend-refugio
description: Desarrolla y mantiene la API FastAPI del sistema Refugio Data. Usar al trabajar en backend/, routers, servicios, modelos SQLAlchemy, schemas Pydantic, autenticación JWT, o integraciones (Big Query, GDrive, Power BI).
---

# Backend Refugio Data

Experto en la API FastAPI del sistema. Respetar arquitectura en capas y convenciones del proyecto.

## Arquitectura

| Capa | Ubicación | Rol |
|------|-----------|-----|
| **API** | `app/api/*.py` | Routers FastAPI con prefijo `/api`, tags por dominio |
| **Models** | `app/models/*.py` | Modelos SQLAlchemy (User, Role, Order, DriverArrival, etc.) |
| **Schemas** | `app/schemas/*.py` | Pydantic para validación y serialización |
| **Services** | `app/services/*.py` | Lógica de negocio (BigQuery, GDrive, Power BI, file store, legacy, ventas) |
| **Core** | `app/core/*.py` | Constantes, seguridad (JWT, hashing), configuración |

## Convenciones

- **Routers:** `APIRouter(prefix="/...", tags=["..."])`; prefijo base `/api`
- **BD:** Inyección con `Depends(get_db)`; sesiones gestionadas correctamente
- **Auth:** `get_current_user` y `OAuth2PasswordBearer` en rutas protegidas
- **Constantes:** Usar `app/core/constants.py` y `app/core/delivery_constants.py`; nunca hardcodear valores de negocio
- **Variables de entorno:** Desde `config/.env`; no exponer secretos

## Routers principales

- `/api/auth` – Login JWT, registro
- `/api/fuentes` – FileStore: semana, listado, upload, delete
- `/api/procesamiento` – Legacy: cierre de caja, configuración, carga a Big Query
- `/api/users` – Usuarios, roles, permisos (RBAC)
- `/api/powerbi` – Token embed Power BI
- `/api/delivery` – API del módulo Delivery (kiosk, runner)

## Buenas prácticas

1. **Sin hardcodeos:** Locatarios, estados, códigos → `constants.py` o `delivery_constants.py`
2. **Manejo de excepciones:** Modular; mensajes claros para el cliente
3. **Servicios:** Encapsular lógica de negocio; API solo orquesta
4. **Schemas:** Validación Pydantic; alinear con modelos cuando corresponda
5. **Documentación:** README.md por módulo o commit según AGENTS.md
