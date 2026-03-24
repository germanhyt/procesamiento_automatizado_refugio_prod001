# -*- coding: utf-8 -*-
"""
FileStore: cierre de caja por locatario (pendientes + consolidados) y carpeta procesados.

Estructura:
  {base}/cierre_caja/{locatario}/archivo_YYYYMMDD_HHmmss.xlsx   (pendientes)
  {base}/cierre_caja/{locatario}/_consolidados/semanaN_....csv
  {base}/procesados/{YYYY-MM-DD}/{locatario}/...
"""
import os
import re
import logging
import shutil
from pathlib import Path
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.constants import (
    MESES_ES,
    CODIGOS_LOCATARIOS_VALIDOS,
    FILE_STORE_CIERRE_CAJA,
    FILE_STORE_PROCESADOS,
    FILE_STORE_SUB_CONSOLIDADOS,
)

logger = logging.getLogger(__name__)

ZONA_LIMA = ZoneInfo("America/Lima")
DEFAULT_UPLOAD_BASE = os.getenv("UPLOAD_BASE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"))

# Patrón de sufijo de carga: _20260322_221334 antes de la extensión
_HASH_SUFFIX_RE = re.compile(r"_(\d{8})_(\d{6})$", re.IGNORECASE)


def get_upload_base() -> Path:
    return Path(DEFAULT_UPLOAD_BASE)


def _ahora_lima() -> datetime:
    return datetime.now(ZONA_LIMA)


def get_semana_actual_lima() -> tuple[datetime, datetime, str, int]:
    """
    Devuelve (lunes, domingo, nombre_carpeta, numero_semana_iso) para la semana actual en Lima.
    nombre_carpeta: semana12_16_22_marzo
    """
    ahora = _ahora_lima().date()
    dias_desde_lunes = ahora.weekday()
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
    """Nombre de carpeta semanal (Lima) para nombrar consolidados."""
    _, _, nombre, _ = get_semana_actual_lima()
    return nombre


def _dir_cierre_caja(base: Path) -> Path:
    return base / FILE_STORE_CIERRE_CAJA


def _dir_locatario_pendientes(base: Path, locatario_codigo: str) -> Path:
    return _dir_cierre_caja(base) / locatario_codigo.strip()


def _dir_locatario_consolidados(base: Path, locatario_codigo: str) -> Path:
    return _dir_locatario_pendientes(base, locatario_codigo) / FILE_STORE_SUB_CONSOLIDADOS


def _stem_ext(filename: str) -> tuple[str, str]:
    p = os.path.basename(filename.strip() or "archivo")
    if "." in p:
        stem, ext = p.rsplit(".", 1)
        return stem, f".{ext.lower()}"
    return p, ""


def _with_upload_hash(stem: str, ext: str) -> str:
    """Añade _YYYYMMDD_HHmmss si el stem aún no termina en ese patrón."""
    if _HASH_SUFFIX_RE.search(stem):
        return f"{stem}{ext}"
    ts = _ahora_lima().strftime("%Y%m%d_%H%M%S")
    return f"{stem}_{ts}{ext}"


def save_file(
    locatario_codigo: str,
    filename: str,
    content: bytes,
    *,
    add_hash: bool = True,
    replace: bool = False,
) -> str:
    """
    Guarda en cierre_caja/{locatario}/.
    - add_hash=True (default): nombre_base_YYYYMMDD_HHmmss.ext si no trae ya el sufijo.
    - replace=True: usa el nombre sanitizado tal cual (sobrescribe si existe).
    """
    if locatario_codigo not in CODIGOS_LOCATARIOS_VALIDOS:
        raise ValueError(f"Locatario no válido: {locatario_codigo}")
    base = get_upload_base()
    dir_loc = _dir_locatario_pendientes(base, locatario_codigo)
    dir_loc.mkdir(parents=True, exist_ok=True)

    stem, ext = _stem_ext(filename)
    if ext not in (".xlsx", ".csv"):
        ext = ".csv" if not ext else ext

    if replace:
        safe_name = stem + ext
    elif add_hash:
        safe_name = _with_upload_hash(stem, ext)
    else:
        safe_name = stem + ext

    file_path = dir_loc / safe_name
    file_path.write_bytes(content)
    rel = str(file_path.relative_to(base))
    logger.info("FileStore save: %s", rel)
    return rel


def _list_files_in_dir(d: Path) -> list[str]:
    if not d.is_dir():
        return []
    return sorted(f.name for f in d.iterdir() if f.is_file())


