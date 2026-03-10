import os
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

class LocatariosService:
    def __init__(self, locatarios_path: str, output_path: str):
        self.locatarios_path = locatarios_path
        self.output_path = output_path

    def get_semana_anterior(self) -> Dict:
        """Calcula el rango de la última semana completa (lunes a domingo)."""
        hoy = datetime.now().date()
        dias_desde_lunes = hoy.weekday()
        if dias_desde_lunes == 0:  # Hoy es lunes
            ultimo_lunes = hoy - timedelta(days=7)
        else:
            ultimo_lunes = hoy - timedelta(days=dias_desde_lunes + 7)
        
        ultimo_domingo = ultimo_lunes + timedelta(days=6)
        return {
            "lunes": ultimo_lunes,
            "domingo": ultimo_domingo,
            "folder": f"Semana_{ultimo_lunes.strftime('%Y_%m_%d')}_a_{ultimo_domingo.strftime('%m_%d')}"
        }

    async def consolidar_locatario(self, key_carpeta: str, codigo_negocio: str) -> Dict:
        """Consolida archivos de un locatario específico."""
        folder_semana = self.get_semana_anterior()
        # Limpiar espacios en blanco (ej: 'Nashmys ' -> 'Nashmys')
        normalized_key = key_carpeta.strip()
        path_locatario = os.path.join(self.locatarios_path, normalized_key)
        
        if not os.path.exists(path_locatario):
            logger.error(f"Carpeta locatario no encontrada: {path_locatario}")
            return {"success": False, "error": f"Directorio locatario no encontrado: {normalized_key}"}

        # Escanear archivos XLSX en la carpeta del locatario
        archivos = [f for f in os.listdir(path_locatario) if f.lower().endswith('.xlsx')]
        df_consolidado = pd.DataFrame()

        for archivo in archivos:
            try:
                # Leer y filtrar por fecha (se asume que existe columna 'Fecha')
                df = pd.read_excel(os.path.join(path_locatario, archivo))
                if 'Fecha' in df.columns:
                    df['Fecha'] = pd.to_datetime(df['Fecha'])
                    mask = (df['Fecha'].dt.date >= folder_semana["lunes"]) & (df['Fecha'].dt.date <= folder_semana["domingo"])
                    df = df[mask]
                
                df_consolidado = pd.concat([df_consolidado, df], ignore_index=True)
            except Exception as e:
                logger.error(f"Error procesando {archivo} para {key_carpeta}: {str(e)}")

        if df_consolidado.empty:
            return {"success": True, "message": "No hay datos para la semana anterior", "registros": 0}

        # Eliminar duplicados y guardar
        df_consolidado = df_consolidado.drop_duplicates()
        output_dir = os.path.join(self.output_path, folder_semana["folder"])
        os.makedirs(output_dir, exist_ok=True)
        
        output_file = os.path.join(output_dir, f"{key_carpeta}_consolidado.csv")
        df_consolidado.to_csv(output_file, index=False, sep=";")
        
        return {
            "success": True, 
            "message": f"Consolidación exitosa para {key_carpeta}", 
            "registros": len(df_consolidado),
            "file": output_file
        }
