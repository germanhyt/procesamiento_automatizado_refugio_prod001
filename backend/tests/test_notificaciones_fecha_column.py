# -*- coding: utf-8 -*-
"""Elección de columna fecha en notificaciones_service._find_fecha_column_index."""

from datetime import date

from app.services.notificaciones_service import (
    _buscar_fila_encabezado_fecha,
    _extract_fechas_bajo_encabezado,
    _find_fecha_column_index,
)


def test_fecha_exacta():
    h = ("X", "Fecha", "Y")
    assert _find_fecha_column_index(h) == 1


def test_prioridad_fecha_sobre_fecha_creacion():
    h = ("FECHA CREACIÓN", "Fecha", "FECHA VENTA")
    assert _find_fecha_column_index(h) == 1


def test_fecha_venta_producto():
    h = ("Fecha de generación", "FECHA VENTA PRODUCTO", "Z")
    assert _find_fecha_column_index(h) == 1


def test_fecha_creacion_sin_fecha_ni_venta():
    h = ("Fecha de generación", "OTRO", "FECHA CREACIÓN")
    assert _find_fecha_column_index(h) == 2


def test_excluye_fecha_de_generacion():
    h = ("Fecha de generación", "02/04/2026")
    assert _find_fecha_column_index(h) is None


def test_regex_fecha_prefijo_generica():
    h = ("A", "FECHA OPERACIÓN", "B")
    assert _find_fecha_column_index(h) == 1


def test_fecha_comprobante():
    h = ("FECHA COMPROBANTE", "FECHA CREACIÓN")
    # creación (1) sobre comprobante (3)
    assert _find_fecha_column_index(h) == 1


def test_prioridad_creacion_sobre_venta_y_comprobante_estilo_caldos():
    h = ("FECHA COMPROBANTE", "FECHA VENTA PRODUCTO", "FECHA CREACIÓN")
    assert _find_fecha_column_index(h) == 2


def test_cabecera_detalle_no_es_la_primera_fila_estilo_caldos():
    """Metadatos en fila 0; tabla con FECHA CREACIÓN desde fila 1."""
    rows = [
        ("Fecha de generación", "02/04/2026 - 01:00 AM", ""),
        ("FECHA COMPROBANTE", "FECHA VENTA PRODUCTO", "FECHA CREACIÓN"),
        ("01/04/2026", "01/04/2026", "01/04/2026"),
    ]
    hit = _buscar_fila_encabezado_fecha(rows)
    assert hit is not None
    assert hit[0] == 1
    assert hit[1] == 2  # fecha creación
    fechas = _extract_fechas_bajo_encabezado(rows, hit[0], hit[1])
    assert date(2026, 4, 1) in fechas
