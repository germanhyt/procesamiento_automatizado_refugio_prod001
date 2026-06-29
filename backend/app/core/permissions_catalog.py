"""Catálogo canónico de permisos RBAC (init_db + patches)."""
from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from app.models.auth import Permission, Role

# module → permisos expuestos en UI de roles
ALL_PERMISSIONS: list[dict[str, str]] = [
    {"name": "Ver Dashboard", "codename": "dashboard:view", "module": "core"},
    {"name": "Configurador Sistema", "codename": "system:config", "module": "core"},
    {"name": "Procesar Legacy", "codename": "legacy:process", "module": "legacy"},
    {"name": "Gestionar Usuarios", "codename": "users:manage", "module": "users"},
    {"name": "Ver Comercial", "codename": "comercial:view", "module": "comercial"},
    {"name": "Gestionar Comercial", "codename": "comercial:manage", "module": "comercial"},
    {"name": "Ver Documentos GCB", "codename": "documentos_gcb:view", "module": "documentos_gcb"},
    {"name": "Gestionar Documentos GCB", "codename": "documentos_gcb:manage", "module": "documentos_gcb"},
    {"name": "Ver Agenda Deportiva", "codename": "agenda_deportiva:view", "module": "agenda_deportiva"},
    {"name": "Gestionar Agenda Deportiva", "codename": "agenda_deportiva:manage", "module": "agenda_deportiva"},
    {"name": "Ver Delivery", "codename": "delivery:view", "module": "delivery"},
    {"name": "Operar Delivery", "codename": "delivery:operate", "module": "delivery"},
    {"name": "Administrar Delivery", "codename": "delivery:admin", "module": "delivery"},
    {"name": "Centro de control Delivery", "codename": "delivery:control", "module": "delivery"},
    {
        "name": "Acciones centro de control Delivery",
        "codename": "delivery:control:actions",
        "module": "delivery",
    },
    {"name": "Configurar Kiosk Delivery", "codename": "delivery:settings:update", "module": "delivery"},
    {
        "name": "Simular pedido listo (Runner)",
        "codename": "delivery:simulate_order_ready",
        "module": "delivery",
    },
]

OPERADOR_PERMISSION_CODENAMES = ("legacy:process", "dashboard:view")


def upsert_permissions(db: Session) -> dict[str, Permission]:
    perms: dict[str, Permission] = {}
    for row in ALL_PERMISSIONS:
        perm = db.query(Permission).filter(Permission.codename == row["codename"]).first()
        if not perm:
            perm = Permission(**row)
            db.add(perm)
            db.flush()
        else:
            perm.name = row["name"]
            perm.module = row["module"]
        perms[row["codename"]] = perm
    db.commit()
    return perms


def assign_permissions_to_role(role: Role, codenames: Iterable[str], perms: dict[str, Permission]) -> None:
    have = {p.codename for p in role.permissions}
    for code in codenames:
        if code not in have and code in perms:
            role.permissions.append(perms[code])


def ensure_admin_and_operador_roles(db: Session, perms: dict[str, Permission]) -> None:
    admin_role = db.query(Role).filter(Role.name == "Administrador").first()
    if admin_role:
        assign_permissions_to_role(admin_role, perms.keys(), perms)

    op_role = db.query(Role).filter(Role.name == "Operador").first()
    if op_role:
        assign_permissions_to_role(op_role, OPERADOR_PERMISSION_CODENAMES, perms)

    db.commit()
