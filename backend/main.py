from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from app.api import (
    procesamiento,
    auth,
    users_roles,
    powerbi,
    file_store,
    delivery,
    comercial,
    notificaciones,
    documentos_gcb,
    sisa_reservas,
    agenda_deportiva,
)

# Configuración de logs para ver errores reales
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.services.notificaciones_scheduler import (
        shutdown_notificaciones_scheduler,
        start_notificaciones_scheduler,
    )
    from app.services.sisa_reservas_notifications_scheduler import (
        shutdown_sisa_reservas_notifications_scheduler,
        start_sisa_reservas_notifications_scheduler,
    )

    start_notificaciones_scheduler()
    start_sisa_reservas_notifications_scheduler()
    yield
    shutdown_sisa_reservas_notifications_scheduler()
    shutdown_notificaciones_scheduler()


app = FastAPI(title="Refugio API", version="1.0.4", lifespan=lifespan)

# CORS TOTAL - SIN RESTRICCIONES
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Incluir los routers
app.include_router(procesamiento.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users_roles.router, prefix="/api")
app.include_router(powerbi.router, prefix="/api")
app.include_router(file_store.router, prefix="/api")
app.include_router(delivery.router, prefix="/api")
app.include_router(comercial.router, prefix="/api")
app.include_router(notificaciones.router, prefix="/api")
app.include_router(documentos_gcb.router, prefix="/api")
app.include_router(sisa_reservas.router, prefix="/api")
app.include_router(agenda_deportiva.router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "online", "message": "Conexión Establecida"}

if __name__ == "__main__":
    print(">>> SERVIDOR INICIADO EN http://localhost:8080")
    # Cambiamos de 127.0.0.1 a 0.0.0.0 para que escuche en todas las interfaces
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
