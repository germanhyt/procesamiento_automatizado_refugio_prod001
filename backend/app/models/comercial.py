from sqlalchemy import Column, Integer, String, DateTime, Index
from sqlalchemy.sql import func

from app.database import Base


class ComercialReserva(Base):
    __tablename__ = "comercial_reservas"

    id = Column(Integer, primary_key=True, index=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    nombres = Column(String(200), nullable=False, index=True)
    celular = Column(String(20), nullable=False, index=True)
    cantidad_personas = Column(Integer, nullable=False)
    fecha_reserva = Column(String(20), nullable=False)
    hora_reserva = Column(String(10), nullable=False)
    estado = Column(String(20), nullable=False, default="pendiente", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_comercial_reservas_estado_fecha", "estado", "fecha_creacion"),)


class ComercialEvento(Base):
    __tablename__ = "comercial_eventos"

    id = Column(Integer, primary_key=True, index=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    nombres = Column(String(200), nullable=False, index=True)
    razon_social = Column(String(200), nullable=True)
    celular = Column(String(20), nullable=False, index=True)
    tipo_evento = Column(String(50), nullable=False, index=True)
    cantidad_personas = Column(Integer, nullable=False)
    fecha_tentativa = Column(String(20), nullable=False)
    estado = Column(String(20), nullable=False, default="pendiente", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_comercial_eventos_estado_tipo", "estado", "tipo_evento"),)
