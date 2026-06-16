import os
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.api.auth import authenticate_token, get_current_user, oauth2_scheme
from app.database import db_session, get_db
from app.models.auth import User
from app.models.documentos_gcb import DocumentoGcb
from app.schemas.documentos_gcb import (
    ActionResponse,
    DocumentoGcbOut,
    DocumentoGcbUpdate,
    DocumentosGcbZipRequest,
    PaginatedDocumentosGcb,
)
from app.services.documentos_gcb_service import (
    create_documents_zip_tempfile,
    delete_physical_file,
    resolve_existing_document_file_path,
    save_document_file,
)

router = APIRouter(prefix="/documentos-gcb", tags=["Documentos GCB"])

DEFAULT_LIMIT = 50
# Listado admin puede pedir muchos ítems en una sola página (tabla con filtros en cliente).
MAX_LIMIT = 500


def _user_has_permission(user: User, codename: str) -> bool:
    try:
        for role in getattr(user, "roles", []) or []:
            for perm in getattr(role, "permissions", []) or []:
                if getattr(perm, "codename", None) == codename:
                    return True
    except Exception:
        return False
    return False


def _require_view(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, "documentos_gcb:view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos")


def _require_manage(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, "documentos_gcb:manage"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos de gestión documental",
        )


def _normalize_codigo(raw: str) -> str:
    value = (raw or "").strip().upper()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^A-Z0-9_-]", "", value)
    return value


