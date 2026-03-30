# -*- coding: utf-8 -*-
"""
API pública (upload/list) y protegida (delete) para FileStore.
Ruta base: /api/fuentes
"""
import os
import zipfile
import io
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Form
from fastapi.responses import StreamingResponse

from app.core.constants import LOCATARIOS, FILE_STORE_CIERRE_CAJA, FILE_STORE_PROCESADOS
from app.services.file_store_service import (
    save_file,
    list_archivos,
    list_cierre_caja_por_locatario,
    delete_file,
    get_upload_base,
    get_week_folder_name,
    get_semana_actual_lima,
    list_semanas_disponibles,
    preview_cierre_caja_tabular,
    preview_procesados_tabular,
    _dir_cierre_caja,
)
from app.api.auth import get_current_user
from app.models.auth import User

router = APIRouter(prefix="/fuentes", tags=["Fuentes de datos"])

ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}


def _zip_cierre_caja_tree(base: Path, zf: zipfile.ZipFile, locatario: str | None) -> None:
    """Añade cierre_caja al zip; si locatario, solo esa carpeta."""
    cc = _dir_cierre_caja(base)
    if not cc.is_dir():
        return
    if locatario:
        loc_dir = cc / locatario.strip()
        if not loc_dir.is_dir():
            return
        dirs = [loc_dir]
    else:
        dirs = [d for d in cc.iterdir() if d.is_dir()]
    for loc_dir in dirs:
        loc = loc_dir.name
        for f in loc_dir.rglob("*"):
            if f.is_file():
                arc = f.relative_to(cc)
                zf.write(f, str(Path(FILE_STORE_CIERRE_CAJA) / arc))


@router.get("/locatarios")
async def fuentes_listar_locatarios():
    """Lista de locatarios para el selector de carga (público)."""
    return {"locatarios": LOCATARIOS}


@router.get("/semana-actual")
async def fuentes_semana_actual():
    """Referencia de semana (Lima) para el operador; la carga va a cierre_caja (público)."""
    lunes, domingo, nombre, num = get_semana_actual_lima()
    return {
        "carpeta": nombre,
        "numero_semana": num,
        "lunes": lunes.isoformat(),
        "domingo": domingo.isoformat(),
    }


@router.post("/upload")
async def fuentes_upload(
    locatario_codigo: str,
    file: UploadFile = File(...),
):
    """
    Sube un archivo a cierre_caja/{locatario}/ con sufijo _YYYYMMDD_HHmmss si aplica (público).
    """
    if not locatario_codigo or not locatario_codigo.strip():
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Solo se permiten archivos .xlsx o .csv. Recibido: {ext or 'sin extensión'}",
        )
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {str(e)}")
    try:
        rel = save_file(locatario_codigo.strip(), file.filename or "archivo", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "ok": True,
        "ruta": rel,
        "referencia_semana": get_week_folder_name(),
        "ubicacion": FILE_STORE_CIERRE_CAJA,
    }


@router.get("/semanas")
async def fuentes_listar_semanas():
    """Compat UI: devuelve ['cierre_caja'] si existe inbox."""
    semanas = list_semanas_disponibles()
    return {"semanas": semanas}


