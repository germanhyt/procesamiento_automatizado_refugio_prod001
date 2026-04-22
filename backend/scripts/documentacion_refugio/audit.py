#!/usr/bin/env python3
"""Auditoria: cuenta archivos en el mirror vs lo que el modulo Documentos GCB puede indexar."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from documentacion_refugio.scan import audit_mirror  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Auditar mirror vs payload Documentos GCB")
    ap.add_argument("--root", type=Path, default=Path("documentacionrefugio_mirror"))
    ap.add_argument("--json", action="store_true", help="Salida JSON en stdout")
    args = ap.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit(f"No existe: {root}")
    rep = audit_mirror(root)
    if args.json:
        print(json.dumps(rep, ensure_ascii=False, indent=2))
        return 0
    print("--- Auditoria mirror vs Documentos GCB ---")
    print(f"Raiz: {rep['mirror_root']}")
    print(f"Archivos totales (cualquier extension):     {rep['files_total_any_extension']}")
    print(f"PDF/imagenes (extensiones del modulo):        {rep['files_allowed_suffix_pdf_images']}")
    print(f"Entradas posibles en payload:                 {rep['payload_would_include']}")
    print(f"Excluidos ilegibles/sin fallback:             {rep['skipped_unreadable_count']}")
    print(f"Excluidos arbol invalido:                     {rep['skipped_bad_structure_count']}")
    print(f"Archivos otras extensiones (no van al GCB):   {rep['files_other_extensions']}")
    print(f"Cuadre PDF/imagenes (payload+omitidos=total):   {rep['accounting_pdf_images_ok']}")
    if rep["files_other_extensions"]:
        print("Top extensiones fuera del modulo:")
        for row in rep["top_extensions_in_mirror"]:
            if row["suffix"] in (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"):
                continue
            print(f"  {row['suffix']}: {row['count']}")
    print("--- Fin ---")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
