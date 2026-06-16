"""
Idempotente: crea la tabla stg_realizadas para auditoría de cargas (reemplazo de hoja Realizadas).
Ejecutar en BD existente:
  python patch_db_realizadas_staging.py
"""

from app.database import engine, Base
from app.models.realizadas_staging import StgRealizada  # noqa: F401


def ensure_tables() -> None:
    print(">>> Creando tabla stg_realizadas (si no existe)...")
    Base.metadata.create_all(bind=engine)
    print(">>> patch_db_realizadas_staging completado.")


if __name__ == "__main__":
    ensure_tables()
