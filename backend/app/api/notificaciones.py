# -*- coding: utf-8 -*-
"""
Notificaciones / pendientes de carga (consumo típico: n8n con JWT o X-API-Key).
Config de envío programado y disparo manual → Webhook n8n (superuser).
"""
from __future__ import annotations

import os
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core import security
from app.database import get_db
from app.models.auth import User
from app.models.notificaciones_config import NotificacionesEnvioConfig
from app.schemas.notificaciones import (
    LocatarioPendienteItem,
    NotificacionesDisparoOut,
    NotificacionesEnvioConfigOut,
    NotificacionesEnvioConfigUpdate,
    PendientesResumen,
    PendientesSemanaResponse,
)
from app.services.file_store_service import ZONA_LIMA
from app.services.notificaciones_contactos import attach_emails_notificacion
from app.services.notificaciones_n8n import ejecutar_envio_n8n_desde_evaluacion
from app.services.notificaciones_service import (
    MODOS_PERIODO_NOTIFICACIONES,
    evaluar_locatarios_pendientes_periodo,
    lista_dias_periodo_iso,
    resolver_periodo_notificaciones,
)
from app.services.notificaciones_scheduler import refresh_notificaciones_cron_job

_MODOS_PENDIENTES = MODOS_PERIODO_NOTIFICACIONES

NOTIFICACIONES_API_KEY_ENV = "NOTIFICACIONES_API_KEY"

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])

oauth2_optional = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


async def _require_notificaciones_access(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    token: Optional[str] = Depends(oauth2_optional),
    db: Session = Depends(get_db),
) -> None:
    expected = (os.getenv(NOTIFICACIONES_API_KEY_ENV) or "").strip()
    if expected and x_api_key and x_api_key.strip() == expected:
        return

    if token:
        cred = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar las credenciales",
            headers={"WWW-Authenticate": "Bearer"},
        )
        try:
            payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
            username: Optional[str] = payload.get("sub")
            if username is None:
                raise cred
        except JWTError:
            raise cred
        user = db.query(User).filter(User.username == username).first()
        if user is None:
            raise cred
        return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Se requiere Bearer token o X-API-Key (NOTIFICACIONES_API_KEY)",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _envio_config_to_out(row: NotificacionesEnvioConfig) -> NotificacionesEnvioConfigOut:
    url = (row.n8n_webhook_url or "").strip() or None
    sec = (row.n8n_webhook_secret or "").strip()
    sm = (getattr(row, "schedule_modo", None) or "ultima_semana").strip().lower()
    if sm not in MODOS_PERIODO_NOTIFICACIONES:
        sm = "ultima_semana"
    fi = getattr(row, "schedule_fecha_inicio", None)
    ff = getattr(row, "schedule_fecha_fin", None)
    return NotificacionesEnvioConfigOut(
        schedule_enabled=row.schedule_enabled,
        schedule_hour=row.schedule_hour,
        schedule_minute=row.schedule_minute,
        schedule_modo=sm,
        schedule_dias=getattr(row, "schedule_dias", None),
        schedule_fecha_inicio=fi.isoformat() if fi else None,
        schedule_fecha_fin=ff.isoformat() if ff else None,
        timezone="America/Lima",
        n8n_webhook_url=url,
        n8n_webhook_secret_configured=bool(sec),
    )


@router.get("/envio-config", response_model=NotificacionesEnvioConfigOut)
async def get_envio_config(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    row = db.get(NotificacionesEnvioConfig, 1)
    if row is None:
        return NotificacionesEnvioConfigOut(
            schedule_enabled=False,
            schedule_hour=9,
            schedule_minute=0,
            schedule_modo="ultima_semana",
            schedule_dias=None,
            schedule_fecha_inicio=None,
            schedule_fecha_fin=None,
            timezone="America/Lima",
            n8n_webhook_url=None,
            n8n_webhook_secret_configured=False,
        )
    return _envio_config_to_out(row)


@router.patch("/envio-config", response_model=NotificacionesEnvioConfigOut)
async def patch_envio_config(
    payload: NotificacionesEnvioConfigUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403, detail="Solo administradores pueden cambiar el envío programado")
    row = db.get(NotificacionesEnvioConfig, 1)
    if row is None:
        row = NotificacionesEnvioConfig(
            id=1,
            schedule_enabled=False,
            schedule_hour=9,
            schedule_minute=0,
            schedule_modo="ultima_semana",
        )
        db.add(row)
        db.flush()
    data = payload.dict(exclude_unset=True)
    if "schedule_enabled" in data:
        row.schedule_enabled = bool(data["schedule_enabled"])
    if "schedule_hour" in data:
        row.schedule_hour = int(data["schedule_hour"])
    if "schedule_minute" in data:
        row.schedule_minute = int(data["schedule_minute"])
    if "schedule_modo" in data and data["schedule_modo"] is not None:
        sm = str(data["schedule_modo"]).strip().lower()
        if sm not in MODOS_PERIODO_NOTIFICACIONES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"schedule_modo inválido. Use: {', '.join(sorted(MODOS_PERIODO_NOTIFICACIONES))}",
            )
        row.schedule_modo = sm
    if "schedule_dias" in data:
        row.schedule_dias = data["schedule_dias"]
    if "schedule_fecha_inicio" in data:
        row.schedule_fecha_inicio = data["schedule_fecha_inicio"]
    if "schedule_fecha_fin" in data:
        row.schedule_fecha_fin = data["schedule_fecha_fin"]
    m = (row.schedule_modo or "ultima_semana").strip().lower()
    if m == "rango_libre" and (row.schedule_fecha_inicio is None or row.schedule_fecha_fin is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="schedule_modo rango_libre requiere schedule_fecha_inicio y schedule_fecha_fin",
        )
    if "n8n_webhook_url" in data:
        u = data["n8n_webhook_url"]
        row.n8n_webhook_url = (u.strip() if isinstance(u, str) else None) or None
    if "n8n_webhook_secret" in data:
        s = data["n8n_webhook_secret"]
        if s is None or (isinstance(s, str) and not s.strip()):
            row.n8n_webhook_secret = None
        elif isinstance(s, str):
            row.n8n_webhook_secret = s.strip()
    db.commit()
    db.refresh(row)
    refresh_notificaciones_cron_job()
    return _envio_config_to_out(row)


