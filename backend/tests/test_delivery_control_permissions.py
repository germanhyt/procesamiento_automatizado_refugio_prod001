"""Permisos centro de control delivery."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api import delivery as delivery_api
from app.core.delivery_constants import PERMISSION_DELIVERY_CONTROL, PERMISSION_DELIVERY_CONTROL_ACTIONS


def _user(*, superuser: bool = False, permission_codenames: tuple[str, ...] = ()):
    if superuser:
        return SimpleNamespace(is_superuser=True, roles=[])
    perms = [SimpleNamespace(codename=c) for c in permission_codenames]
    return SimpleNamespace(is_superuser=False, roles=[SimpleNamespace(permissions=perms)])


def test_control_access_admin():
    delivery_api._require_control_access(_user(permission_codenames=("delivery:admin",)))


def test_control_access_control_only():
    delivery_api._require_control_access(_user(permission_codenames=(PERMISSION_DELIVERY_CONTROL,)))


def test_control_access_denied():
    with pytest.raises(HTTPException) as exc:
        delivery_api._require_control_access(_user(permission_codenames=("delivery:view",)))
    assert exc.value.status_code == 403


def test_control_actions_explicit():
    delivery_api._require_control_actions(_user(permission_codenames=(PERMISSION_DELIVERY_CONTROL_ACTIONS,)))


def test_control_actions_denied_admin_without_actions():
    with pytest.raises(HTTPException) as exc:
        delivery_api._require_control_actions(_user(permission_codenames=("delivery:admin",)))
    assert exc.value.status_code == 403


def test_control_actions_denied_view_only():
    with pytest.raises(HTTPException) as exc:
        delivery_api._require_control_actions(_user(permission_codenames=(PERMISSION_DELIVERY_CONTROL,)))
    assert exc.value.status_code == 403


def test_admin_mutation_from_control_requires_actions():
    with pytest.raises(HTTPException) as exc:
        delivery_api._require_admin_mutation(
            _user(permission_codenames=(PERMISSION_DELIVERY_CONTROL,)),
            "control_center",
        )
    assert exc.value.status_code == 403


def test_admin_mutation_from_control_allows_actions():
    delivery_api._require_admin_mutation(
        _user(permission_codenames=(PERMISSION_DELIVERY_CONTROL_ACTIONS,)),
        "control_center",
    )


def test_control_snapshot_mock_endpoint():
    user = _user(permission_codenames=(PERMISSION_DELIVERY_CONTROL,))

    import asyncio

    out = asyncio.run(delivery_api.control_snapshot_mock(current_user=user))
    assert out["mock"] is True
    assert len(out["orders"]) >= 1


def test_control_snapshot_mock_forbidden():
    import asyncio

    with pytest.raises(HTTPException) as exc:
        asyncio.run(delivery_api.control_snapshot_mock(current_user=_user(permission_codenames=("delivery:view",))))
    assert exc.value.status_code == 403
