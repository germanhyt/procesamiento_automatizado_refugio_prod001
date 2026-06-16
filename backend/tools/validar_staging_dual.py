#!/usr/bin/env python3
"""
Valida modo dual: estado staging Excel vs PostgreSQL.
Uso: desde backend/  ->  python tools/validar_staging_dual.py
"""
from __future__ import annotations

import asyncio
import json
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


async def main() -> int:
    service = get_legacy_service()
    status = await service.get_sales_staging_status()
    print("=== Validacion staging dual ===\n")
    print(json.dumps(status, indent=2, ensure_ascii=False, default=str))

    if not status.get("success"):
        return 1

    mode = status.get("staging_mode")
    real = status.get("realizadas") or {}
    print("\n--- Resumen ---")
    print(f"SALES_STAGING_MODE     : {mode}")
    print(f"Fuente activa ventas   : {status.get('active_source')}")
    print(f"Excel sales_df         : {(status.get('excel') or {}).get('rows', 0)} filas")
    print(f"PG stg_sales           : {(status.get('postgresql') or {}).get('rows', 0)} filas")
    print(f"REALIZADAS modo        : {real.get('staging_mode')}")
    print(f"Fuente activa realiz.  : {real.get('active_source')}")
    print(f"Excel Realizadas       : {(real.get('excel') or {}).get('rows', 0)} filas")
    print(f"PG stg_realizadas      : {(real.get('postgresql') or {}).get('rows', 0)} filas")
    print(f"Pendientes BQ (PG)     : {(real.get('postgresql') or {}).get('pendientes_bq', 0)}")

    pg_sales = (status.get("postgresql") or {}).get("rows", 0)
    if mode in ("dual", "postgres") and pg_sales == 0:
        print("\n[!] Modo dual/postgres activo pero stg_sales vacio.")
        print("    Ejecute: python tools/import_sales_df_to_staging.py")
        return 2

    print("\n[OK] Staging configurado correctamente.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
