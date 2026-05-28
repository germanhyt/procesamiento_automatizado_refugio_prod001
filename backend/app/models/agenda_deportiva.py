# -*- coding: utf-8 -*-
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class AgendaConfig(Base):
    """Configuración global de la cartelera (fila única lógica)."""

    __tablename__ = "agenda_config"

    id = Column(Integer, primary_key=True)
    playlist_publica_habilitada = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AgendaProgramacion(Base):
    __tablename__ = "agenda_programacion"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=True)
    modo = Column(String(8), nullable=False, index=True)
    fecha_inicio = Column(Date, nullable=False, index=True)
    fecha_fin = Column(Date, nullable=False, index=True)
    activa = Column(Boolean, nullable=False, default=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    slides = relationship(
        "AgendaSlide",
        back_populates="programacion",
        cascade="all, delete-orphan",
        order_by="AgendaSlide.orden",
    )

    __table_args__ = (
        Index("ix_agenda_programacion_modo_fechas", "modo", "fecha_inicio", "fecha_fin"),
    )


class AgendaSlide(Base):
    __tablename__ = "agenda_slide"

    id = Column(Integer, primary_key=True, index=True)
    programacion_id = Column(Integer, ForeignKey("agenda_programacion.id", ondelete="CASCADE"), nullable=False)
    orden = Column(Integer, nullable=False)
    alt_text = Column(String(255), nullable=True)
    archivo_nombre_original = Column(String(255), nullable=False)
    archivo_ruta = Column(String(512), nullable=False)
    mime_type = Column(String(120), nullable=False)
    extension = Column(String(16), nullable=False)
    tamano_bytes = Column(Integer, nullable=False)
    habilitada = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    programacion = relationship("AgendaProgramacion", back_populates="slides")

    __table_args__ = (
        UniqueConstraint("programacion_id", "orden", name="uq_agenda_slide_programacion_orden"),
        Index("ix_agenda_slide_programacion_habilitada", "programacion_id", "habilitada"),
    )


class AgendaTrack(Base):
    __tablename__ = "agenda_track"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    orden = Column(Integer, nullable=False, unique=True)
    archivo_nombre_original = Column(String(255), nullable=False)
    archivo_ruta = Column(String(512), nullable=False)
    mime_type = Column(String(120), nullable=False)
    extension = Column(String(16), nullable=False)
    tamano_bytes = Column(Integer, nullable=False)
    habilitada = Column(Boolean, nullable=False, default=True, index=True)
    publica = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_agenda_track_publica_habilitada", "publica", "habilitada"),)
