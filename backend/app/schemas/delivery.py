import re
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, root_validator, validator


def order_orm_to_dict(order: Any) -> Dict[str, Any]:
    """Order (SQLAlchemy) → dict válido para JSON + response_model=OrderOut (Pydantic v1 y v2)."""
    if hasattr(OrderOut, "model_validate"):
        m = OrderOut.model_validate(order, from_attributes=True)
        d = m.model_dump(mode="python")
    else:
        d = OrderOut.from_orm(order).dict()
    rest = getattr(order, "restaurant", None)
    if rest is not None:
        d["restaurant_nombre"] = rest.nombre
    arr = getattr(order, "matched_driver_arrival", None)
    if arr is not None:
        d["matched_driver_arrival"] = driver_arrival_orm_to_dict(arr)
    lock_u = getattr(order, "locked_by_runner", None)
    d["locked_by_runner_username"] = getattr(lock_u, "username", None) if lock_u is not None else None
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
    conductor_documento_tipo: Optional[str] = None
    conductor_dni: Optional[str] = None
    conductor_carne_extranjeria: Optional[str] = None
    conductor_nombre_completo: Optional[str] = None


class DriverArrivalOut(DriverArrivalBase):
    id: int
    matched_order_id: Optional[int] = None
    restaurant_nombre: Optional[str] = None
    foto_path: Optional[str] = None
    foto_mime: Optional[str] = None
    foto_uploaded_at: Optional[datetime] = None
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
    restaurant_nombre: Optional[str] = None
    locked_by_runner_id: Optional[int] = None
    locked_by_runner_username: Optional[str] = None
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


class FidelioOrdenResumenOut(BaseModel):
    """Resumen de pedido en respuesta webhook Fidelio (metadatos en español)."""

    id: int
    id_restaurante: int
    nombre_restaurante: str
    plataforma: str
    codigo_pedido: str
    estado: str
    numero_bolsas: Optional[int] = None


class FidelioRecepcionOut(BaseModel):
    tipo: Literal["creado", "duplicado", "nuevo_ciclo"]
    duplicado: bool
    mensaje: str
    fecha_primera_recepcion: Optional[datetime] = None
    minutos_desde_primera_recepcion: Optional[int] = None
    tiempo_desde_primera_recepcion: Optional[str] = None
    bolsas_actualizadas: Optional[bool] = None
    id_pedido_anterior: Optional[int] = None
    estado_anterior: Optional[str] = None


class FidelioOrderReadyOut(BaseModel):
    orden: FidelioOrdenResumenOut
    recepcion: FidelioRecepcionOut


