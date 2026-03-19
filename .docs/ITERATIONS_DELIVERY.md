1. Resumen Ejecutivo
El sistema "RefuChasky" orquesta la logística de delivery en el parque gastronómico "Refugio". Su misión es sincronizar la preparación de alimentos (vía sistema POS Fidelio) con la llegada física de conductores (Rappi, PedidosYa, etc.). Al automatizar el cruce de datos mediante un "MatchMaker" inteligente y notificar a los Runners en tiempo real, se minimizan los tiempos de espera, se evitan entregas erróneas y se optimiza el flujo en la estación de recojo.

2. Arquitectura del Sistema
Arquitectura orientada a microservicios monolíticos (Monolito Modular) con alta resiliencia.

Base de Datos: PostgreSQL 15+. Se utilizará el driver asyncpg con SQLAlchemy 2.0 para operaciones asíncronas de alto rendimiento.

Backend API: FastAPI (Python 3.10+). Maneja la API REST, el Webhook S2S (Server-to-Server) seguro y mantiene el pool de conexiones WebSocket con los dispositivos móviles.

Frontend (Móvil/Kiosco): React Native gestionado por Expo.

Estado de Servidor: TanStack Query (Caché, reintentos, refetching offline/online).

Estado de Cliente: Zustand (Manejo de UI, modales, sesión local).

Estilos y Ruteo: NativeWind v4 y Expo Router.

3. Modelo de Datos (PostgreSQL)
Esquema relacional normalizado para trazabilidad transaccional.

users: Control de accesos (id, nombre, pin_hash vía bcrypt, rol, is_active).

restaurants: Catálogo (id, fidelio_id UNIQUE INDEX, nombre, is_active).

orders: Ciclo de vida transaccional.

Campos clave: codigo_pedido (Indexado), plataforma, estado, numero_bolsas, locked_by_runner_id (Evita que dos runners tomen el mismo pedido).

driver_arrivals: Logs de Kiosco.

Campos clave: plataforma, placa, codigo_ingresado (Indexado, sujeto a typos), estado, matched_order_id (FK a orders, UNIQUE).

4. Integración y Contrato API (Fidelio)
Comunicación estricta de Servidor a Servidor (S2S). El móvil nunca habla con Fidelio.

Endpoint: POST /api/v1/webhooks/fidelio/order-ready

Seguridad: Validación de IP (Whitelist) y cabecera X-Fidelio-Signature (HMAC SHA-256) o X-API-Key.

Payload Esperado: JSON estricto validado vía Pydantic (tipo de evento, ID restaurante (alfanumérico), plataforma, código de pedido, bolsas).



5. Estados y Escenarios:

5.1. Diccionario de Estados Refactorizado (Enums para la BD)
A. Estados del Pedido (orders.estado)

🟢 LISTO: Cocina terminó. (Gatillo: Webhook Fidelio).

🟡 PENDIENTE_RECOJO: Runner va en camino al local. (Gatillo: Runner acepta).

🟠 PROCESO_ENTREGA: Bolsa en el estante de la estación. (Inicia timer de 30 min).

🔵 LISTO_PARA_ENTREGAR: Driver validado en puerta. (Gatillo: Match del sistema).

✅ ENTREGADO: Fin del ciclo exitoso.

🛑 DEVOLUCION: Superó los 30 min en PROCESO_ENTREGA. (Gestión: Admin Procesos).

❌ CANCELADO: Anulado desde origen. (Gestión exclusiva: Admin Pedido/Fidelio).

B. Estados del Conductor (driver_arrivals.estado)

🟡 ESPERANDO: Driver registrado en Kiosco. (Inicia timer de 20 min).

🔵 EN_MATCH: Validado contra un pedido activo.

✅ DESPACHADO: Se va con su pedido (Sincronizado con ENTREGADO).

🛑 ABANDONO: Superó 20 min, se fue, o Rappi reasignó el pedido.

5.2. Matriz de Escenarios Operativos (Casos de Uso Completos)
Aquí es donde el sistema demuestra su robustez. Estos son los 6 escenarios que FastAPI deberá resolver en milisegundos.

Escenario 1: El "Happy Path" (Flujo Perfecto)
Contexto: La cocina es rápida y el driver llega a tiempo.

Secuencia:

Fidelio envía pedido ➔ Estado: LISTO.

Runner lo busca ➔ Estado: PENDIENTE_RECOJO.

Runner lo deja en estante ➔ Estado: PROCESO_ENTREGA (Inicia timer 30m).

Driver llega y se registra en Kiosco ➔ Estado Driver: ESPERANDO.

FastAPI cruza datos ➔ Pedido cambia a LISTO_PARA_ENTREGAR | Driver a EN_MATCH.

Runner ve alerta roja, entrega la bolsa ➔ Pedido ENTREGADO | Driver DESPACHADO.

Escenario 2: El "Early Bird" (Driver llega antes que la comida)
Contexto: Rappi asignó a un driver que estaba en la puerta, pero el restaurante tiene fila.

Secuencia:

Driver se registra en Kiosco ➔ Driver: ESPERANDO (Inicia timer 20m).

