"""Semilla idempotente de bosque_magico_config (valores alineados al prototipo CRM / landing)."""

from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.bosque_magico import BosqueMagicoConfig

DEFAULT_CONFIG_ROWS: List[Dict[str, Any]] = [
    {
        "config_key": "pricing.weekday_base",
        "value": 380,
        "description": "Tarifa base espacio L–V (referencia)",
    },
    {
        "config_key": "pricing.weekend_base",
        "value": 580,
        "description": "Tarifa base espacio fin de semana (referencia)",
    },
    {
        "config_key": "pricing.extra_child_unit",
        "value": 25,
        "description": "Cargo por niño adicional (26–35)",
    },
    {
        "config_key": "pricing.children_included",
        "value": 25,
        "description": "Niños incluidos en base sin cargo extra",
    },
    {
        "config_key": "pricing.max_children_extra_cap",
        "value": 35,
        "description": "Tope de niños para cálculo de extras (referencia landing)",
    },
]


def seed_bosque_magico_config_if_missing(db: Session) -> int:
    """Inserta filas faltantes. Devuelve cantidad insertada."""
    n = 0
    for row in DEFAULT_CONFIG_ROWS:
        exists = (
            db.query(BosqueMagicoConfig)
            .filter(BosqueMagicoConfig.config_key == row["config_key"])
            .first()
        )
        if exists:
            continue
        db.add(
            BosqueMagicoConfig(
                config_key=row["config_key"],
                value=row["value"],
                description=row.get("description"),
            )
        )
        n += 1
    return n
