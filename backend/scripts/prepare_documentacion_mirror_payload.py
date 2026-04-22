#!/usr/bin/env python3
"""
Paso 2 - Generar payload_manifest.json (wrapper).

Implementación: scripts/documentacion_refugio/manifest.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from documentacion_refugio.manifest import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
