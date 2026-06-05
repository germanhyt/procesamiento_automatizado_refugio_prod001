# -*- coding: utf-8 -*-
"""
API pública (upload/list) y protegida (delete) para FileStore.
Ruta base: /api/fuentes
"""
import os
import zipfile
import io
import re
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Form
from fastapi.responses import StreamingResponse, FileResponse

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
    _dir_locatario_pendientes,
    _dir_locatario_consolidados,
    _dir_locatario_backup,
    move_to_backup,
    restore_from_backup,
    restore_from_procesados,
)
from app.api.auth import get_current_user
from app.models.auth import User

router = APIRouter(prefix="/fuentes", tags=["Fuentes de datos"])

ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}


def _normalize_cierre_zona(zona: str) -> str:
    z = (zona or "").strip().lower()
    if z in ("consolidado", "consolidados", "_consolidados"):
        return "consolidado"
    if z in ("backup", "respaldo", "backup_no_consolidados"):
        return "backup"
    if z == "pendiente":
        return "pendiente"
    raise HTTPException(status_code=400, detail="zona debe ser pendiente, consolidado o backup")


def _cierre_file_path(base: Path, loc: str, zona: str, filename: str) -> Path:
    fn = Path((filename or "").strip()).name
    if not fn:
        raise HTTPException(status_code=400, detail="filename inválido")
    z = _normalize_cierre_zona(zona)
    if z == "consolidado":
        return _dir_locatario_consolidados(base, loc) / fn
    if z == "backup":
        return _dir_locatario_backup(base, loc) / fn
    return _dir_locatario_pendientes(base, loc) / fn


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


@router.post("/zip-selection")
async def fuentes_descargar_zip_seleccion(
    locatario_codigo: str = Form(...),
    zona: str = Form(...),
    filenames: list[str] = Form(...),
):
    """
    ZIP con archivos seleccionados de un locatario en cierre_caja (pendiente, consolidado o backup).
    """
    loc = (locatario_codigo or "").strip()
    if not loc:
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    clean_names = list(dict.fromkeys(Path((f or "").strip()).name for f in filenames if (f or "").strip()))
    if not clean_names:
        raise HTTPException(status_code=400, detail="filenames es requerido")
    z = _normalize_cierre_zona(zona)
    base = get_upload_base()
    buffer = io.BytesIO()
    added = 0
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in clean_names:
            path = _cierre_file_path(base, loc, z, name)
            if not path.is_file():
                continue
            arc = Path(FILE_STORE_CIERRE_CAJA) / loc / z / name
            zf.write(path, str(arc))
            added += 1
    if added == 0:
        raise HTTPException(status_code=404, detail="No hay archivos para comprimir")
    buffer.seek(0)
    zip_name = f"{FILE_STORE_CIERRE_CAJA}_{loc}_{z}_seleccion.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_name}"},
    )


@router.get("/download")
async def fuentes_descargar_archivo(
    origen: str,
    locatario_codigo: str,
    filename: str,
    zona: str | None = None,
    fecha: str | None = None,
):
    """
    Descarga directa de archivo individual.
    origen: cierre | procesados
    cierre: zona=pendiente|consolidado
    procesados: fecha=YYYY-MM-DD
    """
    o = (origen or "").strip().lower()
    loc = (locatario_codigo or "").strip()
    fn = Path((filename or "").strip()).name
    if not loc:
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    if not fn:
        raise HTTPException(status_code=400, detail="filename inválido")

    base = get_upload_base()
    if o == "cierre":
        path = _cierre_file_path(base, loc, zona or "", fn)
    elif o == "procesados":
        raw_f = (fecha or "").strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_f):
            raise HTTPException(status_code=400, detail="fecha inválida (use YYYY-MM-DD)")
        day_dir = (base / FILE_STORE_PROCESADOS / raw_f).resolve()
        if not day_dir.is_dir():
            raise HTTPException(status_code=404, detail="Fecha no encontrada")
        path = (day_dir / loc / fn).resolve()
        try:
            path.relative_to(day_dir)
        except ValueError:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
    else:
        raise HTTPException(status_code=400, detail="origen debe ser cierre o procesados")

    if not path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(path=str(path), filename=fn, media_type="application/octet-stream")


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
    Elimina archivo en pendiente, consolidado o backup.
    zona: pendiente | consolidado | backup
    semana_folder: ignorado (compat).
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo superuser puede eliminar archivos")
    loc = (locatario_codigo or "").strip()
    if not loc:
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    fn = Path((filename or "").strip()).name
    if not fn:
        raise HTTPException(status_code=400, detail="filename inválido")
    z = _normalize_cierre_zona(zona or "pendiente")
    ok = delete_file(loc, fn, zona=z)
    if not ok:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return {"ok": True}


