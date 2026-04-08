"""
Crea notificaciones_envio_config (singleton id=1) y fila por defecto.
Ejecutar: python patch_db_notificaciones.py (desde carpeta backend)
"""
from app.database import engine, SessionLocal, Base
from app.models.notificaciones_config import NotificacionesEnvioConfig  # noqa: F401
from app.services.notificaciones_scheduler import ensure_notificaciones_envio_n8n_columns


def ensure_table_and_seed() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_notificaciones_envio_n8n_columns()
    db = SessionLocal()
    try:
        row = db.get(NotificacionesEnvioConfig, 1)
        if row is None:
            row = NotificacionesEnvioConfig(
                id=1,
                schedule_enabled=False,
                schedule_hour=9,
                schedule_minute=0,
            )
            db.add(row)
            db.commit()
    finally:
        db.close()


def main() -> None:
    print(">>> Patching notificaciones_envio_config")
    ensure_table_and_seed()
    print(">>> OK")


if __name__ == "__main__":
    main()
