# -*- coding: utf-8 -*-
"""Webhook Fidelio: reception kind created | duplicate | new_cycle."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.core.delivery_constants import (
    FIDELIO_RECEPTION_KIND_CREATED,
    FIDELIO_RECEPTION_KIND_DUPLICATE,
    FIDELIO_RECEPTION_KIND_NEW_CYCLE,
    ORDER_STATUS_ENTREGADO,
    ORDER_STATUS_LISTO,
    ORDER_STATUS_LISTO_PARA_ENTREGAR,
)
from app.services.fidelio_webhook_service import process_fidelio_order_ready


def _mock_db_latest(order_or_none):
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    filter_q = MagicMock()
    q.filter.return_value = filter_q
    order_q = MagicMock()
    filter_q.order_by.return_value = order_q
    order_q.first.return_value = order_or_none

    def _refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = 900

    db.refresh.side_effect = _refresh
    return db


def _restaurant():
    return SimpleNamespace(id=3, nombre="Barrio Máncora", fidelio_id="A03_BARRIO_MANCORA")


def test_fidelio_webhook_created_when_no_prior_order():
    db = _mock_db_latest(None)
    rest = _restaurant()

    result = process_fidelio_order_ready(db, rest, "RAPPI", "ABC123", 2)

    assert result.response.recepcion.tipo == FIDELIO_RECEPTION_KIND_CREATED
    assert result.response.recepcion.duplicado is False
    assert result.notify_runners is True
    assert result.try_early_bird is True
    assert result.response.orden.plataforma == "RAPPI"
    assert result.response.orden.numero_bolsas == 2
    db.add.assert_called_once()


def test_fidelio_webhook_duplicate_active_order():
    now = datetime.now(timezone.utc)
    prior = SimpleNamespace(
        id=501,
        restaurant_id=3,
        plataforma="RAPPI",
        codigo_pedido="ABC123",
        estado=ORDER_STATUS_LISTO_PARA_ENTREGAR,
        numero_bolsas=2,
        created_at=now - timedelta(minutes=23),
    )
    db = _mock_db_latest(prior)
    rest = _restaurant()

    result = process_fidelio_order_ready(db, rest, "RAPPI", "ABC123", 2)

    assert result.response.recepcion.tipo == FIDELIO_RECEPTION_KIND_DUPLICATE
    assert result.response.recepcion.duplicado is True
    assert result.response.recepcion.bolsas_actualizadas is False
    assert result.response.recepcion.minutos_desde_primera_recepcion == 23
    assert result.response.recepcion.tiempo_desde_primera_recepcion == "23 min"
    assert "23 min" in result.response.recepcion.mensaje
    assert result.notify_runners is False
    assert result.try_early_bird is False
    assert result.response.orden.id == 501
    db.add.assert_not_called()


def test_fidelio_webhook_duplicate_updates_bolsas():
    now = datetime.now(timezone.utc)
    prior = SimpleNamespace(
        id=501,
        restaurant_id=3,
        plataforma="RAPPI",
        codigo_pedido="ABC123",
        estado=ORDER_STATUS_LISTO,
        numero_bolsas=1,
        created_at=now - timedelta(minutes=5),
    )
    db = _mock_db_latest(prior)
    rest = _restaurant()

    result = process_fidelio_order_ready(db, rest, "RAPPI", "ABC123", 3)

    assert result.response.recepcion.tipo == FIDELIO_RECEPTION_KIND_DUPLICATE
    assert result.response.recepcion.bolsas_actualizadas is True
    assert prior.numero_bolsas == 3
    db.commit.assert_called()


def test_fidelio_webhook_new_cycle_after_terminal():
    prior = SimpleNamespace(
        id=501,
        restaurant_id=3,
        plataforma="RAPPI",
        codigo_pedido="ABC123",
        estado=ORDER_STATUS_ENTREGADO,
        numero_bolsas=2,
        created_at=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    db = _mock_db_latest(prior)
    rest = _restaurant()

    result = process_fidelio_order_ready(db, rest, "RAPPI", "ABC123", 1)

    assert result.response.recepcion.tipo == FIDELIO_RECEPTION_KIND_NEW_CYCLE
    assert result.response.recepcion.duplicado is False
    assert result.response.recepcion.id_pedido_anterior == 501
    assert result.response.recepcion.estado_anterior == ORDER_STATUS_ENTREGADO
    assert "entregado" in result.response.recepcion.mensaje.lower()
    assert result.notify_runners is True
    db.add.assert_called_once()


def test_fidelio_format_tiempo_horas():
    from app.services.fidelio_webhook_service import _format_tiempo_transcurrido_es

    assert _format_tiempo_transcurrido_es(5) == "5 min"
    assert _format_tiempo_transcurrido_es(60) == "1 h"
    assert _format_tiempo_transcurrido_es(83) == "1 h 23 min"
    assert _format_tiempo_transcurrido_es(120) == "2 h"
