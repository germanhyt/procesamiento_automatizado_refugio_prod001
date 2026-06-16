#!/usr/bin/env python3
"""
Importa la hoja sales_df (ConfiguracionWeb.xlsx) a PostgreSQL stg_sales.

Uso (desde backend/):
  python tools/import_sales_df_to_staging.py              # upsert
  python tools/import_sales_df_to_staging.py --dry-run    # simular
  python tools/import_sales_df_to_staging.py --clear      # TRUNCATE + importar

Requisitos:
  python patch_db_sales_staging.py
  SALES_STAGING_MODE=dual o postgres en config/.env (recomendado dual durante migración)
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

    print("=== Import sales_df -> stg_sales ===\n")
    print(f"SALES_STAGING_MODE : {status.get('staging_mode')}")
    print(f"Excel sales_df     : {status['excel']['rows']} filas")
    print(f"PostgreSQL stg_sales: {status['postgresql']['rows']} filas")
    print()

    result = await service.import_sales_staging_from_excel(
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
    parser = argparse.ArgumentParser(description="Importar sales_df Excel → stg_sales")
    parser.add_argument("--clear", action="store_true", help="TRUNCATE stg_sales antes de importar")
    parser.add_argument("--dry-run", action="store_true", help="Simular sin escribir en PostgreSQL")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(clear_before=args.clear, dry_run=args.dry_run)))


if __name__ == "__main__":
    main()
