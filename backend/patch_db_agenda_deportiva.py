"""
Idempotente: crea tablas agenda_deportiva y permisos agenda_deportiva:view / agenda_deportiva:manage;
asigna ambos al rol Administrador si aún no los tiene.

Ejecutar en una BD existente:
  python patch_db_agenda_deportiva.py
"""

from sqlalchemy import text

from app.core.agenda_deportiva_constants import AGENDA_CATEGORIA_LUGAR_PLAY_BAR
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


def ensure_columns() -> None:
    stmts = [
        "ALTER TABLE IF EXISTS agenda_programacion ADD COLUMN IF NOT EXISTS categoria_lugar VARCHAR(64);",
        "ALTER TABLE IF EXISTS agenda_track ADD COLUMN IF NOT EXISTS categoria_lugar VARCHAR(64);",
    ]
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))

        # Backfill para filas antiguas y fortalecimiento de constraints.
        conn.execute(
            text(
                "UPDATE agenda_programacion SET categoria_lugar = :default "
                "WHERE categoria_lugar IS NULL OR trim(categoria_lugar) = '';"
            ),
            {"default": AGENDA_CATEGORIA_LUGAR_PLAY_BAR},
        )
        conn.execute(
            text(
                "UPDATE agenda_track SET categoria_lugar = :default "
                "WHERE categoria_lugar IS NULL OR trim(categoria_lugar) = '';"
            ),
            {"default": AGENDA_CATEGORIA_LUGAR_PLAY_BAR},
        )
        conn.execute(
            text(
                "ALTER TABLE IF EXISTS agenda_programacion "
                f"ALTER COLUMN categoria_lugar SET DEFAULT '{AGENDA_CATEGORIA_LUGAR_PLAY_BAR}';"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE IF EXISTS agenda_track "
                f"ALTER COLUMN categoria_lugar SET DEFAULT '{AGENDA_CATEGORIA_LUGAR_PLAY_BAR}';"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE IF EXISTS agenda_programacion "
                "ALTER COLUMN categoria_lugar SET NOT NULL;"
            )
        )
        conn.execute(
            text("ALTER TABLE IF EXISTS agenda_track ALTER COLUMN categoria_lugar SET NOT NULL;")
        )


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
    ensure_columns()
    ensure_permissions_and_admin()
    ensure_default_config()
    print(">>> Patch Agenda Deportiva completado.")


if __name__ == "__main__":
    main()
