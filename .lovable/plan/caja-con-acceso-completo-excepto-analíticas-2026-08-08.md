# Caja con acceso completo (excepto Analíticas)

El usuario de caja (María, Bodegón 65) pasa a tener en su barra lateral las mismas secciones que el administrador, salvo **Analíticas**, que queda exclusiva del admin (agrocalifa).

## Secciones que se agregan a Caja

- Mesas (configuración y plano)
- Personal
- Monitoreo
- Caja (control de caja / movimientos)
- Costos
- Stock
- Historial (auditoría)

Se mantienen las actuales: Mesas (operación), Reservas, Facturación, Salidas e Ingresos, Resumen de turno, Carta.
No se agrega: **Dashboard** ni **Analíticas** (exclusivos del administrador).

## Cómo queda la barra lateral de Caja

```text
Operación:   Mesas · Reservas · Facturación · Salidas e Ingresos · Resumen de turno
Gestión:     Carta · Config. Mesas · Personal · Monitoreo · Caja · Costos · Stock · Historial
```

## Cuentas corrientes de cortesías

La cajera consume del restaurante y tiene su cuenta corriente, así que no debe poder alterar esos números:

- Puede seguir registrando cortesías al cerrar una mesa (queda asentado como siempre).
- No puede editar ni borrar consumos ya registrados de ninguna cuenta corriente.
- No puede crear, renombrar, desactivar ni eliminar cuentas corrientes.
- En Costos ve las cuentas corrientes en modo sólo lectura (saldos y detalle), sin botones de edición.
- Los ajustes o correcciones quedan exclusivamente en manos del administrador.


## Permisos de datos

Hoy varias secciones sólo funcionan para el rol admin a nivel base de datos. Se amplían los permisos para que caja pueda leer y gestionar, siempre limitado a su propio establecimiento:

- Productos, categorías, recetas
- Ingredientes, movimientos de stock, compras y sus ítems
- Mesas, sectores, plano de salón
- Categorías y movimientos financieros (gestión completa, no sólo los propios)
- Control de turnos
- Historial de auditoría (sólo lectura)
- Alertas del asistente (insights)
- Personal: ver y asignar roles dentro de su establecimiento
- Datos del establecimiento (edición de la ficha)

Analíticas no se habilita para caja en ningún punto.

## Detalles técnicos

1. `src/App.tsx`: nuevas rutas `/cashier/tables-config`, `/cashier/staff`, `/cashier/monitor`, `/cashier/cash`, `/cashier/costs`, `/cashier/stock`, `/cashier/audit`, reutilizando los componentes de `pages/admin/*` dentro de `CashierLayout` con `allowedRoles={['cashier']}`. Sin rutas de Dashboard ni Analytics.
2. `src/layouts/CashierLayout.tsx`: dos grupos de menú (Operación / Gestión) con los ítems nuevos.
3. Páginas admin reutilizadas: usan `useAuth().establishmentId`, que ya se resuelve igual para caja; se revisa cada una y se quitan/ocultan controles que dependan estrictamente de rol admin si los hubiera.
4. Migración SQL: políticas RLS para `cashier` espejo de las de `admin` (scoped por `get_user_establishment`) en las tablas listadas arriba, más `GRANT` donde falten. `audit_logs` sólo `SELECT`.
5. Cortesías: para `cashier` sólo `SELECT` + `INSERT` en `courtesy_charges` y sólo `SELECT` en `courtesy_accounts`; sin `UPDATE`/`DELETE`. `CourtesyAccountsTab` recibe un modo de sólo lectura cuando el rol es caja.
6. `supabase/functions/create-user`: aceptar además el rol `cashier` como invocador autorizado, restringido a crear usuarios de su propio establecimiento y sin poder crear admin/superadmin.
7. El acceso a Dashboard y Analíticas sigue validado por `ProtectedRoute allowedRoles={['admin']}`.

