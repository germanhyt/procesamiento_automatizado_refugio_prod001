from sqlalchemy import create_engine
import os
from dotenv import load_dotenv

# Load .env
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(base_dir, "config", ".env")
load_dotenv(env_path)

u, p, h, prt, db = os.getenv("POSTGRES_USER"), os.getenv("POSTGRES_PASSWORD"), os.getenv("POSTGRES_HOST"), os.getenv("POSTGRES_PORT"), os.getenv("POSTGRES_DB")
url = f"postgresql://{u}:{p}@{h}:{prt}/{db}"
print(f"Connecting to: {url}")
try:
    engine = create_engine(url)
    with engine.connect() as conn:
        print("!!! DB CONNECTION SUCCESSful !!!")
except Exception as e:
    print(f"!!! DB CONNECTION ERROR: {e}")
