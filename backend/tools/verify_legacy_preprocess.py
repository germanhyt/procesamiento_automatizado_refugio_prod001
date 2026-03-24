#!/usr/bin/env python3
"""
Verificación local (sin BigQuery): _activar_cargar, _preprocess_bq_sales y filas JSON.
Ejecutar desde backend/:  python tools/verify_legacy_preprocess.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd
from datetime import datetime

from app.services.legacy_service import LegacyService, _activar_cargar


class _DummyGdrive:
    pass


def _rows_like_cargar_bq(df_clean: pd.DataFrame, cols_existentes: list[str]) -> list[dict]:
    rows_to_insert = []
    for _, r in df_clean[cols_existentes].iterrows():
        clean = {}
        for c in cols_existentes:
            v = r[c]
            if pd.isna(v):
                if c in ("Monto", "Cantidad"):
                    clean[c] = 0.0
                elif c == "Estado":
                    clean[c] = 0
                else:
                    clean[c] = ""
                continue
            if c in ("Monto", "Cantidad"):
                clean[c] = float(pd.to_numeric(v, errors="coerce") or 0.0)
            elif c == "Estado":
                clean[c] = int(float(pd.to_numeric(v, errors="coerce") or 0))
            elif isinstance(v, (pd.Timestamp, datetime)):
                ts = pd.Timestamp(v)
                if c == "Fecha":
                    clean[c] = ts.strftime("%Y-%m-%d")
                elif c == "Hora":
                    clean[c] = ts.strftime("%H:%M:%S")
                else:
                    clean[c] = ts.isoformat(sep=" ", timespec="seconds")
            else:
                s = str(v).strip()
                clean[c] = "" if s.lower() in ("nan", "nat", "none", "<na>") else s
        rows_to_insert.append(clean)
    return rows_to_insert


def main() -> int:
    assert _activar_cargar(1) and _activar_cargar("1") and _activar_cargar(1.0)
    assert not _activar_cargar(0) and not _activar_cargar("") and not _activar_cargar(None)

    svc = LegacyService(_DummyGdrive(), "", "", "", "p", "d", os.devnull)

    df = pd.DataFrame(
        {
            "Fecha": [pd.Timestamp("2024-03-15"), pd.Timestamp("2024-03-16")],
            "Hora": [None, "14:30:00"],
            "Monto": [12.5, 8.0],
            "Producto": [None, "Café"],
            "Cliente": [None, "Ana"],
            "CodigoNegocio": ["A03", "A03"],
            "FormaPago": [None, ""],
            "Estado": [0.0, 0.0],
            "Cantidad": [1, 2],
        }
    )
    out = svc._preprocess_bq_sales(df)
    assert not out.empty, "preprocess no debe vaciar el dataframe de prueba"
    assert out["FechaHora"].astype(str).str.len().min() > 8, "FechaHora no debe quedar vacía"
    assert (out["Hora"].astype(str).str.strip() != "").all(), "Hora debe tener default"
    assert (out["FormaPago"] == "-").all() or out["FormaPago"].iloc[0] == "-", "FormaPago nulo → '-'"

    columnas_bq = [
        "Fecha",
        "Hora",
        "FechaHora",
        "CodigoTransaccion",
        "Producto",
        "Cliente",
        "CodigoNegocio",
        "FechaCarga",
        "Estado",
        "Monto",
        "Cantidad",
        "CodigoUbicacion",
        "FormaPago",
        "EstadoNegocio",
        "TipoNegocio",
        "Area",
    ]
    for c in ["CodigoTransaccion", "FechaCarga", "CodigoUbicacion", "EstadoNegocio", "TipoNegocio", "Area"]:
        if c not in out.columns:
            out[c] = ""
    cols_existentes = [c for c in columnas_bq if c in out.columns]
    rows = _rows_like_cargar_bq(out, cols_existentes)
    for row in rows:
        for k, v in row.items():
            assert v is not None, f"clave {k} no debe ser None (usa '' o 0)"
    print("verify_legacy_preprocess: OK", len(rows), "filas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
