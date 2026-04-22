import os
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.services.file_store_service import get_upload_base

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
