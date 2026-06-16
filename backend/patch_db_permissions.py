"""
Sincroniza permisos RBAC con el catálogo actual (módulos nuevos + dashboard:view).
Ejecutar desde backend/: python patch_db_permissions.py
"""
from app.database import SessionLocal
from app.core.permissions_catalog import (
    ALL_PERMISSIONS,
    ensure_admin_and_operador_roles,
    upsert_permissions,
)


def main() -> None:
    db = SessionLocal()
    try:
        print(f">>> Sincronizando {len(ALL_PERMISSIONS)} permisos...")
        perms = upsert_permissions(db)
        ensure_admin_and_operador_roles(db, perms)
        print(">>> Permisos actualizados (Administrador: todos; Operador: legacy + dashboard).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
