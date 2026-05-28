# -*- coding: utf-8 -*-
"""Servicio Agenda Deportiva: uploads, resolución de programación y playlist pública."""
from __future__ import annotations

import logging
import os
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.agenda_deportiva_constants import (
    AGENDA_MODO_DAY,
    AGENDA_MODO_WEEK,
    AGENDA_MUSIC_EXTENSIONS,
    AGENDA_MUSIC_MAX_SIZE_MB,
    AGENDA_SLIDE_EXTENSIONS,
    AGENDA_SLIDE_MAX_SIZE_MB,
    FILE_STORE_AGENDA,
    FILE_STORE_AGENDA_MUSIC,
    FILE_STORE_AGENDA_SLIDES,
)
from app.models.agenda_deportiva import AgendaConfig, AgendaProgramacion, AgendaSlide, AgendaTrack
from app.services.file_store_service import get_upload_base

logger = logging.getLogger(__name__)

ZONA_LIMA = ZoneInfo("America/Lima")


def _resolved_upload_base() -> Path:
    return get_upload_base().expanduser().resolve()


def _win_long_path(path: Path) -> str:
    resolved = path.resolve()
    s = str(resolved)
    if s.startswith("\\\\?\\"):
        return s
    if s.startswith("\\\\"):
        return "\\\\?\\UNC\\" + s[2:]
    return "\\\\?\\" + s


def _mkdirs_and_write_bytes(target_path: Path, content: bytes) -> None:
    if sys.platform != "win32":
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(content)
        return
    ep = _win_long_path(target_path)
    os.makedirs(os.path.dirname(ep), exist_ok=True)
    with open(ep, "wb") as f:
        f.write(content)


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def slugify_component(value: str, fallback: str = "item") -> str:
    text = _strip_accents((value or "").strip().lower())
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def _safe_basename(name: str) -> str:
    raw = os.path.basename((name or "").strip())
    return raw or "archivo"


def _validate_extension(filename: str, allowed: frozenset[str]) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in allowed:
        allow = ", ".join(sorted(allowed))
        raise ValueError(f"Extensión no soportada. Permitidas: {allow}")
    return ext


def _guess_slide_mime(ext: str, provided: Optional[str]) -> str:
    if provided and "/" in provided:
        return provided
    if ext == ".png":
        return "image/png"
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _guess_music_mime(ext: str, provided: Optional[str]) -> str:
    if provided and "/" in provided:
        return provided
    if ext == ".mp3":
        return "audio/mpeg"
    if ext == ".wav":
        return "audio/wav"
    if ext == ".ogg":
        return "audio/ogg"
    if ext == ".m4a":
        return "audio/mp4"
    return "application/octet-stream"


def fecha_lima_hoy() -> date:
    return datetime.now(ZONA_LIMA).date()


def get_or_create_config(db: Session) -> AgendaConfig:
    row = db.query(AgendaConfig).filter(AgendaConfig.id == 1).first()
    if row:
        return row
    row = AgendaConfig(id=1, playlist_publica_habilitada=True)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def pick_programacion_for_date(
    programaciones: list[AgendaProgramacion],
    target: date,
) -> Optional[AgendaProgramacion]:
    """Prioridad: DAY del día > WEEK que contenga la fecha; solo activas."""
    day_matches = [
        p
        for p in programaciones
        if p.activa and p.modo == AGENDA_MODO_DAY and p.fecha_inicio <= target <= p.fecha_fin
    ]
    if day_matches:
        return sorted(day_matches, key=lambda p: (p.fecha_inicio, p.id), reverse=True)[0]

    week_matches = [
        p
        for p in programaciones
        if p.activa and p.modo == AGENDA_MODO_WEEK and p.fecha_inicio <= target <= p.fecha_fin
    ]
    if week_matches:
        return sorted(week_matches, key=lambda p: (p.fecha_inicio, p.id), reverse=True)[0]

    return None


def resolve_programacion_activa(db: Session, target: Optional[date] = None) -> Optional[AgendaProgramacion]:
    when = target or fecha_lima_hoy()
    rows = db.query(AgendaProgramacion).filter(AgendaProgramacion.activa.is_(True)).all()
    return pick_programacion_for_date(rows, when)


def resolve_file_path(relative_path: str) -> Path:
    base = _resolved_upload_base()
    rel = (relative_path or "").replace("\\", "/").lstrip("/")
    if rel.startswith("..") or "/../" in f"/{rel}/":
        raise ValueError("Ruta de archivo inválida")
    full = (base / rel).resolve()
    if not str(full).startswith(str(base)):
        raise ValueError("Ruta de archivo fuera de uploads")
    return full


def delete_physical_file(relative_path: str) -> None:
    if not relative_path:
        return
    try:
        path = resolve_file_path(relative_path)
        if path.is_file():
            path.unlink()
    except Exception as exc:
        logger.warning("No se pudo eliminar archivo agenda: %s (%s)", relative_path, exc)


def _relative_path_from_base(full_path: Path) -> str:
    base = _resolved_upload_base()
    return str(full_path.relative_to(base)).replace("\\", "/")


