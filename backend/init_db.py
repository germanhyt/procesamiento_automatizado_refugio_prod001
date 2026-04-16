from app.database import SessionLocal, engine, Base
from app.models.auth import User, Role, Permission
from app.models.delivery import Restaurant, Order, DriverArrival, DeliveryConfig  # noqa: F401
from app.models.comercial import ComercialReserva, ComercialEvento  # noqa: F401 — registra tablas en metadata
from app.core.security import get_password_hash
import sys

def init():
    # Crear tablas
    print(">>> Creando tablas en PostgreSQL...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # 1. Crear Permisos Básicos
    print(">>> Creando permisos...")
    permissions_data = [
        {"name": "Ver Dashboard", "codename": "dashboard:view", "module": "core"},
        {"name": "Procesar Legacy", "codename": "legacy:process", "module": "legacy"},
        {"name": "Gestionar Usuarios", "codename": "users:manage", "module": "users"},
        {"name": "Configurador Sistema", "codename": "system:config", "module": "core"},
        {"name": "Ver Comercial", "codename": "comercial:view", "module": "comercial"},
        {"name": "Gestionar Comercial", "codename": "comercial:manage", "module": "comercial"},
    ]
    
    perms = []
    for p in permissions_data:
        perm = db.query(Permission).filter(Permission.codename == p["codename"]).first()
        if not perm:
            perm = Permission(**p)
            db.add(perm)
        perms.append(perm)
    db.commit()

    # 2. Crear Roles
    print(">>> Creando roles...")
    admin_role = db.query(Role).filter(Role.name == "Administrador").first()
    if not admin_role:
        admin_role = Role(name="Administrador", description="Acceso total al sistema")
        admin_role.permissions = perms # All perms
        db.add(admin_role)
    
    op_role = db.query(Role).filter(Role.name == "Operador").first()
    if not op_role:
        op_role = Role(name="Operador", description="Solo procesos de carga")
        op_role.permissions = [p for p in perms if p.module == "legacy"]
        db.add(op_role)

    if admin_role:
        have = {p.codename for p in admin_role.permissions}
        for p in perms:
            if p.codename not in have:
                admin_role.permissions.append(p)
    db.commit()

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
