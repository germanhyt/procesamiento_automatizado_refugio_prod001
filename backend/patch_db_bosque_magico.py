"""
Idempotente: tablas bosque_magico_* + permisos bosque_magico:view / bosque_magico:manage;
semilla bosque_magico_config; asigna permisos al rol Administrador.

  cd backend && python patch_db_bosque_magico.py
"""

from app.data.bosque_magico_seed import seed_bosque_magico_config_if_missing
from app.database import SessionLocal, engine, Base
from app.models.auth import Permission, Role
from app.models.bosque_magico import BosqueMagicoConfig, BosqueMagicoLead  # noqa: F401


def ensure_tables() -> None:
    Base.metadata.create_all(bind=engine)


def ensure_permissions_and_admin() -> None:
    db = SessionLocal()
    try:
        data = [
            {"name": "Ver Bosque Mágico", "codename": "bosque_magico:view", "module": "bosque_magico"},
            {
                "name": "Gestionar Bosque Mágico",
                "codename": "bosque_magico:manage",
                "module": "bosque_magico",
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
            for code in ("bosque_magico:view", "bosque_magico:manage"):
                if code not in have:
                    admin.permissions.append(perms[code])
        db.commit()
    finally:
        db.close()


def seed_config() -> None:
    db = SessionLocal()
    try:
        n = seed_bosque_magico_config_if_missing(db)
        if n:
            db.commit()
            print(f">>> Seed bosque_magico_config: +{n} filas.")
        else:
            print(">>> Seed bosque_magico_config: sin cambios (ya existían).")
    finally:
        db.close()


def main() -> None:
    print(">>> Patching DB: bosque_magico_* + permisos")
    ensure_tables()
    ensure_permissions_and_admin()
    seed_config()
    print(">>> Patch Bosque Mágico completado.")


if __name__ == "__main__":
    main()
