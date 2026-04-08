# -*- coding: utf-8 -*-
from unittest.mock import MagicMock

from app.services.notificaciones_contactos import attach_emails_notificacion, load_notification_emails_by_fidelio


def test_load_notification_emails_deduplicates_and_orders():
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    join_q = MagicMock()
    q.join.return_value = join_q
    join_q.order_by.return_value = join_q
    join_q.all.return_value = [
        ("A03_X", "Dup@Mail.COM"),
        ("A03_X", "dup@mail.com"),
        ("A03_X", "otro@test.pe"),
    ]

    m = load_notification_emails_by_fidelio(db)
    assert m["A03_X"] == ["dup@mail.com", "otro@test.pe"]


def test_attach_emails_notificacion_mutates_rows():
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    join_q = MagicMock()
    q.join.return_value = join_q
    join_q.order_by.return_value = join_q
    join_q.all.return_value = [("L17_Y", "a@b.com")]

    rows = [{"codigo": "L17_Y", "nombre": "Test", "alerta": True}]
    attach_emails_notificacion(db, rows)
    assert rows[0]["emails_notificacion"] == ["a@b.com"]

    rows2 = [{"codigo": "UNKNOWN", "nombre": "Z"}]
    attach_emails_notificacion(db, rows2)
    assert rows2[0]["emails_notificacion"] == []