@router.get("/preview")
async def fuentes_preview_tabular(
    origen: str,
    locatario_codigo: str,
    filename: str,
    zona: str | None = None,
    fecha: str | None = None,
    max_rows: int = 50,
):
    """
    Vista previa tabular (primeras filas) de CSV/XLSX en cierre_caja o procesados.
    origen: cierre | procesados
    cierre: zona=pendiente|consolidado
    procesados: fecha=YYYY-MM-DD
    """
    o = (origen or "").strip().lower()
    if o == "cierre":
        if not zona:
            raise HTTPException(status_code=400, detail="zona es requerida para origen=cierre")
        try:
            out = preview_cierre_caja_tabular(
                locatario_codigo,
                filename,
                zona=zona,
                max_rows=max_rows,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif o == "procesados":
        if not fecha or not fecha.strip():
            raise HTTPException(status_code=400, detail="fecha es requerida para origen=procesados")
        try:
            out = preview_procesados_tabular(
                fecha.strip(),
                locatario_codigo,
                filename,
                max_rows=max_rows,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="origen debe ser cierre o procesados")

    if not out.get("ok"):
        err = out.get("error") or "error"
        if err == "no_existe":
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        if err == "archivo_muy_grande":
            mb = out.get("max_mb", 25)
            raise HTTPException(status_code=413, detail=f"Archivo demasiado grande para previsualizar (máx. {mb} MB)")
        if err == "extension_no_soportada":
            raise HTTPException(status_code=400, detail="Solo se previsualizan .csv, .xlsx y .xls")
        raise HTTPException(status_code=422, detail=out.get("detail") or err)
    return out


@router.get("/archivos")
async def fuentes_listar_archivos(semana: str | None = None):
    """
    Lista cierre_caja por locatario: pendientes y consolidados (público).
    `semana` se ignora (compatibilidad con clientes antiguos).
    """
    data = list_archivos(semana_folder=semana)
    return {
        "vista": FILE_STORE_CIERRE_CAJA,
        "archivos": data,
        "por_locatario": list_cierre_caja_por_locatario(),
    }


@router.get("/procesados/fechas")
async def fuentes_procesados_fechas():
    """Lista fechas (YYYY-MM-DD) con carpetas en procesados/."""
    base = get_upload_base() / FILE_STORE_PROCESADOS
    if not base.is_dir():
        return {"fechas": []}
    fechas = sorted(d.name for d in base.iterdir() if d.is_dir())
    return {"fechas": fechas}


@router.get("/procesados/archivos")
async def fuentes_procesados_archivos(fecha: str):
    """Lista locatarios y archivos bajo procesados/{fecha}/."""
    base = get_upload_base()
    day_dir = base / FILE_STORE_PROCESADOS / fecha.strip()
    if not day_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Fecha no encontrada: {fecha}")
    result = []
    for loc_dir in sorted(day_dir.iterdir()):
        if not loc_dir.is_dir():
            continue
        names = sorted(f.name for f in loc_dir.iterdir() if f.is_file())
        if names:
            result.append({"locatario": loc_dir.name, "archivos": names})
    return {"fecha": fecha, "grupos": result}


@router.get("/zip")
async def fuentes_descargar_zip(
    semana: str | None = None,
    locatario: str | None = None,
):
    """
    ZIP de todo cierre_caja o de un locatario. `semana` ignorado (compat).
    """
    base = get_upload_base()
    cc = _dir_cierre_caja(base)
    if not cc.is_dir():
        raise HTTPException(status_code=404, detail="No hay carpeta cierre_caja")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        _zip_cierre_caja_tree(base, zf, locatario)
    buffer.seek(0)
    if buffer.getbuffer().nbytes == 0:
        raise HTTPException(status_code=404, detail="No hay archivos para comprimir")
    name = f"{FILE_STORE_CIERRE_CAJA}_{locatario or 'todos'}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={name}"},
    )


@router.post("/upload-bulk")
async def fuentes_upload_bulk(
    files: list[UploadFile] = File(...),
    locatario_codigo: str = Form(...),
    replace: bool = Form(False),
):
    """
    Varios archivos en un solo multipart. File(...) antes que Form(...) evita 422 en FastAPI/Starlette.
    replace=True: conserva nombre del cliente (sobrescribe). replace=False: sufijo _YYYYMMDD_HHmmss.
    """
    if not locatario_codigo or not locatario_codigo.strip():
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    if not files:
        raise HTTPException(status_code=400, detail="Al menos un archivo es requerido")
    results = []
    for file in files:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            results.append({"filename": file.filename, "ok": False, "error": f"Extensión no permitida: {ext}"})
            continue
        try:
            content = await file.read()
            rel = save_file(
                locatario_codigo.strip(),
                file.filename or "archivo",
                content,
                add_hash=not replace,
                replace=replace,
            )
            results.append({"filename": file.filename, "ok": True, "ruta": rel})
        except ValueError as e:
            results.append({"filename": file.filename, "ok": False, "error": str(e)})
        except Exception as e:
            results.append({"filename": file.filename, "ok": False, "error": str(e)})
    return {"ok": True, "ubicacion": FILE_STORE_CIERRE_CAJA, "referencia_semana": get_week_folder_name(), "results": results}


@router.delete("/archivo")
async def fuentes_eliminar_archivo(
    locatario_codigo: str,
    filename: str,
    zona: str = "pendiente",
    semana_folder: str | None = None,
    current_user: User = Depends(get_current_user),
):
    """
    Elimina archivo en pendiente o consolidado.
    zona: pendiente | consolidado
    semana_folder: ignorado (compat).
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo superuser puede eliminar archivos")
    z = (zona or "pendiente").strip().lower()
    if z in ("consolidado", "consolidados", "_consolidados"):
        z = "consolidado"
    elif z != "pendiente":
        raise HTTPException(status_code=400, detail="zona debe ser pendiente o consolidado")
    ok = delete_file(locatario_codigo.strip(), filename, zona=z)
    if not ok:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return {"ok": True}