def list_cierre_caja_por_locatario() -> list[dict]:
    """
    Lista pendientes y consolidados por locatario.
    Retorna [ { "locatario", "pendientes": [...], "consolidados": [...] } ]
    """
    base = get_upload_base()
    root = _dir_cierre_caja(base)
    if not root.exists():
        return []
    result = []
    for loc_dir in sorted(root.iterdir()):
        if not loc_dir.is_dir():
            continue
        name = loc_dir.name
        if name == FILE_STORE_SUB_CONSOLIDADOS:
            continue
        pendientes = []
        for f in loc_dir.iterdir():
            if f.is_file():
                pendientes.append(f.name)
            # no listar contenido de subcarpetas como pendientes
        cons_dir = loc_dir / FILE_STORE_SUB_CONSOLIDADOS
        consolidados = _list_files_in_dir(cons_dir)
        pendientes.sort()
        if pendientes or consolidados:
            result.append({
                "locatario": name,
                "pendientes": pendientes,
                "consolidados": consolidados,
            })
    return result


def list_archivos(semana_folder: str | None = None) -> list[dict]:
    """
    Compatibilidad: ignora semana_folder y delega en list_cierre_caja_por_locatario.
    Formato legado mezclado: { "semana": "cierre_caja", "locatario", "archivos": pendientes }
    """
    rows = list_cierre_caja_por_locatario()
    out = []
    for r in rows:
        out.append({
            "semana": FILE_STORE_CIERRE_CAJA,
            "locatario": r["locatario"],
            "archivos": r["pendientes"],
            "pendientes": r["pendientes"],
            "consolidados": r["consolidados"],
        })
    return out


def list_semanas_disponibles() -> list[str]:
    """Compat: devuelve ['cierre_caja'] para el selector de 'vista' en UI legada."""
    base = get_upload_base()
    if _dir_cierre_caja(base).exists():
        return [FILE_STORE_CIERRE_CAJA]
    return []


def delete_file(
    locatario_codigo: str,
    filename: str,
    *,
    zona: str = "pendiente",
) -> bool:
    """
    Elimina un archivo.
    zona: 'pendiente' | 'consolidado'
    """
    base = get_upload_base()
    loc = locatario_codigo.strip()
    fn = os.path.basename(filename)
    if zona == "consolidado":
        path = _dir_locatario_consolidados(base, loc) / fn
    else:
        path = _dir_locatario_pendientes(base, loc) / fn
    if not path.is_file():
        return False
    path.unlink()
    logger.info("FileStore delete: %s", path)
    return True


def resolve_cierre_caja_path(locatario_codigo: str, filename: str, *, prefer_consolidado: bool = False) -> Path | None:
    """
    Resuelve ruta absoluta a un archivo en cierre_caja.
    Si prefer_consolidado, busca primero en _consolidados.
    """
    base = get_upload_base()
    loc = locatario_codigo.strip()
    fn = os.path.basename(filename)
    pend = _dir_locatario_pendientes(base, loc) / fn
    cons = _dir_locatario_consolidados(base, loc) / fn
    if prefer_consolidado:
        if cons.is_file():
            return cons
        if pend.is_file():
            return pend
    else:
        if pend.is_file():
            return pend
        if cons.is_file():
            return cons
    return None


def iter_cierre_caja_archivos_procesamiento(
    *,
    solo_pendientes: bool = False,
    solo_consolidados: bool = False,
) -> list[tuple[str, str, Path]]:
    """
    Lista (locatario, nombre_archivo, path) para conversión/asociación.
    - solo_pendientes: solo raíz del locatario (no _consolidados).
    - solo_consolidados: solo archivos dentro de _consolidados.
    - ambos False: pendientes y consolidados.
    """
    base = get_upload_base()
    out: list[tuple[str, str, Path]] = []
    root = _dir_cierre_caja(base)
    if not root.exists():
        return out
    for loc_dir in sorted(root.iterdir()):
        if not loc_dir.is_dir():
            continue
        loc = loc_dir.name
        if loc == FILE_STORE_SUB_CONSOLIDADOS:
            continue
        if solo_consolidados:
            cdir = loc_dir / FILE_STORE_SUB_CONSOLIDADOS
            if cdir.is_dir():
                for f in cdir.iterdir():
                    if f.is_file():
                        out.append((loc, f.name, f))
            continue
        for f in loc_dir.iterdir():
            if f.is_file():
                out.append((loc, f.name, f))
        if not solo_pendientes:
            cdir = loc_dir / FILE_STORE_SUB_CONSOLIDADOS
            if cdir.is_dir():
                for f in cdir.iterdir():
                    if f.is_file():
                        out.append((loc, f.name, f))
    return out


def parse_fecha_desde_nombre_archivo(name: str) -> date | None:
    """Extrae fecha del patrón _YYYYMMDD_HHmmss antes de la extensión."""
    stem = Path(name).stem
    m = _HASH_SUFFIX_RE.search(stem)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y%m%d").date()
    except ValueError:
        return None