def _get_or_404(db: Session, documento_id: int) -> DocumentoGcb:
    row = db.query(DocumentoGcb).filter(DocumentoGcb.id == documento_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return row


@router.get("", response_model=PaginatedDocumentosGcb)
def list_documentos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    q: Optional[str] = Query(None),
    coleccion: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    solo_activos: bool = Query(True),
):
    _require_view(current_user)

    query = db.query(DocumentoGcb)
    if solo_activos:
        query = query.filter(DocumentoGcb.activo.is_(True))
    if coleccion:
        query = query.filter(DocumentoGcb.coleccion == coleccion.strip())
    if categoria:
        query = query.filter(DocumentoGcb.categoria == categoria.strip())
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            (DocumentoGcb.codigo.ilike(term))
            | (DocumentoGcb.nombre.ilike(term))
            | (DocumentoGcb.archivo_nombre_original.ilike(term))
        )

    total = query.count()
    rows = (
        query.order_by(DocumentoGcb.created_at.desc(), DocumentoGcb.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return PaginatedDocumentosGcb(
        items=[DocumentoGcbOut.from_orm(row) for row in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


def _unlink_temp_zip(path: str) -> None:
    try:
        if path and os.path.isfile(path):
            os.unlink(path)
    except OSError:
        pass


@router.post("/download-zip")
def download_documentos_zip(
    body: DocumentosGcbZipRequest,
    token: str = Depends(oauth2_scheme),
):
    with db_session() as db:
        user = authenticate_token(db, token)
        _require_view(user)
        ids = list(dict.fromkeys(body.ids))
        rows_db = db.query(DocumentoGcb).filter(DocumentoGcb.id.in_(ids)).all()
        by_id = {r.id: r for r in rows_db}
        missing_ids = [i for i in ids if i not in by_id]
        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Documentos no encontrados: {missing_ids[:20]}{'…' if len(missing_ids) > 20 else ''}",
            )
        ordered = [by_id[i] for i in ids]

        tmp_path, added = create_documents_zip_tempfile(ordered)
        if added == 0:
            _unlink_temp_zip(tmp_path)
            raise HTTPException(
                status_code=404,
                detail="Ningún archivo disponible en storage para los documentos solicitados",
            )

        fname = f"documentos-gcb_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
        return FileResponse(
            tmp_path,
            media_type="application/zip",
            filename=fname,
            background=BackgroundTask(_unlink_temp_zip, tmp_path),
        )


@router.post("", response_model=DocumentoGcbOut, status_code=status.HTTP_201_CREATED)
async def create_documento(
    codigo: str = Form(...),
    nombre: str = Form(...),
    coleccion: str = Form(...),
    categoria: str = Form(...),
    subcategoria: Optional[str] = Form(None),
    descripcion: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)

    code = _normalize_codigo(codigo)
    if not code:
        raise HTTPException(status_code=400, detail="codigo inválido")
    if not (nombre or "").strip():
        raise HTTPException(status_code=400, detail="nombre es requerido")
    if not (coleccion or "").strip():
        raise HTTPException(status_code=400, detail="coleccion es requerida")
    if not (categoria or "").strip():
        raise HTTPException(status_code=400, detail="categoria es requerida")

    exists = db.query(DocumentoGcb).filter(DocumentoGcb.codigo == code).first()
    if exists:
        raise HTTPException(status_code=409, detail=f"Ya existe un documento con código {code}")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    saved_path = ""
    try:
        row = DocumentoGcb(
            codigo=code,
            nombre=nombre.strip(),
            coleccion=coleccion.strip(),
            categoria=categoria.strip(),
            subcategoria=(subcategoria.strip() if subcategoria else None),
            descripcion=(descripcion.strip() if descripcion else None),
            archivo_nombre_original="",
            archivo_nombre_actual="",
            archivo_ruta="",
            mime_type="application/octet-stream",
            extension="",
            tamano_bytes=0,
            activo=True,
        )
        db.add(row)
        db.flush()

        file_meta = save_document_file(
            documento_id=row.id,
            coleccion=row.coleccion,
            categoria=row.categoria,
            original_filename=file.filename or "documento",
            provided_mime_type=file.content_type,
            content=content,
        )
        saved_path = file_meta["archivo_ruta"]

        row.archivo_nombre_original = file_meta["archivo_nombre_original"]
        row.archivo_nombre_actual = file_meta["archivo_nombre_actual"]
        row.archivo_ruta = file_meta["archivo_ruta"]
        row.mime_type = file_meta["mime_type"]
        row.extension = file_meta["extension"]
        row.tamano_bytes = file_meta["tamano_bytes"]

        db.commit()
        db.refresh(row)
        return DocumentoGcbOut.from_orm(row)
    except ValueError as e:
        db.rollback()
        if saved_path:
            delete_physical_file(saved_path)
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        db.rollback()
        if saved_path:
            delete_physical_file(saved_path)
        raise
    except Exception:
        db.rollback()
        if saved_path:
            delete_physical_file(saved_path)
        raise HTTPException(status_code=500, detail="No se pudo crear el documento")


@router.get("/{documento_id}", response_model=DocumentoGcbOut)
def get_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    row = _get_or_404(db, documento_id)
    return DocumentoGcbOut.from_orm(row)


@router.put("/{documento_id}", response_model=DocumentoGcbOut)
def update_documento(
    documento_id: int,
    body: DocumentoGcbUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_or_404(db, documento_id)
    data = body.dict(exclude_unset=True)

    if "nombre" in data:
        clean_name = (data["nombre"] or "").strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="nombre inválido")
        row.nombre = clean_name
    if "subcategoria" in data:
        row.subcategoria = data["subcategoria"].strip() if data["subcategoria"] else None
    if "descripcion" in data:
        row.descripcion = data["descripcion"].strip() if data["descripcion"] else None
    if "activo" in data and data["activo"] is not None:
        row.activo = bool(data["activo"])

    db.commit()
    db.refresh(row)
    return DocumentoGcbOut.from_orm(row)


@router.put("/{documento_id}/replace-file", response_model=DocumentoGcbOut)
async def replace_document_file(
    documento_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_or_404(db, documento_id)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    old_path = row.archivo_ruta
    saved_path = ""
    try:
        file_meta = save_document_file(
            documento_id=row.id,
            coleccion=row.coleccion,
            categoria=row.categoria,
            original_filename=file.filename or row.archivo_nombre_original or "documento",
            provided_mime_type=file.content_type,
            content=content,
        )
        saved_path = file_meta["archivo_ruta"]

        row.archivo_nombre_original = file_meta["archivo_nombre_original"]
        row.archivo_nombre_actual = file_meta["archivo_nombre_actual"]
        row.archivo_ruta = file_meta["archivo_ruta"]
        row.mime_type = file_meta["mime_type"]
        row.extension = file_meta["extension"]
        row.tamano_bytes = file_meta["tamano_bytes"]

        db.commit()
        db.refresh(row)

        if old_path and old_path != row.archivo_ruta:
            delete_physical_file(old_path)

        return DocumentoGcbOut.from_orm(row)
    except ValueError as e:
        db.rollback()
        if saved_path:
            delete_physical_file(saved_path)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        db.rollback()
        if saved_path:
            delete_physical_file(saved_path)
        raise HTTPException(status_code=500, detail="No se pudo reemplazar el archivo")


@router.get("/{documento_id}/file")
def get_document_file(
    documento_id: int,
    token: str = Depends(oauth2_scheme),
):
    with db_session() as db:
        user = authenticate_token(db, token)
        _require_view(user)
        row = _get_or_404(db, documento_id)
        abs_path = resolve_existing_document_file_path(
            documento_id=row.id,
            coleccion=row.coleccion,
            categoria=row.categoria,
            archivo_ruta=row.archivo_ruta,
            archivo_nombre_actual=row.archivo_nombre_actual,
        )
        if not abs_path:
            raise HTTPException(status_code=404, detail="Archivo no encontrado en storage")

        return FileResponse(
            path=str(abs_path),
            media_type=row.mime_type or "application/octet-stream",
            headers={"Content-Disposition": f'inline; filename="{row.archivo_nombre_actual}"'},
        )


@router.delete("/{documento_id}", response_model=ActionResponse)
def soft_delete_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_or_404(db, documento_id)
    if not row.activo:
        return ActionResponse(ok=True, detail="Documento ya estaba inactivo")
    row.activo = False
    db.commit()
    return ActionResponse(ok=True, detail="Documento desactivado")
