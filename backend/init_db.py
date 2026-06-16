from app.database import SessionLocal, engine, Base
from app.models.auth import User, Role, Permission
from app.models.delivery import Restaurant, Order, DriverArrival, DeliveryConfig  # noqa: F401
from app.models.comercial import ComercialReserva, ComercialEvento  # noqa: F401 — registra tablas en metadata
from app.models.documentos_gcb import DocumentoGcb  # noqa: F401 — registra tablas en metadata
from app.models.agenda_deportiva import (  # noqa: F401
    AgendaConfig,
    AgendaProgramacion,
    AgendaSlide,
    AgendaTrack,
)
from app.models.sales_staging import StgSales  # noqa: F401
from app.models.realizadas_staging import StgRealizada  # noqa: F401
from app.core.security import get_password_hash
from app.core.permissions_catalog import (
    ALL_PERMISSIONS,
    ensure_admin_and_operador_roles,
    upsert_permissions,
)
import sys

def init():
    # Crear tablas
    print(">>> Creando tablas en PostgreSQL...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # 1. Crear Permisos Básicos
    print(">>> Creando permisos...")
    perms_map = upsert_permissions(db)
    perms = list(perms_map.values())

    # 2. Crear Roles
    print(">>> Creando roles...")
    admin_role = db.query(Role).filter(Role.name == "Administrador").first()
    if not admin_role:
        admin_role = Role(name="Administrador", description="Acceso total al sistema")
        admin_role.permissions = perms # All perms
        db.add(admin_role)
    
    op_role = db.query(Role).filter(Role.name == "Operador").first()
    if not op_role:
        from app.core.permissions_catalog import OPERADOR_PERMISSION_CODENAMES
        op_role = Role(name="Operador", description="Solo procesos de carga")
        op_role.permissions = [p for p in perms if p.codename in OPERADOR_PERMISSION_CODENAMES]
        db.add(op_role)

    ensure_admin_and_operador_roles(db, perms_map)

    # 3. Crear Superuser Inicial
    print(">>> Creando superusuario inicial...")
    admin_user = db.query(User).filter(User.username == "admin").first()
    if not admin_user:
        admin_user = User(
            username="admin",
            email="admin@refugio.com",
            hashed_password=get_password_hash("admin123"),
            is_active=True,
            is_superuser=True
        )
        admin_user.roles = [admin_role]
        db.add(admin_user)
        print("!!! USUARIO CREADO: admin / admin123")
    else:
        print("--- El usuario admin ya existe.")
    
    db.commit()
    db.close()
    print(">>> Inicialización completada con éxito.")

if __name__ == "__main__":
    init()
