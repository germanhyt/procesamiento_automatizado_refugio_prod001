from fastapi import APIRouter, HTTPException, File, UploadFile
import os
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Configuración de entorno: Intentar detectar raíz del proyecto
current_file_path = os.path.abspath(__file__)
# app/api/procesamiento.py -> app/api -> app -> backend -> root
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file_path))))

# Si estamos en Docker, base_dir podría ser /app o /
if not os.path.exists(os.path.join(base_dir, "config")):
    # Fallback para estructura dentro del contenedor backend
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_file_path)))

env_path = os.path.join(base_dir, "config", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    # En Docker las variables ya vienen en el enviroment, no es crítico que el .env exista
    pass

router = APIRouter(prefix="/procesamiento", tags=["Procesamiento"])

# Integración de Google Drive API: Reemplazamos las rutas locales por IDs de carpetas/archivos
DRIVE_ID_CONFIG = os.getenv("DRIVE_ID_ARCHIVO_CONFIGURACION", "").strip('"\'')
DRIVE_ID_CIERRECAJA = os.getenv("DRIVE_ID_CARPETA_CIERRECAJA", "").strip('"\'')
DRIVE_ID_PROCESADOS = os.getenv("DRIVE_ID_CARPETA_PROCESADOS", "").strip('"\'')

@router.get("/status-drive")
async def check_drive_status():
    """Endpoint ultra-rápido: Verifica disponibilidad de archivos/carpetas vía Google Drive API."""
    try:
        from app.services.gdrive_service import GDriveService
        
        # Resolución robusta de la ruta de credenciales
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip('"\'')
        if creds_path.startswith("./"):
            creds_path = os.path.normpath(os.path.join(base_dir, creds_path[2:]))
        elif not os.path.isabs(creds_path):
            creds_path = os.path.normpath(os.path.join(base_dir, "config", creds_path))
            
        gdrive = GDriveService(creds_path)
        
        # Validar si puede leer el ID de CierreCaja
        carpetas_conectadas = False
        try:
            res_list = gdrive.list_files_in_folder(DRIVE_ID_CIERRECAJA)
            carpetas_conectadas = True
        except:
            carpetas_conectadas = False
            
        return {
            "drive_connected": carpetas_conectadas,
            "config_exists": bool(DRIVE_ID_CONFIG),  # Podría validarse con una metadata request si quisiéramos
            "is_config_open": False # Ya no aplica en la nube (la API sobreescribe)
        }
    except Exception as e:
        return {"drive_connected": False, "config_exists": False, "error": str(e)}

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
    from app.services.gdrive_service import GDriveService
    
    # Resolución robusta de la ruta de credenciales
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip('"\'')
    if creds_path.startswith("./"):
        # base_dir apunta a la raíz del proyecto (donde está la carpeta config)
        creds_path = os.path.normpath(os.path.join(base_dir, creds_path[2:]))
    elif not os.path.isabs(creds_path):
        creds_path = os.path.normpath(os.path.join(base_dir, "config", creds_path))

    gdrive = GDriveService(creds_path)

    return LegacyService(
        gdrive_service=gdrive,
        drive_id_config=DRIVE_ID_CONFIG,
        drive_id_ventas=DRIVE_ID_CIERRECAJA,
        drive_id_procesados=DRIVE_ID_PROCESADOS,
        bq_project_id=os.getenv("BQ_PROJECT_ID"),
        bq_dataset=os.getenv("BQ_DATASET"),
        bq_creds_path=creds_path
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
