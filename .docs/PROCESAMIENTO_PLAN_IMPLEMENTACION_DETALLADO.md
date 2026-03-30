# PLAN DE IMPLEMENTACIÓN DETALLADO - REFACTORIZACIÓN PROYECTO REFUGIO

## 📊 **ANÁLISIS DEL SISTEMA EXISTENTE**

### **Arquitectura Actual (As-Is)**
1. **Interfaz**: Tkinter GUI en múltiples scripts
2. **Flujo de Procesamiento**:
   ```
   ConvertirCSVOfi.py → AsociarNegociosActualOfi.py → CargaVentas_csvOfi.py → 
   CargaBigQueryOfi.py → ActualizarConfigSales_ds.py → ActualizarBigQuery.py
   ```
3. **Módulos Adicionales**:
   - CargarPresupuestoOfi.py (presupuesto anual)
   - PresupuestoDiario.py (presupuesto diario)
   - prediction/predictor_ventas_powerbi_clean.py (sistema de predicciones)
   - EventoModal.py (gestión de eventos en BigQuery)

### **Problemas Detectados**
1. **Interfaces Separadas**: 9+ scripts con GUI independientes
2. **Falta de Centralización**: Menú.py es punto de entrada manual
3. **Manejo de Credenciales**: Credenciales embebidas en múltiples scripts
4. **No hay Autenticación**: Acceso sin login/contraseña
5. **Procesamiento Manual**: Usuario debe ejecutar cada paso

---

## 🎯 **ARQUITECTURA PROPUESTA (To-Be)**

### **Estructura Modular**

```
refugio_app/
├── frontend/                 # React Dashboard
│   ├── public/
│   └── src/
│       ├── components/       # Componentes reutilizables
│       │   ├── Layout/
│       │   ├── ProcessSteps/
│       │   ├── Locatarios/
│       │   ├── BigQuery/
│       │   └── Config/
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Login.jsx
│       │   ├── Procesamiento.jsx
│       │   ├── Locatarios.jsx
│       │   └── Configuracion.jsx
│       ├── services/
│       │   ├── api.js
│       │   ├── auth.js
│       │   └── bigquery.js
│       └── context/
│           ├── AuthContext.jsx
│           └── ProcessContext.jsx
│
├── backend/                  # FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── procesamiento.py
│   │   │   ├── locatarios.py
│   │   │   ├── bigquery.py
│   │   │   └── config.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   └── security.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── proceso.py
│   │   │   └── log.py
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── procesamiento_service.py
│   │   │   ├── bigquery_service.py
│   │   │   ├── config_service.py
│   │   │   └── locatarios_service.py
│   │   └── utils/
│   │       ├── excel_utils.py
│   │       ├── file_utils.py
│   │       └── date_utils.py
│   ├── main.py
│   └── requirements.txt
│
├── scripts/                  # Scripts existentes migrados
│   ├── conversion.py         # Reemplaza ConvertirCSVOfi.py
│   ├── asociacion.py         # Reemplaza AsociarNegociosActualOfi.py
│   ├── carga_ventas.py       # Reemplaza CargaVentas_csvOfi.py
│   └── presupuesto.py        # Reemplaza CargarPresupuestoOfi.py
│
└── config/
    ├── .env
    ├── credentials.json
    └── config_template.json
```

---

## 🔄 **FLUJO DE PROCESAMIENTO OPTIMIZADO**

### **Paso 1: Conversión de Archivos (Reemplaza ConvertirCSVOfi.py)**
```python
# Servicio: ConversionService
# Endpoint: POST /api/conversion/convertir
# Lógica:
# 1. Escanear directorio G:\Mi unidad\Refugio\CierreCaja
# 2. Identificar archivos .xlsx
# 3. Convertir a CSV con separador ';'
# 4. Eliminar archivos .xlsx originales
# 5. Registrar en PostgreSQL logs
```

