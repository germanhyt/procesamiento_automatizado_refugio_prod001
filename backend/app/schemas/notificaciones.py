# -*- coding: utf-8 -*-
from typing import List, Optional

from pydantic import BaseModel, Field


class LocatarioPendienteItem(BaseModel):
    codigo: str
    nombre: str
    ultimo_upload: Optional[str] = None
    dias_sin_subir: Optional[int] = None
    alerta: bool
    fuente_fecha: Optional[str] = Field(
        default=None,
        description="contenido | nombre | mtime | sin_archivos | sin_fecha",
    )
    dias_con_registro: List[str] = Field(default_factory=list, description="Fechas ISO en el periodo con filas en archivos")
    dias_faltantes: List[str] = Field(default_factory=list, description="Días del periodo sin registro detectado")
    sugerencia_notificacion: Optional[str] = Field(
        default=None,
        description="Texto listo para email / n8n con días faltantes",
    )
    emails_notificacion: List[str] = Field(
        default_factory=list,
        description="Destinatarios desde delivery_restaurant_notification_emails (por fidelio_id)",
    )


class PendientesResumen(BaseModel):
    total: int
    con_alerta: int
    al_dia: int


class PendientesSemanaResponse(BaseModel):
    fecha_evaluacion: str
    modo: str = Field(description="ultima_semana | semana_actual | rango_libre | ultimos_dias")
    periodo_inicio: str
    periodo_fin: str
    dias_periodo: List[str] = Field(
        default_factory=list,
        description="Todos los días calendario del periodo evaluado (ISO), en orden",
    )
    ventana_rodante: bool = False
    umbral_dias: Optional[int] = Field(
        default=None,
        description="Solo modo ultimos_dias",
    )
    semana: str = Field(description="Etiqueta de periodo (carpeta semana o rango)")
    resumen: PendientesResumen
    locatarios_con_alerta: List[LocatarioPendienteItem]
    locatarios_al_dia: List[LocatarioPendienteItem]


class NotificacionesEnvioConfigOut(BaseModel):
    schedule_enabled: bool
    schedule_hour: int
    schedule_minute: int
    timezone: str = "America/Lima"
    n8n_webhook_url: Optional[str] = None
    n8n_webhook_secret_configured: bool = False

    class Config:
        orm_mode = True
        from_attributes = True


class NotificacionesEnvioConfigUpdate(BaseModel):
    schedule_enabled: Optional[bool] = None
    schedule_hour: Optional[int] = Field(None, ge=0, le=23)
    schedule_minute: Optional[int] = Field(None, ge=0, le=59)
    n8n_webhook_url: Optional[str] = Field(
        default=None,
        description="URL del Webhook n8n; cadena vacía borra el valor guardado",
    )
    n8n_webhook_secret: Optional[str] = Field(
        default=None,
        description="Secreto compartido (Authorization Bearer); omitir = sin cambio; '' = borrar",
    )


class NotificacionesDisparoOut(BaseModel):
    ok: bool
    enviado: bool
    items: int
    error: Optional[str] = None
    razon: Optional[str] = None
