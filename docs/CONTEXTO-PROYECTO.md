# Datta (Mesa Order): contexto del proyecto

Documento para continuar el trabajo desde otra PC. No contiene claves: esas se pasan por fuera del repo (USB / gestor de claves).

## Estado actual (2026-10-06)
- **Producción**: https://datta.sistemagenesis.tech, app Coolify `datta-v2` (uuid `grtiawqlkzzisljfpbqvh1ah`), se despliega desde la rama `postgres-backend`.
- **Base de datos**: Postgres 16 en Coolify, recurso `datta-db` (uuid `3pu74sogqrlckimckjniu2vy`), base `datta` (no `postgres`). Sin puerto público: se entra por SSH al VPS y `docker exec`.
- **App vieja** (respaldo, no usar): `http://datta-old.177.7.37.52.sslip.io`, app Coolify `thp0qsakmm1gc60b10cdnwvv` (rama `main`, Supabase autoalojado `vdhu5lpjfsmdbgo1pd4zdv2m`). No apagar sin preguntar.
- **Producción original en Lovable** (proyecto `21bdd497-03bb-4280-8b4b-e4071a2b47fa`, dattagestion.com): sigue funcionando y no se toca. Solo lectura. Es donde hoy están los datos reales de los clientes hasta el cambio definitivo.
- VPS Hostinger `177.7.37.52`, Coolify en `https://coolify.sistemagenesis.tech`, GitHub `briaanmaarconi-commits/datta`.

## Arquitectura (resumen; detalle en README.md)
- Frontend Vite + React + TS en `src/`. Cliente tipo supabase-js en `src/lib/db.ts` que habla con el backend propio.
- Backend Fastify + `pg` en `backend/`. Cada request corre en una transacción con `SET LOCAL ROLE` y claims JWT, así que Postgres hace cumplir el RLS original.
- Migraciones en `backend/sql/` (000 a 103). Se ejecutan al arrancar el contenedor.
- Sesión por cookie, realtime por SSE (LISTEN/NOTIFY), archivos en `/data/uploads`.
- Un solo Docker image (`Dockerfile` en la raíz) sirve API + SPA.
- Funciones portadas en `backend/src/fn/`: AFIP, create-user, delivery, IA (Gemini o Claude), reportes por mail, cobranzas/Mercado Pago.
- Cobranzas: `backend/src/lib/billing*.ts`, pantalla `src/pages/superadmin/Billing.tsx`. Estados trial/active/past_due/suspended/cancelled, 25 días de gracia.
- Impresión de comandas: desde el navegador de la PC de cocina (`src/pages/kitchen/Orders.tsx`, `window.print`). Se imprime cada pedido nuevo y cada producto agregado ("COMANDA - AGREGADO").

## Desarrollo local
1. `npm install` en la raíz y en `backend/`.
2. `backend/.env` (ver `backend/.env.example`). Apunta a una base de desarrollo; si es la del VPS: `ssh -i <clave> -N -L 55432:127.0.0.1:55432 root@177.7.37.52`.
3. Backend: `cd backend && npx tsx src/server.ts` (puerto 8081). Frontend: `npx vite --port 8080`.
4. Tests del backend: `cd backend && npm test`. Typecheck: `npx tsc --noEmit -p tsconfig.app.json`.
5. Usuarios de desarrollo: `backend/src/cli/devUsers.ts` crea logins locales a partir de los perfiles copiados (nunca correr contra la base de producción).

## Desplegar
- Hacer push a `postgres-backend` y desplegar desde Coolify (botón Deploy en la app `datta-v2`), o por la API de Coolify con un token propio:
  `POST /api/v1/deploy?uuid=grtiawqlkzzisljfpbqvh1ah&force=true` y consultar `/api/v1/deployments/<uuid>`.
- Variables de entorno de producción viven en Coolify (no en el repo): `DATABASE_URL`, `APP_DATABASE_URL`, `APP_DB_PASSWORD`, `SECRETS_KEY`, `GEMINI_API_KEY`, `PUBLIC_ORIGIN`, `CRON_ENABLED`, etc. Hacer backup de `SECRETS_KEY`: sin ella no se descifran los certificados AFIP guardados.
- Cambiar un dominio en Coolify requiere redeploy y que la otra app libere el dominio primero.

## Pendientes
1. Borrar 3 cuentas de prueba en la base de producción (`admin@datta-test.com`, `caja-test@datta-test.com`, `super-test@datta-test.com`, clave conocida; la última es superadmin).
2. Mercado Pago: token, secreto del webhook (variables `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`) y precio del plan.
3. AFIP: no se copiaron certificados ni claves de Lovable. Recomendado: generar CSR nuevo desde el sistema nuevo y autorizarlo en AFIP. Emisión real sin probar.
4. Delivery (Rappi/PedidosYa): credenciales sin copiar. 4 comprobantes de compra privados sin copiar.
5. Antes de que un cliente real pase al sistema nuevo: volver a copiar datos y usuarios desde Lovable justo antes (los datos actuales son del 5-6 de octubre) y que dejen de usar Lovable.
6. `RESEND_API_KEY` para reportes por mail; rotar claves que se pegaron en chats; apagar el stack viejo de Supabase y el contenedor `datta-dev-pg` cuando se confirme todo.
7. Fase B: analíticas de clientes (salud, MRR/churn, exportar a Excel).

## Reglas de trabajo
- Lovable producción: solo lectura, nunca modificar.
- Antes de algo destructivo (borrar datos, apagar servicios, mover dominios): preguntar.
- Siempre `git pull` antes de empezar y `git push` al terminar. Commits en español.
- Sin claves en el repo ni en el chat.
