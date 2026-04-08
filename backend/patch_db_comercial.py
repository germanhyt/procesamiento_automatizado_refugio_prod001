"""
Idempotente: crea tablas comercial_* y permisos comercial:view / comercial:manage;
asigna ambos al ámbito del rol Administrador si aún no los tiene.
Ejecutar tras desplegar el módulo comercial en una BD existente:
  python patch_db_comercial.py
"""

from app.database import SessionLocal, engine, Base
from app.models.auth import Permission, Role
from app.models.comercial import ComercialReserva, ComercialEvento  # noqa: F401
from app.data.comercial_patch_seed import seed_comercial_batch_if_missing


def ensure_tables() -> None:
    Base.metadata.create_all(bind=engine)


def ensure_permissions_and_admin() -> None:
    db = SessionLocal()
    try:
        data = [
            {"name": "Ver Comercial", "codename": "comercial:view", "module": "comercial"},
            {"name": "Gestionar Comercial", "codename": "comercial:manage", "module": "comercial"},
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
            for code in ("comercial:view", "comercial:manage"):
                if code not in have:
                    admin.permissions.append(perms[code])
        db.commit()
    finally:
        db.close()


def seed_demo_rows() -> None:
    """Inserta por lotes reservas/eventos de ejemplo si no existen (idempotente)."""
    db = SessionLocal()
    try:
        n_r, n_e = seed_comercial_batch_if_missing(db)
        if n_r or n_e:
            print(f">>> Seed comercial: +{n_r} reservas, +{n_e} eventos nuevos.")
        else:
            print(">>> Seed comercial: sin filas nuevas (ya estaban o TSV vacío).")
    finally:
        db.close()


def main() -> None:
    print(">>> Patching DB: comercial_reservas, comercial_eventos + permisos")
    ensure_tables()
    ensure_permissions_and_admin()
    seed_demo_rows()
    print(">>> Patch comercial completado.")


if __name__ == "__main__":
    main()
