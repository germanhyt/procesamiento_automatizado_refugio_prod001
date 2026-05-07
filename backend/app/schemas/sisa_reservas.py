from datetime import date, datetime, time
from typing import List, Optional

from pydantic import BaseModel, Field, validator

from app.core.sisa_reservas_constants import ESTADOS_SET, MOTIVOS_SET


class SisaReservaZonaBase(BaseModel):
    nombre: str = Field(..., max_length=80)
    color: Optional[str] = Field(None, max_length=32)
    pos_x: float = 0.0
    pos_y: float = 0.0
    width: float = 100.0
    height: float = 100.0
    sort_order: int = 0


class SisaReservaZonaCreate(SisaReservaZonaBase):
    pass


class SisaReservaZonaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, max_length=80)
    color: Optional[str] = Field(None, max_length=32)
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    sort_order: Optional[int] = None


class SisaReservaZonaOut(SisaReservaZonaBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class SisaReservaMesaBase(BaseModel):
    zona_id: int
    numero: str = Field(..., max_length=32)
    pos_x: float = 0.0
    pos_y: float = 0.0
    capacidad: Optional[int] = Field(None, ge=1)
    is_active: bool = True


class SisaReservaMesaCreate(SisaReservaMesaBase):
    pass


class SisaReservaMesaUpdate(BaseModel):
    zona_id: Optional[int] = None
    numero: Optional[str] = Field(None, max_length=32)
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    capacidad: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None


class SisaReservaMesaOut(SisaReservaMesaBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class SisaReservaRegistroBase(BaseModel):
    fecha_reserva: date
    hora_reserva: time
    motivo_reserva: str = Field(..., max_length=80)
    numero_personas: int = Field(..., ge=1)
    zona_id: int
    mesa_id: Optional[int] = None
    nombre_completo: str = Field(..., max_length=220)
    codigo_telefonico: str = Field(default="+51", max_length=8)
    numero_telefono: str = Field(..., max_length=32)
    email: Optional[str] = Field(None, max_length=255)
    comentario: Optional[str] = Field(None, max_length=2000)
    estado: str = Field(default="pendiente", max_length=40)

    @validator("motivo_reserva")
    def motivo_ok(cls, v: str) -> str:
        if v not in MOTIVOS_SET:
            raise ValueError(f"motivo_reserva debe ser uno de: {', '.join(sorted(MOTIVOS_SET))}")
        return v

    @validator("estado")
    def estado_ok(cls, v: str) -> str:
        if v not in ESTADOS_SET:
            raise ValueError(f"estado debe ser uno de: {', '.join(sorted(ESTADOS_SET))}")
        return v


class SisaReservaRegistroCreate(SisaReservaRegistroBase):
    pass


class SisaReservaRegistroUpdate(BaseModel):
    fecha_reserva: Optional[date] = None
    hora_reserva: Optional[time] = None
    motivo_reserva: Optional[str] = Field(None, max_length=80)
    numero_personas: Optional[int] = Field(None, ge=1)
    zona_id: Optional[int] = None
    mesa_id: Optional[int] = None
    nombre_completo: Optional[str] = Field(None, max_length=220)
    codigo_telefonico: Optional[str] = Field(None, max_length=8)
    numero_telefono: Optional[str] = Field(None, max_length=32)
    email: Optional[str] = Field(None, max_length=255)
    comentario: Optional[str] = Field(None, max_length=2000)
    estado: Optional[str] = Field(None, max_length=40)

    @validator("motivo_reserva")
    def motivo_ok(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in MOTIVOS_SET:
            raise ValueError(f"motivo_reserva debe ser uno de: {', '.join(sorted(MOTIVOS_SET))}")
        return v

    @validator("estado")
    def estado_ok(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ESTADOS_SET:
            raise ValueError(f"estado debe ser uno de: {', '.join(sorted(ESTADOS_SET))}")
        return v


class SisaReservaRegistroOut(SisaReservaRegistroBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class PaginatedSisaReservas(BaseModel):
    total: int
    items: List[SisaReservaRegistroOut]


class SisaReservaEstadoPatch(BaseModel):
    estado: str = Field(..., max_length=40)

    @validator("estado")
    def estado_ok(cls, v: str) -> str:
        if v not in ESTADOS_SET:
            raise ValueError(f"estado debe ser uno de: {', '.join(sorted(ESTADOS_SET))}")
        return v


class SisaReservaWhatsAppIn(BaseModel):
    codigo_telefonico: str = Field(default="+51", max_length=8)
    numero_telefono: str = Field(..., max_length=32)
    message: str = Field(..., min_length=1, max_length=4096)


class SisaReservaWhatsAppOut(BaseModel):
    wa_url: str
    phone_e164_digits: str


class CountByLabel(BaseModel):
    label: str
    count: int


class SisaReservasKpisOut(BaseModel):
    total_reservas: int
    pendientes: int
    confirmados: int
    ultimas: List[SisaReservaRegistroOut]
    by_motivo: List[CountByLabel]
    by_zona: List[CountByLabel]


class SisaReservaPlanoMesaOut(BaseModel):
    mesa: SisaReservaMesaOut
    reserva: Optional[SisaReservaRegistroOut] = None


class SisaReservaPlanoZonaOut(BaseModel):
    zona: SisaReservaZonaOut
    mesas: List[SisaReservaPlanoMesaOut]


class SisaReservaPlanoOut(BaseModel):
    fecha: date
    hora: time
    zonas: List[SisaReservaPlanoZonaOut]


# --- Webhook / notificaciones próximas (n8n) ---


class SisaReservasNotificacionesConfigOut(BaseModel):
    schedule_enabled: bool
    schedule_interval_minutes: int
    anticipation_minutes: int
    include_confirmados: bool
    timezone: str = "America/Lima"
    n8n_webhook_url: Optional[str] = None
    n8n_webhook_secret_configured: bool = False


class SisaReservasNotificacionesConfigUpdate(BaseModel):
    schedule_enabled: Optional[bool] = None
    schedule_interval_minutes: Optional[int] = Field(None, ge=5, le=1440)
    anticipation_minutes: Optional[int] = Field(None, ge=5, le=10080)
    include_confirmados: Optional[bool] = None
    n8n_webhook_url: Optional[str] = None
    n8n_webhook_secret: Optional[str] = None


class SisaReservasNotificacionesDisparoOut(BaseModel):
    ok: bool
    enviado: bool
    items: int
    error: Optional[str] = None
    razon: Optional[str] = None


# --- Formulario público (plano sin PII) ---


class SisaPublicReservaPeek(BaseModel):
    """Ocupación en plano público (sin datos personales)."""

    estado: str = Field(..., max_length=40)
    numero_personas: int = Field(..., ge=1)


class SisaPublicPlanoMesaOut(BaseModel):
    mesa: SisaReservaMesaOut
    reserva: Optional[SisaPublicReservaPeek] = None


class SisaPublicPlanoZonaOut(BaseModel):
    zona: SisaReservaZonaOut
    mesas: List[SisaPublicPlanoMesaOut]


class SisaPublicPlanoOut(BaseModel):
    fecha: date
    hora: time
    zonas: List[SisaPublicPlanoZonaOut]


class SisaPublicReservaCreate(BaseModel):
    """Alta desde canal público; el servidor fuerza estado pendiente."""

    fecha_reserva: date
    hora_reserva: time
    motivo_reserva: str = Field(..., max_length=80)
    numero_personas: int = Field(..., ge=1)
    zona_id: int
    mesa_id: Optional[int] = None
    nombre_completo: str = Field(..., max_length=220)
    codigo_telefonico: str = Field(default="+51", max_length=8)
    numero_telefono: str = Field(..., max_length=32)
    email: Optional[str] = Field(None, max_length=255)
    comentario: Optional[str] = Field(None, max_length=2000)

    @validator("motivo_reserva")
    def motivo_ok(cls, v: str) -> str:
        if v not in MOTIVOS_SET:
            raise ValueError(f"motivo_reserva debe ser uno de: {', '.join(sorted(MOTIVOS_SET))}")
        return v
