from sqlalchemy import text

from app.database import engine, SessionLocal, Base
from app.models.auth import Permission, Role
# Restaurant: usado en seed_locatarios. DeliveryRunnerPushToken: no se referencia en este archivo;
# al importar la clase, SQLAlchemy registra su tabla en Base.metadata y create_all() crea delivery_runner_push_tokens.
from app.models.delivery import (  # noqa: F401
    DeliveryConfig,
    DeliveryRunnerPushToken,
    Restaurant,
    RestaurantNotificationEmail,
    RunnerNotification,
)
from app.core.constants import LOCATARIOS, get_locatario_code_from_full, build_codigo_comunicacion
from app.core.locatario_notification_emails_seed import seed_locatario_notification_emails


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


def rename_delivery_kiosk_config_to_delivery_config(conn) -> None:
    """Renombra delivery_kiosk_config → delivery_config (idempotente)."""
    conn.execute(
        text(
            """
            DO $$ BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'delivery_kiosk_config'
              ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'delivery_config'
              ) THEN
                ALTER TABLE delivery_kiosk_config RENAME TO delivery_config;
              END IF;
            END $$;
            """
        )
    )


def ensure_columns():
    # 1) Migrar nombres de tablas antes de create_all (evita tablas duplicadas vacías)
    with engine.begin() as conn:
        rename_legacy_delivery_tables(conn)
        rename_delivery_kiosk_config_to_delivery_config(conn)

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
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS restaurant_id INTEGER NULL;",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS conductor_dni VARCHAR(20) NULL;",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS conductor_nombre_completo VARCHAR(220) NULL;",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS foto_path VARCHAR(512) NULL;",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS foto_mime VARCHAR(64) NULL;",
        "ALTER TABLE IF EXISTS delivery_driver_arrivals ADD COLUMN IF NOT EXISTS foto_uploaded_at TIMESTAMPTZ NULL;",
    ]
    with engine.begin() as conn:
        for s in stmts:
            conn.execute(text(s))

    fk_restaurant = """
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_driver_arrivals_restaurant_id'
      ) THEN
        ALTER TABLE delivery_driver_arrivals
          ADD CONSTRAINT fk_delivery_driver_arrivals_restaurant_id
          FOREIGN KEY (restaurant_id) REFERENCES delivery_restaurants(id) ON DELETE SET NULL;
      END IF;
    END $$;
    """
    try:
        with engine.begin() as conn:
            conn.execute(text(fk_restaurant))
    except Exception as e:
        print(">>> (aviso) FK restaurant_id en delivery_driver_arrivals:", e)

    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE IF EXISTS delivery_config "
                    "ADD COLUMN IF NOT EXISTS enable_runner_simulate_order_ready BOOLEAN NOT NULL DEFAULT true;"
                )
            )
    except Exception as e:
        print(">>> (aviso) delivery_config.enable_runner_simulate_order_ready:", e)


def ensure_permissions_and_roles():
    db = SessionLocal()
    try:
        perms_data = [
            {"name": "Ver Delivery", "codename": "delivery:view", "module": "delivery"},
            {"name": "Operar Delivery", "codename": "delivery:operate", "module": "delivery"},
            {"name": "Administrar Delivery", "codename": "delivery:admin", "module": "delivery"},
            {"name": "Configurar Kiosk Delivery", "codename": "delivery:settings:update", "module": "delivery"},
            {
                "name": "Simular pedido listo (Runner)",
                "codename": "delivery:simulate_order_ready",
                "module": "delivery",
            },
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
            for code in [
                "delivery:view",
                "delivery:operate",
                "delivery:admin",
                "delivery:settings:update",
                "delivery:simulate_order_ready",
            ]:
                if code not in existing:
                    admin_role.permissions.append(perms[code])

        # Operador: view + operate (simular listo vía flag enable_runner_simulate_order_ready en kiosk config)
        if op_role:
            existing = {p.codename for p in op_role.permissions}
            for code in ["delivery:view", "delivery:operate"]:
                if code not in existing:
                    op_role.permissions.append(perms[code])

        db.commit()
    finally:
        db.close()


def seed_delivery_config():
    """Fila singleton id=1 para configuración delivery (kiosk, Runner, etc.); idempotente."""
    db = SessionLocal()
    try:
        row = db.get(DeliveryConfig, 1)
        if row is None:
            row = DeliveryConfig(
                id=1,
                enable_driver_dni_lookup=False,
                enable_driver_photo_capture=False,
                enable_runner_simulate_order_ready=True,
            )
            db.add(row)
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
                # Lista canónica = tabla real delivery_restaurants (ejecutar patch para alinear tras cambios)
                row.nombre = nombre
                row.codigo_negocio = codigo_negocio
                row.codigo_comunicacion = codigo_comunicacion
                if row.is_active is None:
                    row.is_active = True
        db.commit()
    finally:
        db.close()


def seed_locatario_notification_emails_from_map():
    """Correos por locatario (map n8n). Idempotente: solo añade filas que no existan."""
    db = SessionLocal()
    try:
        seed_locatario_notification_emails(db)
        db.commit()
    finally:
        db.close()


def main():
    print(">>> Patching DB: delivery_* tables + columns + permissions/roles")
    ensure_columns()
    ensure_permissions_and_roles()
    seed_delivery_config()
    seed_locatarios()
    seed_locatario_notification_emails_from_map()
    print(">>> Patch completado.")


if __name__ == "__main__":
    main()
