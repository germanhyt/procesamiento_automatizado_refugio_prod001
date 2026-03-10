import os
import pandas as pd
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

class ConversionService:
    def __init__(self, base_path: str):
        self.base_path = base_path

    def get_pending_xlsx(self, directory: str) -> List[str]:
        """Lista archivos .xlsx en el directorio especificado."""
        full_path = os.path.join(self.base_path, directory)
        if not os.path.exists(full_path):
            logger.error(f"Directorio no encontrado: {full_path}")
            return []
        return [f for f in os.listdir(full_path) if f.lower().endswith('.xlsx')]

    async def convert_to_csv(self, directory: str, filename: str) -> Dict:
        """Convierte un archivo XLSX a CSV (sep=;) y elimina el original."""
        xlsx_path = os.path.join(self.base_path, directory, filename)
        csv_filename = filename.rsplit('.', 1)[0] + '.csv'
        csv_path = os.path.join(self.base_path, directory, csv_filename)

        try:
            # Leer todas las hojas o solo la primera (según necesidad del proyecto)
            df = pd.read_excel(xlsx_path)
            df.to_csv(csv_path, index=False, sep=";")
            
            # Eliminar el archivo original
            os.remove(xlsx_path)
            
            return {
                "success": True,
                "message": f"Convertido: {filename} -> {csv_filename}",
                "file": csv_filename
            }
        except Exception as e:
            logger.error(f"Error convirtiendo {filename}: {str(e)}")
            return {"success": False, "error": str(e), "file": filename}

    async def process_batch(self, directory: str) -> List[Dict]:
        """Procesa todos los archivos XLSX de una carpeta."""
        files = self.get_pending_xlsx(directory)
        results = []
        for file in files:
            result = await self.convert_to_csv(directory, file)
            results.append(result)
        return results