### **Paso 2: Asociación de Negocios (Reemplaza AsociarNegociosActualOfi.py)**
```python
# Servicio: AsociacionService
# Endpoint: POST /api/asociacion/procesar
# Lógica:
# 1. Cargar hoja "Negocios" de Configuracion.xlsx
# 2. Usar fuzzy matching para asociar automáticamente
# 3. Interfaz para asociación manual
# 4. Guardar en hoja "Asociaciones" y "Activas"
# 5. Asignar fechas por última semana completa
```

### **Paso 3: Procesamiento de Locatarios (Reemplaza main_others_locatarios_automatizev2.py)**
```python
# Servicio: LocatariosService
# Endpoint: POST /api/locatarios/consolidar
# Lógica:
# 1. Leer diccionario de locatarios (21 negocios)
# 2. Escanear carpeta: G:\Mi unidad\Refugio\Descargas_automatizadas\locatarios_con_acceso_a_web
# 3. Para cada locatario:
#    a. Filtrar archivos de última semana (lunes-domingo)
#    b. Consolidar datos sin duplicados
#    c. Guardar en: Refugio/Descargas_automatizadas/fechaActual/nombreArchivoLocatario.csv
```

### **Paso 4: Carga a Ventas Centralizadas (Reemplaza CargaVentas_csvOfi.py)**
```python
# Servicio: VentasService
# Endpoint: POST /api/ventas/cargar
# Lógica:
# 1. Leer hoja "BaseCarga" de Configuracion.xlsx (coordenadas)
# 2. Para cada archivo consolidado:
#    a. Extraer datos usando coordenadas
#    b. Validar integridad de datos
#    c. Cargar a hoja "sales_df" del Configuracion.xlsx
# 3. Mover archivos procesados a: procesamiento_data_automatizado/procesados
```

### **Paso 5: Carga a BigQuery (Reemplaza CargaBigQueryOfi.py)**
```python
# Servicio: BigQueryService
# Endpoint: POST /api/bigquery/cargar
# Lógica:
# 1. Leer hoja "sales_df" de Configuracion.xlsx
# 2. Preprocesar datos (normalización, limpieza)
# 3. Cargar a tablas:
#    a. sales_df (ventas diarias)
#    b. Negocios (catálogo)
#    c. Categorias (clasificación)
# 4. Modos: APPEND (agregar) o TRUNCATE (reemplazar)
```

---

## 📋 **MÓDULOS A MIGRAR**

### **Módulo 1: Sistema de Predicciones (Migrar predictor_ventas_powerbi_clean.py)**
```python
# Nuevo servicio: PredictionService
# Características:
# - Algoritmo μ ± k·σ con últimos 6 valores
# - Compatible con Power BI (WEEKNUM(fecha, 11))
# - Exportación automática a BigQuery
# Endpoints:
# - GET /api/predicciones/calcular
# - POST /api/predicciones/exportar
# - GET /api/predicciones/estadisticas
```


## 🔧 **IMPLEMENTACIÓN POR ETAPAS**

### **Etapa 1: Backend Core (Semana 1-2)**
```
✅ Semana 1:
- [ ] Setup FastAPI con estructura modular
- [ ] Configuración PostgreSQL (SQLAlchemy)
- [ ] Autenticación JWT (login/logout)
- [ ] Modelos: User, Proceso, Log

✅ Semana 2:
- [ ] Servicio de configuración (leer Configuracion.xlsx)
- [ ] Servicio de archivos (manejo rutas Google Drive)
- [ ] Endpoints básicos: /api/health, /api/config
```

### **Etapa 2: Servicios de Procesamiento (Semana 3-4)**
```
✅ Semana 3:
- [ ] ConversionService (reemplaza ConvertirCSVOfi.py)
- [ ] AsociacionService (reemplaza AsociarNegociosActualOfi.py)
- [ ] Tests de integración con archivos reales

✅ Semana 4:
- [ ] LocatariosService (reemplaza lógica de consolidado)
- [ ] VentasService (reemplaza CargaVentas_csvOfi.py)
- [ ] BigQueryService (reemplaza CargaBigQueryOfi.py)
```

