# Datta (Mesa Order): contexto del proyecto

Documento para cualquiera que retome el trabajo (otra PC, otra sesión de Claude, el Proyecto "Datta" de claude.ai). No contiene claves: esas se pasan por fuera del repo.

**Últimos cambios: ver [CAMBIOS.md](CAMBIOS.md).** Ese registro se actualiza con cada push.

## Qué es Datta
Sistema de gestión para restaurantes y bares (Argentina), vendido por suscripción. Cada local ("establecimiento") tiene usuarios con distintos roles:
- **Administrador (dueño)**: carta, mesas y plano, personal, stock, costos, analíticas, historial, suscripción.
- **Caja**: turnos, cobro de mesas (pago combinado, cuenta corriente de empresas), facturación electrónica AFIP, delivery y pedidos telefónicos, platos del día.
- **Mozo**: toma pedidos desde el celular sobre el plano de mesas.
- **Cocina**: recibe los pedidos y los imprime como comandas, una por sector (fiambrería, principal, postre, bebida).
- **Superadmin (Datta)**: clientes, cobranzas, posibles clientes y agenda, restaurantes demo y modo espectador.
- **Cliente del restaurante (sin login)**: escanea el QR y ve la **carta digital** (`/carta/<id del local>`), califica platos y al mozo. El QR solo guarda esa dirección, así que la carta se puede cambiar sin reimprimir QR.

Pantallas en `src/pages/<rol>/` (admin, cashier, waiter, kitchen, superadmin, client, delivery, support).

## Estado actual (actualizado 2026-10-26)
- **Producción**: https://dattagestion.com, servida por la app Coolify `datta-v2` (uuid `grtiawqlkzzisljfpbqvh1ah`) desde la rama `postgres-backend`.
- **Base de datos**: Postgres 16 en Coolify, recurso `datta-db` (uuid `3pu74sogqrlckimckjniu2vy`), base `datta`. Sin puerto público: se entra por SSH al VPS.
- VPS Hostinger `177.7.37.52`, Coolify en `https://coolify.sistemagenesis.tech`, GitHub `briaanmaarconi-commits/datta`. El VPS también aloja otros proyectos del dueño (tienda Genesis, GenesisGYM, admin-hub).
- Monitoreo: UptimeRobot sobre dattagestion.com.
- Historia: el sistema nació en Lovable (Supabase). En octubre de 2026 se pasó a backend propio (Postgres + Fastify). Lovable y el Supabase viejo quedan solo como respaldo: no modificarlos.

## Arquitectura (resumen; detalle en README.md)
- Frontend Vite + React + TS + Tailwind/shadcn en `src/`. Cliente tipo supabase-js en `src/lib/db.ts` que habla con el backend propio.
- Backend Fastify + `pg` en `backend/`. Cada request corre en una transacción con `SET LOCAL ROLE` y claims JWT, así que Postgres hace cumplir el RLS.
- Migraciones SQL en `backend/sql/` (numeradas, van por la 132). Se ejecutan al arrancar el contenedor.
- Sesión por cookie, tiempo real por SSE (LISTEN/NOTIFY), archivos en `/data/uploads`.
- Una sola imagen Docker (`Dockerfile` en la raíz) sirve API + SPA.
- Funciones del backend en `backend/src/fn/`: AFIP, create-user, delivery, IA (Gemini o Claude), reportes por mail, cobranzas/Mercado Pago, demo.
- Cobro de la suscripción (`backend/src/lib/billing.ts`): vence al terminar la prueba y después cada mes. Aviso en Caja y Admin desde 7 días antes. Primera semana de atraso sin recargo, segunda +10%, tercera +20% (sobre el precio base), y a los 22 días se suspende. El admin paga subiendo el comprobante en Suscripción (se acepta al instante; el superadmin lo puede rechazar en Clientes → Pagos) o activando el débito automático de Mercado Pago. El cajero ve los avisos de vencimiento pero nunca los montos. El admin puede pedir la baja desde Suscripción con un motivo (tabla `cancellation_requests`); se aplica sola en el barrido diario el día del vencimiento, y el superadmin la ve en Cobranzas → Bajas pedidas.
- Impresión de comandas: desde el navegador de la PC de cocina/caja o con el agente de impresión local (paquete instalable).

## Desarrollo local
1. `npm install` en la raíz y en `backend/`.
2. `backend/.env` (ver `backend/.env.example`). Base de desarrollo en el VPS por túnel SSH al puerto 55432.
3. Backend: `npm --prefix backend run dev` (puerto 8081). Frontend: `npx vite --port 8080` desde la raíz del repo.
4. Tests del backend: `cd backend && npm test`. Typecheck: `npx tsc --noEmit -p tsconfig.app.json`.
5. Usuarios de desarrollo: `backend/src/cli/devUsers.ts` (nunca contra la base de producción).

## Desplegar
- Push a `postgres-backend` **no** despliega solo. Desplegar desde Coolify: app `datta-v2` → Redeploy. Verificar con `docker ps` en el VPS (la imagen lleva el hash del commit).
- Variables de producción en Coolify (no en el repo): `DATABASE_URL`, `APP_DATABASE_URL`, `APP_DB_PASSWORD`, `SECRETS_KEY`, `GEMINI_API_KEY`, `PUBLIC_ORIGIN`, `CRON_ENABLED`, etc. `SECRETS_KEY` es imprescindible para descifrar certificados AFIP.

## Pendientes conocidos (anotados el 2026-10-06; revisar cuáles siguen)
1. Mercado Pago: token, secreto del webhook y precio del plan.
2. AFIP: emisión real con certificados nuevos generados desde el sistema.
3. Delivery (Rappi/PedidosYa): credenciales.
4. `RESEND_API_KEY` para reportes por mail; rotar claves que se pegaron en chats.
5. Fase B: analíticas de clientes (salud, MRR/churn, exportar a Excel).

## Reglas de trabajo
- Mostrar cada cambio en la vista previa y publicar solo cuando el dueño da el OK.
- Antes de algo destructivo (borrar datos, apagar servicios, mover dominios): preguntar.
- Siempre `git pull` antes de empezar y `git push` al terminar. Commits en español.
- Con cada push, sumar una línea a `docs/CAMBIOS.md` (ver AGENTS.md).
- Sin claves en el repo ni en el chat.
