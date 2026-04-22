from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class DocumentoGcb(Base):
    __tablename__ = "documentos_gcb"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(120), nullable=False, unique=True, index=True)
    nombre = Column(String(255), nullable=False, index=True)
    coleccion = Column(String(80), nullable=False, index=True)
    categoria = Column(String(120), nullable=False, index=True)
    subcategoria = Column(String(120), nullable=True, index=True)
    descripcion = Column(Text, nullable=True)

    archivo_nombre_original = Column(String(255), nullable=False)
    archivo_nombre_actual = Column(String(255), nullable=False)
    archivo_ruta = Column(String(512), nullable=False)
    mime_type = Column(String(120), nullable=False)
    extension = Column(String(16), nullable=False)
    tamano_bytes = Column(Integer, nullable=False)

    activo = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_documentos_gcb_coleccion_categoria", "coleccion", "categoria"),
        Index("ix_documentos_gcb_activo_updated", "activo", "updated_at"),
    )