class KioskArrivalIn(BaseModel):
    """Registro kiosk: restaurante, plataforma, código, placa y alias obligatorios; documento según flag en servidor."""

    restaurant_id: int
    plataforma: str
    codigo_ingresado: str
    placa: str
    alias_conductor: str
    conductor_documento_tipo: Optional[str] = Field(
        None,
        alias="conductorDocumentoTipo",
    )
    conductor_dni: Optional[str] = Field(None, alias="conductorDni")
    conductor_carne_extranjeria: Optional[str] = Field(
        None,
        alias="conductorCarneExtranjeria",
    )

    class Config:
        allow_population_by_field_name = True

    @root_validator(pre=True)
    def _documento_tipo_y_campos_excluyentes(cls, values):
        if not isinstance(values, dict):
            return values

        def _pick(*keys: str):
            for k in keys:
                if k in values and values[k] is not None:
                    return values[k]
            return None

        # pre=True ve el dict crudo: unificar a snake_case (camelCase solo en algunos clientes/proxies).
        vt = _pick("conductor_documento_tipo", "conductorDocumentoTipo")
        if vt is not None:
            values["conductor_documento_tipo"] = vt
        vdni = _pick("conductor_dni", "conductorDni")
        if vdni is not None:
            values["conductor_dni"] = vdni
        vce = _pick("conductor_carne_extranjeria", "conductorCarneExtranjeria")
        if vce is not None:
            values["conductor_carne_extranjeria"] = vce
        values.pop("conductorDocumentoTipo", None)
        values.pop("conductorDni", None)
        values.pop("conductorCarneExtranjeria", None)

        raw_tipo = values.get("conductor_documento_tipo")
        dni_pre = re.sub(r"[\s-]", "", str(values.get("conductor_dni") or "").strip())
        ce_pre = re.sub(r"[\s-]", "", str(values.get("conductor_carne_extranjeria") or "").strip().upper())
        dni_ok = bool(dni_pre.isdigit() and 8 <= len(dni_pre) <= 12)
        ce_ok = bool(ce_pre and re.match(r"^[A-Z0-9]{4,20}$", ce_pre))

        if raw_tipo is None or (isinstance(raw_tipo, str) and not str(raw_tipo).strip()):
            # Sin tipo explícito: inferir por campos (p. ej. body parcial o cliente que no envía el flag).
            if ce_ok and not dni_ok:
                tipo = "CE"
            elif dni_ok and not ce_ok:
                tipo = "DNI"
            elif dni_ok and ce_ok:
                tipo = "DNI"
            else:
                tipo = "DNI"
        else:
            tipo = str(raw_tipo).strip().upper()
        if tipo not in ("DNI", "CE"):
            raise ValueError("tipo de documento: use DNI o CE")
        # Coherencia: no borrar carné si el flag vino mal pero solo hay CE válido (y viceversa).
        if tipo == "DNI" and ce_ok and not dni_ok:
            tipo = "CE"
        elif tipo == "CE" and dni_ok and not ce_ok:
            tipo = "DNI"
        values["conductor_documento_tipo"] = tipo
        if tipo == "CE":
            values["conductor_dni"] = None
        else:
            values["conductor_carne_extranjeria"] = None
        return values

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
            return None
        s = re.sub(r"[\s-]", "", str(v).strip())
        if not s:
            return None
        if not s.isdigit() or len(s) < 8 or len(s) > 12:
            raise ValueError("DNI: entre 8 y 12 dígitos")
        return s

    @validator("conductor_carne_extranjeria", pre=True)
    def _ce_normalize(cls, v):
        if v is None:
            return None
        s = re.sub(r"[\s-]", "", str(v).strip().upper())
        if not s:
            return None
        if not re.match(r"^[A-Z0-9]{4,20}$", s):
            raise ValueError("Carné extranjería: 4 a 20 caracteres alfanuméricos")
        return s


class KioskConfigPublicOut(BaseModel):
    enable_driver_dni_lookup: bool
    enable_driver_photo_capture: bool


class AdminAppConfigOut(KioskConfigPublicOut):
    """Kiosk + flags Runner (fila singleton `delivery_config`), solo rutas admin."""

    enable_runner_simulate_order_ready: bool


class KioskConfigPatchIn(BaseModel):
    enable_driver_dni_lookup: Optional[bool] = None
    enable_driver_photo_capture: Optional[bool] = None
    enable_runner_simulate_order_ready: Optional[bool] = None


class RunnerFeatureFlagsOut(BaseModel):
    """Flags para la app Runner (requiere JWT + delivery:view)."""

    enable_runner_simulate_order_ready: bool


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


class AdminForceEntregadoIn(AdminNoteIn):
    """Cierre manual como ENTREGADO sin exigir driver matcheado (auditoría)."""

    reason: str

    @validator("reason", pre=True)
    def _reason_required(cls, v):
        if v is None or not str(v).strip():
            raise ValueError("Motivo obligatorio")
        return str(v).strip()


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


class RunnerNotificationOut(BaseModel):
    """Fila de bandeja Runner (API + misma lógica que push)."""

    id: int
    kind: str
    title: str
    body: str
    order_id: Optional[int] = None
    driver_arrival_id: Optional[int] = None
    dedupe_key: str
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

