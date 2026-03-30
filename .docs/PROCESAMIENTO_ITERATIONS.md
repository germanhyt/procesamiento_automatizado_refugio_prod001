

1)

Al procesar en Bigquery, y hacer un select stg_silver_raw los resultado de búsqueda me da "[{
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


11) 

Ahora desplegamos la aplicacion en el vps, preparamos los recursos y lo colocamos en README.md,
te comparto los siguientes archivos para ponernos en contexto

root@vmi2809688:/home/projects/shared# cat docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    container_name: nginx_proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./letsencrypt:/etc/letsencrypt
      - ./webroot:/usr/share/nginx/html
    #depends_on:
      #- evolution-api      # Referencia para orden de inicio, aunque estén en otro compose
      #- n8n
      #- estacionamiento_frontend
      #- estacionamiento_backend
    networks:
      - app_shared_network
      - supabase_default

  certbot:
    image: certbot/certbot:latest
    container_name: certbot
    volumes:
      - ./letsencrypt:/etc/letsencrypt
      - ./webroot:/webroot
    # entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --post-hook \"nginx -s reload\"; sleep 12h & wait $${!}; done;'"
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
    depends_on:
      - nginx
    networks:
      - app_shared_network

  postgres:
    image: postgres:15
    container_name: postgres
    restart: always
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app_shared_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    container_name: redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app_shared_network

networks:
  app_shared_network:
    external: true
  supabase_default:       # <--- AGREGAR ESTO
    external: true        # <--- AGREGAR ESTO

volumes:
  postgres_data:
    external: true
    name: projects_postgres_data  # <--- IMPORTANTE: Pon aquí el nombre que anotaste en el Paso 0
  redis_data:
    external: true
    name: projects_redis_data     # <--- IMPORTANTE: Pon aquí el nombre que anotaste en el Paso 0


ConsultasRefugio_backup_20260126_015247.tar.gz  a.out  n8n_backup
root@vmi2809688:~# cd /home/projects/estacionamiento/
root@vmi2809688:/home/projects/estacionamiento# ls
db  docker-compose.yml  github  nginx  old_backend  old_frontend  parking-system-gcb-backend-prod002  parking-system-gcb-frontend-prod002
root@vmi2809688:/home/projects/estacionamiento# cd ..
root@vmi2809688:/home/projects# cd shared/
root@vmi2809688:/home/projects/shared# ls
docker-compose.yml  letsencrypt  nginx.conf  webroot
root@vmi2809688:/home/projects/shared# cat docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    container_name: nginx_proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./letsencrypt:/etc/letsencrypt
      - ./webroot:/usr/share/nginx/html
    #depends_on:
      #- evolution-api      # Referencia para orden de inicio, aunque estén en otro compose
      #- n8n
      #- estacionamiento_frontend
      #- estacionamiento_backend
    networks:
      - app_shared_network
      - supabase_default

  certbot:
    image: certbot/certbot:latest
    container_name: certbot
    volumes:
      - ./letsencrypt:/etc/letsencrypt
      - ./webroot:/webroot
    # entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --post-hook \"nginx -s reload\"; sleep 12h & wait $${!}; done;'"
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
    depends_on:
      - nginx
    networks:
      - app_shared_network

  postgres:
    image: postgres:15
    container_name: postgres
    restart: always
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app_shared_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    container_name: redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app_shared_network

networks:
  app_shared_network:
    external: true
  supabase_default:       # <--- AGREGAR ESTO
    external: true        # <--- AGREGAR ESTO

volumes:
  postgres_data:
    external: true
    name: projects_postgres_data  # <--- IMPORTANTE: Pon aquí el nombre que anotaste en el Paso 0
  redis_data:
    external: true
    name: projects_redis_data     # <--- IMPORTANTE: Pon aquí el nombre que anotaste en el Paso 0


