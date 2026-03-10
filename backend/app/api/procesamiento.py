from fastapi import APIRouter, HTTPException, File, UploadFile
import os
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Configuración de entorno
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
env_path = os.path.join(base_dir, "config", ".env")
load_dotenv(env_path)

router = APIRouter(prefix="/procesamiento", tags=["Procesamiento"])

# Rutas desde .env con normalización forzada de Windows
DRIVE_PATH = os.path.normpath(os.getenv("GOOGLE_DRIVE_PATH", "").strip('"\''))
CONFIG_PATH = os.path.normpath(os.getenv("CONFIG_EXCEL_PATH", "").strip('"\''))
LOCATARIOS_PATH = os.path.normpath(os.getenv("LOCATARIOS_PATH", "").strip('"\''))
PROCESAMIENTO_PATH = os.path.normpath(os.getenv("PROCESAMIENTO_PATH", "").strip('"\''))

@router.get("/status-drive")
async def check_drive_status():
    """Endpoint ultra-rápido: Solo verifica existencia de rutas."""
    try:
        from app.utils.check_env import verify_connections
        report = verify_connections(DRIVE_PATH, CONFIG_PATH, LOCATARIOS_PATH)
        return {
            "drive_connected": report["drive_folder"]["exists"],
            "config_exists": report["config_file"]["exists"],
            "is_config_open": report["config_file"]["is_open"]
        }
    except Exception as e:
        return {"drive_connected": False, "error": str(e)}

@router.post("/flujo-completo")
async def ejecutar_flujo_completo():
    """Importación dinámica: Solo carga servicios pesados al ejecutar."""
    from app.services.conversion_service import ConversionService
    from app.services.asociacion_service import AsociacionService
    from app.services.locatarios_service import LocatariosService
    from app.services.ventas_service import VentasService
    from app.services.bigquery_service import BigQueryService

    try:
        conv = ConversionService(DRIVE_PATH)
        res_conv = await conv.process_batch("CierreCaja")
        return {"status": "success", "data": res_conv}
    except Exception as e:
        logger.error(f"Error en ejecución: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# RUTAS FLUJO LEGACY (Restauradas)
# ==========================================

def get_legacy_service():
    from app.services.legacy_service import LegacyService
    
    # Resolución robusta de la ruta de credenciales
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip('"\'')
    if creds_path.startswith("./"):
        # base_dir apunta a la raíz del proyecto (donde está la carpeta config)
        creds_path = os.path.normpath(os.path.join(base_dir, creds_path[2:]))
    elif not os.path.isabs(creds_path):
        creds_path = os.path.normpath(os.path.join(base_dir, "config", creds_path))

    return LegacyService(
        DRIVE_PATH, 
        CONFIG_PATH, 
        os.getenv("BQ_PROJECT_ID"), 
        os.getenv("BQ_DATASET"), 
        creds_path
    )

@router.get("/legacy/archivos")
async def legacy_listar_archivos():
    service = get_legacy_service()
    return await service.list_cierre_caja_files()

@router.get("/legacy/negocios")
async def legacy_listar_negocios():
    service = get_legacy_service()
    return await service.obtener_negocios_lista()

@router.post("/legacy/convertir")
async def legacy_convertir():
    service = get_legacy_service()
    return await service.convertir_xlsx_to_csv()

@router.post("/legacy/asociar")
async def legacy_asociar():
    service = get_legacy_service()
    return await service.asociar_negocios_automatico()

@router.post("/legacy/cargar-ventas")
async def legacy_cargar_ventas(clear: bool = False):
    service = get_legacy_service()
    return await service.cargar_ventas_legacy(clear_data=clear)

@router.post("/legacy/cargar-bigquery")
async def legacy_cargar_bigquery():
    service = get_legacy_service()
    return await service.cargar_bigquery_legacy()

@router.post("/legacy/subir")
async def legacy_subir_archivo(file: UploadFile = File(...)):
    service = get_legacy_service()
    content = await file.read()
    return await service.save_upload_file(file.filename, content)

@router.post("/legacy/guardar-asociacion")
async def legacy_guardar_asociacion(archivo: str, codigo: str, inicio: str, fin: str):
    service = get_legacy_service()
    return await service.guardar_asociacion_manual(archivo, codigo, inicio, fin)

@router.get("/legacy/preview-sales")
async def legacy_preview_sales(limit: int = 100):
    """Vista previa de sales_df."""
    service = get_legacy_service()
    return await service.get_sales_df_preview(limit)

@router.get("/legacy/preview-realizadas")
async def legacy_preview_realizadas(limit: int = 100):
    """Vista previa de Realizadas."""
    service = get_legacy_service()
    return await service.get_realizadas_preview(limit)
