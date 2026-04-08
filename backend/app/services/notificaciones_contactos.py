# -*- coding: utf-8 -*-
"""Correos de notificación por locatario (delivery_restaurants + notification_emails)."""
from __future__ import annotations

from typing import Dict, List

from sqlalchemy.orm import Session

from app.models.delivery import Restaurant, RestaurantNotificationEmail


def load_notification_emails_by_fidelio(db: Session) -> Dict[str, List[str]]:
    """
    Devuelve fidelio_id -> emails (minúsculas, sin duplicados, orden por id de fila email).
    Solo aparecen locatarios con al menos un correo en BD.
    """
    pairs = (
        db.query(Restaurant.fidelio_id, RestaurantNotificationEmail.email)
        .join(RestaurantNotificationEmail, RestaurantNotificationEmail.restaurant_id == Restaurant.id)
        .order_by(Restaurant.fidelio_id, RestaurantNotificationEmail.id)
        .all()
    )
    out: Dict[str, List[str]] = {}
    seen: Dict[str, set[str]] = {}
    for fid, raw in pairs:
        em = (raw or "").strip().lower()
        if not em:
            continue
        if fid not in seen:
            seen[fid] = set()
            out[fid] = []
        if em not in seen[fid]:
            seen[fid].add(em)
            out[fid].append(em)
    return out


def attach_emails_notificacion(db: Session, rows: List[dict]) -> None:
    """Añade la clave emails_notificacion a cada dict (mutación in-place)."""
    m = load_notification_emails_by_fidelio(db)
    for r in rows:
        r["emails_notificacion"] = list(m.get(r.get("codigo", ""), []))
