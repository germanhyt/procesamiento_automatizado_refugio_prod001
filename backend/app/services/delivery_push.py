"""
Notificaciones push del módulo Delivery (Runner).
"""

import logging
from typing import Any, Dict, List

from sqlalchemy.exc import ProgrammingError

from app.core.delivery_constants import (
    RUNNER_PUSH_ANDROID_CHANNEL_ID,
    RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
    RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO,
)
from app.database import SessionLocal
from app.models.delivery import DeliveryRunnerPushToken, DriverArrival, Order, Restaurant
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


def _restaurant_nombre_for_driver_arrival(driver_arrival_id: int) -> str | None:
    db = SessionLocal()
    try:
        row = (
            db.query(DriverArrival, Restaurant)
            .join(Restaurant, DriverArrival.restaurant_id == Restaurant.id)
            .filter(DriverArrival.id == driver_arrival_id)
            .first()
        )
        if not row:
            return None
        _da, rest = row
        name = (rest.nombre or "").strip()
        return name or None
    finally:
        db.close()


def notify_runners_new_driver_waiting_sync(
    driver_arrival_id: int,
    plataforma: str,
    codigo_ingresado: str,
) -> None:
    """
    Tarea en background: enviar push a todos los dispositivos Runner registrados.
    Enriquece body/data con nombre del restaurante del kiosko (delivery_restaurants.nombre).
    """
    tokens = _active_runner_expo_tokens()
    if not tokens:
        logger.info(
            "delivery_push: sin tokens Runner activos; omito push (driver_arrival_id=%s)",
            driver_arrival_id,
        )
        return
    plat = str(plataforma).strip().upper()
    code = str(codigo_ingresado).strip()
    restaurant_nombre = _restaurant_nombre_for_driver_arrival(driver_arrival_id)
    title = "Driver en kiosko"
    if restaurant_nombre:
        body = f"{restaurant_nombre} · {plat} · {code}"
    else:
        body = f"{plat} · {code}"
    # FCM exige valores string en data
    data: Dict[str, str] = {
        "type": RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO,
        "driver_arrival_id": str(driver_arrival_id),
        "plataforma": plat,
        "codigo_ingresado": code,
    }
    if restaurant_nombre:
        data["restaurant_nombre"] = restaurant_nombre
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


def _restaurant_label_for_order(order_id: int) -> tuple[int | None, str | None]:
    db = SessionLocal()
    try:
        row = (
            db.query(Order, Restaurant)
            .join(Restaurant, Order.restaurant_id == Restaurant.id)
            .filter(Order.id == order_id)
            .first()
        )
        if not row:
            return None, None
        _order, rest = row
        label = (rest.nombre or "").strip() or None
        return rest.id, label
    finally:
        db.close()


def notify_runners_order_listo_sync(
    order_id: int,
    plataforma: str,
    codigo_pedido: str,
) -> None:
    """
    Tarea en background: Fidelio acaba de marcar el pedido como LISTO.
    Incluye order_id en data para que el Runner abra /order/[id] al tocar la notificación.
    Enriquece body y data con delivery_restaurants.nombre.
    """
    tokens = _active_runner_expo_tokens()
    if not tokens:
        logger.info(
            "delivery_push: sin tokens Runner activos; omito push PEDIDO_LISTO (order_id=%s)",
            order_id,
        )
        return
    plat = str(plataforma).strip().upper()
    code = str(codigo_pedido).strip()
    restaurant_id, restaurant_label = _restaurant_label_for_order(order_id)
    title = "Pedido listo"
    if restaurant_label:
        body = f"{restaurant_label} · {plat} · {code}"
    else:
        body = f"{plat} · {code}"
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
