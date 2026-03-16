# -*- coding: utf-8 -*-
"""
API pública (upload/list) y protegida (delete) para FileStore.
Ruta base: /api/fuentes
"""
import os
import zipfile
import io
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from fastapi.responses import StreamingResponse

from app.core.constants import LOCATARIOS
from app.services.file_store_service import (
    save_file,
    list_archivos,
    delete_file,
    get_upload_base,
    get_week_folder_name,
    get_semana_actual_lima,
    list_semanas_disponibles,
)
from app.api.auth import get_current_user
from app.models.auth import User

router = APIRouter(prefix="/fuentes", tags=["Fuentes de datos"])

ALLOWED_EXTENSIONS = {".xlsx", ".csv"}


@router.get("/locatarios")
async def fuentes_listar_locatarios():
    """Lista de locatarios para el selector de carga (público)."""
    return {"locatarios": LOCATARIOS}


@router.get("/semana-actual")
async def fuentes_semana_actual():
    """Devuelve nombre de carpeta de la semana actual (Lima) y rango de fechas (público)."""
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
    Sube un archivo Excel o CSV para el locatario indicado (público).
    Se guarda en carpeta semanal (Lima) y carpeta del locatario.
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
    return {"ok": True, "ruta": rel, "semana": get_week_folder_name()}


@router.get("/semanas")
async def fuentes_listar_semanas():
    """Lista carpetas de semanas disponibles en el FileStore (público)."""
    semanas = list_semanas_disponibles()
    return {"semanas": semanas}


@router.get("/archivos")
async def fuentes_listar_archivos(semana: str | None = None):
    """
    Lista archivos por semana. Si semana es None, usa la semana actual (Lima) (público).
    """
    data = list_archivos(semana_folder=semana)
    return {"semana": semana or get_week_folder_name(), "archivos": data}


@router.get("/zip")
async def fuentes_descargar_zip(semana: str, locatario: str | None = None):
    """
    Genera un ZIP con los archivos de la semana. Si locatario se indica, solo ese locatario (público).
    """
    base = get_upload_base()
    dir_semana = base / semana
    if not dir_semana.exists():
        raise HTTPException(status_code=404, detail=f"Semana no encontrada: {semana}")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if locatario:
            dir_loc = dir_semana / locatario.strip()
            if not dir_loc.is_dir():
                raise HTTPException(status_code=404, detail=f"Locatario no encontrado: {locatario}")
            for f in dir_loc.iterdir():
                if f.is_file():
                    zf.write(f, f"{semana}/{locatario}/{f.name}")
        else:
            for loc_dir in dir_semana.iterdir():
                if not loc_dir.is_dir():
                    continue
                for f in loc_dir.iterdir():
                    if f.is_file():
                        zf.write(f, f"{semana}/{loc_dir.name}/{f.name}")
    buffer.seek(0)
    filename_zip = f"{semana}.zip" if not locatario else f"{semana}_{locatario}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename_zip}"},
    )


@router.post("/upload-bulk")
async def fuentes_upload_bulk(
    locatario_codigo: str,
    replace: bool = False,
    files: list[UploadFile] = File(...),
):
    """
    Sube varios archivos para el locatario. Si replace=True, archivos con el mismo nombre reemplazan (público).
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
            save_file(locatario_codigo.strip(), file.filename or "archivo", content)
            results.append({"filename": file.filename, "ok": True})
        except ValueError as e:
            results.append({"filename": file.filename, "ok": False, "error": str(e)})
        except Exception as e:
            results.append({"filename": file.filename, "ok": False, "error": str(e)})
    return {"ok": True, "semana": get_week_folder_name(), "results": results}


@router.delete("/archivo")
async def fuentes_eliminar_archivo(
    semana_folder: str,
    locatario_codigo: str,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """Elimina un archivo. Solo superuser (protegido)."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo superuser puede eliminar archivos")
    ok = delete_file(semana_folder, locatario_codigo, filename)
    if not ok:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return {"ok": True}
