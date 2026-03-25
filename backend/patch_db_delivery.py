from sqlalchemy import text

from app.database import engine, SessionLocal, Base
from app.models.auth import Permission, Role
from app.models.delivery import Restaurant
from app.core.constants import LOCATARIOS, get_locatario_code_from_full, build_codigo_comunicacion


def rename_legacy_delivery_tables(conn) -> None:
    """
    Renombra tablas legacy (sin prefijo) a delivery_* de forma idempotente.
    Orden: restaurants -> orders -> driver_arrivals (respeta FKs).
    """
    stmts = [
        """
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'restaurants'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'delivery_restaurants'
          ) THEN
            ALTER TABLE restaurants RENAME TO delivery_restaurants;
          END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'orders'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'delivery_orders'
          ) THEN
            ALTER TABLE orders RENAME TO delivery_orders;
          END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'driver_arrivals'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'delivery_driver_arrivals'
          ) THEN
            ALTER TABLE driver_arrivals RENAME TO delivery_driver_arrivals;
          END IF;
        END $$;
        """,
    ]
    for s in stmts:
        conn.execute(text(s))


def ensure_columns():
    # 1) Migrar nombres de tablas antes de create_all (evita tablas duplicadas vacías)
    with engine.begin() as conn:
        rename_legacy_delivery_tables(conn)

    # 2) Crear tablas si no existen (create_all no altera tablas existentes)
    Base.metadata.create_all(bind=engine)

    stmts = [
        # Delivery_restaurants
        "ALTER TABLE IF EXISTS delivery_restaurants ADD COLUMN IF NOT EXISTS codigo_negocio VARCHAR(10);",
        "ALTER TABLE IF EXISTS delivery_restaurants ADD COLUMN IF NOT EXISTS codigo_comunicacion VARCHAR(200);",
        # Delivery_orders — columnas operativas previas + trazabilidad
        "ALTER TABLE IF EXISTS delivery_orders ADD COLUMN IF NOT EXISTS estado_changed_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_orders ADD COLUMN IF NOT EXISTS listo_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_orders ADD COLUMN IF NOT EXISTS match_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_orders ADD COLUMN IF NOT EXISTS recogido_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_orders ADD COLUMN IF NOT EXISTS entregado_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_orders ADD COLUMN IF NOT EXISTS cancelado_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_orders ADD COLUMN IF NOT EXISTS devolucion_at TIMESTAMPTZ NULL;",
        # Delivery_driver_arrivals
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS estado_changed_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS alias_conductor VARCHAR(120);",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS atendido_at TIMESTAMPTZ NULL;",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS despachado_at TIMESTAMPTZ NULL;",
    ]
    with engine.begin() as conn:
        for s in stmts:
            conn.execute(text(s))


def ensure_permissions_and_roles():
    db = SessionLocal()
    try:
        perms_data = [
            {"name": "Ver Delivery", "codename": "delivery:view", "module": "delivery"},
            {"name": "Operar Delivery", "codename": "delivery:operate", "module": "delivery"},
            {"name": "Administrar Delivery", "codename": "delivery:admin", "module": "delivery"},
        ]

        perms = {}
        for p in perms_data:
            perm = db.query(Permission).filter(Permission.codename == p["codename"]).first()
            if not perm:
                perm = Permission(**p)
                db.add(perm)
                db.flush()
            perms[p["codename"]] = perm
        db.commit()

        admin_role = db.query(Role).filter(Role.name == "Administrador").first()
        op_role = db.query(Role).filter(Role.name == "Operador").first()

        # Admin: asegurar que tenga delivery:admin (y por consecuencia debería poder todo)
        if admin_role:
            existing = {p.codename for p in admin_role.permissions}
            for code in ["delivery:view", "delivery:operate", "delivery:admin"]:
                if code not in existing:
                    admin_role.permissions.append(perms[code])

        # Operador: view + operate
        if op_role:
            existing = {p.codename for p in op_role.permissions}
            for code in ["delivery:view", "delivery:operate"]:
                if code not in existing:
                    op_role.permissions.append(perms[code])

        db.commit()
    finally:
        db.close()


def seed_locatarios():
    """
    Fidelio option A:
    - delivery_restaurants.fidelio_id = full code (e.g. A03_BARRIO_MANCORA)
    - codigo_negocio = prefix (A03)
    - codigo_comunicacion = "A03 - Barrio Mancora"
    """
    db = SessionLocal()
    try:
        for loc in LOCATARIOS:
            fidelio_id = loc["codigo"]
            nombre = loc["name"]
            codigo_negocio = get_locatario_code_from_full(fidelio_id)
            codigo_comunicacion = build_codigo_comunicacion(codigo_negocio, nombre)

            row = db.query(Restaurant).filter(Restaurant.fidelio_id == fidelio_id).first()
            if not row:
                row = Restaurant(
                    fidelio_id=fidelio_id,
                    nombre=nombre,
                    codigo_negocio=codigo_negocio,
                    codigo_comunicacion=codigo_comunicacion,
                    is_active=True,
                )
                db.add(row)
            else:
                row.nombre = nombre or row.nombre
                if not row.codigo_negocio:
                    row.codigo_negocio = codigo_negocio
                if not row.codigo_comunicacion:
                    row.codigo_comunicacion = codigo_comunicacion
                if row.is_active is None:
                    row.is_active = True
        db.commit()
    finally:
        db.close()


def main():
    print(">>> Patching DB: delivery_* tables + columns + permissions/roles")
    ensure_columns()
    ensure_permissions_and_roles()
    seed_locatarios()
    print(">>> Patch completado.")


if __name__ == "__main__":
    main()