root@vmi2809688:/home/projects/shared# ls
docker-compose.yml  letsencrypt  nginx.conf  webroot
root@vmi2809688:/home/projects/shared# cat nginx.conf
# Resolver DNS para servicios Docker
resolver 127.0.0.11 valid=10s;
resolver_timeout 5s;

# ========== HTTP BLOCKS (puerto 80) ==========

# HTTP to HTTPS redirect para estacionamiento frontend
server {
    listen 80;
    server_name estacionamiento.gcbprojects.site;

    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTP to HTTPS redirect para estacionamiento backend
server {
    listen 80;
    server_name admin.estacionamiento.gcbprojects.site;

    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}


# BLOQUE PARA CONSULTAS
server {
    listen 80;
    server_name consultas.gcbprojects.site;

    # Esta ruta es CRÍTICA para que certbot funcione
    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}


# HTTP to HTTPS redirect (default - debe ir al final de los bloques HTTP)
server {
    listen 80 default_server;
    server_name _;

    # PERMITIR challenge http-01
    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
    }

    return 301 https://$host$request_uri;
}



server {
    listen 80;
    server_name chatwoot.gcbprojects.site;

    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 80;
    server_name supabase.gcbprojects.site;

    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}



# ========== HTTPS BLOCKS (puerto 443) ==========

