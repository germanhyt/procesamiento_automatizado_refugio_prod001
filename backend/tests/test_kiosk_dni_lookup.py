# -*- coding: utf-8 -*-
"""
Tests unitarios: endpoint /kiosk/dni-lookup (proxy DeColecta).

Valida:
- Normalización de campos en distintos formatos (camelCase, snake_case, español)
- Construcción de full_name cuando no viene directo
- Manejo correcto de errores HTTP (404, 502, 503)
- Validación de formato DNI

Ejecutar:
    cd backend
    PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/test_kiosk_dni_lookup.py -v
"""
import os
from unittest.mock import MagicMock, patch



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_response(status_code: int, json_body: dict | None = None, text: str = ""):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_body or {}
    mock.text = text
    return mock


# ---------------------------------------------------------------------------
# Normalización de respuesta DeColecta
# ---------------------------------------------------------------------------

class TestDniNormalization:
    """Verifica que la lógica de normalización mapea todos los formatos posibles."""

    def _run(self, raw: dict) -> dict:
        """Reproduce la lógica de _pick del endpoint sin levantar el servidor."""
        def _pick(*keys, src=raw):
            for k in keys:
                v = src.get(k) or ""
                if v:
                    return str(v).strip()
            return ""

        first_name  = _pick("first_name", "nombres", "nombre")
        first_last  = _pick("first_last_name", "apellido_paterno", "apellidoPaterno", "last_name")
        second_last = _pick("second_last_name", "apellido_materno", "apellidoMaterno")
        full_name   = _pick("full_name", "nombre_completo", "nombreCompleto", "name")
        doc_number  = _pick("document_number", "numero", "dni", "numero_documento")

        if not full_name:
            parts = [p for p in [first_name, first_last, second_last] if p]
            full_name = " ".join(parts) if parts else ""

        return {
            "first_name": first_name,
            "first_last_name": first_last,
            "second_last_name": second_last,
            "full_name": full_name or doc_number,
            "document_number": doc_number,
        }

    def test_english_snake_case(self):
        raw = {
            "first_name": "JUAN",
            "first_last_name": "PEREZ",
            "second_last_name": "LOPEZ",
            "full_name": "JUAN PEREZ LOPEZ",
            "document_number": "12345678",
        }
        result = self._run(raw)
        assert result["full_name"] == "JUAN PEREZ LOPEZ"
        assert result["first_name"] == "JUAN"
        assert result["document_number"] == "12345678"

    def test_spanish_keys(self):
        raw = {
            "nombres": "MARIA",
            "apellido_paterno": "GARCIA",
            "apellido_materno": "TORRES",
            "numero": "87654321",
        }
        result = self._run(raw)
        assert result["first_name"] == "MARIA"
        assert result["first_last_name"] == "GARCIA"
        assert result["second_last_name"] == "TORRES"
        assert result["full_name"] == "MARIA GARCIA TORRES"

    def test_camel_case_keys(self):
        raw = {
            "nombre": "CARLOS",
            "apellidoPaterno": "QUISPE",
            "apellidoMaterno": "HUANCA",
            "numero_documento": "11223344",
        }
        result = self._run(raw)
        assert result["full_name"] == "CARLOS QUISPE HUANCA"

    def test_full_name_direct(self):
        raw = {"nombreCompleto": "ANA SOFIA VARGAS DIAZ", "dni": "99887766"}
        result = self._run(raw)
        assert result["full_name"] == "ANA SOFIA VARGAS DIAZ"

    def test_fallback_to_doc_number(self):
        """Si no hay nombre en ningún campo, full_name cae al número de documento."""
        raw = {"document_number": "55443322"}
        result = self._run(raw)
        assert result["full_name"] == "55443322"

    def test_partial_name_construction(self):
        """Construye full_name de partes disponibles aunque falte alguna."""
        raw = {"first_name": "PEDRO", "first_last_name": "MAMANI"}
        result = self._run(raw)
        assert result["full_name"] == "PEDRO MAMANI"


# ---------------------------------------------------------------------------
# Endpoint — llamada directa a la función (sin TestClient)
# ---------------------------------------------------------------------------

def _call_lookup(numero: str, api_key: str = "sk_test_fake", *, dni_lookup_enabled: bool = True):
    """Llama kiosk_dni_lookup directamente capturando HTTPException."""
    from unittest.mock import MagicMock
    from fastapi import HTTPException as _HTTPException
    from app.api.delivery import kiosk_dni_lookup
    mock_db = MagicMock()
    mock_cfg = MagicMock()
    mock_cfg.enable_driver_dni_lookup = dni_lookup_enabled
    with patch.dict(os.environ, {"DECOLECTA_API_KEY": api_key}), patch(
        "app.api.delivery.get_delivery_config", return_value=mock_cfg
    ):
        try:
            return kiosk_dni_lookup(numero=numero, db=mock_db)
        except _HTTPException as exc:
            return exc


class TestDniLookupEndpoint:

    def test_invalid_dni_letters(self):
        result = _call_lookup("ABCD1234")
        assert hasattr(result, "status_code")
        assert result.status_code == 422

    def test_invalid_dni_too_short(self):
        result = _call_lookup("1234")
        assert hasattr(result, "status_code")
        assert result.status_code == 422

    def test_lookup_disabled_returns_403(self):
        result = _call_lookup("12345678", dni_lookup_enabled=False)
        assert hasattr(result, "status_code")
        assert result.status_code == 403

    @patch("app.services.delivery_decolecta.requests.get")
    def test_success_full_response(self, mock_get):
        mock_get.return_value = _make_response(200, {
            "first_name": "LUIS",
            "first_last_name": "CONDORI",
            "second_last_name": "MAMANI",
            "full_name": "LUIS CONDORI MAMANI",
            "document_number": "12345678",
        })
        result = _call_lookup("12345678")
        assert isinstance(result, dict)
        assert result["full_name"] == "LUIS CONDORI MAMANI"
        assert result["document_number"] == "12345678"

    @patch("app.services.delivery_decolecta.requests.get")
    def test_success_spanish_keys(self, mock_get):
        """Valida normalización con claves en español que devuelve la API real."""
        mock_get.return_value = _make_response(200, {
            "nombres": "ROSA",
            "apellido_paterno": "FLORES",
            "apellido_materno": "VEGA",
            "numero": "87654321",
        })
        result = _call_lookup("87654321")
        assert isinstance(result, dict)
        assert result["full_name"] == "ROSA FLORES VEGA"

    @patch("app.services.delivery_decolecta.requests.get")
    def test_dni_not_found(self, mock_get):
        mock_get.return_value = _make_response(404, text="Not found")
        result = _call_lookup("00000000")
        assert hasattr(result, "status_code")
        assert result.status_code == 404

    @patch("app.services.delivery_decolecta.requests.get")
    def test_decolecta_server_error(self, mock_get):
        mock_get.return_value = _make_response(500, text="Internal Server Error")
        result = _call_lookup("12345678")
        assert hasattr(result, "status_code")
        assert result.status_code == 502

    @patch("app.services.delivery_decolecta.requests.get")
    def test_decolecta_connection_error(self, mock_get):
        import requests as req_lib
        mock_get.side_effect = req_lib.exceptions.ConnectionError("timeout")
        result = _call_lookup("12345678")
        assert hasattr(result, "status_code")
        assert result.status_code == 502

    def test_missing_api_key(self):
        result = _call_lookup("12345678", api_key="")
        assert hasattr(result, "status_code")
        assert result.status_code == 503
