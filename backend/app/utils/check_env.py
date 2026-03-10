import os
import pandas as pd
import logging

logger = logging.getLogger(__name__)

def verify_connections(drive_path: str, config_path: str, locatarios_path: str):
    # NORMALIZACIÓN CRÍTICA: Convertir barras / o \ a la convención del OS
    clean_drive = os.path.normpath(drive_path.strip('"\''))
    clean_config = os.path.normpath(config_path.strip('"\''))
    clean_locatarios = os.path.normpath(locatarios_path.strip('"\''))

    results = {
        "drive_folder": {"exists": False, "path": clean_drive, "error": None},
        "config_file": {"exists": False, "path": clean_config, "error": None, "is_open": False},
        "locatarios_folder": {"exists": False, "path": clean_locatarios, "error": None}
    }

    # 1. Verificar Carpeta Base Drive
    if os.path.exists(clean_drive):
        results["drive_folder"]["exists"] = True
    else:
        results["drive_folder"]["error"] = f"Unidad o carpeta no accesible: {clean_drive}"

    # 2. Verificar Carpeta Locatarios
    if os.path.exists(clean_locatarios):
        results["locatarios_folder"]["exists"] = True
    else:
        results["locatarios_folder"]["error"] = f"Ruta locatarios no encontrada: {clean_locatarios}"

    # 3. Verificar Master Config
    if os.path.exists(clean_config):
        results["config_file"]["exists"] = True
        try:
            # Prueba de apertura binaria rápida
            with open(clean_config, 'rb') as f:
                f.read(1)
            results["config_file"]["is_open"] = False
        except IOError:
            results["config_file"]["is_open"] = True
            results["config_file"]["error"] = "Archivo bloqueado por Excel."
    else:
        results["config_file"]["error"] = f"Archivo no encontrado: {clean_config}"

    return results
