from sqlalchemy import Column, Date, DateTime, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.database import Base


class BosqueMagicoConfig(Base):
    """Clave/valor de parámetros de negocio (no secretos)."""

    __tablename__ = "bosque_magico_config"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(190), unique=True, nullable=False, index=True)
    value = Column(JSONB, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BosqueMagicoLead(Base):
    __tablename__ = "bosque_magico_leads"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    contact_name = Column(String(200), nullable=False, index=True)
    phone = Column(String(40), nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    channel = Column(String(40), nullable=False, index=True)
    source_detail = Column(Text, nullable=True)

    tentative_event_date = Column(Date, nullable=True, index=True)
    shift = Column(String(120), nullable=True)
    estimated_children = Column(Integer, nullable=True)

    status = Column(String(40), nullable=False, default="Nuevo", index=True)
    notes = Column(Text, nullable=True)
    payload_snapshot = Column(JSONB, nullable=True)

    __table_args__ = (Index("ix_bosque_magico_leads_status_created", "status", "created_at"),)
