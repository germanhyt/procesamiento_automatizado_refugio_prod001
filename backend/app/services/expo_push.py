"""
Envío de notificaciones vía Expo Push Service (HTTPS).
Documentación: https://docs.expo.dev/push-notifications/sending-notifications/
"""

import logging
from typing import Any, Dict, List

import requests

from app.core.delivery_constants import EXPO_PUSH_SEND_URL

logger = logging.getLogger(__name__)


def send_expo_push_messages(messages: List[Dict[str, Any]]) -> None:
    """
    Envía mensajes a Expo. El cuerpo es un array JSON de objetos { to, title, body, data?, ... }.
    Se divide en lotes para evitar payloads enormes.
    """
    if not messages:
        return
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
    }
    batch_size = 99
    for i in range(0, len(messages), batch_size):
        chunk = messages[i : i + batch_size]
        try:
            resp = requests.post(
                EXPO_PUSH_SEND_URL,
                json=chunk,
                headers=headers,
                timeout=25,
            )
        except requests.RequestException as e:
            logger.warning("Expo push request failed: %s", e)
            continue
        if resp.status_code != 200:
            logger.warning(
                "Expo push HTTP %s: %s",
                resp.status_code,
                (resp.text or "")[:800],
            )
            continue
        try:
            body = resp.json()
        except ValueError:
            logger.warning("Expo push: respuesta no JSON: %s", (resp.text or "")[:400])
            continue
        for item in body.get("data") or []:
            if isinstance(item, dict) and item.get("status") == "error":
                logger.warning("Expo push ticket error: %s", item)
