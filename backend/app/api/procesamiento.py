from fastapi import APIRouter, HTTPException, File, UploadFile, Query
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
# Vacío = solo local (CONFIG_WEB_EXCEL_PATH / backend/tools); no reutilizar ID de Configuracion.xlsx
DRIVE_ID_CONFIG_WEB = os.getenv("DRIVE_ID_ARCHIVO_CONFIGURACION_WEB", "").strip('"\'') or None
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
        service_email = getattr(gdrive.creds, "service_account_email", None)

        def _probe(file_id: str | None) -> dict:
            if not file_id:
                return {"ok": False, "reason": "sin_id_en_env"}
            try:
                meta = (
                    gdrive.service.files()
                    .get(fileId=file_id, fields="id,name,mimeType")
                    .execute()
                )
                return {"ok": True, "name": meta.get("name"), "mimeType": meta.get("mimeType")}
            except Exception as exc:
                return {"ok": False, "reason": str(exc)[:200]}

        probes = {
            "config_read": _probe(DRIVE_ID_CONFIG),
            "config_web": _probe(DRIVE_ID_CONFIG_WEB),
            "cierre_caja": _probe(DRIVE_ID_CIERRECAJA),
            "procesados": _probe(DRIVE_ID_PROCESADOS),
        }
        res_list: list = []
        if DRIVE_ID_CIERRECAJA:
            res_list = gdrive.list_files_in_folder(DRIVE_ID_CIERRECAJA)
        carpetas_conectadas = bool(res_list)
        drive_error = None
        if DRIVE_ID_CIERRECAJA and not carpetas_conectadas:
            drive_error = probes["cierre_caja"].get("reason") or "carpeta vacía o sin acceso"

        from app.services.file_store_service import get_upload_base

        local_web = (os.getenv("CONFIG_WEB_EXCEL_PATH") or "").strip().strip('"\'')
        local_read = (os.getenv("CONFIG_EXCEL_PATH") or "").strip().strip('"\'')
        tools_web = os.path.normpath(
            os.path.join(base_dir, "backend", "tools", "ConfiguracionWeb.xlsx")
        )

        return {
            "drive_connected": carpetas_conectadas,
            "config_exists": bool(DRIVE_ID_CONFIG),
            "is_config_open": False,
            "upload_base": str(get_upload_base().resolve()),
            "drive_error": drive_error,
            "service_account_email": service_email,
            "drive_probes": probes,
            "local_config": {
                "CONFIG_EXCEL_PATH": {"path": local_read, "exists": os.path.isfile(local_read)},
                "CONFIG_WEB_EXCEL_PATH": {"path": local_web, "exists": os.path.isfile(local_web)},
                "backend_tools_ConfiguracionWeb": {
                    "path": tools_web,
                    "exists": os.path.isfile(tools_web),
                },
            },
            "modo_recomendado": (
                "local"
                if not probes["config_web"].get("ok") and os.path.isfile(local_web or tools_web)
                else "drive"
            ),
        }
    except Exception as e:
        return {"drive_connected": False, "config_exists": False, "error": str(e)}

@router.post("/flujo-completo")
async def ejecutar_flujo_completo():
    """Flujo histórico: usar pasos legacy individuales (FileStore + Drive config)."""
    service = get_legacy_service()
    return await service.convertir_xlsx_to_csv()

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
        drive_id_config_web=DRIVE_ID_CONFIG_WEB,
        drive_id_ventas=DRIVE_ID_CIERRECAJA,
        drive_id_procesados=DRIVE_ID_PROCESADOS,
        bq_project_id=os.getenv("BQ_PROJECT_ID"),
        bq_dataset=os.getenv("BQ_DATASET"),
        bq_creds_path=creds_path,
        bq_table_sales=os.getenv("BQ_TABLE_SALES"),
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