@router.post("/eliminar-bulk")
async def fuentes_eliminar_bulk(
    locatario_codigo: str = Form(...),
    zona: str = Form(...),
    filenames: list[str] = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Elimina varios archivos de un locatario en pendiente, consolidado o backup."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo superuser puede eliminar archivos")
    loc = (locatario_codigo or "").strip()
    if not loc:
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    clean_names = list(dict.fromkeys(Path((f or "").strip()).name for f in filenames if (f or "").strip()))
    if not clean_names:
        raise HTTPException(status_code=400, detail="filenames es requerido")
    z = _normalize_cierre_zona(zona)
    deleted: list[str] = []
    missing: list[str] = []
    for name in clean_names:
        if delete_file(loc, name, zona=z):
            deleted.append(name)
        else:
            missing.append(name)
    if not deleted:
        raise HTTPException(status_code=404, detail="No se eliminó ningún archivo")
    return {"ok": True, "deleted": deleted, "requested": clean_names, "missing": missing, "zona": z}


@router.post("/mover-backup")
async def fuentes_mover_backup(
    locatario_codigo: str = Form(...),
    filenames: list[str] = Form(...),
    zona: str = Form("pendiente"),
    current_user: User = Depends(get_current_user),
):
    """
    Mueve archivos a cierre_caja/{locatario}/backup_no_consolidados.
    Acepta movimiento individual o masivo.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo superuser puede mover archivos a backup")
    loc = (locatario_codigo or "").strip()
    if not loc:
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    z = (zona or "pendiente").strip().lower()
    if z in ("consolidado", "consolidados", "_consolidados"):
        z = "consolidado"
    elif z in ("backup", "respaldo", "backup_no_consolidados"):
        z = "backup"
    elif z != "pendiente":
        raise HTTPException(status_code=400, detail="zona debe ser pendiente, consolidado o backup")
    clean_names = [Path((f or "").strip()).name for f in filenames if (f or "").strip()]
    if not clean_names:
        raise HTTPException(status_code=400, detail="filenames es requerido")
    moved = move_to_backup(loc, clean_names, zona=z)
    missing = [n for n in clean_names if not any(p.endswith(f"/{n}") or p.endswith(f"\\{n}") for p in moved)]
    return {"ok": True, "moved": moved, "requested": clean_names, "missing": missing, "zona": z}


@router.post("/restaurar-backup")
async def fuentes_restaurar_backup(
    locatario_codigo: str = Form(...),
    filenames: list[str] = Form(...),
    destino: str = Form("pendiente"),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo superuser puede restaurar archivos desde backup")
    loc = (locatario_codigo or "").strip()
    if not loc:
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    d = (destino or "pendiente").strip().lower()
    if d in ("consolidado", "consolidados", "_consolidados"):
        d = "consolidado"
    elif d != "pendiente":
        raise HTTPException(status_code=400, detail="destino debe ser pendiente o consolidado")
    clean_names = [Path((f or "").strip()).name for f in filenames if (f or "").strip()]
    if not clean_names:
        raise HTTPException(status_code=400, detail="filenames es requerido")
    moved = restore_from_backup(loc, clean_names, destino=d)
    missing = [n for n in clean_names if not any(p.endswith(f"/{n}") or p.endswith(f"\\{n}") for p in moved)]
    return {"ok": True, "moved": moved, "requested": clean_names, "missing": missing, "destino": d}


@router.post("/restaurar-procesados")
async def fuentes_restaurar_procesados(
    fecha: str = Form(...),
    locatario_codigo: str = Form(...),
    filenames: list[str] = Form(...),
    destino: str = Form("pendiente"),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve archivos de procesados/{fecha}/{locatario}/ a cierre_caja (pendiente o consolidado).
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Solo superuser puede restaurar archivos desde procesados")
    raw_f = (fecha or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_f):
        raise HTTPException(status_code=400, detail="fecha inválida (use YYYY-MM-DD)")
    loc = (locatario_codigo or "").strip()
    if not loc:
        raise HTTPException(status_code=400, detail="locatario_codigo es requerido")
    d = (destino or "pendiente").strip().lower()
    if d in ("consolidado", "consolidados", "_consolidados"):
        d = "consolidado"
    elif d != "pendiente":
        raise HTTPException(status_code=400, detail="destino debe ser pendiente o consolidado")
    clean_names = list(dict.fromkeys(Path((f or "").strip()).name for f in filenames if (f or "").strip()))
    if not clean_names:
        raise HTTPException(status_code=400, detail="filenames es requerido")
    try:
        moved = restore_from_procesados(raw_f, loc, clean_names, destino=d)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    missing = [n for n in clean_names if not any(p.endswith(f"/{n}") or p.endswith(f"\\{n}") for p in moved)]
    if not moved:
        raise HTTPException(status_code=404, detail="No se restauró ningún archivo")
    return {
        "ok": True,
        "moved": moved,
        "requested": clean_names,
        "missing": missing,
        "fecha": raw_f,
        "destino": d,
    }
