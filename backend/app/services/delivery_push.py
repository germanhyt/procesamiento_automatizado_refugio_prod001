"""
Notificaciones push del módulo Delivery (Runner).
"""

import logging
from typing import Any, Dict, List

from sqlalchemy.exc import ProgrammingError

from app.core.delivery_constants import (
    RUNNER_PUSH_ANDROID_CHANNEL_ID,
    RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH,
    RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
    RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
)
from app.database import SessionLocal
from app.models.delivery import DriverArrival, Order, Restaurant
from app.services.delivery_runner_notifications import (
    record_runner_notifications_for_users,
    runner_push_and_inbox_recipients,
)
from app.services.expo_push import send_expo_push_messages

logger = logging.getLogger(__name__)


def notify_runners_new_driver_waiting_sync(
    driver_arrival_id: int,
    plataforma: str,
    codigo_ingresado: str,
) -> None:
    """
    Tarea en background: persistir aviso + enviar push a todos los dispositivos Runner registrados.
    """
    plat = str(plataforma).strip().upper()
    code = str(codigo_ingresado).strip()
    db = SessionLocal()
    try:
        user_ids, tokens = runner_push_and_inbox_recipients(db)
        if not user_ids:
            logger.info(
                "delivery_push: sin usuarios delivery:view/superuser; omito bandeja y push (driver_arrival_id=%s)",
                driver_arrival_id,
            )
            return

        restaurant_nombre: str | None = None
        row = (
            db.query(DriverArrival, Restaurant)
            .join(Restaurant, DriverArrival.restaurant_id == Restaurant.id)
            .filter(DriverArrival.id == driver_arrival_id)
            .first()
        )
        if row:
            _da, rest = row
            restaurant_nombre = (rest.nombre or "").strip() or None

        title = "Driver en kiosko"
        if restaurant_nombre:
            body = f"{restaurant_nombre} · {plat} · {code}"
        else:
            body = f"{plat} · {code}"

        record_runner_notifications_for_users(
            db,
            user_ids,
            kind=RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
            title=title,
            body=body,
            dedupe_key=f"nuevo_driver:{driver_arrival_id}",
            driver_arrival_id=driver_arrival_id,
        )
        db.commit()
    except ProgrammingError as e:
        db.rollback()
        logger.warning(
            "delivery_push: fallo DB (¿falta patch?). Ejecute python patch_db_delivery.py — %s",
            e,
        )
        return
    except Exception:
        db.rollback()
        logger.exception("delivery_push: error antes de enviar Expo (nuevo_driver driver_arrival_id=%s)", driver_arrival_id)
        return
    finally:
        db.close()

    data: Dict[str, str] = {
        "type": RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
        "driver_arrival_id": str(driver_arrival_id),
        "plataforma": plat,
        "codigo_ingresado": code,
    }
    if restaurant_nombre:
        data["restaurant_nombre"] = restaurant_nombre
    if not tokens:
        logger.info(
            "delivery_push: bandeja persistida pero 0 tokens Expo; sin push (driver_arrival_id=%s)",
            driver_arrival_id,
        )
        return
    logger.info(
        "delivery_push: enviando %s notificación(es) Expo (driver_arrival_id=%s)",
        len(tokens),
        driver_arrival_id,
    )
    messages: List[Dict[str, Any]] = []
    for t in tokens:
        messages.append(
            {
                "to": t,
                "title": title,
                "body": body,
                "data": data,
                "sound": "default",
                "priority": "high",
                "channelId": RUNNER_PUSH_ANDROID_CHANNEL_ID,
            }
        )
    send_expo_push_messages(messages)