@router.post("/legacy/consolidar")
async def legacy_consolidar(
    modo_rango: str = "semana_actual",
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
    dry_run: bool = Query(
        False,
        description="Simula consolidación: informe completo sin escribir CSV en _consolidados",
    ),
):
    """Consolida pendientes por locatario en cierre_caja/{loc}/_consolidados según rango."""
    service = get_legacy_service()
    return await service.consolidar_desde_filestore(
        modo_rango=modo_rango,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        dry_run=dry_run,
    )

@router.post("/legacy/asociar")
async def legacy_asociar(
    modo_rango: str = "ultima_semana",
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
):
    service = get_legacy_service()
    return await service.asociar_negocios_automatico(
        modo_rango=modo_rango,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )

@router.post("/legacy/cargar-ventas")
async def legacy_cargar_ventas(
    clear: bool = Query(False, description="Vaciar sales_df y Realizadas antes de cargar"),
    archivar_pendientes_tras_consolidado: bool = Query(
        False,
        description="Tras archivar un consolidado FileStore, mover también todos los pendientes del mismo locatario",
    ),
):
    service = get_legacy_service()
    return await service.cargar_ventas_legacy(
        clear_data=clear,
        archivar_pendientes_tras_consolidado=archivar_pendientes_tras_consolidado,
    )

@router.post("/legacy/cargar-bigquery")
async def legacy_cargar_bigquery(
    modo_sync: str = Query(
        "pendiente",
        description="pendiente: solo Realizadas sin BQ_Sincronizado (MERGE idempotente). completo: todo sales_df.",
    ),
):
    service = get_legacy_service()
    return await service.cargar_bigquery_legacy(modo_sync=modo_sync)

@router.post("/legacy/subir")
async def legacy_subir_archivo(
    file: UploadFile = File(...),
    locatario_codigo: str | None = None,
):
    service = get_legacy_service()
    content = await file.read()
    return await service.save_upload_file(file.filename, content, locatario_codigo=locatario_codigo)

@router.post("/legacy/guardar-asociacion")
async def legacy_guardar_asociacion(archivo: str, codigo: str, inicio: str, fin: str):
    service = get_legacy_service()
    return await service.guardar_asociacion_manual(archivo, codigo, inicio, fin)

@router.get("/legacy/preview-sales")
async def legacy_preview_sales(limit: int = 100, offset: int = 0):
    """Vista previa de sales_df (offset desde el final para cargar más filas)."""
    service = get_legacy_service()
    return await service.get_sales_df_preview(limit=limit, offset=offset)

@router.get("/legacy/preview-realizadas")
async def legacy_preview_realizadas(limit: int = 100):
    """Vista previa de Realizadas."""
    service = get_legacy_service()
    return await service.get_realizadas_preview(limit)


@router.get("/legacy/staging-status")
async def legacy_staging_status():
    """Filas y montos de sales_df (Excel) vs stg_sales (PostgreSQL) y modo activo."""
    service = get_legacy_service()
    return await service.get_sales_staging_status()


@router.post("/legacy/import-staging-excel")
async def legacy_import_staging_excel(
    clear_before: bool = Query(False, description="TRUNCATE stg_sales antes de importar"),
    dry_run: bool = Query(False, description="Solo simular, sin escribir en PostgreSQL"),
):
    """Migra histórico: hoja sales_df → tabla stg_sales (upsert idempotente)."""
    service = get_legacy_service()
    return await service.import_sales_staging_from_excel(
        clear_before=clear_before,
        dry_run=dry_run,
    )


@router.post("/legacy/import-realizadas-staging-excel")
async def legacy_import_realizadas_staging_excel(
    clear_before: bool = Query(False, description="TRUNCATE stg_realizadas antes de importar"),
    dry_run: bool = Query(False, description="Solo simular, sin escribir en PostgreSQL"),
):
    """Migra histórico: hoja Realizadas → tabla stg_realizadas (upsert idempotente)."""
    service = get_legacy_service()
    return await service.import_realizadas_staging_from_excel(
        clear_before=clear_before,
        dry_run=dry_run,
    )
