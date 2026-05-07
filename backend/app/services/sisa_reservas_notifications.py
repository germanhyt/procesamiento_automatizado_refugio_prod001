# -*- coding: utf-8 -*-
"""Webhook n8n: reservas Sisa próximas (pendientes / confirmadas) según anticipación configurada."""
from __future__ import annotations

import html
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import requests
from sqlalchemy.orm import Session

from app.models.sisa_reservas import SisaReservaRegistro, SisaReservasNotificacionesConfig

logger = logging.getLogger(__name__)

_TZ = ZoneInfo("America/Lima")


def ensure_sisa_notificaciones_config_table(db: Session) -> None:
    from app.database import engine

    SisaReservasNotificacionesConfig.__table__.create(engine, checkfirst=True)
    if db.get(SisaReservasNotificacionesConfig, 1) is None:
        db.add(
            SisaReservasNotificacionesConfig(
                id=1,
                schedule_enabled=False,
                schedule_interval_minutes=15,
                anticipation_minutes=120,
                include_confirmados=False,
            )
        )
        db.commit()


def _config_to_out(row: SisaReservasNotificacionesConfig) -> Dict[str, Any]:
    url = (row.n8n_webhook_url or "").strip() or None
    sec = (row.n8n_webhook_secret or "").strip()
    return {
        "schedule_enabled": row.schedule_enabled,
        "schedule_interval_minutes": int(row.schedule_interval_minutes),
        "anticipation_minutes": int(row.anticipation_minutes),
        "include_confirmados": bool(row.include_confirmados),
        "timezone": "America/Lima",
        "n8n_webhook_url": url,
        "n8n_webhook_secret_configured": bool(sec),
    }


def get_notificaciones_config_dict(db: Session) -> Dict[str, Any]:
    ensure_sisa_notificaciones_config_table(db)
    row = db.get(SisaReservasNotificacionesConfig, 1)
    if row is None:
        return {
            "schedule_enabled": False,
            "schedule_interval_minutes": 15,
            "anticipation_minutes": 120,
            "include_confirmados": False,
            "timezone": "America/Lima",
            "n8n_webhook_url": None,
            "n8n_webhook_secret_configured": False,
        }
    return _config_to_out(row)


def reserva_datetime_lima(r: SisaReservaRegistro) -> datetime:
    d = r.fecha_reserva
    t = r.hora_reserva
    return datetime(d.year, d.month, d.day, t.hour, t.minute, t.second if t.second else 0, tzinfo=_TZ)


def _html_table_row(label: str, value: str) -> str:
    label_e = html.escape(label)
    val = (value or "").strip()
    v_e = html.escape(val) if val else "—"
    return (
        f'<tr><td style="padding:5px 14px 5px 0;vertical-align:top;color:#555;width:118px;font-size:13px;">'
        f"<strong>{label_e}</strong></td>"
        f'<td style="padding:5px 0;vertical-align:top;font-size:13px;color:#111;">{v_e}</td></tr>'
    )


def _cuerpo_html_tarjeta_reserva(r: SisaReservaRegistro, res_dt: datetime, zona_nom: str) -> str:
    """Fragmento HTML (una reserva) con estilos inline aptos para Gmail / nodos de correo en n8n."""
    zona_display = (zona_nom or "").strip() or f"Zona #{r.zona_id}"
    fecha_hora = f"{r.fecha_reserva} {str(r.hora_reserva)[:5]}"
    tel = f"{(r.codigo_telefonico or '').strip()} {(r.numero_telefono or '').strip()}".strip()
    comentario = (r.comentario or "").strip()
    bloque_comentario = ""
    if comentario:
        c_esc = html.escape(comentario)
        bloque_comentario = (
            f'<tr><td colspan="2" style="padding-top:10px;border-top:1px solid #eee;">'
            f'<strong style="color:#555;font-size:13px;">Comentario</strong><br/>'
            f'<span style="white-space:pre-wrap;font-size:13px;color:#111;">{c_esc}</span></td></tr>'
        )
    rows_inner = "".join(
        [
            _html_table_row("Cliente", r.nombre_completo or ""),
            _html_table_row("Motivo", r.motivo_reserva or ""),
            _html_table_row("Fecha y hora", fecha_hora),
            # _html_table_row("Inicio (ISO)", res_dt.isoformat()),
            _html_table_row("Personas", str(r.numero_personas)),
            _html_table_row("Zona", zona_display),
            # _html_table_row("Estado", r.estado or ""),
            _html_table_row("Teléfono", tel),
            _html_table_row("Email", r.email or ""),
            bloque_comentario,
        ]
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        'style="margin-bottom:18px;border-collapse:collapse;">'
        '<tr><td style="padding:16px 18px;border:1px solid #ddd;border-radius:10px;background:#f9f9fb;">'
        '<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1a1a1a;">Reserva próxima · Sisa</p>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        'style="border-collapse:collapse;">'
        f"{rows_inner}"
        "</table>"
        "</td></tr></table>"
    )


