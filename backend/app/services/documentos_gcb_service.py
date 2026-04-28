import logging
import os
import re
import sys
import tempfile
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.services.file_store_service import get_upload_base

logger = logging.getLogger(__name__)

FILE_STORE_DOCUMENTOS_GCB = "documentos_gcb"
DOCUMENTOS_GCB_ALLOWED_EXTENSIONS = frozenset({".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"})
DOCUMENTOS_GCB_MAX_SIZE_MB = 50


def _resolved_upload_base() -> Path:
    """Base de uploads siempre absoluta y estable (evita mezclar rutas relativas al cwd)."""
    return get_upload_base().expanduser().resolve()


def _win_long_path(path: Path) -> str:
    """Rutas largas y UTF-8 en Windows (supera ~MAX_PATH sin prefijo extendido)."""
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


def slugify_component(value: str, fallback: str = "general") -> str:
    text = _strip_accents((value or "").strip().lower())
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def _safe_basename(name: str) -> str:
    raw = os.path.basename((name or "").strip())
    return raw or "documento"


def _validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in DOCUMENTOS_GCB_ALLOWED_EXTENSIONS:
        allow = ", ".join(sorted(DOCUMENTOS_GCB_ALLOWED_EXTENSIONS))
        raise ValueError(f"Extensión no soportada. Permitidas: {allow}")
    return ext


def _guess_mime_type(ext: str, provided_mime: Optional[str]) -> str:
    if provided_mime and "/" in provided_mime:
        return provided_mime
    if ext == ".pdf":
        return "application/pdf"
    if ext in (".png",):
        return "image/png"
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    if ext == ".gif":
        return "image/gif"
    return "application/octet-stream"


def _document_folder(coleccion: str, categoria: str, documento_id: int) -> Path:
    base = _resolved_upload_base()
    return (
        base
        / FILE_STORE_DOCUMENTOS_GCB
        / slugify_component(coleccion, "coleccion")
        / slugify_component(categoria, "categoria")
        / f"doc_{documento_id}"
    )


def save_document_file(
    *,
    documento_id: int,
    coleccion: str,
    categoria: str,
    original_filename: str,
    provided_mime_type: Optional[str],
    content: bytes,
) -> dict:
    max_bytes = DOCUMENTOS_GCB_MAX_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise ValueError(f"Archivo demasiado grande (máximo {DOCUMENTOS_GCB_MAX_SIZE_MB} MB)")

    original_name = _safe_basename(original_filename)
    ext = _validate_extension(original_name)
    mime_type = _guess_mime_type(ext, provided_mime_type)

    stem = Path(original_name).stem
    safe_stem = slugify_component(stem, "documento")
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    actual_name = f"{safe_stem}_{ts}{ext}"

    target_dir = _document_folder(coleccion, categoria, documento_id)
    target_path = target_dir / actual_name
    _mkdirs_and_write_bytes(target_path, content)

    base = _resolved_upload_base()
    relative_path = str(target_path.resolve().relative_to(base)).replace("\\", "/")

    return {
        "archivo_nombre_original": original_name,
        "archivo_nombre_actual": actual_name,
        "archivo_ruta": relative_path,
        "mime_type": mime_type,
        "extension": ext,
        "tamano_bytes": len(content),
    }


def resolve_absolute_path(relative_path: str) -> Path:
    return (_resolved_upload_base() / relative_path.replace("\\", "/")).resolve()


def path_is_readable_document(path: Path) -> bool:
    if not path.is_file():
        return False
    ext = path.suffix.lower()
    return ext in DOCUMENTOS_GCB_ALLOWED_EXTENSIONS


def _pick_file_in_doc_folder(folder: Path, preferred_name: Optional[str]) -> Optional[Path]:
    if not folder.is_dir():
        return None
    files = [p for p in folder.iterdir() if p.is_file() and not p.name.startswith(".")]
    if not files:
        return None
    if preferred_name:
        for p in files:
            if p.name == preferred_name:
                return p
        pl = preferred_name.lower()
        for p in files:
            if p.name.lower() == pl:
                return p
    if len(files) == 1:
        return files[0]
    return max(files, key=lambda p: p.stat().st_mtime)


def resolve_existing_document_file_path(
    *,
    documento_id: int,
    coleccion: str,
    categoria: str,
    archivo_ruta: str,
    archivo_nombre_actual: Optional[str],
) -> Optional[Path]:
    """Resuelve el archivo físico aunque `archivo_ruta` en BD no coincida con la carpeta real (migraciones, slugs distintos)."""
    upload_base = _resolved_upload_base()

    try:
        if archivo_ruta:
            p = resolve_absolute_path(archivo_ruta)
            if path_is_readable_document(p):
                return p
    except (OSError, ValueError):
        logger.debug("No se pudo usar archivo_ruta para doc %s", documento_id, exc_info=True)

    folder = _document_folder(coleccion, categoria, documento_id)
    picked = _pick_file_in_doc_folder(folder, archivo_nombre_actual)
    if picked and path_is_readable_document(picked):
        return picked

    root = upload_base / FILE_STORE_DOCUMENTOS_GCB
    if root.is_dir():
        for doc_dir in root.glob(f"**/doc_{documento_id}"):
            if doc_dir.is_dir():
                picked = _pick_file_in_doc_folder(doc_dir, archivo_nombre_actual)
                if picked and path_is_readable_document(picked):
                    return picked
    return None


def create_documents_zip_tempfile(rows_in_order: list) -> tuple[str, int]:
    """
    Crea un ZIP temporal con los archivos resueltos para cada fila (orden preservado).
    Entradas en el ZIP: `{codigo_slug}_{id}{ext}` (plano, sin carpetas).
    Devuelve (ruta_temporal, cantidad_agregada). El llamador debe borrar el archivo.
    """
    fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    added = 0
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for row in rows_in_order:
                path = resolve_existing_document_file_path(
                    documento_id=row.id,
                    coleccion=row.coleccion,
                    categoria=row.categoria,
                    archivo_ruta=row.archivo_ruta,
                    archivo_nombre_actual=row.archivo_nombre_actual,
                )
                if not path:
                    continue
                ext = path.suffix.lower()
                if not ext and row.extension:
                    e = (row.extension or "").strip().lower()
                    ext = e if e.startswith(".") else f".{e}"
                stem = slugify_component(row.codigo, f"doc-{row.id}")
                arcname = f"{stem}_{row.id}{ext}"
                zf.write(path, arcname=arcname)
                added += 1
        return tmp_path, added
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def delete_physical_file(relative_path: str) -> None:
    if not relative_path:
        return
    path = resolve_absolute_path(relative_path)
    base = _resolved_upload_base()
    if not str(path).startswith(str(base)):
        return
    if not path.is_file():
        return
    if sys.platform == "win32":
        try:
            os.remove(_win_long_path(path))
        except OSError:
            path.unlink(missing_ok=True)
    else:
        path.unlink(missing_ok=True)
