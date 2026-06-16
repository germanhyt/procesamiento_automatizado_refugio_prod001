# -*- coding: utf-8 -*-
"""API Agenda Deportiva: endpoints públicos (cartelera) y admin (JWT + RBAC)."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, WebSocket, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.api.auth import authenticate_token, get_current_user, oauth2_scheme
from app.core.agenda_deportiva_constants import (
    AGENDA_ARCHIVO_TIPO_MUSIC,
    AGENDA_ARCHIVO_TIPO_SLIDE,
    AGENDA_ARCHIVO_TIPOS,
    AGENDA_CATEGORIA_LUGARES,
    AGENDA_CATEGORIA_LUGAR_PLAY_BAR,
    AGENDA_MODO_DAY,
    AGENDA_MODO_MONTH,
    AGENDA_MODO_WEEK,
    PERMISSION_AGENDA_MANAGE,
    PERMISSION_AGENDA_VIEW,
)
from app.database import db_session, get_db
from app.models.agenda_deportiva import AgendaProgramacion, AgendaSlide, AgendaTrack
from app.models.auth import User
from app.schemas.agenda_deportiva import (
    ActionResponse,
    AgendaConfigOut,
    AgendaConfigPatch,
    AgendaProgramacionCreate,
    AgendaProgramacionDuplicateRequest,
    AgendaProgramacionOut,
    AgendaProgramacionUpdate,
    AgendaPublicMusicaOut,
    AgendaPublicProgramacionOut,
    AgendaPublicSlideOut,
    AgendaPublicTrackOut,
    AgendaSlideOut,
    AgendaSlideReorder,
    AgendaSlideUpdate,
    AgendaTrackOut,
    AgendaTrackReorder,
    AgendaTrackUpdate,
)
from app.services.agenda_deportiva_service import (
    delete_physical_file,
    get_or_create_config,
    next_slide_orden,
    next_track_orden,
    month_range_for_date,
    reorder_slides,
    reorder_tracks,
    resolve_file_path,
    resolve_programacion_activa,
    save_music_file,
    save_slide_file,
    fecha_lima_hoy,
    validate_programacion_fechas,
    week_range_for_date,
)
from app.services.agenda_deportiva_ws import (
    EVENT_MUSICA_UPDATED,
    EVENT_PROGRAMACION_UPDATED,
    broadcast_agenda_event,
    handle_agenda_public_ws,
)

router = APIRouter(prefix="/agenda-deportiva", tags=["Agenda Deportiva"])


def _notify_programacion_updated(background_tasks: BackgroundTasks) -> None:
    background_tasks.add_task(broadcast_agenda_event, EVENT_PROGRAMACION_UPDATED, {})


def _notify_musica_updated(background_tasks: BackgroundTasks) -> None:
    background_tasks.add_task(broadcast_agenda_event, EVENT_MUSICA_UPDATED, {})


def _upload_http_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if "demasiado grande" in msg.lower():
        return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=msg)
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


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
    if not _user_has_permission(current_user, PERMISSION_AGENDA_VIEW):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos")


def _require_manage(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, PERMISSION_AGENDA_MANAGE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos de gestión de agenda deportiva",
        )


def _public_archivo_url(request: Request, tipo: str, item_id: int) -> str:
    return str(request.url_for("agenda_public_archivo", tipo=tipo, item_id=item_id))


def _get_programacion_or_404(db: Session, programacion_id: int) -> AgendaProgramacion:
    row = (
        db.query(AgendaProgramacion)
        .options(joinedload(AgendaProgramacion.slides))
        .filter(AgendaProgramacion.id == programacion_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Programación no encontrada")
    return row


def _get_slide_or_404(db: Session, slide_id: int) -> AgendaSlide:
    row = db.query(AgendaSlide).filter(AgendaSlide.id == slide_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Slide no encontrado")
    return row


def _get_track_or_404(db: Session, track_id: int) -> AgendaTrack:
    row = db.query(AgendaTrack).filter(AgendaTrack.id == track_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Track no encontrado")
    return row


def _programaciones_activas_para_fecha(db: Session, target: date) -> list[AgendaProgramacion]:
    """Retorna todas las programaciones activas para la fecha priorizando modo DAY > WEEK > MONTH."""
    base_q = db.query(AgendaProgramacion).filter(
        AgendaProgramacion.activa.is_(True),
        AgendaProgramacion.fecha_inicio <= target,
        AgendaProgramacion.fecha_fin >= target,
    )

    day_rows = base_q.filter(AgendaProgramacion.modo == AGENDA_MODO_DAY).order_by(AgendaProgramacion.id.asc()).all()
    if day_rows:
        return day_rows

    week_rows = base_q.filter(AgendaProgramacion.modo == AGENDA_MODO_WEEK).order_by(AgendaProgramacion.id.asc()).all()
    if week_rows:
        return week_rows

    month_rows = base_q.filter(AgendaProgramacion.modo == AGENDA_MODO_MONTH).order_by(AgendaProgramacion.id.asc()).all()
    if month_rows:
        return month_rows

    return []


def _fechas_por_modo(modo: str, fecha_referencia: date) -> tuple[date, date]:
    if modo == AGENDA_MODO_DAY:
        return fecha_referencia, fecha_referencia
    if modo == AGENDA_MODO_WEEK:
        return week_range_for_date(fecha_referencia)
    if modo == AGENDA_MODO_MONTH:
        return month_range_for_date(fecha_referencia)
    return fecha_referencia, fecha_referencia


# --- Público (cartelera) ---


@router.websocket("/public/ws")
async def public_ws(websocket: WebSocket):
    """Broadcast en tiempo real para pantallas kiosk (sin autenticación)."""
    await handle_agenda_public_ws(websocket)


@router.get("/public/programacion", response_model=AgendaPublicProgramacionOut)
def public_programacion(
    request: Request,
    fecha: Optional[date] = None,
    categoria_lugar: Optional[str] = None,
    db: Session = Depends(get_db),
):
    when = fecha or fecha_lima_hoy()
    categoria_norm = (categoria_lugar or "").strip().lower()
    if categoria_norm and categoria_norm not in AGENDA_CATEGORIA_LUGARES:
        raise HTTPException(status_code=400, detail="categoria_lugar inválida")

    programaciones = _programaciones_activas_para_fecha(db, when)
    if categoria_norm:
        programaciones = [p for p in programaciones if (p.categoria_lugar or "").strip().lower() == categoria_norm]

    if not programaciones:
        return AgendaPublicProgramacionOut(slides=[])

    programacion_ids = [p.id for p in programaciones]
    programacion_por_id = {p.id: p for p in programaciones}

    slide_rows = (
        db.query(AgendaSlide)
        .filter(
            AgendaSlide.programacion_id.in_(programacion_ids),
            AgendaSlide.habilitada.is_(True),
        )
        .order_by(AgendaSlide.programacion_id.asc(), AgendaSlide.orden.asc(), AgendaSlide.id.asc())
        .all()
    )

    if len(programaciones) == 1:
        prog_ref = programaciones[0]
        modo = prog_ref.modo
        titulo = prog_ref.titulo
        fecha_inicio = prog_ref.fecha_inicio
        fecha_fin = prog_ref.fecha_fin
    else:
        modos = {p.modo for p in programaciones}
        modo = next(iter(modos)) if len(modos) == 1 else None
        titulo = None
        fecha_inicio = min(p.fecha_inicio for p in programaciones)
        fecha_fin = max(p.fecha_fin for p in programaciones)

    return AgendaPublicProgramacionOut(
        modo=modo,
        titulo=titulo,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        slides=[
            AgendaPublicSlideOut(
                orden=s.orden,
                url=_public_archivo_url(request, AGENDA_ARCHIVO_TIPO_SLIDE, s.id),
                alt=(s.alt_text or s.archivo_nombre_original),
                categoria_lugar=programacion_por_id.get(s.programacion_id).categoria_lugar if programacion_por_id.get(s.programacion_id) else None,
            )
            for s in slide_rows
        ],
    )


@router.get("/public/musica", response_model=AgendaPublicMusicaOut)
def public_musica(request: Request, db: Session = Depends(get_db)):
    config = get_or_create_config(db)
    if not config.playlist_publica_habilitada:
        return AgendaPublicMusicaOut(playlistEnabled=False, tracks=[])

    tracks = (
        db.query(AgendaTrack)
        .filter(
            AgendaTrack.habilitada.is_(True),
            AgendaTrack.publica.is_(True),
        )
        .order_by(AgendaTrack.orden)
        .all()
    )

    return AgendaPublicMusicaOut(
        playlistEnabled=True,
        tracks=[
            AgendaPublicTrackOut(
                orden=t.orden,
                title=t.titulo,
                url=_public_archivo_url(request, AGENDA_ARCHIVO_TIPO_MUSIC, t.id),
            )
            for t in tracks
        ],
    )


@router.get("/public/archivo/{tipo}/{item_id}", name="agenda_public_archivo")
def public_archivo(tipo: str, item_id: int):
    if tipo not in AGENDA_ARCHIVO_TIPOS:
        raise HTTPException(status_code=400, detail="tipo de archivo inválido")

    with db_session() as db:
        if tipo == AGENDA_ARCHIVO_TIPO_SLIDE:
            row = db.query(AgendaSlide).filter(AgendaSlide.id == item_id).first()
            if not row or not row.habilitada:
                raise HTTPException(status_code=404, detail="Slide no disponible")
        else:
            row = db.query(AgendaTrack).filter(AgendaTrack.id == item_id).first()
            if not row or not row.habilitada or not row.publica:
                raise HTTPException(status_code=404, detail="Track no disponible")

        try:
            path = resolve_file_path(row.archivo_ruta)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        if not path.is_file():
            raise HTTPException(status_code=404, detail="Archivo no encontrado en storage")

        return FileResponse(
            path=str(path),
            media_type=row.mime_type,
            filename=row.archivo_nombre_original,
            headers={"Cache-Control": "public, max-age=300"},
        )


def _serve_stored_file(row, *, filename: str, media_type: str) -> FileResponse:
    try:
        path = resolve_file_path(row.archivo_ruta)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en storage")
    return FileResponse(
        path=str(path),
        media_type=media_type,
        filename=filename,
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.get("/slides/{slide_id}/file")
def admin_slide_file(
    slide_id: int,
    token: str = Depends(oauth2_scheme),
):
    with db_session() as db:
        user = authenticate_token(db, token)
        _require_view(user)
        row = _get_slide_or_404(db, slide_id)
        return _serve_stored_file(
            row,
            filename=row.archivo_nombre_original,
            media_type=row.mime_type,
        )


@router.get("/tracks/{track_id}/file")
def admin_track_file(
    track_id: int,
    token: str = Depends(oauth2_scheme),
):
    with db_session() as db:
        user = authenticate_token(db, token)
        _require_view(user)
        row = _get_track_or_404(db, track_id)
        return _serve_stored_file(
            row,
            filename=row.archivo_nombre_original,
            media_type=row.mime_type,
        )


# --- Admin: config ---


@router.get("/config", response_model=AgendaConfigOut)
def get_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    return get_or_create_config(db)


@router.patch("/config", response_model=AgendaConfigOut)
def patch_config(
    body: AgendaConfigPatch,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = get_or_create_config(db)
    row.playlist_publica_habilitada = body.playlist_publica_habilitada
    db.commit()
    db.refresh(row)
    _notify_musica_updated(background_tasks)
    return row


# --- Admin: programaciones ---


@router.get("/programaciones", response_model=List[AgendaProgramacionOut])
def list_programaciones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    rows = (
        db.query(AgendaProgramacion)
        .options(joinedload(AgendaProgramacion.slides))
        .order_by(AgendaProgramacion.fecha_inicio.desc(), AgendaProgramacion.id.desc())
        .all()
    )
    return rows


@router.post("/programaciones", response_model=AgendaProgramacionOut, status_code=status.HTTP_201_CREATED)
def create_programacion(
    body: AgendaProgramacionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    fecha_fin = body.fecha_fin or body.fecha_inicio
    try:
        validate_programacion_fechas(body.modo, body.fecha_inicio, fecha_fin)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = AgendaProgramacion(
        titulo=(body.titulo.strip() if body.titulo else None),
        categoria_lugar=body.categoria_lugar,
        modo=body.modo,
        fecha_inicio=body.fecha_inicio,
        fecha_fin=fecha_fin,
        activa=body.activa,
        created_by_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _notify_programacion_updated(background_tasks)
    return _get_programacion_or_404(db, row.id)


@router.get("/programaciones/{programacion_id}", response_model=AgendaProgramacionOut)
def get_programacion(
    programacion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    return _get_programacion_or_404(db, programacion_id)


@router.patch("/programaciones/{programacion_id}", response_model=AgendaProgramacionOut)
def update_programacion(
    programacion_id: int,
    body: AgendaProgramacionUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_programacion_or_404(db, programacion_id)

    if body.titulo is not None:
        row.titulo = body.titulo.strip() or None
    if body.categoria_lugar is not None:
        row.categoria_lugar = body.categoria_lugar
    if body.modo is not None:
        row.modo = body.modo
    if body.fecha_inicio is not None:
        row.fecha_inicio = body.fecha_inicio
    if body.fecha_fin is not None:
        row.fecha_fin = body.fecha_fin
    if body.activa is not None:
        row.activa = body.activa

    try:
        validate_programacion_fechas(row.modo, row.fecha_inicio, row.fecha_fin)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    _notify_programacion_updated(background_tasks)
    return _get_programacion_or_404(db, row.id)


@router.post(
    "/programaciones/{programacion_id}/duplicar",
    response_model=AgendaProgramacionOut,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_programacion(
    programacion_id: int,
    body: AgendaProgramacionDuplicateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    source = _get_programacion_or_404(db, programacion_id)
    modo = body.modo or source.modo
    fecha_inicio, fecha_fin = _fechas_por_modo(modo, body.fecha_referencia)
    try:
        validate_programacion_fechas(modo, fecha_inicio, fecha_fin)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = AgendaProgramacion(
        titulo=source.titulo,
        categoria_lugar=source.categoria_lugar,
        modo=modo,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        activa=source.activa,
        created_by_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _notify_programacion_updated(background_tasks)
    return _get_programacion_or_404(db, row.id)


@router.delete("/programaciones/{programacion_id}", response_model=ActionResponse)
def delete_programacion(
    programacion_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_programacion_or_404(db, programacion_id)
    for slide in list(row.slides):
        delete_physical_file(slide.archivo_ruta)
    db.delete(row)
    db.commit()
    _notify_programacion_updated(background_tasks)
    return ActionResponse(ok=True, detail="Programación eliminada")


@router.post("/programaciones/{programacion_id}/activar", response_model=AgendaProgramacionOut)
def activar_programacion(
    programacion_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_programacion_or_404(db, programacion_id)
    row.activa = True
    db.commit()
    _notify_programacion_updated(background_tasks)
    return _get_programacion_or_404(db, row.id)


# --- Admin: slides ---


@router.post(
    "/programaciones/{programacion_id}/slides",
    response_model=AgendaSlideOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_slide(
    programacion_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    alt_text: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    _get_programacion_or_404(db, programacion_id)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    try:
        meta = save_slide_file(
            programacion_id=programacion_id,
            original_filename=file.filename or "slide.png",
            provided_mime_type=file.content_type,
            content=content,
        )
    except ValueError as exc:
        raise _upload_http_error(exc) from exc

    row = AgendaSlide(
        programacion_id=programacion_id,
        orden=next_slide_orden(db, programacion_id),
        alt_text=(alt_text.strip() if alt_text else None),
        habilitada=True,
        **meta,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _notify_programacion_updated(background_tasks)
    return row


@router.patch("/slides/{slide_id}", response_model=AgendaSlideOut)
def update_slide(
    slide_id: int,
    body: AgendaSlideUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_slide_or_404(db, slide_id)
    if body.alt_text is not None:
        row.alt_text = body.alt_text.strip() or None
    if body.habilitada is not None:
        row.habilitada = body.habilitada
    db.commit()
    db.refresh(row)
    _notify_programacion_updated(background_tasks)
    return row


@router.delete("/slides/{slide_id}", response_model=ActionResponse)
def delete_slide(
    slide_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_slide_or_404(db, slide_id)
    delete_physical_file(row.archivo_ruta)
    db.delete(row)
    db.commit()
    _notify_programacion_updated(background_tasks)
    return ActionResponse(ok=True, detail="Slide eliminado")


@router.patch("/programaciones/{programacion_id}/slides/reorder", response_model=List[AgendaSlideOut])
def reorder_programacion_slides(
    programacion_id: int,
    body: AgendaSlideReorder,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    _get_programacion_or_404(db, programacion_id)
    try:
        reorder_slides(db, programacion_id, body.slide_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    rows = (
        db.query(AgendaSlide)
        .filter(AgendaSlide.programacion_id == programacion_id)
        .order_by(AgendaSlide.orden)
        .all()
    )
    _notify_programacion_updated(background_tasks)
    return rows


# --- Admin: música ---


@router.get("/tracks", response_model=List[AgendaTrackOut])
def list_tracks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    return db.query(AgendaTrack).order_by(AgendaTrack.orden).all()


@router.post("/tracks", response_model=AgendaTrackOut, status_code=status.HTTP_201_CREATED)
async def upload_track(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    titulo: Optional[str] = Form(None),
    categoria_lugar: str = Form(AGENDA_CATEGORIA_LUGAR_PLAY_BAR),
    publica: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    categoria_normalizada = (categoria_lugar or "").strip().lower()
    if categoria_normalizada not in AGENDA_CATEGORIA_LUGARES:
        raise HTTPException(status_code=400, detail="categoria_lugar inválida")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    try:
        meta = save_music_file(
            original_filename=file.filename or "track.mp3",
            provided_mime_type=file.content_type,
            content=content,
        )
    except ValueError as exc:
        raise _upload_http_error(exc) from exc

    name = (titulo or file.filename or "Track").strip() or "Track"
    row = AgendaTrack(
        titulo=name,
        categoria_lugar=categoria_normalizada,
        orden=next_track_orden(db),
        habilitada=True,
        publica=publica,
        **meta,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _notify_musica_updated(background_tasks)
    return row


@router.patch("/tracks/{track_id}", response_model=AgendaTrackOut)
def update_track(
    track_id: int,
    body: AgendaTrackUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_track_or_404(db, track_id)
    if body.titulo is not None:
        row.titulo = body.titulo.strip() or row.titulo
    if body.categoria_lugar is not None:
        row.categoria_lugar = body.categoria_lugar
    if body.habilitada is not None:
        row.habilitada = body.habilitada
    if body.publica is not None:
        row.publica = body.publica
    db.commit()
    db.refresh(row)
    _notify_musica_updated(background_tasks)
    return row


@router.delete("/tracks/{track_id}", response_model=ActionResponse)
def delete_track(
    track_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = _get_track_or_404(db, track_id)
    delete_physical_file(row.archivo_ruta)
    db.delete(row)
    db.commit()
    _notify_musica_updated(background_tasks)
    return ActionResponse(ok=True, detail="Track eliminado")


@router.patch("/tracks/reorder", response_model=List[AgendaTrackOut])
def reorder_tracks_endpoint(
    body: AgendaTrackReorder,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    try:
        reorder_tracks(db, body.track_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    _notify_musica_updated(background_tasks)
    return db.query(AgendaTrack).order_by(AgendaTrack.orden).all()
