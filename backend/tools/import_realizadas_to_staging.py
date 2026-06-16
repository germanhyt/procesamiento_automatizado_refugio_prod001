#!/usr/bin/env python3
"""
Importa la hoja Realizadas (ConfiguracionWeb.xlsx) a PostgreSQL stg_realizadas.

Uso (desde backend/):
  python tools/import_realizadas_to_staging.py              # upsert
  python tools/import_realizadas_to_staging.py --dry-run
  python tools/import_realizadas_to_staging.py --clear

Requisitos:
  python patch_db_realizadas_staging.py
  REALIZADAS_STAGING_MODE=dual (o hereda SALES_STAGING_MODE)
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

for env_path in (
    Path(__file__).resolve().parents[2] / "config" / ".env",
    Path(__file__).resolve().parents[1] / "config" / ".env",
):
    if env_path.is_file():
        load_dotenv(env_path)
        break

from app.api.procesamiento import get_legacy_service


async def _run(clear_before: bool, dry_run: bool) -> int:
    service = get_legacy_service()
    status = await service.get_sales_staging_status()
    if not status.get("success"):
        print(f"Error leyendo estado: {status.get('error')}")
        return 1

    real = status.get("realizadas") or {}
    print("=== Import Realizadas -> stg_realizadas ===\n")
    print(f"REALIZADAS_STAGING_MODE : {real.get('staging_mode')}")
    print(f"Excel Realizadas      : {(real.get('excel') or {}).get('rows', 0)} filas")
    print(f"PostgreSQL stg_realizadas: {(real.get('postgresql') or {}).get('rows', 0)} filas")
    print()

    result = await service.import_realizadas_staging_from_excel(
        clear_before=clear_before,
        dry_run=dry_run,
    )
    if not result.get("success"):
        print(f"Error: {result.get('error')}")
        return 1

    print(result.get("message", "OK"))
    if dry_run:
        print(f"  Excel filas      : {result.get('excel_rows')}")
        print(f"  Borraría PG antes: {result.get('would_clear')}")
        print(f"  PG antes         : {result.get('pg_rows_before')}")
    else:
        print(f"  Excel filas      : {result.get('excel_rows')}")
        print(f"  Upserts          : {result.get('rows_upserted')}")
        print(f"  PG borradas      : {result.get('pg_cleared', 0)}")
        print(f"  PG después       : {result.get('pg_rows_after')}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Importar Realizadas Excel → stg_realizadas")
    parser.add_argument("--clear", action="store_true", help="TRUNCATE stg_realizadas antes de importar")
    parser.add_argument("--dry-run", action="store_true", help="Simular sin escribir en PostgreSQL")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(clear_before=args.clear, dry_run=args.dry_run)))


if __name__ == "__main__":
    main()