def save_slide_file(
    *,
    programacion_id: int,
    original_filename: str,
    provided_mime_type: Optional[str],
    content: bytes,
) -> dict:
    max_bytes = AGENDA_SLIDE_MAX_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise ValueError(f"Imagen demasiado grande (máximo {AGENDA_SLIDE_MAX_SIZE_MB} MB)")

    original_name = _safe_basename(original_filename)
    ext = _validate_extension(original_name, AGENDA_SLIDE_EXTENSIONS)
    mime_type = _guess_slide_mime(ext, provided_mime_type)

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    stem = slugify_component(Path(original_name).stem, "slide")
    actual_name = f"{stem}_{ts}{ext}"

    folder = _resolved_upload_base() / FILE_STORE_AGENDA / FILE_STORE_AGENDA_SLIDES / f"prog_{programacion_id}"
    target = folder / actual_name
    _mkdirs_and_write_bytes(target, content)

    return {
        "archivo_nombre_original": original_name,
        "archivo_ruta": _relative_path_from_base(target),
        "mime_type": mime_type,
        "extension": ext,
        "tamano_bytes": len(content),
    }


def save_music_file(
    *,
    original_filename: str,
    provided_mime_type: Optional[str],
    content: bytes,
) -> dict:
    max_bytes = AGENDA_MUSIC_MAX_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise ValueError(f"Audio demasiado grande (máximo {AGENDA_MUSIC_MAX_SIZE_MB} MB)")

    original_name = _safe_basename(original_filename)
    ext = _validate_extension(original_name, AGENDA_MUSIC_EXTENSIONS)
    mime_type = _guess_music_mime(ext, provided_mime_type)

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    stem = slugify_component(Path(original_name).stem, "track")
    actual_name = f"{stem}_{ts}{ext}"

    folder = _resolved_upload_base() / FILE_STORE_AGENDA / FILE_STORE_AGENDA_MUSIC
    target = folder / actual_name
    _mkdirs_and_write_bytes(target, content)

    return {
        "archivo_nombre_original": original_name,
        "archivo_ruta": _relative_path_from_base(target),
        "mime_type": mime_type,
        "extension": ext,
        "tamano_bytes": len(content),
    }


def next_slide_orden(db: Session, programacion_id: int) -> int:
    last = (
        db.query(AgendaSlide.orden)
        .filter(AgendaSlide.programacion_id == programacion_id)
        .order_by(AgendaSlide.orden.desc())
        .first()
    )
    return (last[0] if last else 0) + 1


def next_track_orden(db: Session) -> int:
    last = db.query(AgendaTrack.orden).order_by(AgendaTrack.orden.desc()).first()
    return (last[0] if last else 0) + 1


def reorder_slides(db: Session, programacion_id: int, slide_ids: list[int]) -> None:
    slides = (
        db.query(AgendaSlide)
        .filter(AgendaSlide.programacion_id == programacion_id)
        .order_by(AgendaSlide.orden)
        .all()
    )
    by_id = {s.id: s for s in slides}
    if set(slide_ids) != set(by_id.keys()):
        raise ValueError("slide_ids debe incluir exactamente los slides de la programación")

    offset = max((s.orden for s in slides), default=0) + 1000
    for idx, slide_id in enumerate(slide_ids):
        by_id[slide_id].orden = offset + idx + 1
    db.flush()
    for idx, slide_id in enumerate(slide_ids, start=1):
        by_id[slide_id].orden = idx


def reorder_tracks(db: Session, track_ids: list[int]) -> None:
    tracks = db.query(AgendaTrack).order_by(AgendaTrack.orden).all()
    by_id = {t.id: t for t in tracks}
    if set(track_ids) != set(by_id.keys()):
        raise ValueError("track_ids debe incluir exactamente todos los tracks")

    offset = max((t.orden for t in tracks), default=0) + 1000
    for idx, track_id in enumerate(track_ids):
        by_id[track_id].orden = offset + idx + 1
    db.flush()
    for idx, track_id in enumerate(track_ids, start=1):
        by_id[track_id].orden = idx


def validate_programacion_fechas(modo: str, fecha_inicio: date, fecha_fin: date) -> None:
    if fecha_fin < fecha_inicio:
        raise ValueError("fecha_fin no puede ser anterior a fecha_inicio")
    if modo == AGENDA_MODO_DAY and fecha_inicio != fecha_fin:
        raise ValueError("En modo DAY, fecha_inicio y fecha_fin deben coincidir")
    if modo == AGENDA_MODO_WEEK:
        span = (fecha_fin - fecha_inicio).days
        if span != 6:
            raise ValueError("En modo WEEK, el rango debe abarcar exactamente 7 días (lunes a domingo)")


def week_range_for_date(target: date) -> tuple[date, date]:
    """Devuelve (lunes, domingo) de la semana ISO que contiene target."""
    lunes = target - timedelta(days=target.weekday())
    domingo = lunes + timedelta(days=6)
    return lunes, domingo
