

1)

Al procesar en Bigquery, y hacer un select stg_sales_raw los resultado de búsqueda me da "[{
  "Fecha": "2026-03-02",
  "Hora": null,
  "FechaHora": null,
  "CodigoTransaccion": null,
  "Producto": null,
  "Cliente": null,
  "CodigoNegocio": "A06",
  "FechaCarga": "2026-03-10",
  "Estado": "0",
  "FechaIntegrada": null,
  "HoraRevisada": null,
  "Turno": null,
  "Monto": "8670.0",
  "Cantidad": null,
  "CodigoUbicacion": "",
  "FormaPago": "",
  "FormaPagoModificado": null,
  "EstadoNegocio": "",
  "TipoNegocio": "Ancla 1",
  "Area": "279.0",
  "TurnoVenta": null,
  "TipoIngreso": null
}, {
  "Fecha": "2026-03-02",
  "Hora": null,
  "FechaHora": null,
  "CodigoTransaccion": null,
  "Producto": null,
  "Cliente": null,
  "CodigoNegocio": "A06",
  "FechaCarga": "2026-03-10",
  "Estado": "0",
  "FechaIntegrada": null,
  "HoraRevisada": null,
  "Turno": null,
  "Monto": "17340.0",
  "Cantidad": null,
  "CodigoUbicacion": "",
  "FormaPago": "",
  "FormaPagoModificado": null,
  "EstadoNegocio": "",
  "TipoNegocio": "Ancla 1",
  "Area": "279.0",
  "TurnoVenta": null,
  "TipoIngreso": null
}," con valores nulls, diferentes a los resultados que tenemos en la hoja sales_df del sheet de Configuracion; revisemos el script de carga original CargaBigQueryOfi.py para revisar la causa del error

2)

En al "Carga de ventas" del legacy ve que no se han considerado algunos puntos:
- Los casos especiales de "Para L17 (MR SMASH)", " Normaliza números con coma decimal para A06", " registros por defecto para todos los días", "Agrupación las ventas por el campo 'CodigoTransaccion'", y si faltan alguno más lo revisamos CargaVentas_csvOfi


3)
Cuadramos correctamente los campos de la tabla sales_df del sheet de Configuracion, falta EstadoNegocio que recordemos que viene de la hoja de Negocios del campo Estado pero este campo es calculado mediante una formula del sheet,
Luego consideramos también la API_URL en la .env

4)

- Aún no carga el dato EstadoNeogio aparece vacio, pero te comparto la fórmula aplicada en el campo de EstadNegocio "=SI(K2>=HOY();"ACTIVO";"INACTIVO")",
- Además lo valores de los montos como buena práctica lo redondeamos a 4 decimales para que no hay problemas en la sumartoria en Realizadas, y en el mapeo en sales_df


5)
Tengo los siguientes resultados en Realizadas, en algunas sumas es irreal, se debe a que falta normalizar su campo Monto del reporte o a qué se debe?
"CodigoNegocio	RutaArchivo	Cargar	Añadir	FechaInicio	FechaFin	Fecha Transaccion	Fecha Inicio	Fecha Fin	Ventas Totales	Fecha_Procesamiento_Web
L17	L17_MR SMASH_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	2467	2026-03-10 16:38:50
L20	L20_CALDOS_DORIS_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	1.03504E+17	2026-03-10 16:38:50
L21	L21_BARRIO_WOK_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	1353.2	2026-03-10 16:38:50
N10	N1O_LA_VICTORIA_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	4891	2026-03-10 16:38:50
N06	N06 -T18_HANZO_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	18446.45	2026-03-10 16:38:50
T10	T10_ANTICUCHING_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	21804.9	2026-03-10 16:38:50
A03	A03_BARRIO_MANCORA_consolidado_.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	5.05109E+31	2026-03-10 16:38:50
A04	A04_PATIO_CAVENECIA_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	28976.4	2026-03-10 16:38:50
A06	A06_DON_MELCHOR_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	79178.2692	2026-03-10 16:38:50
IS01	IS01_CAJA CHINA CRIOLLA_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	8867	2026-03-10 16:38:50
IS07	IS07_NASHMYS_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	3660.6	2026-03-10 16:38:50
L13	L13_LA 22_consolidado.csv	1	0	2026-03-02	2026-03-08	2026-03-10 16:38:50	2026-03-02	2026-03-08	17127.28	2026-03-10 16:38:50
"


6)
Agregamos una vista previa de los registros de sales_df de Configuracion en un modal


7) ✅ Login y RBAC Completado
- APIs de autenticación y gestión de roles
- Frontend con Login premium y Dashboard protegido
- Modelos PostgreSQL para usuarios y permisos
- Script de inicialización de base de datos


8) 
Documentamos el README:
- Los módulos y la lógica de cada uno
- Los camandos y su funcionalidad correspondiente






