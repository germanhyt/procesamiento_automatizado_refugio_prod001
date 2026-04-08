# -*- coding: utf-8 -*-
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class NotificacionesEnvioConfig(Base):
    """Fila singleton id=1: hora del envío automático a n8n (America/Lima) y Webhook."""

    __tablename__ = "notificaciones_envio_config"

    id = Column(Integer, primary_key=True, index=True)
    schedule_enabled = Column(Boolean, nullable=False, default=False)
    schedule_hour = Column(Integer, nullable=False, default=9)
    schedule_minute = Column(Integer, nullable=False, default=0)
    n8n_webhook_url = Column(Text, nullable=True)
    n8n_webhook_secret = Column(String(512), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
