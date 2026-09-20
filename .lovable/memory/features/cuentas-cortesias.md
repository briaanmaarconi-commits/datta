---
name: Cuentas corrientes de cortesías
description: Personas con acceso a invitaciones (courtesy_accounts) y registro de consumos (courtesy_charges) reflejado en el cierre de turno.
type: feature
---

## Tablas
- `courtesy_accounts`: personas habilitadas (nombre, is_active) por establecimiento. Seed inicial: Maria Luz, Pablo, El Ruso.
- `courtesy_charges`: cada cierre de mesa como cortesía (account_id nullable = "Sin asignar", table_number, order_ids, courtesy_type, sale_amount, cost_amount, notes, finance_transaction_id).

## Reglas
- Es solo control de consumo, NO es deuda a cobrar.
- El monto imputado a la persona es el **precio de venta** (`sale_amount`); el costo (`cost_amount`) sigue yendo a Caja como gasto.
- Se elige la persona en `CourtesyDialog` (caja y mesero); "Sin asignar" es válido.

## UI
- Admin → Caja → pestaña **Cortesías** (`src/components/admin/CourtesyAccountsTab.tsx`): alta/edición/desactivación de personas, totales por persona en un rango de fechas y detalle de cortesías.
- Cierre de turno: el reporte imprimible (`ShiftReportTicket`) muestra bloque CORTESÍAS con total y desglose por persona (no afecta el arqueo).
