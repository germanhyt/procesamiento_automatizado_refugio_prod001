"""
Dedup stg_realizadas: una fila por CodigoNegocio + FechaInicio + FechaFin.
Reemplaza índice ix_stg_realizadas_natural_key por ix_stg_realizadas_negocio_periodo.

Ejecutar desde backend/:
  python patch_realizadas_consolidar.py
"""
from __future__ import annotations

from sqlalchemy import text

from app.database import SessionLocal, engine
from app.models.realizadas_staging import StgRealizada  # noqa: F401
from app.services.realizadas_staging_service import (
    consolidar_realizadas_dataframe,
    upsert_dataframe,
)


def run() -> None:
    db = SessionLocal()
    try:
        print(">>> Eliminando índice anterior (si existe)...")
        with engine.connect() as conn:
            conn.execute(text("DROP INDEX IF EXISTS ix_stg_realizadas_natural_key"))
            conn.execute(text("DROP INDEX IF EXISTS ix_stg_realizadas_negocio_periodo"))
            conn.commit()

        print(">>> Leyendo filas actuales...")
        from app.services.realizadas_staging_service import read_all_dataframe

        raw = read_all_dataframe(db)
        agg = None
        if not raw.empty:
            agg = consolidar_realizadas_dataframe(raw.drop(columns=["id"], errors="ignore"))
            print(f">>> Consolidando {len(raw)} fila(s) -> {len(agg)} por negocio/periodo.")

        db.query(StgRealizada).delete()
        db.commit()

        with engine.connect() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_stg_realizadas_negocio_periodo "
                    "ON stg_realizadas (codigo_negocio, fecha_inicio, fecha_fin)"
                )
            )
            conn.commit()

        if agg is not None and not agg.empty:
            upsert_dataframe(db, agg)
        else:
            print(">>> stg_realizadas vacía tras consolidar.")
        print(">>> patch_realizadas_consolidar completado.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
