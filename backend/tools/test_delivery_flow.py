import argparse
import json
import os
import random
import string
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests


def _rand_suffix(n: int = 6) -> str:
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(n))


@dataclass
class Cfg:
    base_url: str
    api_key: str
    username: str
    password: str
    prefix: str
    plataforma: str
    restaurant_fidelio_id: str


def _url(base: str, path: str) -> str:
    return base.rstrip("/") + path


def login(cfg: Cfg) -> str:
    url = _url(cfg.base_url, "/api/auth/login")
    data = {"username": cfg.username, "password": cfg.password}
    r = requests.post(url, data=data, timeout=30)
    r.raise_for_status()
    payload = r.json()
    token = payload.get("access_token")
    if not token:
        raise RuntimeError(f"Login OK pero sin access_token: {payload}")
    return token


def fidelio_order_ready(cfg: Cfg, codigo_pedido: str, numero_bolsas: Optional[int] = None) -> Dict[str, Any]:
    url = _url(cfg.base_url, "/api/delivery/webhooks/fidelio/order-ready")
    payload: Dict[str, Any] = {
        "restaurant_fidelio_id": cfg.restaurant_fidelio_id,
        "plataforma": cfg.plataforma,
        "codigo_pedido": codigo_pedido,
        "numero_bolsas": numero_bolsas,
    }
    headers = {"Content-Type": "application/json"}
    if cfg.api_key:
        headers["X-API-Key"] = cfg.api_key
    r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=30)
    r.raise_for_status()
    return r.json()


def kiosk_arrival(cfg: Cfg, codigo: str, placa: Optional[str] = None) -> Dict[str, Any]:
    url = _url(cfg.base_url, "/api/delivery/kiosk/arrivals")
    payload: Dict[str, Any] = {
        "plataforma": cfg.plataforma,
        "codigo_ingresado": codigo,
        "placa": placa,
    }
    r = requests.post(url, headers={"Content-Type": "application/json"}, data=json.dumps(payload), timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"kiosk_arrival failed {r.status_code}: {r.text}")
    return r.json()


def runner_action(cfg: Cfg, token: str, action: str, order_id: int) -> Dict[str, Any]:
    url = _url(cfg.base_url, f"/api/delivery/orders/{order_id}/{action}")
    r = requests.post(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def manual_match(cfg: Cfg, token: str, order_id: int, driver_arrival_id: int) -> Dict[str, Any]:
    url = _url(cfg.base_url, f"/api/delivery/orders/{order_id}/manual-match")
    payload = {"driver_arrival_id": driver_arrival_id}
    r = requests.post(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, data=json.dumps(payload), timeout=30)
    r.raise_for_status()
    return r.json()


def main() -> int:
    parser = argparse.ArgumentParser(description="E2E temporal: prueba flujo Delivery via APIs.")
    parser.add_argument("--base-url", default=os.getenv("BASE_URL", "http://localhost:8080"))
    parser.add_argument("--api-key", default=os.getenv("FIDELIO_API_KEY", ""), help="X-API-Key para webhook Fidelio")
    parser.add_argument("--username", default=os.getenv("TEST_USER", "admin"))
    parser.add_argument("--password", default=os.getenv("TEST_PASS", "admin123"))
    parser.add_argument("--prefix", default=os.getenv("TEST_PREFIX", "TESTDEL"))
    parser.add_argument("--plataforma", default=os.getenv("TEST_PLATAFORMA", "RAPPI"))
    parser.add_argument("--restaurant-id", default=os.getenv("TEST_REST_ID", "A03_BARRIO_MANCORA"), help="restaurant_fidelio_id (Option A)")
    args = parser.parse_args()

    run_id = f"{args.prefix}-{_rand_suffix()}"
    cfg = Cfg(
        base_url=args.base_url,
        api_key=args.api_key,
        username=args.username,
        password=args.password,
        prefix=args.prefix,
        plataforma=args.plataforma,
        restaurant_fidelio_id=args.restaurant_id,
    )

    print("== Delivery API flow test ==")
    print("base_url:", cfg.base_url)
    print("run_id:", run_id)
    print("plataforma:", cfg.plataforma)
    print("restaurant_fidelio_id:", cfg.restaurant_fidelio_id)

    token = login(cfg)
    print("login: OK")

    # Caso A: order-ready -> kiosk arrival (match automático probable)
    codigo_pedido_1 = f"{run_id}-P1"
    print("\n-- Caso A: webhook -> kiosk --")
    w1 = fidelio_order_ready(cfg, codigo_pedido=codigo_pedido_1, numero_bolsas=1)
    order_id_1 = (w1 or {}).get("id")
    print("webhook: OK order_id:", order_id_1)

    k1 = kiosk_arrival(cfg, codigo=codigo_pedido_1, placa="TST-001")
    arrival_1 = (k1 or {}).get("driver_arrival") or {}
    driver_id_1 = arrival_1.get("id")
    print("kiosk: OK driver_id:", driver_id_1, "matched:", k1.get("matched"))

    if order_id_1:
        print("runner accept/shelf/deliver...")
        runner_action(cfg, token, "accept", int(order_id_1))
        runner_action(cfg, token, "shelf", int(order_id_1))
        runner_action(cfg, token, "deliver", int(order_id_1))
        print("runner: OK")

    # Caso B: Early Bird: kiosk arrival -> webhook (match en webhook si aplica)
    print("\n-- Caso B: early bird (kiosk -> webhook) --")
    codigo_pedido_2 = f"{run_id}-P2"
    k2 = kiosk_arrival(cfg, codigo=codigo_pedido_2, placa="TST-002")
    driver_id_2 = ((k2 or {}).get("driver_arrival") or {}).get("id")
    print("kiosk first: OK driver_id:", driver_id_2, "matched:", k2.get("matched"))

    # pequeño delay para simular espera real
    time.sleep(0.5)
    w2 = fidelio_order_ready(cfg, codigo_pedido=codigo_pedido_2, numero_bolsas=2)
    order_id_2 = (w2 or {}).get("id")
    print("webhook after: OK order_id:", order_id_2)

    # Caso C: match manual (si ambos ids existen)
    print("\n-- Caso C: manual match (si aplica) --")
    codigo_pedido_3 = f"{run_id}-P3"
    w3 = fidelio_order_ready(cfg, codigo_pedido=codigo_pedido_3, numero_bolsas=1)
    order_id_3 = (w3 or {}).get("id")
    k3 = kiosk_arrival(cfg, codigo=f"{codigo_pedido_3}-TYPO", placa="TST-003")  # induce mismatch
    driver_id_3 = ((k3 or {}).get("driver_arrival") or {}).get("id")
    print("created order_id:", order_id_3, "driver_id:", driver_id_3, "matched:", k3.get("matched"))
    if order_id_3 and driver_id_3:
        manual_match(cfg, token, int(order_id_3), int(driver_id_3))
        print("manual match: OK")

    print("\n== DONE ==")
    print("Para limpiar estos datos luego, ejecuta cleanup con prefix:", run_id)
    print("Ejemplo:")
    print(f"python tools/cleanup_delivery_test_data.py --prefix \"{run_id}\"")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

