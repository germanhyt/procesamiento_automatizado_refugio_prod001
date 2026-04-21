# -*- coding: utf-8 -*-
"""Persistencia de fotos de conductor (kiosk) bajo FileStore / uploads."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.services.file_store_service import get_upload_base

ZONA_LIMA = ZoneInfo("America/Lima")

_REL_SUBDIR = Path("delivery") / "driver_photos"

_ALLOWED_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _safe_filename_stem(stem: str) -> str:
    """Nombre de archivo seguro a partir de DNI, CE u otro identificador ya normalizado."""
    s = re.sub(r"[^A-Za-z0-9]", "", (stem or "").strip())[:40]
    return s or "unknown"


def save_kiosk_driver_photo_file(
    storage_stem: str,
    content: bytes,
    *,
    content_type: str | None,
) -> tuple[str, str]:
    """
    Escribe bytes bajo uploads/delivery/driver_photos/.
    Retorna (ruta_relativa_posix, mime_normalizado).
    """
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in _ALLOWED_EXT:
        raise ValueError("Tipo de imagen no permitido (use JPEG, PNG o WebP).")
    ext = _ALLOWED_EXT[ct]
    if len(content) > 5 * 1024 * 1024:
        raise ValueError("Imagen demasiado grande (máx. 5 MB).")

    base = get_upload_base()
    dest_dir = base / _REL_SUBDIR
    dest_dir.mkdir(parents=True, exist_ok=True)

    h = hashlib.sha256(content).hexdigest()[:8]
    date_s = datetime.now(ZONA_LIMA).strftime("%Y%m%d")
    fname = f"{_safe_filename_stem(storage_stem)}_{date_s}_{h}{ext}"
    rel = str(_REL_SUBDIR / fname).replace("\\", "/")
    (dest_dir / fname).write_bytes(content)
    return rel, ct
