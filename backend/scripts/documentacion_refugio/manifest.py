#!/usr/bin/env python3
"""
Paso 2: generar payload_manifest.json (lista de documentos legibles + metadatos inferidos del árbol).
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from documentacion_refugio.constants import ALLOWED_SUFFIXES, MANIFEST_VERSION
from documentacion_refugio.scan import audit_mirror, build_entries_report


def build_payload(root: Path, root_arg_display: str) -> dict:
    root = root.resolve()
    entries, skipped_unreadable, skipped_bad_structure = build_entries_report(root)
    return {
        "version": MANIFEST_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": root_arg_display,
        "root_resolved": str(root),
        "entry_count": len(entries),
        "skipped_unreadable_count": len(skipped_unreadable),
        "skipped_unreadable": skipped_unreadable,
        "skipped_bad_structure_count": len(skipped_bad_structure),
        "skipped_bad_structure": skipped_bad_structure,
        "allowed_suffixes": sorted(ALLOWED_SUFFIXES),
        "entries": entries,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Paso 2: generar payload_manifest.json desde el mirror")
    ap.add_argument(
        "--root",
        type=Path,
        default=Path("documentacionrefugio_mirror"),
        help="Carpeta raíz del mirror",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Salida JSON (por defecto <root>/payload_manifest.json)",
    )
    ap.add_argument(
        "--audit",
        action="store_true",
        help="Imprime resumen mirror vs modulo (extensiones, omitidos) antes de escribir el JSON",
    )
    args = ap.parse_args()

    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit(f"No existe la carpeta: {root}")

    out = args.out if args.out is not None else root / "payload_manifest.json"
    out = out.resolve()

    if args.audit:
        rep = audit_mirror(root)
        print("--- Auditoria mirror vs Documentos GCB ---")
        print(f"Archivos en mirror (cualquier extension): {rep['files_total_any_extension']}")
        print(f"PDF/imagenes admitidos por el modulo:      {rep['files_allowed_suffix_pdf_images']}")
        print(f"Entrarian al payload (legibles + fallback): {rep['payload_would_include']}")
        print(f"Omitidos ilegibles/sin fallback:            {rep['skipped_unreadable_count']}")
        print(f"Omitidos arbol invalido (<2 carpetas):       {rep['skipped_bad_structure_count']}")
        print(f"Archivos otras extensiones (no van al GCB): {rep['files_other_extensions']}")
        for row in rep.get("top_extensions_in_mirror", [])[:8]:
            if row["suffix"] in ALLOWED_SUFFIXES:
                continue
            print(f"  .{row['suffix']}: {row['count']} archivos")
        print("--- Fin auditoria ---")

    payload = build_payload(root, args.root.as_posix())
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Paso 2 - OK: {payload['entry_count']} entradas -> {out}")
    if skipped := payload["skipped_unreadable"]:
        print(
            f"Paso 2 - AVISO: {len(skipped)} ruta(s) no legibles (sin entrada en JSON). "
            "Materializar en disco o copiar desde otra carpeta del mirror."
        )
        for s in skipped[:15]:
            print(f"  - {s}")
        if len(skipped) > 15:
            print(f"  ... y {len(skipped) - 15} más (ver skipped_unreadable en el JSON)")
    if bad := payload.get("skipped_bad_structure") or []:
        print(
            f"Paso 2 - AVISO: {len(bad)} ruta(s) con arbol invalido (minimo: raiz/coleccion/archivo)."
        )
        for s in bad[:5]:
            print(f"  - {s}")
        if len(bad) > 5:
            print(f"  ... y {len(bad) - 5} más (skipped_bad_structure en el JSON)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
