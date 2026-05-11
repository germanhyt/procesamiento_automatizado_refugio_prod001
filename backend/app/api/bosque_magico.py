from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.deps.public_bosque_rate_limit import enforce_public_bosque_lead_rate_limit
from app.models.auth import User
from app.models.bosque_magico import BosqueMagicoConfig, BosqueMagicoLead
from app.schemas.bosque_magico import (
    BosqueMagicoConfigOut,
    BosqueMagicoConfigPatchIn,
    BosqueMagicoLeadCreate,
    BosqueMagicoLeadListOut,
    BosqueMagicoLeadOut,
    BosqueMagicoLeadPatch,
    BosqueMagicoPublicLeadIn,
    BosqueMagicoPublicLeadOut,
)

router = APIRouter(prefix="/bosque-magico", tags=["Bosque Mágico"])
# POST /leads: cuerpo { eventDetails, items, totals } según landing QuoteForm (sin JWT).
public_router = APIRouter(prefix="/public/bosque-magico", tags=["Bosque Mágico Público"])

DEFAULT_LIMIT = 50
# Alineado con listados tipo Comercial/Sisa (SPA pide hasta 500 para paginar en cliente).
MAX_LIMIT = 500


def _user_has_permission(user: User, codename: str) -> bool:
    try:
        for role in getattr(user, "roles", []) or []:
            for perm in getattr(role, "permissions", []) or []:
                if getattr(perm, "codename", None) == codename:
                    return True
    except Exception:
        return False
    return False


def _require_view(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, "bosque_magico:view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos")


def _require_manage(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, "bosque_magico:manage"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos de gestión Bosque Mágico",
        )


def _parse_iso_date(raw: Optional[str]) -> Optional[date]:
    if not raw or not str(raw).strip():
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _parse_int_children(raw: Optional[str]) -> Optional[int]:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return int(str(raw).strip(), 10)
    except ValueError:
        return None


def _snapshot_from_public(body: BosqueMagicoPublicLeadIn) -> Dict[str, Any]:
    return {
        "eventDetails": body.eventDetails,
        "items": body.items,
        "totals": body.totals,
    }


def _lead_from_public_payload(body: BosqueMagicoPublicLeadIn) -> BosqueMagicoLead:
    d = body.eventDetails or {}
    contact_name = str(d.get("clienteNombre") or "").strip() or "Sin nombre"
    phone = str(d.get("celular") or "").strip()
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El celular es obligatorio",
        )
    email_raw = str(d.get("correo") or "").strip()
    email = email_raw if email_raw else None
    tentative = _parse_iso_date(d.get("fechaEvento"))
    shift = str(d.get("turno") or "").strip() or None
    est = _parse_int_children(d.get("ninos"))
    snapshot = _snapshot_from_public(body)
    return BosqueMagicoLead(
        contact_name=contact_name,
        phone=phone,
        email=email,
        channel="landing",
        source_detail="landing-bosque-magico",
        tentative_event_date=tentative,
        shift=shift,
        estimated_children=est,
        status="Nuevo",
        notes=None,
        payload_snapshot=snapshot,
    )


# --- Config (panel) ---


@router.get("/config", response_model=List[BosqueMagicoConfigOut])
def list_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    rows = db.query(BosqueMagicoConfig).order_by(BosqueMagicoConfig.config_key.asc()).all()
    return rows


@router.patch("/config", response_model=List[BosqueMagicoConfigOut])
def patch_config(
    body: BosqueMagicoConfigPatchIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    out: List[BosqueMagicoConfig] = []
    for item in body.items:
        row = db.query(BosqueMagicoConfig).filter(BosqueMagicoConfig.config_key == item.config_key).first()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Clave de configuración no encontrada: {item.config_key}",
            )
        row.value = item.value
        out.append(row)
    db.commit()
    for r in out:
        db.refresh(r)
    return db.query(BosqueMagicoConfig).order_by(BosqueMagicoConfig.config_key.asc()).all()


# --- Leads (panel) ---


@router.get("/leads", response_model=BosqueMagicoLeadListOut)
def list_leads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    status: Optional[str] = None,
    channel: Optional[str] = None,
    buscar: Optional[str] = None,
):
    _require_view(current_user)
    q = db.query(BosqueMagicoLead)
    if status:
        q = q.filter(BosqueMagicoLead.status == status)
    if channel:
        q = q.filter(BosqueMagicoLead.channel == channel)
    if buscar:
        term = f"%{buscar.strip()}%"
        q = q.filter(
            (BosqueMagicoLead.contact_name.ilike(term))
            | (BosqueMagicoLead.phone.ilike(term))
            | (BosqueMagicoLead.email.ilike(term))
        )
    total = q.count()
    rows = (
        q.order_by(BosqueMagicoLead.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return BosqueMagicoLeadListOut(
        items=[BosqueMagicoLeadOut.from_orm(r) for r in rows],
        total=int(total),
    )


@router.get("/leads/{lead_id}", response_model=BosqueMagicoLeadOut)
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    row = db.query(BosqueMagicoLead).filter(BosqueMagicoLead.id == lead_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead no encontrado")
    return row


@router.post("/leads", response_model=BosqueMagicoLeadOut, status_code=status.HTTP_201_CREATED)
def create_lead_manual(
    body: BosqueMagicoLeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = BosqueMagicoLead(
        contact_name=body.contact_name,
        phone=body.phone,
        email=body.email,
        channel=body.channel or "manual",
        source_detail=body.source_detail,
        tentative_event_date=body.tentative_event_date,
        shift=body.shift,
        estimated_children=body.estimated_children,
        status=body.status or "Nuevo",
        notes=body.notes,
        payload_snapshot=body.payload_snapshot,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/leads/{lead_id}", response_model=BosqueMagicoLeadOut)
def patch_lead(
    lead_id: int,
    body: BosqueMagicoLeadPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(BosqueMagicoLead).filter(BosqueMagicoLead.id == lead_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead no encontrado")
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


# --- Público: landing ---


@public_router.post("/leads", response_model=BosqueMagicoPublicLeadOut, status_code=status.HTTP_201_CREATED)
def create_lead_from_landing(
    request: Request,
    body: BosqueMagicoPublicLeadIn,
    db: Session = Depends(get_db),
):
    enforce_public_bosque_lead_rate_limit(request)
    row = _lead_from_public_payload(body)
    db.add(row)
    db.commit()
    db.refresh(row)
    total = None
    if isinstance(body.totals, dict):
        total = body.totals.get("grandTotal")
    return BosqueMagicoPublicLeadOut(id=row.id, data={"total": total} if total is not None else None)
