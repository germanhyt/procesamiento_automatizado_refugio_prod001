# -*- coding: utf-8 -*-
"""
Tests unitarios: audiencia bandeja/push Runner (sin BD real).

En entornos donde pytest carga plugins globales rotos (p. ej. langsmith + pydantic),
ejecutar: PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.delivery_runner_notifications import (
    active_runner_push_targets,
    mark_all_runner_notifications_read,
    record_runner_notifications_for_users,
    runner_push_and_inbox_recipients,
    user_ids_with_delivery_view,
)


def _chain_q(**all_return):
    """db.query(Model).filter(...).all() / .first()"""
    q = MagicMock()

    def first_side_effect():
        return all_return.get("first")

    def all_side_effect():
        return all_return.get("all", [])

    q.filter.return_value = q
    q.join.return_value = q
    q.distinct.return_value = q
    q.first.side_effect = first_side_effect
    q.all.side_effect = all_side_effect
    return q


def test_active_runner_push_targets_includes_users_even_without_expo_token():
    db = MagicMock()
    rows = [
        SimpleNamespace(user_id=2, expo_push_token="ExponentPushToken[x]", is_active=True),
        SimpleNamespace(user_id=1, expo_push_token="tok-a", is_active=True),
        SimpleNamespace(user_id=1, expo_push_token="tok-b", is_active=True),
        SimpleNamespace(user_id=3, expo_push_token="", is_active=True),
        SimpleNamespace(user_id=4, expo_push_token=None, is_active=True),
    ]
    q = _chain_q(all=rows)
    db.query.return_value = q

    uids, toks = active_runner_push_targets(db)

    assert uids == [1, 2, 3, 4]
    # Orden de tokens = orden de filas iteradas (no ordenado por usuario).
    assert toks == ["ExponentPushToken[x]", "tok-a", "tok-b"]


def test_user_ids_with_delivery_view_no_permission_returns_empty():
    db = MagicMock()
    q = _chain_q(first=None)
    db.query.return_value = q

    assert user_ids_with_delivery_view(db) == []


def test_user_ids_with_delivery_view_merges_roles_and_superusers():
    db = MagicMock()
    role = SimpleNamespace(id=10)
    perm = SimpleNamespace(roles=[role])

    perm_q = _chain_q(first=perm)
    role_members_q = _chain_q(all=[(5,), (7,)])
    super_q = _chain_q(all=[(99,)])

    db.query.side_effect = [perm_q, role_members_q, super_q]

    out = user_ids_with_delivery_view(db)

    assert out == [5, 7, 99]


def test_runner_push_and_inbox_recipients_unsorted_merge():
    db = MagicMock()

    def fake_active(session):
        assert session is db
        return [2, 9], ["only-one-token"]

    def fake_view(session):
        assert session is db
        return [1, 9, 20]

    with patch(
        "app.services.delivery_runner_notifications.active_runner_push_targets",
        side_effect=fake_active,
    ):
        with patch(
            "app.services.delivery_runner_notifications.user_ids_with_delivery_view",
            side_effect=fake_view,
        ):
            uids, toks = runner_push_and_inbox_recipients(db)

    assert uids == [1, 2, 9, 20]
    assert toks == ["only-one-token"]


def test_record_runner_notifications_for_users_skips_when_no_users():
    db = MagicMock()
    record_runner_notifications_for_users(db, [], kind="K", title="T", body="B", dedupe_key="d")
    db.execute.assert_not_called()


def test_record_runner_notifications_for_users_executes_insert():
    db = MagicMock()
    record_runner_notifications_for_users(
        db,
        [42],
        kind="PEDIDO_LISTO",
        title="Pedido listo",
        body="Cuerpo",
        dedupe_key="pedido_listo:7",
        order_id=7,
    )
    db.execute.assert_called_once()


def test_mark_all_runner_notifications_read_updates():
    db = MagicMock()
    unread_q = MagicMock()
    db.query.return_value = unread_q
    unread_q.filter.return_value = unread_q
    unread_q.update.return_value = 3

    mark_all_runner_notifications_read(db, user_id=5)

    db.query.assert_called_once()
    unread_q.filter.assert_called_once()
    unread_q.update.assert_called_once()