### **Etapa 3: Frontend React (Semana 5-6)**
```
✅ Semana 5:
- [ ] Setup React + Vite
- [ ] Componentes base: Layout, Navigation, Cards
- [ ] Página Login con JWT
- [ ] Página Dashboard con métricas

✅ Semana 6:
- [ ] Componente ProcesamientoSteps (flujo guiado)
- [ ] Componente LocatariosList (tabla interactiva)
- [ ] Componente BigQueryStatus (monitoreo)
- [ ] Integración completa con API
```

### **Etapa 4: Módulos Avanzados (Semana 7-8)**
```
✅ Semana 7:
- [ ] PredictionService (sistema predicciones)

✅ Semana 8:
- [ ] ConfigService (sincronización Excel↔BigQuery)
- [ ] Sistema de logs y auditoría
- [ ] Dashboard de reportes
```

### **Etapa 5: Testing y Deployment (Semana 9)**
```
✅ Semana 9:
- [ ] Tests unitarios (pytest >80% cobertura)
- [ ] Tests de integración con datos reales
- [ ] Dockerización (Dockerfile, docker-compose.yml)
- [ ] Documentación API (Swagger/OpenAPI)
- [ ] Deployment guide
```

---

## 🗂️ **ESTRUCTURA DE DATOS**

### **Configuración.xlsx (Archivo Central)**
```yaml
Hojas principales:
1. Negocios: Catálogo de locatarios (CodigoNegocio, Descripcion)
2. BaseCarga: Coordenadas para extracción de reportes
3. sales_df: Ventas centralizadas (Fecha, CodigoNegocio, Monto, Estado)
4. Asociaciones: Mapeo archivos → negocio
5. Activas: Archivos activos con fechas
```

### **BigQuery Schema**
```sql
-- Dataset: Ventas_Refugio
CREATE TABLE sales_df (
    Fecha DATE,
    CodigoNegocio STRING,
    Monto FLOAT64,
    Estado FLOAT64,  -- 0=Activo, 1=Inactivo
    Procesado BOOL
);

CREATE TABLE Negocios (
    CodigoNegocio STRING,
    Descripcion STRING,
    Activo BOOL
);

CREATE TABLE Predicciones (
    Fecha DATE,
    NroSemana INT64,
    Anio INT64,
    Mes INT64,
    Ventas FLOAT64,
    VentasProyectadas FLOAT64
);

CREATE TABLE PresupuestoDiario (
    CodigoNegocio STRING,
    Mes INT64,
    Year INT64,
    Day INT64,
    DailyBudget FLOAT64,
    YearMes STRING,
    Date DATE
);
```

---

## 🔐 **SEGURIDAD Y CONFIGURACIÓN**

### **Variables de Entorno (.env)**
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=refugio_app
POSTGRES_USER=admin
POSTGRES_PASSWORD=***

# JWT
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Paths
GOOGLE_DRIVE_PATH=G:\\Mi unidad\\Refugio
CONFIG_EXCEL_PATH=G:\\Mi unidad\\Refugio\\Configuraciones\\Configuracion.xlsx
LOCATARIOS_PATH=G:\\Mi unidad\\Refugio\\Descargas_automatizadas\\locatarios_con_acceso_a_web
PROCESAMIENTO_PATH=G:\\Mi unidad\\Refugio\\Descargas_automatizadas\\procesamiento_data_automatizado

# BigQuery
BQ_PROJECT_ID=neat-chain-450900-a1
BQ_DATASET=Ventas
GOOGLE_APPLICATION_CREDENTIALS=./config/credentials.json
```

### **Autenticación y Autorización**
```python
# Niveles de acceso:
1. Admin: Todo acceso
2. Supervisor: Procesar, ver reportes
3. Operador: Solo ejecutar procesos
4. Consultor: Solo lectura
```

---

## 🚀 **MIGRACIÓN DE CÓDIGO EXISTENTE**

### **Patrones de Migración**
```python
# Patrón 1: Tkinter → FastAPI Endpoint
# ANTES (AsociarNegociosActualOfi.py):
def guardar_asociaciones():
    # Lógica Tkinter
    # Guardar en Excel

