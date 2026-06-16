"""
Idempotente: crea la tabla stg_sales para staging de ventas (reemplazo de sales_df).
Ejecutar en BD existente:
  python patch_db_sales_staging.py
"""

from app.database import engine, Base
from app.models.sales_staging import StgSales  # noqa: F401


def ensure_tables() -> None:
    print(">>> Creando tabla stg_sales (si no existe)...")
    Base.metadata.create_all(bind=engine)
    print(">>> patch_db_sales_staging completado.")


if __name__ == "__main__":
    ensure_tables()
