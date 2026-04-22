"""
Paso 2 (datos): escanear `documentacionrefugio_mirror/` y producir entradas para el manifest.

- `relative_path` y `codigo` siempre reflejan la posición lógica en el mirror (colección/categoría).
- `read_relative_override` (opcional): de dónde leer bytes si la ruta principal no es legible.
"""

from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

from documentacion_refugio.constants import (
    ALLOWED_SUFFIXES,
    CONVEXIA_MATRIZ_PREFIX,
    GCB_MATRIZ_PREFIX,
)


def codigo_for_relative(rel: str) -> str:
    h = hashlib.sha256(rel.encode("utf-8")).hexdigest()[:12].upper()
    return f"DOC_{h}"


def split_path_parts(rel: Path) -> tuple[str, str, str | None]:
    parts = rel.parts
    if len(parts) < 2:
        raise ValueError(f"Ruta demasiado corta: {rel}")
    top = parts[0]
    if len(parts) == 2:
        return top, "General", None
    second = parts[1]
    if len(parts) == 3:
        return top, second, None
    middle = parts[2:-1]
    sub = " / ".join(middle) if middle else None
    return top, second, sub


def _win_long_path(path: Path) -> str:
    resolved = path.resolve()
    s = str(resolved)
    if s.startswith("\\\\?\\"):
        return s
    if s.startswith("\\\\"):
        return "\\\\?\\UNC\\" + s[2:]
    return "\\\\?\\" + s


def file_readable(path: Path) -> bool:
    try:
        with path.open("rb") as f:
            f.read(1)
        return True
    except OSError:
        if sys.platform == "win32":
            try:
                with open(_win_long_path(path), "rb") as f:
                    f.read(1)
                return True
            except OSError:
                return False
        return False


def read_file_bytes(path: Path) -> bytes:
    """Lee binario; en Windows reintenta con prefijo extendido (rutas largas)."""
    try:
        return path.read_bytes()
    except OSError:
        if sys.platform == "win32":
            with open(_win_long_path(path), "rb") as f:
                return f.read()
        raise


def fallback_read_relative(root: Path, rel_posix: str) -> str | None:
    if not rel_posix.startswith(CONVEXIA_MATRIZ_PREFIX):
        return None
    name = Path(rel_posix).name
    alt_rel = f"{GCB_MATRIZ_PREFIX}{name}"
    if file_readable(root / alt_rel):
        return alt_rel
    return None


def build_entries_report(root: Path) -> tuple[list[dict], list[str], list[str]]:
    """
    Devuelve:
      - entradas para el manifest
      - skipped_unreadable: no se puede leer y no hay fallback (p. ej. OneDrive sin materializar)
      - skipped_bad_structure: no cumple arbol minimo (coleccion/categoria/archivo bajo la raiz)
    """
    root = root.resolve()
    entries: list[dict] = []
    skipped_unreadable: list[str] = []
    skipped_bad_structure: list[str] = []

    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            suf = Path(fn).suffix.lower()
            if suf not in ALLOWED_SUFFIXES:
                continue
            path = Path(dirpath) / fn
            try:
                rel = path.relative_to(root)
            except ValueError:
                continue
            rel_posix = rel.as_posix()
            try:
                coleccion, categoria, subcategoria = split_path_parts(rel)
            except ValueError:
                skipped_bad_structure.append(rel_posix)
                continue

            read_rel = rel_posix
            if not file_readable(path):
                fb = fallback_read_relative(root, rel_posix)
                if not fb:
                    skipped_unreadable.append(rel_posix)
                    continue
                read_rel = fb

            item: dict = {
                "relative_path": rel_posix,
                "codigo": codigo_for_relative(rel_posix),
                "nombre": path.stem,
                "coleccion": coleccion,
                "categoria": categoria,
                "subcategoria": subcategoria,
                "filename": path.name,
            }
            if read_rel != rel_posix:
                item["read_relative_override"] = read_rel
            entries.append(item)

    entries.sort(key=lambda e: e["relative_path"])
    return entries, skipped_unreadable, skipped_bad_structure


def build_entries(root: Path) -> list[dict]:
    return build_entries_report(root)[0]


def audit_mirror(root: Path) -> dict:
    """
    Compara el mirror completo con lo que puede entrar al modulo Documentos GCB.
    Ayuda a explicar diferencias frente al recuento 'original' del servidor.
    """
    root = root.resolve()
    by_suffix: dict[str, int] = {}
    allowed_on_disk = 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            suf = Path(fn).suffix.lower() or "(sin_extension)"
            by_suffix[suf] = by_suffix.get(suf, 0) + 1
            if Path(fn).suffix.lower() in ALLOWED_SUFFIXES:
                allowed_on_disk += 1

    entries, skipped_unreadable, skipped_bad_structure = build_entries_report(root)
    other_ext_total = sum(
        c for s, c in by_suffix.items() if s not in ALLOWED_SUFFIXES and s != "(sin_extension)"
    )
    top_other = sorted(
        ((s, c) for s, c in by_suffix.items() if s not in ALLOWED_SUFFIXES),
        key=lambda x: -x[1],
    )[:12]

    return {
        "mirror_root": str(root),
        "files_total_any_extension": sum(by_suffix.values()),
        "files_allowed_suffix_pdf_images": allowed_on_disk,
        "files_other_extensions": other_ext_total,
        "top_extensions_in_mirror": [{"suffix": s, "count": c} for s, c in top_other],
        "payload_would_include": len(entries),
        "skipped_unreadable_count": len(skipped_unreadable),
        "skipped_bad_structure_count": len(skipped_bad_structure),
        "accounting_pdf_images_ok": len(entries)
        + len(skipped_unreadable)
        + len(skipped_bad_structure)
        == allowed_on_disk,
    }
