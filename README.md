# Control de Instalaciones y Despliegues

Sistema web para el control y seguimiento de instalaciones y despliegues de software.

## Características

- **Autenticación LDAP**: Login con usuarios del dominio `tudominio.local`
- **Gestión de Estados**: Estados personalizables (Pendiente, En Curso, Finalizado, etc.)
- **Caso Asociado**: Campo obligatorio con enlace directo a ServiceNow
- **Logging**: Registro de todas las acciones en Loki
- **Filtros Avanzados**: Por mes, año, encargado, día, ambiente y estado
- **Reportes**: Estadísticas mensuales y por encargado

## Requisitos

- Docker y Docker Compose
- Node.js 20+ (para desarrollo local)

## Instalación con Docker

```bash
# 1. Clonar el repositorio
git clone git@github.com:bayronq/control-impl-oc.git
cd control-impl-oc

# 2. Copiar archivo de variables de entorno
cp .env.example .env

# 3. Editar .env con las credenciales correctas
# - DB_PASSWORD: Contraseña de PostgreSQL
# - LDAP_URL: URL del servidor LDAP (dc.tudominio.local)
# - SESSION_SECRET: Clave secreta para sesiones

# 4. Iniciar los contenedores
docker compose up -d

# 5. Verificar que esté corriendo
docker compose ps
```

La aplicación estará disponible en: **http://localhost:3000**

## Variables de Entorno

Crea el archivo `.env` basado en `.env.example`:

```env
# Aplicación
PORT=3000
NODE_ENV=production
SESSION_SECRET=your_random_secret

# Base de datos PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=instalaciones
DB_USER=admin
DB_PASSWORD=your_password

# LDAP (Autenticación de dominio)
LDAP_URL=ldap://dc.<tudominio>.<local>:389
LDAP_BASE_DN=dc=tudominio,dc=local

# ServiceNow
SERVICENOW_URL=https://<urlmesadeservicio>/ui/changes

# Loki (Logging)
LOKI_URL=http://loki:3100/loki/api/v1/push
```

## Persistencia de Datos

Los datos se persistén en:
```
/work/volumes/control-impl-oc-data      # PostgreSQL
/work/volumes/loki-data                 # Loki
```

## Scripts npm

```bash
npm run docker:build    # Construir imágenes Docker
npm run docker:up       # Iniciar contenedores
npm run docker:down     # Detener contenedores
npm run docker:logs     # Ver logs en vivo
npm run docker:rebuild  # Reconstruir y reiniciar
npm run docker:clean    # Eliminar contenedores y volúmenes
```

## Comandos Docker útiles

```bash
# Ver estado de contenedores
docker compose ps

# Ver logs de la app
docker compose logs -f app

# Ver logs de Loki
docker compose logs -f loki

# Acceder a PostgreSQL
docker exec -it postgres-instalaciones psql -U admin -d instalaciones

# Acceder a Loki (Dashboards)
# http://localhost:3100

# Reiniciar servicios
docker compose restart

# Detener y eliminar
docker compose down

# Reconstruir desde cero (elimina datos)
docker compose down -v
docker compose up --build -d
```

## Estructura del Proyecto

```
├── public/           # Archivos estáticos (CSS, JS)
├── views/            # Plantillas EJS
│   ├── index.ejs     # Página principal
│   └── login.ejs     # Página de login
├── server.js         # Servidor Node.js
├── package.json      # Dependencias
├── Dockerfile        # Imagen Docker
├── docker-compose.yml # Orquestación
├── .env              # Variables de entorno (no subir a git)
└── .env.example      # Template de variables
```

## Base de Datos

- **Motor:** PostgreSQL 15
- **Puerto:** 5432
- **Usuario:** admin

### Tablas

- `encargados` - Personas responsables de instalaciones
- `tipos_instalacion` - Tipos de instalaciones (API, servicio web, etc.)
- `estados` - Estados de instalaciones
- `instalaciones` - Registro de instalaciones realizadas

### Estados Predefinidos

| Código | Descripción | Color |
|--------|-------------|-------|
| pendiente | Pendiente | Amarillo |
| previo_mesa | Previo a Mesa | Cyan |
| en_curso | En Curso | Azul |
| retornado | Retornado | Naranja |
| cancelado | Cancelado | Rojo |
| rollback | Rollback | Púrpura |
| finalizado | Finalizado | Verde |

## API Endpoints

### Encargados
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/encargados` | Listar encargados |
| POST | `/api/encargados` | Crear encargado |
| PUT | `/api/encargados/:id` | Actualizar encargado |
| DELETE | `/api/encargados/:id` | Eliminar encargado |

### Tipos de Instalación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tipos-instalacion` | Listar tipos |
| POST | `/api/tipos-instalacion` | Crear tipo |
| PUT | `/api/tipos-instalacion/:id` | Actualizar tipo |
| DELETE | `/api/tipos-instalacion/:id` | Eliminar tipo |

### Estados
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/estados` | Listar estados |
| POST | `/api/estados` | Crear estado |
| PUT | `/api/estados/:id` | Actualizar estado |
| DELETE | `/api/estados/:id` | Eliminar estado |

### Instalaciones
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/instalaciones` | Listar instalaciones |
| GET | `/api/instalaciones?mes=04&anio=2026` | Filtrar por mes/año |
| GET | `/api/instalaciones?encargado=Juan&ambiente=qa` | Filtros múltiples |
| POST | `/api/instalaciones` | Crear instalación |
| PUT | `/api/instalaciones/:id` | Actualizar instalación |
| DELETE | `/api/instalaciones/:id` | Eliminar instalación |

### Reportes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/reportes/mensual?mes=04&anio=2026` | Reporte mensual |
| GET | `/api/reportes/encargados?mes=04&anio=2026` | Reporte por encargado |

## Desarrollo Local (sin Docker)

```bash
# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env
# Editar .env con credenciales locales

# Iniciar servidor
npm start
```

## Seguridad

- **NO** subir el archivo `.env` al repositorio
- Usar contraseñas seguras en producción
- Mantener `node_modules/` fuera del repositorio
- Todas las acciones se registran en Loki para auditoría
