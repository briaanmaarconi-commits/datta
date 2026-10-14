# Datta Gestión — Plan de roles y permisos

Estado: borrador para revisar. Basado en el código actual (`app_role`, `App.tsx`, `createUser.ts`, RLS en `backend/sql`).

## 1. Roles actuales

El enum `app_role` tiene 5 valores; un usuario tiene una fila en `user_roles` (rol + `establishment_id`).

| Rol | Alcance | Layout | Qué hace hoy |
|---|---|---|---|
| `superadmin` | Plataforma (sin local) | `SuperAdminLayout` | Clientes, facturación de Datta, planes, usuarios, monitor, prospectos, soporte |
| `admin` | Su local (dueño) | `AdminLayout` | Todo el local: dashboard, analíticas, carta, mesas, personal, caja, costos, stock, delivery, impresoras, suscripción |
| `cashier` | Su local | `CashierLayout` | Operación (mesas, reservas, facturación, salidas/ingresos, turno) + gestión (carta, personal, stock, costos…), **sin Dashboard ni Analíticas** |
| `waiter` | Su local | `WaiterLayout` | Mesas, pedidos, reservas |
| `kitchen` | Su local | `KitchenLayout` | Comandas de cocina |

Público (sin login): `/menu/:tableId` (carta QR cliente), `/carta/:establishmentId`, `/presentacion`.

## 2. Matriz de permisos propuesta

Leyenda: ✅ completo · 👁 solo lectura · ➕ crear/registrar pero no editar/borrar · ❌ sin acceso

| Módulo | superadmin | admin | cashier | waiter | kitchen |
|---|---|---|---|---|---|
| Dashboard / Analíticas | ❌ (usa las suyas) | ✅ | ❌ | ❌ | ❌ |
| Mesas (operación) | ❌ | ✅ | ✅ | ✅ | ❌ |
| Tomar / modificar pedidos | ❌ | ✅ | ✅ | ✅ | ❌ |
| Comandas (estados de cocina) | ❌ | ✅ | 👁 | 👁 | ✅ |
| Cobrar / cerrar mesa | ❌ | ✅ | ✅ | ❌ | ❌ |
| Facturación / AFIP | ❌ | ✅ | ✅ | ❌ | ❌ |
| Turnos y arqueo de caja | ❌ | ✅ | ✅ | ❌ | ❌ |
| Salidas / ingresos de caja | ❌ | ✅ | ✅ | ❌ | ❌ |
| Reservas | ❌ | ✅ | ✅ | ✅ | ❌ |
| Carta / productos / combos | ❌ | ✅ | ✅ | 👁 | 👁 |
| Config. de mesas / plano | ❌ | ✅ | ✅ | ❌ | ❌ |
| Stock e ingredientes | ❌ | ✅ | ✅ | ❌ | ❌ |
| Costos y gastos | ❌ | ✅ | ✅ | ❌ | ❌ |
| Cuentas corrientes de cortesías | ❌ | ✅ | ➕ (solo registrar) | ❌ | ❌ |
| Personal (alta/baja de usuarios) | ❌ | ✅ | ✅ (sin admin/superadmin) | ❌ | ❌ |
| Historial / auditoría | ❌ | ✅ | 👁 | ❌ | ❌ |
| Impresoras, delivery, plataformas | ❌ | ✅ | ✅ | ❌ | ❌ |
| Suscripción del local | ❌ | ✅ | 👁 | ❌ | ❌ |
| Clientes / planes / facturación Datta | ✅ | ❌ | ❌ | ❌ | ❌ |
| Prospectos, soporte, monitor global | ✅ | ❌ | ❌ | ❌ | ❌ |

## 3. Reglas transversales

1. **Aislamiento por local**: todo rol que no sea `superadmin` solo ve y toca datos de su `establishment_id` (RLS + `get_user_establishment`). Ya existe; los tests de `tenant.test.ts` lo cubren.
2. **No escalar privilegios**: `admin` puede asignar `admin|cashier|waiter|kitchen` en su local; `cashier` solo `waiter|kitchen|cashier` y nunca sobre un admin o superadmin; nadie crea `superadmin` salvo otro superadmin. Ya implementado en `createUser.ts`.
3. **Doble validación**: la ruta del frontend (`ProtectedRoute allowedRoles`) es comodidad; la autoridad es el backend/RLS. Todo permiso nuevo debe tener su política SQL y su test.
4. **Auditoría**: acciones sensibles (anular, descuento, cortesía, borrar consumo, cambio de rol, cierre de turno) quedan en `audit_logs` con usuario.
5. **Un usuario, un rol por local**; si hace falta multi-local para un dueño, se modela como varias filas `user_roles` (ya soportado en `createUser`).

## 4. Brechas detectadas y mejoras sugeridas

- **Cashier ≈ admin menos analíticas**: hoy hay ~15 rutas duplicadas en `App.tsx`. Mejorar con una sola tabla `ROUTES` (path → componente → roles) en vez de repetir `<Route>` por rol.
- **Permisos granulares**: en lugar de crear más roles, agregar flags por usuario (`can_view_costs`, `can_edit_menu`, `can_void_orders`) para casos como "encargado de salón" o "jefe de cocina". Recomendado: tabla `user_permissions` + helper `has_permission()`.
- **Rol nuevo candidato `manager` (encargado)**: igual a cashier pero con Analíticas de solo lectura. Solo si algún cliente lo pide; con flags no hace falta enum nuevo.
- **Rol `delivery`/repartidor**: hoy el delivery propio lo opera caja. Si hay repartidores con celular, un rol con vista de sus entregas.
- **Descuentos / anulaciones**: definir tope por rol (ej. mozo ❌, caja hasta X %, admin sin tope) y exigir motivo.
- **Sesiones**: expiración corta para caja/mozo en dispositivos compartidos y cierre de sesión automático al cerrar turno.

## 5. Plan de implementación (por fases)

| Fase | Trabajo | Archivos principales | Verificación |
|---|---|---|---|
| 0 | Congelar la matriz (esta doc) con el dueño del producto | `docs/plan-roles.md` | Revisión |
| 1 | Test de contrato: una prueba por celda crítica de la matriz (rol × endpoint/tabla) | `backend/tests/*` | `npm test` en backend |
| 2 | Refactor de rutas del frontend a tabla única por rol | `src/App.tsx`, layouts | Navegar cada rol |
| 3 | `user_permissions` + `has_permission()` + UI en Personal | `backend/sql/1xx_permissions.sql`, `AdminStaff` | Tests de tenant y permisos |
| 4 | Topes de descuento/anulación y motivo obligatorio | `backend/src/fn/*`, cobro en caja | Tests de charge/orders |
| 5 | (Opcional) `manager` y `delivery` | enum + layouts | E2E por rol |

## 6. Preguntas abiertas

1. ¿La caja debe seguir viendo Costos y Stock completos, o solo lectura?
2. ¿Los mozos pueden hacer pre-cuenta / imprimir ticket para el cliente, o solo caja?
3. ¿Quién puede anular un pedido ya enviado a cocina?
4. ¿Hace falta un rol "encargado" intermedio entre caja y admin?
5. ¿Repartidores con login propio o los gestiona caja?
