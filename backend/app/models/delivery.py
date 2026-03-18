from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(Integer, primary_key=True, index=True)
    fidelio_id = Column(String(64), unique=True, index=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    # Fidelio option A: fidelio_id = "A03_BARRIO_MANCORA"
    codigo_negocio = Column(String(10), nullable=True, index=True)  # "A03", "IS01", "L17"
    codigo_comunicacion = Column(String(200), nullable=True, index=True)  # "A03 - Barrio Mancora"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    orders = relationship("Order", back_populates="restaurant")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    restaurant_id = Column(Integer, ForeignKey("restaurants.id", ondelete="RESTRICT"), nullable=False, index=True)
    plataforma = Column(String(30), nullable=False, index=True)
    codigo_pedido = Column(String(80), nullable=False, index=True)

    estado = Column(String(40), nullable=False, index=True)  # LISTO, PROCESO_ENTREGA, ...
    numero_bolsas = Column(Integer, nullable=True)

    locked_by_runner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    estado_changed_at = Column(DateTime(timezone=True), nullable=True)

    restaurant = relationship("Restaurant", back_populates="orders")
    matched_driver_arrival = relationship("DriverArrival", back_populates="matched_order", uselist=False)

    __table_args__ = (
        Index("ix_orders_plataforma_estado", "plataforma", "estado"),
    )


class DriverArrival(Base):
    __tablename__ = "driver_arrivals"

    id = Column(Integer, primary_key=True, index=True)

    plataforma = Column(String(30), nullable=False, index=True)
    placa = Column(String(20), nullable=True)
    codigo_ingresado = Column(String(80), nullable=False, index=True)

    estado = Column(String(40), nullable=False, index=True)  # ESPERANDO, EN_MATCH, ...

    matched_order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, unique=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    estado_changed_at = Column(DateTime(timezone=True), nullable=True)

    matched_order = relationship("Order", back_populates="matched_driver_arrival")

    __table_args__ = (
        Index("ix_driver_arrivals_plataforma_estado", "plataforma", "estado"),
        UniqueConstraint("matched_order_id", name="uq_driver_arrivals_matched_order_id"),
    )

