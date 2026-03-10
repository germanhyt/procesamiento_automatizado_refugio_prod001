from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from app.api import procesamiento  # Importar el nuevo router

# Configurar ruta al archivo .env de forma robusta
base_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(os.path.dirname(base_dir), "config", ".env")
load_dotenv(env_path)

app = FastAPI(
    title="Refugio - Sistema de Procesamiento",
    version="1.0.0"
)

# Registrar Routers
app.include_router(procesamiento.router, prefix="/api")

# Configuración CORS para el Dashboard de React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción especificar el origen del frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "API de Procesamiento Refugio Gastronómico", "status": "online"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
