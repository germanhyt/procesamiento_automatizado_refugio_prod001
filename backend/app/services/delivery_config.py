# -*- coding: utf-8 -*-
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.delivery import DeliveryConfig


def get_delivery_config(db: Session) -> DeliveryConfig:
    """Fila singleton id=1; crea defaults si no existe."""
    row = db.get(DeliveryConfig, 1)
    if row is None:
        row = DeliveryConfig(
            id=1,
            enable_driver_dni_lookup=False,
            enable_driver_photo_capture=False,
            enable_runner_simulate_order_ready=True,
        )
        db.add(row)
        db.flush()
    return row
