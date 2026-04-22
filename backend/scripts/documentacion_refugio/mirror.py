#!/usr/bin/env python3
"""
Paso 1: descarga recursiva desde el listado IIS (HTML) del servidor de documentación.

Por defecto: http://161.132.244.77/documentacionrefugio/ hacia carpeta documentacionrefugio_mirror/
"""

from __future__ import annotations

import argparse
from html import unescape
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin, urlparse, urlsplit, urlunsplit
from urllib.request import Request, urlopen

USER_AGENT = "mirror-documentacion-refugio/1.0 (+local script)"
REQUEST_DELAY_SEC = 0.35


def safe_request_url(url: str) -> str:
    p = urlsplit(url)
    enc_path = "/" + "/".join(
        quote(unquote(seg), safe="") for seg in p.path.split("/") if seg
    )
    return urlunsplit((p.scheme, p.netloc, enc_path, p.query, p.fragment))


def fetch_bytes(url: str) -> bytes:
    url = safe_request_url(url)
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=180) as resp:
        return resp.read()


def split_listing_lines(html: str) -> list[str]:
    return re.split(r"<br\s*/?>", html, flags=re.IGNORECASE)


def parse_listing_line(line: str) -> tuple[str, bool] | None:
    if "[Al directorio principal]" in line or "Al directorio principal" in line:
        return None
    m = re.search(r'<A\s+HREF="([^"]+)"', line, re.I)
    if not m:
        return None
    href = unescape(m.group(1).strip())
    is_dir = "&lt;dir&gt;" in line
    return href, is_dir


def normalize_dir_url(page_url: str, href: str) -> str:
    joined = urljoin(page_url if page_url.endswith("/") else page_url + "/", href)
    if not joined.endswith("/"):
        joined += "/"
    return joined


def normalize_file_url(page_url: str, href: str) -> str:
    return urljoin(page_url if page_url.endswith("/") else page_url + "/", href)


def _windows_extended_path(path: Path) -> str:
    resolved = path.resolve()
    s = str(resolved)
    if s.startswith("\\\\?\\"):
        return s
    if s.startswith("\\\\"):
        return "\\\\?\\UNC\\" + s[2:]
    return "\\\\?\\" + s


def write_bytes_safe(local: Path, data: bytes) -> None:
    if sys.platform == "win32":
        ep = _windows_extended_path(local)
        os.makedirs(os.path.dirname(ep), exist_ok=True)
        with open(ep, "wb") as f:
            f.write(data)
    else:
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)


def path_under_prefix(full_url: str, netloc: str, path_prefix: str) -> str | None:
    p = urlparse(full_url)
    if p.netloc != netloc:
        return None
    path = unquote(p.path)
    if not path.startswith(path_prefix.rstrip("/")):
        return None
    rel = path[len(path_prefix) :].lstrip("/")
    return rel if rel else None


def mirror(start_url: str, out_dir: Path, dry_run: bool) -> tuple[int, int]:
    parsed_start = urlparse(start_url)
    netloc = parsed_start.netloc
    path_prefix = "/" + "/".join(p for p in parsed_start.path.split("/") if p)
    if not path_prefix.endswith("/"):
        path_prefix += "/"

    visited_dirs: set[str] = set()
    downloaded_files: set[str] = set()
    dirs_queue: list[str] = [start_url if start_url.endswith("/") else start_url + "/"]
    files_ok = 0
    files_fail = 0

    while dirs_queue:
        page_url = dirs_queue.pop(0)
        if page_url in visited_dirs:
            continue
        visited_dirs.add(page_url)

        try:
            raw = fetch_bytes(page_url)
        except (HTTPError, URLError, TimeoutError, OSError) as e:
            print(f"ERROR listado {page_url}: {e}", file=sys.stderr)
            files_fail += 1
            continue

        try:
            html = raw.decode("utf-8", errors="replace")
        except Exception:
            html = raw.decode("latin-1", errors="replace")

        if "<pre>" not in html.lower():
            print(f"AVISO: no parece listado HTML, se omite: {page_url}", file=sys.stderr)
            continue

        for line in split_listing_lines(html):
            parsed = parse_listing_line(line)
            if parsed is None:
                continue
            href, is_dir = parsed
            if is_dir:
                durl = normalize_dir_url(page_url, href)
                rel = path_under_prefix(durl, netloc, path_prefix)
                if rel is None:
                    continue
                if durl not in visited_dirs:
                    dirs_queue.append(durl)
                print(f"DIR  {rel}")
            else:
                furl = normalize_file_url(page_url, href)
                rel = path_under_prefix(furl, netloc, path_prefix)
                if rel is None:
                    continue
                if furl in downloaded_files:
                    continue
                downloaded_files.add(furl)

                local = out_dir / rel
                if dry_run:
                    print(f"FILE {rel}")
                    files_ok += 1
                    continue

                try:
                    data = fetch_bytes(furl)
                    write_bytes_safe(local, data)
                    print(f"OK   {rel} ({len(data)} bytes)")
                    files_ok += 1
                except (HTTPError, URLError, TimeoutError, OSError) as e:
                    print(f"FAIL {rel}: {e}", file=sys.stderr)
                    files_fail += 1

                time.sleep(REQUEST_DELAY_SEC)

        time.sleep(REQUEST_DELAY_SEC)

    return files_ok, files_fail


def main() -> int:
    ap = argparse.ArgumentParser(description="Paso 1: mirror del listado documentacionrefugio (IIS)")
    ap.add_argument(
        "--url",
        default="http://161.132.244.77/documentacionrefugio/",
        help="URL raíz del listado",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("documentacionrefugio_mirror"),
        help="Carpeta destino",
    )
    ap.add_argument("--dry-run", action="store_true", help="Solo listar rutas, no descargar")
    args = ap.parse_args()

    out = args.out.resolve()
    print(f"Paso 1 - Origen: {args.url}")
    print(f"Paso 1 - Destino: {out}")
    if args.dry_run:
        print("(dry-run)")

    ok, fail = mirror(args.url, out, args.dry_run)
    print(f"Paso 1 - Listo: {ok} archivos OK, {fail} errores")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
