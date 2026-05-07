from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Time, Float, Boolean, Index, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class SisaReservaZona(Base):
    __tablename__ = "sisa_reservas_zonas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(80), nullable=False, index=True)
    color = Column(String(32), nullable=True)
    pos_x = Column(Float, nullable=False, default=0.0)
    pos_y = Column(Float, nullable=False, default=0.0)
    width = Column(Float, nullable=False, default=100.0)
    height = Column(Float, nullable=False, default=100.0)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    mesas = relationship("SisaReservaMesa", back_populates="zona", cascade="all, delete-orphan")


class SisaReservaMesa(Base):
    __tablename__ = "sisa_reservas_mesas"

    id = Column(Integer, primary_key=True, index=True)
    zona_id = Column(Integer, ForeignKey("sisa_reservas_zonas.id", ondelete="CASCADE"), nullable=False, index=True)
    numero = Column(String(32), nullable=False)
    pos_x = Column(Float, nullable=False, default=0.0)
    pos_y = Column(Float, nullable=False, default=0.0)
    capacidad = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    zona = relationship("SisaReservaZona", back_populates="mesas")
    reservas = relationship("SisaReservaRegistro", back_populates="mesa")

    __table_args__ = (
        UniqueConstraint("zona_id", "numero", name="uq_sisa_reservas_mesas_zona_numero"),
        Index("ix_sisa_reservas_mesas_zona_activa", "zona_id", "is_active"),
    )


class SisaReservaRegistro(Base):
    __tablename__ = "sisa_reservas_registros"

    id = Column(Integer, primary_key=True, index=True)
    fecha_reserva = Column(Date, nullable=False, index=True)
    hora_reserva = Column(Time, nullable=False, index=True)
    motivo_reserva = Column(String(80), nullable=False, index=True)
    numero_personas = Column(Integer, nullable=False)
    zona_id = Column(Integer, ForeignKey("sisa_reservas_zonas.id", ondelete="RESTRICT"), nullable=False, index=True)
    mesa_id = Column(Integer, ForeignKey("sisa_reservas_mesas.id", ondelete="SET NULL"), nullable=True, index=True)
    nombre_completo = Column(String(220), nullable=False, index=True)
    codigo_telefonico = Column(String(8), nullable=False, default="+51")
    numero_telefono = Column(String(32), nullable=False)
    email = Column(String(255), nullable=True)
    comentario = Column(String(2000), nullable=True)
    estado = Column(String(40), nullable=False, default="pendiente", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    proximity_webhook_sent_at = Column(DateTime(timezone=True), nullable=True)

    zona = relationship("SisaReservaZona", foreign_keys=[zona_id])
    mesa = relationship("SisaReservaMesa", back_populates="reservas", foreign_keys=[mesa_id])

    __table_args__ = (
        Index("ix_sisa_reservas_registros_fecha_hora", "fecha_reserva", "hora_reserva"),
        Index("ix_sisa_reservas_registros_estado_fecha", "estado", "fecha_reserva"),
    )


class SisaReservasNotificacionesConfig(Base):
    """Singleton id=1: webhook n8n y envío periódico de avisos de reservas próximas (Sisa)."""

    __tablename__ = "sisa_reservas_notificaciones_config"

    id = Column(Integer, primary_key=True, index=True)
    schedule_enabled = Column(Boolean, nullable=False, default=False)
    schedule_interval_minutes = Column(Integer, nullable=False, default=15)
    anticipation_minutes = Column(Integer, nullable=False, default=120)
    include_confirmados = Column(Boolean, nullable=False, default=False)
    n8n_webhook_url = Column(Text, nullable=True)
    n8n_webhook_secret = Column(String(512), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