# DESPUÉS (backend/services/asociacion_service.py):
class AsociacionService:
    async def guardar_asociaciones(self, data: dict):
        # Misma lógica de negocio
        # Guardar via ExcelWriter
        # Retornar JSON response

# Patrón 2: Script GUI → Servicio + React Component
# ANTES (Menú.py con 9 botones):
btn1 = Button(text="Convertir", command=run_script1)
# DESPUÉS:
# Backend: /api/procesamiento/pasos
# Frontend: <ProcessSteps step={currentStep} />
```

### **Mantenimiento de Lógica de Negocio**
```python
# Se mantiene intacto:
- Algoritmo fuzzy matching para asociación
- Lógica de extracción por coordenadas
- Cálculo de predicciones μ ± k·σ
- Procesamiento de presupuesto diario

# Se mejora:
- Manejo de errores (try/except → retry patterns)
- Logging centralizado
- Estado de procesos (persistencia PostgreSQL)
- Validación de datos (Pydantic models)
```

---

## 📈 **MÉTRICAS DE ÉXITO**

### **KPIs Técnicos**
```
1. Tiempo de procesamiento completo: < 5 minutos (actual: ~15-20 min)
2. Disponibilidad API: 99.9%
3. Tiempo respuesta endpoints: < 200ms
4. Cobertura tests: > 80%
5. Errores en producción: < 1 por semana
```

### **KPIs de Negocio**
```
1. Reducción tiempo operativo: 60% (3 personas → 1 persona)
2. Precisión asociación automática: > 95%
3. Tiempo detección errores: < 1 hora
4. Disponibilidad datos para Power BI: tiempo real
```

---

## 🛠️ **HERRAMIENTAS Y TECNOLOGÍAS**

### **Stack Tecnológico**
```
Backend:
- Python 3.12+
- FastAPI
- SQLAlchemy + PostgreSQL
- Pydantic
- Pandas + Openpyxl
- Google Cloud BigQuery Client

Frontend:
- React 19
- Vite
- Material-UI o Chakra UI
- Axios
- React Query
- Chart.js

DevOps:
- Docker + Docker Compose
- GitHub Actions
- PostgreSQL (local/dev)
- Nginx (reverse proxy)
```

### **Dependencias Críticas**
```txt
# requirements.txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
sqlalchemy==2.0.23
pandas==2.1.4
openpyxl==3.1.2
google-cloud-bigquery==3.12.0
python-jose[cryptography]==3.3.0
python-multipart==0.0.6
fuzzywuzzy==0.18.0
python-dotenv==1.0.0
```

---

## 🎨 **INTERFAZ DE USUARIO**

### **Dashboard Principal**
```
┌─────────────────────────────────────────────────┐
│  REFUGIO - SISTEMA DE PROCESAMIENTO             │
├─────────────────────────────────────────────────┤
│  [Métricas] [Procesamiento] [Locatarios] [BQ]   │
│                                                 │
│  📊 Estado General                              │
│  ├─ Archivos pendientes: 12                     │
│  ├─ Última ejecución: Hoy 09:30                 │
│  ├─ Tiempo promedio: 3.2 min                    │
│  └─ Errores últimos 7 días: 0                   │
│                                                 │
│  🔄 Procesamiento Guiado                        │
│  1. Conversión CSV      [✅ Completado]         │
│  2. Asociación Negocios [🔄 En Progreso]        │
│  3. Consolidar Locatarios [⏳ Pendiente]        │
│  4. Cargar Ventas       [⏳ Pendiente]          │
│  5. Sincronizar BigQuery [⏳ Pendiente]         │
│                                                 │
│  📈 Ventas del Mes                              │
│  └─ Gráfico lineal ventas diarias               │
└─────────────────────────────────────────────────┘
```

### **Componentes React Clave**
```jsx
// ProcessSteps.jsx - Flujo guiado
<ProcessSteps>
  <Step1Conversion />
  <Step2Asociacion />
  <Step3Consolidacion />
  <Step4CargaVentas />
  <Step5BigQuery />
