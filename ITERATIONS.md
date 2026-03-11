

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


7) 
Ahora planificamos y ejecutamos el login de usuario
- Apis de login y register
- En el frontend de forma incial el loguin, el register de usuarios de forma interna ya dentro del dashboard
- migraciones para user, roles, uers_rols, permission, rol_permissions
- Vista de registro de usuarios con posibilidad de asignar rol
- Modal para gestionar roles y sus permisos correspondientes (buscador y select), este modal dentro de la vista de gestion de usuarios (crud)


8) 
Documentamos el README:
- Los módulos y la lógica de cada uno
- Los camandos y su funcionalidad correspondiente


9) 
PROCEDIMIENTO PARA INCRUSTAR DASHBOARD DE POWERBI EN LA APLICACION - enfoque "App Owns Data" (La aplicación posee los datos)

Fase 1: Registrar la Aplicación en Microsoft Entra ID (Azure)
  Esta fase crea la "identidad" de tu aplicación para que pueda autenticarse sin un usuario humano.

  Entra al Centro de administración de Microsoft Entra (entra.microsoft.com) con tu cuenta de administrador.

  En el menú lateral, ve a Identidad > Aplicaciones > Registros de aplicaciones y haz clic en Nuevo registro.

  Ponle un nombre (ej. Refugio-PowerBI-App) y déjalo como "Cuentas solo en este directorio organizativo". Regístralo.

  En la pantalla general de tu nueva app, copia y guarda el ID de la aplicación (cliente) y el ID del inquilino (directorio).

  Ve a Certificados y secretos (en el menú izquierdo de tu app), haz clic en Nuevo secreto de cliente. Cópialo inmediatamente (el "Valor"), ya que no volverá a mostrarse. Este es tu Client Secret.

  (Opcional pero recomendado): Ve a Grupos en Entra ID, crea un Grupo de Seguridad (ej. PowerBI_APIs) y añade tu aplicación (Refugio-PowerBI-App) como miembro de ese grupo.

Fase 2: Dar Permisos en Power BI Service
  Ahora hay que decirle a Power BI que confíe en esa aplicación que acabas de crear.

  Vuelve a app.powerbi.com y entra al Portal de administración (ícono de engranaje arriba a la derecha).

  Ve a Configuración del inquilino y baja hasta la sección Configuración de desarrollador.

  Habilita la opción Permitir que las entidades de servicio usen las API de Power BI. Aquí puedes aplicarlo a toda la organización o, preferiblemente, al Grupo de Seguridad que creaste en el paso 6 anterior.

  Ve a tu Área de trabajo (Workspace) donde está el reporte de Refugio.

  Haz clic en Administrar acceso (o "Manage Access").

  Busca el nombre de tu aplicación (Refugio-PowerBI-App) y agrégala con el rol de Visor o Miembro.

Fase 3: El Backend (Python)
Fase 4: El Frontend (React)


10) 
Este error es muy específico de Power BI y confirma que la comunicación técnica (Azure -> Backend -> Power BI) ya funciona, pero te falta un nivel de permiso dentro del portal de Power BI.
El mensaje "Only folder user with reshare permissions can generate embed token" significa que tu Aplicación (Service Principal) fue agregada al área de trabajo como "Visor" (Viewer), y ese rol no tiene permiso para generar tokens de compartido para terceros.
Cómo solucionarlo (Pasos en Power BI Service):
Ve a app.powerbi.com y entra en tu Área de Trabajo (Workspace).
Haz clic en el botón Administrar acceso (Manage access).
Busca tu aplicación: Refugio-PowerBI-App (o el nombre que le hayas puesto).
Cambia su rol: Cambia de "Visor" (Viewer) a Miembro (Member) o Colaborador (Contributor).
Nota: El rol de "Miembro" es el recomendado para este enfoque, ya que permite generar tokens de incrustación.
Guarda los cambios y vuelve a intentar cargar el dashboard en nuestra aplicación.

