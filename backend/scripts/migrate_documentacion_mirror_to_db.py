#!/usr/bin/env python3
"""
Paso 3 - Importar a PostgreSQL y filestore (wrapper).

Implementación: backend/scripts/documentacion_refugio/importer.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from documentacion_refugio.importer import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
