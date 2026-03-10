import os
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

logger = logging.getLogger(__name__)

class LegacyService:
    def __init__(self, drive_path: str, config_path: str, bq_project_id: str, bq_dataset: str, bq_creds_path: str):
        self.drive_path = drive_path
        self.config_path = config_path
        self.bq_project_id = bq_project_id
        self.bq_dataset = bq_dataset
        self.bq_creds_path = bq_creds_path
        self.ventas_dir = os.path.join(drive_path, "CierreCaja")
        self.procesados_dir = os.path.join(drive_path, "Procesados")
        # Root path for scripts (where main.py or similar is located)
        self.base_scripts_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        # We assume prediction folder is in the parent of backend/
        self.project_root = os.path.dirname(self.base_scripts_dir)
        self.prediction_script = os.path.join(self.project_root, "prediction", "predictor_ventas_powerbi_clean.py")

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
            record.update({
                'Fecha': date,
                'Hora': "06:00:00",
                'Monto': 0.0,
                'Producto': '-',
                'Cliente': 'Sistema',
                'Cantidad': 0,
                'CodigoTransaccion': f'DEFAULT_{date.strftime("%Y%m%d")}_{now.strftime("%H%M%S")}',
                'CodigoNegocio': codigo_negocio,
                'CodigoUbicacion': codigo_ubicacion,
                'FechaCarga': now.strftime("%Y-%m-%d"),
                'Estado': 0,
                'EstadoNegocio': estado_negocio if pd.notna(estado_negocio) else "INACTIVO",
                'TipoNegocio': tipo_negocio if pd.notna(tipo_negocio) else '',
                'Area': area if pd.notna(area) else ''
            })
            default_records.append(record)
        return pd.DataFrame(default_records)

    # ... (métodos existentes de conversión y archivos) ...

    async def list_cierre_caja_files(self) -> Dict[str, Any]:
        """Lista archivos actualmente en CierreCaja."""
        try:
            if not os.path.exists(self.ventas_dir):
                return {"success": False, "error": "Directorio CierreCaja no encontrado"}
            
            files = []
            for f in os.listdir(self.ventas_dir):
                path = os.path.join(self.ventas_dir, f)
                if os.path.isfile(path):
                    stats = os.stat(path)
                    files.append({
                        "name": f,
                        "size": stats.st_size,
                        "modified": datetime.fromtimestamp(stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                    })
            return {"success": True, "files": files}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def save_upload_file(self, filename: str, content: bytes) -> Dict[str, Any]:
        """Guarda un archivo subido en CierreCaja."""
        try:
            os.makedirs(self.ventas_dir, exist_ok=True)
            path = os.path.join(self.ventas_dir, filename)
            with open(path, "wb") as f:
                f.write(content)
            return {"success": True, "message": f"Archivo {filename} guardado"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==========================================
    # PASO 1: CONVERTIR XLSX A CSV
    # ==========================================
    async def convertir_xlsx_to_csv(self) -> Dict[str, Any]:
        """
        Replica la lógica de ConvertirCSVOfi.py:
        Busca todos los .xlsx en CierreCaja, los convierte a CSV (sep=;) y los elimina.
        """
        results = []
        try:
            if not os.path.exists(self.ventas_dir):
                return {"success": False, "error": f"No existe el directorio: {self.ventas_dir}"}

            files = [f for f in os.listdir(self.ventas_dir) if f.lower().endswith('.xlsx')]
            
            for filename in files:
                xlsx_path = os.path.join(self.ventas_dir, filename)
                try:
                    df = pd.read_excel(xlsx_path)
                    csv_filename = filename.rsplit('.', 1)[0] + '.csv'
                    csv_path = os.path.join(self.ventas_dir, csv_filename)
                    # El original usa pd.to_csv sin especificar sep en algunas versiones, 
                    # pero el proceso de carga espera ";"
                    df.to_csv(csv_path, index=False, sep=";")
                    os.remove(xlsx_path)
                    results.append(f"Convertido: {filename}")
                except Exception as e:
                    results.append(f"Error en {filename}: {str(e)}")

            return {"success": True, "details": results, "count": len(files)}
        except Exception as e:
            logger.error(f"Error en convertir_xlsx_to_csv: {str(e)}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # PASO 2: ASOCIAR NEGOCIOS
    # ==========================================

    async def obtener_negocios_lista(self) -> Dict[str, Any]:
        """Retorna la lista de negocios para el selector manual."""
        try:
            df = pd.read_excel(self.config_path, sheet_name="Negocios")
            negocios = df[["CodigoNegocio", "Descripcion"]].dropna().to_dict(orient="records")
            return {"success": True, "negocios": negocios}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def guardar_asociacion_manual(self, archivo: str, codigo_negocio: str, fecha_inicio: str, fecha_fin: str) -> Dict[str, Any]:
        """Guarda manualmente una asociación en la hoja Activas."""
        try:
            # Leer Activas actual
            try:
                df_activas = pd.read_excel(self.config_path, sheet_name="Activas")
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

            with pd.ExcelWriter(self.config_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df_activas.to_excel(writer, sheet_name="Activas", index=False)

            return {"success": True, "message": f"Asociación guardada para {archivo}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def asociar_negocios_automatico(self) -> Dict[str, Any]:
        """
        Replica la lógica de AsociarNegociosActualOfi.py:
        Aplica fuzzy matching entre archivos de CierreCaja y la lista de negocios.
        Actualiza las hojas 'Asociaciones' y 'Activas' con fechas de la última semana.
        """
        try:
            # 1. Cargar Negocios y Archivos
            hoja_negocios = pd.read_excel(self.config_path, sheet_name="Negocios")
            tiendas = hoja_negocios["Descripcion"].dropna().unique().tolist()
            archivos_pendientes = [f for f in os.listdir(self.ventas_dir) if f.lower().endswith('.csv')]
            
            # 2. Fuzzy Matching
            asociaciones = []
            for archivo in archivos_pendientes.copy():
                mejor_tienda = None
                mejor_puntaje = 0
                for tienda in tiendas:
                    puntaje = fuzz.partial_ratio(tienda.lower(), archivo.lower())
                    if puntaje > 80 and puntaje > mejor_puntaje:
                        mejor_tienda = tienda
                        mejor_puntaje = puntaje
                
                if mejor_tienda:
                    asociaciones.append({"Archivo": archivo, "Tienda": mejor_tienda})
                    tiendas.remove(mejor_tienda)

            df_asoc = pd.DataFrame(asociaciones)
            
            if df_asoc.empty:
                return {"success": True, "message": "No se encontraron nuevas asociaciones automáticas", "count": 0}

            # 3. Calcular fechas de última semana
            hoy = datetime.now().date()
            dias_desde_lunes = hoy.weekday()
            ultimo_lunes = hoy - timedelta(days=dias_desde_lunes + 7) if dias_desde_lunes != 0 else hoy - timedelta(days=7)
            ultimo_domingo = ultimo_lunes + timedelta(days=6)

            # 4. Preparar hoja 'Activas'
            activas_rows = []
            for _, row in df_asoc.iterrows():
                tienda = row["Tienda"]
                archivo = row["Archivo"]
                try:
                    codigo_negocio = hoja_negocios.loc[hoja_negocios["Descripcion"] == tienda, "CodigoNegocio"].values[0]
                except:
                    codigo_negocio = None
                
                activas_rows.append({
                    "CodigoNegocio": codigo_negocio,
                    "RutaArchivo": archivo,
                    "Cargar": 1,
                    "Añadir": 0,
                    "FechaInicio": ultimo_lunes.strftime("%Y-%m-%d"),
                    "FechaFin": ultimo_domingo.strftime("%Y-%m-%d")
                })
            
            df_activas = pd.DataFrame(activas_rows)

            # 5. Guardar en Excel
            with pd.ExcelWriter(self.config_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                df_asoc.to_excel(writer, sheet_name="Asociaciones", index=False)
                df_activas.to_excel(writer, sheet_name="Activas", index=False)

            return {"success": True, "count": len(asociaciones), "details": asociaciones}
        except Exception as e:
            logger.error(f"Error en asociar_negocios: {str(e)}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # PASO 3: CARGAR VENTAS (PROCESAR ACTIVAS)
    # ==========================================
    async def cargar_ventas_legacy(self, clear_data: bool = False) -> Dict[str, Any]:
        """
        Replica la lógica de CargaVentas_csvOfi.py:
        1. Limpia sales_df y Realizadas si clear_data es True.
        2. Procesa la hoja 'Activas', extrae datos según 'BaseCarga' y 'excel_cell_to_csv_indices'.
        3. Realiza el append en 'sales_df' y actualiza la hoja 'Realizadas'.
        4. Mueve archivos procesados a /Procesados/YYYY-MM-DD_cloud/.
        """
        try:
            # 0. Limpieza opcional
            if clear_data:
                self._clear_sales_data()

            # 1. Cargar configuraciones (Negocios con data_only para leer formulas como valores planos)
            config_activas_df = pd.read_excel(self.config_path, sheet_name="Activas")
            base_carga_df = pd.read_excel(self.config_path, sheet_name="BaseCarga")
            
            # --- MOTOR DE CAPTURA DE VALOR PLANO (FÓRMULAS EXCEL) ---
            try:
                # Cargamos en modo data_only para capturar el resultado de la fórmula de 'Estado'
                wb_data = openpyxl.load_workbook(self.config_path, data_only=True)
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
                negocios_df = pd.read_excel(self.config_path, sheet_name="Negocios")
            
            try:
                Realizadas_df = pd.read_excel(self.config_path, sheet_name="Realizadas")
            except:
                Realizadas_df = pd.DataFrame()

            processed_dataframes = []
            column_names = [col for col in base_carga_df.columns if col != 'CodigoNegocio']
            
            # Carpeta de destino con formato específico: YYYY-MM-DD_cloud
            current_date_str = datetime.now().strftime("%Y-%m-%d")
            folder_name = f"{current_date_str}_cloud"
            dated_destination_dir = os.path.join(self.procesados_dir, folder_name)
            os.makedirs(dated_destination_dir, exist_ok=True)

            # 2. Iterar sobre Activas
            for _, config_row in config_activas_df.iterrows():
                codigo_negocio = config_row['CodigoNegocio']
                ruta_archivo = config_row['RutaArchivo']
                cargar = config_row['Cargar']
                
                if cargar != 1 or not str(ruta_archivo).lower().endswith('.csv'):
                    continue

                file_path = os.path.join(self.ventas_dir, str(ruta_archivo))
                
                # Extraer info del negocio
                try:
                    neg_info = negocios_df[negocios_df['CodigoNegocio'] == codigo_negocio].iloc[0]
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

                if not os.path.exists(file_path):
                    logger.warning(f"Archivo no encontrado: {file_path}. Intentando crear registros por defecto...")
                    processed_df = self._create_default_records(codigo_negocio, codigo_ubicacion, estado_negocio, tipo_negocio, area, column_names)
                    processed_dataframes.append(processed_df)
                    continue

                # Cargar CSV con detección de encoding
                with open(file_path, 'rb') as f:
                    encoding = chardet.detect(f.read())['encoding'] or 'latin-1'
                
                try:
                    sheet = pd.read_csv(file_path, delimiter=";", encoding=encoding)
                except:
                    sheet = pd.read_csv(file_path, delimiter=";", encoding='latin-1')

                if sheet.empty:
                    continue

                # 3. Extraer datos por coordenadas (Lógica Legacy)
                # ... (bloque previo de reglas L17, A06) ...
                
                # [BLOQUE DE EXTRACCIÓN MEJORADO]
                data = {col: [] for col in column_names}
                max_length = 0
                for col in column_names:
                    try:
                        cell_address = base_carga_df.loc[base_carga_df['CodigoNegocio'] == codigo_negocio, col].values[0]
                        if pd.notna(cell_address):
                            r_idx, c_idx = self._excel_cell_to_csv_indices(str(cell_address))
                            col_vals = sheet.iloc[r_idx:, c_idx].tolist()
                            data[col] = col_vals
                            max_length = max(max_length, len(col_vals))
                    except:
                        data[col] = []
                
                for col in column_names:
                    if len(data[col]) < max_length:
                        data[col].extend([None]*(max_length - len(data[col])))

                processed_df = pd.DataFrame(data)

                # --- NORMALIZACIÓN CRÍTICA ANTES DE AGRUPAR ---
                def force_numeric_safe(val):
                    if pd.isna(val): return 0.0
                    try:
                        # 1. Limpiar símbolos y convertir comas a puntos
                        clean_str = str(val).strip().replace('S/', '').replace(',', '.').replace(' ', '')
                        # 2. Remover cualquier caracter que no sea número o punto
                        clean_str = re.sub(r"[^0-9.]", "", clean_str)
                        
                        if not clean_str or clean_str == '.': return 0.0
                        
                        num_val = float(clean_str)
                        
                        # 3. FILTRO DE SENSATEZ: 
                        # Si una sola línea de venta supera los 50,000, es altamente probable que sea un ID
                        # o un error de coordenadas en el Excel. Lo seteamos a 0.
                        if num_val > 50000: 
                            logger.warning(f"⚠️ Monto detectado como irreal ({num_val}). Posible ID capturado como Monto. Seteando a 0.")
                            return 0.0
                            
                        return round(num_val, 4)
                    except:
                        return 0.0

                if 'Monto' in processed_df.columns:
                    processed_df['Monto'] = processed_df['Monto'].apply(force_numeric_safe)

                # --- APLICAR REGLA DE AGRUPACIÓN POR TRANSACCIÓN ---
                # Ahora que Monto es numérico real y pequeño, la suma será correcta
                processed_df = self._group_by_transaction(processed_df, codigo_negocio)


                # 4. Limpieza y validación (Lógica Legacy)
                processed_df = processed_df.loc[:, ~processed_df.columns.str.contains('^Unnamed')]
                if processed_df.empty or pd.isna(processed_df['Fecha'].iloc[0]) or pd.isna(processed_df['Monto'].iloc[0]):
                    continue

                # Antes de convertir Fecha, extraer hora de Fecha si no existe columna Hora o está vacía
                # Lógica fiel a CargaVentas_csvOfi.py (líneas 857-873)
                def get_h(val):
                    s = str(val).split(' ')
                    return s[1] if len(s) > 1 else None

                def get_f(val):
                    return str(val).split(' ')[0] if val else None

                if "Hora" not in processed_df.columns or processed_df["Hora"].isna().all():
                    processed_df["Hora"] = processed_df['Fecha'].apply(get_h)
                    processed_df['Fecha'] = processed_df['Fecha'].apply(get_f)
                else:
                    # Si existe pero hay nulos parciales, intentar rescatar de Fecha
                    mask_h_null = processed_df["Hora"].isna() | (processed_df["Hora"] == "")
                    if mask_h_null.any():
                        processed_df.loc[mask_h_null, "Hora"] = processed_df.loc[mask_h_null, 'Fecha'].apply(get_h)
                        processed_df.loc[mask_h_null, 'Fecha'] = processed_df.loc[mask_h_null, 'Fecha'].apply(get_f)

                # Formateo final de Hora
                if "Hora" in processed_df.columns:
                    processed_df['Hora'] = processed_df['Hora'].astype(str).str.strip().replace(['nan', 'None', 'NaT'], '06:00:00')
                    processed_df['Hora'] = processed_df['Hora'].apply(lambda x: x if ':' in x else '06:00:00')

                # Función de limpieza interna (Restaurada y Reforzada)
                def clean_currency(value):
                    if value is None or (isinstance(value, float) and np.isnan(value)): return 0.0
                    if isinstance(value, (int, float)): return round(float(value), 4)
                    clean_str = str(value).strip().replace('S/', '').replace(',', '.').replace(' ', '')
                    try:
                        # Limpiar caracteres no numéricos excepto el punto y el signo menos
                        clean_str = re.sub(r"[^0-9.\-]", "", clean_str)
                        if not clean_str or clean_str == '.': return 0.0
                        num_val = float(clean_str)
                        # FILTRO DE SENSATEZ: Si supera 50,000, probablemente es un ID capturado erróneamente
                        if num_val > 50000: return 0.0
                        return round(num_val, 4)
                    except:
                        return 0.0

                processed_df['Monto'] = processed_df['Monto'].apply(clean_currency)
                processed_df['Fecha'] = pd.to_datetime(processed_df['Fecha'], errors='coerce')
                
                # --- APLICAR REGLA DE AGRUPACIÓN POR TRANSACCIÓN ---
                # Se realiza DESPUÉS de limpiar Monto para que la sumatoria sea correcta
                processed_df = self._group_by_transaction(processed_df, codigo_negocio)
                
                # Filtrar nulos
                processed_df = processed_df[(processed_df['Monto'] > 0) & (processed_df['Fecha'].notna())]
                
                if processed_df.empty:
                    continue

                # Columnas adicionales y completado de registros
                processed_df['CodigoNegocio'] = codigo_negocio
                processed_df['FechaCarga'] = datetime.now().strftime("%Y-%m-%d")
                processed_df['Estado'] = 0.0
                processed_df['CodigoUbicacion'] = codigo_ubicacion
                processed_df['EstadoNegocio'] = estado_negocio
                processed_df['TipoNegocio'] = tipo_negocio
                processed_df['Area'] = area
                
                # Completar campos vacíos (Cantidad -> 1, CodigoTransaccion -> "-")
                if 'Cantidad' in processed_df.columns:
                    processed_df['Cantidad'] = pd.to_numeric(processed_df['Cantidad'], errors='coerce').fillna(1).astype(int)
                else:
                    processed_df['Cantidad'] = 1
                
                # Asegurar que se use el nombre exacto de columna solicitado
                if 'Cantidad' in processed_df.columns:
                    processed_df['Cantidad'] = processed_df['Cantidad'].replace(0, 1)

                if 'CodigoTransaccion' in processed_df.columns:
                    processed_df['CodigoTransaccion'] = processed_df['CodigoTransaccion'].fillna("-").replace('', '-')
                else:
                    processed_df['CodigoTransaccion'] = "-"

                if 'Cliente' in processed_df.columns:
                    processed_df['Cliente'] = processed_df['Cliente'].fillna("-").replace('', '-')
                else:
                    processed_df['Cliente'] = "-"

                # Producto
                if 'Producto' in processed_df.columns:
                    processed_df['Producto'] = processed_df['Producto'].fillna("-").replace('', '-')
                else:
                    processed_df['Producto'] = "-"

                processed_dataframes.append(processed_df)

                # Mover a Procesados
                try:
                    shutil.move(file_path, os.path.join(dated_destination_dir, ruta_archivo))
                except:
                    pass

            # 5. Consolidar y Guardar (Append)
            if processed_dataframes:
                final_df = pd.concat(processed_dataframes, ignore_index=True)
                
                # Actualizar hojas en Excel
                self._update_excel_with_sales(final_df, config_activas_df, Realizadas_df)
                
                return {"success": True, "registros": len(final_df), "negocios": len(processed_dataframes)}
            else:
                return {"success": True, "registros": 0, "message": "No se procesaron nuevos datos"}

        except Exception as e:
            logger.error(f"Error en cargar_ventas_legacy: {str(e)}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # PASO 4: CARGAR BIGQUERY
    # ==========================================
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
            
            logger.info(f"🚀 Leyendo hoja 'sales_df' de {self.config_path} para carga a BigQuery.")

            # 1. CARGAR DESDE EXCEL (Fuente de verdad según lógica original)
            df_sales_excel = pd.read_excel(self.config_path, sheet_name="sales_df")
            
            # 2. Preprocesar para evitar errores de tipos en BQ
            df_sales_clean = self._preprocess_bq_sales(df_sales_excel)
            
            if df_sales_clean.empty:
                return {"success": True, "message": "La hoja sales_df está vacía, nada que cargar."}

            # 3. Filtrar columnas para stg_sales_raw
            columnas_bq = [
                "Fecha", "Hora", "FechaHora", "CodigoTransaccion", "Producto", "Cliente",
                "CodigoNegocio", "FechaCarga", "Estado", "Monto", "Cantidad",
                "CodigoUbicacion", "FormaPago", "EstadoNegocio", "TipoNegocio", "Area"
            ]
            cols_existentes = [c for c in columnas_bq if c in df_sales_clean.columns]
            df_final_bq = df_sales_clean[cols_existentes]

            # 4. Carga vía JSON para máxima estabilidad con los datos del Excel
            rows_to_insert = df_final_bq.to_dict(orient='records')
            table_sales_id = f"{self.bq_project_id}.{self.bq_dataset}.stg_sales_raw"
            
            # Realizar inserción
            errors = client.insert_rows_json(table_sales_id, rows_to_insert)

            
            if errors:
                raise Exception(f"Errores al insertar en BigQuery: {errors}")

            # 2. Update Negocios & Categorias (Truncate con validación de contenido)
            for sheet in ["Negocios", "Categorias"]:
                try:
                    df_temp = pd.read_excel(self.config_path, sheet_name=sheet)
                    df_temp = self._preprocess_bq_sales(df_temp)
                    
                    if df_temp.empty:
                        logger.warning(f"⚠️ La hoja '{sheet}' está vacía. Saltando carga para evitar error de esquema.")
                        continue

                    table_ref_id = f"{self.bq_project_id}.{self.bq_dataset}.{sheet}"
                    job_config = bigquery.LoadJobConfig(
                        write_disposition="WRITE_TRUNCATE",
                        autodetect=True
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
                "message": "Sincronización BigQuery completada",
                # "predictor": pred_result
            }
        except Exception as e:
            logger.error(f"Error en cargar_bigquery_legacy: {str(e)}")
            return {"success": False, "error": str(e)}

    # ==========================================
    # VISTA PREVIA
    # ==========================================
    async def get_sales_df_preview(self, limit: int = 100) -> Dict[str, Any]:
        """Obtiene una vista previa de la hoja sales_df."""
        try:
            if not os.path.exists(self.config_path):
                return {"success": False, "error": "Archivo de configuración no encontrado"}
            
            df = pd.read_excel(self.config_path, sheet_name="sales_df")
            # Tomar los últimos registros (suelen ser los más recientes)
            preview_df = df.tail(limit).copy()
            
            # Convertir fechas a string para JSON de forma segura
            import datetime as dt
            preview_df = preview_df.map(lambda x: x.isoformat() if isinstance(x, (dt.date, dt.datetime)) else x)
            
            # Reemplazar nulos para evitar errores JSON
            preview_df = preview_df.fillna("")
            
            return {
                "success": True, 
                "data": preview_df.to_dict(orient="records"),
                "columns": preview_df.columns.tolist(),
                "total_rows": len(df)
            }
        except Exception as e:
            logger.error(f"Error en preview: {e}")
            return {"success": False, "error": str(e)}

    async def get_realizadas_preview(self, limit: int = 100) -> Dict[str, Any]:
        """Obtiene una vista previa de la hoja Realizadas."""
        try:
            if not os.path.exists(self.config_path):
                return {"success": False, "error": "Archivo de configuración no encontrado"}
            
            df = pd.read_excel(self.config_path, sheet_name="Realizadas")
            # Tomar los últimos registros
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
                "total_rows": len(df)
            }
        except Exception as e:
            logger.error(f"Error en preview realizadas: {e}")
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
        """Convierte direcciones como 'B5' o 'AA10' a índices (fila, col) de 0 base para CSV."""
        try:
            # Limpiar la dirección por si viene con espacios o caracteres extraños
            address = str(cell_address).strip().upper()
            column_letters = ''.join(filter(str.isalpha, address))
            row_number = ''.join(filter(str.isdigit, address))
            
            column_index = 0
            for char in column_letters:
                column_index = column_index * 26 + (ord(char) - ord('A') + 1)
            
            # En CSV, la fila 1 es el encabezado (0), la 2 son datos. 
            # Si el Excel dice B5, en el CSV (leído por pandas) suele ser la fila 3 o 4 
            # dependiendo de si hay encabezados. Ajustamos a -2 para compensar.
            return int(row_number) - 2, column_index - 1
        except Exception as e:
            logger.error(f"Error convirtiendo coordenada {cell_address}: {e}")
            return 0, 0

    def _clear_sales_data(self):
        """Limpia las hojas de resultados para un inicio desde cero."""
        try:
            with pd.ExcelWriter(self.config_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
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
                existing_sales = pd.read_excel(self.config_path, sheet_name="sales_df")
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
            nuevas_realizadas = activas[activas['Cargar'] == 1].copy()
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
            with pd.ExcelWriter(self.config_path, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
                final_sales.to_excel(writer, sheet_name="sales_df", index=False)
                final_realizadas.to_excel(writer, sheet_name="Realizadas", index=False)
                # Limpiar Activas (CORREGIDO: 'activ' -> 'activas')
                pd.DataFrame(columns=activas.columns).to_excel(writer, sheet_name="Activas", index=False)
                
            logger.info("✅ Excel actualizado: sales_df ordenado y Realizadas sincronizadas.")
        except Exception as e:
            logger.error(f"Error crítico en sincronización de hojas: {e}")
            raise e

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

            # 5. Asegurar tipos finales (líneas 136-140 original)
            for col in df_proc.columns:
                if df_proc[col].dtype == 'int64':
                    df_proc[col] = df_proc[col].astype('float64')
                elif df_proc[col].dtype == 'object':
                    # Limpieza final de strings
                    df_proc[col] = df_proc[col].astype(str).str.replace('nan', '').replace('None', '').replace('NaT', '')

            # 6. Limpieza específica de campos (líneas 141-160 original)
            if 'Producto' in df_proc.columns:
                df_proc['Producto'] = df_proc['Producto'].astype(str).str.strip().str.lower()
            
            if 'Estado' in df_proc.columns:
                df_proc['Estado'] = df_proc['Estado'].astype(str)

            # Normalización de decimales (Comas a Puntos) para Monto y cantidad
            for col in ['Monto', 'cantidad', 'Cantidad']:
                if col in df_proc.columns:
                    df_proc[col] = df_proc[col].astype(str).str.replace(',', '.').str.strip()
                    df_proc[col] = pd.to_numeric(df_proc[col], errors='coerce').fillna(0.0)

            return df_proc
        except Exception as e:
            logger.error(f"Error en preprocesamiento fiel a la lógica original: {e}")
            return df
