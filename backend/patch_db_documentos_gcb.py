"""
Idempotente: crea tabla documentos_gcb y permisos documentos_gcb:view / documentos_gcb:manage;
asigna ambos al rol Administrador si aún no los tiene.

Ejecutar en una BD existente:
  python patch_db_documentos_gcb.py
"""

from app.database import Base, SessionLocal, engine
from app.models.auth import Permission, Role
from app.models.documentos_gcb import DocumentoGcb  # noqa: F401


def ensure_tables() -> None:
    Base.metadata.create_all(bind=engine)


def ensure_permissions_and_admin() -> None:
    db = SessionLocal()
    try:
        data = [
            {"name": "Ver Documentos GCB", "codename": "documentos_gcb:view", "module": "documentos_gcb"},
            {
                "name": "Gestionar Documentos GCB",
                "codename": "documentos_gcb:manage",
                "module": "documentos_gcb",
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
            for code in ("documentos_gcb:view", "documentos_gcb:manage"):
                if code not in have:
                    admin.permissions.append(perms[code])
        db.commit()
    finally:
        db.close()


def main() -> None:
    print(">>> Patching DB: documentos_gcb + permisos")
    ensure_tables()
    ensure_permissions_and_admin()
    print(">>> Patch Documentos GCB completado.")


if __name__ == "__main__":
    main()
