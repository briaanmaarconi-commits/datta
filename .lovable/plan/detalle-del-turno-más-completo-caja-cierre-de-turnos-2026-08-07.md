# Detalle del turno más completo (Caja → Cierre de turnos)

Ampliar el diálogo "Detalle" que se abre al controlar un turno cerrado, para que muestre toda la foto del turno y no solo ventas y mozos.

## Qué se agrega

Métodos de pago
- Efectivo, tarjeta y transferencia del turno, con monto, cantidad de pedidos y porcentaje sobre el total.

Arqueo de caja
- Fondo inicial, ingresos y egresos en efectivo del turno, efectivo esperado, efectivo contado y diferencia con leyenda destacada: SOBRANTE / FALTANTE / CAJA OK.

Movimientos de caja del turno
- Lista de ingresos y egresos registrados durante el turno (descripción, categoría y monto), para ver de dónde sale la diferencia.

Propinas
- Total de propinas del turno y desglose por mozo (informativo, no afecta el arqueo).

Más KPIs
- Duración del turno y ventas por hora.
- Cantidad de ítems vendidos y Top 5 productos (hoy solo se muestra el producto estrella).
- Cantidad de facturas fiscales emitidas, si hubo.
- Quién abrió / cerró y quién controló el turno, con horarios.

Se mantiene lo actual: ventas totales, producto estrella, ticket promedio con comparación contra el turno anterior, mesas atendidas y mesas por mozo (a lo que se le suma ventas por mozo).

## Detalles técnicos

- Se modifica `src/components/admin/ShiftDetailDialog.tsx`; no hacen falta cambios de base de datos ni en `CashControl.tsx` (ya recibe el `shift` completo con `initial_cash`, `actual_cash`, `cash_difference`, `opened_at`, `closed_at`).
- La query del diálogo se amplía para traer, acotado por `opened_at` / `closed_at` del turno:
  - `orders` (ya se traen) sumando `payment_method` para el desglose por método y `total` por mozo.
  - `invoices` para propinas (`tip_amount`, `tip_waiter_id`, `tip_payment_method`).
  - `finance_transactions` con su categoría para ingresos/egresos en efectivo del turno, excluyendo las categorías de propinas ("Propinas" / "Pago de propinas") igual que en analíticas, para no distorsionar el arqueo.
  - `fiscal_invoices` solo para contar las emitidas.
- El efectivo esperado se calcula como fondo inicial + ventas en efectivo + ingresos en efectivo − egresos en efectivo, mismo criterio que el reporte de cierre de turno (`ShiftReportTicket`), y la diferencia contra `actual_cash`.
- Nombres de mozos/usuarios vía `profiles` con un solo `in()` para todos los ids involucrados.
- El diálogo pasa a ser scrolleable (contenido alto) manteniendo el estilo de cards y tablas actual.
