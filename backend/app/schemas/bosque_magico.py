from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class BosqueMagicoConfigOut(BaseModel):
    id: int
    config_key: str
    value: Any
    description: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True
        from_attributes = True


class BosqueMagicoConfigUpdateItem(BaseModel):
    config_key: str = Field(..., max_length=190)
    value: Any


class BosqueMagicoConfigPatchIn(BaseModel):
    items: List[BosqueMagicoConfigUpdateItem]


class BosqueMagicoLeadOut(BaseModel):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    contact_name: str
    phone: str
    email: Optional[str] = None
    channel: str
    source_detail: Optional[str] = None
    tentative_event_date: Optional[date] = None
    shift: Optional[str] = None
    estimated_children: Optional[int] = None
    status: str
    notes: Optional[str] = None
    payload_snapshot: Optional[Dict[str, Any]] = None

    class Config:
        orm_mode = True
        from_attributes = True


class BosqueMagicoLeadListOut(BaseModel):
    items: List[BosqueMagicoLeadOut]
    total: int


class BosqueMagicoLeadCreate(BaseModel):
    contact_name: str = Field(..., max_length=200)
    phone: str = Field(..., max_length=40)
    email: Optional[str] = Field(None, max_length=255)
    channel: str = Field(default="manual", max_length=40)
    source_detail: Optional[str] = None
    tentative_event_date: Optional[date] = None
    shift: Optional[str] = Field(None, max_length=120)
    estimated_children: Optional[int] = Field(None, ge=0, le=200)
    status: str = Field(default="Nuevo", max_length=40)
    notes: Optional[str] = None
    payload_snapshot: Optional[Dict[str, Any]] = None


class BosqueMagicoLeadPatch(BaseModel):
    status: Optional[str] = Field(None, max_length=40)
    notes: Optional[str] = None
    contact_name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=40)
    email: Optional[str] = Field(None, max_length=255)
    tentative_event_date: Optional[date] = None
    shift: Optional[str] = Field(None, max_length=120)
    estimated_children: Optional[int] = Field(None, ge=0, le=200)
    source_detail: Optional[str] = None


class BosqueMagicoPublicLeadIn(BaseModel):
    """Cuerpo enviado por la landing (QuoteForm + store)."""

    eventDetails: Dict[str, Any]
    items: List[Dict[str, Any]] = Field(default_factory=list)
    totals: Dict[str, Any] = Field(default_factory=dict)


class BosqueMagicoPublicLeadOut(BaseModel):
    ok: bool = True
    id: int
    message: str = "Registrado correctamente"
    data: Optional[Dict[str, Any]] = None
