# Cuentas corrientes de cortesías

Registrar a quién se le da cada invitación y llevar un acumulado por persona, visible también al cerrar el turno.

## Qué se agrega

Personas con cuenta corriente
- Nueva sección en Admin → Stock/Caja para administrar personas habilitadas a recibir cortesías (agregar, renombrar, desactivar).
- Se cargan de entrada: Maria Luz, Pablo y El Ruso.

Al cerrar una mesa como cortesía
- El diálogo de cortesía suma un selector "¿A nombre de quién?" con la lista de personas activas (opcional: puede quedar "Sin asignar" para cortesías generales).
- Se guarda el consumo en la cuenta de esa persona con el **precio de venta** del pedido (lo que hubiera pagado el cliente), además del costo que ya se registra hoy en Caja.
- Es solo registro de consumos: no genera deuda a cobrar ni pagos.

Vista de cuentas corrientes
- Listado por persona con total consumido en el período y detalle de cada cortesía (fecha, mesa, tipo, notas, monto).

Cierre de turno
- En el reporte imprimible de cierre de turno: bloque "CORTESÍAS DEL TURNO" con total y desglose por persona.
- En el detalle del turno que ve el admin al controlarlo: misma información, con listado de cada cortesía del turno.

## Detalles técnicos

- Nuevas tablas: `courtesy_accounts` (establishment_id, name, is_active) y `courtesy_charges` (establishment_id, account_id nullable, table_number, order_ids, courtesy_type, sale_amount, cost_amount, notes, finance_transaction_id, created_by, created_at), con GRANTs y RLS por establecimiento igual al resto.
- `src/hooks/useCloseTableAsCourtesy.ts`: recibe `accountId` opcional, calcula el total de venta de los ítems (`unit_price × quantity`) y crea la fila en `courtesy_charges` junto al `finance_transaction` actual.
- `src/components/shared/CourtesyDialog.tsx`: selector de persona (activas) + acceso rápido a "Sin asignar"; se usa igual desde Caja y Mesero.
- Nueva pestaña/página de cuentas corrientes con filtro por período, y CRUD de personas.
- `src/pages/cashier/ShiftSummary.tsx` + `src/components/cashier/ShiftReportTicket.tsx`: nuevos campos `courtesyTotal` y desglose por persona, acotado por `opened_at`/`closed_at` del turno.
- `src/components/admin/ShiftDetailDialog.tsx`: card de cortesías del turno con detalle por persona.
