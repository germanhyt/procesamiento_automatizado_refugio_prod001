import argparse
import os
import sys
from typing import List

from sqlalchemy import text

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(TOOLS_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import SessionLocal
from app.models.delivery import DriverArrival, Order, Restaurant


def _like(prefix: str) -> str:
    return f"{prefix}%"


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup BD: elimina datos de prueba Delivery por prefijo.")
    parser.add_argument("--prefix", required=True, help="Prefijo usado (ej: TESTDEL-ABC123)")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra conteos, no borra")
    args = parser.parse_args()

    prefix = args.prefix.strip()
    if not prefix:
        raise SystemExit("prefix vacío")

    db = SessionLocal()
    try:
        like = _like(prefix)
        orders: List[Order] = db.query(Order).filter(Order.codigo_pedido.like(like)).all()
        drivers: List[DriverArrival] = db.query(DriverArrival).filter(DriverArrival.codigo_ingresado.like(like)).all()
        restaurants: List[Restaurant] = db.query(Restaurant).filter(Restaurant.fidelio_id.like(like)).all()

        print("== Cleanup delivery test data ==")
        print("db:", os.getenv("POSTGRES_DB", "(from .env)"))
        print("prefix:", prefix)
        print("orders:", len(orders))
        print("drivers:", len(drivers))
        print("restaurants:", len(restaurants))
        print("dry_run:", args.dry_run)

        if args.dry_run:
            return 0

        # Usamos SQL directo para evitar requerir metadata completa de modelos (FK -> users, etc.)
        # Orden: drivers -> orders -> restaurants
        db.execute(text("DELETE FROM driver_arrivals WHERE codigo_ingresado LIKE :p"), {"p": like})
        db.execute(text("DELETE FROM orders WHERE codigo_pedido LIKE :p"), {"p": like})
        db.execute(text("DELETE FROM restaurants WHERE fidelio_id LIKE :p"), {"p": like})
        db.commit()
        print("deleted: OK")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())



# gcbso@soportecomputer MINGW64 ~/Downloads/DATA Y AUTOMATIZACIÓN/Scripts/Proyecto - carga de Datos a Big Query v2/001_procesamiento_refugio/backend (master)
# python tools/cleanup_delivery_test_data.py --
# prefix RAPPI-TEST-001