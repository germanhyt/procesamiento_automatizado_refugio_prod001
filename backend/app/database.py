from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Carga de .env en dos layouts distintos:
#
# 1) Repo completo en disco (desarrollo local): backend/ y config/ son hermanos.
#    project_root/config/.env  →  …/001_procesamiento_refugio/config/.env
#
# 2) Imagen Docker (solo COPY backend → WORKDIR /app): no existe el padre del repo.
#    project_root = dirname(/app) = "/"  →  la ruta (1) sería "/config/.env", que NO existe.
#    El compose monta ./config en /app/config, así que el .env real está en:
#    backend_dir/config/.env  →  /app/config/.env
#
# Sin (2), variables que solo están en config/.env del volumen (p. ej. UPLOAD_BASE_PATH)
# nunca entran al proceso y el FileStore puede apuntar a un sitio no montado → fotos “no guardadas”.
#
# override=False: lo ya definido por `docker compose env_file` o el shell no se pisa.
current_dir = os.path.dirname(os.path.abspath(__file__))  # app
backend_dir = os.path.dirname(current_dir)  # backend (en Docker: /app)
project_root = os.path.dirname(backend_dir)  # en Docker suele ser "/" — por eso hace falta la segunda ruta
env_path = os.path.join(project_root, "config", ".env")
load_dotenv(env_path)
docker_sidecar_config = os.path.join(backend_dir, "config", ".env")
if os.path.isfile(docker_sidecar_config):
    load_dotenv(docker_sidecar_config, override=False)

# Variables de entorno
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "admin")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "refugio_procesamiento_app")

SQLALCHEMY_DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
