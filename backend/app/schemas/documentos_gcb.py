from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DocumentoGcbOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    coleccion: str
    categoria: str
    subcategoria: Optional[str] = None
    descripcion: Optional[str] = None
    archivo_nombre_original: str
    archivo_nombre_actual: str
    archivo_ruta: str
    mime_type: str
    extension: str
    tamano_bytes: int
    activo: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


class DocumentoGcbUpdate(BaseModel):
    nombre: Optional[str] = Field(None, max_length=255)
    subcategoria: Optional[str] = Field(None, max_length=120)
    descripcion: Optional[str] = None
    activo: Optional[bool] = None


class PaginatedDocumentosGcb(BaseModel):
    items: List[DocumentoGcbOut]
    total: int
    skip: int
    limit: int


class ActionResponse(BaseModel):
    ok: bool
    detail: str


class DocumentosGcbZipRequest(BaseModel):
    ids: List[int] = Field(..., min_items=1, max_items=500)
