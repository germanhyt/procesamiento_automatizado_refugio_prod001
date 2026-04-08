from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, validator

EstadoComercial = Literal["pendiente", "atendido"]


class ComercialReservaBase(BaseModel):
    nombres: str = Field(..., max_length=200)
    celular: str = Field(..., max_length=20)
    cantidad_personas: int = Field(..., ge=1)
    fecha_reserva: str = Field(..., max_length=20)
    hora_reserva: str = Field(..., max_length=10)
    estado: EstadoComercial = "pendiente"

    @validator("estado")
    def estado_ok(cls, v: str) -> str:
        if v not in ("pendiente", "atendido"):
            raise ValueError("estado debe ser pendiente o atendido")
        return v


class ComercialReservaCreate(ComercialReservaBase):
    fecha_creacion: Optional[datetime] = None


class ComercialReservaUpdate(BaseModel):
    nombres: Optional[str] = Field(None, max_length=200)
    celular: Optional[str] = Field(None, max_length=20)
    cantidad_personas: Optional[int] = Field(None, ge=1)
    fecha_reserva: Optional[str] = Field(None, max_length=20)
    hora_reserva: Optional[str] = Field(None, max_length=10)
    estado: Optional[EstadoComercial] = None


class ComercialReservaOut(ComercialReservaBase):
    id: int
    fecha_creacion: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class ComercialEventoBase(BaseModel):
    nombres: str = Field(..., max_length=200)
    razon_social: Optional[str] = Field(None, max_length=200)
    celular: str = Field(..., max_length=20)
    tipo_evento: str = Field(..., max_length=50)
    cantidad_personas: int = Field(..., ge=1)
    fecha_tentativa: str = Field(..., max_length=20)
    estado: EstadoComercial = "pendiente"

    @validator("tipo_evento")
    def tipo_ok(cls, v: str) -> str:
        allowed = ("Social", "Corporativo", "Fiestas Infantiles")
        if v not in allowed:
            raise ValueError(f"tipo_evento debe ser uno de: {', '.join(allowed)}")
        return v

    @validator("estado")
    def estado_ok_evt(cls, v: str) -> str:
        if v not in ("pendiente", "atendido"):
            raise ValueError("estado debe ser pendiente o atendido")
        return v


class ComercialEventoCreate(ComercialEventoBase):
    fecha_creacion: Optional[datetime] = None


class ComercialEventoUpdate(BaseModel):
    nombres: Optional[str] = Field(None, max_length=200)
    razon_social: Optional[str] = Field(None, max_length=200)
    celular: Optional[str] = Field(None, max_length=20)
    tipo_evento: Optional[str] = Field(None, max_length=50)
    cantidad_personas: Optional[int] = Field(None, ge=1)
    fecha_tentativa: Optional[str] = Field(None, max_length=20)
    estado: Optional[EstadoComercial] = None


class ComercialEventoOut(ComercialEventoBase):
    id: int
    fecha_creacion: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class EstadoPatch(BaseModel):
    estado: EstadoComercial


class PaginatedReservas(BaseModel):
    items: List[ComercialReservaOut]
    total: int
    skip: int
    limit: int


class PaginatedEventos(BaseModel):
    items: List[ComercialEventoOut]
    total: int
    skip: int
    limit: int


class MonthlyCount(BaseModel):
    year: int
    month: int
    label: str
    count: int


class EstadoCount(BaseModel):
    estado: str
    count: int


class TipoEventoCount(BaseModel):
    tipo_evento: str
    count: int


class TipoEventoAvg(BaseModel):
    tipo_evento: str
    avg_personas: float


class PersonasRangeCount(BaseModel):
    rango: str
    count: int


class ReservasAnalyticsOut(BaseModel):
    by_month: List[MonthlyCount]
    by_estado: List[EstadoCount]
    by_personas_rango: List[PersonasRangeCount]
    avg_personas: float
    total: int


class EventosAnalyticsOut(BaseModel):
    by_month: List[MonthlyCount]
    by_estado: List[EstadoCount]
    by_tipo_evento: List[TipoEventoCount]
    avg_personas: float
    avg_personas_por_tipo: List[TipoEventoAvg]
    total: int


class WhatsAppSendIn(BaseModel):
    celular: str = Field(..., min_length=3, max_length=20)
    message: str = Field(..., min_length=1, max_length=4096)


class WhatsAppSendOut(BaseModel):
    wa_url: str
    phone_e164_digits: str
