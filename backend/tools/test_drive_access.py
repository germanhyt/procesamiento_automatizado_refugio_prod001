#!/usr/bin/env python3
"""Comprueba acceso Drive por ID y rutas locales de configuración."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(root, "config", ".env"))

from app.services.gdrive_service import GDriveService


def main() -> None:
    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip('"\'')
    if creds.startswith("./"):
        creds = os.path.normpath(os.path.join(root, creds[2:]))
    elif not os.path.isabs(creds):
        creds = os.path.normpath(os.path.join(root, "config", creds))

    g = GDriveService(creds)
    print("Cuenta de servicio (compartir archivos con este email):")
    print(" ", g.creds.service_account_email)
    print()

    for label, key in [
        ("Config lectura", "DRIVE_ID_ARCHIVO_CONFIGURACION"),
        ("Config Web", "DRIVE_ID_ARCHIVO_CONFIGURACION_WEB"),
        ("Cierre caja", "DRIVE_ID_CARPETA_CIERRECAJA"),
        ("Procesados", "DRIVE_ID_CARPETA_PROCESADOS"),
    ]:
        fid = os.getenv(key, "").strip('"\'')
        if not fid:
            print(f"{label}: (no definido en .env)")
            continue
        try:
            m = g.service.files().get(fileId=fid, fields="id,name,mimeType").execute()
            print(f"{label}: OK  {m.get('name')!r}")
        except Exception as e:
            print(f"{label}: FALLO  {str(e)[:100]}")

    print()
    for label, p in [
        ("CONFIG_EXCEL_PATH", os.getenv("CONFIG_EXCEL_PATH", "")),
        ("CONFIG_WEB_EXCEL_PATH", os.getenv("CONFIG_WEB_EXCEL_PATH", "")),
        ("tools/ConfiguracionWeb", os.path.join(os.path.dirname(__file__), "ConfiguracionWeb.xlsx")),
    ]:
        p = str(p).strip().strip('"\'')
        ok = os.path.isfile(p)
        print(f"Local {label}: {'OK' if ok else 'NO'}  {p}")


if __name__ == "__main__":
    main()
