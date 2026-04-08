# -*- coding: utf-8 -*-
"""
Correos de notificación por locatario (sync con n8n map_locatarios).

Cada `locatario` debe coincidir con el sufijo de `LOCATARIOS[].codigo` tras el
primer guión bajo (ej. BARRIO_MANCORA → A03_BARRIO_MANCORA).
"""
from __future__ import annotations

from typing import List, TypedDict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import LOCATARIOS
from app.models.delivery import Restaurant, RestaurantNotificationEmail


class LocatarioEmailsEntry(TypedDict):
    locatario: str
    emails: List[str]


# Datos provistos por negocio (equivalente al map_locatarios de n8n)
LOCATARIO_NOTIFICATION_EMAILS: List[LocatarioEmailsEntry] = [
    {
        "locatario": "BARRIO_MANCORA",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "glennys.huaihua@puertosunidos.com",
            "karolinacalderonde@gmail.com",
        ],
    },
    {
        "locatario": "PATIO_CAVENECIA",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "steakrefugio@gmail.com",
            "janethcarcamo13@gmail.com",
        ],
    },
    {
        "locatario": "MR_SMASH",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "admimrsmash@gmail.com",
        ],
    },
    {
        "locatario": "LA_22",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "lroque.reyes@la22.pe",
            "finanzas@la22.pe",
        ],
    },
    {
        "locatario": "HANZO",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "gakanashiro@gmail.com",
            "julioendo81@gmail.com",
        ],
    },
    {
        "locatario": "CAJA_CHINA_CRIOLLA",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "edsondesouza@hotmail.com",
        ],
    },
    {
        "locatario": "ANTICUCHING",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "nathaly.angel.chingay@gmail.com",
            "julioendo81@gmail.com",
        ],
    },
    {
        "locatario": "CHOZA_DE_LA_ANACONDA",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "jccrisanto10@gmail.com",
            "chozadelaanacondarefugio.11@gmail.com",
        ],
    },
    {
        "locatario": "TORTAS_GABY",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "admrefugio@tortasgaby.com.pe",
        ],
    },
    {
        "locatario": "DON_MELCHOR",
        "emails": [
            "refugiogastronomico8222@gmail.com",
            "carlos@refugiogastronomico.pe",
            "mario@refugiogastronomico.pe",
            "refugio.adm1@grupobalta.net",
            "refugio.adm2@grupobalta.net",
        ],
    },
]


def _suffix_to_fidelio_id() -> dict[str, str]:
    out: dict[str, str] = {}
    for loc in LOCATARIOS:
        codigo = loc["codigo"]
        if "_" not in codigo:
            continue
        suffix = codigo.split("_", 1)[1]
        out[suffix] = codigo
    return out


def seed_locatario_notification_emails(db: Session) -> None:
    """Inserta correos faltantes en delivery_restaurant_notification_emails (idempotente)."""
    mapping = _suffix_to_fidelio_id()
    for entry in LOCATARIO_NOTIFICATION_EMAILS:
        key = entry["locatario"]
        fidelio_id = mapping.get(key)
        if not fidelio_id:
            print(f">>> (aviso) locatario sin match en LOCATARIOS: {key}")
            continue
        restaurant = db.query(Restaurant).filter(Restaurant.fidelio_id == fidelio_id).first()
        if not restaurant:
            print(f">>> (aviso) restaurante no existe en BD: {fidelio_id}")
            continue
        for raw in entry["emails"]:
            em = str(raw).strip().lower()
            if not em:
                continue
            exists = (
                db.query(RestaurantNotificationEmail)
                .filter(
                    RestaurantNotificationEmail.restaurant_id == restaurant.id,
                    func.lower(RestaurantNotificationEmail.email) == em,
                )
                .first()
            )
            if exists:
                continue
            db.add(RestaurantNotificationEmail(restaurant_id=restaurant.id, email=em))
