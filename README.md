# Datta — gestión de restaurantes

App de mesas, pedidos, caja, stock y facturación electrónica (AFIP/ARCA) para restaurantes.
Corre **sin Supabase ni Lovable**: Postgres propio + un backend Node (Fastify) que también sirve el frontend (Vite + React).

```
navegador ──► Fastify (backend/)  ──► Postgres
              ├─ /api/auth/*        login, sesión por cookie httpOnly
              ├─ /api/db/query|rpc  motor de consultas (RLS de Postgres hace la seguridad)
              ├─ /api/events        tiempo real (SSE ← LISTEN/NOTIFY)
              ├─ /api/public/*      carta/QR del cliente (sin login, validado)
              ├─ /api/fn/*          AFIP, usuarios, delivery, IA, reportes
              ├─ /api/storage, /files   imágenes y comprobantes (disco/volumen)
              └─ /*                 frontend compilado (SPA)
```

## Cómo funciona la seguridad
- El **esquema y las políticas RLS** vienen de las migraciones originales (`supabase/migrations`, convertidas en `backend/sql/010_schema.sql`) más `100_hardening.sql` (cierra fugas entre establecimientos).
- Cada request corre en una transacción con `SET LOCAL ROLE authenticated` y el usuario de la sesión (`auth.uid()`), así que **Postgres aplica RLS aunque el backend tuviera un bug**.
- El rol `anon` no tiene acceso a tablas; la carta del QR usa rutas públicas con validación (`routes/public.ts`).
- La clave privada de AFIP se guarda **cifrada** (AES-256-GCM, `SECRETS_KEY`) y el navegador no puede leerla.

## Desarrollo local
```bash
# 1) Postgres 16 (cualquiera) y variables
cp backend/.env.example backend/.env      # completar DATABASE_URL, APP_DB_PASSWORD, APP_DATABASE_URL
cd backend && npm ci && npm run migrate   # crea esquema, roles y rol datta_app
npx tsx src/cli/createUser.ts admin@tu.com 'Clave-segura' superadmin   # primer usuario
npm run dev                               # API en :8081

# 2) frontend (otra terminal, en la raíz)
npm ci && npm run dev                     # :8080, proxy de /api y /files a :8081
```
Tests (necesitan un Postgres migrado y `DATABASE_URL`): `cd backend && npm test`
(RLS por rol, motor de consultas, sesiones, usuarios, storage, delivery, AFIP, carta pública).

## Despliegue en Coolify
Una imagen (`Dockerfile` en la raíz: compila frontend + backend) y una base Postgres:
1. Recurso **PostgreSQL 16** privado (sin puerto público), base `datta`.
2. Aplicación desde este repo, Build Pack *Dockerfile*, puerto `8081`, dominio propio, y un **volumen persistente en `/data/uploads`**.
3. Variables de entorno (ver `backend/.env.example`):
   `DATABASE_URL` (dueño, para migraciones), `APP_DB_PASSWORD` y `APP_DATABASE_URL` (rol `datta_app`), `COOKIE_SECURE=true`,
   `PUBLIC_ORIGIN`, `SECRETS_KEY` (`openssl rand -hex 32`, **guardarla: sin ella no se descifra la clave AFIP**),
   `INTERNAL_CRON_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `CRON_ENABLED=true`.
4. Al arrancar aplica las migraciones pendientes (`node dist/db/migrate.js`) y levanta el servidor.

## Funciones programadas y IA
- `CRON_ENABLED=true`: análisis diario con IA a las 04:00 (hora Argentina) y reporte por mail según la hora configurada por cada establecimiento.
- Sin `ANTHROPIC_API_KEY` el asistente, la lectura de facturas y las sugerencias de IA responden 503 con un mensaje claro; el resto de la app funciona igual.
- Webhook de delivery (Rappi/PedidosYa): `POST /api/delivery-webhook?token=…` (también `/functions/v1/delivery-webhook` por compatibilidad).

## Migrar datos desde otra base
`backend/src/cli/loadData.ts` carga archivos JSON (`select json_build_object('t','tabla','rows',json_agg(t))…`) con `jsonb_populate_recordset`
y `session_replication_role=replica` (sin triggers ni orden de FKs), todo en UTF-8. Los usuarios y sus hashes bcrypt viven en `auth.users`.
