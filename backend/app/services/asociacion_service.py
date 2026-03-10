import os
import pandas as pd
from fuzzywuzzy import fuzz
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class AsociacionService:
    def __init__(self, config_path: str):
        self.config_path = config_path

    def get_negocios(self) -> List[str]:
        """Carga la hoja 'Negocios' del archivo Configuracion.xlsx."""
        try:
            df = pd.read_excel(self.config_path, sheet_name="Negocios")
            return df["Descripcion"].dropna().unique().tolist()
        except Exception as e:
            logger.error(f"Error cargando negocios: {str(e)}")
            return []

    def get_negocios_info(self) -> List[Dict[str, str]]:
        """Carga la hoja 'Negocios' detallada."""
        try:
            df = pd.read_excel(self.config_path, sheet_name="Negocios")
            # Extraer columnas clave para mapeo
            return df[["CodigoNegocio", "Descripcion"]].dropna().to_dict(orient="records")
        except Exception as e:
            logger.error(f"Error cargando info negocios: {str(e)}")
            return []

    def buscar_mejor_coincidencia(self, archivo: str, tiendas: List[str], umbral: int = 80) -> Optional[str]:
        """Usa fuzzy matching para encontrar la tienda más parecida al nombre del archivo."""
        mejor_tienda = None
        mejor_puntaje = 0
        for tienda in tiendas:
            puntaje = fuzz.partial_ratio(tienda.lower(), archivo.lower())
            if puntaje > umbral and puntaje > mejor_puntaje:
                mejor_tienda = tienda
                mejor_puntaje = puntaje
        return mejor_tienda

    async def auto_asociar_archivos(self, directory: str, umbral: int = 80) -> Dict:
        """Asocia archivos CSV en el directorio con los negocios configurados."""
        tiendas = self.get_negocios()
        archivos = [f for f in os.listdir(directory) if f.lower().endswith('.csv')]
        
        asociaciones = []
        pendientes = []

        for archivo in archivos:
            mejor_tienda = self.buscar_mejor_coincidencia(archivo, tiendas, umbral)
            if mejor_tienda:
                asociaciones.append({"archivo": archivo, "tienda": mejor_tienda})
                # No removemos la tienda de la lista para permitir múltiples archivos por negocio
            else:
                pendientes.append(archivo)

        return {
            "asociados": asociaciones,
            "pendientes": pendientes,
            "total": len(archivos)
        }

    async def guardar_asociaciones_config(self, df_asociaciones: pd.DataFrame):
        """Guarda las asociaciones finales en el Excel de configuración."""
        try:
            with pd.ExcelWriter(self.config_path, mode='a', engine='openpyxl', if_sheet_exists='replace') as writer:
                df_asociaciones.to_excel(writer, sheet_name="Asociaciones", index=False)
            return True
        except Exception as e:
            logger.error(f"Error guardando asociaciones: {str(e)}")
            return False