FastAPI busca el pedido y no existe.

UI Runner muestra alerta naranja: "Driver esperando pedido no listo".

20 minutos después... Fidelio marca pedido ➔ LISTO.

Match inmediato de Prioridad 1 ➔ Pedido pasa directo de LISTO a LISTO_PARA_ENTREGAR. (El Runner corre a buscarlo y lo entrega directo, saltándose el estante).

Escenario 3: "Comida Fría" (Timeout del Pedido - 30 min)
Contexto: El pedido se preparó, pero ningún driver de la plataforma vino a buscarlo.

Secuencia:

Runner deja la bolsa en el estante ➔ PROCESO_ENTREGA (Timer: 00:00).

El tiempo corre. El driver nunca se registra en el Kiosco.

Timer llega a 30:00.

FastAPI ejecuta tarea en segundo plano ➔ Pedido cambia a DEVOLUCION.

Notificación al Admin Procesos: "Retirar pedido RAP-123 del estante (Expirado)".

Escenario 4: El "Ghosting" (Timeout del Driver - 20 min)
Contexto: El driver llega, se registra, se aburre de esperar y cancela el viaje en su app.

Secuencia:

Driver se registra ➔ Driver: ESPERANDO (Timer: 00:00).

El pedido sigue en cocina (no llega el Webhook de Fidelio).

Timer del driver llega a 20:00.

FastAPI ejecuta limpieza ➔ Driver cambia a ABANDONO.

Se limpia la pantalla del Runner para que deje de buscar a un conductor que ya se fue.

Escenario 5: Reasignación de Plataforma (El "Doble Driver")
Contexto: Un driver se registra (ESPERANDO), pero Rappi le quita el pedido y se lo da a otro. El segundo driver llega e ingresa el mismo código.

Secuencia:

Driver A registrado ➔ ESPERANDO.

Driver B llega e ingresa el mismo código en el Kiosco.

FastAPI detecta colisión de códigos activos.

Automáticamente marca al Driver A como ABANDONO (lo purga) y deja al Driver B como el nuevo ESPERANDO. El cronómetro de 20 min se reinicia.

Escenario 6: Error Tipográfico (Tolerancia FuzzyWuzzy)
Contexto: Pedido en PROCESO_ENTREGA con código "PED-5591". Driver digita "PE-5591".

Secuencia:

Driver digita mal en el Kiosco.

FastAPI no encuentra match exacto, aplica FuzzyWuzzy.

La similitud es del 92% (>90%).

FastAPI fuerza el match ➔ Pedido a LISTO_PARA_ENTREGAR. El sistema corrige el error humano sin que nadie lo note.



6. Lógica Core: Motor de Emparejamiento (MatchMaker)
Los conductores suelen cometer errores tipográficos al ingresar su código en el Kiosco (Ej. El pedido es RAP-4592 y digitan 4592 o RAP459).

Algoritmo: Uso de la librería thefuzz (basada en Levenshtein Distance) en Python.

Ejecución: Cuando llega un driver_arrival, una tarea asíncrona (BackgroundTasks de FastAPI) evalúa el codigo_ingresado contra los orders activos en estado LISTO.

Umbral de Match: Si la similitud > 85%, se auto-asigna (matched_order_id) y se dispara un evento WebSocket PRIORITY_UPDATE a los Runners. Si es menor, requiere "Match Manual" por el Runner.

7. Estrategia de Hardware y Frontend
Separación lógica y física de las aplicaciones móviles.

7.1. App Kiosco (SUNMI K2)
UX/UI: Pantalla dividida. Izquierda: Teclado numérico gigante. Derecha: Feedback visual de los datos ingresados.

Restricciones: Compilación nativa (.apk). Uso del MDM de SUNMI para "Kiosk Mode" (bloqueo de botones de navegación de Android). Sin estado persistente de usuario (App pública).

7.2. App Estación Delivery (Runner)
Seguridad: Login por PIN. JWT almacenado en expo-secure-store.

Sincronización:

Los WebSockets actualizan Zustand con los eventos en tiempo real.

Si hay pérdida de red (común en 4G/5G en parques), TanStack Query interviene. Al detectar reconexión, ejecuta automáticamente un refetch al endpoint GET /api/v1/orders/active para reconstruir la verdad absoluta antes de reabrir el túnel WebSocket.


8. Riesgos y Mitigación
Bloqueos de Base de Datos (Concurrencia): Múltiples Runners intentando tomar el mismo pedido.

Mitigación: Usar la cláusula SELECT FOR UPDATE SKIP LOCKED en PostgreSQL al momento de asignar el locked_by_runner_id.

Dependencia Externa (Fidelio): Retrasos de su equipo.

Mitigación: Se construirá un "Mock Webhook Sender" en Python durante la Semana 1 para inyectar datos falsos y no bloquear el desarrollo del Frontend.

Inestabilidad de Red (Runners): Desconexiones de WebSocket.

Mitigación: El sistema confía en el polling inteligente de TanStack Query como fallback si el WebSocket muere, garantizando que el Runner siempre vea la información actualizada al recuperar señal.
