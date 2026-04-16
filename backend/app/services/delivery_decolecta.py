# -*- coding: utf-8 -*-
"""Consulta RENIEC vía DeColecta (server-side)."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)


def _normalize_decolecta_response(raw: Dict[str, Any]) -> Dict[str, Any]:
    def _pick(*keys: str, src: dict = raw) -> str:
        for k in keys:
            v = src.get(k) or ""
            if v:
                return str(v).strip()
        return ""

    first_name = _pick("first_name", "nombres", "nombre")
    first_last = _pick("first_last_name", "apellido_paterno", "apellidoPaterno", "last_name")
    second_last = _pick("second_last_name", "apellido_materno", "apellidoMaterno")
    full_name = _pick("full_name", "nombre_completo", "nombreCompleto", "name")
    doc_number = _pick("document_number", "numero", "dni", "numero_documento")

    if not full_name:
        parts = [p for p in [first_name, first_last, second_last] if p]
        full_name = " ".join(parts) if parts else _pick("full_name", src=raw)

    return {
        "first_name": first_name,
        "first_last_name": first_last,
        "second_last_name": second_last,
        "full_name": full_name or doc_number,
        "document_number": doc_number,
        "_raw": raw,
    }


def fetch_reniec_dni_dict(numero: str) -> Dict[str, Any]:
    """
    Llama a DeColecta y devuelve el dict normalizado (mismo contrato que /kiosk/dni-lookup).
    Raises requests.HTTPError / RequestException en fallo de red.
    Raises ValueError si la API responde no-200.
    """
    api_key = os.getenv("DECOLECTA_API_KEY", "").strip()
    if not api_key:
        raise ValueError("DECOLECTA_API_KEY no configurada")

    url = "https://api.decolecta.com/v1/reniec/dni"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.get(url, params={"numero": numero.strip()}, headers=headers, timeout=8)
    if resp.status_code == 200:
        raw = resp.json()
        out = _normalize_decolecta_response(raw)
        out["full_name"] = out["full_name"] or numero.strip()
        out["document_number"] = out["document_number"] or numero.strip()
        return out
    if resp.status_code in (400, 404):
        raise ValueError("DNI no encontrado")
    raise ValueError(f"decolecta_status_{resp.status_code}")


def fetch_reniec_full_name_optional(numero: str) -> Optional[str]:
    """Para persistencia en alta de driver: no lanza HTTP; devuelve None si falla."""
    try:
        d = fetch_reniec_dni_dict(numero)
        fn = (d.get("full_name") or "").strip()
        return fn or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("RENIEC opcional falló para DNI %s: %s", numero[:4] + "****", exc)
        return None