def _cuerpo_html_email_batch(tarjetas: List[str], *, intro: str) -> str:
    """Documento HTML de correo: intro + tarjetas. Mapear en n8n como cuerpo del mensaje (HTML)."""
    intro_e = html.escape(intro)
    pie = html.escape("Refugio · Sisa Reservas — notificación de proximidad.")
    return (
        '<div style="font-family:Segoe UI,system-ui,Roboto,Helvetica,Arial,sans-serif;'
        'font-size:14px;line-height:1.5;color:#222;max-width:640px;margin:0;">'
        f'<p style="margin:0 0 14px;color:#444;font-size:14px;">{intro_e}</p>'
        f'{"".join(tarjetas)}'
        f'<p style="margin:18px 0 0;font-size:11px;color:#888;">{pie}</p>'
        "</div>"
    )


def collect_reservas_proximas(
    db: Session,
    *,
    anticipation_minutes: int,
    include_confirmados: bool,
    only_never_sent: bool = True,
) -> List[SisaReservaRegistro]:
    """Reservas en ventana [anticipación .. hora de la reserva).

    Si only_never_sent es True (job programado), excluye las que ya recibieron el webhook
    de proximidad. Si es False (disparo manual), permite reenviar aunque ya estén marcadas.
    """
    estados = ["pendiente"]
    if include_confirmados:
        estados.append("confirmado")
    now = datetime.now(_TZ)
    lim_inf_fecha = (now - timedelta(days=1)).date()

    q = db.query(SisaReservaRegistro).filter(
        SisaReservaRegistro.estado.in_(estados),
        SisaReservaRegistro.fecha_reserva >= lim_inf_fecha,
    )
    if only_never_sent:
        q = q.filter(SisaReservaRegistro.proximity_webhook_sent_at.is_(None))
    rows = q.order_by(SisaReservaRegistro.fecha_reserva, SisaReservaRegistro.hora_reserva).all()
    out: List[SisaReservaRegistro] = []
    delta = timedelta(minutes=anticipation_minutes)
    for r in rows:
        res_dt = reserva_datetime_lima(r)
        notify_at = res_dt - delta
        if notify_at <= now < res_dt:
            out.append(r)
    return out


