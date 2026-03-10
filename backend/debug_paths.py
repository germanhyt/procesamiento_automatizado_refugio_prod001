import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar configuración
base_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(os.path.dirname(base_dir), "config", ".env")
load_dotenv(env_path)

def test_path(name, path):
    print(f"\n--- Probando {name} ---")
    if not path:
        print("ERROR: La ruta está vacía en el .env")
        return
        
    clean_path = path.strip('"\'')
    print(f"Ruta Limpia: {clean_path}")
    
    # Prueba 1: os.path.exists
    exists_os = os.path.exists(clean_path)
    print(f"1. os.path.exists: {exists_os}")
    
    # Prueba 2: Pathlib
    p = Path(clean_path)
    print(f"2. Pathlib exists: {p.exists()}")
    
    # Prueba 3: Listar directorio (si es carpeta)
    if exists_os and os.path.isdir(clean_path):
        try:
            files = os.listdir(clean_path)
            print(f"3. Archivos encontrados: {len(files)}")
        except Exception as e:
            print(f"3. Error al listar: {e}")
    
    # Prueba 4: Intentar abrir (si es archivo)
    if exists_os and os.path.isfile(clean_path):
        try:
            with open(clean_path, 'rb') as f:
                f.read(1)
            print("4. Lectura binaria: OK")
        except Exception as e:
            print(f"4. Error de lectura: {e}")

if __name__ == "__main__":
    drive = os.getenv("GOOGLE_DRIVE_PATH")
    config = os.getenv("CONFIG_EXCEL_PATH")
    
    test_path("DRIVE_PATH", drive)
    test_path("CONFIG_PATH", config)
