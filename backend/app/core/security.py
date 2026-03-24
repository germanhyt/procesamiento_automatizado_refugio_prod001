from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt
from passlib.context import CryptContext
import os
from dotenv import load_dotenv

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# Load settings from .env
current_dir = os.path.dirname(os.path.abspath(__file__)) # core
app_dir = os.path.dirname(current_dir) # app
backend_dir = os.path.dirname(app_dir) # backend
project_root = os.path.dirname(backend_dir) # 001_procesamiento_refugio
env_path = os.path.join(project_root, "config", ".env")
load_dotenv(env_path)

SECRET_KEY = os.getenv("SECRET_KEY", "9a6c764e2079c53644f1c79e6587c4f4f3c5f4c5f4c5f4c5f4c5f4c5f4c5f4c5")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440)) # un dia



def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
