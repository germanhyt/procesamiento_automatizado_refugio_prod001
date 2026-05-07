# -*- coding: utf-8 -*-
"""Constantes del módulo Reservas Sisa (alineadas con frontend cuando exista el SPA)."""

MOTIVOS_RESERVA = (
    "Desayuno",
    "Almuerzo",
    "Cena",
    "Corporativo",
    "Experiencia especial",
)

ESTADOS_RESERVA = (
    "pendiente",
    "confirmado",
    "en_proceso_atencion",
    "atendido",
    "finalizado",
    "cancelado",
)

DEFAULT_CODIGO_TELEFONICO = "+51"

MOTIVOS_SET = frozenset(MOTIVOS_RESERVA)
ESTADOS_SET = frozenset(ESTADOS_RESERVA)
    