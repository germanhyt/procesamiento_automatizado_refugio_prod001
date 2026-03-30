"""
Notificaciones push del módulo Delivery (Runner).
"""

import logging
from typing import Any, Dict, List

from sqlalchemy.exc import ProgrammingError

from app.core.delivery_constants import RUNNER_PUSH_ANDROID_CHANNEL_ID
from app.database import SessionLocal
from app.models.delivery import DeliveryRunnerPushToken
from app.services.expo_push import send_expo_push_messages

logger = logging.getLogger(__name__)


def _active_runner_expo_tokens() -> List[str]:
    db = SessionLocal()
    try:
        rows = (
            db.query(DeliveryRunnerPushToken.expo_push_token)
            .filter(DeliveryRunnerPushToken.is_active.is_(True))
            .all()
        )
        return [r[0] for r in rows if r and r[0]]
    except ProgrammingError as e:
        # p. ej. UndefinedTable si no se ejecutó patch_db_delivery.py en este entorno
        db.rollback()
        logger.warning(
            "delivery_push: no se pudo leer tokens (¿falta tabla?). "
            "Ejecute en el servidor: python patch_db_delivery.py — %s",
            e,
        )
        return []
    finally:
        db.close()


def notify_runners_new_driver_waiting_sync(
    driver_arrival_id: int,
    plataforma: str,
    codigo_ingresado: str,
) -> None:
    """
    Tarea en background: enviar push a todos los dispositivos Runner registrados.
    """
    tokens = _active_runner_expo_tokens()
    if not tokens:
        logger.info(
            "delivery_push: sin tokens Runner activos; omito push (driver_arrival_id=%s)",
            driver_arrival_id,
        )
        return
    title = "Driver en kiosko"
    body = f"{plataforma} · {codigo_ingresado}"
    # FCM exige valores string en data
    data: Dict[str, str] = {
        "type": "NUEVO_DRIVER_ESPERANDO",
        "driver_arrival_id": str(driver_arrival_id),
        "plataforma": str(plataforma),
        "codigo_ingresado": str(codigo_ingresado),
    }
    logger.info(
        "delivery_push: enviando %s notificación(es) Expo (driver_arrival_id=%s)",
        len(tokens),
        driver_arrival_id,
    )
    messages = []
    for t in tokens:
        msg: Dict[str, Any] = {
            "to": t,
            "title": title,
            "body": body,
            "data": data,
            "sound": "default",
            "priority": "high",
            "channelId": RUNNER_PUSH_ANDROID_CHANNEL_ID,
        }
        messages.append(msg)
    send_expo_push_messages(messages)