@router.post("/disparar-envio-n8n", response_model=NotificacionesDisparoOut)
async def disparar_envio_n8n(
    modo: str = Query(
        "ultima_semana",
        description="ultima_semana | semana_actual | rango_libre | ultimos_dias",
    ),
    dias: Optional[int] = Query(None, ge=1, le=366),
    fecha_inicio: Optional[date] = Query(None),
    fecha_fin: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403, detail="Solo administradores pueden disparar el envío a n8n")
    m = modo.strip().lower()
    if m not in _MODOS_PENDIENTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"modo inválido. Use: {', '.join(sorted(_MODOS_PENDIENTES))}",
        )
    if m == "rango_libre" and (fecha_inicio is None or fecha_fin is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rango_libre requiere fecha_inicio y fecha_fin",
        )
    try:
        pi, pf, etiqueta, rodante = resolver_periodo_notificaciones(
            m,
            dias=dias,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    out = ejecutar_envio_n8n_desde_evaluacion(
        db,
        trigger="manual",
        modo=m,
        periodo_inicio=pi,
        periodo_fin=pf,
        etiqueta=etiqueta,
        ventana_rodante=rodante,
    )
    return NotificacionesDisparoOut(
        ok=bool(out["ok"]),
        enviado=bool(out["enviado"]),
        items=int(out["items"]),
        error=out.get("error"),
        razon=out.get("razon"),
    )


@router.get("/pendientes-semana", response_model=PendientesSemanaResponse)
async def pendientes_semana(
    modo: str = Query(
        "ultima_semana",
        description="ultima_semana (defecto) | semana_actual | rango_libre | ultimos_dias",
    ),
    dias: Optional[int] = Query(None, ge=1, le=366, description="Solo ultimos_dias; por defecto 7"),
    fecha_inicio: Optional[date] = Query(None, description="rango_libre"),
    fecha_fin: Optional[date] = Query(None, description="rango_libre"),
    db: Session = Depends(get_db),
    _: None = Depends(_require_notificaciones_access),
):
    """
    Lista locatarios con/sin alerta según archivos pendientes en FileStore.
    Por defecto la ventana es la última semana completa (Lima). ultimos_dias usa ventana rodante.
    """
    m = modo.strip().lower()
    if m not in _MODOS_PENDIENTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"modo inválido. Use: {', '.join(sorted(_MODOS_PENDIENTES))}",
        )
    if m == "rango_libre" and (fecha_inicio is None or fecha_fin is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rango_libre requiere fecha_inicio y fecha_fin",
        )

    try:
        pi, pf, etiqueta, rodante = resolver_periodo_notificaciones(
            m,
            dias=dias,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    rows = evaluar_locatarios_pendientes_periodo(pi, pf, ventana_rodante=rodante)
    attach_emails_notificacion(db, rows)
    con_alerta = [LocatarioPendienteItem(**r) for r in rows if r["alerta"]]
    al_dia = [LocatarioPendienteItem(**r) for r in rows if not r["alerta"]]
    fecha_eval = datetime.now(ZONA_LIMA).date().isoformat()
    umbral = (dias if dias is not None else 7) if m == "ultimos_dias" else None

    return PendientesSemanaResponse(
        fecha_evaluacion=fecha_eval,
        modo=m,
        periodo_inicio=pi.isoformat(),
        periodo_fin=pf.isoformat(),
        dias_periodo=lista_dias_periodo_iso(pi, pf),
        ventana_rodante=rodante,
        umbral_dias=umbral,
        semana=etiqueta,
        resumen=PendientesResumen(
            total=len(rows),
            con_alerta=len(con_alerta),
            al_dia=len(al_dia),
        ),
        locatarios_con_alerta=con_alerta,
        locatarios_al_dia=al_dia,
    )
