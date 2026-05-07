"""
Idempotente: crea tablas sisa_reservas_* y permisos sisa_reservas:view / sisa_reservas:manage;
asigna ambos al rol Administrador si aún no los tiene.

Ejecutar en una BD existente:
  python patch_db_sisa_reservas.py
"""

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models.auth import Permission, Role
from app.models.sisa_reservas import (  # noqa: F401
    SisaReservaMesa,
    SisaReservaRegistro,
    SisaReservaZona,
    SisaReservasNotificacionesConfig,
)


def ensure_tables() -> None:
    Base.metadata.create_all(bind=engine)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE sisa_reservas_registros "
                    "ADD COLUMN IF NOT EXISTS proximity_webhook_sent_at TIMESTAMPTZ"
                )
            )
    except Exception:
        pass


def ensure_permissions_and_admin() -> None:
    db = SessionLocal()
    try:
        data = [
            {"name": "Ver Reservas Sisa", "codename": "sisa_reservas:view", "module": "sisa_reservas"},
            {
                "name": "Gestionar Reservas Sisa",
                "codename": "sisa_reservas:manage",
                "module": "sisa_reservas",
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
            for code in ("sisa_reservas:view", "sisa_reservas:manage"):
                if code not in have:
                    admin.permissions.append(perms[code])
        db.commit()
    finally:
        db.close()


def main() -> None:
    print(">>> Patching DB: sisa_reservas_* + permisos")
    ensure_tables()
    ensure_permissions_and_admin()
    print(">>> Patch Reservas Sisa completado.")


if __name__ == "__main__":
    main()
