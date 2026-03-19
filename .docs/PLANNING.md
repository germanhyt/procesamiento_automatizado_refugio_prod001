==
PLANIFICACIÓN
==

REFACTORIZACIÓN DEL PROYECTO DE AUTOAMTIZACIÓN DE PROCESAMIENTO DE DATOS DE REFUGIO:
1. As - Is:
   a) Se usa python para la lógica de procesamiento e interfaz GUI
   b) Se usa la integración de con Bigquery para el almacenamiento

2. To - Be: 
    a) Usaremos React para la interfaz GUI
    b) Usaremos FastAPI para la lógica de procesamiento
    c) Usaremos la integración con Bigquery para el almacenamiento

REGLAS E INTRUCCIONES:
1)  Planificamos la lógica a más detalle,
    la lógica parte desde la conversión de los archivos a .csv (todos),
    luego se tiene la lógica de asociación de los archivos por locatario y luego por rango de fecha,
    luego realiza la carga de estos reportes a una tabla centralizada de ventas que está dentro del archivo Configuración.xlsx en la hoja sales_df,
    luego se tiene la lógica de carga de datos a bigquery.

a) La arquitectura será la siguiente:
a.1) Frontend: React para Dashboard
a.2) Backend: FastAPI para la lógica para integrar con frontend y el proecsamiento
a.3) Base de datos: PostgreSQL para login
a.4) Integración: BigQuery para carga Datawarehouse

b) La lógica de consolidado de datos por locatario: 
b.1) Apuntarmos a la carpeta G:\Mi unidad\Refugio\Descargas_automatizadas\locatarios_con_acceso_a_web donde están segmentado las carpetas de los diferentes locatarios
b.2) Inspeccionamos los archivos cargados de la última semana (lunes a domingo) y si está dentro del rango requerido se consolida considerando los registros internos que tienen fecha y sin duplicidad
b.3) la ruta de carpeta donde se consolida sería: Refugio/Descargas_automatizadas/fechaActual/nombreArchivoLocatario.csv

c) Lógica de procesamiento para Carga de Ventas sales_df
c.1) lectura del sheet de Configuración.xlsx en la hoja BaseCarga para obtener las coordenadas de cada reporte de locatario
c.2) lectura de archivos (consolidados) por locatario verificando las coordenadas y extraer los datos internos necesarios para centralizar la carga de ventas, esto validando que se respete la integridad y consistencia de los datos
c.3) el respaldo de los archivos que se van procesando tendrá como ruta G:\Mi unidad\Refugio\Descargas_automatizadas\procesamiento_data_automatizado\procesados


2.  En la siguiente lista de carpetas por locatario "locatarios_con_acceso_a_web", l el consolidado por fecha teniendo en cuenta el siguiente diccionario "
# const locatarios_key_values = [

# { value: 'QUIEN_PIDIO_POLLO', label: 'Quién pidió pollo' },

# { value: 'BARRIO_MANCORA', label: 'Barrio Mancora' },

# { value: 'PATIO_CAVENECIA', label: 'Patio Cavenecia' },

# { value: 'CAJA_CHINA_CRIOLLA', label: 'Caja China Criolla' },

# { value: 'BROS', label: 'Bros' },

# { value: 'BELGOFRE', label: 'Belgofre' },

# { value: 'LIMANESAS', label: 'Limanesas' },

# { value: 'SALTAO', label: 'Saltao' },

# { value: 'VIKINGA', label: 'Vikinga' },

# { value: 'BODEGA_TURCA', label: 'Bodega Turca' },

# { value: 'LA_22', label: 'La 22' },

# { value: 'TAQUEADO', label: 'Taqueado' },

# { value: 'CHOZA_DE_LA_ANACONDA', label: 'Choza de la Anaconda' },

# { value: 'MR_SMASH', label: 'MR SMASH' },

# { value: 'SISA_CAFE', label: 'Sisa Cafe' },

# { value: 'HANZO', label: 'Hanzo' },

# { value: 'LA_VICTORIA', label: 'La Victoria' },

# { value: 'CURICH', label: 'Curich' },

# { value: 'ANTICUCHING', label: 'Anticuching' },

# { value: 'BAR_REFUGIO', label: 'Bar Refugio' },

# { value: 'TORTAS_GABY', label: 'Tortas Gaby' }

# ];" 
donde los value son los nombres de las carpetas de locatarios dentro de "locatarios_con_acceso_a_web"


3. 
Las tecnologías usadas considerar también:
Frontend:
- tailwind: para estilos
- sweetAlert2: para alertas
- Tanstack query y axios: para peticiones
- framer-motion: para efectos y animaciones
- estilso acorde al logo assets/logo