# n8n subdomain
server {
    listen 443 ssl;
    server_name n8n.gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;

    # --- ACTUALIZA ESTAS RUTAS ---
    ssl_certificate /etc/letsencrypt/live/n8n.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.gcbprojects.site/privkey.pem;
    # -----------------------------

    # --- AGREGA ESTE BLOQUE AQUÍ ---
    # Esto asegura que Nginx sirva el reto de validación en lugar de pasarlo a n8n
    # MANTEN EL BLOQUE .well-known QUE PUSIMOS ANTES, ES ÚTIL PARA RENOVACIONES AUTOMÁTICAS
    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }
    # -------------------------------

    location / {
        proxy_pass http://n8n:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Evolution API subdomain
server {
    listen 443 ssl;
    server_name evolution.gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;

    location / {
        proxy_pass http://evolution-api:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Python app subdomain
server {
    listen 443 ssl;
    server_name python.gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;

    location / {
        proxy_pass http://python_app:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Estacionamiento Frontend
server {
    listen 443 ssl;
    server_name estacionamiento.gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;


    location / {
        proxy_pass http://estacionamiento_frontend:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Estacionamiento Backend API + WebSockets (combinado)
server {
    listen 443 ssl;
    server_name admin.estacionamiento.gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;


    client_max_body_size 100M;

    # WebSockets (Reverb) - DEBE ir ANTES de location /
    location /app/ {
        proxy_pass http://estacionamiento_reverb:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Backend API
    location / {
        proxy_pass http://estacionamiento_nginx_backend:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}

# gcbprojects.site (landing page)
server {
    listen 443 ssl;
    server_name gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;

    location / {
        return 200 "Welcome to GCB Projects!";
    }
}




# consultas.gcbprojects.site
server {
    listen 443 ssl;
    server_name consultas.gcbprojects.site;
    # USA ESTACIONAMIENTO SOLO COMO TEMPORAL PARA QUE NGINX ARRANQUE
    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;


    # ssl_certificate /etc/letsencrypt/live/consultas.gcbprojects.site/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/consultas.gcbprojects.site/privkey.pem;

    location / {
        proxy_pass http://consultas_python:8501;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
    location /_stcore/stream {
        proxy_pass http://consultas_python:8501/_stcore/stream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}



server {
    listen 443 ssl;
    server_name chatwoot.gcbprojects.site;

    # Usamos el certificado de estacionamiento TEMPORALMENTE para que Nginx no explote al reiniciar
    # ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;

    ssl_certificate /etc/letsencrypt/live/chatwoot.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chatwoot.gcbprojects.site/privkey.pem;


    location / {
        proxy_pass http://chatwoot_web:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}


server {
    listen 443 ssl;
    server_name supabase.gcbprojects.site;

    # Certificados temporales para poder reiniciar
    ssl_certificate /etc/letsencrypt/live/supabase.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supabase.gcbprojects.site/privkey.pem;

    # Mandamos TODO al guardia de seguridad (Kong)
    location / {
        proxy_pass http://supabase-kong:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 1. Rutas de la API de Supabase (Kong - Puerto 8000)
    # location ~ ^/(rest|graphql|auth|storage|realtime)/ {
    #    proxy_pass http://supabase-kong:8000;
    #    proxy_http_version 1.1;
    #    proxy_set_header Upgrade $http_upgrade;
    #    proxy_set_header Connection "upgrade";
    #    proxy_set_header Host $host;
    #    proxy_set_header X-Real-IP $remote_addr;
    #    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #    proxy_set_header X-Forwarded-Proto $scheme;
    # }

    # 2. Panel de Control de Supabase (Studio - Puerto 3001)
    # location / {
    #    proxy_pass http://supabase-studio:3000;
    #    proxy_http_version 1.1;
    #    proxy_set_header Upgrade $http_upgrade;
    #    proxy_set_header Connection "upgrade";
    #    proxy_set_header Host $host;
    #    proxy_set_header X-Real-IP $remote_addr;
    #    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #    proxy_set_header X-Forwarded-Proto $scheme;
    # }
}


root@vmi2809688:/home/projects/shared# ls -la
total 36
drwxr-xr-x 4 root    root     4096 Mar  1 03:56 .
drwxr-xr-x 8 root    root     4096 Mar  1 03:32 ..
-rw-r--r-- 1 root    root      138 Nov 23 03:14 .env
-rw-r--r-- 1 root    root     2102 Mar  1 04:33 docker-compose.yml
drwxr-xr-x 7 refugio refugio  4096 Mar 10 18:15 letsencrypt
-rw-r--r-- 1 root    root    10798 Mar  1 04:48 nginx.conf
drwxr-xr-x 3 refugio refugio  4096 Oct  6 03:08 webroot
root@vmi2809688:/home/projects/shared# cat .env
# Postgres
POSTGRES_USER=evouser
POSTGRES_PASSWORD=strongpassword123!
POSTGRES_DB=evolutiondb

# Redis
REDIS_PASSWORD=strongredispass456!
root@vmi2809688:/home/projects/shared#


12)

Ahora lo que haremos es planificar con la siguiente refactorización,

a) Respeto a las rutas:
- ruteamos también cada módulo con buenas prácticas 
- Usemos un AppRoutes como componente (Private y Public Routes), Outlets, y ruta de página no encontrada
- Redirección luego de login a la página de bienvenida (simple)

b) Respecto a la integración con Drive
- Cambio en el repositorio de archivos, primero una propuesta de librería que funcione como filStore, donde como primero proceso se cargará los archivos/reportes de los diferentes locatarios mediante un página web expuesta de forma pública mediante una ruta  (Fuentes de datos). Estos archivos cargados (excel o csv) lo organizamos dentro con carpetas semanales y dentro por carpeta de locatario (/semana1/locatario1/) la semana son de lunes a domingo (semana11_09_15_marzo por ejemplo) estos se van generando automáticamente al cargar un nuevo archivo, trabajamos con la zona horario de Lima
- Si es necesario indicarme una modifcación en docker para la persistencia de archivos en producción



c) 
Planificamos, no modificamos

Ahora en el procesamiento tengo las siguientes observaciones
- Limpíeza: solo un alert de verificación para proceder con el siguiente proceso que es la consolidación
- Consolidación (Opcional): La idea es que en base las corrdenas mapeadas en BaseCarga (veriicar la duplicidad de registros) y consolidar los diferentes archivos de dicha semana en uno solo es decir unirlos en un tabla de datos (ojo todos con todos los campos) 
- Asociar: Mantiene su lógica
- Procesar Ventas: Mantiene su lógica
- Procesar a la nube: Mantiene su lógica pero revisemos que no cargue data en nulls,

Además:
Estoy requiriendo poder tener un modal en el módulo para poder gestionar los archivos excel por semana, permitir visaulizar los archivos, descargar en bloque (.zip), y cargar en bloque y si coincide nombres reemplazarlos, cargar un nuevo archivo o poder eliminar. Esto ya que verificaré el contenido de los archivos y de ser necesario se modificará de forma interna (limpieza)


13)

- Genera el resumen detallado de la lógica de procesamiento manual que se ha planteado o que se tiene implementado, considera graficar con lineas el flujo 

- Está ocurriendo un problema y es que los archivos que se están cargando en fuentes son de la semana anterior pero recién lo están cargando ahora,
la cuestión es que si bien lo pueden cargar las fuentes en cualquier fecha, la cuestión es que en el flujo de procesamiento poder permitirm al usuario pueda elegir el rango de fechas, ahora no es que se pueda guardar los archivos en una carpeta solamente sino en varias y ahí el tema también, qué me recomiendas y dame los pros y contras



Para el módulo de flujo diario, pienso lo siguiente:
- en /fuentes donde cargamos los reportes, a la carpeta donde se carga los llamamos "cierre_caja/locatario" como la idea de pendientes que me comentas, y que luego de procesarlo los pasamos a una carpeta de "procesados/fecha_actual_de_carga/locatario" en el ecosistema filestore, revisando al cargar un archivo el usuario concatenar el hash de fecha luego del nombre del archivo ejemplo "SISA_20260322_221334"

- ya dentro del procesamiento para no complicar al operador, podría darle opciones que diga "Procesar semana actual", "Procesar ultima semana completa", "Procesar rango libre"; esto para aplicarlo en el proceso de "consolidar", "Conversión" que debe apuntar al fileStore también, y el de "Asociar"

- ahora para la asociación manual "Explorador CierreCaja", tendría que apuntar al cierre_caja pero del filestore, además la idea es refactorizar el "Gestionar archivos" a como se está planificando

- Refactorizaar frontend de /fuentes /legacy respetando la arquiectectura y diseño del sistema

**Implementado (FileStore cierre_caja):**
- Estructura: `uploads/cierre_caja/{locatario}/` pendientes; `uploads/cierre_caja/{locatario}/_consolidados/{etiqueta}.csv`; `uploads/procesados/{YYYY-MM-DD}/{locatario}/` (API listado; mover a procesados pendiente de automatizar al cerrar flujo).
- Upload añade sufijo `_YYYYMMDD_HHmmss` si el nombre aún no lo trae; `upload-bulk` con `replace=true` conserva el nombre del cliente (sobrescribe).
- Consolidar por locatario + parámetros `modo_rango`, `fecha_inicio`, `fecha_fin`. Criterio de inclusión: fecha en nombre `_YYYYMMDD_` en rango **o** fecha de modificación del archivo (Lima) en rango **o** sin fecha en nombre (legacy); si tras el filtro no queda ningún archivo pero hay pendientes, se consolidan **todos** los pendientes del locatario. Tras unir archivos, `Fecha` se normaliza antes de `drop_duplicates`.
- Asociar igual para fechas en Activas.
- Gestionar archivos (modal): pestaña **Cierre caja** (pendientes + _consolidados, eliminar por zona) y **Procesados** (solo visualización por fecha).
- **Migración manual:** archivos antiguos en `uploads/semana*_.../` no se leen con la nueva lógica; mover a `cierre_caja/{codigo_locatario}/`.


- Refactorizamos el drag an drop principal usando react-dropzone y permitiendo subir varios archivos a la vez

- revisamos la lógica del proceso opcional de consolidar, veo que no se está consolidando los archivos los registros de los archivos individuales


- En "Vista previa: sales_df" opción de lazy loading, para cargar los demás datos del sales_df

- En "Gestionar archivos" no está funcional la sección de "Cargar en Bloque (Cierre de caja)" corregimos


....

- ya tengo los archivos individuales lo he consolidaod también, he aplicado la conversión aunque no era necesario, lo he asociado y luego ahora al procesar las ventas veo que no se llega a cargar en sales_df en el archivo Config,  en el alert mostrar la cantidade  registros procesados,
- además también el procesamiento hacia bigquery observo que registros se ingestan con campos nulos,
verificamos el correcto funcionamiento de estos, si es necesario hacemos test


- ya vi un error  notorio al usarlo, en el consolidado al aplicar por semana anterior (solo se procesa 16 al 18 de marzo cuando en realidad debe consolidar entre el 16 al 26), al aplicar por semana actual (si se consolida con todos los datos cuando en realidad la semana actual va desde 23 al 29), por rango si se obedece, mi consulta es se está referenciando el campo "fecha" para la consolidación?,
revisemos, testeamos y corregimos



- consuta, no modifiques,
dame el flujo lógica a detalle de cada proceso del flujo de procesamiento,
desde la limpieza, consolidado, convertir, asociar, procesa_ventas, y procesar_nube,
cada uno de estos con diferentes escenario

## Qué pasaba

1. **La semana no se definía con la columna `Fecha` del CSV**  
   En `semana_actual` y `ultima_semana` solo se usaba `archivo_en_rango_consolidacion` (fecha del sufijo `_YYYYMMDD_` en el nombre + `mtime`). Eso **no** es la fecha de operación del reporte. Muchos archivos tienen en el nombre la **fecha de carga** (p. ej. `..._20260323_...` aunque el reporte sea del 19/03), así que:
   - En **última semana** quedaban fuera días que sí estaban en el CSV → solo veías algo como 16–18.
   - En **semana actual**, si **ningún** archivo pasaba el filtro, el código hacía **fallback y consolidaba todos los pendientes** → mezclabas semanas enteras.

2. **`rango_libre` ya filtraba por `Fecha`**; los otros modos no.

## Cambios hechos

- **`consolidar_desde_filestore`**: para cada locatario se leen **todos los archivos pendientes** y el recorte del período es **siempre** por la columna **`Fecha`** en `[rango_inicio, rango_fin]` (igual criterio que en rango libre). Eliminado el fallback que metía todos los archivos cuando el filtro por nombre fallaba.
- **`filtrar_filas_por_rango_fecha`** en `file_store_service.py`: centraliza el filtro; usa `pd.to_datetime(..., format="mixed", dayfirst=True)` para que en una misma columna convivan **ISO** (`2026-03-20`) y **d/m/Y** sin que pandas deje filas en `NaT` (bug típico del `to_datetime` vectorizado con formatos mezclados).
- **`rango_desde_modo`**: alias `semana_anterior` / `ultima_semana_completa` → `ultima_semana` por si en algún cliente llega otro nombre.
- **Tests**: `backend/tools/test_consolidacion_rango_fecha.py` (filtro por fechas + semana actual / anterior con fecha fija simulada).

```bash
cd backend && python tools/test_consolidacion_rango_fecha.py
```
## Sobre el calendario
La **semana** sigue siendo **lunes–domingo** en **America/Lima** (p. ej. con hoy 25/03/2026: semana actual **23–29/03**, anterior **16–22/03**). Si decías “16 al 26”, en calendario ISO serían **dos semanas** distintas; si necesitas un bloque personalizado, usa **rango libre**.

**Nota:** al leer todos los pendientes por locatario, si en el futuro hay muchísimos archivos históricos en la misma carpeta, podría pesar más CPU; si hace falta, se puede añadir un filtro previo por nombre/mes siempre **después** de seguir filtrando por `Fecha`.



- al procesar a bgiquery veo que no se carga por completo los registros del archiv config>sales_df, de un tal apróx de 300 registros solo 27 se están cargando, revisamos a qué se debe? testeamos si es necesario,


- al procesar las ventas a sales_df, veo que no se está procesando de forma correcta los registros me sale "No se procesaron filas: revise Activas (Cargar=1), rutas en FileStore y BaseCarga por locatario.", estos cómo se están procesando y qué pasa con los archivos al aplicarse el consolidado?, se procesan y se guarda en la otra carpeta de procesados?



- ok, veo que hay un problema en la lógica de procesar ventas, entiendo desde el aplicar o no consolidación, veo que al aplicar el consolidado y siguiendo con los pasos hasta procesar ventas veo que solo se procesar el primer archivo individual y no el consolidado como tál, además requiero primero plantear bien la solución en este caso para que el flujo pueda cubrir los difernetes escenarios incluso luego al moverse los archivos a procesados


- en "Gestionar archivos" generamos una preview en de los archivos











....

## Despliegue en VPS (Docker)

Esta guía asume un VPS con Nginx como proxy inverso y la red Docker compartida `app_shared_network`.

### Requisitos previos

1. **Docker y Docker Compose** instalados.
2. **Nginx** configurado (ej. en `/home/projects/shared`).
3. **Red Docker:** `app_shared_network` creada.
4. **Google Drive:** Carpeta principal compartida con la Service Account (Editor).
5. **GCP:** `credentials.json` en `backend/config/credentials.json`.

### 1. Clonar y entrar al proyecto

```bash
cd /home/projects
git clone [URL_DEL_REPO] 001_procesamiento_refugio
cd 001_procesamiento_refugio
```

### 2. Variables de entorno

Crear `.env` en la raíz del proyecto.

> **Importante:** En producción se usan **IDs de Google Drive** (no rutas locales). Obtenerlos de la URL de la carpeta (ej. `https://drive.google.com/drive/folders/ID_AQUI`).

```env
# API
VITE_API_URL="https://api.datarefugio.gcbprojects.site/api"
API_URL="https://api.datarefugio.gcbprojects.site/api"

# App
PROJECT_NAME="Refugio - Sistema de Procesamiento"
VERSION="1.0.0"
API_STR="/api"

# Base de datos
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=refugio_procesamiento_app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_password_seguro

# JWT
SECRET_KEY=tu_secret_key_seguro
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Google Drive (IDs de carpeta/archivo)
DRIVE_ID_ARCHIVO_CONFIGURACION="..."
DRIVE_ID_CARPETA_CIERRECAJA="..."
DRIVE_ID_CARPETA_PROCESADOS="..."

# Big Query
BQ_PROJECT_ID=tu_proyecto
BQ_DATASET=Ventas
GOOGLE_APPLICATION_CREDENTIALS=./config/credentials.json

# Power BI (Azure Entra ID)
PBI_CLIENT_ID="..."
PBI_CLIENT_SECRET="..."
PBI_TENANT_ID="..."
PBI_WORKSPACE_ID="..."
PBI_REPORT_ID="..."
```

### 3. Nginx (proxy global)

En el `nginx.conf` del proxy (ej. `/home/projects/shared/nginx.conf`):

- Redirigir HTTP → HTTPS para `datarefugio.gcbprojects.site` y `api.datarefugio.gcbprojects.site`.
- Servidor HTTPS para **Frontend:** `proxy_pass http://datarefugio_frontend:80`.
- Servidor HTTPS para **Backend:** `proxy_pass http://datarefugio_backend:8080` con headers `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`.

Reiniciar Nginx:

```bash
docker restart nginx_proxy
```

### 4. Levantar la aplicación

```bash
docker compose up -d --build
```

---

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `docker compose up -d --build` | Construir y levantar en segundo plano. |
| `docker logs -f datarefugio_backend` | Ver logs del backend. |
| `docker logs -f datarefugio_frontend` | Ver logs del frontend. |
| `docker compose restart` | Reiniciar todos los servicios. |
| `git pull && docker compose up -d --build` | Actualizar código y reconstruir. |

### Certificados SSL (Certbot)

```bash
docker exec -it certbot certbot certonly --webroot -w /webroot \
  -d datarefugio.gcbprojects.site \
  -d api.datarefugio.gcbprojects.site \
  --email tu@email.com --agree-tos --no-eff-email
```