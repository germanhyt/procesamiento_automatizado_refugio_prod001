# -*- coding: utf-8 -*-
"""Tests de importación Excel → stg_sales (lógica de respuesta, sin BD)."""
import asyncio
from unittest.mock import patch

import pandas as pd

from app.services.legacy_service import LegacyService


def _legacy_service_stub() -> LegacyService:
    return object.__new__(LegacyService)


def test_import_staging_dry_run_reports_excel_rows():
    service = _legacy_service_stub()
    df = pd.DataFrame({
        "CodigoNegocio": ["A01", "A02"],
        "Monto": [10.0, 20.0],
        "FechaHora": ["2026-06-01 10:00:00", "2026-06-02 11:00:00"],
        "CodigoTransaccion": ["T1", "T2"],
    })

    with (
        patch.object(service, "_resolve_config_web_workbook", return_value="/tmp/ConfiguracionWeb.xlsx"),
        patch.object(service, "_read_config_sheet", return_value=df),
        patch("app.services.legacy_service.count_staging_rows", return_value=5),
    ):
        out = asyncio.run(
            service.import_sales_staging_from_excel(clear_before=False, dry_run=True)
        )

    assert out["success"] is True
    assert out["dry_run"] is True
    assert out["excel_rows"] == 2
    assert out["pg_rows_before"] == 5
    assert out["would_clear"] is False


def test_import_staging_empty_excel():
    service = _legacy_service_stub()
    empty = pd.DataFrame()

    with (
        patch.object(service, "_resolve_config_web_workbook", return_value="/tmp/ConfiguracionWeb.xlsx"),
        patch.object(service, "_read_config_sheet", return_value=empty),
        patch("app.services.legacy_service.count_staging_rows", return_value=0),
    ):
        out = asyncio.run(service.import_sales_staging_from_excel(dry_run=False))

    assert out["success"] is True
    assert out["excel_rows"] == 0
    assert "vacío" in out["message"].lower()


def test_staging_status_active_source_postgres_when_pg_has_rows():
    service = _legacy_service_stub()

    with (
        patch.object(service, "_resolve_config_web_workbook", return_value="/cfg.xlsx"),
        patch.object(service, "_read_config_sheet", return_value=pd.DataFrame({"Monto": [1.0]})),
        patch("app.services.legacy_service.get_sales_staging_mode", return_value="dual"),
        patch("app.services.legacy_service.uses_postgres_staging", return_value=True),
        patch("app.services.legacy_service.uses_excel_staging", return_value=True),
        patch("app.services.legacy_service.count_staging_rows", return_value=100),
        patch("app.services.legacy_service.sum_staging_monto", return_value=5000.0),
        patch("app.services.legacy_service.get_realizadas_staging_mode", return_value="dual"),
        patch("app.services.legacy_service.count_realizadas_staging_rows", return_value=10),
        patch("app.services.legacy_service.count_realizadas_pendientes_bq", return_value=2),
        patch("app.services.legacy_service.uses_postgres_realizadas_staging", return_value=True),
        patch("app.services.legacy_service.uses_excel_realizadas_staging", return_value=True),
    ):
        out = asyncio.run(service.get_sales_staging_status())

    assert out["success"] is True
    assert out["staging_mode"] == "dual"
    assert out["active_source"] == "postgresql"
    assert out["postgresql"]["rows"] == 100
