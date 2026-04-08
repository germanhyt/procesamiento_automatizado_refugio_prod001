# -*- coding: utf-8 -*-
"""
Diagnóstico: para L20_CALDOS_DORIS, qué encabezado usa el servicio de notificaciones
(solo columna cuyo nombre normalizado es exactamente "fecha") y qué fechas salen por archivo.

Ejecutar con salida visible:
  pytest tests/test_l20_caldos_doris_fecha_diagnostico.py -s -v

Si no hay pendientes en FileStore, el test se salta (skip).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import openpyxl
import pytest

from app.services import notificaciones_service as ns
from app.services.file_store_service import _dir_locatario_pendientes, get_upload_base, list_pendientes_locatario

LOC = "L20_CALDOS_DORIS"


def _normalizar_header(h: Any) -> str:
    if h is None:
        return ""
    return str(h).replace("\ufeff", "").strip().lower()


def _primera_fila_headers_csv(path: Path) -> tuple[Any, ...]:
    import csv

    for encoding in ("utf-8", "latin-1"):
        try:
            with path.open(encoding=encoding, errors="replace", newline="") as f:
                sample = f.read(4096)
                f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                except csv.Error:
                    dialect = csv.excel
                reader = csv.reader(f, dialect)
                header = next(reader, None)
                return tuple(header) if header else ()
        except UnicodeDecodeError:
            continue
    return ()


def _primera_fila_headers_xlsx(path: Path) -> tuple[str, tuple[Any, ...]]:
    """(nombre_hoja_activa, headers)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb.active
        name = ws.title
        row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
        headers = tuple(row) if row else ()
        return name, headers
    finally:
        wb.close()


def _diagnostico_un_archivo(path: Path, nombre: str) -> dict[str, Any]:
    ext = path.suffix.lower()
    hoja = None
    headers: tuple[Any, ...] = ()

    if ext == ".xlsx":
        hoja, headers = _primera_fila_headers_xlsx(path)
    elif ext == ".csv":
        headers = _primera_fila_headers_csv(path)

    headers_norm = [_normalizar_header(h) for h in headers]
    idx_fecha = ns._find_fecha_column_index(tuple(headers))

    fechas_columna: list[str] = []
    try:
        if ext == ".xlsx":
            s = ns._extract_fechas_columna_xlsx(path)
        elif ext == ".xls":
            s = ns._extract_fechas_columna_xls(path)
        elif ext == ".csv":
            s = ns._extract_fechas_columna_csv(path)
        else:
            s = set()
        fechas_columna = sorted(d.isoformat() for d in s)
    except Exception as e:  # noqa: BLE001
        fechas_columna = [f"<error: {e}>"]

    collect = ns.collect_fechas_operacion_desde_archivo(path, nombre)
    collect_iso = sorted(d.isoformat() for d in collect)

    fecha_fb, fuente_fb = ns._fecha_mas_reciente_del_archivo(path, nombre)

    return {
        "archivo": nombre,
        "extension": ext,
        "hoja_activa_xlsx": hoja,
        "headers_crudos": [None if h is None else str(h) for h in headers[:40]],
        "headers_normalizados_muestra": headers_norm[:40],
        "indice_columna_fecha_exacta": idx_fecha,
        "nota": "Solo cuenta columna cuyo encabezado normalizado sea exactamente 'fecha' (ver _find_fecha_column_index).",
        "fechas_solo_columna_fecha": fechas_columna,
        "fechas_finales_collect": collect_iso,
        "fallback_si_columna_vacia": {
            "fecha": fecha_fb.isoformat() if fecha_fb else None,
            "fuente": fuente_fb,
        },
    }


def test_diagnostico_fecha_l20_caldos_doris() -> None:
    nombres = list_pendientes_locatario(LOC)
    base = get_upload_base()
    d = _dir_locatario_pendientes(base, LOC)

    if not nombres:
        pytest.skip(f"No hay archivos .csv/.xlsx/.xls en pendientes: {d}")

    reporte: dict[str, Any] = {
        "locatario": LOC,
        "directorio": str(d),
        "archivos": [],
    }
    for nombre in nombres:
        path = d / nombre
        if path.is_file():
            reporte["archivos"].append(_diagnostico_un_archivo(path, nombre))

    out = json.dumps(reporte, ensure_ascii=False, indent=2)
    print("\n=== DIAGNÓSTICO FECHA L20_CALDOS_DORIS ===\n")
    print(out)
    print("\n=== FIN ===\n")

    assert reporte["archivos"], "lista vacía"
    # No forzamos fechas concretas: solo documentamos; el test pasa si hay archivos.
