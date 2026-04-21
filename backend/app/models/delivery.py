from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.auth import User


class Restaurant(Base):
    __tablename__ = "delivery_restaurants"

    id = Column(Integer, primary_key=True, index=True)
    fidelio_id = Column(String(64), unique=True, index=True, nullable=False)
    nombre = Column(String(150), nullable=False)
    # Fidelio option A: fidelio_id = "A03_BARRIO_MANCORA"
    codigo_negocio = Column(String(10), nullable=True, index=True)  # "A03", "IS01", "L17"
    codigo_comunicacion = Column(String(200), nullable=True, index=True)  # "A03 - Barrio Mancora"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    orders = relationship("Order", back_populates="restaurant")
    notification_emails = relationship(
        "RestaurantNotificationEmail",
        back_populates="restaurant",
        cascade="all, delete-orphan",
    )


class RestaurantNotificationEmail(Base):
    """Correos por restaurante/locatario (notificaciones, n8n, etc.)."""

    __tablename__ = "delivery_restaurant_notification_emails"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_id = Column(Integer, ForeignKey("delivery_restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    restaurant = relationship("Restaurant", back_populates="notification_emails")

    __table_args__ = (
        UniqueConstraint("restaurant_id", "email", name="uq_delivery_restaurant_notification_email"),
    )


class Order(Base):
    __tablename__ = "delivery_orders"

    id = Column(Integer, primary_key=True, index=True)

    restaurant_id = Column(Integer, ForeignKey("delivery_restaurants.id", ondelete="RESTRICT"), nullable=False, index=True)
    plataforma = Column(String(30), nullable=False, index=True)
    codigo_pedido = Column(String(80), nullable=False, index=True)

    estado = Column(String(40), nullable=False, index=True)  # LISTO, PROCESO_ENTREGA, ...
    numero_bolsas = Column(Integer, nullable=True)

    locked_by_runner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    locked_by_runner = relationship(User, foreign_keys=[locked_by_runner_id])

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    estado_changed_at = Column(DateTime(timezone=True), nullable=True)

    listo_at = Column(DateTime(timezone=True), nullable=True)
    match_at = Column(DateTime(timezone=True), nullable=True)
    recogido_at = Column(DateTime(timezone=True), nullable=True)
    entregado_at = Column(DateTime(timezone=True), nullable=True)
    cancelado_at = Column(DateTime(timezone=True), nullable=True)
    devolucion_at = Column(DateTime(timezone=True), nullable=True)

    restaurant = relationship("Restaurant", back_populates="orders")
    matched_driver_arrival = relationship("DriverArrival", back_populates="matched_order", uselist=False)

    @property
    def matched_driver_arrival_id(self) -> int | None:
        return self.matched_driver_arrival.id if self.matched_driver_arrival else None

    __table_args__ = (
        Index("ix_delivery_orders_plataforma_estado", "plataforma", "estado"),
    )


class DriverArrival(Base):
    __tablename__ = "delivery_driver_arrivals"

    id = Column(Integer, primary_key=True, index=True)

    plataforma = Column(String(30), nullable=False, index=True)
    placa = Column(String(20), nullable=True)
    alias_conductor = Column(String(120), nullable=True)
    codigo_ingresado = Column(String(80), nullable=False, index=True)
    restaurant_id = Column(Integer, ForeignKey("delivery_restaurants.id", ondelete="SET NULL"), nullable=True, index=True)
    conductor_documento_tipo = Column(String(8), nullable=True)
    conductor_dni = Column(String(20), nullable=True)
    conductor_carne_extranjeria = Column(String(32), nullable=True)
    conductor_nombre_completo = Column(String(220), nullable=True)
    foto_path = Column(String(512), nullable=True)
    foto_mime = Column(String(64), nullable=True)
    foto_uploaded_at = Column(DateTime(timezone=True), nullable=True)

    estado = Column(String(40), nullable=False, index=True)  # ESPERANDO, EN_MATCH, ...

    matched_order_id = Column(Integer, ForeignKey("delivery_orders.id", ondelete="SET NULL"), nullable=True, unique=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    estado_changed_at = Column(DateTime(timezone=True), nullable=True)

    atendido_at = Column(DateTime(timezone=True), nullable=True)
    despachado_at = Column(DateTime(timezone=True), nullable=True)

    matched_order = relationship("Order", back_populates="matched_driver_arrival")
    restaurant = relationship("Restaurant", foreign_keys=[restaurant_id])

    __table_args__ = (
        Index("ix_delivery_driver_arrivals_plataforma_estado", "plataforma", "estado"),
        UniqueConstraint("matched_order_id", name="uq_delivery_driver_arrivals_matched_order_id"),
    )


class DeliveryConfig(Base):
    """Singleton id=1: configuración operativa delivery (kiosk, Runner, etc.)."""

    __tablename__ = "delivery_config"

    id = Column(Integer, primary_key=True, index=True)
    enable_driver_dni_lookup = Column(Boolean, nullable=False, default=False)
    enable_driver_photo_capture = Column(Boolean, nullable=False, default=False)
    enable_runner_simulate_order_ready = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DeliveryRunnerPushToken(Base):
    """
    Tokens Expo Push del app Runner (un registro por dispositivo; expo_push_token es único).
    """

    __tablename__ = "delivery_runner_push_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expo_push_token = Column(String(512), unique=True, nullable=False, index=True)
    platform = Column(String(16), nullable=False, default="unknown")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RunnerNotification(Base):
    """
    Historial de avisos operativos para usuarios Runner (misma audiencia que push).
    """

    __tablename__ = "delivery_runner_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(40), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(String(500), nullable=False)
    order_id = Column(Integer, ForeignKey("delivery_orders.id", ondelete="SET NULL"), nullable=True, index=True)
    driver_arrival_id = Column(
        Integer, ForeignKey("delivery_driver_arrivals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dedupe_key = Column(String(120), nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_delivery_runner_notifications_user_dedupe"),
        Index("ix_delivery_runner_notifications_user_created", "user_id", "created_at"),
    )
