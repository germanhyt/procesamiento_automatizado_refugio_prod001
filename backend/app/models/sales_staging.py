# -*- coding: utf-8 -*-
"""Staging de ventas (reemplazo progresivo de la hoja sales_df en Excel)."""
from sqlalchemy import Column, Date, DateTime, Float, Index, Integer, Numeric, String
from sqlalchemy.sql import func

from app.database import Base


class StgSales(Base):
    __tablename__ = "stg_sales"

    id = Column(Integer, primary_key=True, index=True)
    codigo_negocio = Column(String(64), nullable=False, index=True)
    fecha = Column(Date, nullable=True, index=True)
    hora = Column(String(32), nullable=True)
    producto = Column(String(512), nullable=True)
    cliente = Column(String(256), nullable=True)
    monto = Column(Numeric(18, 4), nullable=False, default=0)
    cantidad = Column(Integer, nullable=True, default=1)
    codigo_transaccion = Column(String(128), nullable=True, default="-")
    fecha_hora = Column(String(32), nullable=True, index=True)
    estado = Column(Float, nullable=True, default=0)
    fecha_carga = Column(String(16), nullable=True)
    codigo_ubicacion = Column(String(64), nullable=True)
    estado_negocio = Column(String(32), nullable=True)
    tipo_negocio = Column(String(64), nullable=True)
    area = Column(String(64), nullable=True)
    forma_pago = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index(
            "ix_stg_sales_natural_key",
            "codigo_negocio",
            "fecha_hora",
            "codigo_transaccion",
            "monto",
            unique=True,
        ),
    )
