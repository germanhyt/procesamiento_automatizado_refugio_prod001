import os
import pandas as pd
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class BigQueryService:
    def __init__(self, project_id: str, dataset_id: str, credentials_path: str):
        self.project_id = project_id
        self.dataset_id = dataset_id
        self.credentials_path = credentials_path
        self.client = self._get_client()

    def _get_client(self) -> bigquery.Client:
        """Crea el cliente de BigQuery con las credenciales configuradas."""
        if not os.path.exists(self.credentials_path):
            logger.error(f"Credenciales no encontradas en {self.credentials_path}")
            return None
        
        creds = service_account.Credentials.from_service_account_file(self.credentials_path)
        return bigquery.Client(project=self.project_id, credentials=creds)

    async def cargar_tabla_desde_df(self, df: pd.DataFrame, table_name: str, mode: str = "APPEND"):
        """Carga un DataFrame a una tabla de BigQuery."""
        if self.client is None:
            return {"success": False, "error": "BigQuery client no disponible"}
        
        table_id = f"{self.project_id}.{self.dataset_id}.{table_name}"
        
        # Determinar disposición de escritura
        write_disposition = (
            bigquery.WriteDisposition.WRITE_TRUNCATE if mode == "TRUNCATE" 
            else bigquery.WriteDisposition.WRITE_APPEND
        )
        
        try:
            # Configuración del Job
            job_config = bigquery.LoadJobConfig(
                write_disposition=write_disposition,
                autodetect=True  # Detectar esquema automáticamente
            )
            
            # Cargar datos
            job = self.client.load_table_from_dataframe(df, table_id, job_config=job_config)
            job.result()  # Esperar a que el job termine
            
            return {
                "success": True, 
                "message": f"Carga exitosa a {table_name}", 
                "rows_loaded": job.output_rows
            }
        except Exception as e:
            logger.error(f"Error cargando BigQuery {table_name}: {str(e)}")
            return {"success": False, "error": str(e)}

    async def sync_sales_df(self, excel_path: str):
        """Sincroniza la hoja 'sales_df' completa con BigQuery."""
        try:
            df = pd.read_excel(excel_path, sheet_name="sales_df")
            if df.empty:
                return {"success": True, "message": "Hoja sales_df vacía, nada que sincronizar."}
                
            # Normalizar tipos de datos para BigQuery
            if 'Fecha' in df.columns:
                df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce').dt.date
            
            numeric_cols = ['Monto', 'Estado', 'Propina', 'Descuento', 'Impuesto', 'MontoNeto']
            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
            
            # Realizar carga (TRUNCATE para sobreescribir con el estado actual del Excel)
            return await self.cargar_tabla_desde_df(df, "sales_df", mode="TRUNCATE")
        except Exception as e:
            logger.error(f"Error sincronizando sales_df: {str(e)}")
            return {"success": False, "error": str(e)}
