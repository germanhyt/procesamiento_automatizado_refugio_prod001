# -*- coding: utf-8 -*-
"""Tests unitarios del servicio Agenda Deportiva (resolución DAY/WEEK, validaciones)."""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from app.core.agenda_deportiva_constants import AGENDA_MODO_DAY, AGENDA_MODO_WEEK
from app.services.agenda_deportiva_service import (
    pick_programacion_for_date,
    validate_programacion_fechas,
    week_range_for_date,
)


def _prog(*, modo: str, inicio: date, fin: date, activa: bool = True, pid: int = 1):
    return SimpleNamespace(
        id=pid,
        modo=modo,
        fecha_inicio=inicio,
        fecha_fin=fin,
        activa=activa,
    )


def test_pick_programacion_prioriza_day_sobre_week():
    target = date(2026, 5, 28)
    day = _prog(modo=AGENDA_MODO_DAY, inicio=target, fin=target, pid=1)
    week = _prog(
        modo=AGENDA_MODO_WEEK,
        inicio=date(2026, 5, 26),
        fin=date(2026, 6, 1),
        pid=2,
    )
    picked = pick_programacion_for_date([week, day], target)
    assert picked.id == 1


def test_pick_programacion_usa_week_si_no_hay_day():
    target = date(2026, 5, 28)
    week = _prog(
        modo=AGENDA_MODO_WEEK,
        inicio=date(2026, 5, 26),
        fin=date(2026, 6, 1),
        pid=2,
    )
    picked = pick_programacion_for_date([week], target)
    assert picked.id == 2


def test_pick_programacion_ignora_inactivas():
    target = date(2026, 5, 28)
    inactive = _prog(modo=AGENDA_MODO_DAY, inicio=target, fin=target, activa=False, pid=1)
    assert pick_programacion_for_date([inactive], target) is None


def test_validate_programacion_day_requiere_misma_fecha():
    d = date(2026, 5, 28)
    validate_programacion_fechas(AGENDA_MODO_DAY, d, d)
    with pytest.raises(ValueError, match="DAY"):
        validate_programacion_fechas(AGENDA_MODO_DAY, d, date(2026, 5, 29))


def test_validate_programacion_week_requiere_7_dias():
    lunes = date(2026, 5, 26)
    domingo = date(2026, 6, 1)
    validate_programacion_fechas(AGENDA_MODO_WEEK, lunes, domingo)
    with pytest.raises(ValueError, match="WEEK"):
        validate_programacion_fechas(AGENDA_MODO_WEEK, lunes, date(2026, 5, 30))


def test_week_range_for_date():
    target = date(2026, 5, 28)  # jueves
    lunes, domingo = week_range_for_date(target)
    assert lunes == date(2026, 5, 25)
    assert domingo == date(2026, 5, 31)
