# -*- coding: utf-8 -*-
"""
Permisos y flags: kiosk (DNI / foto) vs Runner (simular pedido listo).

Modelo actual (backend):
- Kiosk consulta DNI y subida de foto: no hay codename por usuario; se habilita/deshabilita
  con flags en `delivery_config` (`enable_driver_*`). Los endpoints kiosk son públicos (sin JWT)
  pero devuelven 403 si el flag está apagado. Cambiar flags: `delivery:settings:update`;
  ver valores en panel admin GET: `delivery:admin`.
- Runner `POST /delivery/runner/simulate/order-ready`: superuser; o bien
  `delivery:simulate_order_ready`; o bien (`delivery:operate` y
  `enable_runner_simulate_order_ready` en config).
- `GET /delivery/runner/feature-flags`: JWT + `delivery:view`.

PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 si falla el autoload de plugins (p. ej. langsmith).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.delivery_constants import PERMISSION_DELIVERY_OPERATE, PERMISSION_DELIVERY_SIMULATE_ORDER_READY
from app.schemas.delivery import FidelioOrderReadyIn, KioskConfigPatchIn


def _user(*, superuser: bool = False, permission_codenames: tuple[str, ...] = ()):
    if superuser:
        return SimpleNamespace(is_superuser=True, roles=[])
    if not permission_codenames:
        return SimpleNamespace(is_superuser=False, roles=[])
    perms = [SimpleNamespace(codename=c) for c in permission_codenames]
    return SimpleNamespace(is_superuser=False, roles=[SimpleNamespace(permissions=perms)])


def _minimal_order_dict():
    now = datetime.now(timezone.utc)
    return {
        "id": 1,
        "restaurant_id": 1,
        "plataforma": "RAPPI",
        "codigo_pedido": "C1",
        "estado": "LISTO",
        "numero_bolsas": None,
        "restaurant_nombre": None,
        "locked_by_runner_id": None,
        "locked_by_runner_username": None,
        "matched_driver_arrival_id": None,
        "matched_driver_arrival": None,
        "created_at": now,
        "updated_at": now,
        "estado_changed_at": None,
        "listo_at": None,
        "match_at": None,
        "recogido_at": None,
        "entregado_at": None,
        "cancelado_at": None,
        "devolucion_at": None,
    }


async def _simulate(
    user,
    *,
    flag_enabled: bool,
):
    from app.api.delivery import runner_simulate_order_ready

    payload = FidelioOrderReadyIn(restaurant_fidelio_id="A03_X", plataforma="RAPPI", codigo_pedido="P1")
    db = MagicMock()
    mock_cfg = MagicMock()
    mock_cfg.enable_runner_simulate_order_ready = flag_enabled

    with patch("app.api.delivery.get_delivery_config", return_value=mock_cfg):
        with patch("app.api.delivery.fidelio_order_ready", new_callable=AsyncMock) as mock_fidelio:
            mock_fidelio.return_value = _minimal_order_dict()
            out = await runner_simulate_order_ready(
                payload=payload,
                background_tasks=MagicMock(),
                db=db,
                current_user=user,
            )
            return out, mock_fidelio


class TestRunnerSimulateOrderReadyAuth:
    def test_superuser_allowed_even_if_flag_off(self):
        user = _user(superuser=True)

        async def inner():
            out, mock_fidelio = await _simulate(user, flag_enabled=False)
            assert out["id"] == 1
            mock_fidelio.assert_awaited_once()

        asyncio.run(inner())

    def test_simulate_permission_allowed_even_if_flag_off(self):
        user = _user(permission_codenames=(PERMISSION_DELIVERY_SIMULATE_ORDER_READY,))

        async def inner():
            out, mock_fidelio = await _simulate(user, flag_enabled=False)
            assert out["codigo_pedido"] == "C1"
            mock_fidelio.assert_awaited_once()

        asyncio.run(inner())

    def test_operate_and_flag_on_allowed(self):
        user = _user(permission_codenames=(PERMISSION_DELIVERY_OPERATE,))

        async def inner():
            out, mock_fidelio = await _simulate(user, flag_enabled=True)
            assert out["estado"] == "LISTO"
            mock_fidelio.assert_awaited_once()

        asyncio.run(inner())

    def test_operate_flag_off_denied(self):
        user = _user(permission_codenames=(PERMISSION_DELIVERY_OPERATE,))

        async def inner():
            from app.api.delivery import runner_simulate_order_ready

            payload = FidelioOrderReadyIn(
                restaurant_fidelio_id="A03_X", plataforma="RAPPI", codigo_pedido="P1"
            )
            db = MagicMock()
            mock_cfg = MagicMock()
            mock_cfg.enable_runner_simulate_order_ready = False

            with patch("app.api.delivery.get_delivery_config", return_value=mock_cfg):
                with patch("app.api.delivery.fidelio_order_ready", new_callable=AsyncMock) as mock_fidelio:
                    with pytest.raises(HTTPException) as ei:
                        await runner_simulate_order_ready(
                            payload=payload,
                            background_tasks=MagicMock(),
                            db=db,
                            current_user=user,
                        )
                    assert ei.value.status_code == 403
                    mock_fidelio.assert_not_called()

        asyncio.run(inner())

    def test_view_only_denied(self):
        user = _user(permission_codenames=("delivery:view",))

        async def inner():
            from app.api.delivery import runner_simulate_order_ready

            payload = FidelioOrderReadyIn(
                restaurant_fidelio_id="A03_X", plataforma="RAPPI", codigo_pedido="P1"
            )
            db = MagicMock()
            mock_cfg = MagicMock()
            mock_cfg.enable_runner_simulate_order_ready = True

            with patch("app.api.delivery.get_delivery_config", return_value=mock_cfg):
                with patch("app.api.delivery.fidelio_order_ready", new_callable=AsyncMock) as mock_fidelio:
                    with pytest.raises(HTTPException) as ei:
                        await runner_simulate_order_ready(
                            payload=payload,
                            background_tasks=MagicMock(),
                            db=db,
                            current_user=user,
                        )
                    assert ei.value.status_code == 403
                    mock_fidelio.assert_not_called()

        asyncio.run(inner())


class TestKioskPhotoGate:
    def test_upload_photo_disabled_returns_403(self):
        from app.api.delivery import kiosk_upload_driver_photo

        async def inner():
            db = MagicMock()
            mock_cfg = MagicMock()
            mock_cfg.enable_driver_photo_capture = False
            file = MagicMock()
            file.read = AsyncMock(return_value=b"\xff\xd8")
            file.content_type = "image/jpeg"

            with patch("app.api.delivery.get_delivery_config", return_value=mock_cfg):
                with pytest.raises(HTTPException) as ei:
                    await kiosk_upload_driver_photo(
                        arrival_id=1,
                        conductor_dni="12345678",
                        file=file,
                        db=db,
                    )
                assert ei.value.status_code == 403
                assert "deshabilitada" in (ei.value.detail or "").lower()

        asyncio.run(inner())


class TestAdminKioskConfigRbac:
    """GET exige delivery:admin; PATCH exige delivery:settings:update (no son intercambiables)."""

    def test_get_requires_admin_not_only_settings(self):
        from app.api.delivery import admin_get_kiosk_config

        user = _user(permission_codenames=("delivery:settings:update",))
        with pytest.raises(HTTPException) as ei:
            admin_get_kiosk_config(db=MagicMock(), current_user=user)
        assert ei.value.status_code == 403

    def test_patch_requires_settings_not_only_admin(self):
        from app.api.delivery import admin_patch_kiosk_config

        user = _user(permission_codenames=("delivery:admin",))
        with pytest.raises(HTTPException) as ei:
            admin_patch_kiosk_config(
                payload=KioskConfigPatchIn(enable_driver_dni_lookup=True),
                db=MagicMock(),
                current_user=user,
            )
        assert ei.value.status_code == 403


class TestRunnerFeatureFlagsRbac:
    def test_requires_delivery_view(self):
        from app.api.delivery import runner_feature_flags

        user = _user(permission_codenames=(PERMISSION_DELIVERY_OPERATE,))
        with pytest.raises(HTTPException) as ei:
            runner_feature_flags(db=MagicMock(), current_user=user)
        assert ei.value.status_code == 403

    def test_allowed_with_view(self):
        from app.api.delivery import runner_feature_flags

        user = _user(permission_codenames=("delivery:view",))
        db = MagicMock()
        mock_cfg = MagicMock()
        mock_cfg.enable_runner_simulate_order_ready = True
        with patch("app.api.delivery.get_delivery_config", return_value=mock_cfg):
            out = runner_feature_flags(db=db, current_user=user)
        assert out.enable_runner_simulate_order_ready is True
