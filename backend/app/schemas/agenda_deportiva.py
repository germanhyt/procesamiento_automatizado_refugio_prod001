# -*- coding: utf-8 -*-
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, validator

from app.core.agenda_deportiva_constants import AGENDA_CATEGORIA_LUGARES, AGENDA_MODOS


class AgendaConfigOut(BaseModel):
    playlist_publica_habilitada: bool
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class AgendaConfigPatch(BaseModel):
    playlist_publica_habilitada: bool


class AgendaProgramacionCreate(BaseModel):
    titulo: Optional[str] = Field(None, max_length=255)
    categoria_lugar: str = Field(..., max_length=64)
    modo: str
    fecha_inicio: date
    fecha_fin: Optional[date] = None
    activa: bool = True

    @validator("modo")
    def validate_modo(cls, value: str) -> str:
        upper = (value or "").strip().upper()
        if upper not in AGENDA_MODOS:
            raise ValueError(f"modo debe ser uno de: {', '.join(sorted(AGENDA_MODOS))}")
        return upper

    @validator("categoria_lugar")
    def validate_categoria_lugar(cls, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in AGENDA_CATEGORIA_LUGARES:
            raise ValueError(
                f"categoria_lugar debe ser una de: {', '.join(sorted(AGENDA_CATEGORIA_LUGARES))}"
            )
        return normalized

    @validator("fecha_fin", always=True)
    def default_fecha_fin(cls, value: Optional[date], values) -> date:
        if value is not None:
            return value
        return values.get("fecha_inicio")


class AgendaProgramacionUpdate(BaseModel):
    titulo: Optional[str] = Field(None, max_length=255)
    categoria_lugar: Optional[str] = Field(None, max_length=64)
    modo: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    activa: Optional[bool] = None

    @validator("modo")
    def validate_modo(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        upper = value.strip().upper()
        if upper not in AGENDA_MODOS:
            raise ValueError(f"modo debe ser uno de: {', '.join(sorted(AGENDA_MODOS))}")
        return upper

    @validator("categoria_lugar")
    def validate_categoria_lugar(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in AGENDA_CATEGORIA_LUGARES:
            raise ValueError(
                f"categoria_lugar debe ser una de: {', '.join(sorted(AGENDA_CATEGORIA_LUGARES))}"
            )
        return normalized


class AgendaSlideOut(BaseModel):
    id: int
    programacion_id: int
    orden: int
    alt_text: Optional[str] = None
    archivo_nombre_original: str
    mime_type: str
    extension: str
    tamano_bytes: int
    habilitada: bool
    created_at: datetime

    class Config:
        orm_mode = True


class AgendaSlideUpdate(BaseModel):
    alt_text: Optional[str] = Field(None, max_length=255)
    habilitada: Optional[bool] = None


class AgendaSlideReorder(BaseModel):
    slide_ids: List[int] = Field(..., min_items=1)


class AgendaTrackOut(BaseModel):
    id: int
    titulo: str
    categoria_lugar: str
    orden: int
    archivo_nombre_original: str
    mime_type: str
    extension: str
    tamano_bytes: int
    habilitada: bool
    publica: bool
    created_at: datetime

    class Config:
        orm_mode = True


class AgendaTrackUpdate(BaseModel):
    titulo: Optional[str] = Field(None, max_length=255)
    categoria_lugar: Optional[str] = Field(None, max_length=64)
    habilitada: Optional[bool] = None
    publica: Optional[bool] = None

    @validator("categoria_lugar")
    def validate_categoria_lugar(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in AGENDA_CATEGORIA_LUGARES:
            raise ValueError(
                f"categoria_lugar debe ser una de: {', '.join(sorted(AGENDA_CATEGORIA_LUGARES))}"
            )
        return normalized


class AgendaTrackReorder(BaseModel):
    track_ids: List[int] = Field(..., min_items=1)


class AgendaProgramacionOut(BaseModel):
    id: int
    titulo: Optional[str] = None
    categoria_lugar: str
    modo: str
    fecha_inicio: date
    fecha_fin: date
    activa: bool
    created_at: datetime
    updated_at: datetime
    slides: List[AgendaSlideOut] = []

    class Config:
        orm_mode = True


class AgendaPublicSlideOut(BaseModel):
    orden: int
    url: str
    alt: str
    categoria_lugar: Optional[str] = None


class AgendaPublicProgramacionOut(BaseModel):
    modo: Optional[str] = None
    titulo: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    slides: List[AgendaPublicSlideOut] = []


class AgendaPublicTrackOut(BaseModel):
    orden: int
    title: str
    url: str
    categoria_lugar: Optional[str] = None


class AgendaPublicMusicaOut(BaseModel):
    playlistEnabled: bool
    tracks: List[AgendaPublicTrackOut] = []


class ActionResponse(BaseModel):
    ok: bool
    detail: str


class AgendaProgramacionDuplicateRequest(BaseModel):
    fecha_referencia: date
    modo: Optional[str] = None

    @validator("modo")
    def validate_modo(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        upper = value.strip().upper()
        if upper not in AGENDA_MODOS:
            raise ValueError(f"modo debe ser uno de: {', '.join(sorted(AGENDA_MODOS))}")
        return upper
