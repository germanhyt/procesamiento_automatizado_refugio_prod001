# -*- coding: utf-8 -*-
"""
Test de consolidación con los archivos actuales de cierre_caja.
Ejecutar desde backend/:  python tools/test_consolidado.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'config', '.env'))

import asyncio
import pandas as pd
from pathlib import Path
from app.services.gdrive_service import GDriveService
from app.services.legacy_service import LegacyService
from app.services.file_store_service import (
    rango_desde_modo, archivo_en_rango_consolidacion,
    list_cierre_caja_por_locatario, get_upload_base
)


def strip_quotes(v: str) -> str:
    return (v or "").strip().strip('"').strip("'")


def build_service():
    creds = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'config', 'credentials.json'))
    gdrive = GDriveService(creds)
    return LegacyService(
        gdrive_service=gdrive,
        drive_id_config=strip_quotes(os.getenv('DRIVE_ID_ARCHIVO_CONFIGURACION', '')),
        drive_id_ventas=strip_quotes(os.getenv('DRIVE_ID_CARPETA_CIERRECAJA', '')),
        drive_id_procesados=strip_quotes(os.getenv('DRIVE_ID_CARPETA_PROCESADOS', '')),
        bq_project_id=os.getenv('BQ_PROJECT_ID'),
        bq_dataset=os.getenv('BQ_DATASET'),
        bq_creds_path=creds,
    )


def seccion(titulo: str):
    print(f"\n{'='*60}")
    print(f"  {titulo}")
    print('='*60)


def test_filtro_rango(modo: str = 'semana_actual'):
    seccion(f"1. FILTRO DE RANGO  [{modo}]")
    start_d, end_d, etiqueta = rango_desde_modo(modo)
    print(f"  Rango: {start_d}  a  {end_d}   etiqueta={etiqueta}")

    items = list_cierre_caja_por_locatario()
    base = get_upload_base()
    from app.core.constants import FILE_STORE_CIERRE_CAJA

    for item in items:
        loc = item['locatario']
        pendientes = item.get('pendientes') or []
        print(f"\n  Locatario: {loc}  ({len(pendientes)} pendientes)")
        incluidos = []
        for fn in pendientes:
            fp = base / FILE_STORE_CIERRE_CAJA / loc / fn
            ok = archivo_en_rango_consolidacion(fn, start_d, end_d, fp)
            tag = "OK " if ok else "NO"
            import re, datetime
            HASH_RE = re.compile(r'_(\d{8})_(\d{6})$', re.IGNORECASE)
            m = HASH_RE.search(Path(fn).stem)
            fecha_nom = datetime.datetime.strptime(m.group(1), '%Y%m%d').date() if m else None
            import os as _os
            mtime = datetime.datetime.fromtimestamp(fp.stat().st_mtime).strftime('%Y-%m-%d') if fp.is_file() else 'N/A'
            print(f"    [{tag}] fn_fecha={fecha_nom}  mtime={mtime}  {fn}")
            if ok:
                incluidos.append(fn)
        if not incluidos and pendientes:
            print(f"    -> (info) Ninguno pasaría filtro por nombre/mtime; la consolidación ahora usa columna Fecha y lee todos los pendientes.")


def test_base_carga(svc: LegacyService):
    seccion("2. BASE CARGA")
    svc._download_config()
    bc = pd.read_excel(svc.config_path, sheet_name='BaseCarga')
    print(f"  Columnas: {bc.columns.tolist()}")
    print(f"  Locatarios en BaseCarga: {bc['CodigoNegocio'].tolist()}")

    from app.core.constants import get_locatario_code_from_full
    items = list_cierre_caja_por_locatario()
    for item in items:
        loc = item['locatario']
        codigo_bc = get_locatario_code_from_full(loc)
        fila = bc[bc['CodigoNegocio'] == codigo_bc]
        if fila.empty:
            print(f"\n  [{loc}]  codigo_bc={codigo_bc}  *** NO ESTA en BaseCarga ***")
        else:
            print(f"\n  [{loc}]  codigo_bc={codigo_bc}  Coordenadas:")
            cols = [c for c in bc.columns if c != 'CodigoNegocio']
            for col in cols:
                val = fila.iloc[0][col]
                print(f"    {col:25s} = {val}")


def test_lectura_xlsx(svc: LegacyService, modo: str = 'semana_actual'):
    seccion("3. LECTURA POR COORDENADAS")
    bc = pd.read_excel(svc.config_path, sheet_name='BaseCarga')
    cols = [c for c in bc.columns if c != 'CodigoNegocio']
    base = get_upload_base()
    from app.core.constants import FILE_STORE_CIERRE_CAJA, get_locatario_code_from_full
    start_d, end_d, etiqueta = rango_desde_modo(modo)

    items = list_cierre_caja_por_locatario()
    for item in items:
        loc = item['locatario']
        codigo_bc = get_locatario_code_from_full(loc)
        pendientes = item.get('pendientes') or []
        fila_bc = bc[bc['CodigoNegocio'] == codigo_bc]
        if fila_bc.empty:
            print(f"\n  [{loc}]  codigo_bc={codigo_bc} sin fila en BaseCarga, skip")
            continue

        filenames = []
        for fn in pendientes:
            fp = base / FILE_STORE_CIERRE_CAJA / loc / fn
            if archivo_en_rango_consolidacion(fn, start_d, end_d, fp):
                filenames.append(fn)
        if not filenames:
            filenames = pendientes  # fallback

        print(f"\n  [{loc}]  {len(filenames)} archivos a procesar")
        for fn in filenames:
            fp = base / FILE_STORE_CIERRE_CAJA / loc / fn
            print(f"\n    Archivo: {fn}")
            try:
                if fn.lower().endswith('.xlsx'):
                    sheet = pd.read_excel(fp)
                else:
                    import chardet
                    with open(fp, 'rb') as f:
                        enc = chardet.detect(f.read())['encoding'] or 'latin-1'
                    sheet = pd.read_csv(fp, sep=None, engine='python', encoding=enc)
                print(f"    Filas leidas: {len(sheet)}   Columnas: {sheet.columns.tolist()[:8]}")

                # Aplicar coordenadas de BaseCarga
                data = {}
                for col in cols:
                    val = fila_bc.iloc[0][col]
                    import pandas as _pd
                    if _pd.isna(val):
                        data[col] = '(celda NaN, skip)'
                        continue
                    try:
                        r_idx, c_idx = svc._excel_cell_to_csv_indices(str(val))
                        extracted = sheet.iloc[r_idx:r_idx+3, c_idx].tolist()
                        data[col] = f"addr={val} r={r_idx} c={c_idx}  vals={extracted}"
                    except Exception as ex:
                        data[col] = f"ERROR addr={val}: {ex}"

                for col, info in data.items():
                    print(f"    {col:20s}: {info}")

                # Extraer Fecha y Monto completo
                fecha_addr = fila_bc.iloc[0].get('Fecha') if 'Fecha' in fila_bc.columns else None
                monto_addr = fila_bc.iloc[0].get('Monto') if 'Monto' in fila_bc.columns else None
                if pd.notna(fecha_addr) and pd.notna(monto_addr):
                    r_f, c_f = svc._excel_cell_to_csv_indices(str(fecha_addr))
                    r_m, c_m = svc._excel_cell_to_csv_indices(str(monto_addr))
                    fechas = sheet.iloc[r_f:, c_f].dropna().head(5).tolist()
                    montos = sheet.iloc[r_m:, c_m].dropna().head(5).tolist()
                    print(f"    --> Fechas[0:5]: {fechas}")
                    print(f"    --> Montos[0:5]: {montos}")

            except Exception as e:
                print(f"    ERROR leyendo archivo: {e}")


def test_consolidar_completo(svc: LegacyService, modo: str = 'semana_actual'):
    seccion(f"4. CONSOLIDACION COMPLETA [{modo}]")
    result = asyncio.run(svc.consolidar_desde_filestore(modo_rango=modo))
    print(f"  success: {result.get('success')}")
    if not result.get('success'):
        print(f"  ERROR: {result.get('error')}")
        return
    print(f"  etiqueta:        {result.get('etiqueta')}")
    print(f"  rango_inicio:    {result.get('rango_inicio')}")
    print(f"  rango_fin:       {result.get('rango_fin')}")
    print(f"  registros_total: {result.get('registros_total')}")
    print()
    for d in result.get('locatarios', []):
        skip = f"  [skip: {d['skip']}]" if 'skip' in d else ''
        print(f"  {d['locatario']:30s}  archivos={d['archivos']}  regs={d['registros']}  dedup={d.get('duplicados_eliminados','-')}{skip}")
        if 'archivo' in d:
            # leer el CSV generado y mostrar resumen
            from app.services.file_store_service import get_upload_base
            p = get_upload_base() / d['archivo']
            if p.is_file():
                try:
                    df_c = pd.read_csv(p, sep=';')
                    print(f"    CSV: {len(df_c)} filas  cols={df_c.columns.tolist()}")
                    if 'Fecha' in df_c.columns:
                        print(f"    Fechas: {sorted(df_c['Fecha'].dropna().astype(str).unique().tolist())}")
                    if 'Monto' in df_c.columns:
                        total = pd.to_numeric(df_c['Monto'], errors='coerce').sum()
                        print(f"    Monto total: {total:.2f}")
                except Exception as e:
                    print(f"    ERROR leyendo CSV: {e}")


if __name__ == '__main__':
    modo = sys.argv[1] if len(sys.argv) > 1 else 'semana_actual'
    print(f"\n>>> TEST CONSOLIDADO  modo={modo}\n")

    test_filtro_rango(modo)

    svc = build_service()
    test_base_carga(svc)
    test_lectura_xlsx(svc, modo)
    test_consolidar_completo(svc, modo)
