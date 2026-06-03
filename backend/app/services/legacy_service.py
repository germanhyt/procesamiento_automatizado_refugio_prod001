import os
from pathlib import Path
import pandas as pd
import shutil
import logging
import chardet
import subprocess
import sys
import openpyxl
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
import numpy as np
from fuzzywuzzy import fuzz
from google.cloud import bigquery
from google.oauth2 import service_account

from app.core.constants import FILE_STORE_SUB_CONSOLIDADOS, LOCATARIOS, get_locatario_code_from_full

logger = logging.getLogger(__name__)

# Motivos de omisión / estado en consolidación (código → texto operativo)
_CONSOL_SKIP_LEGIBLE: dict[str, str] = {
    "sin_carpeta": "No hay carpeta ni archivos en cierre_caja para este local.",
    "sin_base_carga": "Falta una fila en la hoja BaseCarga (Configuración) para el código del local.",
    "sin_pendientes": "No hay archivos pendientes en la carpeta del local.",
    "solo_consolidados": "No hay pendientes; ya existen archivos en _consolidados (revisar si corresponde reprocesar).",
    "sin_filas_validas": "Ningún pendiente generó ventas con Monto > 0 y Fecha válida.",
    "sin_registros_en_rango_fecha": "Se extrajeron ventas, pero ninguna cae en el rango de fechas elegido.",
}


def _activar_cargar(val) -> bool:
    """Excel puede devolver Cargar como 1, 1.0, '1', True, etc."""
    if val is None:
        return False
    if isinstance(val, (float, np.floating)) and np.isnan(val):
        return False
    if isinstance(val, (bool, np.bool_)):
        return bool(val)
    if isinstance(val, (int, np.integer, float, np.floating)):
        try:
            return int(float(val)) == 1
        except (TypeError, ValueError):
            return False
    s = str(val).strip().lower()
    return s in ("1", "true", "sí", "si", "yes", "y")


