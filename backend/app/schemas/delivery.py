from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, validator


def order_orm_to_dict(order: Any) -> Dict[str, Any]:
    """Order (SQLAlchemy) → dict válido para JSON + response_model=OrderOut (Pydantic v1 y v2)."""
    if hasattr(OrderOut, "model_validate"):
        m = OrderOut.model_validate(order, from_attributes=True)
        return m.model_dump(mode="python")
    return OrderOut.from_orm(order).dict()


def driver_arrival_orm_to_dict(arrival: Any) -> Dict[str, Any]:
    if hasattr(DriverArrivalOut, "model_validate"):
        m = DriverArrivalOut.model_validate(arrival, from_attributes=True)
        return m.model_dump(mode="python")
    return DriverArrivalOut.from_orm(arrival).dict()


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


class DriverArrivalOut(DriverArrivalBase):
    id: int
    matched_order_id: Optional[int] = None
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
    """Registro kiosk: plataforma, código, placa y alias son obligatorios."""

    plataforma: str
    codigo_ingresado: str
    placa: str
    alias_conductor: str

    @validator("plataforma", "codigo_ingresado", "placa", "alias_conductor", pre=True)
    def _strip_required(cls, v):
        if v is None:
            raise ValueError("campo obligatorio")
        s = str(v).strip()
        if not s:
            raise ValueError("no puede estar vacío")
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

