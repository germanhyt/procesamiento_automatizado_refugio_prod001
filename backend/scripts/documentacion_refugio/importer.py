#!/usr/bin/env python3
"""
Paso 3: importar entradas del manifest (o escaneo directo) a PostgreSQL y uploads/documentos_gcb.

Usa DocumentoGcb + save_document_file (misma lógica que la API).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def _resolve_paths() -> tuple[Path, Path, Path]:
    """Repo: backend/scripts/ o scripts/ hermano de backend/. Docker: /app/scripts + /app/app."""
    _scripts_dir = Path(__file__).resolve().parent.parent
    repo_or_app = _scripts_dir.parent
    sibling_backend = repo_or_app / "backend"
    if (sibling_backend / "app").is_dir():
        return _scripts_dir, sibling_backend, repo_or_app
    if (repo_or_app / "app").is_dir():
        return _scripts_dir, repo_or_app, repo_or_app.parent
    raise SystemExit(
        "No se encontro el paquete 'app': ejecute desde la raiz del repo o use el contenedor con /app montado."
    )


_SCRIPTS_DIR, _BACKEND_ROOT, _REPO_ROOT = _resolve_paths()
for p in (_SCRIPTS_DIR, _BACKEND_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from documentacion_refugio.constants import ALLOWED_SUFFIXES  # noqa: E402
from documentacion_refugio.scan import build_entries_report, read_file_bytes  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.documentos_gcb import DocumentoGcb  # noqa: E402
from app.services.documentos_gcb_service import (  # noqa: E402
    delete_physical_file,
    save_document_file,
)

MAX_CODIGO = 120
MAX_NOMBRE = 255
MAX_COLECCION = 80
MAX_CATEGORIA = 120
MAX_SUBCATEGORIA = 120


def normalize_codigo(raw: str) -> str:
    value = (raw or "").strip().upper()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^A-Z0-9_-]", "", value)
    return value


def clip(value: str | None, max_len: int, label: str, warnings: list[str]) -> str:
    s = (value or "").strip()
    if len(s) > max_len:
        warnings.append(f"{label} truncado de {len(s)} a {max_len} caracteres")
        return s[:max_len]
    return s


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "entries" not in data:
        raise SystemExit("Manifest inválido: falta objeto con clave 'entries'")
    return data


def migrate_one(
    db,
    *,
    abs_file: Path,
    original_filename: str,
    codigo_raw: str,
    nombre: str,
    coleccion: str,
    categoria: str,
    subcategoria: str | None,
    descripcion: str | None,
    dry_run: bool,
    replace_existing: bool,
    warnings: list[str],
) -> str:
    code = normalize_codigo(codigo_raw)
    if not code:
        return "error: codigo vacío tras normalizar"

    nombre_c = clip(nombre, MAX_NOMBRE, "nombre", warnings)
    col_c = clip(coleccion, MAX_COLECCION, "coleccion", warnings)
    cat_c = clip(categoria, MAX_CATEGORIA, "categoria", warnings)
    sub_c = clip(subcategoria, MAX_SUBCATEGORIA, "subcategoria", warnings) if subcategoria else None
    desc = (descripcion or "").strip() or None

    try:
        content = read_file_bytes(abs_file)
    except OSError as e:
        return f"omitido: no se puede leer ({e})"

    if not content:
        return "omitido: archivo vacío"

    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_SUFFIXES:
        ext = abs_file.suffix.lower()
    if ext not in ALLOWED_SUFFIXES:
        return f"omitido: extensión no permitida {ext}"

    existing = db.query(DocumentoGcb).filter(DocumentoGcb.codigo == code).first()

    if existing and not replace_existing:
        return "omitido: ya existe (use --replace-existing para reemplazar archivo)"

    if dry_run:
        if existing and replace_existing:
            return "dry-run: reemplazaría archivo"
        return "dry-run: crearía registro + copiaría a uploads"

    if existing and replace_existing:
        old_path = existing.archivo_ruta
        saved_path = ""
        try:
            existing.coleccion = col_c
            existing.categoria = cat_c
            meta = save_document_file(
                documento_id=existing.id,
                coleccion=existing.coleccion,
                categoria=existing.categoria,
                original_filename=original_filename,
                provided_mime_type=None,
                content=content,
            )
            saved_path = meta["archivo_ruta"]
            existing.nombre = nombre_c or existing.nombre
            existing.subcategoria = sub_c
            existing.descripcion = desc if desc is not None else existing.descripcion
            existing.archivo_nombre_original = meta["archivo_nombre_original"]
            existing.archivo_nombre_actual = meta["archivo_nombre_actual"]
            existing.archivo_ruta = meta["archivo_ruta"]
            existing.mime_type = meta["mime_type"]
            existing.extension = meta["extension"]
            existing.tamano_bytes = meta["tamano_bytes"]
            existing.activo = True
            db.commit()
            db.refresh(existing)
            if old_path and old_path != existing.archivo_ruta:
                delete_physical_file(old_path)
            return "ok: reemplazado"
        except Exception:
            db.rollback()
            if saved_path:
                delete_physical_file(saved_path)
            raise

    saved_path = ""
    try:
        row = DocumentoGcb(
            codigo=code,
            nombre=nombre_c,
            coleccion=col_c,
            categoria=cat_c,
            subcategoria=sub_c,
            descripcion=desc,
            archivo_nombre_original="",
            archivo_nombre_actual="",
            archivo_ruta="",
            mime_type="application/octet-stream",
            extension="",
            tamano_bytes=0,
            activo=True,
        )
        db.add(row)
        db.flush()

        meta = save_document_file(
            documento_id=row.id,
            coleccion=row.coleccion,
            categoria=row.categoria,
            original_filename=original_filename,
            provided_mime_type=None,
            content=content,
        )
        saved_path = meta["archivo_ruta"]

        row.archivo_nombre_original = meta["archivo_nombre_original"]
        row.archivo_nombre_actual = meta["archivo_nombre_actual"]
        row.archivo_ruta = meta["archivo_ruta"]
        row.mime_type = meta["mime_type"]
        row.extension = meta["extension"]
        row.tamano_bytes = meta["tamano_bytes"]

        db.commit()
        return "ok: creado"
    except Exception:
        db.rollback()
        if saved_path:
            delete_physical_file(saved_path)
        raise


def main() -> int:
    ap = argparse.ArgumentParser(description="Paso 3: mirror/manifest a PostgreSQL + uploads/documentos_gcb")
    ap.add_argument("--manifest", type=Path, default=None, help="payload_manifest.json")
    ap.add_argument(
        "--mirror",
        type=Path,
        default=None,
        help="Solo con --mirror y sin --manifest: escanea la carpeta (mismas reglas que paso 2)",
    )
    ap.add_argument("--mirror-root", type=Path, default=None, help="Raíz para relative_path del manifest")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--replace-existing",
        action="store_true",
        help="Si el codigo existe, reemplaza archivo y actualiza metadatos desde la entrada",
    )
    args = ap.parse_args()

    entries: list[dict]
    mirror_root: Path

    if args.mirror and not args.manifest:
        mirror_root = args.mirror.resolve()
        if not mirror_root.is_dir():
            raise SystemExit(f"No existe la carpeta mirror: {mirror_root}")
        entries, skipped_scan, skipped_layout = build_entries_report(mirror_root)
        print(f"Paso 3 - {len(entries)} entradas (escaneo directo de {mirror_root})")
        if skipped_scan:
            print(
                f"Paso 3 - AVISO: {len(skipped_scan)} ruta(s) ilegible(s) sin fallback; "
                "no están en el lote. Ejecute paso 2 y revise skipped_unreadable."
            )
        if skipped_layout:
            print(f"Paso 3 - AVISO: {len(skipped_layout)} ruta(s) con arbol invalido (excluidas del payload).")
    else:
        manifest_path = args.manifest
        if manifest_path is None:
            manifest_path = _REPO_ROOT / "documentacionrefugio_mirror" / "payload_manifest.json"
        manifest_path = manifest_path.resolve()
        if not manifest_path.is_file():
            raise SystemExit(
                f"No se encontró el manifest: {manifest_path}\n"
                "Ejecute: python backend/scripts/prepare_documentacion_mirror_payload.py (desde la raiz del repo)\n"
                "O use: --mirror documentacionrefugio_mirror (sin --manifest)"
            )
        data = load_manifest(manifest_path)
        entries = data["entries"]
        su = data.get("skipped_unreadable") or []
        if su:
            print(
                f"Paso 3 - AVISO (manifest): {len(su)} archivo(s) excluidos en paso 2 por ilegibles; "
                "no hay filas para ellos hasta corregir el mirror."
            )
        sb = data.get("skipped_bad_structure") or []
        if sb:
            print(
                f"Paso 3 - AVISO (manifest): {len(sb)} ruta(s) excluidas por arbol invalido en paso 2."
            )
        if args.mirror_root:
            mirror_root = args.mirror_root.resolve()
        else:
            mr = data.get("root_resolved") or data.get("root")
            if mr and Path(mr).is_dir():
                mirror_root = Path(mr).resolve()
            else:
                mirror_root = manifest_path.parent.resolve()
        print(f"Paso 3 - {len(entries)} entradas desde {manifest_path}")
        print(f"Paso 3 - mirror_root = {mirror_root}")

    if not mirror_root.is_dir():
        raise SystemExit(f"mirror_root no es carpeta: {mirror_root}")

    db = SessionLocal()
    ok = skip = err = planned = 0
    try:
        for i, entry in enumerate(entries, 1):
            logical_rel = entry.get("relative_path") or ""
            read_rel = entry.get("read_relative_override") or logical_rel
            abs_file = (mirror_root / read_rel).resolve()
            orig_name = Path(logical_rel).name if logical_rel else abs_file.name

            w: list[str] = []
            if read_rel != logical_rel:
                w.append("bytes desde read_relative_override; metadatos = relative_path")

            codigo = entry.get("codigo") or ""
            if len(normalize_codigo(codigo)) > MAX_CODIGO:
                w.append(f"codigo supera {MAX_CODIGO} tras normalizar; puede fallar")

            try:
                msg = migrate_one(
                    db,
                    abs_file=abs_file,
                    original_filename=orig_name,
                    codigo_raw=codigo,
                    nombre=str(entry.get("nombre") or Path(orig_name).stem),
                    coleccion=str(entry.get("coleccion") or ""),
                    categoria=str(entry.get("categoria") or ""),
                    subcategoria=entry.get("subcategoria"),
                    descripcion=entry.get("descripcion"),
                    dry_run=args.dry_run,
                    replace_existing=args.replace_existing,
                    warnings=w,
                )
            except Exception as e:
                err += 1
                print(f"[{i}/{len(entries)}] ERROR {logical_rel}: {e}")
                continue

            if args.dry_run and msg.startswith("dry-run"):
                planned += 1
            elif msg.startswith("ok"):
                ok += 1
            elif msg.startswith("omitido") or msg.startswith("error"):
                skip += 1
            else:
                skip += 1

            extra = f" | {'; '.join(w)}" if w else ""
            print(f"[{i}/{len(entries)}] {msg}: {logical_rel}{extra}")

    finally:
        db.close()

    if args.dry_run:
        print(f"Paso 3 - Resumen (dry-run): planificados={planned}, omitidos={skip}, errores={err}")
    else:
        print(f"Paso 3 - Resumen: ok={ok}, omitidos={skip}, errores={err}")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
