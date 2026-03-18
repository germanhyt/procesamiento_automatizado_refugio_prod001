import os
import json
import argparse
import requests


def main():
    parser = argparse.ArgumentParser(description="Mock sender: Fidelio order-ready webhook")
    parser.add_argument("--base-url", default=os.getenv("BASE_URL", "http://localhost:8080"), help="API base URL")
    parser.add_argument("--api-key", default=os.getenv("FIDELIO_API_KEY", ""), help="X-API-Key header value")
    parser.add_argument("--restaurant-id", required=True, help="restaurant_fidelio_id (e.g. A03)")
    parser.add_argument("--restaurant-nombre", default=None, help="Nombre restaurante")
    parser.add_argument("--plataforma", required=True, help="RAPPI / PEDIDOSYA / etc.")
    parser.add_argument("--codigo-pedido", required=True, help="Codigo pedido")
    parser.add_argument("--bolsas", type=int, default=None, help="Numero bolsas")
    args = parser.parse_args()

    url = args.base_url.rstrip("/") + "/api/delivery/webhooks/fidelio/order-ready"
    payload = {
        "restaurant_fidelio_id": args.restaurant_id,
        "restaurant_nombre": args.restaurant_nombre,
        "plataforma": args.plataforma,
        "codigo_pedido": args.codigo_pedido,
        "numero_bolsas": args.bolsas,
    }
    headers = {"Content-Type": "application/json"}
    if args.api_key:
        headers["X-API-Key"] = args.api_key

    r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=30)
    print("status:", r.status_code)
    print(r.text)


if __name__ == "__main__":
    main()

