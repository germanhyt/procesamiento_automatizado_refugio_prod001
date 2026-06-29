"""Auditoría de acciones en centro de control / panel admin delivery."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.delivery_constants import DELIVERY_AUDIT_SOURCE_ADMIN
from app.models.auth import User
from app.models.delivery import DeliveryControlAuditLog


def log_delivery_control_action(
    db: Session,
    user: User,
    *,
    action: str,
    source: str = DELIVERY_AUDIT_SOURCE_ADMIN,
    order_id: Optional[int] = None,
    driver_arrival_id: Optional[int] = None,
    detail: Optional[str] = None,
) -> DeliveryControlAuditLog:
    row = DeliveryControlAuditLog(
        user_id=getattr(user, "id", None),
        username=getattr(user, "username", None),
        action=action,
        source=source,
        order_id=order_id,
        driver_arrival_id=driver_arrival_id,
        detail=(detail or "")[:500] or None,
    )
    db.add(row)
    db.flush()
    return row


def list_control_audit_logs(db: Session, *, limit: int = 50) -> list[DeliveryControlAuditLog]:
    lim = max(1, min(limit, 200))
    return (
        db.query(DeliveryControlAuditLog)
        .order_by(DeliveryControlAuditLog.created_at.desc(), DeliveryControlAuditLog.id.desc())
        .limit(lim)
        .all()
    )


def audit_row_to_dict(row: DeliveryControlAuditLog) -> dict[str, Any]:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "username": row.username,
        "action": row.action,
        "source": row.source,
        "order_id": row.order_id,
        "driver_arrival_id": row.driver_arrival_id,
        "detail": row.detail,
        "created_at": row.created_at,
    }