def notify_runners_kiosk_match_sync(
    order_id: int,
    driver_arrival_id: int,
    plataforma: str,
    codigo_pedido: str,
) -> None:
    """
    Match pedido ⇄ driver en kiosko (o manual): bandeja API + push Expo para Runners.
    """
    plat = str(plataforma).strip().upper()
    code = str(codigo_pedido).strip()
    db = SessionLocal()
    try:
        user_ids, tokens = runner_push_and_inbox_recipients(db)
        if not user_ids:
            logger.info(
                "delivery_push: sin destinatarios; omito KIOSK_MATCH (order_id=%s)",
                order_id,
            )
            return

        restaurant_id: int | None = None
        restaurant_label: str | None = None
        orow = (
            db.query(Order, Restaurant)
            .join(Restaurant, Order.restaurant_id == Restaurant.id)
            .filter(Order.id == order_id)
            .first()
        )
        if orow:
            _order, rest = orow
            restaurant_id = rest.id
            restaurant_label = (rest.nombre or "").strip() or None

        title = "Pedido enlazado"
        if restaurant_label:
            body = f"{restaurant_label} · {plat} · {code} · Driver asignado"
        else:
            body = f"{plat} · {code} · Driver asignado"

        record_runner_notifications_for_users(
            db,
            user_ids,
            kind=RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH,
            title=title,
            body=body,
            dedupe_key=f"kiosk_match:{order_id}:{driver_arrival_id}",
            order_id=order_id,
            driver_arrival_id=driver_arrival_id,
        )
        db.commit()
    except ProgrammingError as e:
        db.rollback()
        logger.warning(
            "delivery_push: fallo DB KIOSK_MATCH (¿falta patch?). — %s",
            e,
        )
        return
    except Exception:
        db.rollback()
        logger.exception("delivery_push: error antes de Expo KIOSK_MATCH (order_id=%s)", order_id)
        return
    finally:
        db.close()

    data: Dict[str, str] = {
        "type": RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH,
        "order_id": str(order_id),
        "driver_arrival_id": str(driver_arrival_id),
        "plataforma": plat,
        "codigo_pedido": code,
    }
    if restaurant_id is not None:
        data["restaurant_id"] = str(restaurant_id)
    if restaurant_label:
        data["restaurant_nombre"] = restaurant_label

    if not tokens:
        logger.info(
            "delivery_push: KIOSK_MATCH persistido pero 0 tokens Expo (order_id=%s)",
            order_id,
        )
        return
    logger.info(
        "delivery_push: enviando %s Expo KIOSK_MATCH (order_id=%s)",
        len(tokens),
        order_id,
    )
    messages: List[Dict[str, Any]] = []
    for t in tokens:
        messages.append(
            {
                "to": t,
                "title": title,
                "body": body,
                "data": data,
                "sound": "default",
                "priority": "high",
                "channelId": RUNNER_PUSH_ANDROID_CHANNEL_ID,
            }
        )
    send_expo_push_messages(messages)


def notify_runners_order_listo_sync(
    order_id: int,
    plataforma: str,
    codigo_pedido: str,
) -> None:
    """
    Tarea en background: Fidelio acaba de marcar el pedido como LISTO — persistir + push.
    """
    plat = str(plataforma).strip().upper()
    code = str(codigo_pedido).strip()
    db = SessionLocal()
    try:
        user_ids, tokens = runner_push_and_inbox_recipients(db)
        if not user_ids:
            logger.info(
                "delivery_push: sin usuarios delivery:view/superuser; omito bandeja y push PEDIDO_LISTO (order_id=%s)",
                order_id,
            )
            return

        restaurant_id: int | None = None
        restaurant_label: str | None = None
        orow = (
            db.query(Order, Restaurant)
            .join(Restaurant, Order.restaurant_id == Restaurant.id)
            .filter(Order.id == order_id)
            .first()
        )
        if orow:
            _order, rest = orow
            restaurant_id = rest.id
            restaurant_label = (rest.nombre or "").strip() or None

        title = "Pedido listo"
        if restaurant_label:
            body = f"{restaurant_label} · {plat} · {code}"
        else:
            body = f"{plat} · {code}"

        record_runner_notifications_for_users(
            db,
            user_ids,
            kind=RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
            title=title,
            body=body,
            dedupe_key=f"pedido_listo:{order_id}",
            order_id=order_id,
        )
        db.commit()
    except ProgrammingError as e:
        db.rollback()
        logger.warning(
            "delivery_push: fallo DB PEDIDO_LISTO (¿falta patch?). — %s",
            e,
        )
        return
    except Exception:
        db.rollback()
        logger.exception("delivery_push: error antes de enviar Expo (pedido_listo order_id=%s)", order_id)
        return
    finally:
        db.close()

    data: Dict[str, str] = {
        "type": RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
        "order_id": str(order_id),
        "plataforma": plat,
        "codigo_pedido": code,
    }
    if restaurant_id is not None:
        data["restaurant_id"] = str(restaurant_id)
    if restaurant_label:
        data["restaurant_nombre"] = restaurant_label
    if not tokens:
        logger.info(
            "delivery_push: PEDIDO_LISTO persistido en bandeja pero 0 tokens Expo; sin push (order_id=%s)",
            order_id,
        )
        return
    logger.info(
        "delivery_push: enviando %s notificación(es) Expo PEDIDO_LISTO (order_id=%s)",
        len(tokens),
        order_id,
    )
    messages: List[Dict[str, Any]] = []
    for t in tokens:
        messages.append(
            {
                "to": t,
                "title": title,
                "body": body,
                "data": data,
                "sound": "default",
                "priority": "high",
                "channelId": RUNNER_PUSH_ANDROID_CHANNEL_ID,
            }
        )
    send_expo_push_messages(messages)
