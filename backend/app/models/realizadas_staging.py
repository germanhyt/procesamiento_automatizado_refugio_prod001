# -*- coding: utf-8 -*-
"""Staging de cargas realizadas (reemplazo progresivo de la hoja Realizadas en Excel)."""
from sqlalchemy import Column, DateTime, Index, Integer, Numeric, String
from sqlalchemy.sql import func

from app.database import Base


class StgRealizada(Base):
    __tablename__ = "stg_realizadas"

    id = Column(Integer, primary_key=True, index=True)
    codigo_negocio = Column(String(64), nullable=False, index=True)
    ruta_archivo = Column(String(512), nullable=True)
    cargar = Column(String(16), nullable=True)
    anadir = Column(String(16), nullable=True)
    fecha_inicio = Column(String(32), nullable=True)
    fecha_fin = Column(String(32), nullable=True)
    fecha_transaccion = Column(String(32), nullable=True)
    fecha_inicio_display = Column(String(32), nullable=True)
    fecha_fin_display = Column(String(32), nullable=True)
    ventas_totales = Column(Numeric(18, 4), nullable=False, default=0)
    fecha_procesamiento_web = Column(String(32), nullable=True, index=True)
    bq_sincronizado = Column(Integer, nullable=False, default=0, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index(
            "ix_stg_realizadas_negocio_periodo",
            "codigo_negocio",
            "fecha_inicio",
            "fecha_fin",
            unique=True,
        ),
    )