def rango_desde_modo(
    modo: str,
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
) -> tuple[date, date, str]:
    """
    Devuelve (inicio, fin, etiqueta_semana) según modo.
    modo: semana_actual | ultima_semana | rango_libre
    """
    modo = (modo or "semana_actual").strip().lower()
    if modo in ("semana_anterior", "ultima_semana_completa"):
        modo = "ultima_semana"
    if modo == "rango_libre":
        if not fecha_inicio or not fecha_fin:
            raise ValueError("rango_libre requiere fecha_inicio y fecha_fin (YYYY-MM-DD)")
        d0 = datetime.strptime(fecha_inicio[:10], "%Y-%m-%d").date()
        d1 = datetime.strptime(fecha_fin[:10], "%Y-%m-%d").date()
        if d0 > d1:
            d0, d1 = d1, d0
        return d0, d1, f"rango_{d0}_{d1}"

    lunes, domingo, nombre_sem, _ = get_semana_actual_lima()
    lunes_d = lunes.date() if hasattr(lunes, "date") else lunes
    domingo_d = domingo.date() if hasattr(domingo, "date") else domingo

    if modo == "ultima_semana":
        lunes_d = lunes_d - timedelta(days=7)
        domingo_d = lunes_d + timedelta(days=6)
        iso_week = lunes_d.isocalendar()[1]
        mes_nombre = MESES_ES[lunes_d.month - 1]
        nombre_sem = f"semana{iso_week}_{lunes_d.day}_{domingo_d.day}_{mes_nombre}"

    return lunes_d, domingo_d, nombre_sem


def archivo_en_rango_fecha(nombre_archivo: str, start: date, end: date) -> bool:
    """Solo por nombre (compat). Preferir archivo_en_rango_consolidacion con path."""
    d = parse_fecha_desde_nombre_archivo(nombre_archivo)
    if d is None:
        return True
    return start <= d <= end


def filtrar_filas_por_rango_fecha(
    df: pd.DataFrame,
    start: date,
    end: date,
    col: str = "Fecha",
) -> pd.DataFrame:
    """
    Recorta filas cuyo valor en `col` (fecha de operación del reporte) cae en [start, end] inclusive.
    Usado en consolidación: el criterio principal es la columna Fecha del CSV, no la fecha del nombre del archivo.
    """
    if df is None or df.empty or col not in df.columns:
        return df
    # format='mixed': en una misma columna suelen mezclarse ISO (2026-03-20) y d/m/Y (20/03/2026);
    # sin esto, to_datetime vectorizado devuelve NaT en parte de las filas.
    ts = pd.to_datetime(df[col], errors="coerce", format="mixed", dayfirst=True).dt.normalize()
    mask = ts.notna() & (ts >= pd.Timestamp(start)) & (ts < pd.Timestamp(end) + pd.Timedelta(days=1))
    return df.loc[mask].copy()


def archivo_en_rango_consolidacion(
    nombre_archivo: str,
    start: date,
    end: date,
    file_path: Path | None = None,
) -> bool:
    """
    Decide si un pendiente entra en la consolidación del rango [start, end] (Lima).

    - Fecha en el nombre (_YYYYMMDD_HHmmss): si cae en el rango → incluye.
    - Si no califica por nombre pero existe archivo: fecha de modificación (Lima) en el rango → incluye
      (útil cuando el reporte es de días anteriores pero se sube en la semana que se procesa).
    - Sin fecha parseable en el nombre → incluye (archivos legacy / sin sufijo).
    - Con fecha en nombre fuera de rango y mtime fuera de rango → excluye.
    """
    d_nom = parse_fecha_desde_nombre_archivo(nombre_archivo)
    if d_nom is not None and start <= d_nom <= end:
        return True

    if file_path is not None and file_path.is_file():
        try:
            mtime_d = datetime.fromtimestamp(file_path.stat().st_mtime, tz=ZONA_LIMA).date()
            if start <= mtime_d <= end:
                return True
        except OSError:
            pass

    if d_nom is None:
        return True

    return False


def list_pendientes_locatario(locatario_codigo: str) -> list[str]:
    """
    Nombres de archivos .csv/.xlsx en la raíz de cierre_caja/{locatario}/ (no _consolidados).
    """
    base = get_upload_base()
    d = _dir_locatario_pendientes(base, locatario_codigo)
    if not d.is_dir():
        return []
    out: list[str] = []
    for f in sorted(d.iterdir()):
        if f.is_file():
            low = f.name.lower()
            if low.endswith(".csv") or low.endswith(".xlsx"):
                out.append(f.name)
    return out