def build_sisa_proximity_payload(
    db: Session,
    *,
    trigger: str,
    evaluated_at: datetime,
    anticipation_minutes: int,
    include_confirmados: bool,
    items: List[SisaReservaRegistro],
) -> Dict[str, Any]:
    from app.models.sisa_reservas import SisaReservaZona

    zona_ids = {r.zona_id for r in items}
    zonas = {z.id: z.nombre for z in db.query(SisaReservaZona).filter(SisaReservaZona.id.in_(zona_ids)).all()}
    reservas: List[Dict[str, Any]] = []
    tarjetas_html: List[str] = []
    for r in items:
        res_dt = reserva_datetime_lima(r)
        zona_nom = zonas.get(r.zona_id, "") or f"Zona #{r.zona_id}"
        asunto_item = (
            f"[Sisa Reservas] Próxima reserva — {r.nombre_completo} ({r.fecha_reserva} {str(r.hora_reserva)[:5]})"
        )
        cuerpo_item = _cuerpo_html_tarjeta_reserva(r, res_dt, zona_nom)
        tarjetas_html.append(cuerpo_item)
        reservas.append(
            {
                "id": r.id,
                "nombre_completo": r.nombre_completo,
                "fecha_reserva": r.fecha_reserva.isoformat(),
                "hora_reserva": r.hora_reserva.isoformat() if hasattr(r.hora_reserva, "isoformat") else str(r.hora_reserva),
                "reservation_datetime_iso": res_dt.isoformat(),
                "estado": r.estado,
                "motivo_reserva": r.motivo_reserva,
                "numero_personas": r.numero_personas,
                "zona_id": r.zona_id,
                "zona_nombre": zonas.get(r.zona_id),
                "mesa_id": r.mesa_id,
                "codigo_telefonico": r.codigo_telefonico,
                "numero_telefono": r.numero_telefono,
                "email": r.email,
                "comentario": r.comentario,
                "asunto": asunto_item,
                "cuerpo_html": cuerpo_item,
            }
        )

    n = len(items)
    if n == 1:
        asunto_correo = reservas[0]["asunto"]
        intro = "Hay 1 reserva dentro de la ventana de anticipación configurada."
    else:
        asunto_correo = (
            f"[Sisa Reservas] {n} reservas próximas · "
            f"{evaluated_at.strftime('%Y-%m-%d %H:%M')} (America/Lima)"
        )
        intro = (
            f"Hay {n} reservas dentro de la ventana de anticipación configurada "
            f"({anticipation_minutes} min antes de cada hora reservada)."
        )
    cuerpo_correo = _cuerpo_html_email_batch(tarjetas_html, intro=intro)

    return {
        "trigger": trigger,
        "source": "sisa_reservas_proximity",
        "timezone": "America/Lima",
        "evaluated_at": evaluated_at.isoformat(),
        "anticipation_minutes": anticipation_minutes,
        "include_confirmados": include_confirmados,
        "asunto": asunto_correo,
        "cuerpo_html": cuerpo_correo,
        "reservas": reservas,
    }


def post_sisa_webhook(db: Session, payload: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    ensure_sisa_notificaciones_config_table(db)
    row = db.get(SisaReservasNotificacionesConfig, 1)
    url = ((row.n8n_webhook_url if row else None) or "").strip()
    if not url:
        logger.warning("sisa n8n_webhook_url no configurada; POST omitido")
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
        logger.exception("Fallo POST webhook Sisa reservas: %s", exc)
        return False, str(exc)


def ejecutar_envio_proximidad(db: Session, *, trigger: str) -> Dict[str, Any]:
    ensure_sisa_notificaciones_config_table(db)
    cfg = db.get(SisaReservasNotificacionesConfig, 1)
    if cfg is None:
        return {"ok": False, "enviado": False, "items": 0, "error": "sin_config", "razon": "sin_config"}

    anticipation = int(cfg.anticipation_minutes)
    include_conf = bool(cfg.include_confirmados)
    items = collect_reservas_proximas(
        db,
        anticipation_minutes=anticipation,
        include_confirmados=include_conf,
        only_never_sent=(trigger != "manual"),
    )
    if not items:
        return {"ok": True, "enviado": False, "items": 0, "error": None, "razon": "sin_reservas_en_ventana"}

    now = datetime.now(_TZ)
    payload = build_sisa_proximity_payload(
        db,
        trigger=trigger,
        evaluated_at=now,
        anticipation_minutes=anticipation,
        include_confirmados=include_conf,
        items=items,
    )
    ok, err = post_sisa_webhook(db, payload)
    if ok:
        for r in items:
            r.proximity_webhook_sent_at = now
        db.commit()
        return {"ok": True, "enviado": True, "items": len(items), "error": None, "razon": None}
    db.rollback()
    return {"ok": False, "enviado": False, "items": len(items), "error": err, "razon": "post_fallido"}
