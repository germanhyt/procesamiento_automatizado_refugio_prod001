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



# docker exec -it postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "COPY (SELECT 1) TO STDOUT;"

# -- comercial_reservas (reservas con hora)
# INSERT INTO comercial_reservas (
#   fecha_creacion, nombres, celular, cantidad_personas, fecha_reserva, hora_reserva, estado
# ) VALUES
#   ((to_date('13/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Cinthya Chávez Ramírez', '968263964', 20, '30/04/2026', '20:00:00', 'pendiente'),
#   ((to_date('14/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Alexandra Castillo Asencio', '942039468', 4, '18/04/2026', '20:00:00', 'pendiente'),
#   ((to_date('16/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Jasmin Zarate Vela', '994544436', 8, '17/04/2026', '21:00:00', 'pendiente'),
#   ((to_date('16/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Karla Montero Mena', '952537226', 20, '17/04/2026', '20:00:00', 'pendiente'),
#   ((to_date('23/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Carmen Rios', '951748540', 20, '24/04/2026', '20:00:00', 'pendiente'),
#   ((to_date('24/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Nadia Zafra Sarmiento', '961581751', 8, '24/04/2026', '19:00:00', 'pendiente'),
#   ((to_date('24/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Miguel Acevedo', '949328398', 20, '29/04/2026', '18:00:00', 'pendiente'),
#   ((to_date('24/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Samara Macedo', '916481840', 10, '24/04/2026', '19:30:00', 'pendiente'),
#   ((to_date('24/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'STEPHANIE ALEXANDRA GUEVARA ZUNIGA', '919067927', 15, '24/07/2026', '18:30:00', 'pendiente'),
#   ((to_date('24/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'STEPHANIE ALEXANDRA GUEVARA ZUNIGA', '919067927', 15, '24/04/2026', '18:30:00', 'pendiente'),
#   ((to_date('25/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Manuel Macedo Lazo', '996649466', 2, '25/04/2026', '21:30:00', 'pendiente'),
#   ((to_date('27/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Emilio Giurfa', '941311218', 13, '30/04/2026', '7:30:00', 'pendiente');

# -- comercial_eventos (eventos con tipo y fecha tentativa; razón social vacía → NULL)
# INSERT INTO comercial_eventos (
#   fecha_creacion, nombres, razon_social, celular, tipo_evento, cantidad_personas, fecha_tentativa, estado
# ) VALUES
#   ((to_date('14/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Alice Norindr', NULL, '900912523', 'Fiestas Infantiles', 70, '16/05/2026', 'pendiente'),
#   ((to_date('15/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Vania Stephanie Agüero Bautista', NULL, '992813794', 'Fiestas Infantiles', 60, '5/12/2026', 'pendiente'),
#   ((to_date('16/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Andrea Carruitero', NULL, '993651660', 'Fiestas Infantiles', 100, '18/07/2026', 'pendiente'),
#   ((to_date('16/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'Paola Sánchez', NULL, '962112381', 'Fiestas Infantiles', 30, '23/05/2026', 'pendiente'),
#   ((to_date('16/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'prueba4', NULL, '987654321', 'Social', 16, '16/04/2026', 'pendiente'),
#   ((to_date('25/04/2026','DD/MM/YYYY')::timestamp AT TIME ZONE 'America/Lima'), 'María Fernanda', NULL, '949202787', 'Fiestas Infantiles', 50, '20/06/2026', 'pendiente');
