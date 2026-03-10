from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.services.conversion_service import ConversionService
from app.services.asociacion_service import AsociacionService
from app.services.locatarios_service import LocatariosService
from app.services.ventas_service import VentasService
from app.services.bigquery_service import BigQueryService
import os
from dotenv import load_dotenv

# Configurar ruta al archivo .env de forma robusta
# de app/api/procesamiento.py -> ROOT/backend/app/api/procesamiento.py
# necesitamos subir 4 niveles para llegar al root (3 para backend, 1 más para root)
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
env_path = os.path.join(base_dir, "config", ".env")
load_dotenv(env_path)

router = APIRouter(prefix="/procesamiento", tags=["Procesamiento"])

# Configuración de rutas desde .env
DRIVE_PATH = os.getenv("GOOGLE_DRIVE_PATH")
CONFIG_PATH = os.getenv("CONFIG_EXCEL_PATH")
LOCATARIOS_PATH = os.getenv("LOCATARIOS_PATH")
PROCESAMIENTO_PATH = os.getenv("PROCESAMIENTO_PATH")

# Inicialización de servicios
conv_service = ConversionService(DRIVE_PATH)
asoc_service = AsociacionService(CONFIG_PATH)
loc_service = LocatariosService(LOCATARIOS_PATH, PROCESAMIENTO_PATH)
ventas_service = VentasService(CONFIG_PATH, PROCESAMIENTO_PATH)
# Resolver ruta de credenciales si es relativa al root
bq_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if bq_creds and not os.path.isabs(bq_creds):
    bq_creds = os.path.join(base_dir, bq_creds.lstrip("./"))

bq_service = BigQueryService(
    os.getenv("BQ_PROJECT_ID"), 
    os.getenv("BQ_DATASET"), 
    bq_creds
)

@router.post("/flujo-completo")
async def ejecutar_flujo_completo(background_tasks: BackgroundTasks):
    """Orquesta los 5 pasos del proceso en orden según el plan maestro."""
    try:
        results = {}
        
        # 1. Convertir XLSX a CSV en CierreCaja
        results["conversion"] = await conv_service.process_batch("CierreCaja")
        
        # 2. Auto-asociar archivos
        results["asociacion"] = await asoc_service.auto_asociar_archivos(os.path.join(DRIVE_PATH, "CierreCaja"))
        
        # Obtener lista de negocios para pasos siguientes (necesitamos info completa)
        negocios = asoc_service.get_negocios_info()
        
        # 3. Consolidar Locatarios (Iterativo por negocio)
        consolidados = []
        for negocio in negocios:
            # Descripcion (nombre carpeta) y CodigoNegocio
            res = await loc_service.consolidar_locatario(negocio['Descripcion'], negocio['CodigoNegocio'])
            if res.get("success") and res.get("registros", 0) > 0:
                consolidados.append({
                    "negocio": negocio['Descripcion'], 
                    "file": res.get("file"),
                    "codigo": negocio['CodigoNegocio']
                })

        results["consolidacion"] = {"total": len(consolidados), "count": len(consolidados)}
        
        # 4. Extraer datos y cargar a sales_df (Excel local) utilizando coordenadas
        coords = ventas_service.get_coordenadas()
        extracciones = []
        for cons in consolidados:
            res_ext = await ventas_service.extraer_datos_archivo(cons["file"], coords.get(cons["codigo"], {}))
            if res_ext.get("success") and res_ext.get("data"):
                # Actualizar sales_df en Excel (añadiendo registros)
                await ventas_service.actualizar_sales_df(res_ext["data"])
                extracciones.append({"negocio": cons["negocio"], "registros": len(res_ext["data"])})
        results["extraccion"] = {"total": len(extracciones), "detalles": extracciones}
        
        # 5. Sincronizar con BigQuery
        # results["bigquery"] = await bq_service.sync_sales_df(CONFIG_PATH)
        
        return {
            "status": "success",
            "message": "Flujo procesado correctamente",
            "data": results
        }
    except Exception as e:
        logger.error(f"Error en flujo completo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status-drive")
async def check_drive_status():
    """Verifica la conexión con las carpetas de Google Drive."""
    return {
        "drive_connected": os.path.exists(DRIVE_PATH),
        "config_exists": os.path.exists(CONFIG_PATH),
        "locatarios_exists": os.path.exists(LOCATARIOS_PATH)
    }
