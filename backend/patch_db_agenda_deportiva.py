"""
Idempotente: crea tablas agenda_deportiva y permisos agenda_deportiva:view / agenda_deportiva:manage;
asigna ambos al rol Administrador si aún no los tiene.

Ejecutar en una BD existente:
  python patch_db_agenda_deportiva.py
"""

from app.database import Base, SessionLocal, engine
from app.models.auth import Permission, Role
from app.models.agenda_deportiva import (  # noqa: F401
    AgendaConfig,
    AgendaProgramacion,
    AgendaSlide,
    AgendaTrack,
)
from app.services.agenda_deportiva_service import get_or_create_config


def ensure_tables() -> None:
    Base.metadata.create_all(bind=engine)


def ensure_permissions_and_admin() -> None:
    db = SessionLocal()
    try:
        data = [
            {"name": "Ver Agenda Deportiva", "codename": "agenda_deportiva:view", "module": "agenda_deportiva"},
            {
                "name": "Gestionar Agenda Deportiva",
                "codename": "agenda_deportiva:manage",
                "module": "agenda_deportiva",
            },
        ]
        perms = {}
        for p in data:
            row = db.query(Permission).filter(Permission.codename == p["codename"]).first()
            if not row:
                row = Permission(**p)
                db.add(row)
                db.flush()
            perms[p["codename"]] = row
        db.commit()

        admin = db.query(Role).filter(Role.name == "Administrador").first()
        if admin:
            have = {x.codename for x in admin.permissions}
            for code in ("agenda_deportiva:view", "agenda_deportiva:manage"):
                if code not in have:
                    admin.permissions.append(perms[code])
        db.commit()
    finally:
        db.close()


def ensure_default_config() -> None:
    db = SessionLocal()
    try:
        get_or_create_config(db)
    finally:
        db.close()


def main() -> None:
    print(">>> Patching DB: agenda_deportiva + permisos")
    ensure_tables()
    ensure_permissions_and_admin()
    ensure_default_config()
    print(">>> Patch Agenda Deportiva completado.")


if __name__ == "__main__":
    main()
