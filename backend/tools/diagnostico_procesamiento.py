#!/usr/bin/env python3
"""
Diagnóstico rápido del flujo legacy (FileStore + ConfiguracionWeb).
Uso: desde backend/  →  python tools/diagnostico_procesamiento.py
"""
from __future__ import annotations

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

import pandas as pd

from app.services.file_store_service import get_upload_base, list_cierre_caja_por_locatario
from app.services.file_store_service import rango_desde_modo


def main() -> None:
    print("=== Diagnóstico procesamiento Refugio ===\n")

    upload = get_upload_base().resolve()
    backend_uploads = Path(__file__).resolve().parents[1] / "uploads"
    print(f"UPLOAD_BASE_PATH (env): {os.getenv('UPLOAD_BASE_PATH') or '(no definido)'}")
    print(f"get_upload_base()      : {upload}")
    if upload != backend_uploads.resolve():
        print(
            "  [!] La API usa otra carpeta que backend/uploads/. "
            "Ajuste UPLOAD_BASE_PATH en config/.env o suba archivos ahi."
        )
    print()

    for modo in ("semana_actual", "ultima_semana"):
        s, e, tag = rango_desde_modo(modo)
        print(f"Rango '{modo}': {s} -> {e} ({tag})")
    print()

    items = list_cierre_caja_por_locatario()
    with_files = [it for it in items if (it.get("pendientes") or it.get("consolidados"))]
    print(f"Locatarios con archivos en FileStore: {len(with_files)}")
    for it in with_files[:8]:
        print(
            f"  {it['locatario']}: pend={len(it.get('pendientes') or [])} "
            f"cons={len(it.get('consolidados') or [])}"
        )
    if len(with_files) > 8:
        print(f"  … y {len(with_files) - 8} más")
    print()

    temp_web = Path("/tmp/refugio_data/ConfiguracionWeb.xlsx")
    if temp_web.is_file():
        act = pd.read_excel(temp_web, sheet_name="Activas")
        sales = pd.read_excel(temp_web, sheet_name="sales_df")
        cargar = 0
        if "Cargar" in act.columns and len(act):
            cargar = int(
                act["Cargar"]
                .astype(str)
                .str.strip()
                .isin(["1", "1.0", "True", "true", "SI", "si"])
                .sum()
            )
        print(f"ConfiguracionWeb (temp): {temp_web}")
        print(f"  Activas: {len(act)} filas ({cargar} con Cargar=1)")
        print(f"  sales_df: {len(sales)} filas")
    else:
        print(f"Sin copia temp: {temp_web}")

    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    print(f"\nGOOGLE_APPLICATION_CREDENTIALS: {creds or '(vacío)'}")
    print("Si Drive falla (Invalid JWT), el flujo sigue con temp/config local.")
    print("\nPasos recomendados:")
    print("  1. Rango = fechas de los reportes (ej. ultima semana si son de mayo)")
    print("  2. Consolidar -> revisar modal / _consolidados")
    print("  3. Asociar -> Activas con rutas L13/.../_consolidados/...")
    print("  4. Ventas (sin pisar Activas si Drive está caído — fix aplicado)")


if __name__ == "__main__":
    main()
