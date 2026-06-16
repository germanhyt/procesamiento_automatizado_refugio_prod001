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

import chardet
import pandas as pd

from app.core.constants import (
    MESES_ES,
    CODIGOS_LOCATARIOS_VALIDOS,
    FILE_STORE_CIERRE_CAJA,
    FILE_STORE_PROCESADOS,
    FILE_STORE_SUB_CONSOLIDADOS,
    FILE_STORE_SUB_BACKUP,
)

logger = logging.getLogger(__name__)

# Extensiones permitidas en cierre_caja (pendientes): CSV, Excel moderno y Excel 97-2003 (.xls).
FILESTORE_UPLOAD_EXTENSIONS = frozenset({".csv", ".xlsx", ".xls"})

ZONA_LIMA = ZoneInfo("America/Lima")
DEFAULT_UPLOAD_BASE = os.getenv("UPLOAD_BASE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"))

# Patrón de sufijo de carga: _20260322_221334 antes de la extensión
_HASH_SUFFIX_RE = re.compile(r"_(\d{8})_(\d{6})$", re.IGNORECASE)


def get_upload_base() -> Path:
    return Path(DEFAULT_UPLOAD_BASE)


def _excel_engine_from_magic(path: Path) -> str | None:
    """openpyxl = ZIP (xlsx); xlrd = OLE (xls)."""
    try:
        with path.open("rb") as f:
            head = f.read(8)
    except OSError:
        return None
    if len(head) >= 2 and head[:2] == b"PK":
        return "openpyxl"
    if len(head) >= 8 and head[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return "xlrd"
    return None


def read_excel_sheet(path: Path, sheet_name: str) -> pd.DataFrame:
    """
    Lee una hoja de un libro Excel (.xlsx / .xls) probando motores por contenido.
    Usado para Configuracion.xlsx (BaseCarga, Activas, etc.).
    """
    if not path.is_file():
        raise FileNotFoundError(f"No existe: {path}")
    if path.stat().st_size < 128:
        raise ValueError(
            f"El archivo está vacío o corrupto ({path.stat().st_size} bytes): {path.name}"
        )
    ext = path.suffix.lower()
    if ext not in (".xlsx", ".xls"):
        raise ValueError(f"Se esperaba .xlsx o .xls, recibido: {ext}")
    magic = _excel_engine_from_magic(path)
    candidates: list[str] = []
    for eng in (magic, "openpyxl" if ext == ".xlsx" else "xlrd", "openpyxl", "xlrd"):
        if eng and eng not in candidates:
            candidates.append(eng)
    last_err = ""
    for eng in candidates:
        try:
            return pd.read_excel(path, sheet_name=sheet_name, engine=eng)
        except Exception as exc:
            last_err = str(exc)
            logger.debug("read_excel_sheet %s/%s engine=%s: %s", path.name, sheet_name, eng, exc)
    raise ValueError(
        f"No se pudo leer la hoja '{sheet_name}' de {path.name}: {last_err}"
    )


def read_report_file_dataframe(path: Path) -> tuple[pd.DataFrame | None, str | None]:
    """
    Lee un reporte de cierre (.csv, .xlsx, .xls).
    Elige motor Excel por contenido (no solo extensión) para evitar
    «Excel file format cannot be determined, you must specify an engine manually».
    """
    if not path.is_file():
        return None, "archivo_no_encontrado"
    ext = path.suffix.lower()
    if ext in (".xlsx", ".xls"):
        magic = _excel_engine_from_magic(path)
        candidates: list[str] = []
        for eng in (magic, "openpyxl" if ext == ".xlsx" else "xlrd", "openpyxl", "xlrd"):
            if eng and eng not in candidates:
                candidates.append(eng)
        last_err = ""
        for eng in candidates:
            try:
                return pd.read_excel(path, engine=eng), None
            except Exception as exc:
                last_err = str(exc)
                logger.debug("read_report_file_dataframe %s engine=%s: %s", path.name, eng, exc)
        try:
            with path.open("rb") as f:
                raw = f.read(65536)
            enc = chardet.detect(raw).get("encoding") or "latin-1"
            return pd.read_csv(path, sep=None, engine="python", encoding=enc), None
        except Exception as exc2:
            return None, f"error_lectura:{last_err or exc2}"
    if ext == ".csv":
        try:
            with path.open("rb") as f:
                raw = f.read(65536)
            enc = chardet.detect(raw).get("encoding") or "latin-1"
            return pd.read_csv(path, sep=None, engine="python", encoding=enc), None
        except Exception as exc:
            return None, f"error_lectura:{exc}"
    return None, "extension_no_soportada"


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


def _dir_locatario_backup(base: Path, locatario_codigo: str) -> Path:
    return _dir_locatario_pendientes(base, locatario_codigo) / FILE_STORE_SUB_BACKUP


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
    if ext not in FILESTORE_UPLOAD_EXTENSIONS:
        raise ValueError(
            f"Solo se permiten archivos {', '.join(sorted(FILESTORE_UPLOAD_EXTENSIONS))}. Recibido: {ext or 'sin extensión'}"
        )

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
        backup = _list_files_in_dir(_dir_locatario_backup(base, name))
        if pendientes or consolidados or backup:
            result.append({
                "locatario": name,
                "pendientes": pendientes,
                "consolidados": consolidados,
                "backup": backup,
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
    zona: 'pendiente' | 'consolidado' | 'backup'
    """
    base = get_upload_base()
    loc = locatario_codigo.strip()
    fn = os.path.basename(filename)
    if zona == "consolidado":
        path = _dir_locatario_consolidados(base, loc) / fn
    elif zona == "backup":
        path = _dir_locatario_backup(base, loc) / fn
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
    Nombres de archivos .csv / .xlsx / .xls en la raíz de cierre_caja/{locatario}/ (no _consolidados).
    """
    base = get_upload_base()
    d = _dir_locatario_pendientes(base, locatario_codigo)
    if not d.is_dir():
        return []
    out: list[str] = []
    for f in sorted(d.iterdir()):
        if f.is_file():
            low = f.name.lower()
            if low.endswith(".csv") or low.endswith(".xlsx") or low.endswith(".xls"):
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


def move_to_backup(locatario_codigo: str, filenames: list[str], *, zona: str = "pendiente") -> list[str]:
    """
    Mueve archivos a cierre_caja/{locatario}/backup_no_consolidados/.
    Retorna rutas relativas creadas.
    """
    base = get_upload_base()
    dest_root = _dir_locatario_backup(base, locatario_codigo.strip())
    dest_root.mkdir(parents=True, exist_ok=True)
    moved: list[str] = []
    for fn in filenames:
        safe_name = os.path.basename(fn)
        if not safe_name:
            continue
        if zona == "consolidado":
            src = _dir_locatario_consolidados(base, locatario_codigo) / safe_name
        else:
            src = _dir_locatario_pendientes(base, locatario_codigo) / safe_name
        if not src.is_file():
            continue
        dest = dest_root / safe_name
        if dest.exists():
            stem = dest.stem
            ext = dest.suffix
            ts = _ahora_lima().strftime("%Y%m%d_%H%M%S")
            dest = dest_root / f"{stem}_{ts}{ext}"
        shutil.move(str(src), str(dest))
        moved.append(str(dest.relative_to(base)))
    return moved


def restore_from_procesados(
    fecha: str,
    locatario_codigo: str,
    filenames: list[str],
    *,
    destino: str = "pendiente",
) -> list[str]:
    """
    Mueve archivos desde procesados/{YYYY-MM-DD}/{locatario}/ hacia cierre_caja (pendientes o _consolidados).
    """
    raw_f = fecha.strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_f):
        raise ValueError("fecha inválida (use YYYY-MM-DD)")
    loc = locatario_codigo.strip()
    if not loc or ".." in loc or "/" in loc or "\\" in loc:
        raise ValueError("Locatario inválido")
    d = (destino or "pendiente").strip().lower()
    if d in ("consolidado", "consolidados", "_consolidados"):
        d = "consolidado"
    elif d != "pendiente":
        raise ValueError("destino debe ser pendiente o consolidado")

    base = get_upload_base()
    src_root = (base / FILE_STORE_PROCESADOS / raw_f / loc).resolve()
    if not src_root.is_dir():
        return []

    dest_dir = (
        _dir_locatario_consolidados(base, loc)
        if d == "consolidado"
        else _dir_locatario_pendientes(base, loc)
    )
    dest_dir.mkdir(parents=True, exist_ok=True)
    moved: list[str] = []
    for fn in filenames:
        safe_name = os.path.basename(fn)
        if not safe_name:
            continue
        src = (src_root / safe_name).resolve()
        try:
            src.relative_to(src_root)
        except ValueError:
            continue
        if not src.is_file():
            continue
        dest = dest_dir / safe_name
        if dest.exists():
            stem = dest.stem
            ext = dest.suffix
            ts = _ahora_lima().strftime("%Y%m%d_%H%M%S")
            dest = dest_dir / f"{stem}_{ts}{ext}"
        shutil.move(str(src), str(dest))
        moved.append(str(dest.relative_to(base)))

    try:
        if src_root.is_dir() and not any(src_root.iterdir()):
            src_root.rmdir()
            day_dir = src_root.parent
            if day_dir.is_dir() and not any(day_dir.iterdir()):
                day_dir.rmdir()
    except OSError:
        pass
    return moved


def restore_from_backup(locatario_codigo: str, filenames: list[str], *, destino: str = "pendiente") -> list[str]:
    """
    Restaura archivos desde backup_no_consolidados hacia pendientes o consolidados.
    """
    base = get_upload_base()
    dest_dir = _dir_locatario_consolidados(base, locatario_codigo) if destino == "consolidado" else _dir_locatario_pendientes(base, locatario_codigo)
    dest_dir.mkdir(parents=True, exist_ok=True)
    src_dir = _dir_locatario_backup(base, locatario_codigo)
    moved: list[str] = []
    for fn in filenames:
        safe_name = os.path.basename(fn)
        if not safe_name:
            continue
        src = src_dir / safe_name
        if not src.is_file():
            continue
        dest = dest_dir / safe_name
        if dest.exists():
            stem = dest.stem
            ext = dest.suffix
            ts = _ahora_lima().strftime("%Y%m%d_%H%M%S")
            dest = dest_dir / f"{stem}_{ts}{ext}"
        shutil.move(str(src), str(dest))
        moved.append(str(dest.relative_to(base)))
    return moved


PREVIEW_MAX_FILE_BYTES = 25 * 1024 * 1024
PREVIEW_MAX_ROWS_CAP = 200


def _preview_cap_rows(max_rows: int) -> int:
    return max(1, min(int(max_rows or 50), PREVIEW_MAX_ROWS_CAP))


def _detect_monto_column(columns: list) -> str | None:
    """Detecta columna de monto en reportes/consolidados."""
    for col in columns:
        n = str(col).strip().lower()
        if n == "monto" or n.startswith("monto ") or n.startswith("monto_"):
            return str(col)
    for col in columns:
        n = str(col).strip().lower()
        if "monto" in n:
            return str(col)
    for col in columns:
        n = str(col).strip().lower()
        if n in ("total", "importe", "venta"):
            return str(col)
    return None


def _read_tabular_df_for_preview(path: Path) -> pd.DataFrame:
    ext = path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(
            path,
            dtype=str,
            encoding="utf-8",
            encoding_errors="replace",
            sep=None,
            engine="python",
        )
    if ext == ".xlsx":
        return pd.read_excel(path, dtype=str, engine="openpyxl")
    return pd.read_excel(path, dtype=str, engine="xlrd")


def preview_tabular_file(path: Path, *, max_rows: int = 50, offset: int = 0) -> dict:
    """
    Vista previa tabular con paginación (offset) y suma total del campo Monto del archivo completo.
    """
    cap = _preview_cap_rows(max_rows)
    offset = max(0, int(offset or 0))
    if not path.is_file():
        return {"ok": False, "error": "no_existe"}
    ext = path.suffix.lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        return {"ok": False, "error": "extension_no_soportada"}
    try:
        size = path.stat().st_size
    except OSError:
        return {"ok": False, "error": "no_existe"}
    if size > PREVIEW_MAX_FILE_BYTES:
        return {"ok": False, "error": "archivo_muy_grande", "max_mb": PREVIEW_MAX_FILE_BYTES // (1024 * 1024)}

    try:
        df = _read_tabular_df_for_preview(path)
    except Exception as e:
        logger.warning("preview_tabular_file fallo: %s", path, exc_info=True)
        return {"ok": False, "error": "lectura_fallo", "detail": str(e)[:500]}

    total_rows = int(len(df))
    from app.services.ventas_normalizacion import sum_monto_column

    monto_col = _detect_monto_column(df.columns.tolist())
    monto_total = sum_monto_column(df[monto_col]) if monto_col else None

    end_idx = min(offset + cap, total_rows)
    chunk = df.iloc[offset:end_idx].copy() if total_rows else df.iloc[0:0].copy()
    chunk = chunk.fillna("")
    columns = [str(c) for c in chunk.columns.tolist()]
    rows = chunk.astype(str).values.tolist()
    has_more = end_idx < total_rows

    return {
        "ok": True,
        "filename": path.name,
        "extension": ext,
        "columns": columns,
        "rows": rows,
        "truncated": has_more,
        "row_count_shown": len(rows),
        "total_rows": total_rows,
        "offset": offset,
        "next_offset": end_idx if has_more else offset,
        "has_more": has_more,
        "monto_column": monto_col,
        "monto_total": monto_total,
    }


def preview_cierre_caja_tabular(
    locatario_codigo: str,
    filename: str,
    *,
    zona: str,
    max_rows: int = 50,
    offset: int = 0,
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
    return preview_tabular_file(path, max_rows=max_rows, offset=offset)


def preview_procesados_tabular(
    fecha: str,
    locatario_codigo: str,
    filename: str,
    *,
    max_rows: int = 50,
    offset: int = 0,
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
    return preview_tabular_file(path, max_rows=max_rows, offset=offset)
