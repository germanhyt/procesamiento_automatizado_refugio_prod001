# -*- coding: utf-8 -*-
"""WebSocket broadcast para carteleras de agenda deportiva (público, sin JWT)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Set

from fastapi import WebSocket, WebSocketDisconnect

EVENT_PROGRAMACION_UPDATED = "PROGRAMACION_UPDATED"
EVENT_MUSICA_UPDATED = "MUSICA_UPDATED"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgendaDeportivaConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        dead: List[WebSocket] = []
        for ws in list(self.active_connections):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = AgendaDeportivaConnectionManager()


async def broadcast_agenda_event(
    event_type: str,
    payload: Dict[str, Any] | None = None,
) -> None:
    await ws_manager.broadcast(
        {
            "type": event_type,
            "ts": _utcnow().isoformat(),
            "payload": payload or {},
        }
    )


async def handle_agenda_public_ws(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
