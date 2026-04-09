"""
Persistencia de avisos Runner (bandeja API): misma audiencia que los push Expo.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple

from sqlalchemy.dialects.postgresql import insert as db_insert
from sqlalchemy.orm import Session

from app.models.auth import Permission, User, user_roles
from app.models.delivery import DeliveryRunnerPushToken, RunnerNotification

logger = logging.getLogger(__name__)


def active_runner_push_targets(db: Session) -> Tuple[List[int], List[str]]:
    """
    - user_ids: usuarios con fila activa en delivery_runner_push_tokens (cualquier dispositivo).
      Sirve para bandeja API aunque el token Expo venga vacío o falle el registro en el dispositivo.
    - tokens: solo strings Expo no vacíos (audiencia real del push).
    """
    rows: Sequence[DeliveryRunnerPushToken] = (
        db.query(DeliveryRunnerPushToken)
        .filter(DeliveryRunnerPushToken.is_active.is_(True))
        .all()
    )
    seen_users: set[int] = set()
    user_ids: List[int] = []
    tokens: List[str] = []
    for r in rows:
        uid = r.user_id
        if uid not in seen_users:
            seen_users.add(uid)
            user_ids.append(uid)
        tok = (r.expo_push_token or "").strip()
        if tok:
            tokens.append(tok)
    user_ids.sort()
    return user_ids, tokens


def user_ids_with_delivery_view(db: Session) -> List[int]:
    """Misma audiencia base que el WebSocket `/api/delivery/ws` (operadores Runner/con panel)."""
    perm = db.query(Permission).filter(Permission.codename == "delivery:view").first()
    if not perm:
        return []
    role_ids = [r.id for r in perm.roles]
    if not role_ids:
        return []
    from_users = {
        row[0]
        for row in (
            db.query(User.id)
            .join(user_roles, User.id == user_roles.c.user_id)
            .filter(user_roles.c.role_id.in_(role_ids), User.is_active.is_(True))
            .distinct()
            .all()
        )
    }
    supers = {
        row[0]
        for row in db.query(User.id).filter(User.is_active.is_(True), User.is_superuser.is_(True)).all()
    }
    return sorted(from_users | supers)


def runner_push_and_inbox_recipients(db: Session) -> Tuple[List[int], List[str]]:
    """
    - user_ids: unión de (WS) delivery:view y quienes tienen fila activa en push tokens —
      la bandeja API acompaña al broadcast aunque no haya Expo token.
    - tokens: destinos Expo (solo strings no vacíos).
    """
    uid_tok, tokens = active_runner_push_targets(db)
    uid_view = user_ids_with_delivery_view(db)
    merged = sorted(set(uid_tok) | set(uid_view))
    return merged, tokens


def record_runner_notifications_for_users(
    db: Session,
    user_ids: List[int],
    *,
    kind: str,
    title: str,
    body: str,
    dedupe_key: str,
    order_id: Optional[int] = None,
    driver_arrival_id: Optional[int] = None,
) -> None:
    """INSERT … ON CONFLICT DO NOTHING; el llamador hace commit."""
    if not user_ids:
        return
    title_t = (title or "")[:200]
    body_t = (body or "")[:500]
    key_t = (dedupe_key or "")[:120]
    kind_t = (kind or "")[:40]
    payload = [
        {
            "user_id": uid,
            "kind": kind_t,
            "title": title_t,
            "body": body_t,
            "dedupe_key": key_t,
            "order_id": order_id,
            "driver_arrival_id": driver_arrival_id,
        }
        for uid in user_ids
    ]
    stmt = db_insert(RunnerNotification.__table__).values(payload)
    stmt = stmt.on_conflict_do_nothing(constraint="uq_delivery_runner_notifications_user_dedupe")
    try:
        db.execute(stmt)
    except Exception as e:
        logger.warning("delivery_runner_notifications: insert falló — %s", e)
        raise


def delete_all_runner_notifications_for_user(db: Session, user_id: int) -> None:
    db.query(RunnerNotification).filter(RunnerNotification.user_id == user_id).delete(synchronize_session=False)


def mark_all_runner_notifications_read(db: Session, user_id: int) -> None:
    now = datetime.now(timezone.utc)
    (
        db.query(RunnerNotification)
        .filter(RunnerNotification.user_id == user_id, RunnerNotification.read_at.is_(None))
        .update({RunnerNotification.read_at: now}, synchronize_session=False)
    )