class LegacyService:
    def __init__(
        self,
        gdrive_service,
        drive_id_config: str,
        drive_id_ventas: str,
        drive_id_procesados: str,
        bq_project_id: str,
        bq_dataset: str,
        bq_creds_path: str,
        drive_id_config_web: str | None = None,
        bq_table_sales: str | None = None,
    ):
        self.gdrive = gdrive_service
        self.drive_id_config_read = (drive_id_config or "").strip()
        web_id = (drive_id_config_web or "").strip()
        self.drive_id_config_write = web_id or None
        self.drive_id_config = self.drive_id_config_read  # compat
        self.drive_id_ventas = drive_id_ventas
        self.drive_id_procesados = drive_id_procesados

        self.bq_project_id = bq_project_id
        self.bq_dataset = bq_dataset
        self.bq_creds_path = bq_creds_path
        self.bq_table_sales = (bq_table_sales or os.getenv("BQ_TABLE_SALES") or "stg_sales_silver").strip()

        # Temp paths for local processing within Docker/VPS
        self.temp_dir = "/tmp/refugio_data"
        os.makedirs(self.temp_dir, exist_ok=True)
        # Lectura (BaseCarga, Negocios maestro): Configuracion.xlsx
        self.config_read_path = os.path.join(self.temp_dir, "Configuracion.xlsx")
        # Escritura (Activas, sales_df, Realizadas): ConfiguracionWeb.xlsx
        self.config_write_path = os.path.join(self.temp_dir, "ConfiguracionWeb.xlsx")
        self.config_path = self.config_read_path
        
        # Root path for scripts
        self.backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        # Intentar ruta local (Docker) o ruta relativa (Desarrollo)
        local_prediction = os.path.join(self.backend_dir, "prediction", "predictor_ventas_powerbi_clean.py")
        if os.path.exists(local_prediction):
            self.prediction_script = local_prediction
        else:
            self.project_root = os.path.dirname(self.backend_dir)
            self.prediction_script = os.path.join(self.project_root, "prediction", "predictor_ventas_powerbi_clean.py")

    def _local_config_candidates(self, *, web: bool = False) -> list[str]:
        """Rutas locales si Drive falla."""
        paths: list[str] = []
        env_key = "CONFIG_WEB_EXCEL_PATH" if web else "CONFIG_EXCEL_PATH"
        env_path = (os.getenv(env_key) or "").strip().strip('"\'')
        if env_path:
            paths.append(env_path)
        root = os.path.dirname(self.backend_dir)
        fname = "ConfiguracionWeb.xlsx" if web else "Configuracion.xlsx"
        for rel in (
            os.path.join(self.backend_dir, "tools", fname),
            os.path.join(root, "config", fname),
            os.path.join(self.backend_dir, "config", fname),
        ):
            paths.append(rel)
        if web:
            for rel in self._local_config_candidates(web=False):
                if rel not in paths:
                    paths.append(rel)
        return paths

    def _copy_local_config_fallback(self, dest_path: str, *, web: bool = False) -> bool:
        for candidate in self._local_config_candidates(web=web):
            if os.path.isfile(candidate) and os.path.getsize(candidate) >= 128:
                shutil.copy2(candidate, dest_path)
                logger.info("Configuración cargada desde copia local: %s -> %s", candidate, dest_path)
                return True
        return False

    def _first_local_config_web_path(self) -> Path | None:
        for candidate in self._local_config_candidates(web=True):
            p = Path(candidate)
            if p.is_file() and p.stat().st_size >= 128:
                return p.resolve()
        return None

    def _resolve_config_web_read_path(self) -> Path:
        """
        Lectura alineada al proyecto: CONFIG_WEB_EXCEL_PATH / backend/tools/ConfiguracionWeb.xlsx.
        Sin usar /tmp si existe copia local (consolidación, Negocios, preview inicial).
        """
        local = self._first_local_config_web_path()
        if local:
            return local
        self._ensure_config_write_workbook()
        return Path(self.config_write_path).resolve()

    def _ensure_config_write_workbook(self) -> Path:
        """
        Copia operativa en /tmp/refugio_data/ConfiguracionWeb.xlsx para escritura (Activas, sales_df).
        Sincroniza desde local si falta temp o el local es más reciente; si no, Drive.
        """
        os.makedirs(self.temp_dir, exist_ok=True)
        local = self._first_local_config_web_path()
        temp = Path(self.config_write_path)

        if local is not None:
            if not temp.is_file() or local.stat().st_mtime > temp.stat().st_mtime:
                shutil.copy2(local, temp)
                logger.info("ConfiguracionWeb operativa sincronizada desde %s → %s", local, temp)
                return temp.resolve()

        if temp.is_file() and temp.stat().st_size >= 128:
            return temp.resolve()

        if self.drive_id_config_write:
            ok = self.gdrive.download_file(self.drive_id_config_write, str(temp))
            if ok and temp.is_file() and temp.stat().st_size >= 128:
                logger.info("ConfiguracionWeb operativa desde Drive → %s", temp)
                return temp.resolve()
            logger.warning(
                "Descarga ConfiguracionWeb desde Drive falló (id=%s). Probando local…",
                self.drive_id_config_write,
            )

        if self._copy_local_config_fallback(str(temp), web=True):
            return temp.resolve()

        raise ValueError(
            "No se pudo obtener ConfiguracionWeb.xlsx. Use backend/tools/ConfiguracionWeb.xlsx "
            "o CONFIG_WEB_EXCEL_PATH en .env."
        )

    def _resolve_config_web_workbook(self) -> Path:
        """
        Lectura de hojas web (sales_df, Realizadas, Activas): local si es la fuente más reciente;
        si /tmp fue actualizado en la sesión (Asociar/Ventas), usa la copia operativa.
        """
        local = self._first_local_config_web_path()
        temp = Path(self.config_write_path)
        if temp.is_file() and temp.stat().st_size >= 128:
            if local is None or temp.stat().st_mtime >= local.stat().st_mtime:
                return temp.resolve()
        if local:
            return local
        return self._ensure_config_write_workbook()

    def _download_config_read(self) -> None:
        """Descarga Configuracion.xlsx (lectura: BaseCarga, Negocios)."""
        if self.drive_id_config_read:
            ok = self.gdrive.download_file(self.drive_id_config_read, self.config_read_path)
            if ok and os.path.isfile(self.config_read_path) and os.path.getsize(self.config_read_path) >= 128:
                return
            logger.warning("Descarga Configuracion.xlsx falló (id=%s). Probando local…", self.drive_id_config_read)
        if self._copy_local_config_fallback(self.config_read_path, web=False):
            return
        size = os.path.getsize(self.config_read_path) if os.path.isfile(self.config_read_path) else 0
        raise ValueError(
            "No se pudo obtener Configuracion.xlsx (lectura). Revise DRIVE_ID_ARCHIVO_CONFIGURACION o "
            f"config/Configuracion.xlsx. Tamaño en temp: {size} bytes."
        )

    def _download_config_write(self) -> None:
        """Compat: asegura copia operativa en /tmp (ver _ensure_config_write_workbook)."""
        self._ensure_config_write_workbook()

    def _download_config(self) -> None:
        """Compat: asegura copia operativa para lectura/escritura del flujo web."""
        self._ensure_config_write_workbook()

    def _read_config_sheet(
        self,
        sheet_name: str,
        *,
        from_web: bool = False,
        operational: bool = False,
    ) -> pd.DataFrame:
        """
        Lee una hoja de ConfiguracionWeb.xlsx.
        - operational=True: copia en /tmp (tras Asociar/Ventas).
        - from_web=True o por defecto en hojas del flujo web: _resolve_config_web_workbook().
        - from_web=False (legacy): mismo libro local primero (_resolve_config_web_read_path).
        """
        from app.services.file_store_service import read_excel_sheet

        if operational:
            path = self._ensure_config_write_workbook()
        elif from_web:
            path = self._resolve_config_web_workbook()
        else:
            path = self._resolve_config_web_read_path()
        return read_excel_sheet(path, sheet_name)

    def _resolve_config_path_for_mapping(self) -> Path:
        """Alias: BaseCarga y mapeo usan el mismo libro local que el resto del módulo."""
        return self._resolve_config_web_read_path()

    def _read_base_carga_df(self) -> pd.DataFrame:
        from app.services.file_store_service import read_excel_sheet

        return read_excel_sheet(self._resolve_config_web_read_path(), "BaseCarga")

    def _upload_config(self):
        """Sube ConfiguracionWeb.xlsx (resultados del procesamiento) a Drive."""
        if not os.path.isfile(self.config_write_path) or os.path.getsize(self.config_write_path) < 128:
            raise ValueError("No hay ConfiguracionWeb.xlsx local para subir a Drive.")
        if self.drive_id_config_write:
            self.gdrive.update_file(self.drive_id_config_write, self.config_write_path)


    # ==========================================
    # REGLAS ESPECIALES (Fieles a CargaVentas_csvOfi.py)
    # ==========================================

    def _normalize_numeric_es(self, value):
        """Normalización para A06: Comas a puntos y limpieza de símbolos."""
        if value is None or (isinstance(value, float) and np.isnan(value)): return 0.0
        if isinstance(value, (int, float)): return float(value)
        s = str(value).strip().replace('S/', '').replace(' ', '').replace(',', '.')
        try:
            # Eliminar cualquier cosa que no sea número, punto o signo menos
            # Importante: re.sub requiere el import re que ya está al inicio
            clean_str = re.sub(r"[^0-9.\-]", "", s)
            if not clean_str or clean_str == '.': return 0.0
            return float(clean_str)
        except:
            return 0.0

    def _group_by_transaction(self, df, codigo_negocio):
        """Agrupación por CodigoTransaccion para locatarios específicos."""
        codigos_agrupacion = ['A02', 'L09', 'T06', 'IS04', 'L06', 'IS06', 'A03', 'IS07', 'L19','L20']
        if codigo_negocio not in codigos_agrupacion or 'CodigoTransaccion' not in df.columns:
            return df
        
        # Eliminar vacíos en transacción
        df_clean = df.dropna(subset=['CodigoTransaccion']).copy()
        df_clean = df_clean[~df_clean['CodigoTransaccion'].astype(str).str.strip().isin(['', '0', 'None', 'nan'])]
        if df_clean.empty: return df

        # Asegurar que Monto sea numérico antes de sumar
        df_clean['Monto'] = pd.to_numeric(df_clean['Monto'], errors='coerce').fillna(0.0)

        # Definir campos a mantener (primero del grupo) y campos a sumar
        agg_dict = {}
        if 'Monto' in df_clean.columns: agg_dict['Monto'] = 'sum'
        
        # Campos que se mantienen (first)
        campos_mantener = ['Fecha', 'Hora', 'FechaHora', 'FechaCarga', 'CodigoNegocio', 
                           'CodigoUbicacion', 'EstadoNegocio', 'TipoNegocio', 'Area', 'FormaPago', 'Estado']
        
        for col in campos_mantener:
            if col in df_clean.columns:
                agg_dict[col] = 'first'
        
        # Otros campos descriptivos que no están en la lista anterior ni son CodigoTransaccion ni Monto ni Producto ni Cantidad
        for col in df_clean.columns:
            if col not in ['CodigoTransaccion', 'Monto', 'Producto', 'Cantidad'] and col not in agg_dict:
                agg_dict[col] = 'first'
        
        grouped = df_clean.groupby('CodigoTransaccion').agg(agg_dict).reset_index()
        
        # Manejo especial de Producto (concatenar únicos)
        if 'Producto' in df_clean.columns:
            grouped['Producto'] = df_clean.groupby('CodigoTransaccion')['Producto'].apply(lambda x: ', '.join(map(str, x.dropna().unique()))).values
        
        # Forzar cantidad a 1 por transacción agrupada
        grouped['Cantidad'] = 1
        
        return grouped


    def _create_default_records(self, codigo_negocio, codigo_ubicacion, estado_negocio, tipo_negocio, area, column_names):
        """Crea registros por defecto para toda la semana pasada (Lunes a Domingo)."""
        now = datetime.now()
        days_since_monday = now.weekday()
        monday_last_week = (now - timedelta(days=days_since_monday)) - timedelta(days=7)
        
        default_records = []
        for i in range(7):
            date = (monday_last_week + timedelta(days=i)).date()
            record = {col: '' for col in column_names}
            fh = f"{date.strftime('%Y-%m-%d')} 06:00:00"
            record.update({
                'Fecha': date,
                'Hora': "06:00:00",
                'FechaHora': fh,
                'Monto': 0.0,
                'Producto': '-',
                'Cliente': 'Sistema',
                'Cantidad': 0,
                'CodigoTransaccion': f'DEFAULT_{date.strftime("%Y%m%d")}_{now.strftime("%H%M%S")}',
                'CodigoNegocio': codigo_negocio,
                'CodigoUbicacion': codigo_ubicacion,
                'FechaCarga': now.strftime("%Y-%m-%d"),
                'Estado': 0,
                'FormaPago': '-',
                'EstadoNegocio': estado_negocio if pd.notna(estado_negocio) else "INACTIVO",
                'TipoNegocio': tipo_negocio if pd.notna(tipo_negocio) else '',
                'Area': area if pd.notna(area) else ''
            })
            default_records.append(record)
        return pd.DataFrame(default_records)

    # ... (métodos existentes de conversión y archivos) ...

    def _resolve_filestore_path_for_ventas(self, ruta_archivo: str) -> str | None:
        """Resuelve ruta local: loc/archivo, loc/_consolidados/archivo, o nombre único en cierre_caja."""
        from app.services.file_store_service import resolve_cierre_caja_path, iter_cierre_caja_archivos_procesamiento, get_upload_base
        from app.core.constants import FILE_STORE_CIERRE_CAJA, FILE_STORE_SUB_CONSOLIDADOS

        r = str(ruta_archivo).strip()
        if "/" in r:
            segs = r.split("/")
            if len(segs) == 3 and segs[1] in (FILE_STORE_SUB_CONSOLIDADOS, "_consolidados"):
                p = get_upload_base() / FILE_STORE_CIERRE_CAJA / segs[0] / FILE_STORE_SUB_CONSOLIDADOS / segs[2]
                if p.is_file():
                    return str(p)
            loc, fname = segs[0], "/".join(segs[1:])
            p = resolve_cierre_caja_path(loc, fname.strip())
            if p and p.is_file():
                return str(p)
            return None
        base_name = os.path.basename(r)
        matches = []
        for _loc, name, path in iter_cierre_caja_archivos_procesamiento():
            if name == base_name:
                matches.append(path)
        if len(matches) == 1:
            return str(matches[0])
        return None

    def _resolve_codigo_negocio_basecarga(self, codigo_negocio: Any, base_carga_df: pd.DataFrame) -> Any:
        """Alinea código de Activas (ej. A03) con fila de BaseCarga (ej. A03_BARRIO_MANCORA)."""
        if base_carga_df is None or base_carga_df.empty or "CodigoNegocio" not in base_carga_df.columns:
            return codigo_negocio
        codigos = base_carga_df["CodigoNegocio"].dropna().astype(str).str.strip().unique().tolist()
        c_str = str(codigo_negocio).strip() if pd.notna(codigo_negocio) else ""
        if not c_str:
            return codigo_negocio
        if c_str in codigos:
            return codigo_negocio
        prefix = c_str.split("_", 1)[0] if "_" in c_str else c_str
        for cand in codigos:
            if cand == c_str or cand.endswith(c_str) or c_str.endswith(cand):
                logger.info("BaseCarga: usando CodigoNegocio %s (Activas tenía %s)", cand, codigo_negocio)
                return cand
        for cand in codigos:
            cp = cand.split("_", 1)[0] if "_" in cand else cand
            if cp == prefix:
                logger.info("BaseCarga: usando CodigoNegocio %s por prefijo (Activas %s)", cand, codigo_negocio)
                return cand
        logger.warning("BaseCarga: sin coincidencia para CodigoNegocio=%s; extracción puede fallar", codigo_negocio)
        return codigo_negocio

    @staticmethod
    def _ruta_archivo_es_consolidado_filestore(ruta_archivo: str) -> bool:
        r = str(ruta_archivo or "").replace("\\", "/")
        return f"/{FILE_STORE_SUB_CONSOLIDADOS}/" in r or "/_consolidados/" in r.lower()

    def _codigo_negocio_para_carpeta_loc(self, hoja_negocios: pd.DataFrame, loc: str) -> Any:
        """Mapea carpeta FileStore (ej. A03_BARRIO_MANCORA) a CodigoNegocio en hoja Negocios."""
        if hoja_negocios is None or hoja_negocios.empty or "CodigoNegocio" not in hoja_negocios.columns:
            return None
        loc_s = str(loc).strip()
        codes = hoja_negocios["CodigoNegocio"].dropna().astype(str).str.strip()
        exact = hoja_negocios.loc[codes == loc_s]
        if not exact.empty:
            return exact.iloc[0]["CodigoNegocio"]
        pref = get_locatario_code_from_full(loc_s)
        by_pref = hoja_negocios.loc[codes == pref]
        if not by_pref.empty:
            return by_pref.iloc[0]["CodigoNegocio"]
        for _, row in hoja_negocios.iterrows():
            cn = str(row.get("CodigoNegocio", "")).strip()
            if cn and (loc_s == cn or loc_s.startswith(cn + "_")):
                return row["CodigoNegocio"]
        return None

    def _infer_loc_zona_from_filestore_path(self, file_path: str) -> Tuple[str, str] | None:
        """Devuelve (locatario, 'pendiente'|'consolidado') desde ruta absoluta bajo cierre_caja."""
        from app.core.constants import FILE_STORE_CIERRE_CAJA, FILE_STORE_SUB_CONSOLIDADOS

        try:
            p = Path(file_path).resolve()
            parts = p.parts
        except OSError:
            return None
        for i, seg in enumerate(parts):
            if seg != FILE_STORE_CIERRE_CAJA or i + 2 >= len(parts):
                continue
            loc = parts[i + 1]
            if parts[i + 2] == FILE_STORE_SUB_CONSOLIDADOS and i + 3 < len(parts):
                return loc, "consolidado"
            return loc, "pendiente"
        return None

    async def list_cierre_caja_files(self) -> Dict[str, Any]:
        """Lista archivos en FileStore (cierre_caja): pendientes y consolidados por locatario."""
        try:
            from app.services.file_store_service import list_cierre_caja_por_locatario

            formatted_files = []
            for row in list_cierre_caja_por_locatario():
                loc = row["locatario"]
                for name in row.get("pendientes") or []:
                    from app.services.file_store_service import get_upload_base
                    from app.core.constants import FILE_STORE_CIERRE_CAJA

                    p = get_upload_base() / FILE_STORE_CIERRE_CAJA / loc / name
                    st = p.stat() if p.is_file() else None
                    formatted_files.append({
                        "name": f"{loc}/{name}",
                        "size": int(st.st_size) if st else 0,
                        "modified": datetime.fromtimestamp(st.st_mtime).isoformat() if st else "",
                        "zona": "pendiente",
                    })
                cons_dir_name = "_consolidados"
                for name in row.get("consolidados") or []:
                    from app.services.file_store_service import get_upload_base
                    from app.core.constants import FILE_STORE_CIERRE_CAJA, FILE_STORE_SUB_CONSOLIDADOS

                    p = get_upload_base() / FILE_STORE_CIERRE_CAJA / loc / FILE_STORE_SUB_CONSOLIDADOS / name
                    st = p.stat() if p.is_file() else None
                    formatted_files.append({
                        "name": f"{loc}/{cons_dir_name}/{name}",
                        "size": int(st.st_size) if st else 0,
                        "modified": datetime.fromtimestamp(st.st_mtime).isoformat() if st else "",
                        "zona": "consolidado",
                    })
            return {"success": True, "files": formatted_files}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def save_upload_file(self, filename: str, content: bytes, locatario_codigo: str | None = None) -> Dict[str, Any]:
        """Guarda en FileStore (cierre_caja). Requiere locatario_codigo en la petición."""
        try:
            from app.services.file_store_service import save_file
            from app.core.constants import CODIGOS_LOCATARIOS_VALIDOS

            loc = (locatario_codigo or "").strip()
            if not loc:
                return {"success": False, "error": "Indique locatario_codigo para subir al FileStore"}
            if loc not in CODIGOS_LOCATARIOS_VALIDOS:
                return {"success": False, "error": f"Locatario no válido: {loc}"}
            rel = save_file(loc, filename, content, add_hash=True, replace=False)
            return {"success": True, "message": f"Archivo guardado en FileStore: {rel}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==========================================
    # PASO 1: CONVERTIR XLSX A CSV
    # ==========================================
    async def convertir_xlsx_to_csv(self) -> Dict[str, Any]:
        """
        Convierte .xlsx a CSV (;) solo en pendientes de FileStore (cierre_caja/{loc}/), elimina el xlsx.
        """
        from app.services.file_store_service import iter_cierre_caja_archivos_procesamiento

        results = []
        try:
            count_ok = 0
            for loc, name, path in iter_cierre_caja_archivos_procesamiento(solo_pendientes=True):
                if not name.lower().endswith(".xlsx"):
                    continue
                try:
                    csv_name = name.rsplit(".", 1)[0] + ".csv"
                    csv_path = path.parent / csv_name
                    df = pd.read_excel(path)
                    df.to_csv(csv_path, index=False, sep=";")
                    path.unlink()
                    results.append(f"Convertido: {loc}/{name} -> {csv_name}")
                    count_ok += 1
                except Exception as e:
                    results.append(f"Error {loc}/{name}: {str(e)}")

            return {"success": True, "details": results, "count": count_ok}
        except Exception as e:
            logger.error(f"Error en convertir_xlsx_to_csv: {str(e)}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # PASO 2: ASOCIAR NEGOCIOS
    # ==========================================

    async def obtener_negocios_lista(self) -> Dict[str, Any]:
        """Retorna la lista de negocios para el selector manual."""
        try:
            df = self._read_config_sheet("Negocios")
            negocios = df[["CodigoNegocio", "Descripcion"]].dropna().to_dict(orient="records")
            return {"success": True, "negocios": negocios}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def guardar_asociacion_manual(self, archivo: str, codigo_negocio: str, fecha_inicio: str, fecha_fin: str) -> Dict[str, Any]:
        """Guarda manualmente una asociación en la hoja Activas."""
        try:
            self._ensure_config_write_workbook()
            try:
                df_activas = self._read_config_sheet("Activas", operational=True)
            except:
                df_activas = pd.DataFrame(columns=["CodigoNegocio", "RutaArchivo", "Cargar", "Añadir", "FechaInicio", "FechaFin"])

            nueva_fila = {
                "CodigoNegocio": codigo_negocio,
                "RutaArchivo": archivo,
                "Cargar": 1,
                "Añadir": 0,
                "FechaInicio": fecha_inicio,
                "FechaFin": fecha_fin
            }
            
            # Evitar duplicados por archivo
            df_activas = df_activas[df_activas["RutaArchivo"] != archivo]
            df_activas = pd.concat([df_activas, pd.DataFrame([nueva_fila])], ignore_index=True)

            with pd.ExcelWriter(self.config_write_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df_activas.to_excel(writer, sheet_name="Activas", index=False)

            self._upload_config()
            return {"success": True, "message": f"Asociación guardada para {archivo}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def asociar_negocios_automatico(
        self,
        modo_rango: str = "ultima_semana",
        fecha_inicio: str | None = None,
        fecha_fin: str | None = None,
    ) -> Dict[str, Any]:
        """
        Asocia archivos FileStore → Activas.
        Por locatario: si hay archivos en _consolidados, solo el más reciente (mtime) y ruta explícita
        {loc}/_consolidados/{nombre}. Si no, una fila por pendiente con fuzzy nombre ↔ Descripcion.
        """
        from app.services.file_store_service import iter_cierre_caja_archivos_procesamiento, rango_desde_modo

        try:
            self._ensure_config_write_workbook()
            hoja_negocios = self._read_config_sheet("Negocios")
            tiendas = hoja_negocios["Descripcion"].dropna().unique().tolist()

            by_loc: Dict[str, Dict[str, list]] = {}
            for loc, name, path in iter_cierre_caja_archivos_procesamiento():
                low = name.lower()
                if not (low.endswith(".csv") or low.endswith(".xlsx")):
                    continue
                if loc not in by_loc:
                    by_loc[loc] = {"pend": [], "cons": []}
                parts_lower = [p.lower() for p in path.parts]
                if FILE_STORE_SUB_CONSOLIDADOS in path.parts or "_consolidados" in parts_lower:
                    by_loc[loc]["cons"].append((name, path))
                else:
                    by_loc[loc]["pend"].append((name, path))

            asociaciones: list[dict] = []
            activas_rows: list[dict] = []
            d0, d1, _ = rango_desde_modo(modo_rango, fecha_inicio, fecha_fin)
            d0s, d1s = d0.strftime("%Y-%m-%d"), d1.strftime("%Y-%m-%d")

            def _codigo_por_tienda(tienda: str):
                try:
                    return hoja_negocios.loc[hoja_negocios["Descripcion"] == tienda, "CodigoNegocio"].values[0]
                except Exception:
                    return None

            for loc, buckets in sorted(by_loc.items()):
                con_list = buckets.get("cons") or []
                pend_list = buckets.get("pend") or []

                if con_list:
                    name, path = max(con_list, key=lambda x: x[1].stat().st_mtime)
                    ruta_completa = f"{loc}/{FILE_STORE_SUB_CONSOLIDADOS}/{name}"
                    codigo_negocio = self._codigo_negocio_para_carpeta_loc(hoja_negocios, loc)
                    tienda_guess = None
                    if codigo_negocio is not None:
                        try:
                            m = hoja_negocios.loc[hoja_negocios["CodigoNegocio"] == codigo_negocio, "Descripcion"]
                            if not m.empty:
                                tienda_guess = m.iloc[0]
                        except Exception:
                            pass
                    if codigo_negocio is None:
                        mejor_t = None
                        mejor_p = 0
                        for tienda in tiendas:
                            p = fuzz.partial_ratio(tienda.lower(), name.lower())
                            if p > 80 and p > mejor_p:
                                mejor_p = p
                                mejor_t = tienda
                        if mejor_t:
                            codigo_negocio = _codigo_por_tienda(mejor_t)
                            tienda_guess = mejor_t
                    if codigo_negocio is None:
                        logger.warning("Asociar: sin CodigoNegocio para consolidado %s, se omite.", ruta_completa)
                        continue
                    asociaciones.append({
                        "Archivo": ruta_completa,
                        "Tienda": tienda_guess or "",
                        "Origen": "consolidado",
                    })
                    activas_rows.append({
                        "CodigoNegocio": codigo_negocio,
                        "RutaArchivo": ruta_completa,
                        "Cargar": 1,
                        "Añadir": 0,
                        "FechaInicio": d0s,
                        "FechaFin": d1s,
                    })
                    continue

                for name, _path in sorted(pend_list, key=lambda x: x[0]):
                    mejor_tienda = None
                    mejor_puntaje = 0
                    for tienda in tiendas:
                        puntaje = fuzz.partial_ratio(tienda.lower(), name.lower())
                        if puntaje > 80 and puntaje > mejor_puntaje:
                            mejor_tienda = tienda
                            mejor_puntaje = puntaje
                    if not mejor_tienda:
                        continue
                    ruta_completa = f"{loc}/{name}"
                    codigo_negocio = _codigo_por_tienda(mejor_tienda)
                    asociaciones.append({
                        "Archivo": ruta_completa,
                        "Tienda": mejor_tienda,
                        "Puntaje": mejor_puntaje,
                        "Origen": "pendiente",
                    })
                    activas_rows.append({
                        "CodigoNegocio": codigo_negocio,
                        "RutaArchivo": ruta_completa,
                        "Cargar": 1,
                        "Añadir": 0,
                        "FechaInicio": d0s,
                        "FechaFin": d1s,
                    })

            df_asoc = pd.DataFrame(asociaciones)
            if df_asoc.empty:
                return {"success": True, "message": "No se encontraron nuevas asociaciones automáticas", "count": 0}

            df_activas = pd.DataFrame(activas_rows)

            with pd.ExcelWriter(self.config_write_path, engine="openpyxl", mode="a", if_sheet_exists="replace") as writer:
                df_asoc.to_excel(writer, sheet_name="Asociaciones", index=False)
                df_activas.to_excel(writer, sheet_name="Activas", index=False)

            self._upload_config()
            return {"success": True, "count": len(asociaciones), "details": asociaciones}
        except Exception as e:
            logger.error(f"Error en asociar_negocios: {str(e)}")
            return {"success": False, "error": str(e)}

    def _normalizar_df_ventas_legacy(
        self,
        processed_df: pd.DataFrame,
        codigo_negocio: Any,
        codigo_ubicacion: str,
        estado_negocio: str,
        tipo_negocio: str,
        area: Any,
        *,
        ruta_log: str = "",
    ) -> pd.DataFrame | None:
        """
        Normaliza un DataFrame ya alineado a columnas de venta (Fecha, Monto, …),
        tanto si vino de extracción por BaseCarga como de CSV consolidado.
        """
        if processed_df is None or processed_df.empty:
            return None
        if "Monto" not in processed_df.columns or "Fecha" not in processed_df.columns:
            logger.warning(
                "Ventas: faltan columnas Fecha/Monto en %s (¿layout distinto al consolidado/BaseCarga?)",
                ruta_log or "df",
            )
            return None

        def force_numeric_safe(val):
            if pd.isna(val):
                return 0.0
            try:
                clean_str = str(val).strip().replace("S/", "").replace(",", ".").replace(" ", "")
                clean_str = re.sub(r"[^0-9.]", "", clean_str)
                if not clean_str or clean_str == ".":
                    return 0.0
                num_val = float(clean_str)
                if num_val > 50000:
                    logger.warning(
                        "⚠️ Monto detectado como irreal (%s). Posible ID capturado como Monto. Seteando a 0.",
                        num_val,
                    )
                    return 0.0
                return round(num_val, 4)
            except Exception:
                return 0.0

        if "Monto" in processed_df.columns:
            processed_df = processed_df.copy()
            processed_df["Monto"] = processed_df["Monto"].apply(force_numeric_safe)

        processed_df = self._group_by_transaction(processed_df, codigo_negocio)

        processed_df = processed_df.loc[:, ~processed_df.columns.str.contains("^Unnamed")]
        if processed_df.empty:
            return None
        if "Fecha" in processed_df.columns and "Monto" in processed_df.columns:
            processed_df = processed_df.dropna(subset=["Fecha", "Monto"], how="all")
        if processed_df.empty:
            logger.warning("Sin filas con Fecha/Monto tras limpieza inicial: %s", ruta_log)
            return None

        def get_h(val):
            s = str(val).split(" ")
            return s[1] if len(s) > 1 else None

        def get_f(val):
            return str(val).split(" ")[0] if val else None

        if "Hora" not in processed_df.columns or processed_df["Hora"].isna().all():
            processed_df["Hora"] = processed_df["Fecha"].apply(get_h)
            processed_df["Fecha"] = processed_df["Fecha"].apply(get_f)
        else:
            mask_h_null = processed_df["Hora"].isna() | (processed_df["Hora"] == "")
            if mask_h_null.any():
                processed_df.loc[mask_h_null, "Hora"] = processed_df.loc[mask_h_null, "Fecha"].apply(get_h)
                processed_df.loc[mask_h_null, "Fecha"] = processed_df.loc[mask_h_null, "Fecha"].apply(get_f)

        if "Hora" in processed_df.columns:
            processed_df["Hora"] = (
                processed_df["Hora"].astype(str).str.strip().replace(["nan", "None", "NaT"], "06:00:00")
            )
            processed_df["Hora"] = processed_df["Hora"].apply(lambda x: x if ":" in x else "06:00:00")

        def clean_currency(value):
            if value is None or (isinstance(value, float) and np.isnan(value)):
                return 0.0
            if isinstance(value, (int, float)):
                return round(float(value), 4)
            clean_str = str(value).strip().replace("S/", "").replace(",", ".").replace(" ", "")
            try:
                clean_str = re.sub(r"[^0-9.\-]", "", clean_str)
                if not clean_str or clean_str == ".":
                    return 0.0
                num_val = float(clean_str)
                if num_val > 50000:
                    return 0.0
                return round(num_val, 4)
            except Exception:
                return 0.0

        processed_df["Monto"] = processed_df["Monto"].apply(clean_currency)
        processed_df["Fecha"] = pd.to_datetime(processed_df["Fecha"], errors="coerce")

        processed_df = self._group_by_transaction(processed_df, codigo_negocio)

        processed_df = processed_df[(processed_df["Monto"] > 0) & (processed_df["Fecha"].notna())]
        if processed_df.empty:
            return None

        processed_df = processed_df.copy()
        processed_df["CodigoNegocio"] = codigo_negocio
        processed_df["FechaCarga"] = datetime.now().strftime("%Y-%m-%d")
        processed_df["Estado"] = 0.0
        processed_df["CodigoUbicacion"] = codigo_ubicacion
        processed_df["EstadoNegocio"] = estado_negocio
        processed_df["TipoNegocio"] = tipo_negocio
        processed_df["Area"] = area

        if "Cantidad" in processed_df.columns:
            processed_df["Cantidad"] = pd.to_numeric(processed_df["Cantidad"], errors="coerce").fillna(1).astype(int)
        else:
            processed_df["Cantidad"] = 1
        if "Cantidad" in processed_df.columns:
            processed_df["Cantidad"] = processed_df["Cantidad"].replace(0, 1)

        if "CodigoTransaccion" in processed_df.columns:
            processed_df["CodigoTransaccion"] = processed_df["CodigoTransaccion"].fillna("-").replace("", "-")
        else:
            processed_df["CodigoTransaccion"] = "-"

        if "Cliente" in processed_df.columns:
            processed_df["Cliente"] = processed_df["Cliente"].fillna("-").replace("", "-")
        else:
            processed_df["Cliente"] = "-"

        if "Producto" in processed_df.columns:
            processed_df["Producto"] = processed_df["Producto"].fillna("-").replace("", "-")
        else:
            processed_df["Producto"] = "-"

        if "FormaPago" in processed_df.columns:
            processed_df["FormaPago"] = processed_df["FormaPago"].fillna("-").replace("", "-")
        else:
            processed_df["FormaPago"] = "-"

        h_str = processed_df["Hora"].fillna("06:00:00").astype(str).str.strip()
        h_str = h_str.replace({"nan": "06:00:00", "None": "06:00:00", "NaT": "06:00:00", "": "06:00:00"})
        fd = pd.to_datetime(processed_df["Fecha"], errors="coerce")
        processed_df["FechaHora"] = fd.dt.strftime("%Y-%m-%d") + " " + h_str

        return processed_df

    # ==========================================
    # PASO 3: CARGAR VENTAS (PROCESAR ACTIVAS)
    # ==========================================
    async def cargar_ventas_legacy(
        self,
        clear_data: bool = False,
        archivar_pendientes_tras_consolidado: bool = False,
    ) -> Dict[str, Any]:
        """
        Replica la lógica de CargaVentas_csvOfi.py:
        1. Limpia sales_df y Realizadas si clear_data es True.
        2. Procesa la hoja 'Activas': CSV/XLSX en ruta .../_consolidados/... se leen como tabla
           (salida de consolidar_desde_filestore); el resto usa BaseCarga + coordenadas.
        3. Append en 'sales_df', actualiza 'Realizadas', limpia Activas.
        4. Mueve archivos a Drive procesados o FileStore uploads/procesados/...
        5. Opcional (archivar_pendientes_tras_consolidado): tras mover un consolidado FileStore,
           mueve también todos los .csv/.xlsx pendientes de ese locatario (riesgo si hay datos de otra semana).
        """
        try:
            wb_path = self._ensure_config_write_workbook()

            if clear_data:
                self._clear_sales_data()

            config_activas_df = self._read_config_sheet("Activas", operational=True)
            base_carga_df = self._read_base_carga_df()

            try:
                wb_data = openpyxl.load_workbook(str(wb_path), data_only=True)
                ws_neg = wb_data["Negocios"]
                neg_list = []
                # Capturar cabeceras dinámicamente
                headers = [str(cell.value).strip() for cell in ws_neg[1] if cell.value]
                for row in ws_neg.iter_rows(min_row=2, values_only=True):
                    if any(row):
                        neg_list.append(dict(zip(headers, row)))
                negocios_df = pd.DataFrame(neg_list)
                wb_data.close()
                logger.info("🎯 Estado de Negocios capturado exitosamente como Valor Plano.")
            except Exception as e_flat:
                logger.error(f"Error capturando valores planos de formulas: {e_flat}")
                negocios_df = self._read_config_sheet("Negocios", operational=True)

            try:
                Realizadas_df = self._read_config_sheet("Realizadas", operational=True)
            except Exception:
                Realizadas_df = pd.DataFrame()

            processed_dataframes = []
            pendientes_extra_movidos: list[str] = []
            column_names = [col for col in base_carga_df.columns if col != 'CodigoNegocio']
            
            # Carpeta de destino con formato específico: YYYY-MM-DD_cloud
            # Obtener archivos de Drive (map filename -> file_id)
            drive_files = self.gdrive.list_files_in_folder(self.drive_id_ventas)
            drive_files_dict = {f.get('name'): f.get('id') for f in drive_files if f.get('name')}

            # 2. Iterar sobre Activas
            for _, config_row in config_activas_df.iterrows():
                codigo_negocio = config_row['CodigoNegocio']
                codigo_basecarga = self._resolve_codigo_negocio_basecarga(codigo_negocio, base_carga_df)
                ruta_archivo = config_row['RutaArchivo']
                cargar = config_row['Cargar']
                # Aceptamos tanto CSV como XLSX para procesar (Cargar puede venir como "1" desde Excel)
                ext = str(ruta_archivo).lower()
                if not _activar_cargar(cargar) or not (ext.endswith('.csv') or ext.endswith('.xlsx')):
                    continue

                # Extraer info del negocio (coincidencia por código de Activas o por código alineado a BaseCarga)
                try:
                    neg_info = None
                    for cn_try in (codigo_negocio, codigo_basecarga):
                        if cn_try is None or (isinstance(cn_try, float) and np.isnan(cn_try)):
                            continue
                        sub = negocios_df[negocios_df['CodigoNegocio'] == cn_try]
                        if not sub.empty:
                            neg_info = sub.iloc[0]
                            break
                    if neg_info is None:
                        raise KeyError("sin fila en Negocios")
                    codigo_ubicacion = neg_info.get('CodigoUbicacion', '')
                    
                    # Lógica de EstadoNegocio (Fórmula: =SI(K2>=HOY();"ACTIVO";"INACTIVO"))
                    # Primero intentamos el valor capturado por openpyxl (data_only=True)
                    estado_raw = neg_info.get('Estado')
                    
                    # Si el valor está vacío o es la fórmula, calculamos programáticamente según FechaCierre (Columna K)
                    if pd.isna(estado_raw) or estado_raw == "" or str(estado_raw).startswith('='):
                        try:
                            # Según tu observación, la fórmula usa la columna FechaCierre
                            fecha_cierre = neg_info.get('FechaCierre')
                            if pd.notna(fecha_cierre):
                                if pd.to_datetime(fecha_cierre).date() >= datetime.now().date():
                                    estado_negocio = "ACTIVO"
                                else:
                                    estado_negocio = "INACTIVO"
                            else:
                                estado_negocio = "ACTIVO"
                        except:
                            estado_negocio = "ACTIVO"
                    else:
                        estado_negocio = str(estado_raw).strip().upper()
                    
                    tipo_negocio = neg_info.get('TipoNegocio', '')
                    area = neg_info.get('Area', '')
                except:
                    codigo_ubicacion, estado_negocio, tipo_negocio, area = '', 'ACTIVO', '', ''

                ruta_str = str(ruta_archivo)
                file_id = drive_files_dict.get(ruta_str) or drive_files_dict.get(os.path.basename(ruta_str))
                file_path = None
                if file_id:
                    file_path = os.path.join(self.temp_dir, os.path.basename(ruta_str))
                    self.gdrive.download_file(file_id, file_path)
                else:
                    file_path = self._resolve_filestore_path_for_ventas(ruta_str)
                    if file_path and not os.path.isfile(file_path):
                        file_path = None

                if not file_path or not os.path.isfile(file_path):
                    logger.warning(
                        f"Archivo no encontrado (Drive/FileStore): {ruta_archivo}. Intentando crear registros por defecto..."
                    )
                    processed_df = self._create_default_records(codigo_negocio, codigo_ubicacion, estado_negocio, tipo_negocio, area, column_names)
                    processed_dataframes.append(processed_df)
                    continue
                
                if str(ruta_archivo).lower().endswith('.xlsx'):
                    sheet = pd.read_excel(file_path)
                else:
                    try:
                        with open(file_path, 'rb') as f:
                            encoding = chardet.detect(f.read())['encoding'] or 'latin-1'
                        sheet = pd.read_csv(file_path, sep=None, engine='python', encoding=encoding)
                    except:
                        # Fallback para CSV si la detección automática falla
                        sheet = pd.read_csv(file_path, delimiter=";", encoding='latin-1')

                if sheet.empty:
                    continue

                es_consolidado_fs = (
                    not file_id
                    and self._ruta_archivo_es_consolidado_filestore(ruta_str)
                    and (ext.endswith(".csv") or ext.endswith(".xlsx"))
                )

                if es_consolidado_fs:
                    # CSV/XLSX ya normalizado por consolidar_desde_filestore (cabeceras Fecha, Monto, …)
                    processed_df = sheet.copy()
                    processed_df.columns = [str(c).strip() for c in processed_df.columns]
                    logger.info("Ventas: lectura plana (consolidado FileStore): %s", ruta_archivo)
                else:
                    data = {col: [] for col in column_names}
                    max_length = 0
                    for col in column_names:
                        try:
                            cell_address = base_carga_df.loc[
                                base_carga_df["CodigoNegocio"] == codigo_basecarga, col
                            ].values[0]
                            if pd.notna(cell_address):
                                r_idx, c_idx = self._excel_cell_to_csv_indices(str(cell_address))
                                col_vals = sheet.iloc[r_idx:, c_idx].tolist()
                                data[col] = col_vals
                                max_length = max(max_length, len(col_vals))
                        except Exception:
                            data[col] = []

                    for col in column_names:
                        if len(data[col]) < max_length:
                            data[col].extend([None] * (max_length - len(data[col])))

                    processed_df = pd.DataFrame(data)

                processed_df = self._normalizar_df_ventas_legacy(
                    processed_df,
                    codigo_negocio,
                    codigo_ubicacion,
                    estado_negocio,
                    tipo_negocio,
                    area,
                    ruta_log=str(ruta_archivo),
                )
                if processed_df is None:
                    continue

                processed_dataframes.append(processed_df)

                # Archivo en Drive vs FileStore
                try:
                    if file_id:
                        current_date_str = datetime.now().strftime("%Y-%m-%d")
                        folder_name = f"{current_date_str}_cloud"
                        procesados_folder_id = self.gdrive.get_or_create_folder(folder_name, self.drive_id_procesados)
                        if procesados_folder_id:
                            self.gdrive.move_file(file_id, self.drive_id_ventas, procesados_folder_id)
                        if os.path.exists(file_path):
                            os.remove(file_path)
                    else:
                        from app.services.file_store_service import (
                            list_pendientes_locatario,
                            move_to_procesados,
                        )

                        inferred = self._infer_loc_zona_from_filestore_path(file_path)
                        if inferred:
                            loc_mv, zona_mv = inferred
                            move_to_procesados(loc_mv, [os.path.basename(file_path)], zona=zona_mv)
                            if (
                                archivar_pendientes_tras_consolidado
                                and es_consolidado_fs
                                and zona_mv == "consolidado"
                            ):
                                pend_names = list_pendientes_locatario(loc_mv)
                                if pend_names:
                                    extra = move_to_procesados(loc_mv, pend_names, zona="pendiente")
                                    pendientes_extra_movidos.extend(extra)
                                    logger.info(
                                        "Ventas: archivados %s pendiente(s) tras consolidado (loc=%s)",
                                        len(extra),
                                        loc_mv,
                                    )
                        else:
                            logger.warning(
                                "No se pudo inferir locatario/zona para mover a procesados; el archivo no se elimina: %s",
                                file_path,
                            )
                except Exception as ex:
                    logger.error("Error archivando archivo procesado: %s", ex)

            # 5. Consolidar y Guardar (Append)
            if processed_dataframes:
                final_df = pd.concat(processed_dataframes, ignore_index=True)

                # Actualizar hojas en Excel
                self._update_excel_with_sales(final_df, config_activas_df, Realizadas_df)
                self._upload_config()

                msg = f"Se escribieron {len(final_df)} filas en sales_df (ConfiguracionWeb.xlsx)."
                if pendientes_extra_movidos:
                    msg += f" Archivados además {len(pendientes_extra_movidos)} archivo(s) pendiente(s) en FileStore."
                out: Dict[str, Any] = {
                    "success": True,
                    "registros": int(len(final_df)),
                    "negocios": len(processed_dataframes),
                    "message": msg,
                    "pendientes_archivados": len(pendientes_extra_movidos),
                }
                if pendientes_extra_movidos:
                    out["pendientes_archivados_rutas"] = pendientes_extra_movidos
                return out
            else:
                return {
                    "success": True,
                    "registros": 0,
                    "negocios": 0,
                    "pendientes_archivados": 0,
                    "message": "No se procesaron filas: revise Activas (Cargar=1), rutas en FileStore y BaseCarga por locatario.",
                }

        except Exception as e:
            logger.error(f"Error en cargar_ventas_legacy: {str(e)}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # PASO 4: CARGAR BIGQUERY & PREDICCIÓN
    # ==========================================
    async def cargar_bigquery_legacy(self) -> Dict[str, Any]:
        """
        Sincroniza BigQuery basándose EXCLUSIVAMENTE en la hoja 'sales_df' del Excel.
        """
        try:
            creds = service_account.Credentials.from_service_account_file(self.bq_creds_path)
            client = bigquery.Client(credentials=creds, project=self.bq_project_id)

            logger.info("🚀 Leyendo hoja 'sales_df' de ConfiguracionWeb.xlsx para carga a BigQuery.")

            # 1. CARGAR DESDE EXCEL (Fuente de verdad según lógica original)
            df_sales_excel = self._read_config_sheet("sales_df", from_web=True)
            filas_excel = int(len(df_sales_excel))

            # 2. Preprocesar para evitar errores de tipos en BQ
            df_sales_clean = self._preprocess_bq_sales(df_sales_excel)
            filas_tras_preprocess = int(len(df_sales_clean))
            if filas_tras_preprocess < filas_excel:
                logger.warning(
                    "BQ: sales_df %s filas en Excel → %s tras preprocess (descartadas por Monto/Fecha inválidos)",
                    filas_excel,
                    filas_tras_preprocess,
                )

            if df_sales_clean.empty:
                return {
                    "success": True,
                    "message": "La hoja sales_df está vacía o todas las filas quedaron fuera por Monto/Fecha inválidos.",
                    "filas_leidas_excel": filas_excel,
                    "filas_tras_preprocess": 0,
                    "filas_insertadas": 0,
                }

            columnas_bq = [
                "Fecha", "Hora", "FechaHora", "CodigoTransaccion", "Producto", "Cliente",
                "CodigoNegocio", "FechaCarga", "Estado", "Monto", "Cantidad",
                "CodigoUbicacion", "FormaPago", "EstadoNegocio", "TipoNegocio", "Area"
            ]
            cols_existentes = [c for c in columnas_bq if c in df_sales_clean.columns]
            df_final_bq = df_sales_clean[cols_existentes].copy()

            table_sales_id = f"{self.bq_project_id}.{self.bq_dataset}.{self.bq_table_sales}"
            try:
                bq_table = client.get_table(table_sales_id)
            except Exception as exc:
                raise ValueError(
                    f"La tabla BigQuery no existe: {table_sales_id}. "
                    f"Cree la tabla o defina BQ_TABLE_SALES en .env (destino habitual: stg_sales_silver). "
                    f"Detalle: {exc}"
                ) from exc

            df_final_bq = self._cast_dataframe_to_bq_schema(df_final_bq, bq_table.schema)

            job_config = bigquery.LoadJobConfig(
                write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
                schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION],
            )
            load_job = client.load_table_from_dataframe(
                df_final_bq, table_sales_id, job_config=job_config
            )
            load_job.result()
            filas_bq = int(load_job.output_rows or len(df_final_bq))
            logger.info(
                "BQ: %s fila(s) añadidas a %s (Excel: %s, tras preprocess: %s)",
                filas_bq,
                table_sales_id,
                filas_excel,
                filas_tras_preprocess,
            )

            # 2. Update Negocios & Categorias (Truncate con validación de contenido)
            for sheet in ["Negocios", "Categorias"]:
                try:
                    df_temp = self._read_config_sheet(sheet)
                    df_temp = self._preprocess_bq_sales(df_temp)
                    
                    if df_temp.empty:
                        logger.warning(f"⚠️ La hoja '{sheet}' está vacía. Saltando carga para evitar error de esquema.")
                        continue

                    table_ref_id = f"{self.bq_project_id}.{self.bq_dataset}.{sheet}"
                    bq_ref_table = client.get_table(table_ref_id)
                    df_temp = self._cast_dataframe_to_bq_schema(df_temp, bq_ref_table.schema)
                    job_config = bigquery.LoadJobConfig(
                        write_disposition="WRITE_TRUNCATE",
                        autodetect=True,
                    )
                    client.load_table_from_dataframe(df_temp, table_ref_id, job_config=job_config).result()
                    logger.info(f"✅ Tabla '{sheet}' actualizada correctamente.")
                except Exception as e_sheet:
                    logger.error(f"Error procesando hoja {sheet}: {e_sheet}")
                    # No lanzamos excepción para permitir que el proceso principal continúe

            # 3. Aplicar FormaPagoModificado (Lógica original SQL)
            # await self._update_forma_pago_bq(client)
            
            # 4. Ejecutar Predicción Interna
            # pred_result = await self._run_prediction_engine(client)
            
            return {
                "success": True,
                "message": (
                    f"Sincronización BigQuery: {filas_bq} fila(s) añadidas a {self.bq_table_sales} "
                    f"(Excel: {filas_excel}, tras preprocess: {filas_tras_preprocess})."
                ),
                "bq_table": self.bq_table_sales,
                "filas_insertadas": filas_bq,
                "filas_leidas_excel": filas_excel,
                "filas_tras_preprocess": filas_tras_preprocess,
            }
        except Exception as e:
            logger.error(f"Error en cargar_bigquery_legacy: {str(e)}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # VISTA PREVIA
    # ==========================================
    async def get_sales_df_preview(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """
        Vista previa de sales_df desde el final del Excel (offset=0 = bloque más reciente).
        offset: filas a saltar hacia atrás desde el final para lazy load.
        """
        try:
            limit = max(1, min(int(limit), 500))
            offset = max(0, int(offset))

            config_path = self._resolve_config_web_workbook()
            df = self._read_config_sheet("sales_df", from_web=True)
            n = len(df)
            if n == 0:
                return {
                    "success": True,
                    "data": [],
                    "columns": df.columns.tolist(),
                    "total_rows": 0,
                    "offset": offset,
                    "next_offset": 0,
                    "has_more": False,
                    "returned_count": 0,
                    "config_source": str(config_path),
                }

            end_idx = n - offset
            if end_idx <= 0:
                return {
                    "success": True,
                    "data": [],
                    "columns": df.columns.tolist(),
                    "total_rows": n,
                    "offset": offset,
                    "next_offset": offset,
                    "has_more": False,
                    "returned_count": 0,
                    "config_source": str(config_path),
                }

            start_idx = max(0, end_idx - limit)
            preview_df = df.iloc[start_idx:end_idx].copy()
            returned = len(preview_df)
            next_offset = offset + returned
            has_more = start_idx > 0

            import datetime as dt
            preview_df = preview_df.map(lambda x: x.isoformat() if isinstance(x, (dt.date, dt.datetime)) else x)
            preview_df = preview_df.fillna("")

            return {
                "success": True,
                "data": preview_df.to_dict(orient="records"),
                "columns": preview_df.columns.tolist(),
                "total_rows": n,
                "offset": offset,
                "next_offset": next_offset,
                "has_more": has_more,
                "returned_count": returned,
                "config_source": str(config_path),
            }
        except Exception as e:
            logger.error(f"Error en preview: {e}")
            return {"success": False, "error": str(e)}

    async def get_realizadas_preview(self, limit: int = 100) -> Dict[str, Any]:
        """Obtiene una vista previa de la hoja Realizadas."""
        try:
            config_path = self._resolve_config_web_workbook()
            df = self._read_config_sheet("Realizadas", from_web=True)
            preview_df = df.tail(limit).copy()
            
            # Convertir fechas a string para JSON de forma segura
            import datetime as dt
            preview_df = preview_df.map(lambda x: x.isoformat() if isinstance(x, (dt.date, dt.datetime)) else x)
            
            # Reemplazar nulos
            preview_df = preview_df.fillna("")
            
            return {
                "success": True,
                "data": preview_df.to_dict(orient="records"),
                "columns": preview_df.columns.tolist(),
                "total_rows": len(df),
                "config_source": str(config_path),
            }
        except Exception as e:
            logger.error(f"Error en preview realizadas: {e}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # CONSOLIDACIÓN DESDE FILESTORE (por locatario → _consolidados)
    # ==========================================

    @staticmethod
    def _consolidacion_skip_legible(skip: str | None) -> str:
        if not skip:
            return ""
        return _CONSOL_SKIP_LEGIBLE.get(skip, skip.replace("_", " "))

    def _consolidacion_force_numeric(self, val) -> tuple[float, bool]:
        """Normaliza Monto; devuelve (valor, True si se descartó por tope > 50000)."""
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return 0.0, False
        try:
            clean_str = str(val).strip().replace("S/", "").replace(",", ".").replace(" ", "")
            clean_str = re.sub(r"[^0-9.]", "", clean_str)
            if not clean_str or clean_str == ".":
                return 0.0, False
            num_val = float(clean_str)
            if num_val > 50000:
                return 0.0, True
            return round(num_val, 4), False
        except Exception:
            return 0.0, False

    def _consolidacion_leer_hoja(self, file_path: Path) -> tuple[pd.DataFrame | None, str | None]:
        """Lee .xlsx, .xls o .csv (motor Excel por contenido del archivo)."""
        from app.services.file_store_service import read_report_file_dataframe

        return read_report_file_dataframe(file_path)

    def _consolidacion_filas_tabla(self, file_path: Path) -> list[tuple[Any, ...]]:
        """Filas crudas (sin encabezado pandas) para detección de layout."""
        fn = file_path.name.lower()
        rows: list[tuple[Any, ...]] = []
        try:
            if fn.endswith((".xlsx", ".xls")):
                from app.services.file_store_service import read_report_file_dataframe

                df, _ = read_report_file_dataframe(file_path)
                if df is not None and not df.empty:
                    rows.append(tuple(df.columns.astype(str)))
                    for _, r in df.head(500).iterrows():
                        rows.append(tuple(r.values))
                    return rows
            if not fn.endswith(".csv"):
                return []
            else:
                import csv

                with open(file_path, encoding="utf-8", errors="replace", newline="") as f:
                    sample = f.read(4096)
                    f.seek(0)
                    try:
                        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                    except csv.Error:
                        dialect = csv.excel
                    reader = csv.reader(f, dialect)
                    for row in reader:
                        rows.append(tuple(row))
                        if len(rows) > 500:
                            break
        except Exception:
            return []
        return rows

    def _consolidacion_mapear_columnas_estandar(self, df: pd.DataFrame) -> pd.DataFrame:
        """Renombra columnas detectadas a Fecha, Monto, Producto, CodigoTransaccion, etc."""
        rename: dict[Any, str] = {}
        for col in df.columns:
            n = str(col).strip().lower()
            if "generación" in n or "generacion" in n:
                continue
            if n in ("fecha",) or n.startswith("fecha ") or n.startswith("fecha_"):
                if "Fecha" not in rename.values():
                    rename[col] = "Fecha"
            elif "monto" in n or n in ("total", "importe", "venta"):
                if "Monto" not in rename.values():
                    rename[col] = "Monto"
            elif "producto" in n:
                if "Producto" not in rename.values():
                    rename[col] = "Producto"
            elif "transaccion" in n or n == "codigo transaccion":
                if "CodigoTransaccion" not in rename.values():
                    rename[col] = "CodigoTransaccion"
            elif "cantidad" in n:
                if "Cantidad" not in rename.values():
                    rename[col] = "Cantidad"
        if not rename:
            return df
        out = df.rename(columns=rename)
        return out.loc[:, ~out.columns.duplicated()]

    def _consolidacion_extraer_layout_fallback(
        self, file_path: Path, codigo_bc: str
    ) -> tuple[pd.DataFrame | None, str | None]:
        from app.services.notificaciones_service import _buscar_fila_encabezado_fecha

        rows = self._consolidacion_filas_tabla(file_path)
        if not rows:
            return None, "layout_fallback_vacio"
        hit = _buscar_fila_encabezado_fecha(rows)
        if hit is None:
            return None, "layout_fallback_vacio"
        h_idx, _ = hit
        header = [str(c).strip() if c is not None else "" for c in rows[h_idx]]
        data_rows = rows[h_idx + 1 :]
        if not data_rows:
            return None, "layout_fallback_vacio"
        width = len(header)
        normalized = []
        for row in data_rows:
            cells = list(row[:width]) + [None] * max(0, width - len(row))
            normalized.append(cells[:width])
        df = pd.DataFrame(normalized, columns=header)
        df = self._consolidacion_mapear_columnas_estandar(df)
        if "Fecha" not in df.columns or "Monto" not in df.columns:
            return None, "layout_sin_columnas_fecha_monto"
        if "Monto" in df.columns:
            montos_anomalos = 0
            new_montos = []
            for v in df["Monto"]:
                m, anom = self._consolidacion_force_numeric(v)
                if anom:
                    montos_anomalos += 1
                new_montos.append(m)
            df["Monto"] = new_montos
        df = self._group_by_transaction(df, codigo_bc)
        df = df[(df["Monto"] > 0) & df["Fecha"].notna()]
        if df.empty:
            return None, "layout_sin_ventas_validas"
        df["CodigoNegocio"] = codigo_bc
        return df, None

    @staticmethod
    def _parse_excel_cell_address(address: str) -> tuple[int, int]:
        """
        Convierte 'G2' / 'g2' a (fila, columna) 0-based sobre la grilla cruda del reporte.
        Excel fila 2 → índice 1 (fila 1 del archivo = encabezado típico).
        """
        addr = str(address or "").strip().upper()
        if not addr:
            raise ValueError("celda vacía")
        column_letters = "".join(filter(str.isalpha, addr))
        row_digits = "".join(filter(str.isdigit, addr))
        if not column_letters or not row_digits:
            raise ValueError(f"celda inválida: {address}")
        col_index = 0
        for char in column_letters:
            col_index = col_index * 26 + (ord(char) - ord("A") + 1)
        return int(row_digits) - 1, col_index - 1

    def _consolidacion_extraer_por_coordenadas(
        self,
        raw_rows: list[tuple[Any, ...]],
        fila_bc: pd.Series,
        column_names: list[str],
    ) -> tuple[dict[str, list[Any]], int]:
        """Lee columnas según celdas BaseCarga (p. ej. Fecha=A2, Monto=G2) en filas crudas."""
        data: dict[str, list[Any]] = {col: [] for col in column_names}
        coords_vacias = 0
        for col in column_names:
            cell_address = fila_bc.get(col)
            if pd.isna(cell_address) or not str(cell_address).strip():
                coords_vacias += 1
                data[col] = []
                continue
            try:
                r0, c0 = self._parse_excel_cell_address(str(cell_address))
            except ValueError:
                data[col] = []
                continue
            vals: list[Any] = []
            for ri in range(r0, len(raw_rows)):
                row = raw_rows[ri]
                if c0 < len(row):
                    vals.append(row[c0])
                else:
                    vals.append(None)
            data[col] = vals
        max_length = max((len(data[c]) for c in column_names), default=0)
        for col in column_names:
            if len(data[col]) < max_length:
                data[col].extend([None] * (max_length - len(data[col])))
        return data, coords_vacias

    @staticmethod
    def _consolidacion_recortar_filas_vacias(
        data: dict[str, list[Any]], key_cols: tuple[str, ...] = ("Fecha", "Monto")
    ) -> dict[str, list[Any]]:
        """Quita filas finales sin Fecha ni Monto."""
        max_len = max((len(data[c]) for c in data), default=0)
        last = max_len - 1
        while last >= 0:
            tiene_dato = False
            for col in key_cols:
                if col not in data or last >= len(data[col]):
                    continue
                v = data[col][last]
                if v is not None and str(v).strip().lower() not in ("", "nan", "none", "nat"):
                    tiene_dato = True
                    break
            if tiene_dato:
                break
            last -= 1
        trim = last + 1
        return {col: data[col][:trim] for col in data}

    @staticmethod
    def _consolidacion_fechas_coordenadas_validas(df: pd.DataFrame) -> bool:
        """False si la columna Fecha no parsea como fechas (p. ej. solo hora por celda mal ubicada)."""
        if df is None or df.empty or "Fecha" not in df.columns:
            return False
        ts = pd.to_datetime(df["Fecha"], errors="coerce", format="mixed", dayfirst=True)
        ok = int(ts.notna().sum())
        return ok >= max(1, int(len(df) * 0.3))

    def _consolidacion_aplicar_base_carga(
        self,
        file_path: Path,
        fila_bc: pd.Series,
        column_names: list[str],
        codigo_bc: str,
    ) -> tuple[pd.DataFrame | None, str | None, bool, int]:
        """
        Extrae ventas con coordenadas BaseCarga sobre la grilla cruda del reporte.
        Retorna (df, motivo_fallo, usó_layout_fallback, montos_anomalos).
        """
        raw_rows = self._consolidacion_filas_tabla(file_path)
        if not raw_rows:
            return None, "archivo_vacio", False, 0

        data, coords_vacias = self._consolidacion_extraer_por_coordenadas(
            raw_rows, fila_bc, column_names
        )
        data = self._consolidacion_recortar_filas_vacias(data)
        max_length = max((len(data[c]) for c in column_names), default=0)
        processed_df = pd.DataFrame(data)
        processed_df = processed_df.loc[:, ~processed_df.columns.str.contains("^Unnamed", na=False)]
        if processed_df.empty or max_length == 0:
            return None, "coordenadas_sin_datos", False, 0
        montos_anomalos = 0
        if "Monto" in processed_df.columns:
            new_montos = []
            for v in processed_df["Monto"]:
                m, anom = self._consolidacion_force_numeric(v)
                if anom:
                    montos_anomalos += 1
                new_montos.append(m)
            processed_df["Monto"] = new_montos
        processed_df = self._group_by_transaction(processed_df, codigo_bc)
        processed_df = processed_df[(processed_df["Monto"] > 0) & processed_df["Fecha"].notna()]
        if processed_df.empty:
            motivo = "coordenadas_sin_datos" if coords_vacias == len(column_names) else "sin_monto_ni_fecha_validos"
            return None, motivo, False, montos_anomalos
        processed_df["CodigoNegocio"] = codigo_bc
        return processed_df, None, False, montos_anomalos

    @staticmethod
    def _consolidacion_fechas_en_df(df: pd.DataFrame) -> tuple[str | None, str | None, list[str]]:
        if df is None or df.empty or "Fecha" not in df.columns:
            return None, None, []
        ts = pd.to_datetime(df["Fecha"], errors="coerce", format="mixed", dayfirst=True).dt.normalize()
        valid = ts.dropna()
        if valid.empty:
            return None, None, []
        dmin = valid.min().date().isoformat()
        dmax = valid.max().date().isoformat()
        uniq = sorted({d.isoformat() for d in valid.dt.date.unique()})
        return dmin, dmax, uniq[:20]

    def _consolidacion_procesar_un_archivo(
        self,
        file_path: Path,
        filename: str,
        fila_bc: pd.Series,
        column_names: list[str],
        codigo_bc: str,
    ) -> tuple[pd.DataFrame | None, dict[str, Any]]:
        detalle: dict[str, Any] = {
            "nombre": filename,
            "estado": "omitido",
            "motivo": "",
            "filas": 0,
            "layout_fallback": False,
            "montos_anomalos": 0,
        }
        if not file_path.is_file():
            detalle["motivo"] = "archivo_no_encontrado"
            return None, detalle

        processed_df, motivo, used_fb, montos_anom = self._consolidacion_aplicar_base_carga(
            file_path, fila_bc, column_names, codigo_bc
        )
        detalle["montos_anomalos"] = montos_anom
        if processed_df is not None and not self._consolidacion_fechas_coordenadas_validas(processed_df):
            processed_df = None
            motivo = "coordenadas_fecha_invalida"

        if processed_df is None:
            fb_df, fb_motivo = self._consolidacion_extraer_layout_fallback(file_path, codigo_bc)
            if fb_df is not None:
                processed_df = fb_df
                detalle["layout_fallback"] = True
                detalle["motivo"] = "layout_fallback_ok"
            else:
                detalle["motivo"] = fb_motivo or motivo or "coordenadas_sin_datos"
                return None, detalle

        detalle["estado"] = "ok"
        detalle["filas"] = len(processed_df)
        if detalle["motivo"] == "":
            detalle["motivo"] = "ok"
        fmin, fmax, _ = self._consolidacion_fechas_en_df(processed_df)
        if fmin:
            detalle["fecha_min"] = fmin
            detalle["fecha_max"] = fmax
        return processed_df, detalle

    async def consolidar_desde_filestore(
        self,
        modo_rango: str = "semana_actual",
        fecha_inicio: str | None = None,
        fecha_fin: str | None = None,
        *,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Por cada locatario: lee pendientes, aplica BaseCarga (o fallback por encabezado),
        filtra por Fecha en el rango y escribe _consolidados/{etiqueta}.csv.
        Incluye informe por local y por archivo; dry_run no escribe CSV.
        """
        try:
            from app.services.file_store_service import (
                get_upload_base,
                list_cierre_caja_por_locatario,
                rango_desde_modo,
                filtrar_filas_por_rango_fecha,
                _dir_locatario_consolidados,
            )
            from app.core.constants import FILE_STORE_CIERRE_CAJA

            try:
                base_carga_df = self._read_base_carga_df()
            except Exception as exc_cfg:
                return {
                    "success": False,
                    "error": (
                        f"No se pudo leer BaseCarga ({exc_cfg}). "
                        "Use backend/tools/ConfiguracionWeb.xlsx o CONFIG_WEB_EXCEL_PATH; "
                        "Drive es opcional si existe copia local."
                    ),
                }
            column_names = [c for c in base_carga_df.columns if c != "CodigoNegocio"]

            start_d, end_d, etiqueta = rango_desde_modo(modo_rango, fecha_inicio, fecha_fin)
            base = get_upload_base()
            items = list_cierre_caja_por_locatario()
            items_by_loc = {it["locatario"]: it for it in items}

            def _fila_base_carga(df: pd.DataFrame, codigo_bc: str) -> pd.Series | None:
                if df is None or df.empty or "CodigoNegocio" not in df.columns:
                    return None
                target = str(codigo_bc or "").strip().upper()
                codes = df["CodigoNegocio"].map(
                    lambda x: str(x).strip().upper() if pd.notna(x) else ""
                )
                mask = codes == target
                if not mask.any():
                    return None
                return df.loc[mask].iloc[0]

            detalle_loc: list[dict[str, Any]] = []
            total_reg = 0
            resumen = {"ok": 0, "omitidos": 0, "parciales": 0, "sin_carpeta": 0}

            def _append_locatario(entry: dict[str, Any]) -> None:
                detalle_loc.append(entry)
                estado = entry.get("estado", "omitido")
                if estado == "ok":
                    resumen["ok"] += 1
                elif estado == "parcial":
                    resumen["parciales"] += 1
                elif estado == "sin_carpeta":
                    resumen["sin_carpeta"] += 1
                else:
                    resumen["omitidos"] += 1

            def _procesar_item(codigo_negocio: str, nombre_loc: str, item: dict | None) -> None:
                nonlocal total_reg
                try:
                    _procesar_item_inner(codigo_negocio, nombre_loc, item)
                except Exception as exc:
                    logger.exception("Consolidar: error inesperado en %s", codigo_negocio)
                    _append_locatario({
                        "locatario": codigo_negocio,
                        "nombre": nombre_loc,
                        "codigo_bc": get_locatario_code_from_full(codigo_negocio),
                        "archivos": 0,
                        "archivos_ok": 0,
                        "registros": 0,
                        "estado": "omitido",
                        "skip": "error_interno",
                        "motivo": f"Error al procesar este local: {exc}",
                        "archivos_detalle": [],
                    })

            def _procesar_item_inner(codigo_negocio: str, nombre_loc: str, item: dict | None) -> None:
                nonlocal total_reg
                codigo_bc = get_locatario_code_from_full(codigo_negocio)
                base_entry: dict[str, Any] = {
                    "locatario": codigo_negocio,
                    "nombre": nombre_loc,
                    "codigo_bc": codigo_bc,
                    "archivos": 0,
                    "archivos_ok": 0,
                    "registros": 0,
                    "archivos_detalle": [],
                }

                if item is None:
                    _append_locatario({
                        **base_entry,
                        "estado": "sin_carpeta",
                        "skip": "sin_carpeta",
                        "motivo": self._consolidacion_skip_legible("sin_carpeta"),
                    })
                    return

                fila_bc = _fila_base_carga(base_carga_df, codigo_bc)
                if fila_bc is None:
                    logger.warning(
                        "BaseCarga sin fila para codigo_bc=%s (carpeta=%s), omitiendo.",
                        codigo_bc,
                        codigo_negocio,
                    )
                    _append_locatario({
                        **base_entry,
                        "estado": "omitido",
                        "skip": "sin_base_carga",
                        "motivo": self._consolidacion_skip_legible("sin_base_carga"),
                    })
                    return

                pendientes_all = list(item.get("pendientes") or [])
                consolidados_prev = list(item.get("consolidados") or [])
                filenames = list(pendientes_all)
                base_entry["archivos"] = len(filenames)

                if not filenames:
                    skip = "solo_consolidados" if consolidados_prev else "sin_pendientes"
                    _append_locatario({
                        **base_entry,
                        "estado": "omitido",
                        "skip": skip,
                        "motivo": self._consolidacion_skip_legible(skip),
                        "consolidados_previos": consolidados_prev[:10],
                    })
                    return

                archivos_detalle: list[dict[str, Any]] = []
                processed_list: list[pd.DataFrame] = []
                for filename in filenames:
                    file_path = base / FILE_STORE_CIERRE_CAJA / codigo_negocio / filename
                    try:
                        processed_df, ad = self._consolidacion_procesar_un_archivo(
                            file_path, filename, fila_bc, column_names, codigo_bc
                        )
                        archivos_detalle.append(ad)
                        if processed_df is not None:
                            processed_list.append(processed_df)
                            logger.info(
                                "Consolidar: %s / %s -> %s filas",
                                codigo_negocio,
                                filename,
                                len(processed_df),
                            )
                    except Exception as exc:
                        logger.warning("Error procesando %s/%s: %s", codigo_negocio, filename, exc)
                        archivos_detalle.append({
                            "nombre": filename,
                            "estado": "omitido",
                            "motivo": f"error_lectura:{exc}",
                            "filas": 0,
                        })

                base_entry["archivos_detalle"] = archivos_detalle
                base_entry["archivos_ok"] = sum(1 for a in archivos_detalle if a.get("estado") == "ok")

                if not processed_list:
                    _append_locatario({
                        **base_entry,
                        "estado": "omitido",
                        "skip": "sin_filas_validas",
                        "motivo": self._consolidacion_skip_legible("sin_filas_validas"),
                    })
                    return

                final = pd.concat(processed_list, ignore_index=True)
                fmin_pre, fmax_pre, fechas_muestra = self._consolidacion_fechas_en_df(final)
                before_dedup = len(final)
                if "Fecha" in final.columns:
                    final = filtrar_filas_por_rango_fecha(final, start_d, end_d, col="Fecha")
                if final.empty:
                    _append_locatario({
                        **base_entry,
                        "estado": "omitido",
                        "skip": "sin_registros_en_rango_fecha",
                        "motivo": self._consolidacion_skip_legible("sin_registros_en_rango_fecha"),
                        "rango_inicio": start_d.isoformat(),
                        "rango_fin": end_d.isoformat(),
                        "fechas_detectadas_min": fmin_pre,
                        "fechas_detectadas_max": fmax_pre,
                        "fechas_detectadas_muestra": fechas_muestra,
                    })
                    return

                subset_cols = [c for c in ["Fecha", "CodigoNegocio", "Monto", "Producto"] if c in final.columns]
                if subset_cols:
                    final = final.drop_duplicates(subset=subset_cols, keep="last")
                duplicados_eliminados = before_dedup - len(final)

                estado_loc = "ok" if base_entry["archivos_ok"] == len(filenames) else "parcial"
                out_rel: str | None = None
                if not dry_run:
                    out_dir = _dir_locatario_consolidados(base, codigo_negocio)
                    out_dir.mkdir(parents=True, exist_ok=True)
                    safe_tag = re.sub(r"[^\w\-]+", "_", etiqueta)
                    out_path = out_dir / f"{safe_tag}.csv"
                    final.to_csv(out_path, index=False, sep=";")
                    out_rel = str(out_path.relative_to(base))
                    logger.info("Consolidado por locatario: %s (%s registros)", out_path, len(final))

                total_reg += len(final)
                fmin_out, fmax_out, _ = self._consolidacion_fechas_en_df(final)
                _append_locatario({
                    **base_entry,
                    "estado": estado_loc,
                    "motivo": "Consolidado correctamente."
                    if estado_loc == "ok"
                    else f"Consolidado con {len(filenames) - base_entry['archivos_ok']} archivo(s) sin aportar datos.",
                    "registros": len(final),
                    "duplicados_eliminados": duplicados_eliminados,
                    "archivo": out_rel,
                    "escrito": not dry_run,
                    "fechas_en_consolidado_min": fmin_out,
                    "fechas_en_consolidado_max": fmax_out,
                })

            for loc in LOCATARIOS:
                codigo_negocio = loc["codigo"]
                nombre_loc = loc["name"]
                _procesar_item(codigo_negocio, nombre_loc, items_by_loc.get(codigo_negocio))

            # Carpetas en disco que no están en el catálogo LOCATARIOS
            catalog_codes = {loc["codigo"] for loc in LOCATARIOS}
            for codigo_negocio, item in items_by_loc.items():
                if codigo_negocio in catalog_codes:
                    continue
                _procesar_item(codigo_negocio, codigo_negocio, item)

            config_src = ""
            try:
                config_src = str(self._resolve_config_path_for_mapping())
            except ValueError:
                pass

            return {
                "success": True,
                "dry_run": dry_run,
                "etiqueta": etiqueta,
                "rango_inicio": start_d.isoformat(),
                "rango_fin": end_d.isoformat(),
                "registros_total": total_reg,
                "resumen": resumen,
                "locatarios": detalle_loc,
                "config_basecarga": config_src,
                "message": "Simulación (sin escribir CSV)." if dry_run else None,
            }
        except Exception as e:
            logger.error(f"Error en consolidar_desde_filestore: {e}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # GESTIÓN DE ARCHIVOS
    # ==========================================

    async def _run_prediction_engine(self, client: bigquery.Client) -> str:
        """
        Adaptación del algoritmo μ ± k·σ para predicción de ventas.
        Escribe resultados en la tabla 'Predicciones' de BigQuery.
        """
        try:
            # 1. Configuración de Fechas
            now = datetime.now()
            start_data = now.replace(day=1).strftime("%Y-%m-%d")
            # Último domingo
            end_data = (now - timedelta(days=now.weekday() + 1)).strftime("%Y-%m-%d")
            
            start_cal = now.replace(day=1).strftime("%Y-%m-%d")
            end_cal = (now.replace(day=1) + pd.DateOffset(months=1) - pd.DateOffset(days=1)).strftime("%Y-%m-%d")
            corte_date = pd.Timestamp(end_data)

            # 2. Cargar datos históricos para el mes actual
            query = f"""
                SELECT DATE(Fecha) AS Fecha, SUM(CAST(Monto AS FLOAT64)) AS Venta
                FROM `{self.bq_project_id}.{self.bq_dataset}.sales_df`
                WHERE DATE(Fecha) BETWEEN '{start_data}' AND '{end_data}'
                  AND CAST(Monto AS FLOAT64) > 0
                GROUP BY 1 ORDER BY 1
            """
            df_ventas = client.query(query).to_dataframe()
            df_ventas['Fecha'] = pd.to_datetime(df_ventas['Fecha'])

            # 3. Construir calendario y proyecciones por DOW
            cal = pd.DataFrame({"Fecha": pd.date_range(start=start_cal, end=end_cal, freq="D")})
            df_daily = cal.merge(df_ventas, on="Fecha", how="left")
            df_daily["DiaSemana"] = df_daily["Fecha"].dt.dayofweek

            # 4. Calcular μ ± k·σ por día de la semana
            proyecciones_dow = {}
            k_sigma = 0.5
            for dow in range(7):
                historico = df_ventas[df_ventas["Fecha"].dt.dayofweek == dow].copy()
                if historico.empty:
                    proyecciones_dow[dow] = 0.0
                    continue
                
                mu = float(historico["Venta"].mean())
                sigma = float(historico["Venta"].std()) if len(historico) > 1 else 0.0
                lie, lse = mu - k_sigma * sigma, mu + k_sigma * sigma
                
                dentro = historico[(historico["Venta"] >= lie) & (historico["Venta"] <= lse)]
                ultimos_6 = list(dentro.sort_values("Fecha")["Venta"].tail(6))
                if len(ultimos_6) < 6:
                    promedio = mu if dentro.empty else float(dentro["Venta"].mean())
                    ultimos_6.extend([promedio] * (6 - len(ultimos_6)))
                
                proyecciones_dow[dow] = float(np.mean(ultimos_6))

            # 5. Generar tabla de predicciones
            predicciones = []
            for _, row in df_daily.iterrows():
                fecha = row['Fecha']
                dow = fecha.dayofweek
                
                if not pd.isna(row['Venta']) and fecha <= corte_date:
                    ventas, ventas_proy = float(row['Venta']), 0.0
                else:
                    ventas, ventas_proy = 0.0, proyecciones_dow[dow]
                
                predicciones.append({
                    'Fecha': fecha.date(),
                    'NroSemana': self._get_weeknum_pb(fecha),
                    'Anio': int(fecha.year),
                    'Mes': int(fecha.month),
                    'Ventas': ventas,
                    'VentasProyectadas': ventas_proy
                })
            
            df_pred = pd.DataFrame(predicciones)

            # 6. Guardar en BigQuery
            table_ref = f"{self.bq_project_id}.{self.bq_dataset}.Predicciones"
            # Limpiar mes actual
            client.query(f"DELETE FROM `{table_ref}` WHERE Anio = {now.year} AND Mes = {now.month}").result()
            
            job_config = bigquery.LoadJobConfig(write_disposition="WRITE_APPEND")
            client.load_table_from_dataframe(df_pred, table_ref, job_config=job_config).result()

            return f"Predicción exitosa: {len(df_pred)} días procesados."
        except Exception as e:
            logger.error(f"Error en prediction_engine: {str(e)}")
            return f"Error en predictor: {str(e)}"

    def _get_weeknum_pb(self, fecha: pd.Timestamp) -> int:
        """Calcula WEEKNUM compatible con Power BI (parámetro 11)."""
        jan1 = pd.Timestamp(fecha.year, 1, 1)
        days_diff = (fecha - jan1).days
        jan1_weekday = jan1.weekday()
        if jan1_weekday == 0:
            return (days_diff // 7) + 1
        days_to_first_monday = 7 - jan1_weekday
        if days_diff < days_to_first_monday:
            return 1
        return ((days_diff - days_to_first_monday) // 7) + 2

    # --- Helpers Internal ---

    async def _update_forma_pago_bq(self, client):
        """Replica update_payment_method_cell de CargaBigQueryOfi.py."""
        today = datetime.now().date()
        last_monday = today - timedelta(days=today.weekday() if today.weekday() > 0 else 7)
        last_monday_str = last_monday.strftime('%Y-%m-%d')
        
        query = f"""
            UPDATE `{self.bq_project_id}.{self.bq_dataset}.sales_df`
            SET FormaPagoModificado = 
              CASE
                WHEN REGEXP_CONTAINS(LOWER(TRIM(FormaPago)), r'(transf|transferencia).?(rappi|rapi)') OR
                     FormaPago IN ('RAPPI','RAPPI ', 'Rappi', 'Transf. Rappi', 'Transferencia Rappi','rappi','Tarjeta (Rappi ):') 
                THEN 'RAPPI'
                WHEN REGEXP_CONTAINS(LOWER(TRIM(FormaPago)), r'(transf|transferencia).?(pedidos ya|peya|pedidosya)') OR
                     FormaPago IN ('PEDIDOSYA', 'pedidosya', 'Pedidos Ya', 'Transf Peya', 'Transferencia Pedidos Ya', 'Tarjeta (Pedidosya ):') 
                THEN 'PEDIDOS YA'
                WHEN REGEXP_CONTAINS(LOWER(TRIM(FormaPago)), r'(tarjeta|visa|mastercard|american express|bbva|izipay|niubiz|diners club|crédito|credito)') OR
                     FormaPago IN ('Tarjeta CrÃ©dito', 'Mastercard CrÃ©dito', 'American Express', 'Tarjeta BBVA', 
                                  'Tarjeta (Izipay)', 'VISA', 'Contado/VISA', 'Niubiz (s)', 'Diners Club','Tarjeta (Visa ):', 'Tarjeta (BBVA 30% ):') OR
                     REGEXP_CONTAINS(FormaPago, r'^Contado/') 
                THEN 'TARJETA'
                WHEN REGEXP_CONTAINS(LOWER(TRIM(FormaPago)), r'(efectivo|cash|contado)') OR
                     FormaPago IN ('Efectivo', 'venta presencial', 'Contado', 'Contado ','Contado / Efectivo', 'Contado /Efectivo', 'Contado/Cash', 'Efectivo(S/):', 'Contado') 
                THEN 'EFECTIVO'
                ELSE 'OTROS'
              END
            WHERE DATE(Fecha) > DATE('{last_monday_str}');
        """
        client.query(query).result()

    def _run_predictor(self) -> str:
        """Ejecuta el script de predicción."""
        if not os.path.exists(self.prediction_script):
            return "Script de predicción no encontrado"
        
        try:
            # Ejecutar con el mismo intérprete
            subprocess.run([sys.executable, self.prediction_script], cwd=os.path.dirname(self.prediction_script), check=True)
            return "Predicción ejecutada con éxito"
        except Exception as e:
            return f"Error en predictor: {str(e)}"

    def _excel_cell_to_csv_indices(self, cell_address: str) -> Tuple[int, int]:
        """
        Compat carga ventas (DataFrame con cabecera pandas): fila Excel N → iloc N-2.
        La consolidación usa _parse_excel_cell_address sobre grilla cruda.
        """
        try:
            row_0, col_0 = self._parse_excel_cell_address(cell_address)
            return max(0, row_0 - 1), col_0
        except Exception as e:
            logger.error(f"Error convirtiendo coordenada {cell_address}: {e}")
            return 0, 0

    def _clear_sales_data(self):
        """Limpia las hojas de resultados para un inicio desde cero."""
        try:
            self._ensure_config_write_workbook()
            with pd.ExcelWriter(self.config_write_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                # 1. Limpiar sales_df manteniendo la cabecera original
                pd.DataFrame(columns=["CodigoNegocio","Fecha","Monto", "Estado", "FormaPago", "CodigoUbicacion", "EstadoNegocio", "TipoNegocio", "Area", "FechaCarga"]).to_excel(writer, sheet_name="sales_df", index=False)
                
                # 2. Limpiar Realizadas
                pd.DataFrame(columns=["CodigoNegocio", "RutaArchivo", "FechaInicio", "FechaFin", "Fecha_Procesamiento_Web"]).to_excel(writer, sheet_name="Realizadas", index=False)
                
            logger.info("♻️ Hojas 'sales_df' y 'Realizadas' reseteadas con éxito.")
        except Exception as e:
            logger.error(f"Error al limpiar hojas: {e}")
            raise e

    def _update_excel_with_sales(self, new_sales, activas, realizadas):
        """
        Lógica Original Certificada (Orden Estricto):
        Mapea campos originales y asegura el orden de sales_df.
        """
        try:
            # 1. Definir Orden Estricto de Columnas para sales_df (Excel Master)
            columnas_sales_df = [
                "CodigoNegocio", "Fecha", "Hora", "Producto", "Cliente", "Monto", 
                "Cantidad", "CodigoTransaccion", "FechaHora", "Estado", "FechaCarga",
                "CodigoUbicacion", "EstadoNegocio", "TipoNegocio", "Area", "FormaPago"
            ]

            # 2. Actualizar sales_df
            try:
                existing_sales = pd.read_excel(self.config_write_path, sheet_name="sales_df", engine="openpyxl")
            except:
                existing_sales = pd.DataFrame(columns=columnas_sales_df)
            
            # Asegurar consistencia de columnas antes de concatenar
            for col in columnas_sales_df:
                if col not in existing_sales.columns: existing_sales[col] = None
                if col not in new_sales.columns: new_sales[col] = None

            # Concatenar respetando el orden de las columnas maestras
            final_sales = pd.concat([existing_sales[columnas_sales_df], new_sales[columnas_sales_df]], ignore_index=True)
            
            # Eliminar duplicados técnicos (evitar reprocesar la misma transacción)
            final_sales = final_sales.drop_duplicates(subset=['Fecha', 'CodigoNegocio', 'Monto', 'Producto'], keep='last')
            
            # 3. Actualizar Realizadas (Mapeo de 10 Campos según lógica original)
            # Asegurar redondeo a 4 decimales en la sumatoria de Ventas Totales
            totales_por_negocio = new_sales.groupby('CodigoNegocio')['Monto'].sum().apply(lambda x: round(float(x), 4)).to_dict()
            nuevas_realizadas = activas[activas['Cargar'].apply(_activar_cargar)].copy()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Construcción de campos para Realizadas
            nuevas_realizadas['Fecha Transaccion'] = now_str
            nuevas_realizadas['Fecha Inicio'] = nuevas_realizadas['FechaInicio']
            nuevas_realizadas['Fecha Fin'] = nuevas_realizadas['FechaFin']
            nuevas_realizadas['Ventas Totales'] = nuevas_realizadas['CodigoNegocio'].map(totales_por_negocio).fillna(0).astype(float).round(4)
            nuevas_realizadas['Fecha_Procesamiento_Web'] = now_str

            columnas_realizadas = [
                "CodigoNegocio", "RutaArchivo", "Cargar", "Añadir", 
                "FechaInicio", "FechaFin", "Fecha Transaccion", 
                "Fecha Inicio", "Fecha Fin", "Ventas Totales",
                "Fecha_Procesamiento_Web"
            ]
            
            for col in columnas_realizadas:
                if col not in nuevas_realizadas.columns: nuevas_realizadas[col] = ""
            
            nuevas_realizadas = nuevas_realizadas[columnas_realizadas]
            
            if realizadas.empty:
                final_realizadas = nuevas_realizadas
            else:
                # Sincronizar columnas de la hoja existente para evitar errores de tipo en concat
                for col in columnas_realizadas:
                    if col not in realizadas.columns: realizadas[col] = ""
                final_realizadas = pd.concat([realizadas[columnas_realizadas], nuevas_realizadas], ignore_index=True)

            # 4. Escritura Atómica en Excel
            with pd.ExcelWriter(self.config_write_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                final_sales.to_excel(writer, sheet_name="sales_df", index=False)
                final_realizadas.to_excel(writer, sheet_name="Realizadas", index=False)
                # Limpiar Activas (CORREGIDO: 'activ' -> 'activas')
                pd.DataFrame(columns=activas.columns).to_excel(writer, sheet_name="Activas", index=False)
                
            logger.info("✅ Excel actualizado: sales_df ordenado y Realizadas sincronizadas.")
        except Exception as e:
            logger.error(f"Error crítico en sincronización de hojas: {e}")
            raise e

    @staticmethod
    def _bq_cell_as_string(value: Any) -> str:
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return ""
        if isinstance(value, (float, np.floating)):
            if value == int(value):
                return str(int(value))
            return str(value).strip()
        if isinstance(value, (int, np.integer)):
            return str(int(value))
        s = str(value).strip()
        return "" if s.lower() in ("nan", "none", "nat", "<na>") else s

    @classmethod
    def _cast_dataframe_to_bq_schema(cls, df: pd.DataFrame, schema) -> pd.DataFrame:
        """Alinea dtypes del DataFrame al esquema BigQuery (pyarrow exige STRING sin float64)."""
        string_types = {"STRING"}
        float_types = {"FLOAT", "FLOAT64", "NUMERIC", "BIGNUMERIC"}
        int_types = {"INTEGER", "INT64"}
        schema_map = {f.name: (f.field_type or "").upper() for f in schema}

        out = df.copy()
        for col in out.columns:
            bq_type = schema_map.get(col)
            if not bq_type:
                continue
            if bq_type in string_types:
                out[col] = out[col].map(cls._bq_cell_as_string)
            elif bq_type in float_types:
                out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0.0)
            elif bq_type in int_types:
                out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0).astype("Int64")
        return out

    def _preprocess_bq_sales(self, df):
        """
        Replica EXACTAMENTE la lógica de preprocess_sales_df de CargaBigQueryOfi.py
        para evitar los valores null detectados en BigQuery.
        """
        try:
            # 1. Copia para no alterar el Excel original
            df_proc = df.copy()

            # 2. Manejar nulos según lógica original (.py líneas 126-128)
            # Rellenar nulos numéricos con 0
            num_cols = df_proc.select_dtypes(include=['int64', 'float64']).columns
            for col in num_cols:
                df_proc[col] = df_proc[col].fillna(0)
            
            # Rellenar nulos de texto con ''
            obj_cols = df_proc.select_dtypes(include=['object']).columns
            for col in obj_cols:
                df_proc[col] = df_proc[col].fillna('')
            
            # Rellenar nulos de fecha con 1970 (según línea 128 original)
            date_cols = df_proc.select_dtypes(include=['datetime64']).columns
            for col in date_cols:
                df_proc[col] = df_proc[col].fillna(pd.Timestamp('1970-01-01'))

            # 3. Concatenación de FechaHora (línea 133 original)
            # Esto evita que 'Hora' llegue como null en BQ
            if 'Fecha' in df_proc.columns and 'Hora' in df_proc.columns:
                df_proc['FechaHora'] = df_proc['Fecha'].astype(str) + ' ' + df_proc['Hora'].astype(str)
            
            # 4. Convertir datetime a string (ISO) para evitar errores de pyarrow
            for col in df_proc.select_dtypes(include=['datetime64']).columns:
                df_proc[col] = df_proc[col].dt.strftime('%Y-%m-%d')

            # 4b. Hora por defecto y FechaHora coherente tras pasar Fecha a texto
            if 'Hora' in df_proc.columns:
                hs = df_proc['Hora'].astype(str).str.strip()
                hs = hs.replace({'nan': '', 'None': '', 'NaT': '', '<NA>': ''})
                df_proc['Hora'] = hs.replace('', '06:00:00')
            if 'Fecha' in df_proc.columns and 'Hora' in df_proc.columns:
                f = df_proc['Fecha'].astype(str).str.strip()
                f = f.replace({'nan': '', 'None': '', 'NaT': '', '<NA>': ''})
                h = df_proc['Hora'].astype(str).str.strip()
                df_proc['FechaHora'] = (f + ' ' + h).str.strip()

            # 5. Tipos finales: solo métricas numéricas a float (no convertir códigos/fechas a float)
            for col in ('Monto', 'Cantidad', 'cantidad', 'Area'):
                if col in df_proc.columns:
                    df_proc[col] = pd.to_numeric(df_proc[col], errors='coerce').fillna(0.0)
            for col in df_proc.select_dtypes(include=['object']).columns:
                df_proc[col] = (
                    df_proc[col].astype(str).str.replace('nan', '', regex=False)
                    .replace('None', '', regex=False).replace('NaT', '', regex=False)
                )
            if 'CodigoUbicacion' in df_proc.columns and pd.api.types.is_numeric_dtype(df_proc['CodigoUbicacion']):
                df_proc['CodigoUbicacion'] = df_proc['CodigoUbicacion'].map(self._bq_cell_as_string)

            # 6. Limpieza específica de campos (líneas 141-160 original)
            if 'Producto' in df_proc.columns:
                df_proc['Producto'] = df_proc['Producto'].astype(str).str.strip().str.lower()

            if 'FormaPago' in df_proc.columns:
                fp = df_proc['FormaPago'].astype(str).str.strip()
                df_proc['FormaPago'] = fp.replace({'nan': '', 'None': '', 'NaT': '', '<NA>': ''}).replace('', '-')
            
            if 'Estado' in df_proc.columns:
                df_proc['Estado'] = df_proc['Estado'].astype(str)

            # Normalización de decimales (Comas a Puntos) para Monto y cantidad
            for col in ['Monto', 'cantidad', 'Cantidad']:
                if col in df_proc.columns:
                    df_proc[col] = df_proc[col].astype(str).str.replace(',', '.').str.strip()
                    df_proc[col] = pd.to_numeric(df_proc[col], errors='coerce').fillna(0.0)

            # 7. No cargar filas con datos críticos nulos o inválidos (evitar nulls en BQ)
            if 'Monto' in df_proc.columns:
                df_proc = df_proc[df_proc['Monto'].notna() & (pd.to_numeric(df_proc['Monto'], errors='coerce') > 0)]
            if 'Fecha' in df_proc.columns:
                df_proc = df_proc[df_proc['Fecha'].notna() & (df_proc['Fecha'].astype(str).str.strip() != '') & (df_proc['Fecha'].astype(str).str.strip() != 'nan')]
            df_proc = df_proc.reset_index(drop=True)

            return df_proc
        except Exception as e:
            logger.error(f"Error en preprocesamiento fiel a la lógica original: {e}")
            return df