</ProcessSteps>

// LocatariosTable.jsx - Tabla interactiva
<LocatariosTable 
  data={locatarios}
  onProcess={handleProcess}
  onFilter={handleFilter}
/>

// BigQueryStatus.jsx - Monitoreo
<BigQueryStatus 
  tables={tables}
  lastSync={lastSync}
  onSync={handleSync}
/>
```

---

## ✅ **CHECKLIST DE IMPLEMENTACIÓN**

### **Fase 1: Backend (0-30%)**
- [ ] FastAPI setup básico
- [ ] PostgreSQL configurado
- [ ] Autenticación JWT funcionando
- [ ] Modelos SQLAlchemy creados
- [ ] Servicio de configuración (Excel)
- [ ] Endpoints CRUD básicos

### **Fase 2: Servicios Core (30-60%)**
- [ ] ConversionService migrado
- [ ] AsociacionService migrado
- [ ] LocatariosService migrado
- [ ] VentasService migrado
- [ ] BigQueryService migrado
- [ ] Tests de integración

### **Fase 3: Frontend (60-85%)**
- [ ] React app creada
- [ ] Login y autenticación
- [ ] Dashboard con métricas
- [ ] Componente ProcesamientoSteps
- [ ] Integración completa API
- [ ] UI/UX finalizada

### **Fase 4: Módulos Avanzados (85-95%)**
- [ ] PredictionService implementado
- [ ] PresupuestoService implementado
- [ ] EventosService implementado
- [ ] ConfigService implementado
- [ ] Sistema de logs completo

### **Fase 5: Producción (95-100%)**
- [ ] Dockerización completa
- [ ] Tests finales (QA)
- [ ] Documentación técnica
- [ ] Guía de despliegue
- [ ] Backup y recovery plan

---

## 🔄 **PLAN DE MIGRACIÓN PROGRESIVA**

### **Estrategia de Migración**
```
Semana 1-2: Backend base + PostgreSQL
Semana 3-4: Migrar servicios uno por uno
Semana 5-6: Frontend básico + integración
Semana 7-8: Módulos avanzados
Semana 9: Testing + deployment

Método: "Strangler Fig Pattern"
- Nuevo sistema corre en paralelo
- Migrar funcionalidad por funcionalidad
- Validar cada módulo antes de continuar
- Rollback fácil si hay problemas
```

### **Validación por Módulo**
```python
# Para cada servicio migrado:
1. Ejecutar tests con datos reales
2. Comparar resultados con script original
3. Validar en ambiente staging
4. Aprobación usuario final
5. Documentar diferencias (si las hay)
```

---

## 📞 **SOPORTE Y MANTENIMIENTO**

### **Documentación a Entregar**
1. **Guía de instalación** (Docker, manual)
2. **API Documentation** (Swagger/OpenAPI)
3. **User manual** (paso a paso operativo)
4. **Troubleshooting guide** (errores comunes)
5. **Backup procedures** (Excel, PostgreSQL, BigQuery)

### **Soporte Post-Implementación**
```
Primer mes: Soporte completo
Meses 2-3: Soporte parcial
Mes 4+: Soporte bajo demanda

SLA:
- Respuesta crítica: 2 horas
- Respuesta normal: 24 horas
- Updates mensuales: primeros 3 meses
```

---

**Última actualización:** `09/03/2026`  
**Estado:** `PLANIFICACIÓN COMPLETADA`  
**Siguiente paso:** `INICIAR ETAPA 1 - BACKEND CORE`