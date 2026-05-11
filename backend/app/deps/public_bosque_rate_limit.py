"""Rate limit in-memory por IP para POST públicos de Bosque Mágico (MVP).

En producción detrás de proxy, configurar X-Forwarded-For. Ajuste: env BOSQUE_PUBLIC_LEADS_RPM (default 30 por minuto).
"""

from __future__ import annotations

import os
import time
from collections import defaultdict
from typing import DefaultDict, List

from fastapi import HTTPException, Request, status

_WINDOW_SEC = 60.0
_MAX_PER_WINDOW = max(1, int(os.getenv("BOSQUE_PUBLIC_LEADS_RPM", "30")))

_timestamps: DefaultDict[str, List[float]] = defaultdict(list)


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def enforce_public_bosque_lead_rate_limit(request: Request) -> None:
    ip = client_ip(request)
    now = time.monotonic()
    cutoff = now - _WINDOW_SEC
    bucket = _timestamps[ip]
    bucket[:] = [t for t in bucket if t > cutoff]
    if len(bucket) >= _MAX_PER_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados envíos. Intente más tarde.",
        )
    bucket.append(now)
