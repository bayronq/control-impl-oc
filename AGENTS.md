# AGENTS.md

## Stack
- Node.js 20 / Express 4 / EJS templates
- PostgreSQL 15 (containerized)
- Single file: `server.js` (all routes, DB init, auth logic)
- No tests, no linting, no typecheck

## Dev Workflow
```bash
npm install
cp .env.example .env    # configure DB_PASSWORD at minimum
mkdir -p logs && chmod 777 logs
npm start               # runs node server.js
```

## Docker Workflow
```bash
npm run docker:up       # docker compose up -d
npm run docker:rebuild  # rebuild + restart
npm run docker:logs     # tail logs
npm run docker:clean    # docker compose down -v
```

## Key Implementation Details

- **DB init**: `initializeDatabase()` runs on every start (`server.js:72`). Creates tables and seeds `tipos_instalacion` + `estados` if empty.
- **Auth**: Falls back to local (bcrypt) if LDAP not enabled or unavailable (`server.js:284`). Set `ENABLE_DOMAIN_LOGIN=true` for domain auth.
- **Logging**: JSONL files at `logs/logs-YYYY-MM-DD.jsonl`. Uses `LOGS_DIR` env var (default `/logs` in container, `./logs` on host).
- **Session**: Stored in PostgreSQL `session` table via `connect-pg-simple`.
- **Soft delete**: `DELETE` routes set `activo=false` (usuarios, encargados, tipos_instalacion, estados).

## ServiceNow Integration
- `SERVICENOW_URL` env var sets base URL
- `getServiceNowUrl()` appends `?entity_id={caso}&mode=detail` (line 218)

## Database Schema
Tables: `usuarios`, `encargados`, `tipos_instalacion`, `estados`, `instalaciones`, `session`

Pre-seeded states: `pendiente`, `previo_mesa`, `en_curso`, `retornado`, `cancelado`, `rollback`, `finalizado`