#!/usr/bin/env python3
"""Wrapper: python scripts/audit_documentacion_mirror.py [--json] [--root DIR]"""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from documentacion_refugio.audit import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
