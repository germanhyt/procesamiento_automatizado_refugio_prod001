import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, validator


def order_orm_to_dict(order: Any) -> Dict[str, Any]:
    """Order (SQLAlchemy) → dict válido para JSON + response_model=OrderOut (Pydantic v1 y v2)."""
    if hasattr(OrderOut, "model_validate"):
        m = OrderOut.model_validate(order, from_attributes=True)
        d = m.model_dump(mode="python")
    else:
        d = OrderOut.from_orm(order).dict()
    arr = getattr(order, "matched_driver_arrival", None)
    if arr is not None:
        d["matched_driver_arrival"] = driver_arrival_orm_to_dict(arr)
    return d


def driver_arrival_orm_to_dict(arrival: Any) -> Dict[str, Any]:
    if hasattr(DriverArrivalOut, "model_validate"):
        m = DriverArrivalOut.model_validate(arrival, from_attributes=True)
        d = m.model_dump(mode="python")
    else:
        d = DriverArrivalOut.from_orm(arrival).dict()
    rest = getattr(arrival, "restaurant", None)
    if rest is not None:
        d["restaurant_nombre"] = rest.nombre
    return d


class RestaurantBase(BaseModel):
    fidelio_id: str
    nombre: str
    is_active: bool = True
    codigo_negocio: Optional[str] = None
    codigo_comunicacion: Optional[str] = None


class RestaurantOut(RestaurantBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class RestaurantNotificationEmailOut(BaseModel):
    id: int
    restaurant_id: int
    email: str
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class RestaurantAdminOut(RestaurantOut):
    """Restaurante con correos de notificación (panel admin / n8n)."""

    notification_emails: List[RestaurantNotificationEmailOut] = Field(default_factory=list)


class RestaurantCreateIn(RestaurantBase):
    pass


class RestaurantUpdateIn(BaseModel):
    fidelio_id: Optional[str] = None
    nombre: Optional[str] = None
    is_active: Optional[bool] = None
    codigo_negocio: Optional[str] = None
    codigo_comunicacion: Optional[str] = None


class RestaurantNotificationEmailCreateIn(BaseModel):
    email: EmailStr


class OrderBase(BaseModel):
    restaurant_id: int
    plataforma: str
    codigo_pedido: str
    estado: str
    numero_bolsas: Optional[int] = None


class DriverArrivalBase(BaseModel):
    plataforma: str
    codigo_ingresado: str
    placa: Optional[str] = None
    alias_conductor: Optional[str] = None
    estado: str
    restaurant_id: Optional[int] = None
    conductor_dni: Optional[str] = None


class DriverArrivalOut(DriverArrivalBase):
    id: int
    matched_order_id: Optional[int] = None
    restaurant_nombre: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    estado_changed_at: Optional[datetime] = None
    atendido_at: Optional[datetime] = None
    despachado_at: Optional[datetime] = None

    class Config:
        orm_mode = True
        from_attributes = True


class OrderOut(OrderBase):
    id: int
    locked_by_runner_id: Optional[int] = None
    matched_driver_arrival_id: Optional[int] = None
    matched_driver_arrival: Optional[DriverArrivalOut] = None
    created_at: datetime
    updated_at: datetime
    estado_changed_at: Optional[datetime] = None
    listo_at: Optional[datetime] = None
    match_at: Optional[datetime] = None
    recogido_at: Optional[datetime] = None
    entregado_at: Optional[datetime] = None
    cancelado_at: Optional[datetime] = None
    devolucion_at: Optional[datetime] = None

    class Config:
        orm_mode = True
        from_attributes = True


class DeliveryStatus(BaseModel):
    module: str
    status: str
    timestamp: datetime


class FidelioOrderReadyIn(BaseModel):
    restaurant_fidelio_id: str
    plataforma: str
    codigo_pedido: str
    numero_bolsas: Optional[int] = None


class KioskArrivalIn(BaseModel):
    """Registro kiosk: restaurante, DNI, plataforma, código, placa y alias son obligatorios."""

    restaurant_id: int
    plataforma: str
    codigo_ingresado: str
    placa: str
    alias_conductor: str
    conductor_dni: str

    @validator("restaurant_id")
    def _restaurant_id_ok(cls, v):
        if v is None:
            raise ValueError("Seleccione restaurante")
        i = int(v)
        if i < 1:
            raise ValueError("restaurant_id inválido")
        return i

    @validator("plataforma", "codigo_ingresado", "placa", "alias_conductor", pre=True)
    def _strip_required(cls, v):
        if v is None:
            raise ValueError("campo obligatorio")
        s = str(v).strip()
        if not s:
            raise ValueError("no puede estar vacío")
        return s

    @validator("conductor_dni", pre=True)
    def _dni_normalize(cls, v):
        if v is None:
            raise ValueError("Ingrese DNI")
        s = re.sub(r"[\s-]", "", str(v).strip())
        if not s:
            raise ValueError("DNI no puede estar vacío")
        if not s.isdigit() or len(s) < 8 or len(s) > 12:
            raise ValueError("DNI: entre 8 y 12 dígitos")
        return s


class KioskArrivalResult(BaseModel):
    driver_arrival: DriverArrivalOut
    matched: bool
    matched_order: Optional[OrderOut] = None


class ManualMatchIn(BaseModel):
    driver_arrival_id: int


class AdminNoteIn(BaseModel):
    note: Optional[str] = None


class AdminCancelIn(AdminNoteIn):
    reason: Optional[str] = None


class AdminUnlockIn(AdminNoteIn):
    pass


class RunnerPushRegisterIn(BaseModel):
    """Registro de token Expo Push para la app Runner (interna)."""

    expo_push_token: str
    platform: str = "unknown"
    app_slug: str = "runner"

    @validator("expo_push_token", "platform", "app_slug", pre=True)
    def _strip_str(cls, v):
        if v is None:
            return v
        s = str(v).strip()
        return s


class RunnerPushUnregisterIn(BaseModel):
    expo_push_token: Optional[str] = None

    @validator("expo_push_token", pre=True)
    def _strip_optional(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s or None


class RunnerPushRegisterOut(BaseModel):
    ok: bool = True

