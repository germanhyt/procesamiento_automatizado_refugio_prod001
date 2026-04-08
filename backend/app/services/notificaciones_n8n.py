# -*- coding: utf-8 -*-
"""Payload JSON para Webhook n8n y envío HTTP."""
from __future__ import annotations

import html
import logging
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import requests
from sqlalchemy.orm import Session

from app.models.notificaciones_config import NotificacionesEnvioConfig

logger = logging.getLogger(__name__)


def build_n8n_payload(
    *,
    trigger: str,
    modo: str,
    periodo_inicio: date,
    periodo_fin: date,
    dias_periodo: List[str],
    etiqueta: str,
    items: List[dict],
) -> Dict[str, Any]:
    n8n_items: List[Dict[str, Any]] = []
    for r in items:
        text = r.get("sugerencia_notificacion") or ""
        safe = html.escape(text)
        nombre = r.get("nombre") or ""
        n8n_items.append(
            {
                "codigo": r.get("codigo"),
                "nombre": nombre,
                "emails_notificacion": list(r.get("emails_notificacion") or []),
                "cuerpo_html": f"<p>{safe}</p>" if safe else "<p>(Sin texto)</p>",
                "asunto": f"[Refugio] Cierre de caja pendiente — {nombre}",
            }
        )
    return {
        "trigger": trigger,
        "periodo": {
            "modo": modo,
            "periodo_inicio": periodo_inicio.isoformat(),
            "periodo_fin": periodo_fin.isoformat(),
            "etiqueta": etiqueta,
            "dias_periodo": dias_periodo,
        },
        "items": n8n_items,
    }


def post_n8n_webhook(db: Session, payload: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    row = db.get(NotificacionesEnvioConfig, 1)
    url = ((row.n8n_webhook_url if row else None) or "").strip()
    if not url:
        logger.warning("n8n_webhook_url no configurada en notificaciones_envio_config; omiso POST")
        return False, "webhook_url_no_configurada"
    headers = {"Content-Type": "application/json"}
    secret = ((row.n8n_webhook_secret if row else None) or "").strip()
    if secret:
        headers["Authorization"] = f"Bearer {secret}"
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=120)
        resp.raise_for_status()
        return True, None
    except requests.RequestException as exc:  # pragma: no cover - red
        logger.exception("Fallo POST n8n: %s", exc)
        return False, str(exc)


def ejecutar_envio_n8n_desde_evaluacion(
    db: Session,
    *,
    trigger: str,
    modo: str,
    periodo_inicio: date,
    periodo_fin: date,
    etiqueta: str,
    ventana_rodante: bool,
) -> Dict[str, Any]:
    from app.services.notificaciones_contactos import attach_emails_notificacion
    from app.services.notificaciones_service import (
        evaluar_locatarios_pendientes_periodo,
        lista_dias_periodo_iso,
    )

    rows = evaluar_locatarios_pendientes_periodo(
        periodo_inicio, periodo_fin, ventana_rodante=ventana_rodante
    )
    attach_emails_notificacion(db, rows)
    alertas = [r for r in rows if r["alerta"]]
    if not alertas:
        return {"ok": True, "enviado": False, "razon": "sin_alertas", "items": 0, "error": None}
    dias = lista_dias_periodo_iso(periodo_inicio, periodo_fin)
    payload = build_n8n_payload(
        trigger=trigger,
        modo=modo,
        periodo_inicio=periodo_inicio,
        periodo_fin=periodo_fin,
        dias_periodo=dias,
        etiqueta=etiqueta,
        items=alertas,
    )
    ok, err = post_n8n_webhook(db, payload)
    return {"ok": ok, "enviado": ok, "items": len(alertas), "error": err, "razon": None if ok else "post_fallido"}
