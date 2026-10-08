# Posibles clientes (Super Admin)

Ruta: /superadmin/prospects.

Cada ficha guarda nombre, celular, dirección, descripción y estado comercial.
La agenda registra visitas, llamadas o WhatsApp, con fecha/hora, estado y notas.
Se puede cargar una visita ya realizada, reprogramar un pendiente, registrar su resultado
o cancelarlo. Marcar una ficha como Cliente conserva el historial; no crea una cuenta
ni activa un servicio. Ese alta sigue en Clientes.

Las fechas se ingresan y muestran en horario argentino, y se guardan en UTC.
La búsqueda y el filtro comercial se aplican tanto a las fichas como a la agenda.
Los indicadores superiores muestran el total general, sin filtros.
Los pendientes de restaurantes descartados o convertidos siguen visibles para poder
cancelarlos o completarlos explícitamente.

## Activación

La migración es backend/sql/112_sales_prospects.sql (backend propio, Postgres `datta-db`).
El contenedor la aplica al arrancar (`node dist/db/migrate.js`) y la registra en
public.schema_migrations; es idempotente. La página usa el cliente `@/lib/db`.

Las dos tablas habilitan RLS y admiten acceso únicamente a usuarios autenticados
para los que public.is_superadmin(auth.uid()) es verdadero; anon no tiene permisos.
No hay cambios en las tablas de restaurantes activos, facturación ni pedidos.

## Validación

Automática: .github/workflows/prospects-checks.yml ejecuta pruebas de fechas y enlaces,
lint de los archivos nuevos y compilación del frontend. No aplica migraciones ni despliega.

Verificación manual pendiente en una instancia de prueba:
- Con Super Admin, crear una ficha, editarla y recargar para confirmar persistencia.
- Agendar dos contactos, registrar el resultado de uno y comprobar que el otro sigue pendiente.
- Registrar una visita histórica con notas, reprogramar otra y cancelar un pendiente.
- Comprobar filtros de hoy, atrasados, fecha específica, realizados y cancelados.
- Comprobar ficha y formularios desde celular, y navegación por teclado entre diálogos.
- Con cada rol admin, cashier, waiter y kitchen, comprobar que la ruta redirige
  y que solicitudes directas a ambas tablas no pueden leer ni modificar datos.
- Sin sesión, verificar denegación de lectura/escritura de ambas tablas.
- Como Super Admin, comprobar lectura/escritura y rechazo de nombres vacíos,
  estados inválidos y seguimientos con un prospect_id inexistente.
