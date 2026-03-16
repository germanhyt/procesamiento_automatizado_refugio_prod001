# -*- coding: utf-8 -*-
"""
FileStore: almacenamiento local de archivos por semana (Lima) y locatario.
Estructura: {base}/semana{N}_{dd}_{dd}_{mes}/{locatario_codigo}/archivo.xlsx
"""
import os
import logging
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.constants import MESES_ES, CODIGOS_LOCATARIOS_VALIDOS

logger = logging.getLogger(__name__)

ZONA_LIMA = ZoneInfo("America/Lima")
DEFAULT_UPLOAD_BASE = os.getenv("UPLOAD_BASE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"))


def get_upload_base() -> Path:
    return Path(DEFAULT_UPLOAD_BASE)


def _ahora_lima() -> datetime:
    return datetime.now(ZONA_LIMA)


def get_semana_actual_lima() -> tuple[datetime, datetime, str, int]:
    """
    Devuelve (lunes, domingo, nombre_carpeta, numero_semana_iso) para la semana actual en Lima.
    nombre_carpeta: semana12_16_22_marzo (dd sin cero a la izquierda, mes en español).
    """
    ahora = _ahora_lima().date()
    # ISO: lunes = 1, domingo = 7
    dias_desde_lunes = ahora.weekday()  # 0 = lunes
    lunes = ahora
    for _ in range(dias_desde_lunes):
        lunes = lunes - timedelta(days=1)
    domingo = lunes
    for _ in range(6):
        domingo = domingo + timedelta(days=1)
    iso_year, iso_week, _ = lunes.isocalendar()
    mes_nombre = MESES_ES[lunes.month - 1]
    nombre = f"semana{iso_week}_{lunes.day}_{domingo.day}_{mes_nombre}"
    return lunes, domingo, nombre, iso_week


def get_week_folder_name() -> str:
    """Nombre de carpeta de la semana actual (Lima)."""
    _, _, nombre, _ = get_semana_actual_lima()
    return nombre


def _dir_semana(base: Path) -> Path:
    carpeta = get_week_folder_name()
    return base / carpeta


def _dir_locatario(base: Path, locatario_codigo: str) -> Path:
    return _dir_semana(base) / locatario_codigo.strip()


def save_file(locatario_codigo: str, filename: str, content: bytes) -> str:
    """
    Guarda el archivo en {base}/semanaXX_dd_dd_mes/{locatario_codigo}/{filename}.
    Valida locatario_codigo. Retorna ruta relativa (semana/.../filename).
    """
    if locatario_codigo not in CODIGOS_LOCATARIOS_VALIDOS:
        raise ValueError(f"Locatario no válido: {locatario_codigo}")
    base = get_upload_base()
    dir_loc = _dir_locatario(base, locatario_codigo)
    dir_loc.mkdir(parents=True, exist_ok=True)
    # Sanitizar filename: solo nombre base, sin path
    safe_name = os.path.basename(filename).strip() or "archivo"
    if not (safe_name.lower().endswith(".xlsx") or safe_name.lower().endswith(".csv")):
        safe_name = safe_name + ".csv"
    file_path = dir_loc / safe_name
    file_path.write_bytes(content)
    rel = str(file_path.relative_to(base))
    logger.info("FileStore save: %s", rel)
    return rel


def list_archivos(semana_folder: str | None = None) -> list[dict]:
    """
    Lista archivos. Si semana_folder es None, usa la semana actual (Lima).
    Retorna [ {"semana": str, "locatario": str, "archivos": [str]} ]
    """
    base = get_upload_base()
    if not base.exists():
        return []
    if semana_folder:
        dir_semana = base / semana_folder
    else:
        dir_semana = _dir_semana(base)
    if not dir_semana.exists():
        return []
    result = []
    for loc_dir in sorted(dir_semana.iterdir()):
        if not loc_dir.is_dir():
            continue
        archivos = [f.name for f in loc_dir.iterdir() if f.is_file()]
        if archivos:
            result.append({
                "semana": dir_semana.name,
                "locatario": loc_dir.name,
                "archivos": sorted(archivos),
            })
    return result


def delete_file(semana_folder: str, locatario_codigo: str, filename: str) -> bool:
    """Elimina un archivo. Retorna True si existía y se eliminó."""
    base = get_upload_base()
    file_path = base / semana_folder / locatario_codigo.strip() / os.path.basename(filename)
    if not file_path.is_file():
        return False
    file_path.unlink()
    logger.info("FileStore delete: %s", file_path)
    return True


def list_semanas_disponibles() -> list[str]:
    """Lista nombres de carpetas de semana que existen bajo la base de uploads."""
    base = get_upload_base()
    if not base.exists():
        return []
    return sorted([d.name for d in base.iterdir() if d.is_dir() and d.name.startswith("semana")])
