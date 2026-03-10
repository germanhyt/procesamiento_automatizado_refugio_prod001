import os
import pandas as pd
import openpyxl
from datetime import datetime
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class VentasService:
    def __init__(self, config_path: str, procesamiento_path: str):
        self.config_path = config_path
        self.procesamiento_path = procesamiento_path

    def excel_cell_to_csv_indices(self, cell_address: str):
        """Traduce 'AK7' a índices (row, col)."""
        if not cell_address or pd.isna(cell_address):
            return None
        column_letters = ''.join(filter(str.isalpha, cell_address))
        row_number = ''.join(filter(str.isdigit, cell_address))
        if not row_number:
            return None
        
        column_index = 0
        for char in column_letters:
            column_index = column_index * 26 + (ord(char.upper()) - ord('A') + 1)
        
        # En la lógica original se resta 2 para el row index (OFFSET de reportes)
        return int(row_number) - 2, column_index - 1

    def get_coordenadas(self) -> Dict[str, Any]:
        """Extrae el mapeo de coordenadas desde la hoja 'BaseCarga'."""
        try:
            df_coords = pd.read_excel(self.config_path, sheet_name="BaseCarga")
            coords = {}
            for _, row in df_coords.iterrows():
                codigo = row['CodigoNegocio']
                # Mapeamos columnas de BaseCarga que contienen direcciones de celdas
                coords[codigo] = {col: row[col] for col in df_coords.columns if col != 'CodigoNegocio'}
            return coords
        except Exception as e:
            logger.error(f"Error cargando coordenadas: {str(e)}")
            return {}

    async def extraer_datos_archivo(self, file_path: str, business_coords: Dict) -> Dict:
        """Extrae datos de un CSV usando las celdas mapeadas."""
        if not business_coords:
            return {"success": False, "error": "Sin coordenadas para este negocio"}
            
        try:
            # Leer CSV con delimitador ; (formato de salida de ConversionService)
            df_csv = pd.read_csv(file_path, sep=";", encoding='latin-1')
            
            # Extraer solo si existen coordenadas de Fecha y Monto (mínimo viable)
            fecha_addr = business_coords.get('Fecha')
            monto_addr = business_coords.get('Monto')
            
            if pd.isna(fecha_addr) or pd.isna(monto_addr):
                 return {"success": False, "error": "Mapeo incompleto para este negocio"}

            f_idx = self.excel_cell_to_csv_indices(fecha_addr)
            m_idx = self.excel_cell_to_csv_indices(monto_addr)
            
            if not f_idx or not m_idx:
                return {"success": False, "error": "Direcciones de celda inválidas"}

            # Extraemos el valor de la celda específica
            fecha_val = df_csv.iloc[f_idx[0], f_idx[1]]
            monto_val = df_csv.iloc[m_idx[0], m_idx[1]]
            
            # Limpieza básica de monto (ej: "S/ 1,230.00" -> 1230.0)
            if isinstance(monto_val, str):
                monto_val = monto_val.replace('S/', '').replace(',', '').strip()

            venta = {
                "Fecha": fecha_val,
                "Monto": float(monto_val),
                "CodigoNegocio": business_coords.get('CodigoNegocio', 'N/A'),
                "Estado": 0.0
            }
                
            return {"success": True, "data": [venta]}
        except Exception as e:
            logger.error(f"Error extrayendo de {file_path}: {str(e)}")
            return {"success": False, "error": str(e)}

    async def actualizar_sales_df(self, nuevos_datos: List[Dict]):
        """Añade los nuevos registros a la hoja 'sales_df'."""
        try:
            df_actual = pd.read_excel(self.config_path, sheet_name="sales_df")
            df_nuevos = pd.DataFrame(nuevos_datos)
            
            # Asegurar que las columnas coincidan con el esquema de sales_df
            df_final = pd.concat([df_actual, df_nuevos], ignore_index=True)
            
            with pd.ExcelWriter(self.config_path, mode='a', engine='openpyxl', if_sheet_exists='replace') as writer:
                df_final.to_excel(writer, sheet_name="sales_df", index=False)
                
            return {"success": True, "count": len(df_nuevos)}
        except Exception as e:
            logger.error(f"Error actualizando sales_df: {str(e)}")
            return {"success": False, "error": str(e)}
