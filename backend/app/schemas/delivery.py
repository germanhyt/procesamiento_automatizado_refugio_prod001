from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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
        from_attributes = True


class OrderBase(BaseModel):
    restaurant_id: int
    plataforma: str
    codigo_pedido: str
    estado: str
    numero_bolsas: Optional[int] = None


class OrderOut(OrderBase):
    id: int
    locked_by_runner_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DriverArrivalBase(BaseModel):
    plataforma: str
    codigo_ingresado: str
    placa: Optional[str] = None
    estado: str


class DriverArrivalOut(DriverArrivalBase):
    id: int
    matched_order_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DeliveryStatus(BaseModel):
    module: str
    status: str
    timestamp: datetime


class FidelioOrderReadyIn(BaseModel):
    restaurant_fidelio_id: str
    restaurant_nombre: Optional[str] = None
    plataforma: str
    codigo_pedido: str
    numero_bolsas: Optional[int] = None


class KioskArrivalIn(BaseModel):
    plataforma: str
    codigo_ingresado: str
    placa: Optional[str] = None


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

