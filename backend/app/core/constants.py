# -*- coding: utf-8 -*-
"""
Constantes de negocio. Locatarios sincronizados con frontend constants/locatarios.ts.

Orden y datos alineados con delivery_restaurants en producción (fidelio_id, nombre,
codigo_negocio / codigo_comunicacion vía patch_db_delivery.seed_locatarios).
"""
LOCATARIOS = [
    {"name": "Barrio Mancora", "codigo": "A03_BARRIO_MANCORA"},
    {"name": "Patio Cavenecia", "codigo": "A04_PATIO_CAVENECIA"},
    {"name": "Caja China Criolla", "codigo": "IS01_CAJA_CHINA_CRIOLLA"},
    {"name": "Bros", "codigo": "IS04_BROS"},
    {"name": "Limanesas", "codigo": "IS05_LIMANESAS"},
    {"name": "Saltao", "codigo": "L06_SALTAO"},
    {"name": "La 22", "codigo": "L13_LA_22"},
    {"name": "Choza de la Anaconda", "codigo": "L16_CHOZA_DE_LA_ANACONDA"},
    {"name": "MR SMASH", "codigo": "L17_MR_SMASH"},
    {"name": "Sisa Cafe", "codigo": "N01_SISA_CAFE"},
    {"name": "Hanzo", "codigo": "N06_HANZO"},
    {"name": "La Victoria", "codigo": "N10_LA_VICTORIA"},
    {"name": "Curich", "codigo": "T06_CURICH"},
    {"name": "Anticuching", "codigo": "T10_ANTICUCHING"},
    {"name": "Bar Refugio", "codigo": "T20_BAR_REFUGIO"},
    {"name": "Tortas Gaby", "codigo": "L18_TORTAS_GABY"},
    {"name": "Don Melchor", "codigo": "A06_DON_MELCHOR"},
    {"name": "Nashmys", "codigo": "IS07_NASHMYS"},
    {"name": "Ahumaré", "codigo": "L19_AHUMARE"},
    {"name": "Caldos Doris", "codigo": "L20_CALDOS_DORIS"},
    {"name": "Barrio Wok", "codigo": "L21_BARRIO_WOK"},
]

CODIGOS_LOCATARIOS_VALIDOS = {loc["codigo"] for loc in LOCATARIOS}

# FileStore (sincronizar con documentación / frontend si aplica)
FILE_STORE_CIERRE_CAJA = "cierre_caja"
FILE_STORE_PROCESADOS = "procesados"
FILE_STORE_SUB_CONSOLIDADOS = "_consolidados"
FILE_STORE_SUB_BACKUP = "backup_no_consolidados"

MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]





# # Helpers (Delivery/Locatarios)
LOCATARIOS_BY_CODIGO = {loc["codigo"]: loc for loc in LOCATARIOS}
LOCATARIO_CODE_BY_FULL = {loc["codigo"]: loc["codigo"].split("_", 1)[0] for loc in LOCATARIOS}
LOCATARIO_CODES = set(LOCATARIO_CODE_BY_FULL.values())


def get_locatario_code_from_full(full_code: str) -> str:
    if not full_code:
        return ""
    return str(full_code).split("_", 1)[0].strip()


def build_codigo_comunicacion(codigo_negocio: str, nombre: str) -> str:
    codigo_negocio = (codigo_negocio or "").strip()
    nombre = (nombre or "").strip()
    if not codigo_negocio and not nombre:
        return ""
    if not codigo_negocio:
        return nombre
    if not nombre:
        return codigo_negocio
    return f"{codigo_negocio} - {nombre}"
