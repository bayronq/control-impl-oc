# Control de Instalaciones y Despliegues

Sistema web para el control y seguimiento de instalaciones y despliegues de software.

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

# 3. Iniciar los contenedores
docker compose up -d

# 4. Verificar que esté corriendo
docker compose ps
```

La aplicación estará disponible en: **http://localhost:3000**

## Variables de Entorno

Crea el archivo `.env` basado en `.env.example`:

```env
# Aplicación
PORT=3000
NODE_ENV=production

# Base de datos PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=instalaciones
DB_USER=admin
DB_PASSWORD=tu_contraseña_segura
DB_SSL=false

# PostgreSQL
POSTGRES_DB=instalaciones
POSTGRES_USER=admin
POSTGRES_PASSWORD=tu_contraseña_segura
```

## Persistencia de Datos

Los datos de PostgreSQL se persistén en:
```
/work/volumes/control-impl-oc-data
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

# Ver logs
docker compose logs -f

# Acceder a PostgreSQL
docker exec -it postgres-instalaciones psql -U admin -d instalaciones

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
- `instalaciones` - Registro de instalaciones realizadas

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/encargados` | Listar encargados |
| POST | `/api/encargados` | Crear encargado |
| PUT | `/api/encargados/:id` | Actualizar encargado |
| DELETE | `/api/encargados/:id` | Eliminar encargado |
| GET | `/api/tipos-instalacion` | Listar tipos |
| POST | `/api/tipos-instalacion` | Crear tipo |
| PUT | `/api/tipos-instalacion/:id` | Actualizar tipo |
| DELETE | `/api/tipos-instalacion/:id` | Eliminar tipo |
| GET | `/api/instalaciones` | Listar instalaciones |
| POST | `/api/instalaciones` | Crear instalación |
| PUT | `/api/instalaciones/:id` | Actualizar instalación |
| DELETE | `/api/instalaciones/:id` | Eliminar instalación |
| GET | `/api/reportes/mensual` | Reporte mensual |
| GET | `/api/reportes/encargados` | Reporte por encargado |

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