def move_to_procesados(locatario_codigo: str, filenames: list[str], *, zona: str = "pendiente") -> list[str]:
    """
    Mueve archivos a procesados/{YYYY-MM-DD}/{locatario}/.
    Retorna rutas relativas creadas.
    """
    base = get_upload_base()
    day = _ahora_lima().date().isoformat()
    dest_root = base / FILE_STORE_PROCESADOS / day / locatario_codigo.strip()
    dest_root.mkdir(parents=True, exist_ok=True)
    moved = []
    for fn in filenames:
        fn = os.path.basename(fn)
        if zona == "consolidado":
            src = _dir_locatario_consolidados(base, locatario_codigo) / fn
        else:
            src = _dir_locatario_pendientes(base, locatario_codigo) / fn
        if not src.is_file():
            continue
        dest = dest_root / fn
        shutil.move(str(src), str(dest))
        moved.append(str(dest.relative_to(base)))
    return moved


PREVIEW_MAX_FILE_BYTES = 25 * 1024 * 1024
PREVIEW_MAX_ROWS_CAP = 200


def _preview_cap_rows(max_rows: int) -> int:
    return max(1, min(int(max_rows or 50), PREVIEW_MAX_ROWS_CAP))


def preview_tabular_file(path: Path, *, max_rows: int = 50) -> dict:
    """
    Lee las primeras filas de un CSV o XLSX para vista previa en UI.
    """
    cap = _preview_cap_rows(max_rows)
    want = cap + 1
    if not path.is_file():
        return {"ok": False, "error": "no_existe"}
    ext = path.suffix.lower()
    if ext not in (".csv", ".xlsx"):
        return {"ok": False, "error": "extension_no_soportada"}
    try:
        size = path.stat().st_size
    except OSError:
        return {"ok": False, "error": "no_existe"}
    if size > PREVIEW_MAX_FILE_BYTES:
        return {"ok": False, "error": "archivo_muy_grande", "max_mb": PREVIEW_MAX_FILE_BYTES // (1024 * 1024)}

    try:
        if ext == ".csv":
            df = pd.read_csv(
                path,
                nrows=want,
                dtype=str,
                encoding="utf-8",
                encoding_errors="replace",
                sep=None,
                engine="python",
            )
        else:
            df = pd.read_excel(path, nrows=want, dtype=str, engine="openpyxl")
    except Exception as e:
        logger.warning("preview_tabular_file fallo: %s", path, exc_info=True)
        return {"ok": False, "error": "lectura_fallo", "detail": str(e)[:500]}

    truncated = len(df) > cap
    if truncated:
        df = df.iloc[:cap].copy()
    df = df.fillna("")
    columns = [str(c) for c in df.columns.tolist()]
    rows = df.astype(str).values.tolist()
    return {
        "ok": True,
        "filename": path.name,
        "extension": ext,
        "columns": columns,
        "rows": rows,
        "truncated": truncated,
        "row_count_shown": len(rows),
    }


def preview_cierre_caja_tabular(
    locatario_codigo: str,
    filename: str,
    *,
    zona: str,
    max_rows: int = 50,
) -> dict:
    loc = locatario_codigo.strip()
    if loc not in CODIGOS_LOCATARIOS_VALIDOS:
        raise ValueError("Locatario no válido")
    fn = Path(filename.strip()).name
    if not fn:
        raise ValueError("Nombre de archivo inválido")
    z = zona.strip().lower()
    if z in ("consolidado", "consolidados", "_consolidados"):
        path = _dir_locatario_consolidados(get_upload_base(), loc) / fn
    elif z == "pendiente":
        path = _dir_locatario_pendientes(get_upload_base(), loc) / fn
    else:
        raise ValueError("zona debe ser pendiente o consolidado")
    return preview_tabular_file(path, max_rows=max_rows)


def preview_procesados_tabular(
    fecha: str,
    locatario_codigo: str,
    filename: str,
    *,
    max_rows: int = 50,
) -> dict:
    raw_f = fecha.strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_f):
        raise ValueError("fecha inválida (use YYYY-MM-DD)")
    loc = locatario_codigo.strip()
    if not loc or ".." in loc or "/" in loc or "\\" in loc:
        raise ValueError("Locatario inválido")
    fn = Path(filename.strip()).name
    if not fn:
        raise ValueError("Nombre de archivo inválido")
    base = get_upload_base()
    day_dir = (base / FILE_STORE_PROCESADOS / raw_f).resolve()
    if not day_dir.is_dir():
        return {"ok": False, "error": "no_existe"}
    path = (day_dir / loc / fn).resolve()
    try:
        path.relative_to(day_dir)
    except ValueError:
        return {"ok": False, "error": "no_existe"}
    return preview_tabular_file(path, max_rows=max_rows)
