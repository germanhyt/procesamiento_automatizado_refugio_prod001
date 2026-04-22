#!/usr/bin/env python3
"""
Paso 1 - Descarga del mirror (wrapper).

Implementación: scripts/documentacion_refugio/mirror.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from documentacion_refugio.mirror import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
